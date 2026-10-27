-- Phase 2B.3: MediQ's accounts, plan payment claims (TID once), admin verify / reject.
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
CREATE FUNCTION tests.login_server() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true), set_config('role', 'service_role', true);
$$;
CREATE FUNCTION tests.logout() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true), set_config('role', 'postgres', true);
$$;
CREATE TABLE tests.out (label text PRIMARY KEY, v jsonb);
GRANT ALL ON tests.out TO anon, authenticated, service_role;
CREATE FUNCTION tests.v(p_label text) RETURNS jsonb LANGUAGE sql STABLE AS 'SELECT v FROM tests.out WHERE label = p_label';
CREATE FUNCTION tests.claim(p_label text) RETURNS uuid LANGUAGE sql STABLE AS $$SELECT (tests.v(p_label)->>'id')::uuid$$;
CREATE FUNCTION tests.org_a() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS
  $$SELECT organization_id FROM public.service_centers WHERE id = '521f1349-05c4-4417-9fa5-5289963af7db'$$;
CREATE FUNCTION tests.org_b() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS
  $$SELECT organization_id FROM public.service_centers WHERE id = 'd2c1a3df-bb89-4fde-b73d-5bb9ec763481'$$;
CREATE FUNCTION tests.sub_a() RETURNS public.org_subscriptions LANGUAGE sql STABLE SECURITY DEFINER AS
  $$SELECT * FROM public.org_subscriptions WHERE organization_id = tests.org_a() AND status <> 'cancelled'$$;
CREATE FUNCTION tests.submit(p_org uuid, p_user uuid, p_plan text, p_months int, p_method text, p_tid text) RETURNS jsonb
  LANGUAGE sql AS $$SELECT public.submit_billing_claim(p_org, p_user, p_plan, p_months, p_method, p_tid)$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO anon, authenticated, service_role;

-- Owner B (a second owner, for org B).
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000021', 'authenticated', 'authenticated', 'owner.b@example.com', '', now(), '{}', '{"full_name":"Owner B"}', now(), now());
INSERT INTO public.org_members (organization_id, user_id, role) VALUES (tests.org_b(), 'b0000000-0000-4000-8000-000000000021', 'owner');

SELECT plan(43);

-- ---------------------------------------------------------------------------
-- MediQ's accounts
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000009');
SELECT throws_ok($$SELECT public.admin_set_platform_accounts('03001234567', 'MediQ')$$, '42501', NULL, 'owner: cannot edit MediQ''s accounts');
SELECT throws_ok($$SELECT 1 FROM public.platform_settings$$, '42501', NULL, 'owner: no direct read of platform settings');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000001');
SELECT is(public.admin_set_platform_accounts('0300-111 2233', 'MediQ Pvt Ltd', NULL, NULL, 'Meezan Bank', 'MediQ Pvt Ltd',
                                             'PK36 MEZN 0000 0011 2345 6702')->>'easypaisa_number', '03001112233',
          'platform admin: sets the accounts (number tidied)');
SELECT throws_ok($$SELECT public.admin_set_platform_accounts('03001112233', NULL)$$, '22023', NULL, 'an account needs its title');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- The plan page
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000009');
SELECT is((SELECT jsonb_object_keys(public.get_plan_page(tests.org_a())->'accounts') ORDER BY 1 LIMIT 1), 'bank', 'owner: MediQ''s accounts');
SELECT is((SELECT p->>'price_12' FROM jsonb_array_elements(public.get_plan_page(tests.org_a())->'plans') p WHERE p->>'id' = 'solo'), '25000',
          'owner: Solo for a year = 25,000');
SELECT is((SELECT p->>'price_1' FROM jsonb_array_elements(public.get_plan_page(tests.org_a())->'plans') p WHERE p->>'id' = 'center'), '4800',
          'owner: Center with 1 doctor is billed for 4');
SELECT is((SELECT p->>'recommended' FROM jsonb_array_elements(public.get_plan_page(tests.org_a())->'plans') p WHERE p->>'id' = 'pro'), 'true',
          'Pro is recommended');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT throws_ok($$SELECT public.get_plan_page(tests.org_a())$$, '42501', NULL, 'receptionist: no plan page');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- Submitting (server only, the owner, a TID once)
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000009');
SELECT throws_ok($$SELECT tests.submit(tests.org_a(), auth.uid(), 'solo', 12, 'easypaisa', 'EP123456')$$, '42501', NULL,
                 'owner: cannot call submit_billing_claim directly');
