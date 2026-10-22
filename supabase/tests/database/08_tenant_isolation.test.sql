-- Phase 1A.3: tenant isolation through organization membership. Run with: supabase test db
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
CREATE FUNCTION tests.logout() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true), set_config('role', 'postgres', true);
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO anon, authenticated;

-- Seed ids
--   org A: center A 521f1349 | staff A a..02 (receptionist) | doctor A a..04 / d..0a | owner A a..09
--   org B: center B d2c1a3df | staff B a..03               | doctor B a..05 / d..0b
--   appts: e..01, e..02 at A (doctor A); e..03, e..04 at B (doctor B); patient 1 a..06 owns e..01 and e..04
--
-- Fixture: a second center A2 inside org A with one appointment (patient 2),
-- to show receptionist center scope vs. owner org scope.
INSERT INTO public.service_centers (id, name, city, address, organization_id)
SELECT 'c0000000-0000-4000-8000-0000000000a2', 'Center A2', 'Hyderabad', 'Branch road', organization_id
FROM public.service_centers WHERE id = '521f1349-05c4-4417-9fa5-5289963af7db';
INSERT INTO public.services (id, center_id, name) VALUES
  ('50000000-0000-4000-8000-0000000000a2', 'c0000000-0000-4000-8000-0000000000a2', 'OPD A2');
INSERT INTO public.appointments (id, user_id, center_id, service_id, appointment_date, appointment_time, scheduled_at, status)
VALUES ('e0000000-0000-4000-8000-0000000000a2', 'a0000000-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-0000000000a2',
        '50000000-0000-4000-8000-0000000000a2', CURRENT_DATE, '11:00', now(), 'confirmed');
INSERT INTO public.center_daily_tokens (center_id, appointment_date, last_token_number) VALUES
  ('521f1349-05c4-4417-9fa5-5289963af7db', CURRENT_DATE + 5, 3),
  ('d2c1a3df-bb89-4fde-b73d-5bb9ec763481', CURRENT_DATE + 5, 7);
INSERT INTO public.doctors (id, center_id, name, specialty, is_active)
VALUES ('d0000000-0000-4000-8000-0000000000b9', 'd2c1a3df-bb89-4fde-b73d-5bb9ec763481', 'Dr. Inactive B', 'GP', false);

-- Server-only RPC (no client grant). Granted inside this rolled-back test so
-- its caller check is what's exercised, not the missing grant.
GRANT EXECUTE ON FUNCTION public.get_center_queue_snapshot(uuid, date) TO authenticated;

SELECT plan(32);

-- ---------------------------------------------------------------------------
-- Owner A: whole organization A, nothing of B
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000009');
SELECT set_eq($$SELECT id::text FROM public.appointments$$,
              ARRAY['e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-0000000000a2'],
              'owner A: sees every appointment of org A (both centers), none of org B');
SELECT is_empty($$SELECT id FROM public.doctors WHERE id = 'd0000000-0000-4000-8000-0000000000b9'$$,
                'owner A: cannot see org B''s inactive doctor');
SELECT lives_ok($$SELECT public.call_appointment('e0000000-0000-4000-8000-000000000001')$$, 'owner A: can call an org A token');
SELECT throws_ok($$SELECT public.call_appointment('e0000000-0000-4000-8000-000000000003')$$, '42501', NULL,
                 'owner A: cannot call an org B token');
SELECT throws_ok($$SELECT public.set_center_break('d2c1a3df-bb89-4fde-b73d-5bb9ec763481', CURRENT_DATE, now(), now() + interval '1 hour', true)$$,
                 '42501', NULL, 'owner A: cannot put org B on break');
UPDATE public.appointments SET status = 'cancelled' WHERE id = 'e0000000-0000-4000-8000-000000000003';
SELECT tests.logout();
SELECT is((SELECT status FROM public.appointments WHERE id = 'e0000000-0000-4000-8000-000000000003'), 'confirmed',
          'owner A: cannot cancel an org B appointment');

-- ---------------------------------------------------------------------------
-- Receptionist A: assigned center only, even inside org A
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT set_eq($$SELECT id::text FROM public.appointments$$,
              ARRAY['e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002'],
              'receptionist A: only center A (not center A2, not org B)');
SELECT throws_ok($$SELECT public.call_appointment('e0000000-0000-4000-8000-0000000000a2')$$, '42501', NULL,
                 'receptionist A: cannot call a token at unassigned center A2');
SELECT is_empty($$SELECT 1 FROM public.center_daily_tokens WHERE center_id = 'd2c1a3df-bb89-4fde-b73d-5bb9ec763481'$$,
                'receptionist A: cannot read org B daily token counters');
SELECT set_eq($$SELECT last_token_number FROM public.center_daily_tokens WHERE appointment_date = CURRENT_DATE + 5$$,
              ARRAY[3], 'receptionist A: reads own center daily token counter only');
SELECT is_empty($$SELECT 1 FROM public.doctors WHERE center_id = 'd2c1a3df-bb89-4fde-b73d-5bb9ec763481' AND NOT is_active$$,
                'receptionist A: cannot see org B inactive doctors');
UPDATE public.doctors SET is_on_break = true WHERE id = 'd0000000-0000-4000-8000-00000000000b';
SELECT throws_ok($$SELECT public.get_center_queue_snapshot('d2c1a3df-bb89-4fde-b73d-5bb9ec763481', CURRENT_DATE)$$, '42501', NULL,
                 'receptionist A: cannot read org B queue snapshot');
SELECT throws_ok($$SELECT public.recalculate_doctor_average('d0000000-0000-4000-8000-00000000000b')$$, '42501', NULL,
                 'receptionist A: cannot touch org B doctor settings');
