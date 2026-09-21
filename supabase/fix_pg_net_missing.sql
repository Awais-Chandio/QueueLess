-- ============================================================
-- QueueLess pg_net Extension Safety Patch
-- Resolves: "ERROR: schema 'net' does not exist" when confirming
-- or updating appointments on databases without pg_net enabled.
-- ============================================================

BEGIN;

-- 1. Try to enable pg_net extension if available
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Re-create trigger_queue_notification with dynamic compilation check
CREATE OR REPLACE FUNCTION public.trigger_queue_notification()
RETURNS trigger AS $$
DECLARE
  v_payload jsonb;
  v_url text;
  v_has_net boolean;
BEGIN
  -- Kong Gateway URL for Supabase Edge Functions
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
        'appointment_date', NEW.appointment_date,
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

COMMIT;

-- Reload schema cache to apply immediately
NOTIFY pgrst, 'reload schema';
