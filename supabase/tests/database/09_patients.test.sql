-- Phase 1A.4: guest patients. Run with: supabase test db
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
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO anon, authenticated;

-- Seed: center A 521f1349 / doctor A d..0a (account a..04) / staff A a..02 / owner A a..09
--       center B d2c1a3df / doctor B d..0b / staff B a..03
--       patient 1 a..06: e..01 (A), e..04 (B) | patient 2 a..07: e..02 (A), e..03 (B)
--
-- Fixture: a guest (no account) with a token at center A.
INSERT INTO public.patients (id, organization_id, name, phone)
SELECT 'f0000000-0000-4000-8000-000000000001', organization_id, 'Guest Walkin', '+923001234567'
FROM public.service_centers WHERE id = '521f1349-05c4-4417-9fa5-5289963af7db';
INSERT INTO public.appointments (id, patient_id, center_id, service_id, doctor_id, appointment_date, scheduled_at, status)
VALUES ('e0000000-0000-4000-8000-0000000000f1', 'f0000000-0000-4000-8000-000000000001', '521f1349-05c4-4417-9fa5-5289963af7db',
        '50000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-00000000000a', CURRENT_DATE, now(), 'checked_in');

-- Not granted to clients (the app checks in with a direct update). Granted
-- inside this rolled-back test so its NULL-safe caller check is exercised.
GRANT EXECUTE ON FUNCTION public.check_in_appointment(uuid) TO authenticated;

SELECT plan(30);

-- ---------------------------------------------------------------------------
-- Schema and backfill
-- ---------------------------------------------------------------------------
SELECT col_not_null('public', 'appointments', 'patient_id', 'appointments.patient_id is NOT NULL');
SELECT col_is_null('public', 'appointments', 'user_id', 'appointments.user_id is optional');
SELECT is_empty($$SELECT a.id FROM public.appointments a
                  JOIN public.patients p ON p.id = a.patient_id
                  JOIN public.service_centers c ON c.id = a.center_id
                  WHERE p.organization_id <> c.organization_id
                     OR (a.user_id IS NOT NULL AND p.user_id IS DISTINCT FROM a.user_id AND p.user_id IS NOT NULL)$$,
                'every appointment''s patient is in the center''s organization and matches its account');
SELECT is((SELECT count(*)::int FROM public.patients WHERE user_id = 'a0000000-0000-4000-8000-000000000006'), 2,
          'patient 1 (seen at two clinics) has one record per organization');
SELECT is((SELECT name FROM public.patients WHERE user_id = 'a0000000-0000-4000-8000-000000000006' LIMIT 1), 'Patient One',
          'account patient records take the profile name');
SELECT is(private.normalize_phone(' 0092 300-123 4567 '), '+923001234567', 'normalize_phone: 00 -> +, separators dropped');
SELECT is(private.normalize_phone('call me'), NULL, 'normalize_phone: garbage -> NULL');

-- ---------------------------------------------------------------------------
-- App booking still works and reuses the account's record
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000007');
CREATE TEMP TABLE booked ON COMMIT DROP AS
SELECT public.book_appointment(
  public.lock_slot('d0000000-0000-4000-8000-00000000000a', '521f1349-05c4-4417-9fa5-5289963af7db', CURRENT_DATE + 1, '10:00 AM'),
  '50000000-0000-4000-8000-00000000000a', 'phase 1a') AS id;
SELECT tests.logout();
SELECT is((SELECT a.patient_id FROM public.appointments a WHERE a.id = (SELECT id FROM booked)),
          (SELECT patient_id FROM public.appointments WHERE id = 'e0000000-0000-4000-8000-000000000002'),
          'book_appointment: patient_id filled from the account, same record as their earlier visit');

-- ---------------------------------------------------------------------------
-- Integrity
-- ---------------------------------------------------------------------------
SELECT throws_ok($$INSERT INTO public.appointments (patient_id, center_id, service_id, appointment_date, scheduled_at)
                   VALUES ('f0000000-0000-4000-8000-000000000001', 'd2c1a3df-bb89-4fde-b73d-5bb9ec763481',
                           '50000000-0000-4000-8000-00000000000b', CURRENT_DATE, now())$$,
                 '42501', 'Patient belongs to another clinic', 'a patient of org A cannot be booked at org B');
SELECT throws_ok($$INSERT INTO public.appointments (center_id, service_id, appointment_date, scheduled_at)
                   VALUES ('521f1349-05c4-4417-9fa5-5289963af7db', '50000000-0000-4000-8000-00000000000a', CURRENT_DATE, now())$$,
                 '23502', NULL, 'an appointment needs a patient or an account');
SELECT throws_ok($$UPDATE public.service_centers SET organization_id = (SELECT organization_id FROM public.service_centers WHERE id = 'd2c1a3df-bb89-4fde-b73d-5bb9ec763481')
                   WHERE id = '521f1349-05c4-4417-9fa5-5289963af7db'$$,
                 '23503', NULL, 'a center with appointments cannot move to another organization');

-- ---------------------------------------------------------------------------
-- Guests are safe from other accounts (NULL user_id)
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000006');
SELECT throws_ok($$SELECT public.cancel_appointment('e0000000-0000-4000-8000-0000000000f1', 'x')$$, 'P0001',
                 'Appointment not found or unauthorized', 'other account: cannot cancel a guest token');