SELECT is_empty($$SELECT id FROM public.profiles WHERE id = 'a0000000-0000-4000-8000-000000000008'
                  UNION ALL SELECT id FROM public.profiles WHERE id = 'a0000000-0000-4000-8000-000000000005'$$,
                'receptionist A: no org B profiles');
SELECT tests.logout();
SELECT is((SELECT is_on_break FROM public.doctors WHERE id = 'd0000000-0000-4000-8000-00000000000b'), false,
          'receptionist A: cannot toggle org B doctor break');

-- Receptionist membership gone (e.g. suspended clinic): access gone, even with
-- the staff_centers row still there.
UPDATE public.organizations SET status = 'suspended'
WHERE id = (SELECT organization_id FROM public.service_centers WHERE id = '521f1349-05c4-4417-9fa5-5289963af7db');
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT is_empty($$SELECT id FROM public.appointments$$, 'receptionist of a suspended organization: sees nothing');
SELECT throws_ok($$SELECT public.call_appointment('e0000000-0000-4000-8000-000000000002')$$, '42501', NULL,
                 'receptionist of a suspended organization: cannot call tokens');
SELECT tests.logout();
UPDATE public.organizations SET status = 'active'
WHERE id = (SELECT organization_id FROM public.service_centers WHERE id = '521f1349-05c4-4417-9fa5-5289963af7db');

-- ---------------------------------------------------------------------------
-- Doctor A: own queue only
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000004');
SELECT set_eq($$SELECT id::text FROM public.appointments$$,
              ARRAY['e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002'],
              'doctor A: only own appointments');
SELECT throws_ok($$SELECT public.complete_appointment('e0000000-0000-4000-8000-000000000004')$$, '42501', NULL,
                 'doctor A: cannot complete an org B appointment');
SELECT throws_ok($$SELECT public.get_doctor_today_appointments('d0000000-0000-4000-8000-00000000000b')$$, '42501', NULL,
                 'doctor A: cannot list org B doctor''s patients');
SELECT throws_ok($$INSERT INTO public.doctor_leaves (doctor_id, leave_date) VALUES ('d0000000-0000-4000-8000-00000000000b', CURRENT_DATE + 1)$$,
                 '42501', NULL, 'doctor A: cannot add leave for org B doctor');
SELECT lives_ok($$SELECT public.get_center_queue_snapshot('521f1349-05c4-4417-9fa5-5289963af7db', CURRENT_DATE)$$,
                'doctor A: can read own center queue snapshot');
SELECT throws_ok($$SELECT public.get_center_queue_snapshot('d2c1a3df-bb89-4fde-b73d-5bb9ec763481', CURRENT_DATE)$$, '42501', NULL,
                 'doctor A: cannot read org B center queue snapshot');
UPDATE public.doctor_schedules SET start_time = '01:00' WHERE doctor_id = 'd0000000-0000-4000-8000-00000000000b';
SELECT tests.logout();
SELECT is((SELECT min(start_time) FROM public.doctor_schedules WHERE doctor_id = 'd0000000-0000-4000-8000-00000000000b'), '00:00'::time,
          'doctor A: cannot edit org B doctor schedule');

-- Doctor whose membership is removed loses the doctor view, even though
-- doctors.profile_id still points at them.
DELETE FROM public.org_members WHERE user_id = 'a0000000-0000-4000-8000-000000000004';
SELECT tests.login('a0000000-0000-4000-8000-000000000004');
SELECT is_empty($$SELECT id FROM public.appointments$$, 'doctor without membership: no appointments');
SELECT throws_ok($$SELECT public.call_appointment('e0000000-0000-4000-8000-000000000002')$$, '42501', NULL,
                 'doctor without membership: cannot call tokens');
SELECT tests.logout();
INSERT INTO public.org_members (organization_id, user_id, role)
SELECT organization_id, 'a0000000-0000-4000-8000-000000000004', 'doctor'
FROM public.service_centers WHERE id = '521f1349-05c4-4417-9fa5-5289963af7db';

-- ---------------------------------------------------------------------------
-- Patients can't move their row into another clinic's queue
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000006');
SELECT throws_ok($$UPDATE public.appointments SET center_id = 'd2c1a3df-bb89-4fde-b73d-5bb9ec763481'
                   WHERE id = 'e0000000-0000-4000-8000-000000000001'$$, '42501', NULL, 'patient: cannot change center_id');
SELECT throws_ok($$UPDATE public.appointments SET doctor_id = 'd0000000-0000-4000-8000-00000000000b'
                   WHERE id = 'e0000000-0000-4000-8000-000000000001'$$, '42501', NULL, 'patient: cannot change doctor_id');
SELECT throws_ok($$UPDATE public.appointments SET token_number = 1 WHERE id = 'e0000000-0000-4000-8000-000000000001'$$,
                 '42501', NULL, 'patient: cannot change token_number');
SELECT lives_ok($$UPDATE public.appointments SET status = 'cancelled', cancel_reason = 'test', cancelled_at = now()
                  WHERE id = 'e0000000-0000-4000-8000-000000000001'$$, 'patient: can still cancel own appointment directly');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- Staff B (org B): nothing of org A
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000003');
SELECT set_eq($$SELECT id::text FROM public.appointments$$,
              ARRAY['e0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000004'],
              'staff B: only org B appointments');
SELECT is_empty($$SELECT 1 FROM public.audit_logs a JOIN public.appointments ap ON ap.id = a.appointment_id
                  WHERE ap.center_id = '521f1349-05c4-4417-9fa5-5289963af7db'$$, 'staff B: no org A audit logs');
SELECT tests.logout();

SELECT * FROM finish();
ROLLBACK;
