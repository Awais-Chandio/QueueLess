-- QueueLess production-grade queue engine.
-- Apply after live_queue_tracking.sql. This keeps old app calls working while
-- adding doctor/provider-scoped tokens, averages, breaks, and queue snapshots.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS doctor_id uuid,
  ADD COLUMN IF NOT EXISTS appointment_date date,
  ADD COLUMN IF NOT EXISTS appointment_time text,
  ADD COLUMN IF NOT EXISTS skipped_at timestamptz,
  ADD COLUMN IF NOT EXISTS duration_minutes integer;

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_status_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_status_check
  CHECK (
    status IN (
      'pending',
      'confirmed',
      'checked_in',
      'called',
      'in_progress',
      'completed',
      'cancelled',
      'expired',
      'no_show',
      'skipped'
    )
  );

CREATE TABLE IF NOT EXISTS public.doctor_queue_settings (
  doctor_id uuid PRIMARY KEY,
  current_token integer NOT NULL DEFAULT 0,
  average_consultation_time numeric(10, 2) NOT NULL DEFAULT 10,
  break_start timestamptz,
  break_end timestamptz,
  is_on_break boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.queue_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  current_position integer,
  people_ahead integer NOT NULL DEFAULT 0,
  estimated_wait_mins integer,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.queue_updates
  ADD COLUMN IF NOT EXISTS current_serving_token integer;

ALTER TABLE public.queue_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_queue_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view doctor queue settings" ON public.doctor_queue_settings;
DROP POLICY IF EXISTS "Staff can manage doctor queue settings" ON public.doctor_queue_settings;
DROP POLICY IF EXISTS "Users can view own queue updates" ON public.queue_updates;
DROP POLICY IF EXISTS "Staff can view queue updates" ON public.queue_updates;

CREATE POLICY "Users can view doctor queue settings"
  ON public.doctor_queue_settings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Staff can manage doctor queue settings"
  ON public.doctor_queue_settings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('staff', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('staff', 'admin')
    )
  );

CREATE POLICY "Users can view own queue updates"
  ON public.queue_updates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.appointments
      WHERE appointments.id = queue_updates.appointment_id
        AND appointments.user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can view queue updates"
  ON public.queue_updates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('staff', 'admin')
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.queue_updates TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.doctor_queue_settings TO authenticated;

CREATE INDEX IF NOT EXISTS idx_appointments_doctor_date_token
  ON public.appointments(doctor_id, appointment_date, token_number);

CREATE INDEX IF NOT EXISTS idx_appointments_doctor_status_date
  ON public.appointments(doctor_id, appointment_date, status);

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

CREATE OR REPLACE FUNCTION public.assign_appointment_token_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_doctor_id uuid;
  v_queue_date date;
BEGIN
  v_doctor_id := public.queue_scope_doctor_id(
    NEW.doctor_id,
    NEW.service_id,
    NEW.center_id
  );
  v_queue_date := public.queue_appointment_date(
    NEW.appointment_date,
    NEW.scheduled_at
  );

  NEW.doctor_id := v_doctor_id;
  NEW.appointment_date := v_queue_date;

  INSERT INTO public.doctor_queue_settings (doctor_id)
  VALUES (v_doctor_id)
  ON CONFLICT (doctor_id) DO NOTHING;

  IF TG_OP = 'INSERT' AND NEW.token_number IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(v_doctor_id::text || ':' || v_queue_date::text));

    SELECT COALESCE(MAX(token_number), 0) + 1
    INTO NEW.token_number
    FROM public.appointments
    WHERE doctor_id = v_doctor_id
      AND appointment_date = v_queue_date;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_appointment_token_number_trigger
  ON public.appointments;

CREATE TRIGGER assign_appointment_token_number_trigger
  BEFORE INSERT OR UPDATE OF doctor_id, service_id, center_id, scheduled_at, appointment_date, token_number
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_appointment_token_number();

UPDATE public.appointments
SET
  doctor_id = public.queue_scope_doctor_id(doctor_id, service_id, center_id),
  appointment_date = public.queue_appointment_date(appointment_date, scheduled_at)
WHERE doctor_id IS NULL
  OR appointment_date IS NULL;

INSERT INTO public.doctor_queue_settings (doctor_id)
SELECT DISTINCT doctor_id
FROM public.appointments
WHERE doctor_id IS NOT NULL
ON CONFLICT (doctor_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_appointment_timing_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('called', 'in_progress') AND NEW.started_at IS NULL THEN
    NEW.started_at := COALESCE(NEW.called_at, now());
  END IF;

  IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  END IF;

  IF NEW.status = 'skipped' AND NEW.skipped_at IS NULL THEN
    NEW.skipped_at := now();
  END IF;

  IF NEW.started_at IS NOT NULL AND NEW.completed_at IS NOT NULL THEN
    NEW.duration_minutes := GREATEST(
      1,
      CEIL(EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at)) / 60.0)::integer
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_appointment_timing_fields_trigger
  ON public.appointments;

CREATE TRIGGER set_appointment_timing_fields_trigger
  BEFORE INSERT OR UPDATE OF status, called_at, started_at, completed_at, skipped_at
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_appointment_timing_fields();

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
    WHERE doctor_id = p_doctor_id
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

CREATE OR REPLACE FUNCTION public.sync_doctor_queue_after_appointment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor_id uuid;
  v_queue_date date;
