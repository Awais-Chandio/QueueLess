-- Migration Script: Doctor Selection and Availability System
-- Run this script in the Supabase Dashboard SQL Editor.

-- Drop existing tables/functions/views to ensure clean installation
DROP VIEW IF EXISTS public.appointments_full;
ALTER TABLE IF EXISTS public.appointments DROP CONSTRAINT IF EXISTS appointments_doctor_id_fkey;
DROP TABLE IF EXISTS public.doctor_leaves CASCADE;
DROP TABLE IF EXISTS public.doctor_schedules CASCADE;
DROP TABLE IF EXISTS public.doctor_services CASCADE;
DROP TABLE IF EXISTS public.doctors CASCADE;

-- 1. Doctor Profile Table
CREATE TABLE public.doctors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.service_centers(id) ON DELETE CASCADE,
  name text NOT NULL,
  specialty text NOT NULL,
  qualification text,
  experience_years int NOT NULL DEFAULT 0,
  photo_url text,
  bio text,
  is_active boolean NOT NULL DEFAULT true,
  is_on_break boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Doctor <-> Service Mapping
CREATE TABLE public.doctor_services (
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  PRIMARY KEY (doctor_id, service_id)
);

-- 3. Doctor Schedules
CREATE TABLE public.doctor_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0 = Sunday
  start_time time NOT NULL,
  end_time time NOT NULL,
  max_tokens_per_day int NOT NULL DEFAULT 40,
  UNIQUE (doctor_id, day_of_week)
);

-- 4. Doctor Leaves
CREATE TABLE public.doctor_leaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  leave_date date NOT NULL,
  reason text,
  UNIQUE (doctor_id, leave_date)
);

