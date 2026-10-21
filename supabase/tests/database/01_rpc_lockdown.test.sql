-- Phase 0.3: RPC lockdown. Run with: supabase test db --local supabase/tests/database
-- Uses the seed accounts (supabase/seed.sql). Everything is rolled back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- Test scaffolding (rolled back). pgTAP is created after the migration removed
-- PUBLIC's default EXECUTE, so the test roles need an explicit grant.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO anon, authenticated;
CREATE SCHEMA tests;
GRANT USAGE ON SCHEMA tests TO anon, authenticated;

-- Impersonate a seed user the way PostgREST does: JWT claims + SET ROLE.
CREATE FUNCTION tests.login(p_user uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true),
         set_config('role', 'authenticated', true);
$$;
CREATE FUNCTION tests.login_anon() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '{"role":"anon"}', true),
         set_config('role', 'anon', true);
$$;

-- Seed ids
--   admin     a...01   staff A a...02 (center A)   staff B a...03 (center B)
--   doctor A  a...04 / doctors d...0a (center A)   doctor B a...05 / d...0b (center B)
--   patient 1 a...06   patient 2 a...07
--   appts: e..01 p1/docA confirmed, e..02 p2/docA pending, e..03 p2/docB confirmed, e..04 p1/docB checked_in

SELECT plan(48);

-- ---------------------------------------------------------------------------
-- Catalog checks
-- ---------------------------------------------------------------------------
SELECT is_empty($$
  SELECT p.oid::regprocedure::text
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND (has_function_privilege('anon', p.oid, 'EXECUTE')
         OR aclcontains(COALESCE(p.proacl, acldefault('f', p.proowner)), makeaclitem(0, p.proowner, 'EXECUTE', false)))
$$, 'no public function is executable by anon or PUBLIC');

SELECT set_eq($$
  SELECT p.oid::regprocedure::text FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
$$, ARRAY[
  'admin_delete_staff_account(uuid)', 'book_appointment(uuid,uuid,text)', 'call_appointment(uuid)',
  'cancel_appointment(uuid,text)', 'complete_appointment(uuid,integer)',
  'create_doctor_with_account(text,text,text,uuid,text,text,integer,uuid[])',
  'get_appointment_queue_snapshot(uuid)', 'get_available_slots(uuid,date)', 'get_current_token(uuid,date)',
  'get_doctor_availability(uuid)', 'get_doctor_income_summary(uuid)', 'get_doctor_queue_snapshot(uuid,date)',
  'get_doctor_recent_patients(uuid)', 'get_doctor_schedule(uuid)', 'get_doctor_today_appointments(uuid)',
  'get_doctors_availability_batch(uuid[])', 'get_my_staff_context()', 'is_admin()', 'is_staff()',
  'lock_slot(uuid,uuid,date,text)', 'people_ahead(uuid)', 'release_slot(uuid)',
  'set_center_break(uuid,date,timestamp with time zone,timestamp with time zone,boolean)',
  'staff_performance(text)', 'update_center_average_consultation_time(uuid,date,numeric)',
  -- 0.6
  'save_visit_summary(uuid,text,text,date,jsonb)', 'busiest_services(text)', 'busiest_centers(text)', 'bookings_per_day(text)'
], 'authenticated can execute exactly the RPCs the app uses');

SELECT is_empty($$
  SELECT p.oid::regprocedure::text FROM pg_proc p
  WHERE p.pronamespace IN ('public'::regnamespace, 'private'::regnamespace)
    AND p.proname <> 'rls_auto_enable'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
    AND NOT ('search_path=""' = ANY (COALESCE(p.proconfig, '{}')))
$$, 'every app function in public/private pins search_path to empty');

-- New functions created by postgres get no EXECUTE for PUBLIC/anon.
CREATE FUNCTION public.zz_default_priv_probe() RETURNS int LANGUAGE sql AS 'SELECT 1';
SELECT ok(NOT has_function_privilege('anon', 'public.zz_default_priv_probe()', 'EXECUTE'),
          'default privileges: new functions are not executable by anon');

