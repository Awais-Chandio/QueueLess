-- Phase 2B.5: the QR page's doctor choice, "Reception doctor chunegi"
-- (unassigned tokens, assign, then the fee).
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
  'SELECT COALESCE(d.name, ''-'') || ''|'' || a.status || ''|'' || COALESCE(a.payment_status, ''-'') || ''|'' || COALESCE(a.fee_pkr::text, ''-'')
   FROM public.appointments a LEFT JOIN public.doctors d ON d.id = a.doctor_id WHERE a.public_code = tests.code(p_label)';
CREATE FUNCTION tests.center() RETURNS jsonb LANGUAGE sql STABLE AS
  $$SELECT public.get_public_center('liaquat-university-hospital')$$;
CREATE FUNCTION tests.pdoc(p_name text) RETURNS jsonb LANGUAGE sql STABLE AS
  $$SELECT d FROM jsonb_array_elements(tests.center()->'doctors') d WHERE d->>'name' = p_name$$;
CREATE FUNCTION tests.join(p_doctor uuid, p_name text, p_phone text) RETURNS text LANGUAGE sql AS
  $$SELECT public_code FROM public.issue_public_token(p_doctor, p_name, p_phone, 'qr', 'liaquat-university-hospital')$$;
CREATE FUNCTION tests.in_line(p_label text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM private.doctor_waiting_tokens(
    (SELECT doctor_id FROM public.appointments WHERE id = tests.id(p_label)), (now() AT TIME ZONE 'Asia/Karachi')::date) w
    WHERE w.appointment_id = tests.id(p_label))
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO anon, authenticated, service_role;

-- Seed: center A (owner A a..09, receptionist A a..02, Dr. A d..0a "General Physician" fee 1000,
-- schedules every day, account a..04), fee mode before, on the trial (fees on). Dr. A's queue starts empty.
UPDATE public.appointments SET appointment_date = appointment_date - 7 WHERE doctor_id = 'd0000000-0000-4000-8000-00000000000a';
INSERT INTO public.doctors (id, center_id, name, specialty, fee, is_on_break, created_at) VALUES
  ('d0000000-0000-4000-8000-0000000000c1', '521f1349-05c4-4417-9fa5-5289963af7db', 'Dr. Ayesha Khan', 'Paediatrician', 700, false, now() + interval '1 second'),
  ('d0000000-0000-4000-8000-0000000000c2', '521f1349-05c4-4417-9fa5-5289963af7db', 'Dr. Break', 'General Physician', 0, true, now() + interval '2 seconds');
-- Dr. Ayesha has a schedule, but not for today.
INSERT INTO public.doctor_schedules (doctor_id, day_of_week, start_time, end_time)
VALUES ('d0000000-0000-4000-8000-0000000000c1', (EXTRACT(DOW FROM (now() AT TIME ZONE 'Asia/Karachi'))::int + 1) % 7, '09:00', '17:00');

SELECT plan(40);

-- ---------------------------------------------------------------------------
-- The join page
-- ---------------------------------------------------------------------------
SELECT is(private.name_initials('Dr. Ayesha Khan'), 'AK', 'initials skip "Dr."');
SELECT is(private.name_initials('Prof Bilal'), 'B', 'one name, one letter');

SELECT tests.login_anon();
SELECT is((SELECT jsonb_agg(d->>'specialty') FROM jsonb_array_elements(tests.center()->'doctors') d),
          '["General Physician", "General Physician", "Paediatrician"]'::jsonb, 'doctors come grouped by specialty');
