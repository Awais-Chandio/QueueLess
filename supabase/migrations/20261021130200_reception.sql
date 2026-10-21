-- Phase 1B.2: reception desk RPCs for the web app.
--
-- get_my_workspaces()          organizations and centers the caller works in
-- get_reception_queue(center)  today's tokens per doctor (clinic's local day)
-- call_next(doctor)            closes the token with the doctor, calls the next
-- skip_token(appt)             back to waiting, behind who joined before the skip
-- mark_no_show(appt)           a called token that didn't come
-- recall_token(appt)           announce a called token again (TV chime)
-- set_doctor_break(doctor, on) doctor break, as the doctor app sets it
--
-- Callers: staff of the center (owner, or receptionist assigned to it), the
-- doctor themself for their own queue, platform admins, the server.

-- ---------------------------------------------------------------------------
-- Workspaces
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.get_my_workspaces()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT COALESCE(jsonb_agg(w ORDER BY w->>'organization_name'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'organization_id', o.id,
      'organization_name', o.name,
      'organization_status', o.status,
      'roles', (SELECT jsonb_agg(m.role ORDER BY m.role) FROM public.org_members m
                WHERE m.organization_id = o.id AND m.user_id = auth.uid()),
      'centers', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug) ORDER BY c.name)
        FROM public.service_centers c
        WHERE c.organization_id = o.id
          AND (
            EXISTS (SELECT 1 FROM public.org_members m
                    WHERE m.organization_id = o.id AND m.user_id = auth.uid() AND m.role = 'owner')
            OR EXISTS (SELECT 1 FROM public.staff_centers sc WHERE sc.profile_id = auth.uid() AND sc.center_id = c.id)
            OR EXISTS (SELECT 1 FROM public.doctors d WHERE d.profile_id = auth.uid() AND d.center_id = c.id)
          )
      ), '[]'::jsonb)
    ) AS w
    FROM public.organizations o
    WHERE EXISTS (SELECT 1 FROM public.org_members m WHERE m.organization_id = o.id AND m.user_id = auth.uid())
  ) s;
$function$;

COMMENT ON FUNCTION public.get_my_workspaces() IS
  'The caller''s organizations: roles and the centers they work at (all of them for an owner).';

-- ---------------------------------------------------------------------------
-- Today's queue
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.get_reception_queue(p_center_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_center public.service_centers%ROWTYPE;
  v_org public.organizations%ROWTYPE;
  v_today date;
BEGIN
  SELECT * INTO v_center FROM public.service_centers WHERE id = p_center_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Center not found' USING ERRCODE = 'PT404';
  END IF;

  IF NOT private.is_server_context()
     AND NOT private.can_manage_center(p_center_id)
     AND NOT EXISTS (SELECT 1 FROM public.doctors d WHERE d.center_id = p_center_id AND private.is_doctor_self(d.id))
  THEN
    RAISE EXCEPTION 'Not allowed to view this center''s queue' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_org FROM public.organizations WHERE id = v_center.organization_id;
  v_today := (now() AT TIME ZONE v_org.timezone)::date;

  RETURN jsonb_build_object(
    'center', jsonb_build_object(
      'id', v_center.id, 'name', v_center.name, 'slug', v_center.slug,
      'organization_id', v_org.id, 'organization_name', v_org.name, 'timezone', v_org.timezone
    ),
    'today', v_today,
    'server_time', now(),
    'display_key', (SELECT k.display_key FROM public.center_displays k WHERE k.center_id = v_center.id),
    'tokens_today', (SELECT count(*) FROM public.appointments a
                     JOIN public.service_centers c ON c.id = a.center_id
                     WHERE c.organization_id = v_org.id AND a.appointment_date = v_today AND a.status <> 'cancelled'),
    'tokens_per_day', (SELECT e.tokens_per_day FROM public.org_entitlements e WHERE e.organization_id = v_org.id),
    'doctors', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', d.id,
               'name', d.name,
               'specialty', d.specialty,
               'room', d.room,
               'is_on_break', d.is_on_break OR COALESCE(q.is_on_break, false),
               'takes_tokens', private.doctor_takes_tokens(d.id),
               'average_minutes', COALESCE(q.average_consultation_time, 10),
               'tokens', COALESCE((
                 SELECT jsonb_agg(jsonb_build_object(
                          'id', a.id,
                          'token_number', a.token_number,
                          'status', a.status,
                          'source', a.source,
                          'public_code', a.public_code,
                          'patient_name', COALESCE(CASE WHEN p.user_id IS NOT NULL THEN NULLIF(pr.full_name, '') END, p.name, pr.full_name),
                          'phone', p.phone,
                          'appointment_time', a.appointment_time,
                          'checked_in_at', a.checked_in_at,
                          'called_at', a.called_at,
                          'completed_at', a.completed_at,
                          'skipped_at', a.skipped_at,
                          'created_at', a.created_at
                        ) ORDER BY
                          CASE WHEN a.status IN ('called', 'in_progress') THEN 0
                               WHEN a.status IN ('pending', 'confirmed', 'checked_in') THEN 1
                               ELSE 2 END,
                          CASE WHEN a.status IN ('pending', 'confirmed', 'checked_in')
                               THEN COALESCE(a.skipped_at, a.created_at, a.scheduled_at) END,
                          a.token_number)
                 FROM public.appointments a
                 LEFT JOIN public.patients p ON p.id = a.patient_id
                 LEFT JOIN public.profiles pr ON pr.id = a.user_id
                 WHERE a.doctor_id = d.id AND a.appointment_date = v_today
               ), '[]'::jsonb)
             ) ORDER BY d.created_at, d.id)
      FROM public.doctors d
      LEFT JOIN public.doctor_queue_settings q ON q.doctor_id = d.id
      WHERE d.center_id = v_center.id AND d.is_active
    ), '[]'::jsonb)
  );
