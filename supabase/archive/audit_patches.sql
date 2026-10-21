-- 1. Create Missing Indexes for Performance Optimization
CREATE INDEX IF NOT EXISTS idx_appointments_service_id ON public.appointments(service_id);
CREATE INDEX IF NOT EXISTS idx_profiles_center_id ON public.profiles(center_id);
CREATE INDEX IF NOT EXISTS idx_notifications_appointment_id ON public.notifications(appointment_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_staff_user_id ON public.audit_logs(staff_user_id);

-- 2. Define Helper Functions
CREATE OR REPLACE FUNCTION public.queue_scope_doctor_id(
  p_doctor_id uuid,
  p_service_id uuid,
  p_center_id uuid
)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_doctor_id, p_service_id, p_center_id);
$$;

CREATE OR REPLACE FUNCTION public.queue_appointment_date(
  p_appointment_date date,
  p_scheduled_at timestamptz
)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_appointment_date, (p_scheduled_at AT TIME ZONE 'UTC')::date);
$$;

-- 3. Unified get_current_token (Aligned with p_center_id parameter name)
DROP FUNCTION IF EXISTS public.get_current_token(uuid, date) CASCADE;

CREATE OR REPLACE FUNCTION public.get_current_token(
  p_center_id uuid,
  p_queue_date date DEFAULT CURRENT_DATE
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_token integer;
BEGIN
  -- 1. Check doctor_queue_settings first (handles doctor_id and service_id scopes)
  SELECT current_token INTO v_current_token
  FROM public.doctor_queue_settings
  WHERE doctor_id = p_center_id;
  
  IF FOUND AND v_current_token > 0 THEN
    RETURN v_current_token;
  END IF;

  -- 2. Check center_queue_settings (handles center_id scope)
  SELECT current_token INTO v_current_token
  FROM public.center_queue_settings
  WHERE center_id = p_center_id AND appointment_date = p_queue_date;

  IF FOUND AND v_current_token > 0 THEN
    RETURN v_current_token;
  END IF;

  -- 3. Fallback: scan appointments
  SELECT COALESCE(MAX(token_number), 0) INTO v_current_token
  FROM public.appointments
  WHERE (doctor_id = p_center_id OR service_id = p_center_id OR center_id = p_center_id)
    AND appointment_date = p_queue_date
    AND status IN ('called', 'in_progress');

  RETURN COALESCE(v_current_token, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_token(uuid, date) TO authenticated, anon;

-- 4. Unified get_appointment_queue_snapshot
DROP FUNCTION IF EXISTS public.get_appointment_queue_snapshot(uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.get_appointment_queue_snapshot(
  p_appointment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appointment public.appointments%ROWTYPE;
  v_scope_id uuid;
  v_queue_date date;
  v_current_token integer;
  v_next_token integer;
  
  v_doctor_avg numeric(10,2);
  v_center_avg numeric(10,2);
  v_average numeric(10,2);
  
  v_doctor_break boolean := false;
  v_center_break boolean := false;
  v_is_on_break boolean := false;
  
  v_break_start timestamptz;
  v_break_end timestamptz;
  
  v_people_ahead integer;
  v_estimated_wait integer;
BEGIN
  SELECT * INTO v_appointment
  FROM public.appointments
  WHERE id = p_appointment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  v_scope_id := public.queue_scope_doctor_id(
    v_appointment.doctor_id,
    v_appointment.service_id,
    v_appointment.center_id
  );
  v_queue_date := public.queue_appointment_date(
    v_appointment.appointment_date,
    v_appointment.scheduled_at
  );

  v_current_token := public.get_current_token(v_scope_id, v_queue_date);

  SELECT COALESCE(MAX(token_number), 0) + 1 INTO v_next_token
  FROM public.appointments
  WHERE (doctor_id = v_scope_id OR service_id = v_scope_id OR center_id = v_scope_id)
    AND appointment_date = v_queue_date;

  SELECT average_consultation_time INTO v_doctor_avg
  FROM public.doctor_queue_settings
  WHERE doctor_id = v_scope_id;

  SELECT average_consultation_time INTO v_center_avg
  FROM public.center_queue_settings
  WHERE center_id = v_appointment.center_id AND appointment_date = v_queue_date;

  v_average := COALESCE(v_doctor_avg, v_center_avg, 10.0);

  SELECT 
    (is_on_break OR (break_start IS NOT NULL AND break_start <= now() AND (break_end IS NULL OR break_end > now()))),
    break_start,
    break_end
  INTO v_doctor_break, v_break_start, v_break_end
  FROM public.doctor_queue_settings
  WHERE doctor_id = v_scope_id;

  SELECT 
    (is_on_break OR (break_start IS NOT NULL AND break_start <= now() AND (break_end IS NULL OR break_end > now()))),
    COALESCE(v_break_start, break_start),
    COALESCE(v_break_end, break_end)
  INTO v_center_break, v_break_start, v_break_end
  FROM public.center_queue_settings
  WHERE center_id = v_appointment.center_id AND appointment_date = v_queue_date;

  v_is_on_break := COALESCE(v_doctor_break, false) OR COALESCE(v_center_break, false);

  v_people_ahead := GREATEST(COALESCE(v_appointment.token_number, 0) - v_current_token, 0);
  v_estimated_wait := CEIL(v_people_ahead * v_average)::integer;

  RETURN jsonb_build_object(
    'appointment_id', v_appointment.id,
    'queue_date', v_queue_date,
    'current_token', v_current_token,
    'next_token', v_next_token,
    'your_token', v_appointment.token_number,
    'token_number', v_appointment.token_number,
    'queue_position', CASE WHEN v_appointment.status IN ('confirmed', 'checked_in') THEN GREATEST(v_people_ahead, 1) ELSE 0 END,
    'current_position', CASE WHEN v_appointment.status IN ('confirmed', 'checked_in') THEN GREATEST(v_people_ahead, 1) ELSE 0 END,
    'people_ahead', v_people_ahead,
    'estimated_wait_time', v_estimated_wait,
    'estimated_wait_mins', v_estimated_wait,
    'doctor_average_time', v_average,
    'average_consultation_time', v_average,
    'is_on_break', v_is_on_break,
    'break_start', v_break_start,
    'break_end', v_break_end,
    'status', CASE
      WHEN v_is_on_break THEN 'doctor_on_break'
      WHEN v_appointment.status IN ('called', 'in_progress') THEN 'called'
      WHEN v_appointment.status = 'checked_in' THEN 'checked_in'
      WHEN v_appointment.status = 'confirmed' THEN 'waiting'
      ELSE v_appointment.status
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_appointment_queue_snapshot(uuid) TO authenticated, anon;

-- 5. Unified refresh_live_queue
DROP FUNCTION IF EXISTS public.refresh_live_queue(uuid, date) CASCADE;

CREATE OR REPLACE FUNCTION public.refresh_live_queue(
  p_scope_id uuid,
  p_queue_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_token integer;
  v_average numeric(10,2);
  v_doctor_break boolean := false;
  v_center_break boolean := false;
  v_is_on_break boolean := false;
BEGIN
  v_current_token := public.get_current_token(p_scope_id, p_queue_date);

  SELECT average_consultation_time INTO v_average
  FROM public.doctor_queue_settings
  WHERE doctor_id = p_scope_id;

  IF v_average IS NULL THEN
    SELECT average_consultation_time INTO v_average
    FROM public.center_queue_settings
    WHERE center_id = p_scope_id AND appointment_date = p_queue_date;
  END IF;

  v_average := COALESCE(v_average, 10.0);

  SELECT 
    (is_on_break OR (break_start IS NOT NULL AND break_start <= now() AND (break_end IS NULL OR break_end > now())))
  INTO v_doctor_break
  FROM public.doctor_queue_settings
  WHERE doctor_id = p_scope_id;

  SELECT 
    (is_on_break OR (break_start IS NOT NULL AND break_start <= now() AND (break_end IS NULL OR break_end > now())))
  INTO v_center_break
  FROM public.center_queue_settings
  WHERE center_id = p_scope_id AND appointment_date = p_queue_date;

  v_is_on_break := COALESCE(v_doctor_break, false) OR COALESCE(v_center_break, false);

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
  WHERE (appointment.doctor_id = p_scope_id OR appointment.service_id = p_scope_id OR appointment.center_id = p_scope_id)
    AND appointment.appointment_date = p_queue_date
    AND appointment.token_number IS NOT NULL
  ON CONFLICT (appointment_id)
  DO UPDATE SET
    current_position = EXCLUDED.current_position,
    people_ahead = EXCLUDED.people_ahead,
    estimated_wait_mins = EXCLUDED.estimated_wait_mins,
    current_serving_token = EXCLUDED.current_serving_token,
    status = EXCLUDED.status,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_live_queue(uuid, date) TO authenticated, anon;

-- 6. Secure center_queue_settings RLS Policies
DROP POLICY IF EXISTS "Staff and admin modify settings" ON public.center_queue_settings;

CREATE POLICY "Staff and admin modify settings" ON public.center_queue_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('staff', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('staff', 'admin')
    )
  );

-- 7. Re-create the appointments_full view
DROP VIEW IF EXISTS public.appointments_full;

CREATE VIEW public.appointments_full
WITH (security_invoker = true)
AS
WITH latest_queue_updates AS (
  SELECT DISTINCT ON (queue_updates.appointment_id)
    queue_updates.appointment_id,
    queue_updates.current_position,
    queue_updates.people_ahead,
    queue_updates.estimated_wait_mins,
    queue_updates.current_serving_token,
    queue_updates.status AS queue_status
  FROM public.queue_updates
  ORDER BY queue_updates.appointment_id, queue_updates.created_at DESC
)
SELECT
  appointments.id,
  appointments.user_id,
  profiles.full_name AS patient_name,
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
  COALESCE(
    latest_queue_updates.estimated_wait_mins,
    appointments.estimated_wait_mins
  ) AS estimated_wait_mins,
  COALESCE(
    latest_queue_updates.estimated_wait_mins,
    appointments.estimated_wait_mins
  ) AS estimated_wait_time,
  latest_queue_updates.current_position,
  latest_queue_updates.current_position AS queue_position,
  latest_queue_updates.people_ahead,
  latest_queue_updates.queue_status,
  latest_queue_updates.current_serving_token,
  latest_queue_updates.current_serving_token AS current_token,
  COALESCE(
    doctor_queue_settings.average_consultation_time,
    center_queue_settings.average_consultation_time,
    10.0
  ) AS doctor_average_time,
  COALESCE(
    doctor_queue_settings.average_consultation_time,
    center_queue_settings.average_consultation_time,
    10.0
  ) AS average_consultation_time,
  (
    COALESCE(doctor_queue_settings.is_on_break, false)
    OR (
      doctor_queue_settings.break_start IS NOT NULL
      AND doctor_queue_settings.break_start <= now()
      AND (
        doctor_queue_settings.break_end IS NULL
        OR doctor_queue_settings.break_end > now()
      )
    )
    OR COALESCE(center_queue_settings.is_on_break, false)
    OR (
      center_queue_settings.break_start IS NOT NULL
      AND center_queue_settings.break_start <= now()
      AND (
        center_queue_settings.break_end IS NULL
        OR center_queue_settings.break_end > now()
      )
    )
  ) AS is_on_break,
  COALESCE(doctor_queue_settings.break_start, center_queue_settings.break_start) AS break_start,
  COALESCE(doctor_queue_settings.break_end, center_queue_settings.break_end) AS break_end
FROM public.appointments
LEFT JOIN public.profiles
  ON profiles.id = appointments.user_id
LEFT JOIN public.service_centers
  ON service_centers.id = appointments.center_id
LEFT JOIN public.services
  ON services.id = appointments.service_id
LEFT JOIN public.doctors
  ON doctors.id = appointments.doctor_id
LEFT JOIN latest_queue_updates
  ON latest_queue_updates.appointment_id = appointments.id
LEFT JOIN public.doctor_queue_settings
  ON doctor_queue_settings.doctor_id = COALESCE(appointments.doctor_id, appointments.service_id)
LEFT JOIN public.center_queue_settings
  ON center_queue_settings.center_id = appointments.center_id
  AND center_queue_settings.appointment_date = appointments.appointment_date;

GRANT SELECT ON public.appointments_full TO authenticated;
