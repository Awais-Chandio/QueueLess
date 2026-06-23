-- QueueLess Patient Check-In System
-- Apply in Supabase SQL Editor after the appointments and notifications setup.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;

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
      'cancelled'
    )
  );

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'general',
  title text NOT NULL,
  message text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS type text,
  ADD COLUMN IF NOT EXISTS data jsonb,
  ADD COLUMN IF NOT EXISTS is_read boolean;

UPDATE public.notifications
SET
  type = COALESCE(type, 'general'),
  data = COALESCE(data, '{}'::jsonb),
  is_read = COALESCE(is_read, false);

ALTER TABLE public.notifications
  ALTER COLUMN type SET DEFAULT 'general',
  ALTER COLUMN type SET NOT NULL,
  ALTER COLUMN data SET DEFAULT '{}'::jsonb,
  ALTER COLUMN data SET NOT NULL,
  ALTER COLUMN is_read SET DEFAULT false,
  ALTER COLUMN is_read SET NOT NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Staff can create notifications" ON public.notifications;

CREATE POLICY "Users can view own notifications"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Staff can create notifications"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('staff', 'admin')
    )
  );

REVOKE ALL ON public.notifications FROM anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created_at
  ON public.notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id)
  WHERE is_read = false;

CREATE OR REPLACE FUNCTION public.enforce_patient_check_in_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'checked_in'
    AND OLD.status IS DISTINCT FROM 'checked_in'
    AND OLD.status <> 'confirmed'
  THEN
    RAISE EXCEPTION 'Only confirmed appointments can be checked in';
  END IF;

  IF NEW.status = 'checked_in'
    AND OLD.status IS DISTINCT FROM 'checked_in'
  THEN
    NEW.checked_in_at := COALESCE(NEW.checked_in_at, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_enforce_patient_check_in_transition
  ON public.appointments;

CREATE TRIGGER trigger_enforce_patient_check_in_transition
  BEFORE UPDATE OF status
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_patient_check_in_transition();

CREATE OR REPLACE FUNCTION public.check_in_appointment(
  p_appointment_id uuid
)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  checked_in_appointment public.appointments%ROWTYPE;
BEGIN
  SELECT *
  INTO checked_in_appointment
  FROM public.appointments
  WHERE id = p_appointment_id
  FOR UPDATE;

  IF NOT FOUND OR checked_in_appointment.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  IF checked_in_appointment.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only confirmed appointments can be checked in';
  END IF;

  UPDATE public.appointments
  SET
    status = 'checked_in',
    checked_in_at = now()
  WHERE id = p_appointment_id
  RETURNING *
  INTO checked_in_appointment;

  RETURN checked_in_appointment;
END;
$$;

REVOKE ALL ON FUNCTION public.check_in_appointment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_in_appointment(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.queue_less_notify_appointment_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notification_type text;
  notification_title text;
  notification_message text;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'confirmed' THEN
    notification_type := 'appointment_confirmed';
    notification_title := 'Appointment Confirmed';
    notification_message := 'Your appointment has been confirmed.';
  ELSIF NEW.status = 'checked_in' THEN
    notification_type := 'appointment_checked_in';
    notification_title := 'Check-In Successful';
    notification_message := 'You have successfully checked in. Please wait for your turn.';
  ELSIF NEW.status IN ('called', 'in_progress') THEN
    notification_type := 'service_started';
    notification_title := 'Your Turn Started';
    notification_message := 'Please proceed to the service counter.';
  ELSIF NEW.status = 'completed' THEN
    notification_type := 'appointment_completed';
    notification_title := 'Appointment Completed';
    notification_message := 'Thank you for visiting.';
  ELSIF NEW.status = 'cancelled' THEN
    notification_type := 'appointment_cancelled';
    notification_title := 'Appointment Cancelled';
    notification_message := 'Your appointment has been cancelled.';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (
    user_id,
    appointment_id,
    type,
    title,
    message,
    data
  )
  SELECT
    NEW.user_id,
    NEW.id,
    notification_type,
    notification_title,
    notification_message,
    jsonb_build_object(
      'appointment_id', NEW.id,
      'status', NEW.status
    )
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.notifications
    WHERE user_id = NEW.user_id
      AND type = notification_type
      AND (
        appointment_id = NEW.id
        OR data->>'appointment_id' = NEW.id::text
      )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_queue_less_notify_appointment_status_change
  ON public.appointments;

CREATE TRIGGER trigger_queue_less_notify_appointment_status_change
  AFTER INSERT OR UPDATE OF status
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_less_notify_appointment_status_change();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    EXCEPTION
      WHEN duplicate_object THEN
        NULL;
    END;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
