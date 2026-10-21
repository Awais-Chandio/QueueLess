-- Phase 0.3: lock down RPCs.
--
-- 1. Caller-check helpers in a private (non-API) schema.
-- 2. Caller checks in the functions the audit flagged, plus call_appointment
--    (it let staff of any center act on any appointment), staff_performance
--    and two bug fixes (cancel_appointment, get_doctor_availability).
-- 3. Every other public function: unchanged logic, references schema-qualified,
--    SET search_path TO '' (fixes the 17 "mutable search_path" advisor hits and
--    pins the rest from 'public' to '').
-- 4. Policies that call is_admin()/is_staff() move from PUBLIC to authenticated.
-- 5. EXECUTE: revoked from PUBLIC/anon/authenticated on every public function,
--    then granted to authenticated only for the RPCs the app calls.

-- ---------------------------------------------------------------------------
-- 1. Caller-check helpers
--    In a schema PostgREST doesn't expose, so they can't be called as RPCs. They
--    only answer questions about the caller (auth.uid()), never about others.
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- True when no app user is behind the call: service_role (Edge Functions),
-- pg_cron, migrations, the SQL editor. PostgREST runs app requests with
-- SET ROLE anon/authenticated, and that setting survives SECURITY DEFINER.
CREATE OR REPLACE FUNCTION private.is_server_context()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT COALESCE(current_setting('role', true), 'none') NOT IN ('anon', 'authenticated');
$function$;

