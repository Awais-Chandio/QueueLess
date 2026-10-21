-- QueueLess Queue System Refactor: Doctor/Global to Center + Date Scoped Queues
-- This script migrates existing data and refactors queue stored procedures.

-- 1. Drop identity constraint if exists to allow manual update/trigger assignment
ALTER TABLE public.appointments ALTER COLUMN token_number DROP IDENTITY IF EXISTS;

-- 2. Ensure all existing appointments have a valid appointment_date
UPDATE public.appointments
SET appointment_date = (scheduled_at AT TIME ZONE 'UTC')::date
WHERE appointment_date IS NULL;

-- 3. Deduplicate token numbers per (center_id, appointment_date)
UPDATE public.appointments
SET token_number = s.new_token
FROM (
  SELECT id,
         row_number() OVER (
           PARTITION BY center_id, appointment_date 
           ORDER BY COALESCE(token_number, 0), created_at
         ) as new_token
  FROM public.appointments
) s
WHERE public.appointments.id = s.id;

-- 4. Add UNIQUE constraint to prevent duplicate token numbers per center and appointment date
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS unique_center_date_token,
  ADD CONSTRAINT unique_center_date_token UNIQUE (center_id, appointment_date, token_number);

-- 5. Create center_queue_settings table to maintain state per center and date
CREATE TABLE IF NOT EXISTS public.center_queue_settings (
  center_id uuid NOT NULL REFERENCES public.service_centers(id) ON DELETE CASCADE,
  appointment_date date NOT NULL,
  is_on_break boolean DEFAULT false,
  break_start timestamptz,
  break_end timestamptz,
  current_token integer DEFAULT 0,
  average_consultation_time numeric(10,2) DEFAULT 10.0,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (center_id, appointment_date)
);

-- Enable RLS and add basic select/update policies for authenticated users
ALTER TABLE public.center_queue_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can select center settings" ON public.center_queue_settings;
CREATE POLICY "Authenticated users can select center settings"
  ON public.center_queue_settings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can update center settings" ON public.center_queue_settings;
CREATE POLICY "Authenticated users can update center settings"
  ON public.center_queue_settings FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 5. Stored Procedures and Triggers Refactor

-- Helper: recalculate center average consultation time
CREATE OR REPLACE FUNCTION public.recalculate_center_average(
  p_center_id uuid,
  p_queue_date date
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
    WHERE center_id = p_center_id
      AND status = 'completed'
      AND duration_minutes IS NOT NULL
      AND duration_minutes > 0
    ORDER BY completed_at DESC NULLS LAST
    LIMIT 20
  ) recent_completed;

  INSERT INTO public.center_queue_settings (
    center_id,
    appointment_date,
    average_consultation_time,
    updated_at
  )
  VALUES (
    p_center_id,
    p_queue_date,
    COALESCE(v_average, 10),
    now()
  )
  ON CONFLICT (center_id, appointment_date)
  DO UPDATE SET
    average_consultation_time = EXCLUDED.average_consultation_time,
    updated_at = now();

  RETURN COALESCE(v_average, 10);
END;
$$;

