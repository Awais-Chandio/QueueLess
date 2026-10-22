-- Phase 1E: module checks on every module RPC, clinic insights, manual billing (platform admin), owner settings.
-- Run with: supabase test db. Uses the seed accounts (supabase/seed.sql). Rolled back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO anon, authenticated;
CREATE SCHEMA tests;
GRANT USAGE ON SCHEMA tests TO anon, authenticated;
CREATE FUNCTION tests.login(p_user uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true),
         set_config('role', 'authenticated', true);
$$;
CREATE FUNCTION tests.logout() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true), set_config('role', 'postgres', true);
$$;
CREATE FUNCTION tests.org_a() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS
  $$SELECT organization_id FROM public.service_centers WHERE id = '521f1349-05c4-4417-9fa5-5289963af7db'$$;
CREATE FUNCTION tests.org_b() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS
  $$SELECT organization_id FROM public.service_centers WHERE id = 'd2c1a3df-bb89-4fde-b73d-5bb9ec763481'$$;
CREATE TABLE tests.codes (label text PRIMARY KEY, code text);
GRANT ALL ON tests.codes TO authenticated;
CREATE FUNCTION tests.id(p_label text) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS
  'SELECT a.id FROM public.appointments a WHERE a.public_code = (SELECT code FROM tests.codes WHERE label = p_label)';
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO anon, authenticated;

-- Seed: admin a..01; owner A a..09; staff A a..02 / center A / Dr. A d..0a (a..04); staff B a..03; patient a..06.
UPDATE public.appointments SET appointment_date = appointment_date - 7 WHERE doctor_id = 'd0000000-0000-4000-8000-00000000000a';
-- A plan without the queue module, to prove the queue RPCs check it.
INSERT INTO public.plans (id, name, modules, is_public) VALUES ('test_kiosk', 'Test kiosk', ARRAY['qr_join'], false);

SELECT plan(47);

-- ---------------------------------------------------------------------------
-- Module checks
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
INSERT INTO tests.codes SELECT 'w1', public_code FROM public.issue_token('d0000000-0000-4000-8000-00000000000a', 'Walk One', NULL, 'walk_in');
INSERT INTO tests.codes SELECT 'w2', public_code FROM public.issue_token('d0000000-0000-4000-8000-00000000000a', 'Walk Two', NULL, 'walk_in');
SELECT lives_ok($$SELECT * FROM public.call_next('d0000000-0000-4000-8000-00000000000a')$$, 'Free plan has the queue: call next works');
SELECT tests.logout();

UPDATE public.org_subscriptions SET plan_id = 'test_kiosk' WHERE organization_id = tests.org_a() AND status <> 'cancelled';
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT throws_ok($$SELECT * FROM public.call_next('d0000000-0000-4000-8000-00000000000a')$$, 'PT402', NULL, 'no queue module: call_next refused');
SELECT throws_ok(format('SELECT public.skip_token(%L)', tests.id('w1')), 'PT402', NULL, 'no queue module: skip refused');
SELECT throws_ok(format('SELECT public.mark_no_show(%L)', tests.id('w1')), 'PT402', NULL, 'no queue module: no-show refused');
SELECT throws_ok(format('SELECT public.recall_token(%L)', tests.id('w1')), 'PT402', NULL, 'no queue module: recall refused');
SELECT throws_ok($$SELECT public.set_doctor_break('d0000000-0000-4000-8000-00000000000a', true)$$, 'PT402', NULL, 'no queue module: break refused');
SELECT throws_ok($$SELECT public.set_doctor_late('d0000000-0000-4000-8000-00000000000a', 10)$$, 'PT402', NULL, 'no queue module: late refused');
SELECT throws_ok($$SELECT * FROM public.issue_token('d0000000-0000-4000-8000-00000000000a', 'X', NULL, 'walk_in')$$, 'PT402', NULL, 'no queue module: walk-in refused');
SELECT throws_matching($$SELECT * FROM public.call_next('d0000000-0000-4000-8000-00000000000a')$$,
                       'plan doesn''t include the live queue.*owner can upgrade', 'the message tells the desk what to do');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000003');