SELECT throws_ok($$SELECT public.check_in_appointment('e0000000-0000-4000-8000-0000000000f1')$$, 'P0001',
                 'Appointment not found', 'other account: cannot check in a guest token');
SELECT throws_ok($$SELECT public.get_appointment_queue_snapshot('e0000000-0000-4000-8000-0000000000f1')$$, '42501', NULL,
                 'other account: cannot read a guest token snapshot');
SELECT throws_ok($$SELECT public.people_ahead('e0000000-0000-4000-8000-0000000000f1'::uuid)$$, '42501', NULL,
                 'other account: cannot read a guest token position');
SELECT is_empty($$SELECT id FROM public.appointments WHERE id = 'e0000000-0000-4000-8000-0000000000f1'$$,
                'other account: guest token not visible');
SELECT throws_ok($$UPDATE public.appointments SET patient_id = 'f0000000-0000-4000-8000-000000000001'
                   WHERE id = 'e0000000-0000-4000-8000-000000000001'$$, '42501', NULL, 'patient: cannot change patient_id');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- Who sees which patient records
-- ---------------------------------------------------------------------------
SELECT tests.login_anon();
SELECT throws_ok($$SELECT 1 FROM public.patients$$, '42501', NULL, 'anon: patients not readable');
SELECT tests.logout();

SELECT tests.login('a0000000-0000-4000-8000-000000000006');
SELECT set_eq($$SELECT user_id::text FROM public.patients$$, ARRAY['a0000000-0000-4000-8000-000000000006'],
              'patient: only own records');
SELECT tests.logout();

SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT set_eq($$SELECT name FROM public.patients$$, ARRAY['Patient One', 'Patient Two', 'Guest Walkin'],
              'receptionist A: patients with appointments at center A only');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.patients p JOIN public.service_centers c ON c.organization_id = p.organization_id
                      WHERE c.id = 'd2c1a3df-bb89-4fde-b73d-5bb9ec763481'),
          'receptionist A: no org B patient records');
SELECT is((SELECT patient_name FROM public.appointments_full WHERE id = 'e0000000-0000-4000-8000-0000000000f1'), 'Guest Walkin',
          'receptionist A: appointments_full shows the guest''s name');
SELECT is((SELECT patient_name FROM public.appointments_full WHERE id = 'e0000000-0000-4000-8000-000000000001'), 'Patient One',
          'receptionist A: account patients still show their profile name');
SELECT lives_ok($$UPDATE public.appointments SET status = 'cancelled', cancel_reason = 'left', cancelled_at = now()
                  WHERE id = 'e0000000-0000-4000-8000-0000000000f1'$$,
                'receptionist A: can cancel a guest token (no notification for guests)');
SELECT tests.logout();

SELECT tests.login('a0000000-0000-4000-8000-000000000003');
SELECT is_empty($$SELECT 1 FROM public.patients WHERE name = 'Guest Walkin'$$, 'staff B: cannot see org A guest');
SELECT tests.logout();

SELECT tests.login('a0000000-0000-4000-8000-000000000009');
SELECT ok((SELECT count(*) FROM public.patients) >= 3 AND NOT EXISTS (
            SELECT 1 FROM public.patients p JOIN public.service_centers c ON c.organization_id = p.organization_id
            WHERE c.id = 'd2c1a3df-bb89-4fde-b73d-5bb9ec763481'),
          'owner A: org A patient records, none of org B');
SELECT tests.logout();

SELECT tests.login('a0000000-0000-4000-8000-000000000004');
SELECT ok('Guest Walkin' IN (SELECT patient_name FROM public.get_doctor_today_appointments('d0000000-0000-4000-8000-00000000000a')),
          'doctor A: guest appears in today''s list with their name');
SELECT ok('Guest Walkin' IN (SELECT patient_name FROM public.get_doctor_recent_patients('d0000000-0000-4000-8000-00000000000a')),
          'doctor A: guest appears in recent patients');
SELECT is((SELECT count(*)::int FROM public.notifications WHERE appointment_id = 'e0000000-0000-4000-8000-0000000000f1'), 0,
          'no notification rows for a guest');
SELECT tests.logout();

-- Visit summary for a guest.
INSERT INTO public.appointments (id, patient_id, center_id, service_id, doctor_id, appointment_date, scheduled_at, status)
VALUES ('e0000000-0000-4000-8000-0000000000f2', 'f0000000-0000-4000-8000-000000000001', '521f1349-05c4-4417-9fa5-5289963af7db',
        '50000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-00000000000a', CURRENT_DATE, now(), 'called');
UPDATE public.appointments SET status = 'completed' WHERE id = 'e0000000-0000-4000-8000-0000000000f2';
SELECT tests.login('a0000000-0000-4000-8000-000000000004');
-- 1C: guests get visit summaries too (linked to their patient record).
SELECT lives_ok($$SELECT public.save_visit_summary('e0000000-0000-4000-8000-0000000000f2', 'flu', NULL, NULL, '[]')$$,
                'save_visit_summary: works for guests (1C)');
SELECT tests.logout();

SELECT * FROM finish();
ROLLBACK;
