-- Phase 1A.8: message credits and log. Run with: supabase test db
-- Uses the seed accounts (supabase/seed.sql). Everything is rolled back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO anon, authenticated;
CREATE SCHEMA tests;
GRANT USAGE ON SCHEMA tests TO anon, authenticated;
CREATE FUNCTION tests.login(p_user uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true),
         set_config('role', 'authenticated', true);
$$;
CREATE FUNCTION tests.login_anon() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '{"role":"anon"}', true),
         set_config('role', 'anon', true);
$$;
CREATE FUNCTION tests.logout() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true), set_config('role', 'postgres', true);
$$;
CREATE TABLE tests.orgs AS
SELECT (SELECT organization_id FROM public.service_centers WHERE id = '521f1349-05c4-4417-9fa5-5289963af7db') AS a,
       (SELECT organization_id FROM public.service_centers WHERE id = 'd2c1a3df-bb89-4fde-b73d-5bb9ec763481') AS b;
GRANT SELECT ON tests.orgs TO anon, authenticated, service_role;
CREATE FUNCTION tests.org_a() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT a FROM tests.orgs';
CREATE FUNCTION tests.org_b() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT b FROM tests.orgs';
GRANT USAGE ON SCHEMA tests TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO anon, authenticated, service_role;

-- Org A on Clinic (has sms), 10 credits; org B on Basic (2B: seed orgs start
-- on the trial, which has sms).
UPDATE public.org_subscriptions SET plan_id = 'clinic' WHERE organization_id = tests.org_a() AND status <> 'cancelled';
UPDATE public.org_subscriptions SET plan_id = 'basic', status = 'active' WHERE organization_id = tests.org_b() AND status <> 'cancelled';
UPDATE public.message_credits SET balance = 10 WHERE organization_id = tests.org_a();
INSERT INTO public.message_log (organization_id, channel, to_phone, template, status, cost)
VALUES (tests.org_b(), 'sms', '+923001112233', 'token_called', 'sent', 1);

SELECT plan(17);

SELECT is_empty($$SELECT o.id FROM public.organizations o LEFT JOIN public.message_credits m ON m.organization_id = o.id
                  WHERE m.organization_id IS NULL$$, 'every organization has a credit balance row');
SELECT throws_ok($$UPDATE public.message_credits SET balance = -1 WHERE organization_id = tests.org_a()$$, '23514', NULL,
                 'balance can''t go negative');

-- ---------------------------------------------------------------------------
-- charge_message_credits (server)
-- ---------------------------------------------------------------------------
SELECT set_config('role', 'service_role', true);
SELECT lives_ok($$SELECT public.charge_message_credits(tests.org_a(), 'sms', '0092 300 1234567', 'token_ready', 3,
                    'e0000000-0000-4000-8000-000000000001')$$, 'service_role: charges and logs a message');
SELECT throws_ok($$SELECT public.charge_message_credits(tests.org_a(), 'sms', '+923001234567', 'token_ready', 8)$$, 'PT402',
                 'Not enough message credits', 'service_role: refused when credits run out');
SELECT throws_ok($$SELECT public.charge_message_credits(tests.org_a(), 'whatsapp', '+923001234567', 'token_ready', 1)$$, 'PT402', NULL,
                 'service_role: refused for a channel the plan lacks');
SELECT throws_ok($$SELECT public.charge_message_credits(tests.org_b(), 'sms', '+923001234567', 'token_ready', 0)$$, 'PT402', NULL,
                 'service_role: Basic plan has no SMS');
SELECT throws_ok($$SELECT public.charge_message_credits(tests.org_a(), 'sms', '+923001234567', 'token_ready', 1,
                    'e0000000-0000-4000-8000-000000000003')$$, '42501', NULL,
                 'service_role: cannot log a message against another clinic''s appointment');
SELECT throws_ok($$SELECT public.charge_message_credits(tests.org_a(), 'sms', 'nope', 'token_ready', 1)$$, '22023', NULL,
                 'service_role: invalid phone refused');
SELECT lives_ok($$UPDATE public.message_log SET status = 'delivered', provider_message_id = 'abc' WHERE organization_id = tests.org_a()$$,
                'service_role: can update delivery status');
SELECT throws_ok($$UPDATE public.message_log SET cost = 0$$, '42501', NULL, 'service_role: cannot rewrite cost');
SELECT tests.logout();

SELECT is((SELECT balance FROM public.message_credits WHERE organization_id = tests.org_a()), 7, 'balance debited exactly once (10 - 3)');
SELECT is((SELECT to_phone || '|' || cost || '|' || status FROM public.message_log WHERE organization_id = tests.org_a()),
          '+923001234567|3|delivered', 'log row: normalized recipient, cost, status');

-- ---------------------------------------------------------------------------
-- Client access
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000009');
SELECT throws_ok($$SELECT public.charge_message_credits(tests.org_a(), 'sms', '+923001234567', 't', 0)$$, '42501', NULL,
                 'owner A: cannot call the charge function');
SELECT set_eq($$SELECT organization_id FROM public.message_log$$, $$SELECT tests.org_a()$$, 'owner A: reads org A log only');
SELECT throws_ok($$UPDATE public.message_credits SET balance = 1000000$$, '42501', NULL, 'owner A: cannot top up');
SELECT tests.logout();

SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT is_empty($$SELECT 1 FROM public.message_log UNION ALL SELECT 1 FROM public.message_credits$$,
                'receptionist A: no message data (recipients are patient phones)');
SELECT tests.logout();

SELECT tests.login_anon();
SELECT throws_ok($$SELECT 1 FROM public.message_log$$, '42501', NULL, 'anon: no message log');
SELECT tests.logout();

SELECT * FROM finish();
ROLLBACK;