SELECT is(tests.pdoc('Dr. A')->>'initials', 'A', 'initials');
SELECT is(tests.pdoc('Dr. A')->>'fee', '1000', 'fee shown (the clinic takes fees)');
SELECT is(tests.pdoc('Dr. Break')->>'fee', NULL, 'no fee: none shown');
SELECT is((tests.pdoc('Dr. A')->>'available')::boolean, true, 'Dr. A: available');
SELECT is((tests.pdoc('Dr. Break')->>'available')::boolean, false, 'on break: greyed out');
SELECT is((tests.pdoc('Dr. Ayesha Khan')->>'in_today')::boolean, false, 'a schedule without today: not in today');
SELECT is((tests.pdoc('Dr. Ayesha Khan')->>'available')::boolean, false, '... greyed out');
SELECT is((tests.center()->>'reception_assigns')::boolean, false, '"Reception doctor chunegi" is off by default');
SELECT is((tests.center()->>'branding')::boolean, false, 'trial: no MediQ branding');
SELECT tests.logout();

INSERT INTO public.doctor_leaves (doctor_id, leave_date) VALUES ('d0000000-0000-4000-8000-00000000000a', (now() AT TIME ZONE 'Asia/Karachi')::date);
SELECT is((tests.pdoc('Dr. A')->>'available')::boolean, false, 'on leave: greyed out');
DELETE FROM public.doctor_leaves WHERE doctor_id = 'd0000000-0000-4000-8000-00000000000a';

-- ---------------------------------------------------------------------------
-- The setting
-- ---------------------------------------------------------------------------
SELECT tests.login_server();
SELECT throws_ok($$SELECT tests.join(NULL, 'Pata Nahi', '03004440001')$$, 'PT404', NULL, 'off: a doctor must be chosen');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT throws_ok($$SELECT public.set_center_join_settings('521f1349-05c4-4417-9fa5-5289963af7db', true)$$, '42501', NULL,
                 'receptionist: cannot change it');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000009');
SELECT lives_ok($$SELECT public.set_center_join_settings('521f1349-05c4-4417-9fa5-5289963af7db', true)$$, 'owner: switches it on');
SELECT is((SELECT c->>'reception_assigns' FROM jsonb_array_elements(public.get_org_settings(
            (SELECT organization_id FROM public.service_centers WHERE id = '521f1349-05c4-4417-9fa5-5289963af7db'))->'centers') c),
          'true', 'settings show it');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- "Pata nahi": an unassigned token
-- ---------------------------------------------------------------------------
SELECT tests.login_server();
INSERT INTO tests.codes VALUES ('u1', tests.join(NULL, 'Pata Nahi', '03004440001'));
INSERT INTO tests.codes VALUES ('u2', tests.join(NULL, 'Second Unsure', '03004440002'));
SELECT tests.logout();
SELECT is(tests.appt('u1'), '-|checked_in|-|-', 'unassigned: no doctor, in the clinic, no fee yet');

SELECT tests.login_anon();
SELECT is((SELECT status || '|' || COALESCE(doctor_name, '-') FROM public.get_token_status(tests.code('u1'))), 'unassigned|-',
          'token page: reception will choose');
SELECT is((tests.center()->>'unassigned_waiting')::int, 2, 'join page: two waiting for reception');
SELECT tests.logout();

SELECT tests.login_server();
SELECT throws_ok($$SELECT public.submit_payment_claim(tests.code('u1'), 'easypaisa', 'EP99887766')$$, 'PT409', NULL,
                 'unassigned tokens cannot pay online');
SELECT tests.logout();

SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT is((SELECT jsonb_agg(t->>'patient_name') FROM jsonb_array_elements(public.get_reception_queue('521f1349-05c4-4417-9fa5-5289963af7db')->'unassigned') t),
          '["Pata Nahi", "Second Unsure"]'::jsonb, 'reception: the "Unassigned" strip, in arrival order');
SELECT is((public.get_reception_queue('521f1349-05c4-4417-9fa5-5289963af7db')->'center'->>'reception_assigns')::boolean, true,
          'reception knows the setting');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- Assigning
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000004');
SELECT throws_ok(format($$SELECT public.assign_token_doctor(%L, 'd0000000-0000-4000-8000-00000000000a')$$, tests.id('u1')), '42501', NULL,
                 'a doctor-only login cannot assign');
SELECT tests.logout();

