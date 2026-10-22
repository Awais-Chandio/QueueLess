-- Phase 1A.5: tokens.
--
-- 1. appointments.source: walk_in | qr | online | app (existing rows: app).
-- 2. appointments.public_code: 8 characters, crypto-random, unique, from an
--    alphabet without look-alikes (no 0/O, 1/I). It is the only handle a
--    guest gets; get_token_status (1A.6) takes it.
-- 3. Time slot optional: appointment_time stays NULL for tokens. scheduled_at
--    (NOT NULL, the app sorts and filters "today" by it) holds the issue time.
--    cleanup_stale_appointments no longer treats a token as a missed slot.
-- 4. issue_token(doctor, name, phone, source): receptionist walk-ins and
--    public QR/online joins (anon allowed). Token numbers come from the
--    existing per-doctor trigger, so tokens and app bookings share one
--    sequence. Public joins: at most 3 per phone per clinic (organization)
--    per day.

-- ---------------------------------------------------------------------------
-- 1. source
-- ---------------------------------------------------------------------------
ALTER TABLE public.appointments
  ADD COLUMN source text NOT NULL DEFAULT 'app'
    CHECK (source IN ('walk_in', 'qr', 'online', 'app'));

COMMENT ON COLUMN public.appointments.source IS
  'How the token was created: walk_in (receptionist), qr (scan at clinic), online (public link), app (patient app).';
COMMENT ON COLUMN public.appointments.appointment_time IS
  'Booked time slot. NULL for queue tokens (walk-in/QR/online), which have no slot.';

-- ---------------------------------------------------------------------------
-- 2. public_code
-- ---------------------------------------------------------------------------

-- 8 symbols from 32 (40 bits). 256 is a multiple of 32, so byte % 32 is uniform.
CREATE FUNCTION private.generate_public_code()
 RETURNS text
 LANGUAGE sql
 VOLATILE
 SET search_path TO ''
AS $function$
  SELECT string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', get_byte(r.b, i) % 32 + 1, 1), '' ORDER BY i)
  FROM (SELECT extensions.gen_random_bytes(8) AS b) r, generate_series(0, 7) AS i;
$function$;

ALTER TABLE public.appointments ADD COLUMN public_code text
  CHECK (public_code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$');

-- SECURITY DEFINER: the collision check must see every row, not the caller's.
CREATE FUNCTION private.assign_public_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_code text;
BEGIN
  IF NEW.public_code IS NULL THEN
    LOOP
      v_code := private.generate_public_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.appointments WHERE public_code = v_code);
    END LOOP;
    NEW.public_code := v_code;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER assign_public_code
  BEFORE INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION private.assign_public_code();

-- Backfill, then re-roll the (unlikely) duplicates before the unique index.
UPDATE public.appointments SET public_code = private.generate_public_code() WHERE public_code IS NULL;

DO $$
BEGIN
  LOOP
    UPDATE public.appointments
    SET public_code = private.generate_public_code()
    WHERE id IN (
      SELECT id FROM (
        SELECT id, row_number() OVER (PARTITION BY public_code ORDER BY created_at, id) AS rn
        FROM public.appointments
      ) d
      WHERE d.rn > 1
    );
    EXIT WHEN NOT FOUND;
  END LOOP;
END
$$;

