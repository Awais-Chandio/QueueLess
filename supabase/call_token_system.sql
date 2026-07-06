-- QueueLess Call Token System
-- Apply in Supabase SQL Editor after the appointments and notifications setup.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS called_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

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

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
GRANT UPDATE (
  status,
  called_at,
  completed_at
) ON public.appointments TO authenticated;

CREATE OR REPLACE FUNCTION public.call_appointment(
  p_appointment_id uuid
)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  called_appointment public.appointments%ROWTYPE;
BEGIN
  SELECT *
  INTO called_appointment
  FROM public.appointments
  WHERE id = p_appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  IF called_appointment.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only confirmed appointments can be called';
  END IF;

  UPDATE public.appointments
  SET
    status = 'called',
    called_at = now()
  WHERE id = p_appointment_id
  RETURNING *
  INTO called_appointment;

  RETURN called_appointment;
END;
$$;

REVOKE ALL ON FUNCTION public.call_appointment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.call_appointment(uuid) TO authenticated;

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
  ELSIF NEW.status = 'called' THEN
    notification_type := 'token_called';
    notification_title := 'Token Called';
    notification_message := 'Your token has been called. Please proceed to the counter.';
  ELSIF NEW.status = 'checked_in' THEN
    notification_type := 'appointment_checked_in';
    notification_title := 'Check-In Successful';
    notification_message := 'You have successfully checked in. Please wait for your turn.';
  ELSIF NEW.status = 'in_progress' THEN
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
      'status', NEW.status,
      'token_number', NEW.token_number
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

DROP FUNCTION IF EXISTS public.get_current_token();
DROP FUNCTION IF EXISTS public.people_ahead(integer);

-- get_current_token: Filtered strictly by center_id and appointment_date
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
  IF p_center_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(MAX(token_number), 0)
  INTO v_current_token
  FROM public.appointments
  WHERE center_id = p_center_id
    AND appointment_date = p_queue_date
    AND status IN ('called', 'in_progress');

  RETURN COALESCE(v_current_token, 0);
END;
$$;

-- people_ahead: Filtered by appointment_id -> center_id & appointment_date
CREATE OR REPLACE FUNCTION public.people_ahead(
  p_appointment_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appointment public.appointments%ROWTYPE;
  v_current_token integer;
BEGIN
  SELECT * INTO v_appointment FROM public.appointments WHERE id = p_appointment_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  v_current_token := public.get_current_token(v_appointment.center_id, v_appointment.appointment_date);
  RETURN GREATEST(COALESCE(v_appointment.token_number, 0) - v_current_token, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_token(uuid, date) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.people_ahead(uuid) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
