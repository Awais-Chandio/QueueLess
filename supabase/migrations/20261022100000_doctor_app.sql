-- Phase 1C: doctor and staff app.
--
-- 1. doctors.late_until: "running late" from the doctor (or the desk). It
--    shows on the TV, the join page, the reception queue and the token
--    status page, and adds the remaining minutes to every waiting token's
--    ETA. call_next clears it (the doctor is seeing patients again).
--    set_doctor_late(doctor, minutes): 1..240 sets it, 0 / NULL clears it.
-- 2. get_doctor_queue(doctor): the doctor's own today (clinic's local day):
--    state, plan and tokens with patient names (guests included), no phones.
-- 3. complete_visit(...): the doctor completes the token with them and saves
--    the visit notes in one call. Visit summaries now work for guest patients
--    too: visit_summaries.patient_id (the app account) may be NULL and
--    patient_record_id (public.patients) is always set.
-- 4. get_doctor_today_appointments used CURRENT_DATE (UTC); now the clinic's
--    local day, like every other queue read.

-- ---------------------------------------------------------------------------
-- 1. Running late
-- ---------------------------------------------------------------------------
ALTER TABLE public.doctors ADD COLUMN late_until timestamptz;

COMMENT ON COLUMN public.doctors.late_until IS
  'Doctor running late until this time (set_doctor_late). Shown on the TV and status pages and added to waiting ETAs; cleared by call_next.';

-- Minutes still to go, 0 when not late.
CREATE FUNCTION private.doctor_delay_minutes(p_doctor_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT COALESCE((
    SELECT GREATEST(0, CEIL(EXTRACT(EPOCH FROM (d.late_until - now())) / 60))::integer
    FROM public.doctors d WHERE d.id = p_doctor_id AND d.late_until > now()
  ), 0);
$function$;

CREATE FUNCTION public.set_doctor_late(p_doctor_id uuid, p_minutes integer)
 RETURNS timestamptz
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_until timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.doctors WHERE id = p_doctor_id) THEN
    RAISE EXCEPTION 'Doctor not found' USING ERRCODE = 'PT404';
  END IF;
  IF NOT private.is_server_context() AND NOT private.can_manage_doctor(p_doctor_id) THEN
    RAISE EXCEPTION 'Only staff of this center or the doctor can change this' USING ERRCODE = '42501';
  END IF;
  IF p_minutes IS NOT NULL AND (p_minutes < 0 OR p_minutes > 240) THEN
    RAISE EXCEPTION 'Late by 1 to 240 minutes' USING ERRCODE = '22023';
  END IF;

  v_until := CASE WHEN COALESCE(p_minutes, 0) > 0 THEN now() + make_interval(mins => p_minutes) END;
  UPDATE public.doctors SET late_until = v_until, updated_at = now() WHERE id = p_doctor_id;
  RETURN v_until;
END;
$function$;