CREATE UNIQUE INDEX appointments_public_code_key ON public.appointments (public_code);
ALTER TABLE public.appointments ALTER COLUMN public_code SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Tokens have no slot: expire them at the end of their day, never as a
--    missed 15-minute check-in window.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_stale_appointments()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT private.is_server_context() THEN
    RAISE EXCEPTION 'cleanup_stale_appointments can only run server-side'
      USING ERRCODE = '42501';
  END IF;

  -- A. Mark confirmed slot bookings that missed their check-in window as 'no_show'
  -- Grace period: 15 minutes after scheduled_at
  UPDATE public.appointments
  SET
    status = 'no_show',
    notes = CASE
      WHEN notes IS NULL OR notes = '' THEN 'Auto-marked as No-Show: missed 15-min check-in window'
      ELSE notes || E'\n(Auto-marked as No-Show: missed 15-min check-in window)'
    END
  WHERE status = 'confirmed'
    AND appointment_time IS NOT NULL
    AND scheduled_at < (now() - interval '15 minutes');

  -- B. Mark active/pending slot bookings past their duration as 'expired'
  -- Duration: service's duration_minutes (default 30 mins) + 15 mins safety buffer
  UPDATE public.appointments
  SET
    status = 'expired',
    notes = CASE
      WHEN notes IS NULL OR notes = '' THEN 'Auto-marked as Expired: time slot passed'
      ELSE notes || E'\n(Auto-marked as Expired: time slot passed)'
    END
  WHERE status IN ('pending', 'confirmed', 'checked_in', 'called', 'in_progress')
    AND appointment_time IS NOT NULL
    AND scheduled_at < (now() - (COALESCE((SELECT duration_minutes FROM public.services WHERE id = service_id), 30) + 15) * interval '1 minute');

  -- C. Queue tokens (no slot) still open after their clinic's day ended:
  -- waiting ones expire, called-but-never-seen ones are no-shows (the only
  -- moves validate_appointment_status_transition allows). In-progress ones
  -- are left for the doctor to complete.
  UPDATE public.appointments a
  SET
    status = CASE WHEN a.status = 'called' THEN 'no_show' ELSE 'expired' END,
    notes = CASE
      WHEN a.notes IS NULL OR a.notes = '' THEN 'Auto-closed: token day ended'
      ELSE a.notes || E'\n(Auto-closed: token day ended)'
    END
  FROM public.service_centers c
  JOIN public.organizations o ON o.id = c.organization_id
  WHERE c.id = a.center_id
    AND a.status IN ('pending', 'confirmed', 'checked_in', 'called')
    AND a.appointment_time IS NULL
    AND a.appointment_date < (now() AT TIME ZONE o.timezone)::date;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Queue position of one token (shared with get_token_status).
