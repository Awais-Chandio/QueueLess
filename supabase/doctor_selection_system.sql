-- Migration script for QueueLess Phase A + B

-- ====================================================================
-- PHASE A: Add on_duty_note text to services table
-- ====================================================================
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS on_duty_note text;

COMMENT ON COLUMN public.services.on_duty_note IS 'Optional message from the on-duty doctor or general notes about the department availability.';

-- ====================================================================
-- PHASE B: Create doctors table and configure RLS
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.doctors (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  specialization text,
  photo_url text,
  service_id uuid REFERENCES public.services(id) ON DELETE CASCADE,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access to authenticated users" ON public.doctors;
CREATE POLICY "Allow read access to authenticated users" ON public.doctors
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow all access to admin users" ON public.doctors;
CREATE POLICY "Allow all access to admin users" ON public.doctors
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- ====================================================================
-- PHASE B: Add FK constraint from appointments.doctor_id to doctors.id
-- ====================================================================
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_doctor_id_fkey,
  ADD CONSTRAINT appointments_doctor_id_fkey
  FOREIGN KEY (doctor_id) REFERENCES public.doctors(id) ON DELETE SET NULL;

-- ====================================================================
-- PHASE B: Update trigger function for assigning token number
-- ====================================================================
CREATE OR REPLACE FUNCTION public.assign_appointment_token_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_doctor_id uuid;
  v_queue_date date;
BEGIN
  -- Determine queue scoping: doctor UUID if selected, otherwise service UUID
  v_doctor_id := public.queue_scope_doctor_id(
    NEW.doctor_id,
    NEW.service_id,
    NEW.center_id
  );
  v_queue_date := public.queue_appointment_date(
    NEW.appointment_date,
    NEW.scheduled_at
  );

  -- IMPORTANT: Do not overwrite NEW.doctor_id column with service_id anymore.
  -- This preserves NULL for unassigned / Any Available Doctor tokens.
  NEW.appointment_date := v_queue_date;

  INSERT INTO public.doctor_queue_settings (doctor_id)
  VALUES (v_doctor_id)
  ON CONFLICT (doctor_id) DO NOTHING;

  IF TG_OP = 'INSERT' AND NEW.token_number IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(v_doctor_id::text || ':' || v_queue_date::text));

    SELECT COALESCE(MAX(token_number), 0) + 1
    INTO NEW.token_number
    FROM public.appointments
    WHERE COALESCE(doctor_id, service_id) = v_doctor_id
      AND appointment_date = v_queue_date;
  END IF;

  RETURN NEW;
END;
$$;

-- ====================================================================
-- PHASE B: Update live queue tracking and stats calculations
-- ====================================================================
CREATE OR REPLACE FUNCTION public.refresh_live_queue(
  p_doctor_id uuid,
  p_queue_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_token integer;
  v_average numeric(10, 2);
  v_is_on_break boolean;
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION public.recalculate_doctor_average(
  p_doctor_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_average numeric(10, 2);
BEGIN
  SELECT COALESCE(ROUND(AVG(duration_minutes)::numeric, 2), 10)
  INTO v_average
  FROM (
    SELECT duration_minutes
    FROM public.appointments
    WHERE COALESCE(doctor_id, service_id) = p_doctor_id
      AND status = 'completed'
      AND duration_minutes IS NOT NULL
      AND duration_minutes > 0
    ORDER BY completed_at DESC NULLS LAST
    LIMIT 20
  ) recent_completed;

  INSERT INTO public.doctor_queue_settings (
    doctor_id,
    average_consultation_time,
    updated_at
  )
  VALUES (
    p_doctor_id,
    COALESCE(v_average, 10),
    now()
  )
  ON CONFLICT (doctor_id)
  DO UPDATE SET
    average_consultation_time = EXCLUDED.average_consultation_time,
    updated_at = now();

  RETURN COALESCE(v_average, 10);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_doctor_queue_snapshot(
  p_doctor_id uuid,
  p_queue_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.doctor_queue_settings%ROWTYPE;
  v_current_token integer;
  v_next_token integer;
  v_is_on_break boolean;
BEGIN
  INSERT INTO public.doctor_queue_settings (doctor_id)
  VALUES (p_doctor_id)
  ON CONFLICT (doctor_id) DO NOTHING;

  SELECT *
  INTO v_settings
  FROM public.doctor_queue_settings
  WHERE doctor_id = p_doctor_id;

  SELECT COALESCE(MAX(token_number), 0)
  INTO v_current_token
  FROM public.appointments
  WHERE COALESCE(doctor_id, service_id) = p_doctor_id
    AND appointment_date = p_queue_date
    AND status IN ('called', 'in_progress');

  v_current_token := GREATEST(COALESCE(v_settings.current_token, 0), COALESCE(v_current_token, 0));

  SELECT COALESCE(MAX(token_number), 0) + 1
  INTO v_next_token
  FROM public.appointments
  WHERE COALESCE(doctor_id, service_id) = p_doctor_id
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
    'doctor_average_time', COALESCE(v_settings.average_consultation_time, 10),
    'average_consultation_time', COALESCE(v_settings.average_consultation_time, 10),
    'is_on_break', v_is_on_break,
    'break_start', v_settings.break_start,
    'break_end', v_settings.break_end
  );
END;
$$;

-- ====================================================================
-- PHASE B: Re-create the appointments_full view including doctor_name
-- ====================================================================
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
  doctor_queue_settings.average_consultation_time AS doctor_average_time,
  doctor_queue_settings.average_consultation_time,
  (
    doctor_queue_settings.is_on_break
    OR (
      doctor_queue_settings.break_start IS NOT NULL
      AND doctor_queue_settings.break_start <= now()
      AND (
        doctor_queue_settings.break_end IS NULL
        OR doctor_queue_settings.break_end > now()
      )
    )
  ) AS is_on_break,
  doctor_queue_settings.break_start,
  doctor_queue_settings.break_end
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
  ON doctor_queue_settings.doctor_id = COALESCE(appointments.doctor_id, appointments.service_id);

GRANT SELECT ON public.appointments_full TO authenticated;

-- ====================================================================
-- PHASE B: Update staff performance analytics function
-- ====================================================================
CREATE OR REPLACE FUNCTION public.staff_performance(p_range text)
RETURNS TABLE(staff_name text, completed_count bigint, avg_time_minutes numeric)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start_date timestamptz;
BEGIN
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
$$;

NOTIFY pgrst, 'reload schema';
