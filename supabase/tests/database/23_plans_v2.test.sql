-- Phase 2B.1: plan catalog, prices, plan limits, the display and fees modules.
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
  'SELECT a.status || ''|'' || COALESCE(a.payment_status, ''-'') || ''|'' || COALESCE(a.fee_pkr::text, ''-'')
   FROM public.appointments a WHERE a.public_code = tests.code(p_label)';
CREATE FUNCTION tests.org_a() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS
  $$SELECT organization_id FROM public.service_centers WHERE id = '521f1349-05c4-4417-9fa5-5289963af7db'$$;
-- Put org A on a plan the way a plan change does (cancel + new live row).
CREATE FUNCTION tests.plan_a(p_plan text) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.org_subscriptions SET status = 'cancelled' WHERE organization_id = tests.org_a() AND status <> 'cancelled';
  INSERT INTO public.org_subscriptions (organization_id, plan_id, status, lapses) VALUES (tests.org_a(), p_plan, 'active', false);
$$;
CREATE FUNCTION tests.display_key() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS
  $$SELECT display_key FROM public.center_displays WHERE center_id = '521f1349-05c4-4417-9fa5-5289963af7db'$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO anon, authenticated, service_role;

-- Seed: center A 521f.. (owner A a..09, receptionist A a..02, Dr. A d..0a fee 1000), fee mode before (default).
-- Dr. A's queue starts empty today.
UPDATE public.appointments SET appointment_date = appointment_date - 7 WHERE doctor_id = 'd0000000-0000-4000-8000-00000000000a';

SELECT plan(41);

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------
SELECT is((SELECT jsonb_agg(id ORDER BY sort_order) FROM public.plans WHERE is_public),
          '["basic", "solo", "pro", "center"]'::jsonb, 'public plans: basic, solo, pro, center (in that order)');
SELECT is((SELECT row(monthly_price_pkr, tokens_per_day, max_doctors, max_centers, is_public)::text FROM public.plans WHERE id = 'trial'),
          row(0, NULL::int, 3, 1, false)::text, 'trial: free, unlimited tokens, 3 doctors, not for sale');
SELECT ok((SELECT t.modules @> p.modules AND t.modules <@ p.modules
           FROM public.plans t, public.plans p WHERE t.id = 'trial' AND p.id = 'pro'),
          'trial: every Pro feature');
SELECT is((SELECT row(monthly_price_pkr, modules, tokens_per_day, max_doctors)::text FROM public.plans WHERE id = 'basic'),
          row(0, ARRAY['queue', 'qr_join'], 10, 1)::text, 'basic: queue + QR join, 10 tokens a day, 1 doctor');
SELECT is((SELECT row(monthly_price_pkr, modules, tokens_per_day, max_doctors)::text FROM public.plans WHERE id = 'solo'),
          row(2500, ARRAY['queue', 'qr_join', 'display', 'fees', 'sms'], NULL::int, 1)::text,
          'solo: Rs 2,500, 1 doctor, unlimited tokens, display + fees + sms');
SELECT is((SELECT row(monthly_price_pkr, max_doctors, recommended, 'analytics' = ANY (modules) AND 'whatsapp' = ANY (modules)
                      AND 'online_booking' = ANY (modules) AND NOT 'multi_center' = ANY (modules))::text FROM public.plans WHERE id = 'pro'),
          row(4500, 3, true, true)::text, 'pro: Rs 4,500, 3 doctors, recommended, analytics / WhatsApp / online booking');
SELECT is((SELECT row(monthly_price_pkr, per_doctor, min_doctors, max_doctors, max_centers, 'multi_center' = ANY (modules))::text
           FROM public.plans WHERE id = 'center'),
          row(1200, true, 4, NULL::int, NULL::int, true)::text, 'center: Rs 1,200 per doctor (min 4), unlimited doctors, branches');
SELECT is((SELECT jsonb_agg(id ORDER BY id) FROM public.plans WHERE mediq_branding), '["basic", "free"]'::jsonb,
          'MediQ branding: basic (and legacy free) only');