-- ---------------------------------------------------------------------------
-- anon: blocked from every RPC
-- ---------------------------------------------------------------------------
SELECT tests.login_anon();
SELECT throws_ok($$SELECT public.start_service('e0000000-0000-4000-8000-000000000001')$$, '42501', NULL, 'anon: start_service denied');
SELECT throws_ok($$SELECT public.confirm_appointment('e0000000-0000-4000-8000-000000000002')$$, '42501', NULL, 'anon: confirm_appointment denied');
SELECT throws_ok($$SELECT public.get_center_queue_snapshot('521f1349-05c4-4417-9fa5-5289963af7db', CURRENT_DATE)$$, '42501', NULL, 'anon: get_center_queue_snapshot denied');
SELECT throws_ok($$SELECT public.get_appointment_queue_snapshot('e0000000-0000-4000-8000-000000000001')$$, '42501', NULL, 'anon: get_appointment_queue_snapshot denied');
SELECT throws_ok($$SELECT public.get_current_token('521f1349-05c4-4417-9fa5-5289963af7db', CURRENT_DATE)$$, '42501', NULL, 'anon: get_current_token denied');
SELECT throws_ok($$SELECT public.people_ahead('e0000000-0000-4000-8000-000000000001'::uuid)$$, '42501', NULL, 'anon: people_ahead denied');
SELECT throws_ok($$SELECT public.cleanup_stale_appointments()$$, '42501', NULL, 'anon: cleanup_stale_appointments denied');
SELECT throws_ok($$SELECT public.refresh_live_queue('d0000000-0000-4000-8000-00000000000a', CURRENT_DATE)$$, '42501', NULL, 'anon: refresh_live_queue denied');
SELECT throws_ok($$SELECT * FROM public.staff_performance('all')$$, '42501', NULL, 'anon: staff_performance denied');
SELECT throws_ok($$SELECT * FROM public.get_doctor_today_appointments('d0000000-0000-4000-8000-00000000000a')$$, '42501', NULL, 'anon: get_doctor_today_appointments denied');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Patient 1: own data only
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000006');
SELECT throws_ok($$SELECT * FROM public.get_doctor_today_appointments('d0000000-0000-4000-8000-00000000000a')$$, '42501', NULL, 'patient: cannot list a doctor''s appointments');
SELECT throws_ok($$SELECT * FROM public.get_doctor_recent_patients('d0000000-0000-4000-8000-00000000000b')$$, '42501', NULL, 'patient: cannot list a doctor''s patients');
SELECT throws_ok($$SELECT * FROM public.get_doctor_income_summary('d0000000-0000-4000-8000-00000000000a')$$, '42501', NULL, 'patient: cannot read a doctor''s income');
SELECT throws_ok($$SELECT public.get_appointment_queue_snapshot('e0000000-0000-4000-8000-000000000002')$$, '42501', NULL, 'patient: cannot read another patient''s queue snapshot');
SELECT throws_ok($$SELECT public.people_ahead('e0000000-0000-4000-8000-000000000003'::uuid)$$, '42501', NULL, 'patient: people_ahead on another patient''s appointment denied');
SELECT throws_ok($$SELECT public.get_doctor_queue_snapshot('d0000000-0000-4000-8000-00000000000a', CURRENT_DATE + 1)$$, '42501', NULL, 'patient: no doctor queue for a day they have no appointment');
SELECT throws_ok($$SELECT public.call_appointment('e0000000-0000-4000-8000-000000000001')$$, '42501', NULL, 'patient: cannot call their own appointment');
SELECT throws_ok($$SELECT * FROM public.staff_performance('all')$$, '42501', NULL, 'patient: staff_performance denied');
SELECT is((public.get_appointment_queue_snapshot('e0000000-0000-4000-8000-000000000001')->>'your_token')::int, 1, 'patient: own queue snapshot works');
SELECT lives_ok($$SELECT public.people_ahead('e0000000-0000-4000-8000-000000000001'::uuid)$$, 'patient: people_ahead on own appointment works');
SELECT ok(public.get_doctor_queue_snapshot('d0000000-0000-4000-8000-00000000000a', CURRENT_DATE) ? 'current_token', 'patient: queue of own doctor today works');
SELECT is((SELECT status FROM public.get_doctor_availability('d0000000-0000-4000-8000-00000000000a')), 'available', 'patient: get_doctor_availability works again (doctor_schedules)');

-- Normal booking flow: lock a slot, book it (triggers assign the token).
SELECT lives_ok($$
  SELECT set_config('tests.lock_id', public.lock_slot('d0000000-0000-4000-8000-00000000000a', '521f1349-05c4-4417-9fa5-5289963af7db', CURRENT_DATE + 1, '11:00 AM')::text, true)
$$, 'patient: lock_slot works');
SELECT lives_ok($$
  SELECT set_config('tests.appt_id', public.book_appointment(current_setting('tests.lock_id')::uuid, '50000000-0000-4000-8000-00000000000a', NULL)::text, true)
$$, 'patient: book_appointment works');
SELECT is((SELECT token_number FROM public.appointments WHERE id = current_setting('tests.appt_id')::uuid), 1, 'patient: booked appointment got token 1');
RESET ROLE;

