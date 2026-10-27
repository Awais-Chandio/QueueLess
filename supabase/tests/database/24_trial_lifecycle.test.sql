-- Phase 2B.2: trial at signup, banners, daily lifecycle (trial -> basic,
-- paid -> grace -> basic), admin plans with and without an end date.
-- Run with: supabase test db. Rolled back.
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
CREATE FUNCTION tests.org() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT (tests.v('org')->>'organization_id')::uuid$$;
CREATE FUNCTION tests.sub() RETURNS public.org_subscriptions LANGUAGE sql STABLE SECURITY DEFINER AS
  $$SELECT * FROM public.org_subscriptions WHERE organization_id = tests.org() AND status <> 'cancelled'$$;
CREATE FUNCTION tests.plan() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS
  $$SELECT plan_id FROM public.org_entitlements WHERE organization_id = tests.org()$$;
CREATE FUNCTION tests.set_end(p_end timestamptz) RETURNS void LANGUAGE sql SECURITY DEFINER AS
  $$UPDATE public.org_subscriptions SET current_period_end = p_end WHERE organization_id = tests.org() AND status <> 'cancelled'$$;
CREATE FUNCTION tests.status() RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS
  $$SELECT public.get_plan_status(tests.org())$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO anon, authenticated, service_role;

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000011', 'authenticated', 'authenticated', 'trial.owner@example.com', '', now(), '{}', '{"full_name":"Trial Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000012', 'authenticated', 'authenticated', 'stranger@example.com', '', now(), '{}', '{"full_name":"Stranger"}', now(), now());

SELECT plan(35);

-- ---------------------------------------------------------------------------
-- Signup starts a 14-day trial
-- ---------------------------------------------------------------------------
SELECT tests.login('b0000000-0000-4000-8000-000000000011');
INSERT INTO tests.out SELECT 'org', public.create_organization('Trial Clinic', NULL, 'Karachi', 'Clifton',
  '[{"name":"Dr. Hina","specialty":"GP","fee":"1200"}]');
SELECT tests.logout();

SELECT is(tests.plan(), 'trial', 'a new clinic is on the trial');
SELECT is(((tests.sub()).status, (tests.sub()).lapses)::text, '(trialing,t)', 'trialing; it lapses');
SELECT ok((tests.sub()).current_period_end BETWEEN now() + interval '14 days' - interval '1 minute' AND now() + interval '14 days',
          'trial ends in 14 days');
SELECT is((SELECT trial_ends_at FROM public.organizations WHERE id = tests.org()), (tests.sub()).current_period_end,
          'organizations.trial_ends_at = the trial end');
SELECT ok(private.has_module(tests.org(), 'analytics') AND private.has_module(tests.org(), 'whatsapp')
          AND private.has_module(tests.org(), 'fees') AND private.has_module(tests.org(), 'display'), 'trial: every Pro feature');
SELECT is((SELECT max_doctors FROM public.org_entitlements WHERE organization_id = tests.org()), 3, 'trial: 3 doctors (Pro)');

-- ---------------------------------------------------------------------------
-- Banners
-- ---------------------------------------------------------------------------
SELECT tests.login('b0000000-0000-4000-8000-000000000011');
SELECT is(public.get_plan_status(tests.org())->>'days_left', '14', 'day 1: 14 days left');
SELECT is(public.get_plan_status(tests.org())->>'banner', NULL, 'day 1: no banner');
SELECT tests.logout();
SELECT tests.set_end(now() + interval '6 days' - interval '1 minute');
SELECT is(tests.status()->>'banner', NULL, 'day 9 (6 days left): no banner yet');
SELECT tests.set_end(now() + interval '5 days' - interval '1 minute');
SELECT is(tests.status()->>'banner', 'trial', 'day 10 (5 days left): trial banner');
SELECT is(tests.status()->>'days_left', '5', '... "Trial 5 din baaki"');
SELECT tests.login('b0000000-0000-4000-8000-000000000012');
SELECT throws_ok($$SELECT public.get_plan_status(tests.org())$$, '42501', NULL, 'not a member: no plan status');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- Lifecycle: trial over -> Basic, nothing deleted
-- ---------------------------------------------------------------------------
SELECT tests.login('b0000000-0000-4000-8000-000000000011');
INSERT INTO tests.out SELECT 'tok', to_jsonb(t) FROM public.issue_token(
  (SELECT d.id FROM public.doctors d JOIN public.service_centers c ON c.id = d.center_id WHERE c.organization_id = tests.org() LIMIT 1),
  'Before Lapse', '03001234567', 'walk_in') t;
SELECT tests.logout();

SELECT is(private.run_plan_lifecycle()->>'trials_ended', '0', 'trial still running: nothing happens');
SELECT tests.set_end(now() - interval '1 minute');
SELECT is(private.run_plan_lifecycle()->>'trials_ended', '1', 'trial over: lapsed');
SELECT is(tests.plan(), 'basic', 'trial over, nothing paid: Basic');
SELECT is(((tests.sub()).status, (tests.sub()).lapses)::text, '(active,f)', 'Basic never lapses');
SELECT is((SELECT note FROM public.billing_events WHERE organization_id = tests.org() ORDER BY created_at DESC LIMIT 1), 'Trial ended',
          'billing history says why');
SELECT ok((SELECT trial_ends_at IS NOT NULL FROM public.organizations WHERE id = tests.org()), 'trial_ends_at stays (one trial per clinic)');
SELECT is((SELECT count(*)::int FROM public.appointments a JOIN public.service_centers c ON c.id = a.center_id
           WHERE c.organization_id = tests.org()), 1, 'tokens are kept');
SELECT is((SELECT count(*)::int FROM public.doctors d JOIN public.service_centers c ON c.id = d.center_id
           WHERE c.organization_id = tests.org() AND d.is_active), 1, 'doctors are kept');
SELECT is(tests.status()->>'banner', 'basic', 'Basic banner');
SELECT is(private.run_plan_lifecycle(), '{"lapsed": 0, "past_due": 0, "trials_ended": 0}'::jsonb, 'running again changes nothing');

-- ---------------------------------------------------------------------------
-- Paid plan: reminder, grace, Basic
-- ---------------------------------------------------------------------------
SELECT tests.login_server();
SELECT public.admin_set_plan(tests.org(), 'pro', ((now() AT TIME ZONE 'Asia/Karachi')::date + 3), 'paid by bank');
SELECT tests.logout();
SELECT is(((tests.sub()).plan_id, (tests.sub()).status, (tests.sub()).lapses)::text, '(pro,active,t)', 'admin: Pro with a paid-until date lapses');
SELECT is(tests.status()->>'banner', 'renew', '5 days or less before the end: renew reminder');
SELECT tests.set_end(now() + interval '20 days');
SELECT is(tests.status()->>'banner', NULL, '20 days left: no reminder');

SELECT tests.set_end(now() - interval '1 hour');
SELECT is(private.run_plan_lifecycle()->>'past_due', '1', 'period over: past due');
SELECT is(((tests.sub()).status)::text, 'past_due', 'status past_due');
SELECT ok(tests.plan() = 'pro' AND private.has_module(tests.org(), 'analytics'), 'grace: every Pro feature still on');
SELECT is(tests.status()->>'banner', 'grace', 'grace banner');
SELECT is(tests.status()->>'days_left', '3', '3 days of grace');

SELECT tests.set_end(now() - interval '3 days' - interval '1 minute');
SELECT is(private.run_plan_lifecycle()->>'lapsed', '1', 'grace over: lapsed');
SELECT is(tests.plan(), 'basic', 'then Basic');

-- No end date: never lapses.
SELECT tests.login_server();
SELECT public.admin_set_plan(tests.org(), 'solo', NULL, 'pilot');
SELECT tests.logout();
SELECT tests.set_end(now() - interval '30 days');
SELECT is((private.run_plan_lifecycle()->>'lapsed')::int + (private.run_plan_lifecycle()->>'past_due')::int, 0,
          'a plan without a paid-until date never lapses');
SELECT is(tests.plan(), 'solo', 'still Solo');

SELECT is((SELECT schedule FROM cron.job WHERE jobname = 'plan-lifecycle'), '5 19 * * *', 'pg_cron: daily at 00:05 Pakistan time');

SELECT * FROM finish();
ROLLBACK;
