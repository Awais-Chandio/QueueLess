-- Phase 0.4 follow-up: audit_logs scope, server-only notifications, avatar folders.
-- Run with: supabase test db --local supabase/tests/database
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO anon, authenticated;
CREATE SCHEMA tests;
GRANT USAGE ON SCHEMA tests TO anon, authenticated;
CREATE FUNCTION tests.login(p_user uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true),
         set_config('role', 'authenticated', true);
$$;

-- One audit row per center (written as postgres).
INSERT INTO public.audit_logs (staff_user_id, appointment_id, action, old_status, new_status) VALUES
  ('a0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'check_in', 'confirmed', 'checked_in'),
  ('a0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000003', 'check_in', 'confirmed', 'checked_in');

SELECT plan(23);

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT set_eq($$SELECT appointment_id::text FROM public.audit_logs$$, ARRAY['e0000000-0000-4000-8000-000000000001'],
              'staff A: reads only center A audit logs');
SELECT throws_ok($$INSERT INTO public.audit_logs (staff_user_id, appointment_id, action) VALUES ('a0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000003', 'call')$$,
                 '42501', NULL, 'staff A: cannot write an audit log for a center B appointment');
SELECT throws_ok($$INSERT INTO public.audit_logs (staff_user_id, appointment_id, action) VALUES ('a0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001', 'call')$$,
                 '42501', NULL, 'staff A: cannot write an audit log as someone else');
SELECT lives_ok($$INSERT INTO public.audit_logs (staff_user_id, appointment_id, action) VALUES ('a0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'call')$$,
                'staff A: writes an audit log for a center A appointment (app flow)');
RESET ROLE;

SELECT tests.login('a0000000-0000-4000-8000-000000000001');
SELECT ok((SELECT count(*) FROM public.audit_logs) >= 3, 'admin: reads all audit logs');
RESET ROLE;

SELECT tests.login('a0000000-0000-4000-8000-000000000006');
SELECT is_empty($$SELECT id FROM public.audit_logs$$, 'patient: reads no audit logs');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- notifications: no client INSERT, triggers still create them
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000006');
SELECT throws_ok($$INSERT INTO public.notifications (user_id, title, message) VALUES ('a0000000-0000-4000-8000-000000000006', 't', 'm')$$,
                 '42501', NULL, 'patient: cannot insert notifications, not even for self');
RESET ROLE;

SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT throws_ok($$INSERT INTO public.notifications (user_id, title, message) VALUES ('a0000000-0000-4000-8000-000000000006', 't', 'm')$$,
                 '42501', NULL, 'staff: cannot insert notifications for a patient');
RESET ROLE;

SELECT set_config('tests.before', (SELECT count(*) FROM public.notifications WHERE appointment_id = 'e0000000-0000-4000-8000-000000000002')::text, true);
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT lives_ok($$UPDATE public.appointments SET status = 'cancelled' WHERE id = 'e0000000-0000-4000-8000-000000000002'$$,
                'staff A: cancel via direct update still works (cancel trigger writes the notification)');
RESET ROLE;
SELECT ok((SELECT count(*) FROM public.notifications WHERE appointment_id = 'e0000000-0000-4000-8000-000000000002') > current_setting('tests.before')::int,
          'cancel trigger created a notification for the patient');

SELECT tests.login('a0000000-0000-4000-8000-000000000006');
SELECT lives_ok($$SELECT public.book_appointment(public.lock_slot('d0000000-0000-4000-8000-00000000000a', '521f1349-05c4-4417-9fa5-5289963af7db', CURRENT_DATE + 1, '02:00 PM'), '50000000-0000-4000-8000-00000000000a', NULL)$$,
                'patient: booking still works (booking trigger writes the notification)');
SELECT ok((SELECT count(*) FROM public.notifications WHERE title = 'Appointment Confirmed') >= 1, 'patient: sees own booking notification');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- avatars: own folder; doctors/<doctor_id>/ for that doctor or admin; no listing
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000006');
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', 'a0000000-0000-4000-8000-000000000006/avatar.jpg')$$,
                'patient: upload own avatar');
SELECT isnt_empty($$SELECT id FROM storage.objects WHERE bucket_id = 'avatars'$$, 'patient: sees own avatar object (needed for upsert)');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', 'doctors/d0000000-0000-4000-8000-00000000000a/photo.jpg')$$,
                 '42501', NULL, 'patient: cannot write a doctor photo');
RESET ROLE;

SELECT tests.login('a0000000-0000-4000-8000-000000000004');
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', 'doctors/d0000000-0000-4000-8000-00000000000a/photo.jpg')$$,
                'doctor A: upload own doctor photo (ProfileScreen flow)');
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'avatars'), 1, 'doctor A: lists only own doctor folder, not the patient''s avatar');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', 'doctors/not-a-uuid/photo.jpg')$$,
                 '42501', NULL, 'doctor A: malformed doctor path is denied, not a cast error');
RESET ROLE;

SELECT tests.login('a0000000-0000-4000-8000-000000000005');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', 'doctors/d0000000-0000-4000-8000-00000000000a/other.jpg')$$,
                 '42501', NULL, 'doctor B: cannot write doctor A''s photo');
SELECT is_empty($$UPDATE storage.objects SET name = name WHERE name = 'doctors/d0000000-0000-4000-8000-00000000000a/photo.jpg' RETURNING id$$,
                'doctor B: cannot overwrite doctor A''s photo');
RESET ROLE;

SELECT tests.login('a0000000-0000-4000-8000-000000000001');
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', 'doctors/d0000000-0000-4000-8000-00000000000b/photo.jpg')$$,
                'admin: upload a doctor photo (create/edit doctor flow)');
RESET ROLE;

SELECT tests.login('a0000000-0000-4000-8000-000000000007');
SELECT is_empty($$SELECT id FROM storage.objects WHERE bucket_id = 'avatars'$$, 'patient 2: cannot list anyone else''s files');
RESET ROLE;

-- Catalog: no broad SELECT left on the avatars bucket.
SELECT is_empty($$SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                  AND cmd = 'SELECT' AND qual = '(bucket_id = ''avatars''::text)'$$, 'avatars: broad listing policy removed');

SELECT * FROM finish();
ROLLBACK;
