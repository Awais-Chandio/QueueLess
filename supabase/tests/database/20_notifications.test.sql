-- Phase 1D: notification outbox, worker RPCs (charge once, retry, refund), cron jobs, cleanup.
-- Run with: supabase test db. Uses the seed accounts (supabase/seed.sql). Rolled back.
--
-- Outbox triggers are deferred to commit. A test never commits, so it fires
-- them with SET CONSTRAINTS ALL IMMEDIATE and goes back to DEFERRED after.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO anon, authenticated, service_role;
CREATE SCHEMA tests;
GRANT USAGE ON SCHEMA tests TO anon, authenticated, service_role;
CREATE FUNCTION tests.login(p_user uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true),
         set_config('role', 'authenticated', true);
$$;
CREATE FUNCTION tests.login_service() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true), set_config('role', 'service_role', true);
$$;
CREATE FUNCTION tests.logout() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true), set_config('role', 'postgres', true);
$$;
CREATE TABLE tests.codes (label text PRIMARY KEY, code text);
GRANT ALL ON tests.codes TO anon, authenticated, service_role;
CREATE FUNCTION tests.code(p_label text) RETURNS text LANGUAGE sql STABLE AS 'SELECT code FROM tests.codes WHERE label = p_label';
CREATE FUNCTION tests.id(p_label text) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS
  'SELECT a.id FROM public.appointments a WHERE a.public_code = tests.code(p_label)';
CREATE FUNCTION tests.outbox(p_event text, p_label text) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS
  'SELECT o.id FROM public.notification_outbox o WHERE o.event = p_event AND o.appointment_id = tests.id(p_label)';
CREATE FUNCTION tests.credits() RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER AS
  $$SELECT balance FROM public.message_credits WHERE organization_id = (SELECT organization_id FROM public.service_centers WHERE id = '521f1349-05c4-4417-9fa5-5289963af7db')$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO anon, authenticated, service_role;

-- Seed: staff A a..02 / center A 521f.. / Dr. A d..0a (account a..04); staff B a..03 / center B / Dr. B.
UPDATE public.appointments SET appointment_date = appointment_date - 7 WHERE doctor_id IN ('d0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-00000000000b');
-- Clinic A on the Clinic plan (sms) with 3 credits; clinic B on Basic (2B:
-- seed orgs start on the trial, which has sms).
UPDATE public.org_subscriptions SET plan_id = 'basic', status = 'active'
WHERE organization_id = (SELECT organization_id FROM public.service_centers WHERE id = 'd2c1a3df-bb89-4fde-b73d-5bb9ec763481') AND status <> 'cancelled';
UPDATE public.org_subscriptions SET plan_id = 'clinic'
WHERE organization_id = (SELECT organization_id FROM public.service_centers WHERE id = '521f1349-05c4-4417-9fa5-5289963af7db') AND status <> 'cancelled';
UPDATE public.message_credits SET balance = 3
WHERE organization_id = (SELECT organization_id FROM public.service_centers WHERE id = '521f1349-05c4-4417-9fa5-5289963af7db');

-- 2C: staff walk-ins follow the fee rules (issue_token -> issue_walk_in). These queue flows
-- predate fees, so walk-ins go straight into the line here; fee before is in 22 / 28.
UPDATE public.center_payment_settings SET fee_mode = 'after';

SELECT plan(64);

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.notification_outbox'::regclass), 'RLS on notification_outbox');
SELECT ok(NOT has_table_privilege('anon', 'public.notification_outbox', 'select'), 'anon cannot read the outbox');
SELECT ok(NOT has_table_privilege('authenticated', 'public.notification_outbox', 'insert')
          AND NOT has_table_privilege('authenticated', 'public.notification_outbox', 'update'), 'no client writes to the outbox');
SELECT ok(NOT has_function_privilege('authenticated', 'public.claim_notifications(integer,integer)', 'execute')
          AND NOT has_function_privilege('anon', 'public.claim_notifications(integer,integer)', 'execute'), 'clients cannot claim');