-- Caller is a staff member assigned to this center (staff_centers).
CREATE OR REPLACE FUNCTION private.is_center_staff(p_center_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT public.is_staff()
     AND EXISTS (
       SELECT 1
       FROM public.staff_centers sc
       WHERE sc.profile_id = auth.uid()
         AND sc.center_id = p_center_id
     );
$function$;

-- Caller is an admin, or staff of this center.
CREATE OR REPLACE FUNCTION private.can_manage_center(p_center_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT public.is_admin() OR private.is_center_staff(p_center_id);
$function$;

-- Caller is this doctor.
CREATE OR REPLACE FUNCTION private.is_doctor_self(p_doctor_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.doctors d
    WHERE d.id = p_doctor_id
      AND d.profile_id = auth.uid()
  );
$function$;

-- Caller is an admin, this doctor, or staff of the doctor's center.
CREATE OR REPLACE FUNCTION private.can_manage_doctor(p_doctor_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT public.is_admin()
      OR private.is_doctor_self(p_doctor_id)
      OR EXISTS (
        SELECT 1
        FROM public.doctors d
        WHERE d.id = p_doctor_id
          AND private.is_center_staff(d.center_id)
      );
$function$;

-- Caller may run front-desk / clinical actions on an appointment:
-- admin, staff of its center, or its assigned doctor.
CREATE OR REPLACE FUNCTION private.can_operate_appointment(p_center_id uuid, p_doctor_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT private.can_manage_center(p_center_id) OR private.is_doctor_self(p_doctor_id);
$function$;

-- Caller may read an appointment: its patient, or anyone who can operate it.
CREATE OR REPLACE FUNCTION private.can_view_appointment(p_user_id uuid, p_center_id uuid, p_doctor_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT p_user_id = auth.uid() OR private.can_operate_appointment(p_center_id, p_doctor_id);
$function$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Functions that get caller checks (logic otherwise unchanged unless noted)
-- ---------------------------------------------------------------------------

-- Staff of the appointment's center, its doctor, or admin. Not called by the app.
CREATE OR REPLACE FUNCTION public.confirm_appointment(p_appointment_id uuid)
 RETURNS public.appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  target_appointment public.appointments%ROWTYPE;
BEGIN
  SELECT * INTO target_appointment
  FROM public.appointments
  WHERE id = p_appointment_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  IF NOT private.is_server_context()
     AND NOT private.can_operate_appointment(target_appointment.center_id, target_appointment.doctor_id)
  THEN
    RAISE EXCEPTION 'Only staff of this center or the assigned doctor can confirm this appointment'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.appointments
  SET status = 'confirmed'
  WHERE id = p_appointment_id
  RETURNING * INTO target_appointment;

  RETURN target_appointment;
END;
$function$;

-- Staff of the appointment's center, its doctor, or admin. Not called by the app.
CREATE OR REPLACE FUNCTION public.start_service(p_appointment_id uuid)
 RETURNS public.appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  target_appointment public.appointments%ROWTYPE;
BEGIN
  SELECT * INTO target_appointment
  FROM public.appointments
  WHERE id = p_appointment_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  IF NOT private.is_server_context()
     AND NOT private.can_operate_appointment(target_appointment.center_id, target_appointment.doctor_id)
  THEN
    RAISE EXCEPTION 'Only staff of this center or the assigned doctor can start this appointment'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.appointments
  SET status = 'in_progress', started_at = COALESCE(started_at, now()), called_at = COALESCE(called_at, now())
  WHERE id = p_appointment_id
  RETURNING * INTO target_appointment;

  RETURN target_appointment;
END;
$function$;

-- Was: any staff member, of any center. Now: staff of this center, the
-- assigned doctor, or admin.
CREATE OR REPLACE FUNCTION public.call_appointment(p_appointment_id uuid)
 RETURNS public.appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  called_appointment public.appointments%ROWTYPE;
BEGIN
  SELECT * INTO called_appointment
  FROM public.appointments
  WHERE id = p_appointment_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  IF NOT private.is_server_context()
     AND NOT private.can_operate_appointment(called_appointment.center_id, called_appointment.doctor_id)
  THEN
    RAISE EXCEPTION 'Only staff of this center or the assigned doctor can call this appointment'
      USING ERRCODE = '42501';
  END IF;

  IF called_appointment.status NOT IN ('confirmed', 'checked_in', 'pending') THEN
    RAISE EXCEPTION 'Cannot call appointment from status: %', called_appointment.status;
  END IF;

  UPDATE public.appointments
  SET status = 'called', called_at = now()
  WHERE id = p_appointment_id
  RETURNING * INTO called_appointment;

  RETURN called_appointment;
END;
$function$;

-- Bug fix: cancelled_by is a uuid column but was set to the text 'patient', so
-- every call failed (the app then fell back to a direct UPDATE). Now records
-- the cancelling user. Still limited to the appointment's own patient.
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

  IF NOT FOUND OR v_appointment.user_id <> auth.uid() THEN
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

-- Staff of this center or admin.
CREATE OR REPLACE FUNCTION public.set_center_break(p_center_id uuid, p_queue_date date, p_break_start timestamp with time zone, p_break_end timestamp with time zone, p_is_on_break boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_result public.center_queue_settings%ROWTYPE;
BEGIN
  IF NOT private.is_server_context() AND NOT private.can_manage_center(p_center_id) THEN
    RAISE EXCEPTION 'Only staff of this center can change its break'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.center_queue_settings (center_id, appointment_date, break_start, break_end, is_on_break, updated_at)
  VALUES (p_center_id, p_queue_date, p_break_start, p_break_end, p_is_on_break, now())
  ON CONFLICT (center_id, appointment_date)
  DO UPDATE SET break_start = EXCLUDED.break_start, break_end = EXCLUDED.break_end, is_on_break = EXCLUDED.is_on_break, updated_at = now()
  RETURNING * INTO v_result;

  RETURN to_jsonb(v_result);
END;
$function$;

-- Staff of this center or admin.
CREATE OR REPLACE FUNCTION public.update_center_average_consultation_time(p_center_id uuid, p_queue_date date, p_avg_mins numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_result public.center_queue_settings%ROWTYPE;
BEGIN
  IF NOT private.is_server_context() AND NOT private.can_manage_center(p_center_id) THEN
    RAISE EXCEPTION 'Only staff of this center can change its consultation time'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.center_queue_settings (center_id, appointment_date, average_consultation_time, updated_at)
  VALUES (p_center_id, p_queue_date, p_avg_mins, now())
  ON CONFLICT (center_id, appointment_date)
  DO UPDATE SET average_consultation_time = EXCLUDED.average_consultation_time, updated_at = now()
  RETURNING * INTO v_result;

  RETURN to_jsonb(v_result);
END;
$function$;

-- Runs from the sync_live_queue_after_appointment_change trigger on every
-- appointment change (including a patient's own booking), so trigger calls are
-- always allowed. Direct calls: this doctor, staff of their center, or admin.
CREATE OR REPLACE FUNCTION public.refresh_live_queue(p_doctor_id uuid, p_queue_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_current_token integer;
  v_average numeric(10, 2);
  v_is_on_break boolean;
BEGIN
  IF pg_trigger_depth() = 0
     AND NOT private.is_server_context()
     AND NOT private.can_manage_doctor(p_doctor_id)
  THEN
    RAISE EXCEPTION 'Only this doctor or staff of their center can refresh the queue'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.doctor_queue_settings (doctor_id)
  VALUES (p_doctor_id)
  ON CONFLICT (doctor_id) DO NOTHING;

  SELECT
    COALESCE(
      NULLIF(current_token, 0),
      (
        SELECT COALESCE(MAX(token_number), 0)
        FROM public.appointments
        WHERE COALESCE(doctor_id, service_id) = p_doctor_id
          AND appointment_date = p_queue_date
          AND status IN ('called', 'in_progress')
      ),
      0
    ),
    COALESCE(average_consultation_time, 10),
    (
      is_on_break
      OR (
        break_start IS NOT NULL
        AND break_start <= now()
        AND (break_end IS NULL OR break_end > now())
      )
    )
  INTO v_current_token, v_average, v_is_on_break
  FROM public.doctor_queue_settings
  WHERE doctor_id = p_doctor_id;

  INSERT INTO public.queue_updates (
    appointment_id,
    current_position,
    people_ahead,
    estimated_wait_mins,
    current_serving_token,
    status
  )
  SELECT
    appointment.id,
    CASE
      WHEN appointment.status IN ('confirmed', 'checked_in')
        THEN GREATEST(appointment.token_number - v_current_token, 1)
      ELSE 0
    END,
    CASE
      WHEN appointment.status IN ('confirmed', 'checked_in')
        THEN GREATEST(appointment.token_number - v_current_token, 0)
      ELSE 0
    END,
    CASE
      WHEN appointment.status IN ('confirmed', 'checked_in')
        THEN GREATEST(appointment.token_number - v_current_token, 0) * v_average
      ELSE 0
    END::integer,
    v_current_token,
    CASE
      WHEN v_is_on_break THEN 'doctor_on_break'
      WHEN appointment.status IN ('called', 'in_progress') THEN 'called'
      WHEN appointment.status = 'checked_in' THEN 'checked_in'
      WHEN appointment.status = 'confirmed' THEN 'waiting'
      ELSE appointment.status
    END
  FROM public.appointments appointment
  WHERE COALESCE(appointment.doctor_id, appointment.service_id) = p_doctor_id
    AND appointment.appointment_date = p_queue_date
    AND appointment.token_number IS NOT NULL;
END;
$function$;

-- This doctor, staff of their center, or admin. Not called by the app.
CREATE OR REPLACE FUNCTION public.recalculate_doctor_average(p_doctor_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_average numeric(10, 2);
BEGIN
  IF NOT private.is_server_context() AND NOT private.can_manage_doctor(p_doctor_id) THEN
    RAISE EXCEPTION 'Only this doctor or staff of their center can recalculate the average'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(ROUND(AVG(duration_minutes)::numeric, 2), 10.0)
  INTO v_average
  FROM (
    SELECT duration_minutes
    FROM public.appointments
    WHERE doctor_id = p_doctor_id
      AND status = 'completed'
      AND duration_minutes IS NOT NULL
      AND duration_minutes > 0
    ORDER BY completed_at DESC NULLS LAST
    LIMIT 20
  ) recent_completed;

  INSERT INTO public.doctor_queue_settings (doctor_id, average_consultation_time, updated_at)
  VALUES (p_doctor_id, COALESCE(v_average, 10.0), now())
  ON CONFLICT (doctor_id)
  DO UPDATE SET
    average_consultation_time = EXCLUDED.average_consultation_time,
    updated_at = now();

  RETURN COALESCE(v_average, 10.0);
END;
$function$;

-- Server-only (pg_cron in Phase 1D). No client role can execute it, and the
-- check below stops it running inside an app request even if a grant returns.
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

  -- A. Mark confirmed appointments that missed their check-in window as 'no_show'
  -- Grace period: 15 minutes after scheduled_at
  UPDATE public.appointments
  SET
    status = 'no_show',
    notes = CASE
      WHEN notes IS NULL OR notes = '' THEN 'Auto-marked as No-Show: missed 15-min check-in window'
      ELSE notes || E'\n(Auto-marked as No-Show: missed 15-min check-in window)'
    END
  WHERE status = 'confirmed'
    AND scheduled_at < (now() - interval '15 minutes');

  -- B. Mark active/pending appointments past their duration as 'expired'
  -- Duration: service's duration_minutes (default 30 mins) + 15 mins safety buffer
  UPDATE public.appointments
  SET
    status = 'expired',
    notes = CASE
      WHEN notes IS NULL OR notes = '' THEN 'Auto-marked as Expired: time slot passed'
      ELSE notes || E'\n(Auto-marked as Expired: time slot passed)'
    END
  WHERE status IN ('pending', 'confirmed', 'checked_in', 'called', 'in_progress')
    AND scheduled_at < (now() - (COALESCE((SELECT duration_minutes FROM public.services WHERE id = service_id), 30) + 15) * interval '1 minute');
END;
$function$;

-- Staff/admin of the center, a doctor at the center, or a patient with an
-- appointment there that day. Reached from get_appointment_queue_snapshot.
CREATE OR REPLACE FUNCTION public.get_center_queue_snapshot(p_center_id uuid, p_queue_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_settings public.center_queue_settings%ROWTYPE;
  v_current_token integer;
  v_next_token integer;
  v_is_on_break boolean;
BEGIN
  IF NOT private.is_server_context()
     AND NOT private.can_manage_center(p_center_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.doctors d
       WHERE d.center_id = p_center_id AND d.profile_id = auth.uid()
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.appointments a
       WHERE a.center_id = p_center_id AND a.appointment_date = p_queue_date AND a.user_id = auth.uid()
     )
  THEN
    RAISE EXCEPTION 'Not allowed to view this center''s queue'
      USING ERRCODE = '42501';
  END IF;

  -- Ensure settings row exists for the day
  INSERT INTO public.center_queue_settings (center_id, appointment_date)
  VALUES (p_center_id, p_queue_date)
  ON CONFLICT (center_id, appointment_date) DO NOTHING;

  SELECT * INTO v_settings
  FROM public.center_queue_settings
  WHERE center_id = p_center_id AND appointment_date = p_queue_date;

  v_current_token := public.get_current_token(p_center_id, p_queue_date);

  SELECT COALESCE(MAX(token_number), 0) + 1 INTO v_next_token
  FROM public.appointments
  WHERE center_id = p_center_id AND appointment_date = p_queue_date;

  v_is_on_break := COALESCE(v_settings.is_on_break, false)
    OR (v_settings.break_start IS NOT NULL AND v_settings.break_start <= now() AND (v_settings.break_end IS NULL OR v_settings.break_end > now()));

  RETURN jsonb_build_object(
    'center_id', p_center_id,
    'queue_date', p_queue_date,
    'current_token', v_current_token,
    'next_token', v_next_token,
    'doctor_average_time', COALESCE(v_settings.average_consultation_time, 10.0),
    'average_consultation_time', COALESCE(v_settings.average_consultation_time, 10.0),
    'is_on_break', v_is_on_break,
    'break_start', v_settings.break_start,
    'break_end', v_settings.break_end
  );
END;
$function$;

-- This doctor, staff of their center, admin, or a patient with an appointment
-- with this doctor that day (the patient's QueueStatusScreen calls it).
CREATE OR REPLACE FUNCTION public.get_doctor_queue_snapshot(p_doctor_id uuid, p_queue_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_settings public.doctor_queue_settings%ROWTYPE;
  v_current_token integer;
  v_next_token integer;
  v_is_on_break boolean;
BEGIN
  IF NOT private.is_server_context()
     AND NOT private.can_manage_doctor(p_doctor_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.appointments a
       WHERE a.doctor_id = p_doctor_id AND a.appointment_date = p_queue_date AND a.user_id = auth.uid()
     )
  THEN
    RAISE EXCEPTION 'Not allowed to view this doctor''s queue'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.doctor_queue_settings (doctor_id)
  VALUES (p_doctor_id)
  ON CONFLICT (doctor_id) DO NOTHING;

  SELECT * INTO v_settings FROM public.doctor_queue_settings WHERE doctor_id = p_doctor_id;

  SELECT COALESCE(MAX(token_number), 0) INTO v_current_token
  FROM public.appointments
  WHERE doctor_id = p_doctor_id
    AND appointment_date = p_queue_date
    AND status IN ('called', 'in_progress');

  v_current_token := GREATEST(COALESCE(v_settings.current_token, 0), COALESCE(v_current_token, 0));

  SELECT COALESCE(MAX(token_number), 0) + 1 INTO v_next_token
  FROM public.appointments
  WHERE doctor_id = p_doctor_id
    AND appointment_date = p_queue_date;

  v_is_on_break := COALESCE(v_settings.is_on_break, false)
    OR (
      v_settings.break_start IS NOT NULL
      AND v_settings.break_start <= now()
      AND (v_settings.break_end IS NULL OR v_settings.break_end > now())
    );

  RETURN jsonb_build_object(
    'doctor_id', p_doctor_id,
    'queue_date', p_queue_date,
    'current_token', v_current_token,
    'next_token', v_next_token,
    'doctor_average_time', COALESCE(v_settings.average_consultation_time, 10.0),
    'average_consultation_time', COALESCE(v_settings.average_consultation_time, 10.0),
    'is_on_break', v_is_on_break,
    'break_start', v_settings.break_start,
    'break_end', v_settings.break_end
  );
END;
$function$;

-- The appointment's patient, staff of its center, its doctor, or admin.
CREATE OR REPLACE FUNCTION public.get_appointment_queue_snapshot(p_appointment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_appointment public.appointments%ROWTYPE;
  v_queue_snapshot jsonb;
  v_current_token integer;
  v_average numeric(10, 2);
  v_people_ahead integer;
  v_estimated_wait integer;
BEGIN
  SELECT * INTO v_appointment FROM public.appointments WHERE id = p_appointment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Appointment not found'; END IF;

  IF NOT private.is_server_context()
     AND NOT private.can_view_appointment(v_appointment.user_id, v_appointment.center_id, v_appointment.doctor_id)
  THEN
    RAISE EXCEPTION 'Not allowed to view this appointment'
      USING ERRCODE = '42501';
  END IF;

  IF v_appointment.doctor_id IS NOT NULL THEN
    v_queue_snapshot := public.get_doctor_queue_snapshot(v_appointment.doctor_id, v_appointment.appointment_date);
  ELSE
    v_queue_snapshot := public.get_center_queue_snapshot(v_appointment.center_id, v_appointment.appointment_date);
  END IF;

  v_current_token := COALESCE((v_queue_snapshot->>'current_token')::integer, 0);
  v_average := COALESCE((v_queue_snapshot->>'average_consultation_time')::numeric, 10.0);
  v_people_ahead := GREATEST(COALESCE(v_appointment.token_number, 0) - v_current_token, 0);
  v_estimated_wait := CEIL(v_people_ahead * v_average)::integer;

  RETURN v_queue_snapshot || jsonb_build_object(
    'appointment_id', v_appointment.id,
    'your_token', v_appointment.token_number,
    'token_number', v_appointment.token_number,
    'queue_position', CASE WHEN v_appointment.status IN ('confirmed', 'checked_in') THEN GREATEST(v_people_ahead, 1) ELSE 0 END,
    'current_position', CASE WHEN v_appointment.status IN ('confirmed', 'checked_in') THEN GREATEST(v_people_ahead, 1) ELSE 0 END,
    'people_ahead', v_people_ahead,
    'estimated_wait_time', v_estimated_wait,
    'estimated_wait_mins', v_estimated_wait,
    'status', CASE
      WHEN (v_queue_snapshot->>'is_on_break')::boolean THEN 'doctor_on_break'
      WHEN v_appointment.status IN ('called', 'in_progress') THEN 'called'
      WHEN v_appointment.status = 'checked_in' THEN 'checked_in'
      WHEN v_appointment.status = 'confirmed' THEN 'waiting'
      ELSE v_appointment.status
    END
  );
END;
$function$;

-- The appointment's patient, staff of its center, its doctor, or admin.
CREATE OR REPLACE FUNCTION public.people_ahead(p_appointment_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_appointment public.appointments%ROWTYPE;
  v_current_token integer;
BEGIN
  SELECT * INTO v_appointment
  FROM public.appointments
  WHERE id = p_appointment_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF NOT private.is_server_context()
     AND NOT private.can_view_appointment(v_appointment.user_id, v_appointment.center_id, v_appointment.doctor_id)
  THEN
    RAISE EXCEPTION 'Not allowed to view this appointment'
      USING ERRCODE = '42501';
  END IF;

  v_current_token := public.get_current_token(v_appointment.center_id, v_appointment.appointment_date);
  RETURN GREATEST(COALESCE(v_appointment.token_number, 0) - v_current_token, 0);
END;
$function$;

-- Doctor dashboard RPCs: this doctor or admin only.
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
    p.full_name AS patient_name,
    a.appointment_time::text AS appointment_time,
    a.status::text AS status,
    a.token_number::int AS token_number
  FROM public.appointments a
  INNER JOIN public.profiles p ON a.user_id = p.id
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
    SELECT DISTINCT ON (a.user_id)
      p.full_name AS p_name,
      a.appointment_date AS last_date,
      a.status::text AS last_status,
      a.scheduled_at AS sched_at
    FROM public.appointments a
    INNER JOIN public.profiles p ON a.user_id = p.id AND p.role = 'client'
    WHERE a.doctor_id = p_doctor_id
    ORDER BY a.user_id, a.appointment_date DESC, a.scheduled_at DESC
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

CREATE OR REPLACE FUNCTION public.get_doctor_income_summary(p_doctor_id uuid)
 RETURNS TABLE(today_appointments_count bigint, completed_count bigint, total_fee numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT private.is_server_context() AND NOT public.is_admin() AND NOT private.is_doctor_self(p_doctor_id) THEN
    RAISE EXCEPTION 'Only this doctor can view their income'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    COUNT(a.id)::bigint AS today_appointments_count,
    COUNT(CASE WHEN a.status = 'completed' THEN 1 END)::bigint AS completed_count,
    COALESCE(SUM(CASE WHEN a.status = 'completed' THEN d.fee ELSE 0.0 END), 0.0)::numeric AS total_fee
  FROM public.appointments a
  INNER JOIN public.doctors d ON a.doctor_id = d.id
  WHERE a.doctor_id = p_doctor_id
    AND a.appointment_date = CURRENT_DATE;
END;
$function$;

-- Admin analytics: admin only (was callable by anyone, including anon).
CREATE OR REPLACE FUNCTION public.staff_performance(p_range text)
 RETURNS TABLE(staff_name text, completed_count bigint, avg_time_minutes numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_start_date timestamptz;
BEGIN
  IF NOT private.is_server_context() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can view staff performance'
      USING ERRCODE = '42501';
  END IF;

  IF p_range = 'today' THEN
    v_start_date := CURRENT_DATE;
  ELSIF p_range = 'week' THEN
    v_start_date := CURRENT_DATE - INTERVAL '7 days';
  ELSIF p_range = 'month' THEN
    v_start_date := CURRENT_DATE - INTERVAL '30 days';
  ELSE
    v_start_date := '1970-01-01'::timestamptz;
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(d.name, 'Any Available Doctor')::text as staff_name,
    COUNT(a.id)::bigint as completed_count,
    ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM (a.completed_at - a.called_at))::numeric / 60), 0), 2) as avg_time_minutes
  FROM public.appointments a
  LEFT JOIN public.doctors d ON d.id = a.doctor_id
  WHERE a.status = 'completed'
    AND a.called_at IS NOT NULL
    AND a.completed_at IS NOT NULL
    AND a.scheduled_at >= v_start_date
  GROUP BY COALESCE(d.name, 'Any Available Doctor')
  ORDER BY COUNT(a.id) DESC;
END;
$function$;

-- Bug fix: read the weekly schedule from doctor_schedules. The old
-- doctor_availability table was retired (migration
-- fix_doctor_schedule_source_and_retire_duplicate_table), so this RPC failed on
-- every call. Public scheduling info, no caller check.
CREATE OR REPLACE FUNCTION public.get_doctor_availability(p_doctor_id uuid)
 RETURNS TABLE(status text, tokens_ahead integer, estimated_wait_minutes integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_day_of_week int := extract(dow from (now() at time zone 'Asia/Karachi'));
  v_now time := (now() at time zone 'Asia/Karachi')::time;
  v_schedule record;
  v_on_leave boolean;
  v_on_break boolean;
  v_tokens_today int;
  v_avg_consultation_time numeric;
  v_max_tokens int;
BEGIN
  -- 1. Check Leaves
  SELECT EXISTS (
    SELECT 1 FROM public.doctor_leaves
    WHERE doctor_id = p_doctor_id AND leave_date = (CURRENT_DATE at time zone 'Asia/Karachi')::date
  ) INTO v_on_leave;

  IF v_on_leave THEN
    RETURN QUERY SELECT 'on_leave'::text, 0, 0;
    RETURN;
  END IF;

  -- 2. Check Weekly Schedule
  SELECT * INTO v_schedule FROM public.doctor_schedules
  WHERE doctor_id = p_doctor_id AND day_of_week = v_day_of_week;

  IF v_schedule IS NULL OR NOT v_schedule.is_available OR v_now < v_schedule.start_time OR v_now > v_schedule.end_time THEN
    RETURN QUERY SELECT 'not_working'::text, 0, 0;
    RETURN;
  END IF;

  -- 3. Check Break Status (Staff Toggle)
  SELECT is_on_break INTO v_on_break FROM public.doctors WHERE id = p_doctor_id;
  IF v_on_break THEN
    RETURN QUERY SELECT 'on_break'::text, 0, 0;
    RETURN;
  END IF;

  -- 4. Count Today's Active Tokens
  SELECT count(*)::int INTO v_tokens_today FROM public.appointments a
  WHERE a.doctor_id = p_doctor_id
    AND a.appointment_date = (CURRENT_DATE at time zone 'Asia/Karachi')::date
    AND a.status NOT IN ('cancelled');

  -- 5. Calculate Max Tokens (dynamically based on schedule start/end time and slot duration)
  v_max_tokens := COALESCE(NULLIF(((extract(epoch from (v_schedule.end_time::time - v_schedule.start_time::time)) / 60) / COALESCE(v_schedule.slot_duration_minutes, 15))::int, 0), 40);

  -- 6. Check Token Limits
  IF v_tokens_today >= v_max_tokens THEN
    RETURN QUERY SELECT 'fully_booked'::text, 0, 0;
    RETURN;
  END IF;

  -- 7. Resolve average consultation time from doctor settings
  SELECT COALESCE(average_consultation_time, 10.0) INTO v_avg_consultation_time
  FROM public.doctor_queue_settings
  WHERE doctor_id = p_doctor_id;

  IF v_avg_consultation_time IS NULL THEN
    v_avg_consultation_time := 10.0;
  END IF;

  RETURN QUERY
  SELECT
    CASE WHEN v_tokens_today > 15 THEN 'busy'::text ELSE 'available'::text END,
    v_tokens_today,
    (v_tokens_today * v_avg_consultation_time)::integer;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Remaining functions: logic unchanged; schema-qualified for search_path = ''
-- ---------------------------------------------------------------------------

-- public.admin_delete_staff_account(uuid)
CREATE OR REPLACE FUNCTION public.admin_delete_staff_account(staff_profile_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  target_role text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can delete staff accounts';
  END IF;

  SELECT role INTO target_role FROM public.profiles WHERE id = staff_profile_id;

  IF target_role IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF target_role <> 'staff' THEN
    RAISE EXCEPTION 'This function can only delete staff accounts (found role: %)', target_role;
  END IF;

  -- Deleting the auth.users row cascades to delete the profiles row (confirmed FK ON DELETE CASCADE)
  DELETE FROM auth.users WHERE id = staff_profile_id;
END;
$function$
;

-- public.assign_appointment_token_number()
CREATE OR REPLACE FUNCTION public.assign_appointment_token_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_queue_date date;
BEGIN
  v_queue_date := COALESCE(NEW.appointment_date, (NEW.scheduled_at AT TIME ZONE 'UTC')::date, CURRENT_DATE);
  NEW.appointment_date := v_queue_date;
  IF TG_OP = 'INSERT' AND NEW.token_number IS NULL THEN
    IF NEW.doctor_id IS NOT NULL THEN
      -- Advisory lock to serialize token allocation for the specific doctor + date
      PERFORM pg_advisory_xact_lock(hashtext(NEW.doctor_id::text || ':' || v_queue_date::text));
      SELECT COALESCE(MAX(token_number), 0) + 1
      INTO NEW.token_number
      FROM public.appointments
      WHERE doctor_id = NEW.doctor_id
        AND appointment_date = v_queue_date;
    ELSE
      -- Fallback to center-scoped sequence
      IF NEW.center_id IS NULL THEN
        RAISE EXCEPTION 'center_id required';
      END IF;
      NEW.token_number := public.get_next_token(NEW.center_id, v_queue_date);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

-- public.book_appointment(uuid,uuid,text)
CREATE OR REPLACE FUNCTION public.book_appointment(p_lock_id uuid, p_service_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_lock record;
  v_appointment_id uuid;
  v_time time;
begin
  select * into v_lock from public.slot_locks where id = p_lock_id and user_id = auth.uid() and expires_at > now();

  if v_lock is null then
    raise exception 'Lock expired or not found — please pick a slot again';
  end if;

  v_time := to_timestamp(v_lock.appointment_time, 'HH12:MI AM')::time;

  insert into public.appointments (user_id, center_id, service_id, doctor_id, appointment_date, appointment_time, scheduled_at, status, notes)
  values (auth.uid(), v_lock.center_id, p_service_id, v_lock.doctor_id, v_lock.appointment_date, v_time,
          (v_lock.appointment_date + v_time) at time zone 'Asia/Karachi', 'pending', p_notes)
  returning id into v_appointment_id;

  delete from public.slot_locks where id = p_lock_id;

  return v_appointment_id;
end;
$function$
;

-- public.check_in_appointment(uuid)
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

  IF NOT FOUND OR v_appointment.user_id <> auth.uid() THEN
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
$function$
;

-- public.complete_appointment(uuid,integer)
CREATE OR REPLACE FUNCTION public.complete_appointment(p_appointment_id uuid, p_duration_minutes integer DEFAULT NULL::integer)
 RETURNS public.appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  target_appointment public.appointments%ROWTYPE;
  v_duration integer;
BEGIN
  SELECT * INTO target_appointment
  FROM public.appointments
  WHERE id = p_appointment_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.is_admin()
     AND NOT EXISTS (
       SELECT 1
       FROM public.doctors d
       WHERE d.id = target_appointment.doctor_id
         AND d.profile_id = auth.uid()
     )
  THEN
    RAISE EXCEPTION 'Only the assigned doctor can complete this appointment'
      USING ERRCODE = '42501';
  END IF;

  IF p_duration_minutes IS NOT NULL THEN
    v_duration := p_duration_minutes;
  ELSIF target_appointment.started_at IS NOT NULL THEN
    v_duration := GREATEST(1, EXTRACT(EPOCH FROM (now() - target_appointment.started_at))::integer / 60);
  ELSE
    v_duration := 15;
  END IF;

  UPDATE public.appointments
  SET status = 'completed', completed_at = now(), duration_minutes = v_duration
  WHERE id = p_appointment_id
  RETURNING * INTO target_appointment;

  RETURN target_appointment;
END;
$function$
;

-- public.create_doctor_with_account(text,text,text,uuid,text,text,integer,uuid[])
CREATE OR REPLACE FUNCTION public.create_doctor_with_account(p_email text, p_password text, p_full_name text, p_center_id uuid, p_specialty text, p_qualification text, p_experience_years integer, p_service_ids uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
  v_doctor_id uuid;
  v_service_id uuid;
  v_encrypted_pw text;
  v_day_of_week integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can create doctor accounts';
  END IF;

  v_encrypted_pw := extensions.crypt(p_password, extensions.gen_salt('bf', 10));

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    p_email, v_encrypted_pw, now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('full_name', p_full_name, 'role', 'doctor'),
    now(), now(), '', '', '', ''
  ) RETURNING id INTO v_user_id;

  UPDATE public.profiles
  SET role = 'doctor', center_id = p_center_id, updated_at = now()
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile was not created for auth user % by handle_new_user()', v_user_id;
  END IF;

  INSERT INTO public.doctors (
    center_id, name, specialty, qualification, experience_years, bio,
    is_active, is_on_break, profile_id, employee_code, license_number, gender, fee, status
  ) VALUES (
    p_center_id, p_full_name, p_specialty, p_qualification, p_experience_years,
    p_full_name || ' is a qualified specialist with ' || p_experience_years || ' years of experience.',
    true, false, v_user_id,
    'EMP-' || upper(substring(md5(random()::text) from 1 for 5)),
    'LIC-' || upper(substring(md5(random()::text) from 1 for 5)),
    'Male', 50.0, 'active'
  ) RETURNING id INTO v_doctor_id;

  IF p_service_ids IS NOT NULL THEN
    FOREACH v_service_id IN ARRAY p_service_ids LOOP
      INSERT INTO public.doctor_services (doctor_id, service_id) VALUES (v_doctor_id, v_service_id);
    END LOOP;
  END IF;

  INSERT INTO public.doctor_queue_settings (doctor_id, current_token, average_consultation_time, is_on_break)
  VALUES (v_doctor_id, 0, 10.0, false);

  FOR v_day_of_week IN 1..6 LOOP
    INSERT INTO public.doctor_schedules (doctor_id, day_of_week, start_time, end_time, max_tokens_per_day)
    VALUES (v_doctor_id, v_day_of_week, '09:00:00'::time, '17:00:00'::time, 40);
  END LOOP;

  RETURN v_user_id;
END;
$function$
;

-- public.create_notification_on_appointment()
CREATE OR REPLACE FUNCTION public.create_notification_on_appointment()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
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
$function$
;

-- public.create_notification_on_cancel()
CREATE OR REPLACE FUNCTION public.create_notification_on_cancel()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM NEW.status THEN
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
$function$
;

-- public.custom_access_token_hook(jsonb)
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role
  FROM public.profiles
  WHERE id = (event->>'user_id')::uuid;

  event := jsonb_set(event, '{claims,app_role}',
    to_jsonb(COALESCE(user_role, 'client')));
  RETURN event;
END;
$function$
;

-- public.generate_daily_token()
CREATE OR REPLACE FUNCTION public.generate_daily_token()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.token_number IS NULL THEN
    SELECT COALESCE(MAX(token_number), 0) + 1
    INTO NEW.token_number
    FROM public.appointments
    WHERE center_id = NEW.center_id
      AND DATE(scheduled_at) = DATE(NEW.scheduled_at);
  END IF;
  RETURN NEW;
END;
$function$
;

-- public.generate_token_number()
CREATE OR REPLACE FUNCTION public.generate_token_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  SELECT COALESCE(MAX(token_number), 0) + 1
  INTO NEW.token_number
  FROM public.appointments
  WHERE center_id = NEW.center_id
  AND appointment_date = NEW.appointment_date;

  RETURN NEW;
END;
$function$
;

-- public.generate_token_number(uuid)
CREATE OR REPLACE FUNCTION public.generate_token_number(p_center_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    next_token INT;
BEGIN
    SELECT COALESCE(MAX(token_number), 0) + 1
    INTO next_token
    FROM public.appointments
    WHERE center_id = p_center_id
      AND appointment_date = CURRENT_DATE;

    RETURN next_token;
END;
$function$
;

-- public.get_available_slots(uuid,date)
CREATE OR REPLACE FUNCTION public.get_available_slots(p_doctor_id uuid, p_date date)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_day_of_week int := extract(dow from p_date);
  v_schedule record;
  v_all_slots text[] := '{}';
  v_free_slots text[];
  v_cursor time;
begin
  select * into v_schedule from public.doctor_schedules
  where doctor_id = p_doctor_id and day_of_week = v_day_of_week;

  if v_schedule is null then
    return '{}'::text[];
  end if;

  v_cursor := v_schedule.start_time;
  while v_cursor < v_schedule.end_time loop
    v_all_slots := array_append(v_all_slots, to_char(v_cursor, 'HH12:MI AM'));
    v_cursor := v_cursor + (v_schedule.slot_duration_minutes || ' minutes')::interval;
  end loop;

  select coalesce(array_agg(s order by s), '{}') into v_free_slots
  from unnest(v_all_slots) s
  where not exists (
    select 1 from public.appointments a
    where a.doctor_id = p_doctor_id and a.appointment_date = p_date
      and a.status <> 'cancelled'
      and to_char(a.appointment_time, 'HH12:MI AM') = s
  )
  and not exists (
    select 1 from public.slot_locks sl
    where sl.doctor_id = p_doctor_id and sl.appointment_date = p_date
      and sl.appointment_time = s and sl.expires_at > now()
  );

  return v_free_slots;
end;
$function$
;

-- public.get_current_token()
CREATE OR REPLACE FUNCTION public.get_current_token()
 RETURNS integer
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  SELECT COALESCE(MIN(token_number), 0)
  FROM public.appointments
  WHERE status = 'checked_in';
$function$
;

-- public.get_current_token(uuid,date)
CREATE OR REPLACE FUNCTION public.get_current_token(p_center_id uuid, p_queue_date date DEFAULT CURRENT_DATE)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_current_token integer;
  v_settings_token integer;
BEGIN
  IF p_center_id IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Get current token from settings
  SELECT current_token INTO v_settings_token
  FROM public.center_queue_settings
  WHERE center_id = p_center_id AND appointment_date = p_queue_date;

  -- Get current token from highest active appointment status (called/in_progress)
  SELECT COALESCE(MAX(token_number), 0) INTO v_current_token
  FROM public.appointments
  WHERE center_id = p_center_id
    AND appointment_date = p_queue_date
    AND status IN ('called', 'in_progress');
    
  RETURN GREATEST(COALESCE(v_settings_token, 0), COALESCE(v_current_token, 0));
END;
$function$
;

-- public.get_doctor_schedule(uuid)
CREATE OR REPLACE FUNCTION public.get_doctor_schedule(p_doctor_id uuid)
 RETURNS TABLE(day_of_week integer, start_time time without time zone, end_time time without time zone, slot_duration integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  return query
  select ds.day_of_week, ds.start_time, ds.end_time, ds.slot_duration_minutes
  from public.doctor_schedules ds
  where ds.doctor_id = p_doctor_id
  order by ds.day_of_week asc;
end;
$function$
;

-- public.get_doctors_availability_batch(uuid[])
CREATE OR REPLACE FUNCTION public.get_doctors_availability_batch(p_doctor_ids uuid[])
 RETURNS TABLE(doctor_id uuid, status text, tokens_ahead integer, estimated_wait_minutes integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_day_of_week int := extract(dow from (now() at time zone 'Asia/Karachi'));
  v_now time := (now() at time zone 'Asia/Karachi')::time;
begin
  return query
  select
    d.id,
    case
      when dl.leave_date is not null then 'on_leave'
      when ds.doctor_id is null or v_now < ds.start_time or v_now > ds.end_time then 'not_working'
      when d.is_on_break then 'on_break'
      when coalesce(tok.tokens_today,0) >= coalesce(ds.max_tokens_per_day, 999999) then 'fully_booked'
      when coalesce(tok.tokens_today,0) > 15 then 'busy'
      else 'available'
    end,
    coalesce(tok.tokens_today,0),
    (coalesce(tok.tokens_today,0) * coalesce(dqs.average_consultation_time,10.0))::int
  from public.doctors d
  left join public.doctor_schedules ds on ds.doctor_id = d.id and ds.day_of_week = v_day_of_week
  left join public.doctor_leaves dl on dl.doctor_id = d.id and dl.leave_date = current_date
  left join public.doctor_queue_settings dqs on dqs.doctor_id = d.id
  left join (
    select a.doctor_id, count(*)::int as tokens_today
    from public.appointments a
    where a.appointment_date = current_date and a.status not in ('cancelled')
    group by a.doctor_id
  ) tok on tok.doctor_id = d.id
  where d.id = any(p_doctor_ids);
end;
$function$
;

-- public.get_my_staff_context()
CREATE OR REPLACE FUNCTION public.get_my_staff_context()
 RETURNS TABLE(role text, is_doctor boolean, doctor_id uuid)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.role, (d.id is not null), d.id
  from public.profiles p
  left join public.doctors d on d.profile_id = p.id
  where p.id = auth.uid();
$function$
;

-- public.get_nearby_centers(numeric,numeric,numeric)
CREATE OR REPLACE FUNCTION public.get_nearby_centers(p_lat numeric, p_lng numeric, p_radius_km numeric DEFAULT 15)
 RETURNS TABLE(id uuid, name text, address text, city text, latitude numeric, longitude numeric, open_time time without time zone, close_time time without time zone, image_url text, distance_km numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from (
    select
      c.id, c.name, c.address, c.city, c.latitude, c.longitude, c.open_time, c.close_time, c.image_url,
      round((6371 * acos(
        least(1.0, greatest(-1.0,
          cos(radians(p_lat)) * cos(radians(c.latitude)) * cos(radians(c.longitude) - radians(p_lng))
          + sin(radians(p_lat)) * sin(radians(c.latitude))
        ))
      ))::numeric, 1) as distance_km
    from public.service_centers c
    where c.latitude is not null and c.longitude is not null
  ) sub
  where distance_km <= p_radius_km
  order by distance_km asc;
$function$
;

-- public.get_next_token(uuid,date)
CREATE OR REPLACE FUNCTION public.get_next_token(p_center_id uuid, p_appointment_date date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_next_token integer;
BEGIN
  IF p_center_id IS NULL OR p_appointment_date IS NULL THEN
    RAISE EXCEPTION 'center_id and appointment_date required';
  END IF;
  
  -- Advisory lock to serialize token allocation for the specific center + date
  PERFORM pg_advisory_xact_lock(hashtext(p_center_id::text || ':' || p_appointment_date::text));
  
  INSERT INTO public.center_daily_tokens (center_id, appointment_date, last_token_number, updated_at)
  VALUES (p_center_id, p_appointment_date, 1, now())
  ON CONFLICT (center_id, appointment_date)
  DO UPDATE SET last_token_number = public.center_daily_tokens.last_token_number + 1, updated_at = now()
  RETURNING last_token_number INTO v_next_token;
  
  RETURN v_next_token;
END;
$function$
;

-- public.get_user_role()
CREATE OR REPLACE FUNCTION public.get_user_role()
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$function$
;

-- public.handle_new_user()
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    'client',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$
;

-- public.handle_profiles_updated_at()
CREATE OR REPLACE FUNCTION public.handle_profiles_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$function$
;

-- public.is_admin()
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
  );
$function$
;

-- public.is_doctor()
CREATE OR REPLACE FUNCTION public.is_doctor()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'doctor'
  );
$function$
;

-- public.is_staff()
CREATE OR REPLACE FUNCTION public.is_staff()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  RETURN (v_role = 'staff');
END;
$function$
;

-- public.lock_slot(uuid,uuid,date,text)
CREATE OR REPLACE FUNCTION public.lock_slot(p_doctor_id uuid, p_center_id uuid, p_date date, p_time text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_lock_id uuid;
begin
  delete from public.slot_locks where expires_at <= now();

  if exists (
    select 1 from public.appointments
    where doctor_id = p_doctor_id and appointment_date = p_date and status <> 'cancelled'
      and to_char(appointment_time,'HH12:MI AM') = p_time
  ) then
    raise exception 'Slot already booked';
  end if;

  if exists (
    select 1 from public.slot_locks
    where doctor_id = p_doctor_id and appointment_date = p_date and appointment_time = p_time
      and expires_at > now()
  ) then
    raise exception 'Slot currently locked by someone else';
  end if;

  insert into public.slot_locks (user_id, doctor_id, center_id, appointment_date, appointment_time, locked_at, expires_at)
  values (auth.uid(), p_doctor_id, p_center_id, p_date, p_time, now(), now() + interval '10 minutes')
  returning id into v_lock_id;

  return v_lock_id;
end;
$function$
;

-- public.log_appointment_status_change()
CREATE OR REPLACE FUNCTION public.log_appointment_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    -- Log the status change into history
    IF (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status) THEN
        INSERT INTO public.appointment_status_history (appointment_id, status, notes, changed_by)
        VALUES (NEW.id, NEW.status, NEW.notes, auth.uid());
        
        -- Send specific notifications based on the exact status
        IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
            INSERT INTO public.notifications (user_id, type, title, message, data)
            VALUES (NEW.user_id, 'appointment_booked', 'Appointment Booked', 'Your appointment has been successfully booked and is pending confirmation.', jsonb_build_object('appointment_id', NEW.id));
        ELSIF NEW.status = 'confirmed' THEN
            INSERT INTO public.notifications (user_id, type, title, message, data)
            VALUES (NEW.user_id, 'appointment_confirmed', 'Appointment Confirmed', 'Your appointment has been confirmed by the staff.', jsonb_build_object('appointment_id', NEW.id));
        ELSIF NEW.status = 'called' THEN
            INSERT INTO public.notifications (user_id, type, title, message, data)
            VALUES (NEW.user_id, 'token_called', 'Token Called', 'It''s your turn! Please proceed to the counter.', jsonb_build_object('appointment_id', NEW.id));
        ELSIF NEW.status = 'completed' THEN
            INSERT INTO public.notifications (user_id, type, title, message, data)
            VALUES (NEW.user_id, 'appointment_completed', 'Appointment Completed', 'Thank you for visiting. Your appointment is complete.', jsonb_build_object('appointment_id', NEW.id));
        ELSIF NEW.status = 'cancelled' THEN
            INSERT INTO public.notifications (user_id, type, title, message, data)
            VALUES (NEW.user_id, 'appointment_cancelled', 'Appointment Cancelled', 'Your appointment has been cancelled by the staff.', jsonb_build_object('appointment_id', NEW.id));
        END IF;
    END IF;
    RETURN NEW;
END;
$function$
;

-- public.notify_on_cancel()
CREATE OR REPLACE FUNCTION public.notify_on_cancel()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  insert into public.notifications (
    user_id,
    title,
    message,
    appointment_id,
    is_read,
    created_at
  )
  values (
    NEW.user_id,
    'Appointment Cancelled',
    'Your appointment has been cancelled',
    NEW.id,
    false,
    now()
  );

  return NEW;
end;
$function$
;

-- public.people_ahead(integer)
CREATE OR REPLACE FUNCTION public.people_ahead(my_token integer)
 RETURNS integer
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  SELECT COUNT(*)
  FROM public.appointments
  WHERE status = 'checked_in'
  AND token_number < my_token;
$function$
;

-- public.protect_doctor_admin_fields()
CREATE OR REPLACE FUNCTION public.protect_doctor_admin_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    NEW.employee_code := OLD.employee_code;
    NEW.license_number := OLD.license_number;
    NEW.fee := OLD.fee;
    NEW.status := OLD.status;
    NEW.center_id := OLD.center_id;
    NEW.is_active := OLD.is_active;
    NEW.profile_id := OLD.profile_id;
    NEW.name := OLD.name;
    NEW.gender := OLD.gender;
    NEW.experience_years := OLD.experience_years;
  END IF;
  RETURN NEW;
END;
$function$
;

-- public.protect_profile_privileged_fields()
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    NEW.role := OLD.role;
    NEW.center_id := OLD.center_id;
  END IF;
  RETURN NEW;
END;
$function$
;

-- public.queue_appointment_date(date,timestamp with time zone)
CREATE OR REPLACE FUNCTION public.queue_appointment_date(p_appointment_date date, p_scheduled_at timestamp with time zone)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT COALESCE(p_appointment_date, (p_scheduled_at AT TIME ZONE 'UTC')::date);
$function$
;

-- public.release_slot(uuid)
CREATE OR REPLACE FUNCTION public.release_slot(p_lock_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  delete from public.slot_locks where id = p_lock_id and user_id = auth.uid();
$function$
;

-- public.reset_center_tokens()
CREATE OR REPLACE FUNCTION public.reset_center_tokens()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  update public.center_queue_settings
  set current_token = 0,
      today_date = current_date
  where today_date <> current_date;
end;
$function$
;

-- public.set_token_number()
CREATE OR REPLACE FUNCTION public.set_token_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
    IF NEW.token_number IS NULL THEN
        NEW.token_number := public.generate_token_number(NEW.center_id);
    END IF;

    RETURN NEW;
END;
$function$
;

-- public.sync_center_queue_after_appointment_change()
CREATE OR REPLACE FUNCTION public.sync_center_queue_after_appointment_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_queue_date date;
BEGIN
  IF NEW.center_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  v_queue_date := COALESCE(NEW.appointment_date, (NEW.scheduled_at AT TIME ZONE 'UTC')::date, CURRENT_DATE);

  -- Ensure settings row exists
  INSERT INTO public.center_queue_settings (center_id, appointment_date, current_token, updated_at)
  VALUES (NEW.center_id, v_queue_date, COALESCE(NEW.token_number, 0), now())
  ON CONFLICT (center_id, appointment_date) DO NOTHING;

  -- Advance the current token if this appointment was called/in_progress
  IF NEW.status IN ('called', 'in_progress') AND NEW.token_number IS NOT NULL THEN
    UPDATE public.center_queue_settings
    SET current_token = GREATEST(current_token, NEW.token_number), updated_at = now()
    WHERE center_id = NEW.center_id AND appointment_date = v_queue_date;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$
;

-- public.sync_live_queue_after_appointment_change()
CREATE OR REPLACE FUNCTION public.sync_live_queue_after_appointment_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
    AND (
      OLD.center_id IS DISTINCT FROM NEW.center_id
      OR OLD.scheduled_at::date IS DISTINCT FROM NEW.scheduled_at::date
    )
  THEN
    PERFORM public.refresh_live_queue(
      OLD.center_id,
      OLD.scheduled_at::date
    );
  END IF;

  PERFORM public.refresh_live_queue(
    NEW.center_id,
    NEW.scheduled_at::date
  );

  RETURN NEW;
END;
$function$
;

-- public.trigger_queue_notification()
CREATE OR REPLACE FUNCTION public.trigger_queue_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_payload jsonb;
  v_url text;
  v_has_net boolean; -- This variable must be declared here!
BEGIN
  -- Kong Gateway URL for Supabase Edge Functions
  v_url := 'http://kong:8000/functions/v1/send-queue-notification';
  -- Trigger notification on:
  -- 1. INSERT if status is 'confirmed'
  -- 2. UPDATE if status transitions to a new value
  IF (TG_OP = 'INSERT' AND NEW.status = 'confirmed') OR
     (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status)
  THEN
    v_payload := jsonb_build_object(
      'type', TG_OP,
      'table', 'appointments',
      'record', jsonb_build_object(
        'id', NEW.id,
        'user_id', NEW.user_id,
        'status', NEW.status,
        'token_number', NEW.token_number,
        'center_id', NEW.center_id,
        'doctor_id', NEW.doctor_id,
        'appointment_date', NEW.appointment_date,
        'cancelled_by', NEW.cancelled_by,
        'old_status', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END
      )
    );
    -- Check if pg_net is actually installed in the database
    SELECT EXISTS (
      SELECT 1 FROM pg_extension WHERE extname = 'pg_net'
    ) OR EXISTS (
      SELECT 1 FROM pg_namespace WHERE nspname = 'net'
    ) INTO v_has_net;
    IF v_has_net THEN
      BEGIN
        EXECUTE 'SELECT net.http_post(
          url := $1,
          headers := $2,
          body := $3
        )' USING v_url, '{"Content-Type": "application/json"}'::jsonb, v_payload;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to execute net.http_post: %', SQLERRM;
      END;
    ELSE
      RAISE WARNING 'pg_net extension is not enabled in database. Skipping edge function call.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

-- public.update_user_fcm_token(text)
CREATE OR REPLACE FUNCTION public.update_user_fcm_token(p_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.profiles SET fcm_token = p_token, updated_at = now() WHERE id::text = auth.uid()::text;
END; $function$
;

-- public.validate_appointment_status_transition()
CREATE OR REPLACE FUNCTION public.validate_appointment_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  -- If status is not changing, allow it
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Terminal states cannot be changed
  IF OLD.status IN ('completed', 'cancelled', 'expired', 'no_show', 'skipped') THEN
    RAISE EXCEPTION 'Cannot transition from terminal status "%" to "%"', OLD.status, NEW.status;
  END IF;

  -- Validate allowed state transitions
  IF OLD.status = 'pending' THEN
    IF NEW.status NOT IN ('confirmed', 'cancelled', 'expired') THEN
      RAISE EXCEPTION 'Invalid transition from pending to "%"', NEW.status;
    END IF;
  ELSIF OLD.status = 'confirmed' THEN
    IF NEW.status NOT IN ('checked_in', 'called', 'cancelled', 'expired') THEN
      RAISE EXCEPTION 'Invalid transition from confirmed to "%"', NEW.status;
    END IF;
  ELSIF OLD.status = 'checked_in' THEN
    IF NEW.status NOT IN ('called', 'cancelled', 'expired') THEN
      RAISE EXCEPTION 'Invalid transition from checked_in to "%"', NEW.status;
    END IF;
  ELSIF OLD.status = 'called' THEN
    IF NEW.status NOT IN ('in_progress', 'completed', 'no_show', 'cancelled', 'skipped') THEN
      RAISE EXCEPTION 'Invalid transition from called to "%"', NEW.status;
    END IF;
  ELSIF OLD.status = 'in_progress' THEN
    IF NEW.status NOT IN ('completed', 'no_show', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid transition from in_progress to "%"', NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;

-- ---------------------------------------------------------------------------
-- 4. Policies that call is_admin()/is_staff() were granted TO public, so they
--    were also evaluated for anon. After the revokes below anon can no longer
--    execute those helpers, so these policies move to authenticated (their
--    conditions are unchanged; anon never matched them anyway).
-- ---------------------------------------------------------------------------

ALTER POLICY "admin update all appointments" ON public.appointments TO authenticated;
ALTER POLICY "staff and admin view all appointments" ON public.appointments TO authenticated;
ALTER POLICY "staff update appointments except completion" ON public.appointments TO authenticated;
ALTER POLICY "staff and admin modify daily tokens" ON public.center_daily_tokens TO authenticated;
ALTER POLICY "staff read doctors at own center" ON public.doctors TO authenticated;
ALTER POLICY "staff toggle break" ON public.doctors TO authenticated;
ALTER POLICY "admin update all profiles" ON public.profiles TO authenticated;
ALTER POLICY "staff and admin delete queue updates" ON public.queue_updates TO authenticated;
ALTER POLICY "staff and admin update queue updates" ON public.queue_updates TO authenticated;
ALTER POLICY "admin manage services" ON public.services TO authenticated;
ALTER POLICY "admin manage staff_centers" ON public.staff_centers TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. EXECUTE privileges
-- ---------------------------------------------------------------------------

-- New functions should start with no EXECUTE for PUBLIC. Postgres grants
-- EXECUTE to PUBLIC as a *global* default, and a per-schema default can only
-- add to the global ones, never remove from them, so the IN SCHEMA form on its
-- own changes nothing. The global (no IN SCHEMA) statement does the real work.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Start from nothing: no client role can execute any function in public.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- Server-side callers (Edge Functions with the service role key) keep access.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- RLS helpers: policies run them as the querying user.
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;

-- RPCs the app calls (src/**, `supabase.rpc(...)`), all signed-in only.
-- Not granted on purpose: cleanup_stale_appointments (server-only),
-- confirm_appointment, start_service, refresh_live_queue,
-- recalculate_doctor_average, get_center_queue_snapshot, check_in_appointment,
-- get_nearby_centers, update_user_fcm_token, get_user_role, is_doctor: the app
-- doesn't call them directly. Trigger functions never need a grant.
GRANT EXECUTE ON FUNCTION public.admin_delete_staff_account(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.book_appointment(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.call_appointment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_appointment(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_appointment(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_doctor_with_account(text, text, text, uuid, text, text, integer, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_appointment_queue_snapshot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_slots(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_token(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_doctor_availability(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_doctor_income_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_doctor_queue_snapshot(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_doctor_recent_patients(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_doctor_schedule(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_doctor_today_appointments(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_doctors_availability_batch(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_staff_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.lock_slot(uuid, uuid, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.people_ahead(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_slot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_center_break(uuid, date, timestamp with time zone, timestamp with time zone, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_performance(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_center_average_consultation_time(uuid, date, numeric) TO authenticated;

-- The auth hook keeps its existing grant to supabase_auth_admin (untouched above).

notify pgrst, 'reload schema';
