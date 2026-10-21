-- Phase 1B.2: reception RPCs (workspaces, queue, call next, skip, no-show, recall, break).
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
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO anon, authenticated;

-- Seed: staff A a..02 / center A / Dr. A d..0a (account a..04); staff B a..03 / center B / Dr. B;
-- owner A a..09; patient a..06. Doctor A's queue starts empty today.
UPDATE public.appointments SET appointment_date = appointment_date - 7 WHERE doctor_id = 'd0000000-0000-4000-8000-00000000000a';

SELECT plan(41);

-- ---------------------------------------------------------------------------
-- Workspaces
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT is(jsonb_array_length(public.get_my_workspaces()), 1, 'receptionist A: one organization');
SELECT is(public.get_my_workspaces()->0->'roles', '["receptionist"]'::jsonb, 'receptionist A: role receptionist');
SELECT is(public.get_my_workspaces()->0->'centers'->0->>'id', '521f1349-05c4-4417-9fa5-5289963af7db', 'receptionist A: center A');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000009');
SELECT is(public.get_my_workspaces()->0->'roles', '["owner"]'::jsonb, 'owner A: role owner');
SELECT is(public.get_my_workspaces()->0->'centers'->0->>'slug', 'liaquat-university-hospital', 'owner A: all centers of the organization, with slug');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000006');
SELECT is(public.get_my_workspaces(), '[]'::jsonb, 'patient: no workspaces');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- Queue access
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
INSERT INTO tests.codes SELECT 'w1', public_code FROM public.issue_token('d0000000-0000-4000-8000-00000000000a', 'Walk One', '03001234567', 'walk_in');
INSERT INTO tests.codes SELECT 'w2', public_code FROM public.issue_token('d0000000-0000-4000-8000-00000000000a', 'Walk Two', NULL, 'walk_in');
INSERT INTO tests.codes SELECT 'w3', public_code FROM public.issue_token('d0000000-0000-4000-8000-00000000000a', 'Walk Three', NULL, 'walk_in');
SELECT is((SELECT jsonb_array_length(d->'tokens') FROM jsonb_array_elements(public.get_reception_queue('521f1349-05c4-4417-9fa5-5289963af7db')->'doctors') d
           WHERE d->>'id' = 'd0000000-0000-4000-8000-00000000000a'), 3, 'receptionist A: today''s three tokens for Dr. A');
SELECT is((SELECT d->'tokens'->0->>'patient_name' || '|' || (d->'tokens'->0->>'phone')
           FROM jsonb_array_elements(public.get_reception_queue('521f1349-05c4-4417-9fa5-5289963af7db')->'doctors') d
           WHERE d->>'id' = 'd0000000-0000-4000-8000-00000000000a'), 'Walk One|03001234567', 'staff see patient name and phone');
SELECT ok(public.get_reception_queue('521f1349-05c4-4417-9fa5-5289963af7db')->>'display_key' ~ '^[a-z0-9]{24}$', 'staff get the TV display key');
SELECT throws_ok($$SELECT public.get_reception_queue('d2c1a3df-bb89-4fde-b73d-5bb9ec763481')$$, '42501', NULL, 'receptionist A: not center B''s queue');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000004');
SELECT lives_ok($$SELECT public.get_reception_queue('521f1349-05c4-4417-9fa5-5289963af7db')$$, 'doctor A: their center''s queue');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000006');
SELECT throws_ok($$SELECT public.get_reception_queue('521f1349-05c4-4417-9fa5-5289963af7db')$$, '42501', NULL, 'patient: no queue');
SELECT tests.logout();
SELECT tests.login_anon();
SELECT throws_ok($$SELECT public.get_reception_queue('521f1349-05c4-4417-9fa5-5289963af7db')$$, '42501', NULL, 'anon: no queue');
SELECT throws_ok($$SELECT * FROM public.call_next('d0000000-0000-4000-8000-00000000000a')$$, '42501', NULL, 'anon: cannot call next');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- Call next
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT is((SELECT token_number FROM public.call_next('d0000000-0000-4000-8000-00000000000a')),
          (SELECT token_number FROM public.get_token_status(tests.code('w1'))), 'call next: first waiting token is called');
SELECT is(tests.status('w1'), 'called', 'w1 called');
SELECT is((SELECT patient_name FROM public.call_next('d0000000-0000-4000-8000-00000000000a')), 'Walk Two', 'call next again: returns the next patient');
SELECT is(tests.status('w1') || '|' || tests.status('w2'), 'completed|called', 'previous token completed, next called');
SELECT ok((SELECT duration_minutes >= 1 AND completed_at IS NOT NULL FROM public.appointments WHERE id = tests.id('w1')),
          'completed token gets completed_at and a duration');