BEGIN
  v_doctor_id := COALESCE(NEW.doctor_id, public.queue_scope_doctor_id(NEW.doctor_id, NEW.service_id, NEW.center_id));
  v_queue_date := public.queue_appointment_date(NEW.appointment_date, NEW.scheduled_at);

  INSERT INTO public.doctor_queue_settings (doctor_id)
  VALUES (v_doctor_id)
  ON CONFLICT (doctor_id) DO NOTHING;

  IF NEW.status IN ('called', 'in_progress') AND NEW.token_number IS NOT NULL THEN
    UPDATE public.doctor_queue_settings
    SET
      current_token = GREATEST(current_token, NEW.token_number),
      updated_at = now()
    WHERE doctor_id = v_doctor_id;
  END IF;

  IF NEW.status = 'completed'
    AND NEW.duration_minutes IS NOT NULL
    AND (
      TG_OP = 'INSERT'
      OR OLD.status IS DISTINCT FROM NEW.status
      OR OLD.duration_minutes IS DISTINCT FROM NEW.duration_minutes
    )
  THEN
    PERFORM public.recalculate_doctor_average(v_doctor_id);
  END IF;

  PERFORM public.refresh_live_queue(v_doctor_id, v_queue_date);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_live_queue_after_appointment_change
  ON public.appointments;

DROP TRIGGER IF EXISTS sync_doctor_queue_after_appointment_change_trigger
  ON public.appointments;

CREATE TRIGGER sync_doctor_queue_after_appointment_change_trigger
  AFTER INSERT OR UPDATE OF status, token_number, doctor_id, service_id, center_id, scheduled_at, appointment_date, duration_minutes
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_doctor_queue_after_appointment_change();

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
        WHERE doctor_id = p_doctor_id
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
  WHERE appointment.doctor_id = p_doctor_id
    AND appointment.appointment_date = p_queue_date
    AND appointment.token_number IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_doctor_break(
  p_doctor_id uuid,
  p_break_start timestamptz,
  p_break_end timestamptz DEFAULT NULL,
  p_is_on_break boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result public.doctor_queue_settings%ROWTYPE;
BEGIN
  INSERT INTO public.doctor_queue_settings (
    doctor_id,
    break_start,
    break_end,
    is_on_break,
    updated_at
  )
  VALUES (
    p_doctor_id,
    p_break_start,
    p_break_end,
    p_is_on_break,
    now()
  )
  ON CONFLICT (doctor_id)
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
  WHERE doctor_id = p_doctor_id
    AND appointment_date = p_queue_date
    AND status IN ('called', 'in_progress');

  v_current_token := GREATEST(COALESCE(v_settings.current_token, 0), COALESCE(v_current_token, 0));

  SELECT COALESCE(MAX(token_number), 0) + 1
  INTO v_next_token
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
    'doctor_average_time', COALESCE(v_settings.average_consultation_time, 10),
    'average_consultation_time', COALESCE(v_settings.average_consultation_time, 10),
    'is_on_break', v_is_on_break,
    'break_start', v_settings.break_start,
    'break_end', v_settings.break_end
  );
END;
$$;

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
  v_doctor_snapshot jsonb;
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

  v_doctor_snapshot := public.get_doctor_queue_snapshot(
    public.queue_scope_doctor_id(
      v_appointment.doctor_id,
      v_appointment.service_id,
      v_appointment.center_id
    ),
    public.queue_appointment_date(
      v_appointment.appointment_date,
      v_appointment.scheduled_at
    )
  );

  v_current_token := COALESCE((v_doctor_snapshot->>'current_token')::integer, 0);
  v_average := COALESCE((v_doctor_snapshot->>'average_consultation_time')::numeric, 10);
  v_people_ahead := GREATEST(COALESCE(v_appointment.token_number, 0) - v_current_token, 0);
  v_estimated_wait := CEIL(v_people_ahead * v_average)::integer;

  RETURN v_doctor_snapshot
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
        WHEN (v_doctor_snapshot->>'is_on_break')::boolean THEN 'doctor_on_break'
        WHEN v_appointment.status IN ('called', 'in_progress') THEN 'called'
        WHEN v_appointment.status = 'checked_in' THEN 'checked_in'
        WHEN v_appointment.status = 'confirmed' THEN 'waiting'
        ELSE v_appointment.status
      END
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_current_token(
  p_doctor_id uuid,
  p_queue_date date DEFAULT CURRENT_DATE
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((public.get_doctor_queue_snapshot(p_doctor_id, p_queue_date)->>'current_token')::integer, 0);
$$;

CREATE OR REPLACE FUNCTION public.people_ahead(
  my_token integer,
  p_current_token integer
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(my_token - p_current_token, 0)::integer;
$$;

REVOKE ALL ON FUNCTION public.get_doctor_queue_snapshot(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_appointment_queue_snapshot(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_doctor_break(uuid, timestamptz, timestamptz, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recalculate_doctor_average(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_current_token(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.people_ahead(integer, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_doctor_queue_snapshot(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_appointment_queue_snapshot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_doctor_break(uuid, timestamptz, timestamptz, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_doctor_average(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_token(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.people_ahead(integer, integer) TO authenticated;

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
LEFT JOIN latest_queue_updates
  ON latest_queue_updates.appointment_id = appointments.id
LEFT JOIN public.doctor_queue_settings
  ON doctor_queue_settings.doctor_id = appointments.doctor_id;

GRANT SELECT ON public.appointments_full TO authenticated;

DO $$
DECLARE
  queue_record record;
BEGIN
  FOR queue_record IN
    SELECT DISTINCT doctor_id, appointment_date
    FROM public.appointments
    WHERE doctor_id IS NOT NULL
      AND appointment_date IS NOT NULL
      AND appointment_date >= CURRENT_DATE
  LOOP
    PERFORM public.refresh_live_queue(
      queue_record.doctor_id,
      queue_record.appointment_date
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
