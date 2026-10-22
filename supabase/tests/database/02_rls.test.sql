-- Phase 0.4: RLS. Run with: supabase test db --local supabase/tests/database
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

-- Patient 3 (test only): one appointment, at center B only.
INSERT INTO auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
VALUES ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000008', 'authenticated', 'authenticated',
        'patient.3@mediq.test', '{"full_name":"Patient Three"}');
INSERT INTO public.appointments (id, user_id, center_id, service_id, doctor_id, appointment_date, appointment_time, scheduled_at, status)
VALUES ('e0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000008', 'd2c1a3df-bb89-4fde-b73d-5bb9ec763481',
        '50000000-0000-4000-8000-00000000000b', 'd0000000-0000-4000-8000-00000000000b', CURRENT_DATE, '10:30',
        (CURRENT_DATE + time '10:30') AT TIME ZONE 'Asia/Karachi', 'confirmed');

-- 1E: app (slot) booking needs the online_booking module; both seed clinics move to the Clinic plan.
UPDATE public.org_subscriptions SET plan_id = 'clinic' WHERE status <> 'cancelled'
  AND organization_id IN (SELECT organization_id FROM public.service_centers
                          WHERE id IN ('521f1349-05c4-4417-9fa5-5289963af7db', 'd2c1a3df-bb89-4fde-b73d-5bb9ec763481'));

SELECT plan(38);

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------
SELECT is_empty($$SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'appointments' AND cmd IN ('INSERT', 'ALL')$$,
                'appointments: no INSERT policy left');
SELECT ok(NOT has_table_privilege('authenticated', 'public.appointments', 'INSERT')
          AND NOT has_table_privilege('anon', 'public.appointments', 'INSERT'), 'appointments: INSERT revoked from anon/authenticated');
SELECT ok((SELECT bool_and('security_invoker=true' = ANY (reloptions)) FROM pg_class
           WHERE oid IN ('public.current_token_view'::regclass, 'public.queue_view'::regclass)), 'views run with caller''s rights');

-- ---------------------------------------------------------------------------
-- anon sees nothing
-- ---------------------------------------------------------------------------
SELECT tests.login_anon();
SELECT is_empty($$SELECT id FROM public.appointments$$, 'anon: no appointments visible');
SELECT is_empty($$SELECT id FROM public.profiles$$, 'anon: no profiles visible');
SELECT throws_ok($$SELECT id FROM public.slot_locks$$, '42501', NULL, 'anon: slot_locks not readable at all');
SELECT throws_ok($$INSERT INTO public.appointments (user_id, center_id, service_id, scheduled_at, token_number)
                   VALUES (gen_random_uuid(), '521f1349-05c4-4417-9fa5-5289963af7db', '50000000-0000-4000-8000-00000000000a', now(), 99)$$,
                 '42501', NULL, 'anon: direct appointment insert denied');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Patient 1
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000006');
SELECT throws_ok($$INSERT INTO public.appointments (user_id, center_id, service_id, scheduled_at, token_number)
                   VALUES ('a0000000-0000-4000-8000-000000000006', '521f1349-05c4-4417-9fa5-5289963af7db', '50000000-0000-4000-8000-00000000000a', now(), 99)$$,
                 '42501', NULL, 'patient: direct appointment insert denied (book_appointment only)');
SELECT set_eq($$SELECT id::text FROM public.appointments$$,
              ARRAY['e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000004'], 'patient: sees only own appointments');
SELECT set_eq($$SELECT id::text FROM public.profiles$$, ARRAY['a0000000-0000-4000-8000-000000000006'], 'patient: sees only own profile');
SELECT is_empty($$UPDATE public.appointments SET status = 'cancelled' WHERE id = 'e0000000-0000-4000-8000-000000000003' RETURNING id$$,
                'patient: cannot update another patient''s appointment');
SELECT throws_ok($$SELECT public.lock_slot('d0000000-0000-4000-8000-00000000000b', '521f1349-05c4-4417-9fa5-5289963af7db', CURRENT_DATE + 1, '11:00 AM')$$,
                 'P0001', 'This doctor is not available at this clinic', 'booking: doctor must belong to the clinic');
SELECT lives_ok($$SELECT set_config('tests.lock_a', public.lock_slot('d0000000-0000-4000-8000-00000000000a', '521f1349-05c4-4417-9fa5-5289963af7db', CURRENT_DATE + 1, '11:30 AM')::text, true)$$,
                'booking: lock a center A slot');
SELECT throws_ok($$SELECT public.book_appointment(current_setting('tests.lock_a')::uuid, '50000000-0000-4000-8000-00000000000b', NULL)$$,
                 'P0001', 'This service is not offered at this clinic', 'booking: service must belong to the clinic');
SELECT lives_ok($$SELECT public.book_appointment(current_setting('tests.lock_a')::uuid, '50000000-0000-4000-8000-00000000000a', NULL)$$,
                'booking: book_appointment with a matching service works');
-- avatars: own folder only
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', 'a0000000-0000-4000-8000-000000000006/avatar.jpg')$$,
                'avatars: upload into own folder works');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', 'a0000000-0000-4000-8000-000000000007/avatar.jpg')$$,
                 '42501', NULL, 'avatars: upload into someone else''s folder denied');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', 'avatar.jpg')$$,
                 '42501', NULL, 'avatars: upload outside any user folder denied');
