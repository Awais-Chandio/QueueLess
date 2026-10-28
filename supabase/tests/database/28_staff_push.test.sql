-- Phase 2C: walk-ins never skip the fee (issue_token -> issue_walk_in), staff push
-- notifications (fee_claim to reception, paid_waiting to the doctor) and the worker RPCs.
-- Run with: supabase test db. Uses the seed accounts (supabase/seed.sql). Rolled back.
-- Deferred triggers (paid_waiting) fire on SET CONSTRAINTS ALL IMMEDIATE.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO anon, authenticated, service_role;
CREATE SCHEMA tests;
GRANT USAGE ON SCHEMA tests TO anon, authenticated, service_role;
CREATE FUNCTION tests.login(p_user uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true),
         set_config('role', 'authenticated', true);
$$;
CREATE FUNCTION tests.login_server() RETURNS void LANGUAGE sql AS $$
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
CREATE FUNCTION tests.pay(p_label text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS
  'SELECT a.status || ''|'' || COALESCE(a.payment_status, ''-'') FROM public.appointments a WHERE a.public_code = tests.code(p_label)';
-- Push rows for one appointment: "user|kind" sorted.
CREATE FUNCTION tests.pushes(p_label text) RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(array_agg(right(o.user_id::text, 2) || '|' || o.kind ORDER BY o.kind, o.user_id), '{}')
  FROM public.push_outbox o WHERE o.appointment_id = tests.id(p_label)
$$;
CREATE FUNCTION tests.push_text(p_label text, p_kind text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT o.title || ' / ' || o.body FROM public.push_outbox o
  WHERE o.appointment_id = tests.id(p_label) AND o.kind = p_kind ORDER BY o.created_at LIMIT 1
$$;
CREATE FUNCTION tests.walk_in(p_doctor uuid, p_name text, p_received boolean) RETURNS text LANGUAGE sql AS
  $$SELECT public_code FROM public.issue_walk_in(p_doctor, p_name, NULL, p_received)$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO anon, authenticated, service_role;

-- Seed: center A 521f.. (owner A a..09, receptionist A a..02, Dr. A d..0a fee 1000, account a..04),
-- center B d2c1.. (receptionist B a..03). Center A: fee before, on the trial (fees on).
-- Dr. Free (no fee, no account) and Dr. Owner (the owner's own doctor row, fee 500).
UPDATE public.appointments SET appointment_date = appointment_date - 7 WHERE doctor_id = 'd0000000-0000-4000-8000-00000000000a';
INSERT INTO public.doctors (id, center_id, name, specialty, fee, profile_id, created_at) VALUES
  ('d0000000-0000-4000-8000-0000000000f1', '521f1349-05c4-4417-9fa5-5289963af7db', 'Dr. Free', 'General Physician', 0, NULL, now() - interval '1 day'),
  ('d0000000-0000-4000-8000-0000000000f2', '521f1349-05c4-4417-9fa5-5289963af7db', 'Dr. Owner', 'General Physician', 500,
   'a0000000-0000-4000-8000-000000000009', now() - interval '1 day');
-- The app on the owner's, receptionists' and Dr. A's phones.
DELETE FROM public.device_tokens;
INSERT INTO public.device_tokens (user_id, fcm_token, platform) VALUES
  ('a0000000-0000-4000-8000-000000000009', 'tok-owner', 'android'),
  ('a0000000-0000-4000-8000-000000000002', 'tok-recA', 'android'),
  ('a0000000-0000-4000-8000-000000000003', 'tok-recB', 'android'),
  ('a0000000-0000-4000-8000-000000000004', 'tok-docA', 'android'),
  ('a0000000-0000-4000-8000-000000000004', 'tok-docA-old', 'ios');

SELECT tests.login('a0000000-0000-4000-8000-000000000009');
SELECT public.set_center_fee_settings('521f1349-05c4-4417-9fa5-5289963af7db', 'before', 30, '03001234567', 'Shifa Clinic');
SELECT tests.logout();

SELECT plan(34);

-- ---------------------------------------------------------------------------
-- 2C.1 walk-ins: issue_token (old app builds) no longer skips the fee
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
INSERT INTO tests.codes SELECT 'old', public_code FROM public.issue_token('d0000000-0000-4000-8000-00000000000a', 'Old App', NULL, 'walk_in');
INSERT INTO tests.codes SELECT 'old-free', public_code FROM public.issue_token('d0000000-0000-4000-8000-0000000000f1', 'No Fee', NULL, 'walk_in');
SELECT is(tests.pay('old'), 'pending|awaiting', 'old app walk-in, doctor with a fee: waits in "Fee pending"');
SELECT is(tests.pay('old-free'), 'checked_in|-', 'doctor without a fee: a plain walk-in, as before');
SELECT is((SELECT count(*)::int FROM public.visit_payments WHERE appointment_id = tests.id('old')), 0, 'no payment was recorded for it');
SELECT throws_ok($$SELECT public.issue_token('d0000000-0000-4000-8000-00000000000b', 'X', NULL, 'walk_in')$$, '42501', NULL,
                 'still: no walk-ins at another clinic');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000006');
SELECT throws_ok($$SELECT public.issue_token('d0000000-0000-4000-8000-00000000000a', 'X', NULL, 'walk_in')$$, '42501', NULL,
                 'a patient cannot issue a walk-in');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- fee_claim: owners + the center's receptionists, not other centers, not the doctor
-- ---------------------------------------------------------------------------
SELECT tests.login_server();
INSERT INTO tests.codes SELECT 'q1', public_code
FROM public.issue_public_token('d0000000-0000-4000-8000-00000000000a', 'Sana Bibi', '03004440001', 'qr', 'liaquat-university-hospital');
SELECT tests.logout();
SELECT is(tests.pushes('q1'), '{}'::text[], 'a QR token waiting for its fee: no push yet');
SELECT tests.login_server();
SELECT public.submit_payment_claim(tests.code('q1'), 'easypaisa', 'ep 7788 1234');
SELECT tests.logout();
SELECT is(tests.pushes('q1'), ARRAY['02|fee_claim', '09|fee_claim'], 'online claim: owner and center A''s receptionist');
SELECT matches(tests.push_text('q1', 'fee_claim'), '^Online payment to check / Token \d+ · Sana Bibi · Easypaisa Rs 1,000 · TID EP77881234$',
               'title and body: token, patient, method, amount, TID');
SELECT is((SELECT data->>'type' || '|' || (data->>'center_id') FROM public.push_outbox WHERE appointment_id = tests.id('q1') LIMIT 1),
          'fee_claim|521f1349-05c4-4417-9fa5-5289963af7db', 'data says what it is and where (strings for FCM)');

-- Verify: the token joins the line -> Dr. A (who has the app) hears about it.
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT public.verify_claim((SELECT id FROM public.visit_payments WHERE appointment_id = tests.id('q1') AND status = 'claimed'), true);
SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
SELECT tests.logout();
SELECT is(tests.pushes('q1'), ARRAY['02|fee_claim', '09|fee_claim', '04|paid_waiting'], 'verified: the doctor gets "paid and waiting"');
SELECT matches(tests.push_text('q1', 'paid_waiting'), '^Token \d+ is waiting / Sana Bibi · Fee paid Rs 1,000$', 'doctor push text');

-- ---------------------------------------------------------------------------
-- paid_waiting from the desk: walk-in with the fee, fee sheet, free
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
INSERT INTO tests.codes VALUES ('w-paid', tests.walk_in('d0000000-0000-4000-8000-00000000000a', 'Cash Walkin', true));
SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
SELECT is(tests.pushes('w-paid'), ARRAY['04|paid_waiting'], 'walk-in with the fee in one step: the doctor hears');
INSERT INTO tests.codes VALUES ('w-later', tests.walk_in('d0000000-0000-4000-8000-00000000000a', 'Fee Later', false));
SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
SELECT is(tests.pushes('w-later'), '{}'::text[], 'walk-in without the fee: nothing until it is paid');
SELECT public.waive_fee(tests.id('w-later'), 'follow_up');
SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
SELECT matches(tests.push_text('w-later', 'paid_waiting'), '^Token \d+ is waiting / Fee Later · Free visit$', 'free: "Free visit"');
SELECT public.record_payment(tests.id('old'), 1000, 'cash');
SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
SELECT is(tests.pushes('old'), ARRAY['04|paid_waiting'], 'fee sheet "Paid": the doctor hears');
INSERT INTO tests.codes VALUES ('w-nofee', tests.walk_in('d0000000-0000-4000-8000-0000000000f1', 'Free Doc', true));
SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
SELECT is(tests.pushes('w-nofee'), '{}'::text[], 'a doctor without an account (and no fee): nothing');
SELECT tests.logout();

-- The owner-doctor takes their own patient's fee at the desk: no push to themselves.
SELECT tests.login('a0000000-0000-4000-8000-000000000009');
INSERT INTO tests.codes VALUES ('w-self', tests.walk_in('d0000000-0000-4000-8000-0000000000f2', 'Own Patient', true));
SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
SELECT is(tests.pushes('w-self'), '{}'::text[], 'owner-doctor settled it: no push to themselves');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
INSERT INTO tests.codes VALUES ('w-own', tests.walk_in('d0000000-0000-4000-8000-0000000000f2', 'Owner Patient', true));
SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
SELECT is(tests.pushes('w-own'), ARRAY['09|paid_waiting'], 'the receptionist settled it: the owner-doctor hears');
SELECT tests.logout();

-- Without the app (no device token): nothing is queued.
DELETE FROM public.device_tokens WHERE user_id = 'a0000000-0000-4000-8000-000000000009';
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
INSERT INTO tests.codes VALUES ('w-noapp', tests.walk_in('d0000000-0000-4000-8000-0000000000f2', 'No App', true));
SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
SELECT is(tests.pushes('w-noapp'), '{}'::text[], 'the doctor has no device token: nothing queued');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000009');
SELECT throws_ok($$SELECT count(*) FROM public.push_outbox$$, '42501', NULL, 'clients cannot read the push outbox');
SELECT throws_ok($$SELECT * FROM public.claim_push(10)$$, '42501', NULL, 'clients cannot claim pushes');
SELECT throws_ok($$SELECT public.forget_device_tokens(ARRAY['tok-recA'])$$, '42501', NULL, 'clients cannot drop device tokens');
SELECT tests.logout();
SELECT ok(NOT has_function_privilege('anon', 'public.finish_push(uuid,boolean,text,boolean)', 'execute')
          AND NOT has_function_privilege('authenticated', 'public.finish_push(uuid,boolean,text,boolean)', 'execute')
          AND has_function_privilege('service_role', 'public.claim_push(integer,integer)', 'execute'), 'worker RPCs: service role only');

-- ---------------------------------------------------------------------------
-- Worker RPCs
-- ---------------------------------------------------------------------------
-- q1's claim was verified before the worker ran; q2's claim is still open.
SELECT tests.login_server();
INSERT INTO tests.codes SELECT 'q2', public_code
FROM public.issue_public_token('d0000000-0000-4000-8000-00000000000a', 'Open Claim', '03004440002', 'qr', 'liaquat-university-hospital');
SELECT public.submit_payment_claim(tests.code('q2'), 'easypaisa', 'EP99990000');
SELECT tests.logout();
UPDATE public.push_outbox SET created_at = now() - interval '31 minutes' WHERE appointment_id = tests.id('w-paid');

SELECT tests.login_server();
CREATE TEMP TABLE claimed ON COMMIT DROP AS SELECT * FROM public.claim_push(100);
SELECT tests.logout();
SELECT is((SELECT status || '|' || last_error FROM public.push_outbox
           WHERE appointment_id = tests.id('q1') AND user_id = 'a0000000-0000-4000-8000-000000000002'),
          'skipped|claim already handled', 'a claim verified before the worker ran is not pushed');
SELECT is((SELECT status || '|' || last_error FROM public.push_outbox
           WHERE appointment_id = tests.id('q1') AND user_id = 'a0000000-0000-4000-8000-000000000009'),
          'skipped|no device', 'the owner removed the app since: skipped');
SELECT is((SELECT status || '|' || last_error FROM public.push_outbox WHERE appointment_id = tests.id('w-paid')),
          'skipped|stale', 'older than 30 minutes: skipped');
SELECT is((SELECT array_agg(right(user_id::text, 2)) FROM claimed WHERE kind = 'fee_claim'), ARRAY['02'],
          'the open claim is sent to receptionist A');
SELECT ok((SELECT tokens FROM claimed WHERE user_id = 'a0000000-0000-4000-8000-000000000004' LIMIT 1) @> ARRAY['tok-docA', 'tok-docA-old'],
          'claimed with every device of the person');
SELECT is((SELECT count(*)::int FROM public.push_outbox WHERE status = 'sending'), (SELECT count(*)::int FROM claimed), 'claimed rows are "sending"');

INSERT INTO tests.codes SELECT 'push-claim', id::text FROM claimed WHERE kind = 'fee_claim';
INSERT INTO tests.codes SELECT 'push-old', id::text FROM public.push_outbox WHERE appointment_id = tests.id('old');
SELECT tests.login_server();
SELECT is(public.finish_push(tests.code('push-claim')::uuid, true), 'sent', 'sent');
SELECT is(public.finish_push(tests.code('push-old')::uuid, false, 'UNAVAILABLE', true), 'pending', 'retryable failure: back to pending');
SELECT is(public.finish_push(tests.code('push-claim')::uuid, false, 'late duplicate'), 'sent', 'a duplicate finish changes nothing');
SELECT is(public.forget_device_tokens(ARRAY['tok-docA-old', 'nope']), 1, 'gone tokens are deleted');
SELECT tests.logout();
SELECT ok((SELECT next_attempt_at > now() FROM public.push_outbox WHERE id = tests.code('push-old')::uuid), '... retried after a short wait');

SELECT * FROM finish();
ROLLBACK;