SELECT ok(NOT has_function_privilege('authenticated', 'public.begin_notification_send(uuid,text,integer)', 'execute')
          AND NOT has_function_privilege('authenticated', 'public.finish_notification_send(uuid,boolean,text,text,boolean)', 'execute')
          AND NOT has_function_privilege('authenticated', 'public.skip_notification(uuid,text)', 'execute'), 'clients cannot charge, finish or skip');
SELECT ok(has_function_privilege('service_role', 'public.claim_notifications(integer,integer)', 'execute')
          AND has_function_privilege('service_role', 'public.begin_notification_send(uuid,text,integer)', 'execute')
          AND has_function_privilege('service_role', 'public.finish_notification_send(uuid,boolean,text,text,boolean)', 'execute'), 'the Edge Function (service role) runs the worker RPCs');

-- ---------------------------------------------------------------------------
-- Enqueue: token issued
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000003');
INSERT INTO tests.codes SELECT 'b1', public_code FROM public.issue_token('d0000000-0000-4000-8000-00000000000b', 'Free One', '03009990001', 'walk_in');
SELECT tests.logout();
SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
SELECT is((SELECT count(*)::integer FROM public.notification_outbox WHERE appointment_id = tests.id('b1')), 0, 'Basic plan: no messages queued');

SELECT tests.login('a0000000-0000-4000-8000-000000000002');
INSERT INTO tests.codes SELECT 'w' || n, public_code
FROM generate_series(1, 6) n, LATERAL public.issue_token('d0000000-0000-4000-8000-00000000000a', 'Walk ' || n, '0300111000' || n, 'walk_in');
INSERT INTO tests.codes SELECT 'nophone', public_code FROM public.issue_token('d0000000-0000-4000-8000-00000000000a', 'No Phone', NULL, 'walk_in');
SELECT tests.logout();
SELECT is((SELECT count(*)::integer FROM public.notification_outbox), 0, 'nothing is written before commit (deferred)');
SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;

SELECT is((SELECT count(*)::integer FROM public.notification_outbox WHERE event = 'token_issued'), 6, 'token_issued for the 6 tokens with a phone');
SELECT is((SELECT count(*)::integer FROM public.notification_outbox WHERE appointment_id = tests.id('nophone')), 0, 'no phone, no message');
SELECT is((SELECT payload->>'public_code' FROM public.notification_outbox WHERE id = tests.outbox('token_issued', 'w1')), tests.code('w1'), 'payload carries the status code');
SELECT is((SELECT (payload->>'people_ahead')::integer FROM public.notification_outbox WHERE id = tests.outbox('token_issued', 'w3')), 2, 'payload carries people ahead');
SELECT is((SELECT language || '|' || status || '|' || to_phone FROM public.notification_outbox WHERE id = tests.outbox('token_issued', 'w1')),
          'ur|pending|03001110001', 'Urdu by default, pending, to the patient''s phone');

-- English for a patient who prefers it (the web join page sets it for QR guests).
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT throws_ok(format('SELECT public.set_token_language(%L, %L)', tests.code('w6'), 'en'), '42501', NULL, 'staff cannot call set_token_language');
SELECT tests.logout();
SELECT tests.login_service();
SELECT lives_ok(format('SELECT public.set_token_language(%L, %L)', tests.code('w6'), 'en'), 'server sets the join page language');
SELECT throws_ok(format('SELECT public.set_token_language(%L, %L)', tests.code('w6'), 'fr'), '22023', NULL, 'ur or en only');
SELECT tests.logout();
SELECT is((SELECT language FROM public.notification_outbox WHERE id = tests.outbox('token_issued', 'w6')), 'en', 'pending token_issued switches language');

-- ---------------------------------------------------------------------------
-- Enqueue: your turn and 3 ahead, from the final state of call_next
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT public.call_next('d0000000-0000-4000-8000-00000000000a');   -- w1 called
SELECT tests.logout();
SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
SELECT isnt(tests.outbox('your_turn', 'w1'), NULL, 'your_turn for the called token');
SELECT is((SELECT count(*)::integer FROM public.notification_outbox WHERE event = 'three_ahead'), 1, 'one "3 ahead" message');
SELECT isnt(tests.outbox('three_ahead', 'w5'), NULL, '"3 ahead" goes to w5 (w2, w3, w4 ahead)');

SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT public.call_next('d0000000-0000-4000-8000-00000000000a');   -- w1 completed, w2 called
SELECT tests.logout();
SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
SELECT is(tests.outbox('three_ahead', 'w4'), NULL, 'w4 never gets "3 ahead": call_next is seen after both updates');
SELECT isnt(tests.outbox('three_ahead', 'w6'), NULL, 'next "3 ahead" is w6');
SELECT is((SELECT language FROM public.notification_outbox WHERE id = tests.outbox('three_ahead', 'w6')), 'en', 'patient''s preferred language');

SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT public.recall_token(tests.id('w2'));
SELECT tests.logout();
SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
SELECT is((SELECT count(*)::integer FROM public.notification_outbox WHERE event = 'your_turn' AND appointment_id = tests.id('w2')), 1, 'calling again does not message again');

-- ---------------------------------------------------------------------------
-- Enqueue: doctor late / break, to everyone still waiting
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000004');
SELECT public.set_doctor_late('d0000000-0000-4000-8000-00000000000a', 20);
SELECT tests.logout();
SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
SELECT is((SELECT count(*)::integer FROM public.notification_outbox WHERE event = 'doctor_late'), 4, 'doctor_late to the 4 waiting patients with a phone');
SELECT ok((SELECT bool_and(payload ? 'late_until') FROM public.notification_outbox WHERE event = 'doctor_late'), 'late messages carry the time');

SELECT tests.login('a0000000-0000-4000-8000-000000000004');
SELECT public.set_doctor_break('d0000000-0000-4000-8000-00000000000a', true);
SELECT tests.logout();
SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
SELECT is((SELECT count(*)::integer FROM public.notification_outbox WHERE event = 'doctor_break'), 4, 'doctor_break to the same 4');

-- ---------------------------------------------------------------------------
-- Worker: claim
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT throws_ok($$SELECT * FROM public.claim_notifications(10)$$, '42501', NULL, 'staff cannot claim');
SELECT tests.logout();

-- w1 was completed by the second call_next: its your_turn is no longer useful.
SELECT tests.login_service();
CREATE TEMP TABLE claimed ON COMMIT DROP AS SELECT * FROM public.claim_notifications(100);
SELECT tests.logout();
SELECT is((SELECT status FROM public.notification_outbox WHERE id = tests.outbox('your_turn', 'w1')), 'skipped', 'stale your_turn skipped at claim time');
SELECT ok((SELECT last_error LIKE 'no longer relevant%' FROM public.notification_outbox WHERE id = tests.outbox('your_turn', 'w1')), '... with the reason');
SELECT ok((SELECT count(*) > 0 AND bool_and(status = 'sending' AND attempts = 1 AND locked_until > now())
           FROM public.notification_outbox WHERE id IN (SELECT id FROM claimed)), 'claimed rows are sending, attempt 1, locked');
SELECT ok((SELECT bool_and('sms' = ANY (modules)) FROM claimed), 'claim returns the clinic''s modules (channel choice)');
SELECT tests.login_service();
SELECT is_empty($$SELECT * FROM public.claim_notifications(100)$$, 'a locked row is not claimed twice');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- Worker: charge once, retry without charging, succeed
-- ---------------------------------------------------------------------------
SELECT tests.login_service();
SELECT is((public.begin_notification_send(tests.outbox('token_issued', 'w3'), 'sms', 1)->>'charged')::boolean, true, 'first send charges');
SELECT tests.logout();
SELECT is(tests.credits(), 2, '3 -> 2 credits');
SELECT is((SELECT status || '|' || template || '|' || cost FROM public.message_log
           WHERE id = (SELECT message_log_id FROM public.notification_outbox WHERE id = tests.outbox('token_issued', 'w3'))),
          'queued|token_issued:ur|1', 'message_log row: queued, template, cost');