SELECT tests.logout();

SELECT tests.login_server();
SELECT throws_ok($$SELECT tests.submit(tests.org_a(), 'a0000000-0000-4000-8000-000000000002', 'solo', 12, 'easypaisa', 'EP123456')$$,
                 '42501', NULL, 'a receptionist cannot pay for the plan');
SELECT throws_ok($$SELECT tests.submit(tests.org_a(), 'a0000000-0000-4000-8000-000000000009', 'basic', 1, 'easypaisa', 'EP123456')$$,
                 '22023', NULL, 'Basic is not for sale');
SELECT throws_ok($$SELECT tests.submit(tests.org_a(), 'a0000000-0000-4000-8000-000000000009', 'trial', 1, 'easypaisa', 'EP123456')$$,
                 '22023', NULL, 'the trial is not for sale');
SELECT throws_ok($$SELECT tests.submit(tests.org_a(), 'a0000000-0000-4000-8000-000000000009', 'solo', 3, 'easypaisa', 'EP123456')$$,
                 '22023', NULL, '1 or 12 months only');
SELECT throws_ok($$SELECT tests.submit(tests.org_a(), 'a0000000-0000-4000-8000-000000000009', 'solo', 1, 'jazzcash', 'JC123456')$$,
                 '22023', NULL, 'MediQ has no JazzCash account set up');
SELECT throws_ok($$SELECT tests.submit(tests.org_a(), 'a0000000-0000-4000-8000-000000000009', 'solo', 1, 'easypaisa', 'x!')$$,
                 '22023', NULL, 'TID 4-30 letters or digits');
INSERT INTO tests.out SELECT 'c1', tests.submit(tests.org_a(), 'a0000000-0000-4000-8000-000000000009', 'solo', 12, 'easypaisa', ' ep 1234 5678 ');
SELECT is(tests.v('c1')->>'amount_pkr', '25000', 'owner A: Solo for a year, amount from the plan price');
SELECT is(tests.v('c1')->>'reference', 'EP12345678', 'TID tidied');
SELECT throws_ok($$SELECT tests.submit(tests.org_a(), 'a0000000-0000-4000-8000-000000000009', 'pro', 1, 'bank', 'FT998877')$$,
                 'PT409', NULL, 'one open claim per clinic');
SELECT throws_ok($$SELECT tests.submit(tests.org_b(), 'b0000000-0000-4000-8000-000000000021', 'pro', 1, 'easypaisa', 'EP12345678')$$,
                 'PT409', NULL, 'the same TID can''t back a second claim (another clinic)');
SELECT tests.logout();

-- RLS: the owner reads their claims, nobody else.
SELECT tests.login('a0000000-0000-4000-8000-000000000009');
SELECT is((SELECT count(*)::int FROM public.billing_claims), 1, 'owner A: their claim');
SELECT is(public.get_plan_page(tests.org_a())->'open_claim'->>'status', 'claimed', 'plan page: the open claim');
SELECT tests.logout();
SELECT tests.login('b0000000-0000-4000-8000-000000000021');
SELECT is((SELECT count(*)::int FROM public.billing_claims), 0, 'owner B: not org A''s claims');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT is((SELECT count(*)::int FROM public.billing_claims), 0, 'receptionist A: no claims');
SELECT throws_ok($$SELECT public.admin_list_billing_claims()$$, '42501', NULL, 'receptionist: no admin list');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- Admin: reject, then verify
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000001');
SELECT is((SELECT c->>'organization_name' FROM jsonb_array_elements(public.admin_list_billing_claims()) c),
          (SELECT name FROM public.organizations WHERE id = tests.org_a()), 'admin: pending claims with the clinic');
SELECT throws_ok(format($$SELECT public.admin_resolve_billing_claim(%L, false)$$, tests.claim('c1')), '22023', NULL, 'reject needs a reason');
SELECT is(public.admin_resolve_billing_claim(tests.claim('c1'), false, 'not_received')->>'status', 'rejected', 'admin: rejected');
SELECT throws_ok(format($$SELECT public.admin_resolve_billing_claim(%L, true)$$, tests.claim('c1')), 'PT409', NULL, 'a claim is handled once');
SELECT tests.logout();
SELECT is((tests.sub_a()).plan_id, 'trial', 'a rejected claim changes nothing');

