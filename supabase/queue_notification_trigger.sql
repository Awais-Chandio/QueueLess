-- ============================================================
-- SQL Migration: Trigger to call send-queue-notification Edge Function
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_queue_notification()
RETURNS trigger AS $$
DECLARE
  v_payload jsonb;
  v_url text;
BEGIN
  -- Kong Gateway URL for Supabase Edge Functions (works both locally and in prod container environments)
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
        'cancelled_by', NEW.cancelled_by,
        'old_status', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END
      )
    );

    -- Call Edge Function asynchronously using pg_net extension
    PERFORM net.http_post(
      url := v_url,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := v_payload
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to public.appointments table
DROP TRIGGER IF EXISTS queue_notification_trigger ON public.appointments;
CREATE TRIGGER queue_notification_trigger
  AFTER INSERT OR UPDATE OF status ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_queue_notification();
