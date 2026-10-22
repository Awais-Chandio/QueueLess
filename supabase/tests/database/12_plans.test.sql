-- Phase 1A.7: plans, subscriptions, entitlements, plan limits in issue_token.
-- Run with: supabase test db. Uses the seed accounts. Everything is rolled back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO anon, authenticated;
CREATE SCHEMA tests;
GRANT USAGE ON SCHEMA tests TO anon, authenticated, service_role;
CREATE FUNCTION tests.login(p_user uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true),
         set_config('role', 'authenticated', true);
$$;
CREATE FUNCTION tests.login_anon() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '{"role":"anon"}', true),
         set_config('role', 'anon', true);
$$;
-- Phase 1B: public joins come from the web server (service role) after it
-- verified the captcha, through issue_public_token.
CREATE FUNCTION tests.login_join_server() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true),
         set_config('role', 'service_role', true);
$$;
CREATE FUNCTION tests.logout() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true), set_config('role', 'postgres', true);
$$;
CREATE FUNCTION tests.today() RETURNS date LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'Asia/Karachi')::date $$;
CREATE TABLE tests.orgs AS
SELECT (SELECT organization_id FROM public.service_centers WHERE id = '521f1349-05c4-4417-9fa5-5289963af7db') AS a,
       (SELECT organization_id FROM public.service_centers WHERE id = 'd2c1a3df-bb89-4fde-b73d-5bb9ec763481') AS b;
GRANT SELECT ON tests.orgs TO anon, authenticated;
CREATE FUNCTION tests.org_a() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT a FROM tests.orgs';
CREATE FUNCTION tests.org_b() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT b FROM tests.orgs';
-- Non-cancelled appointments of org B today (what tokens_per_day counts).
CREATE FUNCTION tests.org_b_today() RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT count(*)::int FROM public.appointments a JOIN public.service_centers c ON c.id = a.center_id
  WHERE c.organization_id = tests.org_b() AND a.appointment_date = tests.today() AND a.status <> 'cancelled'
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO anon, authenticated, service_role;

-- Seed: org A (center A, doctor A d..0a, staff A a..02, owner A a..09),
--       org B (center B, doctor B d..0b, staff B a..03).

SELECT plan(30);

-- ---------------------------------------------------------------------------
-- Catalog and defaults
-- ---------------------------------------------------------------------------
SELECT set_eq($$SELECT id FROM public.plans$$, ARRAY['free', 'clinic', 'pro', 'center'], 'plans seeded: free, clinic, pro, center');
SELECT is((SELECT row(monthly_price_pkr, modules, tokens_per_day, max_doctors, max_centers)::text FROM public.plans WHERE id = 'free'),
          row(0, ARRAY['queue', 'qr_join'], 30, 1, 1)::text, 'free: queue + QR join, 30 tokens/day, 1 doctor, 1 center');
SELECT ok((SELECT tokens_per_day IS NULL AND max_doctors IS NULL AND 'multi_center' = ANY (modules) FROM public.plans WHERE id = 'center'),
          'center: unlimited tokens and doctors, multi-center');
SELECT throws_ok($$INSERT INTO public.plans (id, name, modules) VALUES ('bad', 'Bad', ARRAY['teleport'])$$, '23514', NULL,
                 'unknown module refused');
SELECT is_empty($$SELECT o.id FROM public.organizations o
                  LEFT JOIN public.org_subscriptions s ON s.organization_id = o.id AND s.status <> 'cancelled'
                  LEFT JOIN public.org_entitlements e ON e.organization_id = o.id
                  WHERE s.id IS NULL OR e.organization_id IS NULL OR s.plan_id <> 'free' OR e.plan_id <> 'free'$$,
                'every organization has a live Free subscription and Free entitlements');

INSERT INTO public.service_centers (id, name, city, address) VALUES ('c0000000-0000-4000-8000-0000000000c7', 'Brand New', 'Hyderabad', 'X');
SELECT is((SELECT e.plan_id FROM public.org_entitlements e JOIN public.service_centers c ON c.organization_id = e.organization_id
           WHERE c.id = 'c0000000-0000-4000-8000-0000000000c7'), 'free', 'a new organization starts on Free');
SELECT throws_ok($$INSERT INTO public.org_subscriptions (organization_id, plan_id) VALUES (tests.org_a(), 'pro')$$, '23505', NULL,
                 'only one live subscription per organization');

-- ---------------------------------------------------------------------------
-- has_module and entitlement sync
-- ---------------------------------------------------------------------------
SELECT ok(private.has_module(tests.org_a(), 'qr_join') AND NOT private.has_module(tests.org_a(), 'sms'), 'has_module on Free');
SELECT ok(NOT private.has_module(NULL, 'queue'), 'has_module(NULL): false');

UPDATE public.org_subscriptions SET plan_id = 'clinic' WHERE organization_id = tests.org_a() AND status <> 'cancelled';
SELECT is((SELECT row(plan_id, tokens_per_day, max_doctors)::text FROM public.org_entitlements WHERE organization_id = tests.org_a()),
          row('clinic', 150, 3)::text, 'plan change rewrites entitlements');
SELECT ok(private.has_module(tests.org_a(), 'sms'), 'has_module follows the new plan');
UPDATE public.plans SET tokens_per_day = 200 WHERE id = 'clinic';
SELECT is((SELECT tokens_per_day FROM public.org_entitlements WHERE organization_id = tests.org_a()), 200,
          'editing a plan updates the organizations on it');
UPDATE public.org_subscriptions SET status = 'cancelled' WHERE organization_id = tests.org_a();
SELECT is((SELECT plan_id FROM public.org_entitlements WHERE organization_id = tests.org_a()), 'free',
          'cancelling falls back to Free entitlements');