END;
$function$;

COMMENT ON FUNCTION public.get_reception_queue(uuid) IS
  'Reception: today''s tokens (clinic''s local day) per active doctor of the center, with patient name and phone. Center staff, its doctors, admins.';

-- ---------------------------------------------------------------------------
-- Actions
-- ---------------------------------------------------------------------------

-- Closes whatever token is with the doctor (called / in progress ->
-- completed) and calls the next waiting one. Returns the called token, or no
-- row when nobody is waiting. Refused while the doctor is on break.
CREATE FUNCTION public.call_next(p_doctor_id uuid)
 RETURNS TABLE (appointment_id uuid, token_number integer, patient_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_doctor public.doctors%ROWTYPE;
  v_today date;
  v_next public.appointments%ROWTYPE;
BEGIN
  SELECT * INTO v_doctor FROM public.doctors WHERE id = p_doctor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Doctor not found' USING ERRCODE = 'PT404';
  END IF;
  IF NOT private.is_server_context() AND NOT private.can_manage_doctor(p_doctor_id) THEN
    RAISE EXCEPTION 'Only staff of this center or the doctor can call the next token' USING ERRCODE = '42501';
  END IF;
  IF v_doctor.is_on_break OR EXISTS (SELECT 1 FROM public.doctor_queue_settings q WHERE q.doctor_id = p_doctor_id AND q.is_on_break) THEN
    RAISE EXCEPTION 'The doctor is on a break' USING ERRCODE = 'PT409';
  END IF;

  v_today := private.org_today(private.center_organization(v_doctor.center_id));
  -- Two desks pressing "next" at once call two different tokens, in order.
  PERFORM pg_advisory_xact_lock(hashtextextended('call_next:' || p_doctor_id || ':' || v_today, 0));

  UPDATE public.appointments a
  SET status = 'completed',
      completed_at = now(),
      duration_minutes = COALESCE(a.duration_minutes,
        GREATEST(1, (EXTRACT(EPOCH FROM (now() - COALESCE(a.started_at, a.called_at, now()))) / 60)::integer))
  WHERE a.doctor_id = p_doctor_id
    AND a.appointment_date = v_today
    AND a.status IN ('called', 'in_progress');

  SELECT * INTO v_next
  FROM public.appointments a
  WHERE a.doctor_id = p_doctor_id
    AND a.appointment_date = v_today
    AND a.status IN ('pending', 'confirmed', 'checked_in')
  ORDER BY COALESCE(a.skipped_at, a.created_at, a.scheduled_at), a.token_number
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_next.status = 'pending' THEN
    UPDATE public.appointments SET status = 'confirmed' WHERE id = v_next.id;
  END IF;

  UPDATE public.appointments
  SET status = 'called', called_at = now()
  WHERE id = v_next.id
  RETURNING * INTO v_next;

  RETURN QUERY
  SELECT v_next.id, v_next.token_number,
         COALESCE(CASE WHEN p.user_id IS NOT NULL THEN NULLIF(pr.full_name, '') END, p.name, pr.full_name)
  FROM public.patients p
  LEFT JOIN public.profiles pr ON pr.id = v_next.user_id
  WHERE p.id = v_next.patient_id;
END;
$function$;

-- Appointment for an action, locked, after the caller check.
CREATE FUNCTION private.lock_operable_appointment(p_appointment_id uuid)
 RETURNS public.appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_appt public.appointments%ROWTYPE;
BEGIN
  SELECT * INTO v_appt FROM public.appointments WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token not found' USING ERRCODE = 'PT404';
  END IF;
  IF NOT private.is_server_context() AND NOT private.can_operate_appointment(v_appt.center_id, v_appt.doctor_id) THEN
    RAISE EXCEPTION 'Only staff of this center or the assigned doctor can change this token' USING ERRCODE = '42501';
  END IF;
  RETURN v_appt;
END;
$function$;

CREATE FUNCTION public.skip_token(p_appointment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_appt public.appointments%ROWTYPE := private.lock_operable_appointment(p_appointment_id);
BEGIN
  IF v_appt.status NOT IN ('called', 'confirmed', 'checked_in') THEN
    RAISE EXCEPTION 'Only a called or waiting token can be skipped' USING ERRCODE = 'PT409';
  END IF;
  UPDATE public.appointments
  -- clock_timestamp: later than any token created earlier in the same transaction.
  SET status = 'checked_in', skipped_at = clock_timestamp(), checked_in_at = COALESCE(checked_in_at, now())
  WHERE id = v_appt.id;
END;
$function$;

CREATE FUNCTION public.mark_no_show(p_appointment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_appt public.appointments%ROWTYPE := private.lock_operable_appointment(p_appointment_id);
BEGIN
  IF v_appt.status NOT IN ('called', 'in_progress') THEN
    RAISE EXCEPTION 'Only a called token can be marked no-show' USING ERRCODE = 'PT409';
  END IF;
  UPDATE public.appointments SET status = 'no_show' WHERE id = v_appt.id;
END;
$function$;

CREATE FUNCTION public.recall_token(p_appointment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_appt public.appointments%ROWTYPE := private.lock_operable_appointment(p_appointment_id);
BEGIN
  IF v_appt.status <> 'called' THEN
    RAISE EXCEPTION 'Only a called token can be announced again' USING ERRCODE = 'PT409';
  END IF;
  UPDATE public.appointments SET called_at = clock_timestamp() WHERE id = v_appt.id;
END;
$function$;

-- doctors.is_on_break drives booking availability, doctor_queue_settings the
-- live queue; both change together (as the doctor app does).
CREATE FUNCTION public.set_doctor_break(p_doctor_id uuid, p_on_break boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.doctors WHERE id = p_doctor_id) THEN
    RAISE EXCEPTION 'Doctor not found' USING ERRCODE = 'PT404';
  END IF;
  IF NOT private.is_server_context() AND NOT private.can_manage_doctor(p_doctor_id) THEN
    RAISE EXCEPTION 'Only staff of this center or the doctor can change the break' USING ERRCODE = '42501';
  END IF;

  UPDATE public.doctors SET is_on_break = COALESCE(p_on_break, false), updated_at = now() WHERE id = p_doctor_id;

  INSERT INTO public.doctor_queue_settings (doctor_id, is_on_break, break_start, break_end, updated_at)
  VALUES (p_doctor_id, COALESCE(p_on_break, false), CASE WHEN p_on_break THEN now() END, NULL, now())
  ON CONFLICT (doctor_id) DO UPDATE
    SET is_on_break = EXCLUDED.is_on_break, break_start = EXCLUDED.break_start, break_end = NULL, updated_at = now();
END;
$function$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION private.lock_operable_appointment(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.get_my_workspaces() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_reception_queue(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.call_next(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.skip_token(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_no_show(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recall_token(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_doctor_break(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_workspaces() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_reception_queue(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.call_next(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.skip_token(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_no_show(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recall_token(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_doctor_break(uuid, boolean) TO authenticated, service_role;