SELECT throws_ok($$SELECT * FROM public.call_next('d0000000-0000-4000-8000-00000000000a')$$, '42501', NULL, 'access is still checked first (other clinic: 42501)');
SELECT tests.logout();
UPDATE public.org_subscriptions SET plan_id = 'free' WHERE organization_id = tests.org_a() AND status <> 'cancelled';

-- Online booking
SELECT tests.login('a0000000-0000-4000-8000-000000000006');
SELECT throws_ok($$SELECT public.lock_slot('d0000000-0000-4000-8000-00000000000a', '521f1349-05c4-4417-9fa5-5289963af7db', CURRENT_DATE + 1, '10:00 AM')$$,
                 'PT402', NULL, 'Free: lock_slot refused (online_booking)');
SELECT tests.logout();
UPDATE public.org_subscriptions SET plan_id = 'clinic' WHERE organization_id = tests.org_a() AND status <> 'cancelled';
SELECT tests.login('a0000000-0000-4000-8000-000000000006');
SELECT set_config('tests.lock', public.lock_slot('d0000000-0000-4000-8000-00000000000a', '521f1349-05c4-4417-9fa5-5289963af7db', CURRENT_DATE + 1, '10:00 AM')::text, true);
SELECT tests.logout();
UPDATE public.org_subscriptions SET plan_id = 'free' WHERE organization_id = tests.org_a() AND status <> 'cancelled';
SELECT tests.login('a0000000-0000-4000-8000-000000000006');
SELECT throws_ok($$SELECT public.book_appointment(current_setting('tests.lock')::uuid, '50000000-0000-4000-8000-00000000000a', NULL)$$,
                 'PT402', NULL, 'book_appointment checks too (plan changed after the lock)');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- Insights (analytics)
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000009');
SELECT throws_ok($$SELECT public.get_clinic_insights('521f1349-05c4-4417-9fa5-5289963af7db')$$, 'PT402', NULL, 'Free: insights need analytics');
SELECT tests.logout();
UPDATE public.org_subscriptions SET plan_id = 'pro' WHERE organization_id = tests.org_a() AND status <> 'cancelled';
SELECT tests.login('a0000000-0000-4000-8000-000000000009');
SELECT is(jsonb_array_length(public.get_clinic_insights('521f1349-05c4-4417-9fa5-5289963af7db', 14)->'days'), 14, 'Pro: 14 days of insights');
SELECT is((public.get_clinic_insights('521f1349-05c4-4417-9fa5-5289963af7db', 7)->'totals'->>'tokens')::integer, 2, 'today''s two tokens counted');
SELECT is((public.get_clinic_insights('521f1349-05c4-4417-9fa5-5289963af7db', 7)->'totals'->>'seen')::integer, 0, 'nobody completed yet');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000004');
SELECT lives_ok($$SELECT public.get_clinic_insights('521f1349-05c4-4417-9fa5-5289963af7db')$$, 'the clinic''s doctor sees insights');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000003');
SELECT throws_ok($$SELECT public.get_clinic_insights('521f1349-05c4-4417-9fa5-5289963af7db')$$, '42501', NULL, 'other clinic''s staff: no insights');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- Platform admin: only is_admin()
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000009');
SELECT throws_ok($$SELECT public.admin_list_clinics()$$, '42501', NULL, 'clinic owner: not a platform admin');
SELECT throws_ok(format('SELECT public.admin_set_plan(%L, %L)', tests.org_a(), 'center'), '42501', NULL, 'owner cannot change their own plan');
SELECT throws_ok(format('SELECT public.admin_add_credits(%L, 100)', tests.org_a()), '42501', NULL, 'owner cannot add credits');
SELECT throws_ok(format('SELECT public.admin_add_payment(%L, 5000)', tests.org_a()), '42501', NULL, 'owner cannot record payments');
SELECT throws_ok(format('SELECT public.admin_set_org_status(%L, %L)', tests.org_a(), 'suspended'), '42501', NULL, 'owner cannot suspend');
SELECT throws_ok(format('SELECT public.admin_clinic_billing(%L)', tests.org_a()), '42501', NULL, 'owner cannot read admin billing');
SELECT tests.logout();