INSERT INTO public.org_subscriptions (organization_id, plan_id) VALUES (tests.org_a(), 'free');

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
SELECT tests.login_anon();
SELECT is((SELECT count(*)::int FROM public.plans), 4, 'anon: reads public plans');
SELECT throws_ok($$SELECT 1 FROM public.org_entitlements$$, '42501', NULL, 'anon: no entitlements');
SELECT tests.logout();

SELECT tests.login('a0000000-0000-4000-8000-000000000009');
SELECT set_eq($$SELECT organization_id FROM public.org_subscriptions WHERE status <> 'cancelled'$$, $$SELECT tests.org_a()$$,
              'owner A: reads org A subscription only');
SELECT throws_ok($$UPDATE public.org_entitlements SET tokens_per_day = 9999$$, '42501', NULL, 'owner A: cannot edit entitlements');
SELECT throws_ok($$INSERT INTO public.org_subscriptions (organization_id, plan_id) VALUES (tests.org_a(), 'center')$$, '42501', NULL,
                 'owner A: cannot upgrade themselves');
SELECT tests.logout();

SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT set_eq($$SELECT organization_id FROM public.org_entitlements$$, $$SELECT tests.org_a()$$, 'receptionist A: reads org A entitlements only');
SELECT is_empty($$SELECT 1 FROM public.org_subscriptions$$, 'receptionist A: no billing rows');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- Free plan limits in issue_token (org B)
-- ---------------------------------------------------------------------------
-- A second active doctor at org B, created after doctor B.
INSERT INTO public.doctors (id, center_id, name, specialty, created_at)
VALUES ('d0000000-0000-4000-8000-0000000000b2', 'd2c1a3df-bb89-4fde-b73d-5bb9ec763481', 'Dr. B2', 'GP', now() + interval '1 second');

SELECT tests.login('a0000000-0000-4000-8000-000000000003');
SELECT throws_ok($$SELECT * FROM public.issue_token('d0000000-0000-4000-8000-0000000000b2', 'X', NULL, 'walk_in')$$, 'PT402', NULL,
                 'free: no tokens for a second doctor');
SELECT throws_ok($$SELECT * FROM public.issue_token('d0000000-0000-4000-8000-00000000000b', 'X', '+923001230000', 'online')$$, 'PT402', NULL,
                 'free: online joins need the online_booking module');

-- Fill org B up to 30 tokens today with walk-ins for doctor B.
DO $$
BEGIN
  WHILE tests.org_b_today() < 30 LOOP
    PERFORM public.issue_token('d0000000-0000-4000-8000-00000000000b', 'Walk In', NULL, 'walk_in');
  END LOOP;
END
$$;
SELECT is(tests.org_b_today(), 30, 'free: 30 tokens issued today');
SELECT throws_ok($$SELECT * FROM public.issue_token('d0000000-0000-4000-8000-00000000000b', 'Number 31', NULL, 'walk_in')$$, 'PT402', NULL,
                 'free: the 31st token of the day is refused (staff too)');
SELECT tests.logout();

SELECT tests.login_join_server();
SELECT throws_ok($$SELECT * FROM public.issue_public_token('d0000000-0000-4000-8000-00000000000b', 'Guest', '+923004445566', 'qr')$$, 'PT402', NULL,
                 'free: public QR join refused at the daily limit');
SELECT tests.logout();

-- Cancelling a (spam) token frees a place.
SELECT tests.login('a0000000-0000-4000-8000-000000000003');
UPDATE public.appointments SET status = 'cancelled', cancelled_at = now()
WHERE id = (SELECT id FROM public.appointments WHERE source = 'walk_in' AND doctor_id = 'd0000000-0000-4000-8000-00000000000b' LIMIT 1);
SELECT lives_ok($$SELECT * FROM public.issue_token('d0000000-0000-4000-8000-00000000000b', 'After cancel', NULL, 'walk_in')$$,
                'free: a cancelled token frees a place');
SELECT tests.logout();

-- Org A is unaffected by org B's count.
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT lives_ok($$SELECT * FROM public.issue_token('d0000000-0000-4000-8000-00000000000a', 'Org A patient', NULL, 'walk_in')$$,
                'limits are per organization: org A still issues');
SELECT tests.logout();

-- Upgrade org B: second doctor and online joins work, daily limit lifts.
UPDATE public.org_subscriptions SET plan_id = 'pro' WHERE organization_id = tests.org_b() AND status <> 'cancelled';
SELECT tests.login('a0000000-0000-4000-8000-000000000003');
SELECT lives_ok($$SELECT * FROM public.issue_token('d0000000-0000-4000-8000-0000000000b2', 'Second doctor', NULL, 'walk_in')$$,
                'pro: second doctor allowed, no daily cap');
SELECT tests.logout();
SELECT tests.login_join_server();
SELECT lives_ok($$SELECT * FROM public.issue_public_token('d0000000-0000-4000-8000-00000000000b', 'Online Guest', '+923007778899', 'online')$$,
                'pro: public online join allowed');
SELECT tests.logout();

-- 1E: app bookings need the online_booking module (Free doesn't have it).
UPDATE public.org_subscriptions SET plan_id = 'free' WHERE organization_id = tests.org_b() AND status <> 'cancelled';
SELECT tests.login('a0000000-0000-4000-8000-000000000006');
SELECT throws_ok($$SELECT public.book_appointment(
                    public.lock_slot('d0000000-0000-4000-8000-00000000000b', 'd2c1a3df-bb89-4fde-b73d-5bb9ec763481', tests.today() + 1, '09:00 AM'),
                    '50000000-0000-4000-8000-00000000000b', NULL)$$, 'PT402', NULL,
                'Free clinic: app booking refused (online_booking module, 1E)');
SELECT tests.logout();

SELECT * FROM finish();
ROLLBACK;