SELECT tests.login_service();
SELECT is((public.begin_notification_send(tests.outbox('token_issued', 'w3'), 'sms', 1)->>'charged')::boolean, false, 'second begin does not charge');
SELECT is(public.finish_notification_send(tests.outbox('token_issued', 'w3'), false, NULL, 'HTTP 503', true), 'pending', 'retryable failure: back to pending');
SELECT tests.logout();
SELECT is(tests.credits(), 2, 'a retry keeps the one charge');
SELECT ok((SELECT next_attempt_at > now() AND locked_until IS NULL FROM public.notification_outbox WHERE id = tests.outbox('token_issued', 'w3')), 'retry is scheduled later (backoff)');

UPDATE public.notification_outbox SET next_attempt_at = now() - interval '1 second' WHERE id = tests.outbox('token_issued', 'w3');
SELECT tests.login_service();
SELECT is((SELECT attempts FROM public.claim_notifications(100) c WHERE c.id = tests.outbox('token_issued', 'w3')), 2, 'claimed again: attempt 2');
SELECT is((public.begin_notification_send(tests.outbox('token_issued', 'w3'), 'sms', 1)->>'charged')::boolean, false, 'attempt 2 does not charge');
SELECT is(public.finish_notification_send(tests.outbox('token_issued', 'w3'), true, 'prov-123'), 'sent', 'sent');
SELECT is(public.finish_notification_send(tests.outbox('token_issued', 'w3'), false, NULL, 'late duplicate', false), 'sent', 'a late duplicate finish changes nothing');
SELECT tests.logout();
SELECT is(tests.credits(), 2, 'still one credit spent for that message');
SELECT is((SELECT status || '|' || provider_message_id FROM public.message_log
           WHERE id = (SELECT message_log_id FROM public.notification_outbox WHERE id = tests.outbox('token_issued', 'w3'))), 'sent|prov-123', 'message_log: sent with the provider id');

-- ---------------------------------------------------------------------------
-- Worker: final failure refunds once
-- ---------------------------------------------------------------------------
SELECT tests.login_service();
SELECT public.begin_notification_send(tests.outbox('token_issued', 'w4'), 'sms', 1);
SELECT tests.logout();
SELECT is(tests.credits(), 1, 'charged 2 -> 1');
SELECT tests.login_service();
SELECT is(public.finish_notification_send(tests.outbox('token_issued', 'w4'), false, NULL, 'invalid number', false), 'failed', 'permanent failure: failed');
SELECT is(public.finish_notification_send(tests.outbox('token_issued', 'w4'), false, NULL, 'again', false), 'failed', 'finishing again does nothing');
SELECT tests.logout();
SELECT is(tests.credits(), 2, 'credit given back exactly once');
SELECT ok((SELECT status = 'failed' AND refunded_at IS NOT NULL FROM public.message_log
           WHERE id = (SELECT message_log_id FROM public.notification_outbox WHERE id = tests.outbox('token_issued', 'w4'))), 'message_log failed and marked refunded');

-- ---------------------------------------------------------------------------
-- Worker: no credits / no module -> skipped, nothing charged
-- ---------------------------------------------------------------------------
UPDATE public.message_credits SET balance = 0
WHERE organization_id = (SELECT organization_id FROM public.service_centers WHERE id = '521f1349-05c4-4417-9fa5-5289963af7db');
SELECT tests.login_service();
SELECT is((public.begin_notification_send(tests.outbox('token_issued', 'w5'), 'sms', 1)->>'skipped')::boolean, true, 'no credits: skipped');
SELECT tests.logout();
SELECT is((SELECT status || '|' || (message_log_id IS NULL)::text FROM public.notification_outbox WHERE id = tests.outbox('token_issued', 'w5')),
          'skipped|true', '... no message_log row');