-- Dr. A already has a token today (number 1).
SELECT tests.login_server();
INSERT INTO tests.codes VALUES ('a1', tests.join('d0000000-0000-4000-8000-00000000000a', 'Direct One', '03004440003'));
SELECT tests.logout();

SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT throws_ok(format($$SELECT public.assign_token_doctor(%L, 'd0000000-0000-4000-8000-00000000000b')$$, tests.id('u1')), 'PT404', NULL,
                 'a doctor of another center: no');
SELECT is(public.assign_token_doctor(tests.id('u1'), 'd0000000-0000-4000-8000-00000000000a')->>'token_number', '2',
          'assigned: the doctor''s next number');
SELECT is(tests.appt('u1'), 'Dr. A|checked_in|awaiting|1000', 'fee before: the doctor''s fee, waiting for it at the desk');
SELECT ok(NOT tests.in_line('u1'), 'not in the line before the fee');
SELECT ok((SELECT a.assigned_at IS NOT NULL FROM public.appointments a WHERE a.id = tests.id('u1')), 'assigned_at recorded');
SELECT throws_ok(format($$SELECT public.assign_token_doctor(%L, 'd0000000-0000-4000-8000-0000000000c1')$$, tests.id('u1')), 'PT409', NULL,
                 'assigned once');
SELECT tests.logout();

SELECT tests.login_anon();
SELECT is((SELECT status || '|' || doctor_name FROM public.get_token_status(tests.code('u1'))), 'unpaid|Dr. A', 'token page: Dr. A, fee due');
SELECT tests.logout();

-- Never auto-expired: the desk has it.
UPDATE public.appointments SET created_at = now() - interval '3 hours' WHERE id = tests.id('u1');
SELECT private.expire_unpaid_tokens();
SELECT is(tests.appt('u1'), 'Dr. A|checked_in|awaiting|1000', 'assigned tokens are not auto-expired');

SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT is(public.record_payment(tests.id('u1'), 1000, 'cash')->>'payment_status', 'paid', 'reception takes the fee');
SELECT tests.logout();
SELECT is(tests.appt('u1'), 'Dr. A|checked_in|paid|1000', 'paid');
SELECT ok(tests.in_line('u1'), 'in the line now');
SELECT is((SELECT w.people_ahead FROM private.doctor_waiting_tokens('d0000000-0000-4000-8000-00000000000a', (now() AT TIME ZONE 'Asia/Karachi')::date) w
           WHERE w.appointment_id = tests.id('u1')), 0, 'it keeps its place: it arrived before token 1 paid');

-- Fee after: assigned straight into the line.
UPDATE public.center_payment_settings SET fee_mode = 'after' WHERE center_id = '521f1349-05c4-4417-9fa5-5289963af7db';
SELECT tests.login('a0000000-0000-4000-8000-000000000009');
SELECT is(public.assign_token_doctor(tests.id('u2'), 'd0000000-0000-4000-8000-0000000000c1')->>'payment_status', NULL,
          'owner assigns; fee after: nothing to wait for');
SELECT tests.logout();
SELECT is(tests.appt('u2'), 'Dr. Ayesha Khan|checked_in|-|700', 'in Dr. Ayesha''s line with her fee');
SELECT ok(tests.in_line('u2'), 'in the line');

-- Leave
INSERT INTO public.doctor_leaves (doctor_id, leave_date) VALUES ('d0000000-0000-4000-8000-0000000000c2', (now() AT TIME ZONE 'Asia/Karachi')::date);
SELECT tests.login_server();
INSERT INTO tests.codes VALUES ('u3', tests.join(NULL, 'Third Unsure', '03004440004'));
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT throws_ok(format($$SELECT public.assign_token_doctor(%L, 'd0000000-0000-4000-8000-0000000000c2')$$, tests.id('u3')), 'PT409', NULL,
                 'a doctor on leave: no');
SELECT tests.logout();

SELECT * FROM finish();
ROLLBACK;