-- Waiting tokens' ETA includes the doctor's remaining delay.
CREATE OR REPLACE FUNCTION private.token_progress(p_appointment_id uuid)
 RETURNS TABLE (people_ahead integer, eta_minutes integer, current_token integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_appt public.appointments%ROWTYPE;
  v_avg numeric;
  v_ahead integer := 0;
  v_current integer;
  v_delay integer := 0;
BEGIN
  SELECT * INTO v_appt FROM public.appointments WHERE id = p_appointment_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT a.token_number INTO v_current
  FROM public.appointments a
  WHERE a.appointment_date = v_appt.appointment_date
    AND (CASE WHEN v_appt.doctor_id IS NOT NULL THEN a.doctor_id = v_appt.doctor_id
              ELSE a.doctor_id IS NULL AND a.center_id = v_appt.center_id END)
    AND a.status IN ('called', 'in_progress')
  ORDER BY a.called_at DESC NULLS LAST, a.token_number DESC
  LIMIT 1;

  IF v_current IS NULL THEN
    SELECT a.token_number INTO v_current
    FROM public.appointments a
    WHERE a.appointment_date = v_appt.appointment_date
      AND (CASE WHEN v_appt.doctor_id IS NOT NULL THEN a.doctor_id = v_appt.doctor_id
                ELSE a.doctor_id IS NULL AND a.center_id = v_appt.center_id END)
      AND a.status = 'completed'
    ORDER BY a.completed_at DESC NULLS LAST, a.token_number DESC
    LIMIT 1;
  END IF;

  IF v_appt.status IN ('pending', 'confirmed', 'checked_in') THEN
    SELECT count(*)::integer INTO v_ahead
    FROM public.appointments a
    WHERE a.appointment_date = v_appt.appointment_date
      AND (CASE WHEN v_appt.doctor_id IS NOT NULL THEN a.doctor_id = v_appt.doctor_id
                ELSE a.doctor_id IS NULL AND a.center_id = v_appt.center_id END)
      AND a.status IN ('pending', 'confirmed', 'checked_in')
      AND a.id <> v_appt.id
      AND (COALESCE(a.skipped_at, a.created_at, a.scheduled_at), a.token_number)
        < (COALESCE(v_appt.skipped_at, v_appt.created_at, v_appt.scheduled_at), v_appt.token_number);
    IF v_appt.doctor_id IS NOT NULL THEN
      v_delay := private.doctor_delay_minutes(v_appt.doctor_id);
    END IF;
  END IF;

  IF v_appt.doctor_id IS NOT NULL THEN
    SELECT average_consultation_time INTO v_avg
    FROM public.doctor_queue_settings WHERE doctor_id = v_appt.doctor_id;
  ELSE
    SELECT average_consultation_time INTO v_avg
    FROM public.center_queue_settings
    WHERE center_id = v_appt.center_id AND appointment_date = v_appt.appointment_date;
  END IF;

  RETURN QUERY SELECT v_ahead, CEIL(v_ahead * COALESCE(v_avg, 10.0))::integer + v_delay, COALESCE(v_current, 0);
END;
$function$;

-- call_next as in 1B, plus: clears "running late".
CREATE OR REPLACE FUNCTION public.call_next(p_doctor_id uuid)
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

  IF v_doctor.late_until IS NOT NULL THEN
    UPDATE public.doctors SET late_until = NULL, updated_at = now() WHERE id = p_doctor_id;
  END IF;

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

-- Public token status: also the doctor's break and delay (no patient data).
DROP FUNCTION public.get_token_status(text);
CREATE FUNCTION public.get_token_status(p_public_code text)
 RETURNS TABLE (
   token_number integer,
   people_ahead integer,
   eta_minutes integer,
   current_token integer,
   doctor_name text,
   status text,
   doctor_on_break boolean,
   doctor_late_until timestamptz
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_code text := upper(btrim(COALESCE(p_public_code, '')));
  v_appt public.appointments%ROWTYPE;
BEGIN
  IF v_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$' THEN
    RETURN;
  END IF;

  SELECT * INTO v_appt FROM public.appointments a WHERE a.public_code = v_code;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    v_appt.token_number,
    tp.people_ahead,
    tp.eta_minutes,
    tp.current_token,
    d.name,
    CASE
      WHEN v_appt.status IN ('pending', 'confirmed', 'checked_in') THEN 'waiting'
      WHEN v_appt.status IN ('no_show', 'expired') THEN 'missed'
      ELSE v_appt.status   -- called | in_progress | completed | cancelled
    END,
    COALESCE(d.is_on_break OR q.is_on_break, false),
    CASE WHEN d.late_until > now() THEN d.late_until END
  FROM private.token_progress(v_appt.id) tp
  LEFT JOIN public.doctors d ON d.id = v_appt.doctor_id
  LEFT JOIN public.doctor_queue_settings q ON q.doctor_id = v_appt.doctor_id;
END;
$function$;

COMMENT ON FUNCTION public.get_token_status(text) IS
  'Public token status by code: token_number, people_ahead, eta_minutes, current_token, doctor_name, status (waiting|called|in_progress|completed|cancelled|missed), doctor_on_break, doctor_late_until. No patient data.';

-- TV board: + late_until per doctor.
CREATE OR REPLACE FUNCTION public.get_display_snapshot(p_display_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_key text := lower(btrim(COALESCE(p_display_key, '')));
  v_center public.service_centers%ROWTYPE;
  v_org public.organizations%ROWTYPE;
  v_today date;
BEGIN
  IF v_key !~ '^[a-z0-9]{24}$' THEN
    RETURN NULL;
  END IF;

  SELECT c.* INTO v_center
  FROM public.center_displays k
  JOIN public.service_centers c ON c.id = k.center_id
  WHERE k.display_key = v_key;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_org FROM public.organizations WHERE id = v_center.organization_id;
  v_today := (now() AT TIME ZONE v_org.timezone)::date;

  RETURN jsonb_build_object(
    'center_name', v_center.name,
    'center_slug', v_center.slug,
    'organization_name', v_org.name,
    'today', v_today,
    'server_time', now(),
    'doctors', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'name', d.name,
               'room', d.room,
               'is_on_break', d.is_on_break OR COALESCE(q.is_on_break, false),
               'late_until', CASE WHEN d.late_until > now() THEN d.late_until END,
               'now_serving', (
                 SELECT jsonb_build_object('token_number', a.token_number, 'status', a.status, 'called_at', a.called_at)
                 FROM public.appointments a
                 WHERE a.doctor_id = d.id AND a.appointment_date = v_today AND a.status IN ('called', 'in_progress')
                 ORDER BY a.called_at DESC NULLS LAST, a.token_number DESC
                 LIMIT 1),
               'next', COALESCE((
                 SELECT jsonb_agg(n.token_number ORDER BY n.k, n.token_number)
                 FROM (
                   SELECT a.token_number, COALESCE(a.skipped_at, a.created_at, a.scheduled_at) AS k
                   FROM public.appointments a
                   WHERE a.doctor_id = d.id AND a.appointment_date = v_today
                     AND a.status IN ('pending', 'confirmed', 'checked_in')
                   ORDER BY k, a.token_number
                   LIMIT 5
                 ) n), '[]'::jsonb),
               'waiting', (SELECT count(*) FROM public.appointments a
                           WHERE a.doctor_id = d.id AND a.appointment_date = v_today
                             AND a.status IN ('pending', 'confirmed', 'checked_in'))
             ) ORDER BY d.created_at, d.id)
      FROM public.doctors d
      LEFT JOIN public.doctor_queue_settings q ON q.doctor_id = d.id
      WHERE d.center_id = v_center.id AND d.is_active
    ), '[]'::jsonb)
  );