-- Stored Procedure: Set center break
CREATE OR REPLACE FUNCTION public.set_center_break(
  p_center_id uuid,
  p_queue_date date,
  p_break_start timestamptz,
  p_break_end timestamptz,
  p_is_on_break boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result public.center_queue_settings%ROWTYPE;
BEGIN
  INSERT INTO public.center_queue_settings (
    center_id,
    appointment_date,
    break_start,
    break_end,
    is_on_break,
    updated_at
  )
  VALUES (
    p_center_id,
    p_queue_date,
    p_break_start,
    p_break_end,
    p_is_on_break,
    now()
  )
  ON CONFLICT (center_id, appointment_date)
  DO UPDATE SET
    break_start = EXCLUDED.break_start,
    break_end = EXCLUDED.break_end,
    is_on_break = EXCLUDED.is_on_break,
    updated_at = now()
  RETURNING *
  INTO v_result;

  RETURN to_jsonb(v_result);
END;
$$;

-- Stored Procedure: Get center queue snapshot
CREATE OR REPLACE FUNCTION public.get_center_queue_snapshot(
  p_center_id uuid,
  p_queue_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.center_queue_settings%ROWTYPE;
  v_current_token integer;
  v_next_token integer;
  v_is_on_break boolean;
BEGIN
  INSERT INTO public.center_queue_settings (center_id, appointment_date)
  VALUES (p_center_id, p_queue_date)
  ON CONFLICT (center_id, appointment_date) DO NOTHING;

  SELECT *
  INTO v_settings
  FROM public.center_queue_settings
  WHERE center_id = p_center_id
    AND appointment_date = p_queue_date;

  SELECT COALESCE(MAX(token_number), 0)
  INTO v_current_token
  FROM public.appointments
  WHERE center_id = p_center_id
    AND appointment_date = p_queue_date
    AND status IN ('called', 'in_progress');

  v_current_token := GREATEST(COALESCE(v_settings.current_token, 0), COALESCE(v_current_token, 0));

  SELECT COALESCE(MAX(token_number), 0) + 1
  INTO v_next_token
  FROM public.appointments
  WHERE center_id = p_center_id
    AND appointment_date = p_queue_date;

  v_is_on_break := COALESCE(v_settings.is_on_break, false)
    OR (
      v_settings.break_start IS NOT NULL
      AND v_settings.break_start <= now()
      AND (v_settings.break_end IS NULL OR v_settings.break_end > now())
    );

  RETURN jsonb_build_object(
    'center_id', p_center_id,
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

-- Stored Procedure: Refresh live queue positions
CREATE OR REPLACE FUNCTION public.refresh_live_queue(
  p_center_id uuid,
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
  INSERT INTO public.center_queue_settings (center_id, appointment_date)
  VALUES (p_center_id, p_queue_date)
  ON CONFLICT (center_id, appointment_date) DO NOTHING;

  SELECT
    COALESCE(
      NULLIF(current_token, 0),
      (
        SELECT COALESCE(MAX(token_number), 0)
        FROM public.appointments
        WHERE center_id = p_center_id
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
  FROM public.center_queue_settings
  WHERE center_id = p_center_id
    AND appointment_date = p_queue_date;

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
  WHERE appointment.center_id = p_center_id
    AND appointment.appointment_date = p_queue_date
    AND appointment.token_number IS NOT NULL;
END;
$$;

-- Stored Procedure: Get appointment queue snapshot
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
  v_center_snapshot jsonb;
  v_current_token integer;
  v_average numeric(10, 2);
  v_people_ahead integer;
  v_estimated_wait integer;
BEGIN
  SELECT *
  INTO v_appointment
  FROM public.appointments
  WHERE id = p_appointment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  v_center_snapshot := public.get_center_queue_snapshot(
    v_appointment.center_id,
    v_appointment.appointment_date
  );

  v_current_token := COALESCE((v_center_snapshot->>'current_token')::integer, 0);
  v_average := COALESCE((v_center_snapshot->>'average_consultation_time')::numeric, 10);
  v_people_ahead := GREATEST(COALESCE(v_appointment.token_number, 0) - v_current_token, 0);
  v_estimated_wait := CEIL(v_people_ahead * v_average)::integer;

  RETURN v_center_snapshot
    || jsonb_build_object(
      'appointment_id', v_appointment.id,
      'your_token', v_appointment.token_number,
      'token_number', v_appointment.token_number,
      'queue_position', CASE
        WHEN v_appointment.status IN ('confirmed', 'checked_in')
          THEN GREATEST(v_people_ahead, 1)
        ELSE 0
      END,
      'current_position', CASE
        WHEN v_appointment.status IN ('confirmed', 'checked_in')
          THEN GREATEST(v_people_ahead, 1)
        ELSE 0
      END,
      'people_ahead', v_people_ahead,
      'estimated_wait_time', v_estimated_wait,
      'estimated_wait_mins', v_estimated_wait,
      'status', CASE
        WHEN (v_center_snapshot->>'is_on_break')::boolean THEN 'doctor_on_break'
        WHEN v_appointment.status IN ('called', 'in_progress') THEN 'called'
        WHEN v_appointment.status = 'checked_in' THEN 'checked_in'
        WHEN v_appointment.status = 'confirmed' THEN 'waiting'
        ELSE v_appointment.status
      END
    );
END;
$$;

-- Stored Procedure: Get current serving token
CREATE OR REPLACE FUNCTION public.get_current_token(
  p_center_id uuid,
  p_queue_date date DEFAULT CURRENT_DATE
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((public.get_center_queue_snapshot(p_center_id, p_queue_date)->>'current_token')::integer, 0);
$$;

-- Trigger: assign token number to appointment (before insert)
CREATE OR REPLACE FUNCTION public.assign_appointment_token_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_queue_date date;
BEGIN
  -- Determine queue date based on input appointment_date or scheduled_at
  v_queue_date := COALESCE(NEW.appointment_date, (NEW.scheduled_at AT TIME ZONE 'UTC')::date);
  NEW.appointment_date := v_queue_date;

  IF TG_OP = 'INSERT' AND NEW.token_number IS NULL THEN
    -- Prevent duplicate tokens via advisory lock on (center_id, v_queue_date)
    PERFORM pg_advisory_xact_lock(hashtext(NEW.center_id::text || ':' || v_queue_date::text));

    SELECT COALESCE(MAX(token_number), 0) + 1
    INTO NEW.token_number
    FROM public.appointments
    WHERE center_id = NEW.center_id
      AND appointment_date = v_queue_date;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_appointment_token_number_trigger ON public.appointments;
CREATE TRIGGER assign_appointment_token_number_trigger
  BEFORE INSERT OR UPDATE OF center_id, scheduled_at, appointment_date, token_number
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_appointment_token_number();

-- Trigger: sync center queue settings after appointment status change
CREATE OR REPLACE FUNCTION public.sync_center_queue_after_appointment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue_date date;
BEGIN
  v_queue_date := COALESCE(NEW.appointment_date, (NEW.scheduled_at AT TIME ZONE 'UTC')::date);

  INSERT INTO public.center_queue_settings (center_id, appointment_date)
  VALUES (NEW.center_id, v_queue_date)
  ON CONFLICT (center_id, appointment_date) DO NOTHING;

  IF NEW.status IN ('called', 'in_progress') AND NEW.token_number IS NOT NULL THEN
    UPDATE public.center_queue_settings
    SET
      current_token = GREATEST(current_token, NEW.token_number),
      updated_at = now()
    WHERE center_id = NEW.center_id
      AND appointment_date = v_queue_date;
  END IF;

  IF NEW.status = 'completed'
    AND NEW.duration_minutes IS NOT NULL
    AND (
      TG_OP = 'INSERT'
      OR OLD.status IS DISTINCT FROM NEW.status
      OR OLD.duration_minutes IS DISTINCT FROM NEW.duration_minutes
    )
  THEN
    PERFORM public.recalculate_center_average(NEW.center_id, v_queue_date);
  END IF;

  PERFORM public.refresh_live_queue(NEW.center_id, v_queue_date);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_doctor_queue_after_appointment_change_trigger ON public.appointments;
DROP TRIGGER IF EXISTS sync_center_queue_after_appointment_change_trigger ON public.appointments;

CREATE TRIGGER sync_center_queue_after_appointment_change_trigger
  AFTER INSERT OR UPDATE OF status, duration_minutes, token_number
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_center_queue_after_appointment_change();

-- 6. Re-create the appointments_full view
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
  center_queue_settings.average_consultation_time AS doctor_average_time,
  center_queue_settings.average_consultation_time,
  (
    center_queue_settings.is_on_break
    OR (
      center_queue_settings.break_start IS NOT NULL
      AND center_queue_settings.break_start <= now()
      AND (
        center_queue_settings.break_end IS NULL
        OR center_queue_settings.break_end > now()
      )
    )
  ) AS is_on_break,
  center_queue_settings.break_start,
  center_queue_settings.break_end
FROM public.appointments
LEFT JOIN public.profiles
  ON profiles.id = appointments.user_id
LEFT JOIN public.service_centers
  ON service_centers.id = appointments.center_id
LEFT JOIN public.services
  ON services.id = appointments.service_id
LEFT JOIN latest_queue_updates
  ON latest_queue_updates.appointment_id = appointments.id
LEFT JOIN public.center_queue_settings
  ON center_queue_settings.center_id = appointments.center_id
  AND center_queue_settings.appointment_date = appointments.appointment_date;

-- 7. Grant permissions
GRANT SELECT ON public.appointments_full TO authenticated;

REVOKE ALL ON FUNCTION public.get_center_queue_snapshot(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_appointment_queue_snapshot(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_center_break(uuid, date, timestamptz, timestamptz, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recalculate_center_average(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_current_token(uuid, date) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_center_queue_snapshot(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_appointment_queue_snapshot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_center_break(uuid, date, timestamptz, timestamptz, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_center_average(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_token(uuid, date) TO authenticated;

-- 8. Seed settings and generate initial queue positions for existing appointments
DO $$
DECLARE
  queue_record record;
BEGIN
  FOR queue_record IN
    SELECT DISTINCT center_id, appointment_date
    FROM public.appointments
    WHERE center_id IS NOT NULL
      AND appointment_date IS NOT NULL
  LOOP
    PERFORM public.refresh_live_queue(
      queue_record.center_id,
      queue_record.appointment_date
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
