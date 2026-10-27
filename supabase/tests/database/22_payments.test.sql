-- Phase 2A: fee settings, fee-before queue, visit payments, claims, expiry, records, income.
-- Run with: supabase test db. Uses the seed accounts (supabase/seed.sql). Rolled back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO anon, authenticated, service_role;
CREATE SCHEMA tests;
GRANT USAGE ON SCHEMA tests TO anon, authenticated, service_role;
CREATE FUNCTION tests.login(p_user uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true),
         set_config('role', 'authenticated', true);
$$;
CREATE FUNCTION tests.login_anon() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '{"role":"anon"}', true), set_config('role', 'anon', true);
$$;
-- The web server: public joins and payment claims, after Turnstile.
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
CREATE FUNCTION tests.appt(p_label text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS
  'SELECT a.status || ''|'' || COALESCE(a.payment_status, ''-'') || ''|'' || (a.checked_in_at IS NOT NULL)
   FROM public.appointments a WHERE a.public_code = tests.code(p_label)';
CREATE FUNCTION tests.claim(p_label text) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS
  'SELECT vp.id FROM public.visit_payments vp WHERE vp.appointment_id = tests.id(p_label) AND vp.status = ''claimed''';
CREATE FUNCTION tests.paid(p_label text) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS
  'SELECT vp.id FROM public.visit_payments vp WHERE vp.appointment_id = tests.id(p_label) AND vp.status = ''paid'' ORDER BY vp.created_at LIMIT 1';
CREATE FUNCTION tests.waiting_a() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT string_agg(t->>'token_number', ',' ORDER BY ord)
  FROM jsonb_array_elements(public.get_reception_queue('521f1349-05c4-4417-9fa5-5289963af7db')->'doctors') d,
       jsonb_array_elements(d->'tokens') WITH ORDINALITY AS x(t, ord)
  WHERE d->>'id' = 'd0000000-0000-4000-8000-00000000000a'
    AND t->>'status' IN ('pending', 'confirmed', 'checked_in') AND t->>'payment_status' IS DISTINCT FROM 'awaiting'
$$;
CREATE FUNCTION tests.num(p_label text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS
  'SELECT a.token_number::text FROM public.appointments a WHERE a.public_code = tests.code(p_label)';
CREATE FUNCTION tests.display_key() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS
  $$SELECT display_key FROM public.center_displays WHERE center_id = '521f1349-05c4-4417-9fa5-5289963af7db'$$;
CREATE FUNCTION tests.today() RETURNS date LANGUAGE sql STABLE AS $$SELECT (now() AT TIME ZONE 'Asia/Karachi')::date$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO anon, authenticated, service_role;

-- Seed: center A 521f.. (owner A a..09, receptionist A a..02, Dr. A d..0a fee 1000, account a..04),
-- center B d2c1.. (receptionist B a..03, Dr. B d..0b fee 1500, account a..05). Both on Free.
-- Dr. A's queue starts empty today.
UPDATE public.appointments SET appointment_date = appointment_date - 7 WHERE doctor_id = 'd0000000-0000-4000-8000-00000000000a';

SELECT plan(98);

-- ---------------------------------------------------------------------------
-- 1. Settings
-- ---------------------------------------------------------------------------
SELECT is((SELECT fee_mode || '|' || unpaid_expiry_minutes FROM public.center_payment_settings
           WHERE center_id = '521f1349-05c4-4417-9fa5-5289963af7db'), 'before|30', 'every center: fee before, 30 minutes');

SELECT tests.login_anon();
SELECT throws_ok($$SELECT 1 FROM public.center_payment_settings$$, '42501', NULL, 'anon: no access to fee settings');
SELECT tests.logout();

SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT throws_ok($$SELECT public.set_center_fee_settings('521f1349-05c4-4417-9fa5-5289963af7db', 'off', 30)$$,
                 '42501', NULL, 'receptionist: cannot change fee settings');
SELECT is((SELECT count(*)::int FROM public.center_payment_settings), 1, 'receptionist A: reads only center A''s settings');
SELECT tests.logout();

SELECT tests.login('a0000000-0000-4000-8000-000000000009');
SELECT throws_ok($$SELECT public.set_center_fee_settings('521f1349-05c4-4417-9fa5-5289963af7db', 'before', 5)$$,
                 '22023', NULL, 'expiry below 10 minutes refused');
SELECT throws_ok($$SELECT public.set_center_fee_settings('521f1349-05c4-4417-9fa5-5289963af7db', 'later', 30)$$,
                 '22023', NULL, 'unknown fee mode refused');
SELECT throws_ok($$SELECT public.set_center_fee_settings('521f1349-05c4-4417-9fa5-5289963af7db', 'before', 30, '03001234567')$$,
                 '22023', NULL, 'Easypaisa number without a title refused');
SELECT throws_ok($$SELECT public.set_center_fee_settings('521f1349-05c4-4417-9fa5-5289963af7db', 'before', 30,
                     p_bank_name => 'Meezan', p_bank_title => 'Shifa', p_bank_iban => 'PK00')$$,
                 '22023', NULL, 'short IBAN refused');
SELECT throws_ok($$SELECT public.set_center_fee_settings('d2c1a3df-bb89-4fde-b73d-5bb9ec763481', 'off', 30)$$,
                 '42501', NULL, 'owner A: cannot change clinic B');
SELECT is(public.set_center_fee_settings('521f1349-05c4-4417-9fa5-5289963af7db', 'before', 30,
            '+92 300 1234567', 'Shifa Clinic', NULL, NULL, 'Meezan Bank', 'Shifa Clinic', 'pk36 meez 0000 0011 2345 6702', '0311-2223334')
          - 'fee_mode' - 'unpaid_expiry_minutes' - 'jazzcash_number' - 'jazzcash_title',
          '{"easypaisa_number":"03001234567","easypaisa_title":"Shifa Clinic","bank_name":"Meezan Bank","bank_title":"Shifa Clinic","bank_iban":"PK36MEEZ0000001123456702","raast_id":"03112223334"}'::jsonb,
          'owner: accounts saved, numbers and IBAN tidied');
SELECT is((SELECT c->'fees'->>'fee_mode' FROM jsonb_array_elements(public.get_org_settings(
             (SELECT organization_id FROM public.service_centers WHERE id = '521f1349-05c4-4417-9fa5-5289963af7db'))->'centers') c
           WHERE c->>'id' = '521f1349-05c4-4417-9fa5-5289963af7db'), 'before', 'settings page shows the fee settings');
SELECT lives_ok($$SELECT public.upsert_doctor('521f1349-05c4-4417-9fa5-5289963af7db', 'd0000000-0000-4000-8000-00000000000a',
                    'Dr. A', 'General Physician', NULL, 8, true, 1500)$$, 'owner: doctor fee set to 1500');
SELECT is((SELECT d->>'fee' FROM jsonb_array_elements(public.get_org_settings(
             (SELECT organization_id FROM public.service_centers WHERE id = '521f1349-05c4-4417-9fa5-5289963af7db'))->'doctors') d
           WHERE d->>'id' = 'd0000000-0000-4000-8000-00000000000a'), '1500', 'settings page shows the doctor''s fee');
SELECT lives_ok($$SELECT public.upsert_doctor('521f1349-05c4-4417-9fa5-5289963af7db', 'd0000000-0000-4000-8000-00000000000a',
                    'Dr. A', 'General Physician', NULL, 8, true)$$, 'saving without a fee keeps it');
SELECT is((SELECT fee FROM public.doctors WHERE id = 'd0000000-0000-4000-8000-00000000000a'), 1500::numeric, 'fee kept');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- 2. Fee before: QR join waits for the fee, outside the line
-- ---------------------------------------------------------------------------
SELECT tests.login_server();
INSERT INTO tests.codes SELECT 'q1', public_code FROM public.issue_public_token('d0000000-0000-4000-8000-00000000000a', 'Qr One', '03001110001', 'qr');
SELECT tests.logout();
SELECT is(tests.appt('q1'), 'pending|awaiting|false', 'QR join: pending, awaiting the fee, not checked in');
SELECT is((SELECT fee_pkr FROM public.appointments WHERE id = tests.id('q1')), 1500, 'fee due = the doctor''s fee');

SELECT tests.login_anon();
SELECT is((SELECT s.status || '|' || s.payment_status || '|' || s.fee_pkr || '|' || s.fee_mode FROM public.get_token_status(tests.code('q1')) s),
          'unpaid|awaiting|1500|before', 'status page: unpaid, Rs 1500');
SELECT ok((SELECT s.payment_seconds_left BETWEEN 1790 AND 1800 FROM public.get_token_status(tests.code('q1')) s), 'status page: ~30 minutes left');
SELECT is((SELECT s.payment_accounts->'easypaisa'->>'number' || '|' || (s.payment_accounts->'bank'->>'iban') || '|' || (s.payment_accounts ? 'jazzcash')
           FROM public.get_token_status(tests.code('q1')) s), '03001234567|PK36MEEZ0000001123456702|false',
          'status page: the clinic''s complete accounts only');
SELECT tests.logout();

-- In the line: a walk-in paid at the desk; the unpaid QR token is not.
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT is((SELECT d->'fee' FROM jsonb_array_elements(public.get_reception_queue('521f1349-05c4-4417-9fa5-5289963af7db')->'doctors') d
           WHERE d->>'id' = 'd0000000-0000-4000-8000-00000000000a'), '1500'::jsonb, 'reception: doctor fee for the walk-in form');
SELECT is(public.get_reception_queue('521f1349-05c4-4417-9fa5-5289963af7db')->'fees'->>'fee_mode', 'before', 'reception: fee mode');
INSERT INTO tests.codes SELECT 'w1', public_code FROM public.issue_walk_in('d0000000-0000-4000-8000-00000000000a', 'Walk One', '03002220001');
SELECT tests.logout();
SELECT is(tests.appt('w1'), 'checked_in|paid|true', 'walk-in, fee received (default): paid and in the line in one step');
SELECT is((SELECT amount_pkr || '|' || method || '|' || status || '|' || (received_by = 'a0000000-0000-4000-8000-000000000002')
           FROM public.visit_payments WHERE appointment_id = tests.id('w1')), '1500|cash|paid|true',
          'walk-in payment: doctor''s fee, cash, received by the receptionist');

SELECT tests.login_anon();
SELECT is((SELECT people_ahead FROM public.get_token_status(tests.code('w1'))), 0, 'the unpaid QR token is not ahead of the walk-in');
SELECT is((SELECT people_ahead FROM public.get_token_status(tests.code('q1'))), 1, 'unpaid QR token: would join behind everyone waiting');
SELECT is((SELECT (d->>'waiting')::int FROM jsonb_array_elements(public.get_public_center('liaquat-university-hospital')->'doctors') d
           WHERE d->>'id' = 'd0000000-0000-4000-8000-00000000000a'), 1, 'join page: waiting count leaves out unpaid tokens');
SELECT is((SELECT d->'next' FROM jsonb_array_elements(public.get_display_snapshot(
             tests.display_key())->'doctors') d
           WHERE d->>'name' = 'Dr. A'), jsonb_build_array(tests.num('w1')::int), 'TV: unpaid token not in "next"');
SELECT tests.logout();

SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT is((SELECT d->'tokens'->-1->>'payment_status' FROM jsonb_array_elements(public.get_reception_queue('521f1349-05c4-4417-9fa5-5289963af7db')->'doctors') d
           WHERE d->>'id' = 'd0000000-0000-4000-8000-00000000000a'), 'awaiting', 'reception: unpaid token listed after the line');
SELECT is((SELECT token_number FROM public.call_next('d0000000-0000-4000-8000-00000000000a'))::text, tests.num('w1'), 'call_next: calls the paid walk-in');
SELECT is((SELECT count(*)::int FROM public.call_next('d0000000-0000-4000-8000-00000000000a')), 0, 'call_next: never calls an unpaid token');
SELECT is(tests.appt('q1'), 'pending|awaiting|false', 'the unpaid token is untouched');
SELECT tests.logout();

-- Doctor app: payment status per token, unpaid sorted out of the line.
SELECT tests.login('a0000000-0000-4000-8000-000000000004');
SELECT is((SELECT string_agg(t->>'payment_status', ',' ORDER BY o) FROM jsonb_array_elements(public.get_doctor_queue('d0000000-0000-4000-8000-00000000000a')->'tokens')
           WITH ORDINALITY x(t, o)), 'awaiting,paid', 'doctor queue: unpaid before done tokens, payment status on each');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- 3. Walk-in without the fee; queue order follows payment time
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
INSERT INTO tests.codes SELECT 'w2', public_code FROM public.issue_walk_in('d0000000-0000-4000-8000-00000000000a', 'Walk Two', NULL, false);
SELECT is(tests.appt('w2'), 'pending|awaiting|false', 'walk-in, fee not received: waits for the fee');
SELECT throws_ok($$SELECT public.issue_walk_in('d0000000-0000-4000-8000-00000000000a', 'Walk X', NULL, true, 0)$$,
                 '22023', NULL, 'walk-in: amount 0 refused (use Free)');
SELECT throws_ok($$SELECT public.issue_walk_in('d0000000-0000-4000-8000-00000000000a', 'Walk X', NULL, true, 1500, 'bitcoin')$$,
                 '22023', NULL, 'walk-in: unknown method refused');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000006');
SELECT throws_ok($$SELECT public.issue_walk_in('d0000000-0000-4000-8000-00000000000a', 'Walk X', NULL)$$,
                 '42501', NULL, 'patient: cannot issue walk-ins');
SELECT tests.logout();

-- q2 joined 20 minutes ago, w3 was checked in 10 minutes ago; q2 pays now.
SELECT tests.login_server();
INSERT INTO tests.codes SELECT 'q2', public_code FROM public.issue_public_token('d0000000-0000-4000-8000-00000000000a', 'Qr Two', '03001110002', 'qr');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
INSERT INTO tests.codes SELECT 'w3', public_code FROM public.issue_walk_in('d0000000-0000-4000-8000-00000000000a', 'Walk Three', NULL);
SELECT tests.logout();
UPDATE public.appointments SET created_at = now() - interval '20 minutes' WHERE id = tests.id('q2');
UPDATE public.appointments SET created_at = now() - interval '10 minutes', checked_in_at = now() - interval '10 minutes' WHERE id = tests.id('w3');

SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT throws_ok(format($$SELECT public.record_payment(%L, 0, 'cash')$$, tests.id('q2')), '22023', NULL, 'record_payment: amount 0 refused');
SELECT is(public.record_payment(tests.id('q2'), 1500, 'cash')->>'payment_status', 'paid', 'record_payment: cash at the desk');
SELECT is(tests.appt('q2'), 'checked_in|paid|true', 'paid QR token: checked in now');
SELECT is(tests.waiting_a(), tests.num('w3') || ',' || tests.num('q2'), 'line order = payment / check-in time, not join time');
SELECT throws_ok(format($$SELECT public.record_payment(%L, 1500, 'cash')$$, tests.id('q2')), 'PT409', NULL, 'record_payment: twice refused');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- 4. Online claims (server only)
-- ---------------------------------------------------------------------------
SELECT tests.login_anon();
SELECT throws_ok(format($$SELECT public.submit_payment_claim(%L, 'easypaisa', '12345678901')$$, tests.code('q1')), '42501', NULL,
                 'anon: cannot submit a claim directly');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000006');
SELECT throws_ok(format($$SELECT public.submit_payment_claim(%L, 'easypaisa', '12345678901')$$, tests.code('q1')), '42501', NULL,
                 'signed-in patient: cannot submit a claim directly');
SELECT tests.logout();

SELECT tests.login_server();
SELECT throws_ok(format($$SELECT public.submit_payment_claim(%L, 'easypaisa', '123')$$, tests.code('q1')), '22023', NULL, 'TID shorter than 4 refused');
SELECT throws_ok(format($$SELECT public.submit_payment_claim(%L, 'easypaisa', '1234567890123456789012345678901')$$, tests.code('q1')), '22023', NULL,
                 'TID longer than 30 refused');
SELECT throws_ok(format($$SELECT public.submit_payment_claim(%L, 'jazzcash', '12345678901')$$, tests.code('q1')), '22023', NULL,
                 'a method the clinic has no account for is refused');
SELECT throws_ok(format($$SELECT public.submit_payment_claim(%L, 'easypaisa', '12345678901')$$, tests.code('w1')), 'PT409', NULL,
                 'a paid token cannot be claimed');
SELECT is(public.submit_payment_claim(tests.code('q1'), 'easypaisa', ' 1234 5678 901 '), '{"status":"claimed","method":"easypaisa","amount_pkr":1500}'::jsonb,
          'claim accepted (no ids returned)');
SELECT throws_ok(format($$SELECT public.submit_payment_claim(%L, 'bank', 'FT2610271234')$$, tests.code('q1')), 'PT409', NULL,
                 'duplicate claim blocked: one open claim at a time');
INSERT INTO tests.codes SELECT 'q3', public_code FROM public.issue_public_token('d0000000-0000-4000-8000-00000000000a', 'Qr Three', '03001110003', 'qr');
SELECT throws_ok(format($$SELECT public.submit_payment_claim(%L, 'easypaisa', '12345678901')$$, tests.code('q3')), 'PT409', NULL,
                 'the same TID cannot pay for another token');
SELECT tests.logout();

SELECT tests.login_anon();
SELECT is((SELECT s.status || '|' || s.payment_claim FROM public.get_token_status(tests.code('q1')) s), 'unpaid|checking', 'status page: reception is checking');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT is((SELECT t->'claim'->>'reference' || '|' || (t->'claim'->>'method')
           FROM jsonb_array_elements(public.get_reception_queue('521f1349-05c4-4417-9fa5-5289963af7db')->'doctors') d,
                jsonb_array_elements(d->'tokens') t WHERE t->>'id' = tests.id('q1')::text), '12345678901|easypaisa', 'reception: claim with method and TID');
SELECT throws_ok(format($$SELECT public.record_payment(%L, 1500, 'cash')$$, tests.id('q1')), 'PT409', NULL,
                 'cash refused while an online claim waits (verify or reject first)');
SELECT throws_ok(format($$SELECT public.verify_claim(%L, false)$$, tests.claim('q1')), '22023', NULL, 'reject needs a reason');
SELECT is(public.verify_claim(tests.claim('q1'), false, 'not_received')->>'status', 'rejected', 'desk rejects: not received');
SELECT tests.logout();

SELECT tests.login_anon();
SELECT is((SELECT s.status || '|' || s.payment_rejected_reason || '|' || COALESCE(s.payment_claim, '-') FROM public.get_token_status(tests.code('q1')) s),
          'unpaid|not_received|-', 'status page: rejected with the reason, still unpaid');
SELECT tests.logout();

SELECT tests.login_server();
SELECT lives_ok(format($$SELECT public.submit_payment_claim(%L, 'bank', 'FT2610271234')$$, tests.code('q1')), 'after a rejection the patient can claim again');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000003');
SELECT throws_ok(format($$SELECT public.verify_claim(%L, true)$$, tests.claim('q1')), '42501', NULL, 'receptionist B: cannot verify clinic A''s claim');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT is(public.verify_claim(tests.claim('q1'), true)->>'payment_status', 'paid', 'desk verifies the claim');
SELECT is(tests.appt('q1'), 'checked_in|paid|true', 'verified: paid and in the line');
SELECT throws_ok(format($$SELECT public.verify_claim(%L, true)$$, (SELECT id FROM public.visit_payments WHERE appointment_id = tests.id('q1') AND status = 'paid')),
                 'PT409', NULL, 'a handled claim cannot be verified again');
SELECT tests.logout();
SELECT tests.login_anon();
SELECT is((SELECT s.status || '|' || s.payment_status || '|' || (s.payment_accounts IS NULL) FROM public.get_token_status(tests.code('q1')) s),
          'waiting|paid|true', 'status page: paid, in line, no accounts shown any more');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- 5. Waive
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT throws_ok(format($$SELECT public.waive_fee(%L, 'friend')$$, tests.id('w2')), '22023', NULL, 'waive: reason must be one of the four');
SELECT is(public.waive_fee(tests.id('w2'), 'follow_up')->>'payment_status', 'waived', 'waive: follow-up visit is free');
SELECT is(tests.appt('w2'), 'checked_in|waived|true', 'waived token joins the line');
SELECT is((SELECT amount_pkr || '|' || COALESCE(method, '-') || '|' || reason FROM public.visit_payments WHERE appointment_id = tests.id('w2')),
          '0|-|follow_up', 'waive row: amount 0, reason kept');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- 6. Expiry (pg_cron job function)
-- ---------------------------------------------------------------------------
SELECT tests.login_server();
INSERT INTO tests.codes SELECT 'q4', public_code FROM public.issue_public_token('d0000000-0000-4000-8000-00000000000a', 'Qr Four', '03001110004', 'qr');
INSERT INTO tests.codes SELECT 'q5', public_code FROM public.issue_public_token('d0000000-0000-4000-8000-00000000000a', 'Qr Five', '03001110005', 'qr');
SELECT lives_ok(format($$SELECT public.submit_payment_claim(%L, 'easypaisa', '55555555555')$$, tests.code('q5')), 'q5 claims online');
SELECT tests.logout();
UPDATE public.appointments SET created_at = now() - interval '31 minutes' WHERE id IN (tests.id('q3'), tests.id('q4'), tests.id('q5'));
UPDATE public.appointments SET created_at = now() - interval '29 minutes' WHERE id = tests.id('q1');
SELECT is(private.expire_unpaid_tokens(), 2, 'expiry: two unpaid tokens past 30 minutes');
SELECT is(tests.appt('q4'), 'expired|awaiting|false', 'expired: unpaid QR token older than 30 minutes');
SELECT is(tests.appt('q5'), 'pending|awaiting|false', 'never expires a token whose online claim waits for the desk');
SELECT is(tests.appt('w2'), 'checked_in|waived|true', 'waived / paid tokens are never expired');
SELECT is((SELECT schedule || '|' || command FROM cron.job WHERE jobname = 'expire-unpaid-tokens'),
          '* * * * *|SELECT private.expire_unpaid_tokens()', 'pg_cron runs the expiry every minute');
SELECT tests.login_anon();
SELECT is((SELECT status FROM public.get_token_status(tests.code('q4'))), 'expired', 'status page: expired');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT throws_ok(format($$SELECT public.record_payment(%L, 1500, 'cash')$$, tests.id('q4')), 'PT409', NULL, 'an expired token cannot be paid');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- 7. Append-only, access, isolation
-- ---------------------------------------------------------------------------
SELECT throws_ok($$DELETE FROM public.visit_payments$$, '42501', NULL, 'payments are never deleted (even by the table owner)');
SELECT throws_ok(format($$UPDATE public.visit_payments SET amount_pkr = 1 WHERE id = %L$$, tests.paid('w1')), '42501', NULL,
                 'a paid amount cannot be changed');
SELECT throws_ok(format($$UPDATE public.visit_payments SET status = 'claimed' WHERE id = %L$$, tests.paid('w1')), '42501', NULL,
                 'a paid row cannot go back to claimed');

SELECT tests.login_anon();
SELECT throws_ok($$SELECT 1 FROM public.visit_payments$$, '42501', NULL, 'anon cannot read visit_payments');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000003');
SELECT is((SELECT count(*)::int FROM public.visit_payments WHERE center_id = '521f1349-05c4-4417-9fa5-5289963af7db'), 0,
          'clinic B''s receptionist sees none of clinic A''s payments');
SELECT throws_ok($$SELECT public.get_payment_report('521f1349-05c4-4417-9fa5-5289963af7db', NULL, NULL)$$, '42501', NULL,
                 'clinic B''s receptionist cannot read clinic A''s records');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000005');
SELECT is((SELECT count(*)::int FROM public.visit_payments), 0, 'Dr. B sees no payments of Dr. A''s patients');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000004');
SELECT ok((SELECT count(*) > 0 AND bool_and(doctor_id = 'd0000000-0000-4000-8000-00000000000a') FROM public.visit_payments),
          'Dr. A reads their own patients'' payments only');
SELECT throws_ok(format($$SELECT public.record_payment(%L, 1500, 'cash')$$, tests.id('q3')), '42501', NULL, 'doctors don''t take payments');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT throws_ok(format($$SELECT public.refund_payment(%L, 'Doctor left early')$$, tests.paid('w3')), '42501', NULL,
                 'receptionist: cannot refund');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- 8. Refund, records, income
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000009');
SELECT is(public.refund_payment(tests.paid('w3'), 'Doctor left early')->>'status', 'refunded', 'owner refunds w3''s 1500');
SELECT throws_ok(format($$SELECT public.refund_payment(%L, 'again')$$, tests.paid('w3')), 'PT409', NULL, 'a payment is refunded once');
SELECT is((SELECT payment_status FROM public.appointments WHERE id = tests.id('w3')), 'refunded', 'token shows refunded');
SELECT tests.logout();

-- Today: w1 1500 cash, q2 1500 cash, q1 1500 bank (verified), w3 1500 cash - 1500 refund, w2 free,
-- q5 claimed (not counted), rejected q1 claim (not counted).
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT is(public.get_payment_report('521f1349-05c4-4417-9fa5-5289963af7db', NULL, NULL)->'totals',
          '{"paid":4,"free":1,"claims":1,"cash_pkr":3000,"card_pkr":0,"patients":6,"other_pkr":0,"refunded":1,"total_pkr":4500,"online_pkr":1500,"refunded_pkr":1500}'::jsonb,
          'report totals: 6 patients (expired unpaid left out), 4 paid, Rs 4500 net, cash 3000, online 1500, 1 free');
SELECT is(public.get_payment_report('521f1349-05c4-4417-9fa5-5289963af7db', NULL, NULL)->'cash_closing',
          '[{"name":"Staff A","count":3,"cash_pkr":4500,"user_id":"a0000000-0000-4000-8000-000000000002"},{"name":"Owner A","count":0,"cash_pkr":-1500,"user_id":"a0000000-0000-4000-8000-000000000009"}]'::jsonb,
          'cash closing: per person who received or refunded cash');
SELECT is((SELECT count(*)::int FROM jsonb_array_elements(public.get_payment_report('521f1349-05c4-4417-9fa5-5289963af7db', NULL, NULL)->'rows')), 8,
          'report rows: every payment event today');
SELECT is((SELECT r->>'reference' || '|' || (r->>'patient_name') || '|' || (r->>'phone') || '|' || (r->>'received_by')
           FROM jsonb_array_elements(public.get_payment_report('521f1349-05c4-4417-9fa5-5289963af7db', NULL, NULL)->'rows') r
           WHERE r->>'status' = 'paid' AND r->>'method' = 'bank'), 'FT2610271234|Qr One|03001110001|Staff A',
          'report row: TID, patient, phone, received by');
SELECT throws_ok($$SELECT public.get_payment_report('521f1349-05c4-4417-9fa5-5289963af7db', tests.today() - 1, tests.today() - 1)$$,
                 '42501', NULL, 'receptionist: today only');
SELECT tests.logout();

SELECT tests.login('a0000000-0000-4000-8000-000000000009');
SELECT throws_ok($$SELECT public.get_payment_report('521f1349-05c4-4417-9fa5-5289963af7db', tests.today() - 7, tests.today())$$,
                 'PT402', NULL, 'owner on Free: date ranges need the analytics module');
SELECT is((public.get_payment_report('521f1349-05c4-4417-9fa5-5289963af7db', NULL, NULL)->>'can_range')::boolean, false, 'report says ranges are locked');
SELECT tests.logout();
UPDATE public.org_entitlements SET modules = modules || ARRAY['analytics']
WHERE organization_id = (SELECT organization_id FROM public.service_centers WHERE id = '521f1349-05c4-4417-9fa5-5289963af7db');
SELECT tests.login('a0000000-0000-4000-8000-000000000009');
SELECT is((public.get_payment_report('521f1349-05c4-4417-9fa5-5289963af7db', tests.today() - 7, tests.today())->'totals'->>'total_pkr')::int, 4500,
          'owner with analytics: a week''s range');
SELECT throws_ok($$SELECT public.get_payment_report('521f1349-05c4-4417-9fa5-5289963af7db', NULL, NULL, 'd0000000-0000-4000-8000-00000000000b')$$,
                 'PT404', NULL, 'doctor filter: a doctor of another center refused');
SELECT tests.logout();

-- Income: Dr. A completed one visit (w1, called then finished by the next call); income is what was received.
SELECT tests.login('a0000000-0000-4000-8000-000000000004');
SELECT is((SELECT total_fee FROM public.get_doctor_income_summary('d0000000-0000-4000-8000-00000000000a')), 4500::numeric,
          'income = fees received today (3 x 1500 + 1500 - 1500 refund), not completed visits x fee');
SELECT tests.logout();

SELECT * FROM finish();
ROLLBACK;
