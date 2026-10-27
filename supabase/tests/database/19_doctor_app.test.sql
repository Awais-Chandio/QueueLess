-- Phase 1C: doctor app (running late, doctor queue, complete with notes for guests).
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
CREATE FUNCTION tests.login_anon() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '{"role":"anon"}', true), set_config('role', 'anon', true);
$$;
CREATE FUNCTION tests.logout() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true), set_config('role', 'postgres', true);
$$;
CREATE TABLE tests.codes (label text PRIMARY KEY, code text);
GRANT ALL ON tests.codes TO anon, authenticated;
CREATE FUNCTION tests.code(p_label text) RETURNS text LANGUAGE sql STABLE AS 'SELECT code FROM tests.codes WHERE label = p_label';
CREATE FUNCTION tests.id(p_label text) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS
  'SELECT a.id FROM public.appointments a WHERE a.public_code = tests.code(p_label)';
CREATE FUNCTION tests.status(p_label text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS
  'SELECT a.status FROM public.appointments a WHERE a.public_code = tests.code(p_label)';
CREATE FUNCTION tests.queue_doctor(p_queue jsonb) RETURNS jsonb LANGUAGE sql STABLE AS
  $$SELECT d FROM jsonb_array_elements(p_queue->'doctors') d WHERE d->>'id' = 'd0000000-0000-4000-8000-00000000000a'$$;
CREATE FUNCTION tests.display_key() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS
  $$SELECT display_key FROM public.center_displays WHERE center_id = '521f1349-05c4-4417-9fa5-5289963af7db'$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO anon, authenticated;

-- Seed: staff A a..02 / center A 521f.. / Dr. A d..0a (account a..04); staff B a..03; doctor B a..05;
-- patient a..06. Doctor A's queue starts empty today.
UPDATE public.appointments SET appointment_date = appointment_date - 7 WHERE doctor_id = 'd0000000-0000-4000-8000-00000000000a';

SELECT plan(40);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
SELECT ok(NOT has_function_privilege('anon', 'public.set_doctor_late(uuid,integer)', 'execute'), 'anon: no set_doctor_late');
SELECT ok(NOT has_function_privilege('anon', 'public.get_doctor_queue(uuid)', 'execute'), 'anon: no get_doctor_queue');
SELECT ok(NOT has_function_privilege('anon', 'public.complete_visit(uuid,text,text,date,jsonb)', 'execute'), 'anon: no complete_visit');
SELECT ok(has_function_privilege('anon', 'public.get_token_status(text)', 'execute'), 'anon still reads token status');

-- ---------------------------------------------------------------------------
-- Tokens: two guests and a walk-in without phone
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
INSERT INTO tests.codes SELECT 'g1', public_code FROM public.issue_token('d0000000-0000-4000-8000-00000000000a', 'Guest One', '03001112233', 'walk_in');
INSERT INTO tests.codes SELECT 'g2', public_code FROM public.issue_token('d0000000-0000-4000-8000-00000000000a', 'Guest Two', '03001112244', 'walk_in');
INSERT INTO tests.codes SELECT 'g3', public_code FROM public.issue_token('d0000000-0000-4000-8000-00000000000a', 'Guest Three', NULL, 'walk_in');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- Doctor queue
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000004');
SELECT is(jsonb_array_length(public.get_doctor_queue('d0000000-0000-4000-8000-00000000000a')->'tokens'), 3, 'doctor A: today''s three tokens');
SELECT is(public.get_doctor_queue('d0000000-0000-4000-8000-00000000000a')->'tokens'->0->>'patient_name', 'Guest One', 'guest names, in queue order');
SELECT is((public.get_doctor_queue('d0000000-0000-4000-8000-00000000000a')->'tokens'->0->>'is_guest')::boolean, true, 'guest flag');
SELECT ok(NOT (public.get_doctor_queue('d0000000-0000-4000-8000-00000000000a')->'tokens'->0 ? 'phone'), 'no phone numbers in the doctor queue');
SELECT is(public.get_doctor_queue('d0000000-0000-4000-8000-00000000000a')->'plan'->>'id', 'trial', 'plan comes with the queue (2B: seed orgs on the trial)');
SELECT throws_ok($$SELECT public.get_doctor_queue('d0000000-0000-4000-8000-00000000000b')$$, '42501', NULL, 'doctor A: not Dr. B''s queue');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT lives_ok($$SELECT public.get_doctor_queue('d0000000-0000-4000-8000-00000000000a')$$, 'receptionist A: their doctor''s queue');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000003');
SELECT throws_ok($$SELECT public.get_doctor_queue('d0000000-0000-4000-8000-00000000000a')$$, '42501', NULL, 'receptionist B: not Dr. A''s queue');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000006');
SELECT throws_ok($$SELECT public.get_doctor_queue('d0000000-0000-4000-8000-00000000000a')$$, '42501', NULL, 'patient: no doctor queue');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- Running late
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000004');
SELECT ok(public.set_doctor_late('d0000000-0000-4000-8000-00000000000a', 20) BETWEEN now() + interval '19 minutes' AND now() + interval '21 minutes',
          'doctor A: late by 20 minutes');
SELECT ok(public.get_doctor_queue('d0000000-0000-4000-8000-00000000000a')->'doctor'->>'late_until' IS NOT NULL, 'late shows in the doctor queue');
-- 2B: the reception queue is for the desk; receptionist A looks.
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT ok(tests.queue_doctor(public.get_reception_queue('521f1349-05c4-4417-9fa5-5289963af7db'))->>'late_until' IS NOT NULL, 'late shows at reception');
SELECT tests.login('a0000000-0000-4000-8000-000000000004');
SELECT throws_ok($$SELECT public.set_doctor_late('d0000000-0000-4000-8000-00000000000a', 241)$$, '22023', NULL, 'late: at most 240 minutes');
SELECT throws_ok($$SELECT public.set_doctor_late('d0000000-0000-4000-8000-00000000000a', -1)$$, '22023', NULL, 'late: not negative');
SELECT tests.logout();

SELECT tests.login_anon();
SELECT ok((SELECT doctor_late_until IS NOT NULL FROM public.get_token_status(tests.code('g2'))), 'token status: doctor running late');
SELECT ok((SELECT eta_minutes >= 20 + 10 FROM public.get_token_status(tests.code('g2'))), 'ETA includes the delay (1 ahead x 10 min + 20)');
SELECT is((SELECT doctor_on_break FROM public.get_token_status(tests.code('g2'))), false, 'token status: not on break');
SELECT ok((SELECT d->>'late_until' IS NOT NULL FROM jsonb_array_elements(public.get_display_snapshot(tests.display_key())->'doctors') d
           WHERE d->>'name' = 'Dr. A'), 'late shows on the TV');
SELECT ok((SELECT d->>'late_until' IS NOT NULL FROM jsonb_array_elements(public.get_public_center('liaquat-university-hospital')->'doctors') d
           WHERE d->>'id' = 'd0000000-0000-4000-8000-00000000000a'), 'late shows on the join page');
SELECT tests.logout();

SELECT tests.login('a0000000-0000-4000-8000-000000000003');
SELECT throws_ok($$SELECT public.set_doctor_late('d0000000-0000-4000-8000-00000000000a', 10)$$, '42501', NULL, 'receptionist B: not Dr. A');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000006');
SELECT throws_ok($$SELECT public.set_doctor_late('d0000000-0000-4000-8000-00000000000a', 10)$$, '42501', NULL, 'patient: cannot set late');
SELECT tests.logout();

-- call_next clears "late".
SELECT tests.login('a0000000-0000-4000-8000-000000000004');
SELECT is((SELECT patient_name FROM public.call_next('d0000000-0000-4000-8000-00000000000a')), 'Guest One', 'doctor calls the first guest');
SELECT is(public.get_doctor_queue('d0000000-0000-4000-8000-00000000000a')->'doctor'->>'late_until', NULL, 'call next clears late');

-- 0 clears too.
SELECT public.set_doctor_late('d0000000-0000-4000-8000-00000000000a', 5);
SELECT is(public.set_doctor_late('d0000000-0000-4000-8000-00000000000a', 0), NULL, 'late 0 clears');

-- ---------------------------------------------------------------------------
-- complete_visit
-- ---------------------------------------------------------------------------
SELECT throws_ok(format('SELECT public.complete_visit(%L)', tests.id('g2')), 'PT409', NULL, 'a waiting token can''t be completed');
SELECT is(public.complete_visit(tests.id('g1'), 'Viral fever', 'Rest and fluids', current_date + 7,
                                '[{"medicine_name": "Paracetamol", "dosage": "500mg", "frequency": "TDS", "duration": "3 days"}, {"medicine_name": " "}]'::jsonb)->>'status',
          'completed', 'doctor completes the guest''s visit with notes');
SELECT tests.logout();

SELECT is(tests.status('g1'), 'completed', 'token completed');
SELECT is((SELECT (patient_id IS NULL)::text || '|' || (patient_record_id = (SELECT patient_id FROM public.appointments WHERE id = tests.id('g1')))::text
           FROM public.visit_summaries WHERE appointment_id = tests.id('g1')), 'true|true', 'guest summary: no account, linked to the patient record');
SELECT is((SELECT count(*)::integer FROM public.prescription_items pi JOIN public.visit_summaries vs ON vs.id = pi.visit_summary_id
           WHERE vs.appointment_id = tests.id('g1')), 1, 'blank prescription lines are dropped');

SELECT tests.login('a0000000-0000-4000-8000-000000000004');
SELECT is((public.get_doctor_queue('d0000000-0000-4000-8000-00000000000a')->'tokens'
           -> (jsonb_array_length(public.get_doctor_queue('d0000000-0000-4000-8000-00000000000a')->'tokens') - 1)->>'has_summary')::boolean,
          true, 'completed token shows it has notes');
SELECT lives_ok(format($$SELECT public.save_visit_summary(%L, 'Viral fever', 'Edited', NULL, '[]'::jsonb)$$, tests.id('g1')),
                'save_visit_summary works for guests');
SELECT is((SELECT notes FROM public.visit_summaries WHERE appointment_id = tests.id('g1')), 'Edited', 'notes edited');
SELECT tests.logout();

SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT public.call_next('d0000000-0000-4000-8000-00000000000a');
SELECT throws_ok(format('SELECT public.complete_visit(%L)', tests.id('g2')), '42501', NULL, 'receptionist: no clinical notes');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000005');
SELECT throws_ok(format('SELECT public.complete_visit(%L)', tests.id('g2')), '42501', NULL, 'doctor B: not Dr. A''s patient');
SELECT tests.logout();

SELECT tests.login('a0000000-0000-4000-8000-000000000004');
SELECT is(public.complete_visit(tests.id('g2'))->>'summary_id', NULL, 'complete without notes writes no summary');
SELECT is((SELECT count(*)::integer FROM public.get_doctor_today_appointments('d0000000-0000-4000-8000-00000000000a')), 3,
          'doctor''s today list (clinic day)');
SELECT tests.logout();

SELECT * FROM finish();
ROLLBACK;
