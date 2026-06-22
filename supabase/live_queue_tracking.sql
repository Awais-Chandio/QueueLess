-- Live Queue Tracking
-- Apply after complete_appointments_contract.sql and
-- staff_dashboard_queue_notifications.sql.
--
-- The app uses `in_progress` as the durable appointment status for the token
-- currently being called/served. Queue updates expose that state as `called`.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS called_at timestamptz,
  ADD COLUMN IF NOT EXISTS started_at timestamptz;

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_status_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_status_check
  CHECK (
    status IN (
      'pending',
      'confirmed',
      'checked_in',
      'in_progress',
      'completed',
      'cancelled'
    )
  );

ALTER TABLE public.queue_updates
  ADD COLUMN IF NOT EXISTS current_serving_token integer;

CREATE INDEX IF NOT EXISTS idx_appointments_center_queue
  ON public.appointments(center_id, scheduled_at, status, token_number);

DROP POLICY IF EXISTS "Staff can view queue updates" ON public.queue_updates;

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
GRANT UPDATE (
  status,
  checked_in_at,
  called_at,
  started_at,
  completed_at
) ON public.appointments TO authenticated;

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
  v_current_serving_token integer;
BEGIN
  SELECT MIN(token_number)
  INTO v_current_serving_token
  FROM public.appointments
  WHERE center_id = p_center_id
    AND scheduled_at::date = p_queue_date
    AND status = 'in_progress';

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
        THEN queue_metrics.people_ahead + 1
      ELSE 0
    END,
    CASE
      WHEN appointment.status IN ('confirmed', 'checked_in')
        THEN queue_metrics.people_ahead
      ELSE 0
    END,
    CASE
      WHEN appointment.status IN ('confirmed', 'checked_in')
        THEN queue_metrics.people_ahead * 5
      ELSE 0
    END,
    v_current_serving_token,
    CASE
      WHEN appointment.status = 'in_progress' THEN 'called'
      WHEN appointment.status = 'checked_in' THEN 'checked_in'
      WHEN appointment.status = 'confirmed' THEN 'waiting'
      ELSE appointment.status
    END
  FROM public.appointments appointment
  CROSS JOIN LATERAL (
    SELECT COUNT(*)::integer AS people_ahead
    FROM public.appointments ahead
    WHERE ahead.center_id = appointment.center_id
      AND ahead.scheduled_at::date = appointment.scheduled_at::date
      AND ahead.status IN ('confirmed', 'checked_in', 'in_progress')
      AND ahead.token_number < appointment.token_number
  ) queue_metrics
  WHERE appointment.center_id = p_center_id
    AND appointment.scheduled_at::date = p_queue_date;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_live_queue(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_live_queue(uuid, date) FROM authenticated;

CREATE OR REPLACE FUNCTION public.sync_live_queue_after_appointment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

DROP TRIGGER IF EXISTS sync_live_queue_after_appointment_change
  ON public.appointments;

CREATE TRIGGER sync_live_queue_after_appointment_change
  AFTER INSERT OR UPDATE
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_live_queue_after_appointment_change();

CREATE OR REPLACE FUNCTION public.check_in_appointment(
  p_appointment_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.check_in_appointment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_in_appointment(uuid) TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime
        ADD TABLE public.queue_updates;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END;
$$;

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
  ORDER BY
    queue_updates.appointment_id,
    queue_updates.created_at DESC
)
SELECT
  appointments.id,
  appointments.user_id,
  profiles.full_name AS patient_name,
  appointments.center_id,
  appointments.service_id,
  service_centers.name AS center_name,
  services.name AS service_name,
  appointments.scheduled_at,
  appointments.status,
  appointments.token_number,
  appointments.notes,
  appointments.cancel_reason,
  appointments.cancelled_by,
  appointments.cancelled_at,
  appointments.checked_in_at,
  appointments.started_at,
  appointments.completed_at,
  appointments.created_at,
  COALESCE(
    latest_queue_updates.estimated_wait_mins,
    appointments.estimated_wait_mins
  ) AS estimated_wait_mins,
  latest_queue_updates.current_position,
  latest_queue_updates.people_ahead,
  latest_queue_updates.queue_status,
  appointments.called_at,
  latest_queue_updates.current_serving_token
FROM public.appointments
LEFT JOIN public.profiles
  ON profiles.id = appointments.user_id
LEFT JOIN public.service_centers
  ON service_centers.id = appointments.center_id
LEFT JOIN public.services
  ON services.id = appointments.service_id
LEFT JOIN latest_queue_updates
  ON latest_queue_updates.appointment_id = appointments.id;

GRANT SELECT ON public.appointments_full TO authenticated;

DO $$
DECLARE
  queue_record record;
BEGIN
  FOR queue_record IN
    SELECT DISTINCT
      center_id,
      scheduled_at::date AS queue_date
    FROM public.appointments
    WHERE scheduled_at::date >= CURRENT_DATE
  LOOP
    PERFORM public.refresh_live_queue(
      queue_record.center_id,
      queue_record.queue_date
    );
  END LOOP;
END;
$$;

-- Ensure PostgREST sees the new RPC and view contract immediately.
NOTIFY pgrst, 'reload schema';