SELECT tests.login_server();
INSERT INTO tests.out SELECT 'c2', tests.submit(tests.org_a(), 'a0000000-0000-4000-8000-000000000009', 'solo', 12, 'easypaisa', 'EP12345678');
SELECT tests.logout();
SELECT is(tests.v('c2')->>'status', 'claimed', 'after a rejection the same TID can be sent again');

SELECT tests.login('a0000000-0000-4000-8000-000000000001');
SELECT is(public.admin_resolve_billing_claim(tests.claim('c2'), true, NULL, 'seen in Easypaisa')->>'status', 'verified', 'admin: verified');
SELECT tests.logout();
SELECT is(((tests.sub_a()).plan_id, (tests.sub_a()).status, (tests.sub_a()).lapses)::text, '(solo,active,t)', 'verify: Solo is on, and lapses');
SELECT ok((tests.sub_a()).current_period_end BETWEEN now() + interval '12 months' - interval '1 minute' AND now() + interval '12 months',
          'verify: paid until 12 months from now');
SELECT is((SELECT amount_pkr || '|' || method FROM public.billing_events WHERE organization_id = tests.org_a() AND kind = 'payment'),
          '25000|easypaisa', 'billing history: the payment');
SELECT ok(EXISTS (SELECT 1 FROM public.billing_events WHERE organization_id = tests.org_a() AND kind = 'plan_change' AND plan_id = 'solo'),
          'billing history: the plan change');

-- A verified TID is never used again.
SELECT tests.login_server();
SELECT throws_ok($$SELECT tests.submit(tests.org_b(), 'b0000000-0000-4000-8000-000000000021', 'pro', 1, 'easypaisa', 'EP12345678')$$,
                 'PT409', NULL, 'a verified TID can''t be used again');
-- Renewing Solo: the new month follows the paid period.
INSERT INTO tests.out SELECT 'c3', tests.submit(tests.org_a(), 'a0000000-0000-4000-8000-000000000009', 'solo', 1, 'bank', 'FT2611001');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000001');
SELECT public.admin_resolve_billing_claim(tests.claim('c3'), true);
SELECT tests.logout();
SELECT ok((tests.sub_a()).current_period_end BETWEEN now() + interval '13 months' - interval '1 minute' AND now() + interval '13 months',
          'renewal: 12 + 1 months');

-- Center: billed for at least 4 doctors.
SELECT tests.login_server();
SELECT is(tests.submit(tests.org_b(), 'b0000000-0000-4000-8000-000000000021', 'center', 1, 'bank', 'FT2611002')->>'amount_pkr', '4800',
          'Center, 1 doctor: billed for 4 x 1,200');
SELECT tests.logout();

-- At most 5 claims per clinic per day: org B's Center claim (rejected) and four more.
SELECT tests.login('a0000000-0000-4000-8000-000000000001');
SELECT public.admin_resolve_billing_claim(id, false, 'other') FROM public.billing_claims WHERE status = 'claimed';
SELECT tests.logout();
INSERT INTO public.billing_claims (organization_id, plan_id, months, amount_pkr, method, reference, status, reason, resolved_at)
SELECT tests.org_b(), 'pro', 1, 4500, 'bank', 'FT26110' || n, 'rejected', 'other', now() FROM generate_series(10, 13) n;
SELECT tests.login_server();
SELECT throws_ok($$SELECT tests.submit(tests.org_b(), 'b0000000-0000-4000-8000-000000000021', 'pro', 1, 'bank', 'FT2611099')$$,
                 'PT429', NULL, 'a sixth claim in a day is refused');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- Records stay records
-- ---------------------------------------------------------------------------
SELECT throws_ok(format($$UPDATE public.billing_claims SET amount_pkr = 1 WHERE id = %L$$, tests.claim('c2')), '42501', NULL,
                 'a claim''s amount can''t change');
SELECT throws_ok(format($$DELETE FROM public.billing_claims WHERE id = %L$$, tests.claim('c2')), '42501', NULL, 'claims are never deleted');
SELECT throws_ok(format($$UPDATE public.billing_claims SET status = 'claimed' WHERE id = %L$$, tests.claim('c2')), '42501', NULL,
                 'a verified claim stays verified');

SELECT * FROM finish();
ROLLBACK;
