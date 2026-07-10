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

    -- Check if pg_net is actually installed in the extensions or schema list
    SELECT EXISTS (
      SELECT 1 FROM pg_extension WHERE extname = 'pg_net'
    ) OR EXISTS (
      SELECT 1 FROM pg_namespace WHERE nspname = 'net'
    ) INTO v_has_net;

    IF v_has_net THEN
      -- Use EXECUTE to prevent compile-time static binding errors 
      -- if the net schema/function is not present.
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
$$ LANGUAGE plpgsql;

-- Attach trigger to public.appointments table
DROP TRIGGER IF EXISTS queue_notification_trigger ON public.appointments;
CREATE TRIGGER queue_notification_trigger
  AFTER INSERT OR UPDATE OF status ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_queue_notification();
