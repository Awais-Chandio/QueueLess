-- Phase 0.6 additions: service_role reads for the Edge Function, kong trigger gone.
-- Run with: supabase test db --local supabase/tests/database
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(7);

SELECT ok(has_table_privilege('service_role', 'public.appointments', 'SELECT'), 'service_role: SELECT appointments');
SELECT ok(has_table_privilege('service_role', 'public.center_queue_settings', 'SELECT'), 'service_role: SELECT center_queue_settings');
SELECT ok(has_table_privilege('service_role', 'public.device_tokens', 'SELECT'), 'service_role: SELECT device_tokens');
SELECT ok(NOT has_table_privilege('service_role', 'public.appointments', 'UPDATE'), 'service_role: read-only (no UPDATE granted)');

SELECT is_empty($$SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.appointments'::regclass AND tgname = 'queue_notification_trigger'$$,
                'kong pg_net trigger removed');
SELECT is_empty($$SELECT p.oid::regprocedure FROM pg_proc p WHERE p.prosrc LIKE '%kong:8000%'$$,
                'no function references kong:8000');

-- The Edge Function's query, run as service_role (as it would via PostgREST).
SET LOCAL role service_role;
SELECT lives_ok($$SELECT a.id, a.user_id, a.token_number, s.current_token, t.fcm_token
                  FROM public.appointments a
                  LEFT JOIN public.center_queue_settings s ON s.center_id = a.center_id
                  LEFT JOIN public.device_tokens t ON t.user_id = a.user_id
                  LIMIT 1$$, 'service_role can run the Edge Function''s reads');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