RESET ROLE;

-- Patient 2 holds a lock; patient 1 must not see it.
SELECT tests.login('a0000000-0000-4000-8000-000000000007');
SELECT lives_ok($$SELECT public.lock_slot('d0000000-0000-4000-8000-00000000000b', 'd2c1a3df-bb89-4fde-b73d-5bb9ec763481', CURRENT_DATE + 1, '12:00 PM')$$,
                'patient 2: lock a slot');
SELECT is((SELECT count(*)::int FROM public.slot_locks), 1, 'patient 2: sees own lock');
SELECT is_empty($$UPDATE storage.objects SET name = name WHERE bucket_id = 'avatars' AND name = 'a0000000-0000-4000-8000-000000000006/avatar.jpg' RETURNING id$$,
                'avatars: cannot overwrite someone else''s avatar');
-- The Storage API sets this before its DELETEs; without it a trigger blocks every direct delete.
SELECT set_config('storage.allow_delete_query', 'true', true);
SELECT is_empty($$DELETE FROM storage.objects WHERE bucket_id = 'avatars' AND name = 'a0000000-0000-4000-8000-000000000006/avatar.jpg' RETURNING id$$,
                'avatars: cannot delete someone else''s avatar');
RESET ROLE;
SELECT tests.login('a0000000-0000-4000-8000-000000000006');
SELECT is_empty($$SELECT id FROM public.slot_locks WHERE user_id <> 'a0000000-0000-4000-8000-000000000006'$$, 'patient 1: cannot see other people''s locks');
SELECT set_config('storage.allow_delete_query', 'true', true);
SELECT isnt_empty($$DELETE FROM storage.objects WHERE bucket_id = 'avatars' AND name = 'a0000000-0000-4000-8000-000000000006/avatar.jpg' RETURNING id$$,
                  'avatars: owner can delete own avatar');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Staff A: center A only
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT is_empty($$SELECT id FROM public.appointments WHERE center_id <> '521f1349-05c4-4417-9fa5-5289963af7db'$$,
                'staff A: no center B appointments visible');
SELECT ok((SELECT count(*) FROM public.appointments) >= 2, 'staff A: center A appointments visible');
SELECT is_empty($$UPDATE public.appointments SET status = 'checked_in' WHERE id = 'e0000000-0000-4000-8000-000000000003' RETURNING id$$,
                'staff A: cannot update a center B appointment');
SELECT throws_ok($$UPDATE public.appointments SET center_id = 'd2c1a3df-bb89-4fde-b73d-5bb9ec763481' WHERE id = 'e0000000-0000-4000-8000-000000000001'$$,
                 '42501', NULL, 'staff A: cannot move an appointment to center B');
SELECT results_eq($$UPDATE public.appointments SET status = 'checked_in', checked_in_at = now() WHERE id = 'e0000000-0000-4000-8000-000000000001' RETURNING status$$,
                  ARRAY['checked_in'], 'staff A: check-in at center A works (direct update, as the app does)');
SELECT set_eq($$SELECT id::text FROM public.profiles$$,
              ARRAY['a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000007'],
              'staff A: sees self + center A patients only (not patient 3, doctors, other staff, admin)');
SELECT is_empty($$UPDATE public.center_queue_settings SET is_on_break = true WHERE center_id = 'd2c1a3df-bb89-4fde-b73d-5bb9ec763481' RETURNING id$$,
                'staff A: cannot change center B queue settings');
SELECT is_empty($$UPDATE public.doctor_queue_settings SET is_on_break = true WHERE doctor_id = 'd0000000-0000-4000-8000-00000000000b' RETURNING doctor_id$$,
                'staff A: cannot change doctor B queue settings');
SELECT throws_ok($$INSERT INTO public.queue_updates (appointment_id, status) VALUES ('e0000000-0000-4000-8000-000000000003', 'waiting')$$,
                 '42501', NULL, 'staff A: cannot write queue updates for center B');
RESET ROLE;

-- Staff B sees patient 3 (center B), so the profile scope is center-based, not "any patient".
SELECT tests.login('a0000000-0000-4000-8000-000000000003');
SELECT ok(EXISTS (SELECT 1 FROM public.profiles WHERE id = 'a0000000-0000-4000-8000-000000000008'), 'staff B: sees center B patient 3');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Doctor A and admin
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000004');
SELECT is_empty($$SELECT id FROM public.appointments WHERE doctor_id IS DISTINCT FROM 'd0000000-0000-4000-8000-00000000000a'$$,
                'doctor A: sees only own appointments');
SELECT ok((SELECT count(*) FROM public.appointments) >= 2, 'doctor A: own appointments visible');
RESET ROLE;

SELECT tests.login('a0000000-0000-4000-8000-000000000001');
SELECT is((SELECT count(*)::int FROM public.appointments), 6, 'admin: sees all appointments (4 seeded + patient 3 + 1 booked here)');
SELECT ok((SELECT count(*) FROM public.profiles) >= 8, 'admin: sees all profiles');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
