-- Phase 0.6 additions.
--
-- 1. service_role (used by the send-queue-notification Edge Function) only had
--    REFERENCES/TRIGGER/TRUNCATE on public tables, so the function's reads
--    failed. Grant exactly what it reads: SELECT on device_tokens,
--    center_queue_settings, appointments. Least privilege; Phase 1D adds more
--    if the rebuilt notifications need it.
-- 2. trigger_queue_notification() posted every status change to
--    http://kong:8000/... via pg_net. That host only exists in the local Docker
--    stack, so on hosted Supabase each call failed (and was swallowed). Drop the
--    trigger and the function so the hard-coded URL can't be re-attached;
--    notifications are rebuilt in Phase 1D. In-app notifications (the
--    notifications table, written by the create_notification_* triggers) are
--    unaffected.

GRANT SELECT ON public.device_tokens, public.center_queue_settings, public.appointments TO service_role;

DROP TRIGGER queue_notification_trigger ON public.appointments;
DROP FUNCTION public.trigger_queue_notification();

notify pgrst, 'reload schema';