-- 5. Appointments Table Updates
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS doctor_id uuid;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_date ON public.appointments (doctor_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_created_at ON public.appointments (doctor_id, created_at);

-- 6. Doctor Queue Settings
CREATE TABLE IF NOT EXISTS public.doctor_queue_settings (
  doctor_id uuid PRIMARY KEY REFERENCES public.doctors(id) ON DELETE CASCADE,
  current_token integer DEFAULT 0 NOT NULL,
  average_consultation_time numeric(10, 2) DEFAULT 10.0 NOT NULL,
  break_start timestamptz,
  break_end timestamptz,
  is_on_break boolean DEFAULT false NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- 7. Recalculate Doctor Average Time Function
CREATE OR REPLACE FUNCTION public.recalculate_doctor_average(p_doctor_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_average numeric(10, 2);
BEGIN
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
$$;

-- 8. Doctor Queue Snapshot Function
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
$$;

-- 9. Doctor Availability Function
CREATE OR REPLACE FUNCTION public.get_doctor_availability(p_doctor_id uuid)
RETURNS table (
  status text,
  tokens_ahead int,
  estimated_wait_minutes int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day_of_week int := extract(dow from now());
  v_now time := now()::time;
  v_schedule record;
  v_on_leave boolean;
  v_on_break boolean;
  v_tokens_today int;
  v_avg_consultation_time numeric;
BEGIN
  -- 1. Check Leaves
  SELECT EXISTS (
    SELECT 1 FROM public.doctor_leaves
    WHERE doctor_id = p_doctor_id AND leave_date = CURRENT_DATE
  ) INTO v_on_leave;

  IF v_on_leave THEN
    RETURN QUERY SELECT 'on_leave'::text, 0, 0;
    RETURN;
  END IF;

  -- 2. Check Weekly Schedule
  SELECT * INTO v_schedule FROM public.doctor_schedules
  WHERE doctor_id = p_doctor_id AND day_of_week = v_day_of_week;

  IF v_schedule IS NULL OR v_now < v_schedule.start_time OR v_now > v_schedule.end_time THEN
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
    AND a.appointment_date = CURRENT_DATE
    AND a.status NOT IN ('cancelled');

  -- 5. Check Token Limits
  IF v_tokens_today >= v_schedule.max_tokens_per_day THEN
    RETURN QUERY SELECT 'fully_booked'::text, 0, 0;
    RETURN;
  END IF;

  -- 6. Resolve average consultation time from doctor settings
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
$$;

-- 10. Unified get_appointment_queue_snapshot Function
CREATE OR REPLACE FUNCTION public.get_appointment_queue_snapshot(p_appointment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- 11. Overload/Update assign_appointment_token_number Trigger Function
CREATE OR REPLACE FUNCTION public.assign_appointment_token_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Ensure trigger is registered
DROP TRIGGER IF EXISTS assign_appointment_token_number_trigger ON public.appointments;
CREATE TRIGGER assign_appointment_token_number_trigger
  BEFORE INSERT OR UPDATE OF center_id, scheduled_at, appointment_date, token_number, doctor_id
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_appointment_token_number();

-- 12. Re-create appointments_full view with dynamic doctor/center queue mappings
CREATE OR REPLACE VIEW public.appointments_full
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
  -- Average Consultation Time Scoping
  COALESCE(
    CASE
      WHEN appointments.doctor_id IS NOT NULL THEN doctor_queue_settings.average_consultation_time
      ELSE center_queue_settings.average_consultation_time
    END,
    10.0
  ) AS doctor_average_time,
  COALESCE(
    CASE
      WHEN appointments.doctor_id IS NOT NULL THEN doctor_queue_settings.average_consultation_time
      ELSE center_queue_settings.average_consultation_time
    END,
    10.0
  ) AS average_consultation_time,
  -- Break Status Scoping
  (
    CASE
      WHEN appointments.doctor_id IS NOT NULL THEN (
        COALESCE(doctor_queue_settings.is_on_break, false)
        OR (
          doctor_queue_settings.break_start IS NOT NULL
          AND doctor_queue_settings.break_start <= now()
          AND (
            doctor_queue_settings.break_end IS NULL
            OR doctor_queue_settings.break_end > now()
          )
        )
      )
      ELSE (
        COALESCE(center_queue_settings.is_on_break, false)
        OR (
          center_queue_settings.break_start IS NOT NULL
          AND center_queue_settings.break_start <= now()
          AND (
            center_queue_settings.break_end IS NULL
            OR center_queue_settings.break_end > now()
          )
        )
      )
    END
  ) AS is_on_break,
  CASE
    WHEN appointments.doctor_id IS NOT NULL THEN doctor_queue_settings.break_start
    ELSE center_queue_settings.break_start
  END AS break_start,
  CASE
    WHEN appointments.doctor_id IS NOT NULL THEN doctor_queue_settings.break_end
    ELSE center_queue_settings.break_end
  END AS break_end
FROM public.appointments
LEFT JOIN public.profiles ON profiles.id = appointments.user_id
LEFT JOIN public.service_centers ON service_centers.id = appointments.center_id
LEFT JOIN public.services ON services.id = appointments.service_id
LEFT JOIN public.doctors ON doctors.id = appointments.doctor_id
LEFT JOIN latest_queue_updates ON latest_queue_updates.appointment_id = appointments.id
LEFT JOIN public.center_queue_settings ON center_queue_settings.center_id = appointments.center_id
  AND center_queue_settings.appointment_date = appointments.appointment_date
LEFT JOIN public.doctor_queue_settings ON doctor_queue_settings.doctor_id = appointments.doctor_id;

GRANT SELECT ON public.appointments_full TO authenticated;

-- 13. Enable Row Level Security (RLS) on all tables
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_leaves ENABLE ROW LEVEL SECURITY;

-- 14. Row Level Security Policies
-- Clients: read-only, active doctors only
CREATE POLICY "clients read active doctors" ON public.doctors
  FOR SELECT USING (is_active = true);

CREATE POLICY "clients read doctor_services" ON public.doctor_services
  FOR SELECT USING (true);

CREATE POLICY "clients read doctor_schedules" ON public.doctor_schedules
  FOR SELECT USING (true);

CREATE POLICY "clients read doctor_leaves" ON public.doctor_leaves
  FOR SELECT USING (true);

-- Admin: full CRUD (using JWT app_role)
CREATE POLICY "admin manage doctors" ON public.doctors
  FOR ALL USING (auth.jwt() ->> 'app_role' = 'admin');

CREATE POLICY "admin manage doctor_services" ON public.doctor_services
  FOR ALL USING (auth.jwt() ->> 'app_role' = 'admin');

CREATE POLICY "admin manage doctor_schedules" ON public.doctor_schedules
  FOR ALL USING (auth.jwt() ->> 'app_role' = 'admin');

CREATE POLICY "admin manage doctor_leaves" ON public.doctor_leaves
  FOR ALL USING (auth.jwt() ->> 'app_role' = 'admin');

-- Staff: can toggle their center's doctors' break status
CREATE POLICY "staff toggle break" ON public.doctors
  FOR UPDATE
  USING (
    auth.jwt() ->> 'app_role' = 'staff'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.center_id = doctors.center_id
    )
  )
  WITH CHECK (
    auth.jwt() ->> 'app_role' = 'staff'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.center_id = doctors.center_id
    )
  );

-- 15. Supabase Realtime Publication configuration
-- Safe block to add the doctors table to Realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'doctors'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.doctors;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