UPDATE public.message_credits SET balance = 5
WHERE organization_id = (SELECT organization_id FROM public.service_centers WHERE id = '521f1349-05c4-4417-9fa5-5289963af7db');
SELECT tests.login_service();
SELECT is((public.begin_notification_send(tests.outbox('token_issued', 'w6'), 'whatsapp', 1)->>'skipped')::boolean, true, 'channel not in the plan (whatsapp on Clinic): skipped');
SELECT public.skip_notification(tests.outbox('three_ahead', 'w6'), 'no provider configured');
SELECT tests.logout();
SELECT is((SELECT status FROM public.notification_outbox WHERE id = tests.outbox('three_ahead', 'w6')), 'skipped', 'skip_notification');
SELECT is(tests.credits(), 5, 'skips never charge');

-- A worker that died: its lock expires and the row is claimed again.
UPDATE public.notification_outbox SET locked_until = now() - interval '1 second' WHERE id = tests.outbox('token_issued', 'w2');
SELECT tests.login_service();
SELECT is((SELECT attempts FROM public.claim_notifications(100) c WHERE c.id = tests.outbox('token_issued', 'w2')), 2, 'abandoned row reclaimed after its lock');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- Cron
-- ---------------------------------------------------------------------------
SELECT set_eq($$SELECT jobname FROM cron.job$$, ARRAY['send-notifications', 'cleanup-stale-appointments', 'prune-notification-outbox', 'expire-unpaid-tokens', 'plan-lifecycle'], 'five cron jobs (2A: expire-unpaid-tokens, 2B: plan-lifecycle)');
SELECT is((SELECT schedule FROM cron.job WHERE jobname = 'send-notifications'), '* * * * *', 'outbox worker every minute');
UPDATE public.notification_outbox SET status = 'pending', next_attempt_at = now() - interval '1 second', locked_until = NULL
WHERE id = tests.outbox('doctor_late', 'w5');
SELECT is(private.kick_notification_worker(), NULL, 'due rows but no Vault secrets: the kick does nothing (and does not fail)');

-- ---------------------------------------------------------------------------
-- cleanup_stale_appointments: only moves the status trigger allows
-- ---------------------------------------------------------------------------
-- Slot bookings: e1 confirmed / e2 pending 2h ago, e3 confirmed 20 min ago, e4 called 2h ago.
UPDATE public.appointments SET scheduled_at = now() - interval '2 hours'
WHERE id IN ('e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000004');
UPDATE public.appointments SET scheduled_at = now() - interval '20 minutes' WHERE id = 'e0000000-0000-4000-8000-000000000003';
UPDATE public.appointments SET status = 'called' WHERE id = 'e0000000-0000-4000-8000-000000000004';
-- Tokens from yesterday: w2 called, w3 waiting, w4 with the doctor.
UPDATE public.appointments SET status = 'called' WHERE id = tests.id('w4');
UPDATE public.appointments SET status = 'in_progress' WHERE id = tests.id('w4');
UPDATE public.appointments SET appointment_date = appointment_date - 1 WHERE id IN (tests.id('w2'), tests.id('w3'), tests.id('w4'));

SELECT is(public.cleanup_stale_appointments(), '{"missed_check_in": 2, "slots_closed": 2, "tokens_closed": 2}'::jsonb,
          'cleanup runs through (it used to abort on confirmed -> no_show) and reports what it closed');
SELECT is((SELECT string_agg(status, ',' ORDER BY id) FROM public.appointments WHERE id IN (
             'e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002',
             'e0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000004')),
          'expired,expired,expired,no_show', 'slots: missed check-in and ended -> expired, called -> no_show');
SELECT is((SELECT status FROM public.appointments WHERE id = tests.id('w2')) || ',' ||
          (SELECT status FROM public.appointments WHERE id = tests.id('w3')) || ',' ||
          (SELECT status FROM public.appointments WHERE id = tests.id('w4')),
          'no_show,expired,in_progress', 'yesterday''s tokens: called -> no_show, waiting -> expired, with the doctor untouched');
SELECT is((SELECT status FROM public.appointments WHERE id = tests.id('w5')), 'checked_in', 'today''s tokens untouched');

SELECT * FROM finish();
ROLLBACK;
