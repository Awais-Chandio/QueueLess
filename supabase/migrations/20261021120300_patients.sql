-- Phase 1A.4: guest patients.
--
-- patients = a person a clinic serves, per organization: name, phone, and the
-- app account (user_id) when there is one. Walk-in and QR patients have none.
-- appointments.patient_id points at it (NOT NULL); appointments.user_id is now
-- optional (the account that booked, if any).
--
-- App bookings keep working unchanged: a trigger fills patient_id from user_id
-- (one patient row per account per organization).
--
-- user_id can now be NULL, and several checks compared it with "=" / "<>",
-- which yields NULL and silently passes an IF NOT ... THEN RAISE. Those are
-- rewritten to be NULL-safe here (cancel/check-in RPCs, can_view_appointment,
-- notification triggers).

-- ---------------------------------------------------------------------------
-- 1. patients
-- ---------------------------------------------------------------------------

-- Digits with an optional leading "+", 7-15 digits, "00" prefix -> "+";
-- spaces, dashes, dots and brackets dropped. Anything else -> NULL.
CREATE FUNCTION private.normalize_phone(p_phone text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT CASE WHEN v ~ '^\+?[0-9]{7,15}$' THEN v END
  FROM (SELECT regexp_replace(regexp_replace(btrim(COALESCE(p_phone, '')), '[\s().-]', '', 'g'), '^00', '+') AS v) s;
$function$;

CREATE TABLE public.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  phone text CHECK (phone IS NULL OR phone ~ '^\+?[0-9]{7,15}$'),
  -- The app account, when the patient has one. Deleting the account keeps
  -- the clinic's record (as a guest).
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.patients IS
  'A person an organization serves. user_id is set for app accounts, NULL for walk-in/QR guests.';

-- One record per account per organization. Guests are not unique by
-- phone (families share a phone); issue_token dedupes them by phone + name.
CREATE UNIQUE INDEX patients_org_user_key ON public.patients (organization_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_patients_org_phone ON public.patients (organization_id, phone);
CREATE INDEX idx_patients_user ON public.patients (user_id);

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

-- The organization's patient record for an app account, created on first use.
CREATE FUNCTION private.patient_for_user(p_org_id uuid, p_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.patients (organization_id, user_id, name, phone)
  SELECT p_org_id, u.id,
         COALESCE(NULLIF(left(btrim(pr.full_name), 100), ''), 'Patient'),
         private.normalize_phone(pr.phone)
  FROM auth.users u
  LEFT JOIN public.profiles pr ON pr.id = u.id
  WHERE u.id = p_user_id
  ON CONFLICT (organization_id, user_id) WHERE user_id IS NOT NULL DO NOTHING;

  SELECT id INTO v_id FROM public.patients WHERE organization_id = p_org_id AND user_id = p_user_id;
  RETURN v_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. appointments.patient_id, user_id optional
-- ---------------------------------------------------------------------------
ALTER TABLE public.appointments
  ADD COLUMN patient_id uuid REFERENCES public.patients(id) ON DELETE RESTRICT;
CREATE INDEX idx_appointments_patient ON public.appointments (patient_id);

-- Fills patient_id from user_id when missing, and refuses a patient from
-- another organization than the appointment's center.
CREATE FUNCTION private.resolve_appointment_patient()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_org uuid;
  v_patient public.patients%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.patient_id IS NOT DISTINCT FROM OLD.patient_id
     AND NEW.center_id IS NOT DISTINCT FROM OLD.center_id
     AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id THEN
    RETURN NEW;
  END IF;

  v_org := private.center_organization(NEW.center_id);
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Clinic not found' USING ERRCODE = '23503';
  END IF;

  IF NEW.patient_id IS NULL THEN
    IF NEW.user_id IS NULL THEN
      RAISE EXCEPTION 'An appointment needs a patient' USING ERRCODE = '23502';
    END IF;
    NEW.patient_id := private.patient_for_user(v_org, NEW.user_id);
  ELSE
    SELECT * INTO v_patient FROM public.patients WHERE id = NEW.patient_id;
    IF NOT FOUND OR v_patient.organization_id <> v_org THEN
      RAISE EXCEPTION 'Patient belongs to another clinic' USING ERRCODE = '42501';
    END IF;
    IF v_patient.user_id IS NOT NULL AND NEW.user_id IS NOT NULL AND v_patient.user_id <> NEW.user_id THEN
      RAISE EXCEPTION 'Patient belongs to another account' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Before the backfill (see 1A.1).
CREATE TRIGGER resolve_appointment_patient
  BEFORE INSERT OR UPDATE OF patient_id, center_id, user_id ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION private.resolve_appointment_patient();

-- Backfill: one patient per (organization, booking account). Appointments
-- whose account was deleted (no FK on appointments.user_id) still get a
-- patient record, without user_id.
CREATE TEMP TABLE patient_backfill AS
SELECT gen_random_uuid() AS patient_id, c.organization_id, a.user_id
FROM (SELECT DISTINCT center_id, user_id FROM public.appointments WHERE patient_id IS NULL) a
JOIN public.service_centers c ON c.id = a.center_id
GROUP BY c.organization_id, a.user_id;

-- Accounts that already got a record from the trigger meanwhile reuse it.
UPDATE patient_backfill b
SET patient_id = p.id
FROM public.patients p
WHERE p.organization_id = b.organization_id AND p.user_id = b.user_id;

INSERT INTO public.patients (id, organization_id, user_id, name, phone)
SELECT b.patient_id, b.organization_id, u.id,
       COALESCE(NULLIF(left(btrim(pr.full_name), 100), ''), 'Patient'),
       private.normalize_phone(pr.phone)
FROM patient_backfill b
LEFT JOIN auth.users u ON u.id = b.user_id
LEFT JOIN public.profiles pr ON pr.id = b.user_id
ON CONFLICT (id) DO NOTHING;

-- Only patient_id changes; the trigger validates the organization.
UPDATE public.appointments a
SET patient_id = b.patient_id
FROM patient_backfill b, public.service_centers c
WHERE a.patient_id IS NULL
  AND c.id = a.center_id
  AND b.organization_id = c.organization_id
  AND b.user_id = a.user_id;

DROP TABLE patient_backfill;

ALTER TABLE public.appointments ALTER COLUMN patient_id SET NOT NULL;
ALTER TABLE public.appointments ALTER COLUMN user_id DROP NOT NULL;

COMMENT ON COLUMN public.appointments.user_id IS
  'App account that booked, if any. NULL for walk-in/QR guests; the person is patient_id.';

-- A center that has appointments can't move to another organization: its
-- patients belong to the old one.
CREATE OR REPLACE FUNCTION private.service_centers_assign_organization()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.organization_id IS NULL THEN
    NEW.organization_id := private.create_default_organization(NEW.name);
  ELSIF TG_OP = 'UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    IF NOT private.is_server_context() AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only a platform admin can move a center to another organization'
        USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.appointments WHERE center_id = NEW.id) THEN
      RAISE EXCEPTION 'This center has appointments; it can''t move to another organization'
        USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Who can read a patient record
-- ---------------------------------------------------------------------------
CREATE FUNCTION private.can_view_patient(p_patient_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.patients p
        WHERE p.id = p_patient_id
          AND (p.user_id = auth.uid() OR private.has_org_role(p.organization_id, ARRAY['owner']))
      )
      OR EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.patient_id = p_patient_id
          AND (a.user_id = auth.uid()
               OR private.is_center_staff(a.center_id)
               OR private.is_doctor_self(a.doctor_id))
      );
$function$;

REVOKE ALL ON public.patients FROM anon, authenticated;
GRANT SELECT ON public.patients TO authenticated;

-- Own record, records of people the account booked for, the organization's
-- owner, staff of a center the patient visited, the patient's doctors.
CREATE POLICY "read patients you serve or are" ON public.patients
  FOR SELECT TO authenticated
  USING (private.can_view_patient(id));

-- ---------------------------------------------------------------------------
-- 4. NULL-safe caller checks now that user_id can be NULL
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.can_view_appointment(p_user_id uuid, p_center_id uuid, p_doctor_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT COALESCE(p_user_id = auth.uid(), false)
      OR private.can_operate_appointment(p_center_id, p_doctor_id);
$function$;

CREATE OR REPLACE FUNCTION public.cancel_appointment(p_appointment_id uuid, p_reason text)
 RETURNS public.appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_appointment public.appointments%ROWTYPE;
BEGIN
  SELECT * INTO v_appointment
  FROM public.appointments
  WHERE id = p_appointment_id FOR UPDATE;

  IF NOT FOUND OR v_appointment.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Appointment not found or unauthorized';
  END IF;

  IF v_appointment.status IN ('completed', 'cancelled', 'expired', 'no_show') THEN
    RAISE EXCEPTION 'Cannot cancel an inactive or completed appointment';
  END IF;

  UPDATE public.appointments
  SET
    status = 'cancelled',
    cancel_reason = COALESCE(p_reason, 'User requested cancellation'),
    cancelled_by = auth.uid(),
    cancelled_at = now()
  WHERE id = p_appointment_id
  RETURNING * INTO v_appointment;

  RETURN v_appointment;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_in_appointment(p_appointment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_appointment public.appointments%ROWTYPE;
BEGIN
  SELECT *
  INTO v_appointment
  FROM public.appointments
  WHERE id = p_appointment_id
  FOR UPDATE;

  IF NOT FOUND OR v_appointment.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  IF v_appointment.status NOT IN ('pending', 'confirmed', 'checked_in') THEN
    RAISE EXCEPTION 'This appointment cannot be checked in';
  END IF;

  IF v_appointment.status <> 'checked_in' THEN
    UPDATE public.appointments
    SET
      status = 'checked_in',
      checked_in_at = COALESCE(checked_in_at, now())
    WHERE id = p_appointment_id;
  END IF;
END;
$function$;

-- In-app notifications go to the booking account; guests have none.
CREATE OR REPLACE FUNCTION public.create_notification_on_appointment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (
    user_id,
    title,
    message,
    appointment_id,
    is_read,
    created_at
  ) VALUES (
    NEW.user_id,
    'Appointment Confirmed',
    'Your appointment has been booked successfully',
    NEW.id,
    false,
    now()
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_notification_on_cancel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.user_id IS NOT NULL THEN
    INSERT INTO public.notifications (
      user_id,
      title,
      message,
      appointment_id,
      is_read,
      created_at
    ) VALUES (
      NEW.user_id,
      'Appointment Cancelled',
      'Your appointment has been cancelled by staff/admin',
      NEW.id,
      false,
      now()
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- Visit summaries are tied to the patient's app account (patient_id is an
-- auth user there). Say so plainly for guests instead of a NOT NULL error.
CREATE OR REPLACE FUNCTION public.save_visit_summary(p_appointment_id uuid, p_diagnosis text, p_notes text, p_follow_up_date date, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_appt public.appointments%ROWTYPE;
  v_summary_id uuid;
BEGIN
  SELECT * INTO v_appt FROM public.appointments WHERE id = p_appointment_id;

  IF NOT FOUND OR v_appt.doctor_id IS NULL THEN
    RAISE EXCEPTION 'Appointment not found' USING ERRCODE = '42501';
  END IF;

  IF v_appt.user_id IS NULL THEN
    RAISE EXCEPTION 'Visit summaries need a patient with an app account' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(COALESCE(p_items, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'p_items must be a JSON array' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.visit_summaries
    (appointment_id, doctor_id, patient_id, diagnosis, notes, follow_up_date)
  VALUES
    (p_appointment_id, v_appt.doctor_id, v_appt.user_id,
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
    btrim(item ->> 'dosage'),
    btrim(item ->> 'frequency'),
    btrim(item ->> 'duration'),
    NULLIF(btrim(item ->> 'instructions'), ''),
    (ord - 1)::integer
  FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) WITH ORDINALITY AS t(item, ord);

  RETURN v_summary_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Patient names for guests in what the staff and doctor screens read
-- ---------------------------------------------------------------------------

-- Doctor's "today" list joined profiles with INNER JOIN, so guests would be
-- invisible. Name: the guest record's name, or the account's current name.
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
    AND a.appointment_date = CURRENT_DATE
  ORDER BY a.token_number ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_doctor_recent_patients(p_doctor_id uuid)
 RETURNS TABLE(patient_name text, last_appointment_date date, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT private.is_server_context() AND NOT public.is_admin() AND NOT private.is_doctor_self(p_doctor_id) THEN
    RAISE EXCEPTION 'Only this doctor can view their patients'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH unique_patients AS (
    SELECT DISTINCT ON (a.patient_id)
      COALESCE(CASE WHEN pt.user_id IS NOT NULL THEN NULLIF(p.full_name, '') END, pt.name) AS p_name,
      a.appointment_date AS last_date,
      a.status::text AS last_status,
      a.scheduled_at AS sched_at
    FROM public.appointments a
    JOIN public.patients pt ON pt.id = a.patient_id
    LEFT JOIN public.profiles p ON p.id = pt.user_id
    WHERE a.doctor_id = p_doctor_id
      -- Guests, or accounts that are patients (not staff testing the app).
      AND (pt.user_id IS NULL OR p.role = 'client')
    ORDER BY a.patient_id, a.appointment_date DESC, a.scheduled_at DESC
  )
  SELECT
    up.p_name AS patient_name,
    up.last_date AS last_appointment_date,
    up.last_status AS status
  FROM unique_patients up
  ORDER BY up.sched_at DESC
  LIMIT 20;
END;
$function$;

-- appointments_full (security invoker): patient_name falls back to the patient
-- record, so guests show a name; patient_id appended.
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
    appointments.patient_id
   FROM public.appointments
     LEFT JOIN public.patients ON patients.id = appointments.patient_id
     LEFT JOIN public.profiles ON profiles.id = appointments.user_id
     LEFT JOIN public.service_centers ON service_centers.id = appointments.center_id
     LEFT JOIN public.services ON services.id = appointments.service_id
     LEFT JOIN public.doctors ON doctors.id = appointments.doctor_id
     LEFT JOIN latest_queue_updates ON latest_queue_updates.appointment_id = appointments.id
     LEFT JOIN public.center_queue_settings ON center_queue_settings.center_id = appointments.center_id AND center_queue_settings.appointment_date = appointments.appointment_date
     LEFT JOIN public.doctor_queue_settings ON doctor_queue_settings.doctor_id = appointments.doctor_id;

REVOKE ALL ON FUNCTION private.normalize_phone(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.patient_for_user(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.resolve_appointment_patient() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_view_patient(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_view_patient(uuid) TO authenticated, service_role;