-- ---------------------------------------------------------------------------
-- Prices: a year = 10 months; Center per doctor, at least 4
-- ---------------------------------------------------------------------------
SELECT is(private.plan_price_pkr('solo', 1), 2500, 'solo: 1 month');
SELECT is(private.plan_price_pkr('solo', 12), 25000, 'solo: 12 months = 10 x monthly');
SELECT is(private.plan_price_pkr('pro', 12), 45000, 'pro: 12 months');
SELECT is(private.plan_price_pkr('center', 1, 2), 4800, 'center, 2 doctors: billed for the minimum 4');
SELECT is(private.plan_price_pkr('center', 1, 6), 7200, 'center, 6 doctors');
SELECT is(private.plan_price_pkr('center', 12, 6), 72000, 'center, 6 doctors, a year');
SELECT is(private.plan_price_pkr('pro', 3), NULL, 'only 1 or 12 months');

-- ---------------------------------------------------------------------------
-- Doctor limits per plan (owner A adds doctors)
-- ---------------------------------------------------------------------------
SELECT tests.plan_a('solo');
SELECT tests.login('a0000000-0000-4000-8000-000000000009');
SELECT throws_ok($$SELECT public.upsert_doctor('521f1349-05c4-4417-9fa5-5289963af7db', NULL, 'Dr. Two', NULL, NULL)$$, 'PT402', NULL,
                 'solo: a second doctor refused');
SELECT tests.logout();
SELECT tests.plan_a('pro');
SELECT tests.login('a0000000-0000-4000-8000-000000000009');
SELECT lives_ok($$SELECT public.upsert_doctor('521f1349-05c4-4417-9fa5-5289963af7db', NULL, 'Dr. Two', 'Paediatrician', NULL)$$, 'pro: doctor 2');
SELECT lives_ok($$SELECT public.upsert_doctor('521f1349-05c4-4417-9fa5-5289963af7db', NULL, 'Dr. Three', 'ENT', NULL)$$, 'pro: doctor 3');
SELECT throws_ok($$SELECT public.upsert_doctor('521f1349-05c4-4417-9fa5-5289963af7db', NULL, 'Dr. Four', NULL, NULL)$$, 'PT402', NULL,
                 'pro: a fourth doctor refused');
SELECT tests.logout();
SELECT tests.plan_a('center');
SELECT tests.login('a0000000-0000-4000-8000-000000000009');
SELECT lives_ok($$SELECT public.upsert_doctor('521f1349-05c4-4417-9fa5-5289963af7db', NULL, 'Dr. Four', NULL, NULL)$$, 'center: no doctor limit');
-- Receptionists are unlimited on every plan (Basic too).
SELECT tests.logout();
SELECT tests.plan_a('basic');
SELECT tests.login('a0000000-0000-4000-8000-000000000009');
SELECT lives_ok($$SELECT public.invite_staff('521f1349-05c4-4417-9fa5-5289963af7db', 'rec' || n || '@example.com') FROM generate_series(1, 6) n$$,
                'basic: six receptionist invites');
SELECT tests.logout();
SELECT is((SELECT count(*)::int FROM public.doctors WHERE center_id = '521f1349-05c4-4417-9fa5-5289963af7db' AND private.doctor_takes_tokens(id)), 1,
          'basic: only the first doctor takes tokens; the others stay (nothing deleted)');
SELECT is((SELECT count(*)::int FROM public.doctors WHERE center_id = '521f1349-05c4-4417-9fa5-5289963af7db' AND is_active), 4,
          'basic: every doctor is still there and active');

-- ---------------------------------------------------------------------------
-- Tokens: Solo has no daily limit
-- ---------------------------------------------------------------------------
SELECT tests.plan_a('solo');
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT lives_ok($$SELECT public.issue_token('d0000000-0000-4000-8000-00000000000a', 'Walk ' || n, NULL, 'walk_in') FROM generate_series(1, 31) n$$,
                'solo: 31 walk-ins in a day');
SELECT tests.logout();
-- Out of the way of Basic's daily limit below (cancelled tokens don't count).
UPDATE public.appointments SET status = 'cancelled' WHERE doctor_id = 'd0000000-0000-4000-8000-00000000000a' AND source = 'walk_in';

