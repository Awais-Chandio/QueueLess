-- Phase 2B.4: the owner who is also a doctor, doctor invites (email, link),
-- doctor-only isolation, one person a doctor in two clinics.
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
CREATE FUNCTION tests.logout() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true), set_config('role', 'postgres', true);
$$;
CREATE TABLE tests.out (label text PRIMARY KEY, v jsonb);
GRANT ALL ON tests.out TO anon, authenticated, service_role;
CREATE FUNCTION tests.v(p_label text) RETURNS jsonb LANGUAGE sql STABLE AS 'SELECT v FROM tests.out WHERE label = p_label';
CREATE FUNCTION tests.org() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT (tests.v('org')->>'organization_id')::uuid$$;
CREATE FUNCTION tests.center() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT (tests.v('org')->>'center_id')::uuid$$;
CREATE FUNCTION tests.me_doc() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT (tests.v('org')->>'owner_doctor_id')::uuid$$;
CREATE FUNCTION tests.doc(p_name text) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS
  $$SELECT id FROM public.doctors WHERE name = p_name$$;
CREATE FUNCTION tests.profile_of(p_name text) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS
  $$SELECT profile_id FROM public.doctors WHERE name = p_name$$;
CREATE FUNCTION tests.roles(p_user uuid, p_org uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS
  $$SELECT string_agg(role, ',' ORDER BY role) FROM public.org_members WHERE user_id = p_user AND organization_id = p_org$$;
CREATE FUNCTION tests.token(p_label text) RETURNS uuid LANGUAGE sql STABLE AS $$SELECT (tests.v(p_label)->>'appointment_id')::uuid$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO anon, authenticated, service_role;

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000031', 'authenticated', 'authenticated', 'dr.owner@example.com', '', now(), '{}', '{"full_name":"Dr. Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000032', 'authenticated', 'authenticated', 'dr.email@example.com', '', now(), '{}', '{"full_name":"Dr. Email"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000033', 'authenticated', 'authenticated', 'dr.phone@example.com', '', now(), '{}', '{"full_name":"Dr. Phone"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000034', 'authenticated', 'authenticated', 'someone@example.com', '', now(), '{}', '{"full_name":"Someone"}', now(), now());

SELECT plan(52);

-- ---------------------------------------------------------------------------
-- Onboarding: "Kya aap khud doctor hain?" -> yes
-- ---------------------------------------------------------------------------
SELECT tests.login('b0000000-0000-4000-8000-000000000031');
INSERT INTO tests.out SELECT 'org', public.create_organization('Owner Clinic', NULL, 'Lahore', 'Gulberg',
  '[{"name":"Dr. Email","specialty":"ENT","fee":"900"}]', 'Asia/Karachi', NULL, NULL,
  '{"specialty":"Child Specialist","fee":"800","room":"1"}');
SELECT ok(tests.me_doc() IS NOT NULL, 'owner doctor created');
SELECT is((SELECT row(name, specialty, fee::int, room, profile_id)::text FROM public.doctors WHERE id = tests.me_doc()),
          row('Dr. Owner', 'Child Specialist', 800, '1', 'b0000000-0000-4000-8000-000000000031'::uuid)::text,
          'their own doctors row: name from the profile, specialty, fee, room, linked to their login');
SELECT is(tests.roles('b0000000-0000-4000-8000-000000000031', tests.org()), 'doctor,owner', 'the same login is owner + doctor');
SELECT is((SELECT id FROM public.doctors WHERE center_id = tests.center() ORDER BY created_at, id LIMIT 1), tests.me_doc(),
          'the owner doctor is the first doctor (the one a 1-doctor plan keeps)');
SELECT is(public.get_my_workspaces()->0->'doctors'->0->>'id', tests.me_doc()::text, 'workspaces: their doctor row (the "Meri queue" switch)');
SELECT lives_ok(format($$SELECT public.get_doctor_queue(%L)$$, tests.me_doc()), 'owner-doctor: their own queue');
SELECT lives_ok(format($$SELECT public.get_reception_queue(%L)$$, tests.center()), 'owner-doctor: the clinic''s reception');
SELECT lives_ok(format($$SELECT public.get_payment_report(%L, NULL, NULL)$$, tests.center()), 'owner-doctor: the clinic''s records');
SELECT throws_ok(format($$SELECT public.add_self_as_doctor(%L, 'GP')$$, tests.center()), 'PT409', NULL, 'already a doctor here');
SELECT lives_ok(format($$SELECT public.upsert_doctor(%L, NULL, 'Dr. Phone', 'Skin', NULL, NULL, true, 700)$$, tests.center()),
                'a third doctor (trial: 3)');
SELECT throws_ok(format($$SELECT public.upsert_doctor(%L, NULL, 'Dr. Four', NULL, NULL)$$, tests.center()), 'PT402', NULL,
                 'the owner doctor counts toward the plan''s doctors');
SELECT tests.logout();

-- Without the owner-doctor answer: an owner only.
SELECT tests.login('b0000000-0000-4000-8000-000000000034');
INSERT INTO tests.out SELECT 'org2', public.create_organization('Plain Clinic', NULL, 'Lahore', 'DHA', '[{"name":"Dr. Plain"}]');
SELECT is(tests.roles('b0000000-0000-4000-8000-000000000034', (tests.v('org2')->>'organization_id')::uuid), 'owner', 'no: an owner only');
INSERT INTO tests.out SELECT 'self', to_jsonb(public.add_self_as_doctor((tests.v('org2')->>'center_id')::uuid, 'GP', NULL, 500));
SELECT is((SELECT profile_id FROM public.doctors WHERE id = (tests.v('self') #>> '{}')::uuid), 'b0000000-0000-4000-8000-000000000034'::uuid,
          'later: "I am a doctor here too"');
SELECT is(tests.roles('b0000000-0000-4000-8000-000000000034', (tests.v('org2')->>'organization_id')::uuid), 'doctor,owner', '... then owner + doctor');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- Doctor invites
-- ---------------------------------------------------------------------------
SELECT tests.login('b0000000-0000-4000-8000-000000000031');
INSERT INTO tests.out SELECT 'inv_email', public.invite_doctor(tests.doc('Dr. Email'), 'Dr.Email@Example.com');
INSERT INTO tests.out SELECT 'inv_phone', public.invite_doctor(tests.doc('Dr. Phone'), NULL, '0300 1234567');
SELECT ok(tests.v('inv_phone')->>'token' ~ '^[0-9a-f]{48}$', 'invite: a one-time link token');
SELECT is(tests.v('inv_email')->>'email', 'dr.email@example.com', 'email invite (lower case)');
SELECT throws_ok(format($$SELECT public.invite_doctor(%L, 'a@b.co', '03001234567')$$, tests.doc('Dr. Email')), '22023', NULL,
                 'email or phone, not both');
SELECT throws_ok(format($$SELECT public.invite_doctor(%L, 'a@b.co')$$, tests.me_doc()), 'PT409', NULL, 'a doctor with a login needs no invite');
SELECT is((SELECT d->'invite'->>'phone' FROM jsonb_array_elements(public.get_org_settings(tests.org())->'doctors') d WHERE d->>'name' = 'Dr. Phone'),
          '03001234567', 'settings: the pending invite');
SELECT throws_ok($$SELECT token_hash FROM public.doctor_invites$$, '42501', NULL, 'owner: link hashes are not readable');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000009');
SELECT throws_ok(format($$SELECT public.invite_doctor(%L, 'x@y.co')$$, tests.doc('Dr. Phone')), '42501', NULL, 'another clinic''s owner: no');
SELECT tests.logout();

-- Email: accepted at sign-in.
SELECT tests.login('b0000000-0000-4000-8000-000000000032');
SELECT is(public.accept_invites(), 1, 'doctor (email): accepted at sign-in');
SELECT tests.logout();
SELECT is(tests.profile_of('Dr. Email'), 'b0000000-0000-4000-8000-000000000032'::uuid, 'Dr. Email is linked');
SELECT is(tests.roles('b0000000-0000-4000-8000-000000000032', tests.org()), 'doctor', 'a doctor-only login');

-- Link: single use.
SELECT tests.login('b0000000-0000-4000-8000-000000000034');
SELECT throws_ok($$SELECT public.accept_doctor_invite(repeat('ab', 24))$$, 'PT404', NULL, 'a wrong link');
SELECT tests.logout();
SELECT tests.login('b0000000-0000-4000-8000-000000000033');
SELECT is(public.accept_doctor_invite(tests.v('inv_phone')->>'token')->>'doctor_id', tests.doc('Dr. Phone')::text, 'doctor (phone): link accepted');
SELECT lives_ok(format($$SELECT public.accept_doctor_invite(%L)$$, tests.v('inv_phone')->>'token'), 'opening it again is fine');
SELECT tests.logout();
SELECT tests.login('b0000000-0000-4000-8000-000000000034');
SELECT throws_ok(format($$SELECT public.accept_doctor_invite(%L)$$, tests.v('inv_phone')->>'token'), 'PT409', NULL, 'someone else: already used');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- A day at the clinic: one paid token each for Dr. Owner and Dr. Email
-- ---------------------------------------------------------------------------
SELECT tests.login('b0000000-0000-4000-8000-000000000031');
INSERT INTO tests.out SELECT 'tok_owner', to_jsonb(t) FROM public.issue_walk_in(tests.me_doc(), 'Child Patient', '03005550001', true, 800, 'cash') t;
INSERT INTO tests.out SELECT 'tok_email', to_jsonb(t) FROM public.issue_walk_in(tests.doc('Dr. Email'), 'Ear Patient', '03005550002', true, 900, 'cash') t;
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- A doctor-only login sees their own queue, patients and income only
-- ---------------------------------------------------------------------------
SELECT tests.login('b0000000-0000-4000-8000-000000000032');
SELECT throws_ok(format($$SELECT public.get_reception_queue(%L)$$, tests.center()), '42501', NULL, 'doctor-only: no clinic queue');
SELECT throws_ok(format($$SELECT public.get_payment_report(%L, NULL, NULL)$$, tests.center()), '42501', NULL, 'doctor-only: no clinic Hisaab');
SELECT throws_ok(format($$SELECT public.get_org_settings(%L)$$, tests.org()), '42501', NULL, 'doctor-only: no settings');
SELECT throws_ok(format($$SELECT public.get_plan_page(%L)$$, tests.org()), '42501', NULL, 'doctor-only: no plan page');
SELECT lives_ok(format($$SELECT public.get_plan_status(%L)$$, tests.org()), 'doctor-only: the plan banner');
SELECT is((SELECT count(*)::int FROM public.visit_payments), 1, 'doctor-only: only their own patients'' payments');
SELECT is((SELECT jsonb_agg(p.name) FROM public.patients p WHERE p.organization_id = tests.org()), '["Ear Patient"]'::jsonb,
          'doctor-only: only their own patients');
SELECT is((SELECT count(*)::int FROM public.appointments WHERE center_id = tests.center()), 1, 'doctor-only: only their own tokens');
SELECT is(jsonb_array_length(public.get_doctor_queue(tests.doc('Dr. Email'))->'tokens'), 1, 'doctor-only: their queue');
SELECT throws_ok(format($$SELECT public.get_doctor_queue(%L)$$, tests.me_doc()), '42501', NULL, 'doctor-only: not the owner''s queue');
SELECT is((SELECT total_fee::int FROM public.get_doctor_income_summary(tests.doc('Dr. Email'))), 900, 'doctor-only: their income');
SELECT throws_ok(format($$SELECT * FROM public.get_doctor_income_summary(%L)$$, tests.me_doc()), '42501', NULL, 'doctor-only: not the owner''s income');
SELECT throws_ok(format($$SELECT public.call_next(%L)$$, tests.me_doc()), '42501', NULL, 'doctor-only: can''t call the owner''s next');
SELECT throws_ok(format($$SELECT public.record_payment(%L, 900, 'cash')$$, tests.token('tok_email')), '42501', NULL,
                 'doctor-only: takes no payments');
SELECT is(public.call_next(tests.doc('Dr. Email'))::text, (SELECT row(tests.token('tok_email'), 1, 'Ear Patient')::text), 'doctor-only: calls their own next');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- One person, a doctor in two clinics
-- ---------------------------------------------------------------------------
INSERT INTO public.doctors (id, center_id, name, specialty) VALUES
  ('d0000000-0000-4000-8000-0000000000e1', '521f1349-05c4-4417-9fa5-5289963af7db', 'Dr. Email (evening)', 'ENT');
SELECT tests.login('a0000000-0000-4000-8000-000000000009');
SELECT lives_ok($$SELECT public.invite_doctor('d0000000-0000-4000-8000-0000000000e1', 'dr.email@example.com')$$, 'owner A invites the same doctor');
SELECT tests.logout();
SELECT tests.login('b0000000-0000-4000-8000-000000000032');
SELECT is(public.accept_invites(), 1, 'accepted at the next sign-in');
SELECT is((SELECT count(*)::int FROM jsonb_array_elements(public.get_my_workspaces()) w WHERE jsonb_array_length(w->'doctors') = 1), 2,
          'two clinics, a doctor row in each');
SELECT lives_ok($$SELECT public.get_doctor_queue('d0000000-0000-4000-8000-0000000000e1')$$, 'their queue at clinic A');
SELECT throws_ok($$SELECT public.get_reception_queue('521f1349-05c4-4417-9fa5-5289963af7db')$$, '42501', NULL, 'still no clinic queue at A');
SELECT throws_ok($$SELECT public.get_doctor_queue('d0000000-0000-4000-8000-00000000000a')$$, '42501', NULL, 'not Dr. A''s queue at A');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- Unlinking; profile_id only through the invite functions
-- ---------------------------------------------------------------------------
SELECT tests.login('b0000000-0000-4000-8000-000000000031');
UPDATE public.doctors SET profile_id = 'b0000000-0000-4000-8000-000000000034' WHERE id = tests.doc('Dr. Phone');
SELECT is(tests.profile_of('Dr. Phone'), 'b0000000-0000-4000-8000-000000000033'::uuid, 'the owner can''t relink a doctor by hand');
SELECT public.unlink_doctor_account(tests.doc('Dr. Phone'));
SELECT tests.logout();
SELECT is(tests.profile_of('Dr. Phone'), NULL, 'unlinked: the record stays, the login goes');
SELECT is(tests.roles('b0000000-0000-4000-8000-000000000033', tests.org()), NULL, '... and with it the doctor role');

SELECT * FROM finish();
ROLLBACK;