-- Skip the called one: w3 is next, w2 goes behind.
SELECT public.skip_token(tests.id('w2'));
SELECT is(tests.status('w2'), 'checked_in', 'skip: called token back to waiting');
SELECT is((SELECT people_ahead FROM public.get_token_status(tests.code('w2'))), 1, 'skip: w3 is now ahead of w2');
SELECT is((SELECT patient_name FROM public.call_next('d0000000-0000-4000-8000-00000000000a')), 'Walk Three', 'after a skip, call next calls w3');
SELECT is(tests.status('w2'), 'checked_in', 'call next does not complete a skipped token');
SELECT is((SELECT patient_name FROM public.call_next('d0000000-0000-4000-8000-00000000000a')), 'Walk Two', 'then the skipped token');

-- Recall and no-show
SELECT lives_ok(format('SELECT public.recall_token(%L)', tests.id('w2')), 'recall a called token');
SELECT ok((SELECT called_at > now() FROM public.appointments WHERE id = tests.id('w2')), 'recall moves called_at forward (TV chimes again)');
SELECT throws_ok(format('SELECT public.recall_token(%L)', tests.id('w1')), 'PT409', NULL, 'recall: only a called token');
SELECT public.mark_no_show(tests.id('w2'));
SELECT is(tests.status('w2'), 'no_show', 'no-show marks the called token');
SELECT is_empty($$SELECT * FROM public.call_next('d0000000-0000-4000-8000-00000000000a')$$, 'nobody waiting: call next returns no row');
SELECT is(tests.status('w3'), 'completed', '... and still closes the token with the doctor');

INSERT INTO tests.codes SELECT 'w5', public_code FROM public.issue_token('d0000000-0000-4000-8000-00000000000a', 'Walk Five', NULL, 'walk_in');
SELECT throws_ok(format('SELECT public.mark_no_show(%L)', tests.id('w5')), 'PT409', NULL, 'no-show: not for a waiting token');
SELECT throws_ok(format('SELECT public.skip_token(%L)', tests.id('w1')), 'PT409', NULL, 'skip: not for a completed token');

-- Break
SELECT public.set_doctor_break('d0000000-0000-4000-8000-00000000000a', true);
SELECT is((SELECT (d->>'is_on_break')::boolean FROM jsonb_array_elements(public.get_reception_queue('521f1349-05c4-4417-9fa5-5289963af7db')->'doctors') d
           WHERE d->>'id' = 'd0000000-0000-4000-8000-00000000000a'), true, 'break shows on the queue');
SELECT throws_ok($$SELECT * FROM public.call_next('d0000000-0000-4000-8000-00000000000a')$$, 'PT409', NULL, 'call next refused during a break');
SELECT public.set_doctor_break('d0000000-0000-4000-8000-00000000000a', false);
SELECT is((SELECT patient_name FROM public.call_next('d0000000-0000-4000-8000-00000000000a')), 'Walk Five', 'after the break, call next works');
SELECT tests.logout();
SELECT is((SELECT is_on_break FROM public.doctors WHERE id = 'd0000000-0000-4000-8000-00000000000a')::text
          || '|' || (SELECT is_on_break FROM public.doctor_queue_settings WHERE doctor_id = 'd0000000-0000-4000-8000-00000000000a')::text,
          'false|false', 'break flag kept in doctors and doctor_queue_settings');

-- ---------------------------------------------------------------------------
-- Other clinics and patients can't act
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000003');
SELECT throws_ok($$SELECT * FROM public.call_next('d0000000-0000-4000-8000-00000000000a')$$, '42501', NULL, 'receptionist B: not Dr. A''s queue');
SELECT throws_ok(format('SELECT public.mark_no_show(%L)', tests.id('w5')), '42501', NULL, 'receptionist B: not A''s tokens');
SELECT throws_ok($$SELECT public.set_doctor_break('d0000000-0000-4000-8000-00000000000a', true)$$, '42501', NULL, 'receptionist B: not A''s doctor break');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000006');
SELECT throws_ok(format('SELECT public.skip_token(%L)', tests.id('w5')), '42501', NULL, 'patient: cannot skip');
SELECT tests.logout();

-- The doctor runs their own queue.
SELECT tests.login('a0000000-0000-4000-8000-000000000004');
SELECT lives_ok($$SELECT * FROM public.call_next('d0000000-0000-4000-8000-00000000000a')$$, 'doctor A: call next on their own queue');
SELECT tests.logout();

SELECT * FROM finish();
ROLLBACK;