END;
$function$;

-- Reception queue: + late_until per doctor.
CREATE OR REPLACE FUNCTION public.get_reception_queue(p_center_id uuid)
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
               'late_until', CASE WHEN d.late_until > now() THEN d.late_until END,
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

-- Join page: + late_until per doctor.
CREATE OR REPLACE FUNCTION public.get_public_center(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_slug text := lower(btrim(COALESCE(p_slug, '')));
  v_center public.service_centers%ROWTYPE;
  v_org public.organizations%ROWTYPE;
  v_today date;
BEGIN
  IF v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR char_length(v_slug) > 80 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_center FROM public.service_centers WHERE slug = v_slug;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_org FROM public.organizations WHERE id = v_center.organization_id;
  v_today := (now() AT TIME ZONE v_org.timezone)::date;

  RETURN jsonb_build_object(
    'slug', v_center.slug,
    'name', v_center.name,
    'organization_name', v_org.name,
    'city', v_center.city,
    'address', v_center.address,
    'open_time', v_center.open_time,
    'close_time', v_center.close_time,
    'qr_enabled', v_org.status = 'active' AND private.has_module(v_org.id, 'qr_join'),
    'doctors', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', d.id,
               'name', d.name,
               'specialty', d.specialty,
               'room', d.room,
               'is_on_break', d.is_on_break,
               'late_until', CASE WHEN d.late_until > now() THEN d.late_until END,
               'on_leave', EXISTS (SELECT 1 FROM public.doctor_leaves l WHERE l.doctor_id = d.id AND l.leave_date = v_today),
               'waiting', (SELECT count(*) FROM public.appointments a
                           WHERE a.doctor_id = d.id AND a.appointment_date = v_today
                             AND a.status IN ('pending', 'confirmed', 'checked_in'))
             ) ORDER BY d.created_at, d.id)
      FROM public.doctors d
      WHERE d.center_id = v_center.id AND d.is_active AND private.doctor_takes_tokens(d.id)
    ), '[]'::jsonb)
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. The doctor's own queue
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.get_doctor_queue(p_doctor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_doctor public.doctors%ROWTYPE;
  v_center public.service_centers%ROWTYPE;
  v_org public.organizations%ROWTYPE;
  v_today date;
BEGIN
  SELECT * INTO v_doctor FROM public.doctors WHERE id = p_doctor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Doctor not found' USING ERRCODE = 'PT404';
  END IF;
  IF NOT private.is_server_context() AND NOT public.is_admin() AND NOT private.can_manage_doctor(p_doctor_id) THEN
    RAISE EXCEPTION 'Only this doctor or their clinic''s staff can view this queue' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_center FROM public.service_centers WHERE id = v_doctor.center_id;
  SELECT * INTO v_org FROM public.organizations WHERE id = v_center.organization_id;
  v_today := (now() AT TIME ZONE v_org.timezone)::date;

  RETURN jsonb_build_object(
    'doctor', (
      SELECT jsonb_build_object(
        'id', v_doctor.id,
        'name', v_doctor.name,
        'specialty', v_doctor.specialty,
        'room', v_doctor.room,
        'is_on_break', v_doctor.is_on_break OR COALESCE(q.is_on_break, false),
        'break_start', q.break_start,
        'late_until', CASE WHEN v_doctor.late_until > now() THEN v_doctor.late_until END,
        'average_minutes', COALESCE(q.average_consultation_time, 10),
        'takes_tokens', private.doctor_takes_tokens(v_doctor.id))
      FROM (SELECT 1) one
      LEFT JOIN public.doctor_queue_settings q ON q.doctor_id = v_doctor.id),
    'center', jsonb_build_object('id', v_center.id, 'name', v_center.name, 'slug', v_center.slug),
    'organization', jsonb_build_object('id', v_org.id, 'name', v_org.name, 'timezone', v_org.timezone),
    'plan', (SELECT jsonb_build_object('id', e.plan_id, 'modules', to_jsonb(e.modules), 'tokens_per_day', e.tokens_per_day)
             FROM public.org_entitlements e WHERE e.organization_id = v_org.id),
    'today', v_today,
    'server_time', now(),
    'tokens', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', a.id,
               'token_number', a.token_number,
               'status', a.status,
               'source', a.source,
               'patient_name', COALESCE(CASE WHEN p.user_id IS NOT NULL THEN NULLIF(pr.full_name, '') END, p.name, pr.full_name),
               'is_guest', p.user_id IS NULL,
               'appointment_time', a.appointment_time,
               'checked_in_at', a.checked_in_at,
               'called_at', a.called_at,
               'started_at', a.started_at,
               'completed_at', a.completed_at,
               'skipped_at', a.skipped_at,
               'created_at', a.created_at,
               'has_summary', EXISTS (SELECT 1 FROM public.visit_summaries vs WHERE vs.appointment_id = a.id)
             ) ORDER BY
               CASE WHEN a.status IN ('called', 'in_progress') THEN 0
                    WHEN a.status IN ('pending', 'confirmed', 'checked_in') THEN 1
                    ELSE 2 END,
               CASE WHEN a.status IN ('pending', 'confirmed', 'checked_in')
                    THEN COALESCE(a.skipped_at, a.created_at, a.scheduled_at) END,
               CASE WHEN a.status NOT IN ('called', 'in_progress', 'pending', 'confirmed', 'checked_in')
                    THEN COALESCE(a.completed_at, a.called_at, a.created_at) END DESC,
               a.token_number)
      FROM public.appointments a
      LEFT JOIN public.patients p ON p.id = a.patient_id
      LEFT JOIN public.profiles pr ON pr.id = a.user_id
      WHERE a.doctor_id = v_doctor.id AND a.appointment_date = v_today
    ), '[]'::jsonb)
  );