SELECT tests.login('a0000000-0000-4000-8000-000000000001');
SELECT ok(jsonb_array_length(public.admin_list_clinics()) >= 2, 'admin lists every clinic');
SELECT is((SELECT c->>'plan_id' FROM jsonb_array_elements(public.admin_list_clinics()) c WHERE (c->>'id')::uuid = tests.org_a()), 'pro', 'with its plan');
SELECT is(public.admin_set_plan(tests.org_a(), 'clinic', CURRENT_DATE + 30, 'Pilot: first month')->>'plan_id', 'clinic', 'admin changes the plan');
SELECT ok((SELECT 'sms' = ANY (modules) AND tokens_per_day = 150 FROM public.org_entitlements WHERE organization_id = tests.org_a()), 'entitlements follow the new plan');
SELECT is((SELECT count(*)::integer FROM public.org_subscriptions WHERE organization_id = tests.org_a() AND status <> 'cancelled'), 1, 'one live subscription');
SELECT throws_ok(format('SELECT public.admin_set_plan(%L, %L)', tests.org_a(), 'gold'), '22023', NULL, 'unknown plan refused');
SELECT is(public.admin_add_credits(tests.org_a(), 500, 'Starter pack'), 500, 'credits added: balance 500');
SELECT is(public.admin_add_credits(tests.org_a(), -100, 'Correction'), 400, 'negative correction');
SELECT throws_ok(format('SELECT public.admin_add_credits(%L, -1000)', tests.org_a()), '22023', NULL, 'balance never below zero');
SELECT throws_ok(format('SELECT public.admin_add_credits(%L, 0)', tests.org_a()), '22023', NULL, 'zero credits refused');
SELECT isnt(public.admin_add_payment(tests.org_a(), 4500, 'Easypaisa', 'October', CURRENT_DATE), NULL, 'payment recorded');
SELECT throws_ok(format('SELECT public.admin_add_payment(%L, -5)', tests.org_a()), '22023', NULL, 'negative payment refused');
SELECT is((SELECT c->'last_payment'->>'amount_pkr' FROM jsonb_array_elements(public.admin_list_clinics()) c WHERE (c->>'id')::uuid = tests.org_a()),
          '4500', 'list shows the last payment');
SELECT is((SELECT string_agg(e->>'kind', ',' ORDER BY e->>'created_at') FROM jsonb_array_elements(public.admin_clinic_billing(tests.org_a())->'events') e),
          'plan_change,credits,credits,payment', 'billing history in order');
SELECT public.admin_set_org_status(tests.org_a(), 'suspended', 'Unpaid');
SELECT tests.logout();

-- Suspended: the owner is locked out, tokens stop.
SELECT tests.login('a0000000-0000-4000-8000-000000000009');
SELECT throws_ok(format('SELECT public.get_org_settings(%L)', tests.org_a()), '42501', NULL, 'suspended clinic: owner locked out');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000001');
SELECT public.admin_set_org_status(tests.org_a(), 'active');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- Owners: billing history, message language and usage in settings
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000009');
SELECT is((SELECT count(*)::integer FROM public.billing_events WHERE organization_id = tests.org_a()), 6, 'owner reads their billing events (RLS)');
SELECT is(public.get_org_settings(tests.org_a())->'usage'->>'message_credits', '400', 'settings show the credits');
SELECT is(jsonb_array_length(public.get_org_settings(tests.org_a())->'billing'), 6, 'settings show billing history');
SELECT is((public.get_org_settings(tests.org_a())->'plan'->>'period_end')::date, CURRENT_DATE + 30, 'settings show the paid-until date');
SELECT lives_ok(format('SELECT public.set_message_language(%L, %L)', tests.org_a(), 'en'), 'owner switches messages to English');
SELECT is(public.get_org_settings(tests.org_a())->'organization'->>'message_language', 'en', '... and settings show it');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT throws_ok(format('SELECT public.set_message_language(%L, %L)', tests.org_a(), 'ur'), '42501', NULL, 'receptionist cannot change it');
SELECT is((SELECT count(*)::integer FROM public.billing_events), 0, 'receptionist reads no billing events');
SELECT tests.logout();

SELECT * FROM finish();
ROLLBACK;
