-- Phase 1D.2: scheduled jobs (pg_cron).
--
--   send-notifications          every minute: if the outbox has due rows, POST
--                               to the send-notifications Edge Function (pg_net).
--                               URL and shared secret come from Vault:
--                                 notifications_worker_url
--                                 notifications_worker_secret
--                               Without them it does nothing.
--   cleanup-stale-appointments  nightly 21:30 UTC (02:30 PKT)
--   prune-notification-outbox   nightly 21:45 UTC: finished outbox rows > 30 days
--
-- cleanup_stale_appointments moved rows the status trigger refuses
-- (confirmed -> no_show, called / in_progress -> expired), so one such row
-- aborted the whole run. It now only makes allowed moves:
--   slot booking, confirmed, 15 min past its time       -> expired
--   slot booking past its end: pending/confirmed/checked_in -> expired,
--                              called -> no_show, in_progress left to the doctor
--   token (no slot) from a past clinic day: waiting -> expired, called -> no_show
-- and returns how many rows each step changed.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- ---------------------------------------------------------------------------
-- cleanup_stale_appointments
-- ---------------------------------------------------------------------------
DROP FUNCTION public.cleanup_stale_appointments();

CREATE FUNCTION public.cleanup_stale_appointments()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_missed integer;
  v_slot_closed integer;
  v_token_closed integer;
BEGIN
  IF NOT private.is_server_context() THEN
    RAISE EXCEPTION 'cleanup_stale_appointments can only run server-side'
      USING ERRCODE = '42501';
  END IF;

  -- A. Confirmed slot bookings that missed the 15-minute check-in window.
  UPDATE public.appointments
  SET status = 'expired',
      notes = CASE
        WHEN notes IS NULL OR notes = '' THEN 'Auto-expired: missed 15-min check-in window'
        ELSE notes || E'\n(Auto-expired: missed 15-min check-in window)'
      END
  WHERE status = 'confirmed'
    AND appointment_time IS NOT NULL
    AND scheduled_at < (now() - interval '15 minutes');
  GET DIAGNOSTICS v_missed = ROW_COUNT;

  -- B. Slot bookings past their end (service duration, default 30, + 15 min).
  WITH ended AS (
    SELECT a.id, a.status
    FROM public.appointments a
    LEFT JOIN public.services s ON s.id = a.service_id
    WHERE a.appointment_time IS NOT NULL
      AND a.status IN ('pending', 'confirmed', 'checked_in', 'called')
      AND a.scheduled_at < now() - (COALESCE(s.duration_minutes, 30) + 15) * interval '1 minute'
  )
  UPDATE public.appointments a
  SET status = CASE WHEN ended.status = 'called' THEN 'no_show' ELSE 'expired' END,
      notes = CASE
        WHEN a.notes IS NULL OR a.notes = '' THEN 'Auto-closed: time slot passed'
        ELSE a.notes || E'\n(Auto-closed: time slot passed)'
      END
  FROM ended
  WHERE a.id = ended.id;
  GET DIAGNOSTICS v_slot_closed = ROW_COUNT;

  -- C. Queue tokens still open after their clinic's day ended.
  UPDATE public.appointments a
  SET status = CASE WHEN a.status = 'called' THEN 'no_show' ELSE 'expired' END,
      notes = CASE
        WHEN a.notes IS NULL OR a.notes = '' THEN 'Auto-closed: token day ended'
        ELSE a.notes || E'\n(Auto-closed: token day ended)'
      END
  FROM public.service_centers c
  JOIN public.organizations o ON o.id = c.organization_id
  WHERE c.id = a.center_id
    AND a.status IN ('pending', 'confirmed', 'checked_in', 'called')
    AND a.appointment_time IS NULL
    AND a.appointment_date < (now() AT TIME ZONE o.timezone)::date;
  GET DIAGNOSTICS v_token_closed = ROW_COUNT;

  RETURN jsonb_build_object(
    'missed_check_in', v_missed,
    'slots_closed', v_slot_closed,
    'tokens_closed', v_token_closed
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.cleanup_stale_appointments() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_appointments() TO service_role;

-- ---------------------------------------------------------------------------
-- Notification worker kick
-- ---------------------------------------------------------------------------
CREATE FUNCTION private.kick_notification_worker()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_url text;
  v_secret text;
  v_request bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.notification_outbox
    WHERE (status = 'pending' AND next_attempt_at <= now())
       OR (status = 'sending' AND locked_until < now())
  ) THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'notifications_worker_url';
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'notifications_worker_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE NOTICE 'send-notifications: Vault secrets notifications_worker_url / notifications_worker_secret are not set';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) INTO v_request;
  RETURN v_request;
END;
$function$;

CREATE FUNCTION private.prune_notification_outbox()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM public.notification_outbox
  WHERE status IN ('sent', 'failed', 'skipped') AND updated_at < now() - interval '30 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION private.kick_notification_worker() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.prune_notification_outbox() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Jobs (cron.schedule replaces a job with the same name)
-- ---------------------------------------------------------------------------
SELECT cron.schedule('send-notifications', '* * * * *', 'SELECT private.kick_notification_worker()');
SELECT cron.schedule('cleanup-stale-appointments', '30 21 * * *', 'SELECT public.cleanup_stale_appointments()');
SELECT cron.schedule('prune-notification-outbox', '45 21 * * *', 'SELECT private.prune_notification_outbox()');