END;
$function$;

COMMENT ON FUNCTION public.get_doctor_queue(uuid) IS
  'Doctor app: one doctor''s state (break, late, average minutes), plan modules and today''s tokens (clinic''s local day) with patient names, guests included. No phones.';

-- ---------------------------------------------------------------------------
-- 3. Visit summaries for guests, complete_visit
-- ---------------------------------------------------------------------------
ALTER TABLE public.visit_summaries ALTER COLUMN patient_id DROP NOT NULL;
ALTER TABLE public.visit_summaries ADD COLUMN patient_record_id uuid REFERENCES public.patients(id) ON DELETE CASCADE;

UPDATE public.visit_summaries vs SET patient_record_id = a.patient_id
FROM public.appointments a WHERE a.id = vs.appointment_id AND vs.patient_record_id IS NULL;

ALTER TABLE public.visit_summaries ALTER COLUMN patient_record_id SET NOT NULL;
CREATE INDEX idx_visit_summaries_patient_record ON public.visit_summaries (patient_record_id);

COMMENT ON COLUMN public.visit_summaries.patient_id IS 'The patient''s app account; NULL for guest (walk-in / QR) patients.';
COMMENT ON COLUMN public.visit_summaries.patient_record_id IS 'The clinic''s patient record (public.patients), set for every summary.';