-- Patient 2 cancels their own pending appointment (cancel_appointment used to always fail).
SELECT tests.login('a0000000-0000-4000-8000-000000000007');
SELECT lives_ok($$SELECT public.cancel_appointment('e0000000-0000-4000-8000-000000000002', 'test')$$, 'patient: cancel_appointment works');
RESET ROLE;
SELECT is((SELECT cancelled_by FROM public.appointments WHERE id = 'e0000000-0000-4000-8000-000000000002'), 'a0000000-0000-4000-8000-000000000007'::uuid, 'cancel_appointment records who cancelled');

-- ---------------------------------------------------------------------------
-- Staff A: center A only
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT throws_ok($$SELECT public.call_appointment('e0000000-0000-4000-8000-000000000003')$$, '42501', NULL, 'staff A: cannot call a center B appointment');
SELECT throws_ok($$SELECT public.set_center_break('d2c1a3df-bb89-4fde-b73d-5bb9ec763481', CURRENT_DATE, now(), now() + interval '10 min', true)$$, '42501', NULL, 'staff A: cannot set center B break');
SELECT throws_ok($$SELECT public.update_center_average_consultation_time('d2c1a3df-bb89-4fde-b73d-5bb9ec763481', CURRENT_DATE, 12)$$, '42501', NULL, 'staff A: cannot change center B average');
SELECT throws_ok($$SELECT public.get_appointment_queue_snapshot('e0000000-0000-4000-8000-000000000003')$$, '42501', NULL, 'staff A: cannot read center B appointment snapshot');
SELECT throws_ok($$SELECT * FROM public.get_doctor_today_appointments('d0000000-0000-4000-8000-00000000000a')$$, '42501', NULL, 'staff A: doctor dashboard RPCs are doctor/admin only');
SELECT lives_ok($$SELECT public.set_center_break('521f1349-05c4-4417-9fa5-5289963af7db', CURRENT_DATE, NULL, NULL, false)$$, 'staff A: set center A break works');
SELECT lives_ok($$SELECT public.update_center_average_consultation_time('521f1349-05c4-4417-9fa5-5289963af7db', CURRENT_DATE, 12)$$, 'staff A: change center A average works');
SELECT is((public.call_appointment('e0000000-0000-4000-8000-000000000001')).status, 'called', 'staff A: call center A appointment works');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Doctors: own data and own patients only
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000005');
SELECT throws_ok($$SELECT * FROM public.get_doctor_today_appointments('d0000000-0000-4000-8000-00000000000a')$$, '42501', NULL, 'doctor B: cannot list doctor A appointments');
SELECT throws_ok($$SELECT public.complete_appointment('e0000000-0000-4000-8000-000000000001')$$, '42501', NULL, 'doctor B: cannot complete doctor A appointment');
RESET ROLE;

SELECT tests.login('a0000000-0000-4000-8000-000000000004');
SELECT is((SELECT count(*)::int FROM public.get_doctor_today_appointments('d0000000-0000-4000-8000-00000000000a')), 2, 'doctor A: own today list works');
SELECT lives_ok($$SELECT * FROM public.get_doctor_recent_patients('d0000000-0000-4000-8000-00000000000a')$$, 'doctor A: own recent patients works');
SELECT lives_ok($$SELECT * FROM public.get_doctor_income_summary('d0000000-0000-4000-8000-00000000000a')$$, 'doctor A: own income works');
SELECT is((public.complete_appointment('e0000000-0000-4000-8000-000000000001')).status, 'completed', 'doctor A: complete own appointment works');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Admin and server context
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000001');
SELECT is((SELECT count(*)::int FROM public.get_doctor_today_appointments('d0000000-0000-4000-8000-00000000000b')), 2, 'admin: any doctor''s list works');
SELECT lives_ok($$SELECT * FROM public.staff_performance('all')$$, 'admin: staff_performance works');
RESET ROLE;

-- No client role behind the call (pg_cron, SQL editor): cleanup is allowed.
-- Nothing stale, so this only exercises the caller check: with stale 'confirmed'
-- rows the existing no_show update trips validate_appointment_status_transition
-- (confirmed -> no_show isn't an allowed transition); Phase 1D fixes that.
UPDATE public.appointments SET scheduled_at = now() + interval '1 hour';
SELECT lives_ok($$SELECT public.cleanup_stale_appointments()$$, 'server context: cleanup_stale_appointments runs');

SELECT * FROM finish();
ROLLBACK;