-- ---------------------------------------------------------------------------
-- The display module
-- ---------------------------------------------------------------------------
SELECT tests.login_anon();
SELECT is((public.get_display_snapshot(tests.display_key())->>'locked')::boolean, false, 'solo: the TV board is on');
SELECT ok(jsonb_array_length(public.get_display_snapshot(tests.display_key())->'doctors') > 0, 'solo: the TV shows doctors');
SELECT is((public.get_display_snapshot(tests.display_key())->>'branding')::boolean, false, 'solo: no MediQ branding');
SELECT tests.logout();
SELECT tests.plan_a('basic');
SELECT tests.login_anon();
SELECT is((public.get_display_snapshot(tests.display_key())->>'locked')::boolean, true, 'basic: the TV board is locked');
SELECT is(public.get_display_snapshot(tests.display_key())->'doctors', '[]'::jsonb, 'basic: no tokens on the TV');
SELECT is((public.get_display_snapshot(tests.display_key())->>'branding')::boolean, true, 'basic: MediQ branding');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- The fees module
-- ---------------------------------------------------------------------------
-- Solo + fee before: a QR join waits for Dr. A's fee.
SELECT tests.plan_a('solo');
SELECT tests.login_server();
INSERT INTO tests.codes SELECT 'q1', public_code FROM public.issue_public_token('d0000000-0000-4000-8000-00000000000a', 'Qr One', '03001110001', 'qr', 'liaquat-university-hospital');
SELECT tests.logout();
SELECT is(tests.appt('q1'), 'pending|awaiting|1000', 'solo, fee before: QR join waits for the fee');

-- Basic: the stored mode stays, but reads as off.
SELECT tests.plan_a('basic');
SELECT is((SELECT fee_mode FROM public.center_payment_settings WHERE center_id = '521f1349-05c4-4417-9fa5-5289963af7db'), 'before',
          'basic: the stored fee mode is kept');
SELECT is((private.center_fee_settings('521f1349-05c4-4417-9fa5-5289963af7db')).fee_mode, 'off', 'basic: fee mode reads as off');
SELECT tests.login_server();
INSERT INTO tests.codes SELECT 'q2', public_code FROM public.issue_public_token('d0000000-0000-4000-8000-00000000000a', 'Qr Two', '03001110002', 'qr', 'liaquat-university-hospital');
SELECT tests.logout();
SELECT is(tests.appt('q2'), 'checked_in|-|-', 'basic: QR join goes straight into the line, no fee');

SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT is(public.get_reception_queue('521f1349-05c4-4417-9fa5-5289963af7db')->'fees'->>'fee_mode', 'off', 'basic: reception sees fees off');
SELECT throws_ok(format($$SELECT public.record_payment(%L, 1000, 'cash')$$, tests.id('q2')), 'PT402', NULL,
                 'basic: no new fees at the desk');
-- A token already waiting for its fee can still be settled.
SELECT is(public.record_payment(tests.id('q1'), 1000, 'cash')->>'payment_status', 'paid', 'basic: an awaiting token can still be paid');
SELECT is(tests.appt('q1'), 'checked_in|paid|1000', '... and joins the line');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000009');
SELECT is((public.get_payment_report('521f1349-05c4-4417-9fa5-5289963af7db', NULL, NULL)->'totals'->>'total_pkr')::int, 1000,
          'basic: records stay readable');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- Entitlements follow plan changes only
-- ---------------------------------------------------------------------------
UPDATE public.org_entitlements SET tokens_per_day = 77 WHERE organization_id = tests.org_a();
UPDATE public.org_subscriptions SET current_period_end = now() + interval '1 day', status = 'past_due'
WHERE organization_id = tests.org_a() AND status <> 'cancelled';
SELECT is((SELECT tokens_per_day FROM public.org_entitlements WHERE organization_id = tests.org_a()), 77,
          'a period or status change keeps a hand-edited override');
SELECT tests.plan_a('pro');
SELECT is((SELECT tokens_per_day FROM public.org_entitlements WHERE organization_id = tests.org_a()), NULL,
          'a plan change rewrites the entitlements');

SELECT * FROM finish();
ROLLBACK;