DROP POLICY "doctor inserts visit summary for completed appointment" ON public.visit_summaries;
CREATE POLICY "doctor inserts visit summary for completed appointment" ON public.visit_summaries
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = visit_summaries.appointment_id
      AND a.status = 'completed'
      AND a.doctor_id = visit_summaries.doctor_id
      AND a.user_id IS NOT DISTINCT FROM visit_summaries.patient_id
      AND a.patient_id = visit_summaries.patient_record_id
      AND private.is_doctor_self(a.doctor_id)));

DROP POLICY "doctor updates own visit summary" ON public.visit_summaries;
CREATE POLICY "doctor updates own visit summary" ON public.visit_summaries
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = visit_summaries.appointment_id AND a.status = 'completed' AND private.is_doctor_self(a.doctor_id)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = visit_summaries.appointment_id
      AND a.status = 'completed'
      AND a.doctor_id = visit_summaries.doctor_id
      AND a.user_id IS NOT DISTINCT FROM visit_summaries.patient_id
      AND a.patient_id = visit_summaries.patient_record_id
      AND private.is_doctor_self(a.doctor_id)));

-- Writes the summary and its prescription items (replacing earlier ones).
-- Callers have checked access; runs as the definer so it works the same from
-- save_visit_summary (RLS-checked) and complete_visit.
CREATE FUNCTION private.write_visit_summary(
  p_appt public.appointments, p_diagnosis text, p_notes text, p_follow_up_date date, p_items jsonb
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_summary_id uuid;
BEGIN
  IF jsonb_typeof(COALESCE(p_items, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'p_items must be a JSON array' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.visit_summaries
    (appointment_id, doctor_id, patient_id, patient_record_id, diagnosis, notes, follow_up_date)
  VALUES
    (p_appt.id, p_appt.doctor_id, p_appt.user_id, p_appt.patient_id,
     NULLIF(btrim(p_diagnosis), ''), NULLIF(btrim(p_notes), ''), p_follow_up_date)
  ON CONFLICT (appointment_id) DO UPDATE
    SET diagnosis = EXCLUDED.diagnosis,
        notes = EXCLUDED.notes,
        follow_up_date = EXCLUDED.follow_up_date
  RETURNING id INTO v_summary_id;

  DELETE FROM public.prescription_items WHERE visit_summary_id = v_summary_id;

  INSERT INTO public.prescription_items
    (visit_summary_id, medicine_name, dosage, frequency, duration, instructions, sort_order)
  SELECT
    v_summary_id,
    btrim(item ->> 'medicine_name'),
    COALESCE(btrim(item ->> 'dosage'), ''),
    COALESCE(btrim(item ->> 'frequency'), ''),
    COALESCE(btrim(item ->> 'duration'), ''),
    NULLIF(btrim(item ->> 'instructions'), ''),
    (ord - 1)::integer
  FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) WITH ORDINALITY AS t(item, ord)
  WHERE NULLIF(btrim(item ->> 'medicine_name'), '') IS NOT NULL;

  RETURN v_summary_id;
END;
$function$;

-- Same signature and checks as before (the doctor, a completed appointment),
-- now for guests too.
CREATE OR REPLACE FUNCTION public.save_visit_summary(p_appointment_id uuid, p_diagnosis text, p_notes text, p_follow_up_date date, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_appt public.appointments%ROWTYPE;
BEGIN
  SELECT * INTO v_appt FROM public.appointments WHERE id = p_appointment_id;
  IF NOT FOUND OR v_appt.doctor_id IS NULL THEN
    RAISE EXCEPTION 'Appointment not found' USING ERRCODE = '42501';
  END IF;
  IF NOT private.is_server_context() AND NOT public.is_admin() AND NOT private.is_doctor_self(v_appt.doctor_id) THEN
    RAISE EXCEPTION 'Only the assigned doctor can write visit notes' USING ERRCODE = '42501';
  END IF;
  IF v_appt.status <> 'completed' THEN
    RAISE EXCEPTION 'Complete the visit before saving notes' USING ERRCODE = 'PT409';
  END IF;
  RETURN private.write_visit_summary(v_appt, p_diagnosis, p_notes, p_follow_up_date, p_items);
END;
$function$;

-- The doctor finishes the token with them (called / in progress -> completed)
-- and saves notes in one step. A completed token can have its notes edited.
-- Notes are optional; nothing is written when all are empty.
CREATE FUNCTION public.complete_visit(
  p_appointment_id uuid,
  p_diagnosis text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_follow_up_date date DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_appt public.appointments%ROWTYPE;
  v_summary_id uuid;
BEGIN
  SELECT * INTO v_appt FROM public.appointments WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND OR v_appt.doctor_id IS NULL THEN
    RAISE EXCEPTION 'Token not found' USING ERRCODE = 'PT404';
  END IF;
  IF NOT private.is_server_context() AND NOT public.is_admin() AND NOT private.is_doctor_self(v_appt.doctor_id) THEN
    RAISE EXCEPTION 'Only the assigned doctor can complete this visit' USING ERRCODE = '42501';
  END IF;

  IF v_appt.status IN ('called', 'in_progress') THEN
    UPDATE public.appointments
    SET status = 'completed',
        completed_at = now(),
        duration_minutes = COALESCE(duration_minutes,
          GREATEST(1, (EXTRACT(EPOCH FROM (now() - COALESCE(started_at, called_at, now()))) / 60)::integer))
    WHERE id = v_appt.id
    RETURNING * INTO v_appt;
  ELSIF v_appt.status <> 'completed' THEN
    RAISE EXCEPTION 'Only the patient with the doctor can be completed' USING ERRCODE = 'PT409';
  END IF;

  IF NULLIF(btrim(COALESCE(p_diagnosis, '')), '') IS NOT NULL
     OR NULLIF(btrim(COALESCE(p_notes, '')), '') IS NOT NULL
     OR p_follow_up_date IS NOT NULL
     OR jsonb_array_length(CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END) > 0
     OR EXISTS (SELECT 1 FROM public.visit_summaries WHERE appointment_id = v_appt.id) THEN
    v_summary_id := private.write_visit_summary(v_appt, p_diagnosis, p_notes, p_follow_up_date, p_items);
  END IF;

  RETURN jsonb_build_object('appointment_id', v_appt.id, 'status', v_appt.status, 'summary_id', v_summary_id);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Doctor's today in the clinic's time zone
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_doctor_today_appointments(p_doctor_id uuid)
 RETURNS TABLE(appointment_id uuid, patient_name text, appointment_time text, status text, token_number integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT private.is_server_context() AND NOT public.is_admin() AND NOT private.is_doctor_self(p_doctor_id) THEN
    RAISE EXCEPTION 'Only this doctor can view their appointments'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    a.id AS appointment_id,
    COALESCE(CASE WHEN pt.user_id IS NOT NULL THEN NULLIF(p.full_name, '') END, pt.name) AS patient_name,
    a.appointment_time::text AS appointment_time,
    a.status::text AS status,
    a.token_number::int AS token_number
  FROM public.appointments a
  JOIN public.patients pt ON pt.id = a.patient_id
  LEFT JOIN public.profiles p ON p.id = pt.user_id
  WHERE a.doctor_id = p_doctor_id
    AND a.appointment_date = private.org_today(private.center_organization(a.center_id))
  ORDER BY a.token_number ASC;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION private.doctor_delay_minutes(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.write_visit_summary(public.appointments, text, text, date, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.set_doctor_late(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_doctor_late(uuid, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_token_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_token_status(text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_doctor_queue(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_doctor_queue(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_visit_summary(uuid, text, text, date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_visit_summary(uuid, text, text, date, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_visit(uuid, text, text, date, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_visit(uuid, text, text, date, jsonb) TO authenticated, service_role;

notify pgrst, 'reload schema';