--    people_ahead = tokens still waiting with a lower number in the same
--    queue (the doctor's, or the center's when there's no doctor) that day.
--    current_token = the token being served, else the last one completed.
-- ---------------------------------------------------------------------------
CREATE FUNCTION private.token_progress(p_appointment_id uuid)
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
BEGIN
  SELECT * INTO v_appt FROM public.appointments WHERE id = p_appointment_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(
           MAX(a.token_number) FILTER (WHERE a.status IN ('called', 'in_progress')),
           MAX(a.token_number) FILTER (WHERE a.status = 'completed'),
           0)
  INTO v_current
  FROM public.appointments a
  WHERE a.appointment_date = v_appt.appointment_date
    AND (CASE WHEN v_appt.doctor_id IS NOT NULL THEN a.doctor_id = v_appt.doctor_id
              ELSE a.doctor_id IS NULL AND a.center_id = v_appt.center_id END);

  IF v_appt.status IN ('pending', 'confirmed', 'checked_in') THEN
    SELECT count(*)::integer INTO v_ahead
    FROM public.appointments a
    WHERE a.appointment_date = v_appt.appointment_date
      AND (CASE WHEN v_appt.doctor_id IS NOT NULL THEN a.doctor_id = v_appt.doctor_id
                ELSE a.doctor_id IS NULL AND a.center_id = v_appt.center_id END)
      AND a.status IN ('pending', 'confirmed', 'checked_in')
      AND a.token_number < v_appt.token_number;
  END IF;

  IF v_appt.doctor_id IS NOT NULL THEN
    SELECT average_consultation_time INTO v_avg
    FROM public.doctor_queue_settings WHERE doctor_id = v_appt.doctor_id;
  ELSE
    SELECT average_consultation_time INTO v_avg
    FROM public.center_queue_settings
    WHERE center_id = v_appt.center_id AND appointment_date = v_appt.appointment_date;
  END IF;

  RETURN QUERY SELECT v_ahead, CEIL(v_ahead * COALESCE(v_avg, 10.0))::integer, v_current;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. issue_token
-- ---------------------------------------------------------------------------

-- Successful public joins, for the per-phone daily limit. Not exposed through
-- the API (private schema, no grants).
CREATE TABLE private.public_token_joins (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  join_date date NOT NULL,
  phone text NOT NULL,
  user_id uuid,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_public_token_joins_phone ON private.public_token_joins (organization_id, join_date, phone);
CREATE INDEX idx_public_token_joins_user ON private.public_token_joins (organization_id, join_date, user_id);

-- Callers:
--   staff of the doctor's center (owner/receptionist), platform admin, server:
--     any source except 'app'; phone optional; no per-phone limit.
--   everyone else, including anon: 'qr' or 'online' ('app' when signed in);
--     name and phone required; at most 3 joins per phone (and per account)
--     per organization per day; not while the doctor is on leave.
-- Returns appointment_id only to callers who may see the appointment.
CREATE FUNCTION public.issue_token(p_doctor_id uuid, p_name text, p_phone text, p_source text DEFAULT 'qr')
 RETURNS TABLE (appointment_id uuid, public_code text, token_number integer, people_ahead integer, eta_minutes integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  c_public_daily_limit constant integer := 3;
  v_uid uuid := auth.uid();
  v_source text := lower(btrim(COALESCE(p_source, '')));
  v_name text := btrim(regexp_replace(COALESCE(p_name, ''), '\s+', ' ', 'g'));
  v_phone text := private.normalize_phone(p_phone);
  v_doctor public.doctors%ROWTYPE;
  v_center public.service_centers%ROWTYPE;
  v_org public.organizations%ROWTYPE;
  v_is_staff boolean;
  v_today date;
  v_service_id uuid;
  v_patient_id uuid;
  v_appt public.appointments%ROWTYPE;
BEGIN
  -- Input
  IF v_source NOT IN ('walk_in', 'qr', 'online', 'app') THEN
    RAISE EXCEPTION 'Unknown token source "%"', p_source USING ERRCODE = '22023';
  END IF;
  IF char_length(v_name) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Please enter the patient''s name (up to 100 characters)' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(COALESCE(p_phone, '')), '') IS NOT NULL AND v_phone IS NULL THEN
    RAISE EXCEPTION 'Please enter a valid phone number' USING ERRCODE = '22023';
  END IF;

  -- Doctor, center, organization
  SELECT * INTO v_doctor FROM public.doctors WHERE id = p_doctor_id;
  IF NOT FOUND OR NOT v_doctor.is_active THEN
    RAISE EXCEPTION 'Doctor not found' USING ERRCODE = 'PT404';
  END IF;
  SELECT * INTO v_center FROM public.service_centers WHERE id = v_doctor.center_id;
  SELECT * INTO v_org FROM public.organizations WHERE id = v_center.organization_id;
  IF v_org.status <> 'active' THEN
    RAISE EXCEPTION 'This clinic is not taking tokens right now' USING ERRCODE = 'PT403';
  END IF;

  v_today := (now() AT TIME ZONE v_org.timezone)::date;
  v_is_staff := private.is_server_context() OR public.is_admin() OR private.is_center_staff(v_center.id);

  -- Who may use which source
  IF v_is_staff THEN
    IF v_source = 'app' THEN
      RAISE EXCEPTION 'Staff issue walk_in, qr or online tokens' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF v_source = 'walk_in' THEN
      RAISE EXCEPTION 'Only clinic staff can issue walk-in tokens' USING ERRCODE = '42501';
    END IF;
    IF v_source = 'app' AND v_uid IS NULL THEN
      RAISE EXCEPTION 'Sign in to join from the app' USING ERRCODE = '42501';
    END IF;
    IF v_phone IS NULL THEN
      RAISE EXCEPTION 'Please enter a valid phone number' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.doctor_leaves WHERE doctor_id = v_doctor.id AND leave_date = v_today) THEN
      RAISE EXCEPTION 'This doctor is not seeing patients today' USING ERRCODE = 'PT409';
    END IF;

    -- Per phone (and per account) per organization per day. The lock makes
    -- concurrent joins from the same phone count one after the other.
    PERFORM pg_advisory_xact_lock(hashtextextended('issue_token:' || v_org.id || ':' || v_today || ':' || v_phone, 0));
    IF (SELECT count(*) FROM private.public_token_joins j
        WHERE j.organization_id = v_org.id AND j.join_date = v_today AND j.phone = v_phone) >= c_public_daily_limit
       OR (v_uid IS NOT NULL AND (SELECT count(*) FROM private.public_token_joins j
           WHERE j.organization_id = v_org.id AND j.join_date = v_today AND j.user_id = v_uid) >= c_public_daily_limit)
    THEN
      RAISE EXCEPTION 'Too many tokens for this phone number today. Please ask at the reception.'
        USING ERRCODE = 'PT429';
    END IF;
  END IF;

  -- Service: the doctor's first service at this center, else the center's first.
  SELECT s.id INTO v_service_id
  FROM public.doctor_services ds
  JOIN public.services s ON s.id = ds.service_id AND s.center_id = v_center.id
  WHERE ds.doctor_id = v_doctor.id
  ORDER BY s.created_at, s.id
  LIMIT 1;
  IF v_service_id IS NULL THEN
    SELECT s.id INTO v_service_id FROM public.services s
    WHERE s.center_id = v_center.id ORDER BY s.created_at, s.id LIMIT 1;
  END IF;
  IF v_service_id IS NULL THEN
    RAISE EXCEPTION 'This clinic has no service set up yet' USING ERRCODE = 'PT409';
  END IF;

  -- Patient: a signed-in patient joining under their own name uses their
  -- record; otherwise the guest with this phone and name, or a new one.
  IF NOT v_is_staff AND v_uid IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.profiles pr WHERE pr.id = v_uid AND lower(btrim(pr.full_name)) = lower(v_name)) THEN
    v_patient_id := private.patient_for_user(v_org.id, v_uid);
  ELSE
    IF v_phone IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('patient:' || v_org.id || ':' || v_phone, 0));
      SELECT p.id INTO v_patient_id
      FROM public.patients p
      WHERE p.organization_id = v_org.id AND p.user_id IS NULL
        AND p.phone = v_phone AND lower(p.name) = lower(v_name)
      ORDER BY p.created_at
      LIMIT 1;
    END IF;
    IF v_patient_id IS NULL THEN
      INSERT INTO public.patients (organization_id, name, phone)
      VALUES (v_org.id, v_name, v_phone)
      RETURNING id INTO v_patient_id;
    END IF;
  END IF;

  -- Token: number from the per-doctor trigger. In the clinic (walk-in, QR)
  -- means checked in; remote joins wait as confirmed.
  INSERT INTO public.appointments (
    user_id, patient_id, center_id, service_id, doctor_id,
    appointment_date, appointment_time, scheduled_at, status, checked_in_at, source
  ) VALUES (
    CASE WHEN v_is_staff THEN NULL ELSE v_uid END, v_patient_id, v_center.id, v_service_id, v_doctor.id,
    v_today, NULL, now(),
    CASE WHEN v_source IN ('walk_in', 'qr') THEN 'checked_in' ELSE 'confirmed' END,
    CASE WHEN v_source IN ('walk_in', 'qr') THEN now() END,
    v_source
  )
  RETURNING * INTO v_appt;

  IF NOT v_is_staff THEN
    INSERT INTO private.public_token_joins (organization_id, join_date, phone, user_id, appointment_id)
    VALUES (v_org.id, v_today, v_phone, v_uid, v_appt.id);
  END IF;

  RETURN QUERY
  SELECT
    CASE WHEN v_is_staff OR (v_uid IS NOT NULL AND v_appt.user_id = v_uid) THEN v_appt.id END,
    v_appt.public_code,
    v_appt.token_number,
    tp.people_ahead,
    tp.eta_minutes
  FROM private.token_progress(v_appt.id) tp;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. appointments_full: source and public_code for staff and the patient.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.appointments_full WITH (security_invoker = true) AS
 WITH latest_queue_updates AS (
         SELECT DISTINCT ON (queue_updates.appointment_id) queue_updates.appointment_id,
            queue_updates.current_position,
            queue_updates.people_ahead,
            queue_updates.estimated_wait_mins,
            queue_updates.current_serving_token,
            queue_updates.status AS queue_status
           FROM public.queue_updates
          ORDER BY queue_updates.appointment_id, queue_updates.created_at DESC
        )
 SELECT appointments.id,
    appointments.user_id,
    COALESCE(CASE WHEN patients.user_id IS NOT NULL THEN NULLIF(profiles.full_name, '') END, patients.name, profiles.full_name) AS patient_name,
    appointments.center_id,
    appointments.service_id,
    appointments.doctor_id,
    doctors.name AS doctor_name,
    service_centers.name AS center_name,
    services.name AS service_name,
    appointments.scheduled_at,
    appointments.appointment_date,
    appointments.appointment_time,
    appointments.status,
    appointments.token_number,
    appointments.notes,
    appointments.cancel_reason,
    appointments.cancelled_by,
    appointments.cancelled_at,
    appointments.checked_in_at,
    appointments.called_at,
    appointments.started_at,
    appointments.completed_at,
    appointments.skipped_at,
    appointments.duration_minutes,
    appointments.created_at,
    COALESCE(latest_queue_updates.estimated_wait_mins, appointments.estimated_wait_mins) AS estimated_wait_mins,
    COALESCE(latest_queue_updates.estimated_wait_mins, appointments.estimated_wait_mins) AS estimated_wait_time,
    latest_queue_updates.current_position,
    latest_queue_updates.current_position AS queue_position,
    latest_queue_updates.people_ahead,
    latest_queue_updates.queue_status,
    latest_queue_updates.current_serving_token,
    latest_queue_updates.current_serving_token AS current_token,
    COALESCE(
        CASE
            WHEN (appointments.doctor_id IS NOT NULL) THEN doctor_queue_settings.average_consultation_time
            ELSE center_queue_settings.average_consultation_time
        END, 10.0) AS doctor_average_time,
    COALESCE(
        CASE
            WHEN (appointments.doctor_id IS NOT NULL) THEN doctor_queue_settings.average_consultation_time
            ELSE center_queue_settings.average_consultation_time
        END, 10.0) AS average_consultation_time,
        CASE
            WHEN (appointments.doctor_id IS NOT NULL) THEN (COALESCE(doctor_queue_settings.is_on_break, false) OR ((doctor_queue_settings.break_start IS NOT NULL) AND (doctor_queue_settings.break_start <= now()) AND ((doctor_queue_settings.break_end IS NULL) OR (doctor_queue_settings.break_end > now()))))
            ELSE (COALESCE(center_queue_settings.is_on_break, false) OR ((center_queue_settings.break_start IS NOT NULL) AND (center_queue_settings.break_start <= now()) AND ((center_queue_settings.break_end IS NULL) OR (center_queue_settings.break_end > now()))))
        END AS is_on_break,
        CASE
            WHEN (appointments.doctor_id IS NOT NULL) THEN doctor_queue_settings.break_start
            ELSE center_queue_settings.break_start
        END AS break_start,
        CASE
            WHEN (appointments.doctor_id IS NOT NULL) THEN doctor_queue_settings.break_end
            ELSE center_queue_settings.break_end
        END AS break_end,
    appointments.patient_id,
    appointments.source,
    appointments.public_code
   FROM public.appointments
     LEFT JOIN public.patients ON patients.id = appointments.patient_id
     LEFT JOIN public.profiles ON profiles.id = appointments.user_id
     LEFT JOIN public.service_centers ON service_centers.id = appointments.center_id
     LEFT JOIN public.services ON services.id = appointments.service_id
     LEFT JOIN public.doctors ON doctors.id = appointments.doctor_id
     LEFT JOIN latest_queue_updates ON latest_queue_updates.appointment_id = appointments.id
     LEFT JOIN public.center_queue_settings ON center_queue_settings.center_id = appointments.center_id AND center_queue_settings.appointment_date = appointments.appointment_date
     LEFT JOIN public.doctor_queue_settings ON doctor_queue_settings.doctor_id = appointments.doctor_id;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION private.generate_public_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.assign_public_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.token_progress(uuid) FROM PUBLIC;
REVOKE ALL ON TABLE private.public_token_joins FROM PUBLIC;
REVOKE ALL ON FUNCTION public.issue_token(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_token(uuid, text, text, text) TO anon, authenticated;
