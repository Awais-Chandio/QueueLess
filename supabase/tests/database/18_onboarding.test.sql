-- Phase 1B.4: onboarding (create_organization), invites, doctors, center, settings.
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
CREATE TABLE tests.out (label text PRIMARY KEY, v jsonb);
GRANT ALL ON tests.out TO anon, authenticated;
CREATE FUNCTION tests.v(p_label text) RETURNS jsonb LANGUAGE sql STABLE AS 'SELECT v FROM tests.out WHERE label = p_label';
CREATE FUNCTION tests.org() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT (tests.v('org')->>'organization_id')::uuid$$;
CREATE FUNCTION tests.center() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT (tests.v('org')->>'center_id')::uuid$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO anon, authenticated;

-- New accounts: an owner, an invited receptionist, someone with an unconfirmed email.
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'new.owner@example.com', '', now(), '{}', '{"full_name":"New Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'rec@example.com', '', now(), '{}', '{"full_name":"Rec One"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'unconfirmed@example.com', '', NULL, '{}', '{}', now(), now());

SELECT plan(34);

-- ---------------------------------------------------------------------------
-- create_organization
-- ---------------------------------------------------------------------------
SELECT tests.login_anon();
SELECT throws_ok($$SELECT public.create_organization('X', 'X', 'X', 'X')$$, '42501', NULL, 'anon: cannot create an organization');
SELECT tests.logout();

SELECT tests.login('b0000000-0000-4000-8000-000000000001');
SELECT throws_ok($$SELECT public.create_organization('City Clinic', NULL, '', 'Main Road')$$, '22023', NULL, 'city is required');
SELECT throws_ok($$SELECT public.create_organization('City Clinic', NULL, 'Hyderabad', 'Main Road',
                     '[{"name":"Dr. One"},{"name":"Dr. Two"},{"name":"Dr. Three"},{"name":"Dr. Four"}]')$$, 'PT402', NULL,
                 'trial (3 doctors): four doctors refused (and nothing created)');
SELECT is((SELECT count(*)::int FROM public.org_members WHERE user_id = 'b0000000-0000-4000-8000-000000000001'), 0,
          'a refused onboarding leaves nothing behind');
INSERT INTO tests.out SELECT 'org', public.create_organization('  City   Clinic ', NULL, 'Hyderabad', 'Main Road, Qasimabad',
  '[{"name":"Dr. Sana","specialty":"Family Medicine","room":"Room 1","average_minutes":"8"}]', 'Asia/Karachi', '09:00', '17:00');
SELECT ok(tests.org() IS NOT NULL AND tests.center() IS NOT NULL, 'owner: organization and center created');
SELECT is(tests.v('org')->>'center_slug', 'city-clinic', 'center slug from the name');
SELECT is(public.get_my_workspaces()->0->'roles', '["owner"]'::jsonb, 'creator is the owner');
SELECT is((SELECT name FROM public.organizations WHERE id = tests.org()), 'City Clinic', 'name tidied');
SELECT tests.logout();

SELECT is((SELECT row(o.is_legacy, e.plan_id, m.balance)::text FROM public.organizations o
           JOIN public.org_entitlements e ON e.organization_id = o.id JOIN public.message_credits m ON m.organization_id = o.id
           WHERE o.id = tests.org()), row(false, 'trial', 0)::text, 'new organization: not legacy, trial plan (2B), credit row');
SELECT is((SELECT row(c.open_time, c.close_time, c.city)::text FROM public.service_centers c WHERE c.id = tests.center()),
          row('09:00'::time, '17:00'::time, 'Hyderabad')::text, 'center hours and city');
SELECT is((SELECT count(*)::int FROM public.services WHERE center_id = tests.center()), 1, 'a default service');
SELECT is((SELECT row(d.name, d.specialty, d.room, q.average_consultation_time)::text
           FROM public.doctors d JOIN public.doctor_queue_settings q ON q.doctor_id = d.id WHERE d.center_id = tests.center()),
          row('Dr. Sana', 'Family Medicine', 'Room 1', 8.00::numeric(10,2))::text, 'doctor with specialty, room and average time');
SELECT ok(EXISTS (SELECT 1 FROM public.doctor_services ds JOIN public.doctors d ON d.id = ds.doctor_id WHERE d.center_id = tests.center()),
          'doctor linked to the service');
SELECT ok(EXISTS (SELECT 1 FROM public.center_displays WHERE center_id = tests.center()), 'center has a display key');

-- ---------------------------------------------------------------------------
-- Doctors and center (owner only). On Basic (one doctor) from here.
-- ---------------------------------------------------------------------------
UPDATE public.org_subscriptions SET plan_id = 'basic', status = 'active' WHERE organization_id = tests.org() AND status <> 'cancelled';
SELECT tests.login('b0000000-0000-4000-8000-000000000001');
SELECT throws_ok(format($$SELECT public.upsert_doctor(%L, NULL, 'Dr. Extra', NULL, NULL)$$, tests.center()), 'PT402', NULL,
                 'Basic plan: a second active doctor is refused');
SELECT lives_ok(format($$SELECT public.upsert_doctor(%L, NULL, 'Dr. Standby', NULL, NULL, NULL, false)$$, tests.center()),
                'an inactive doctor can be added');
SELECT lives_ok(format($$SELECT public.upsert_doctor(%L, (SELECT id FROM public.doctors WHERE center_id = %L AND name = 'Dr. Sana'),
                         'Dr. Sana Khan', 'Family Medicine', 'Room 3', 12, true)$$, tests.center(), tests.center()),
                'owner edits a doctor');
SELECT is((SELECT name || '|' || room FROM public.doctors WHERE center_id = tests.center() AND is_active), 'Dr. Sana Khan|Room 3',
          'owner''s edit of name and room is kept (protect trigger lets owners edit their doctors)');
SELECT lives_ok(format($$SELECT public.update_center(%L, 'City Clinic Qasimabad', 'Hyderabad', 'Main Road', '08:00', '20:00')$$, tests.center()),
                'owner updates center details and hours');
SELECT tests.logout();

SELECT tests.login('a0000000-0000-4000-8000-000000000009');
SELECT throws_ok(format($$SELECT public.update_center(%L, 'Hijack', 'X', 'X', NULL, NULL)$$, tests.center()), '42501', NULL,
                 'another clinic''s owner: cannot edit this center');
SELECT throws_ok(format($$SELECT public.get_org_settings(%L)$$, tests.org()), '42501', NULL,
                 'another clinic''s owner: cannot read this clinic''s settings');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- Invites
-- ---------------------------------------------------------------------------
SELECT tests.login('b0000000-0000-4000-8000-000000000001');
SELECT throws_ok(format($$SELECT public.invite_staff(%L, 'not-an-email')$$, tests.center()), '22023', NULL, 'invalid email refused');
SELECT lives_ok(format($$SELECT public.invite_staff(%L, '  Rec@Example.com ')$$, tests.center()), 'owner invites a receptionist');
SELECT lives_ok(format($$SELECT public.invite_staff(%L, 'unconfirmed@example.com')$$, tests.center()), 'owner invites another address');
SELECT tests.logout();
SELECT is((SELECT email FROM public.org_invites WHERE organization_id = tests.org() ORDER BY email LIMIT 1), 'rec@example.com', 'email normalized');

SELECT tests.login('b0000000-0000-4000-8000-000000000003');
SELECT is(public.accept_invites(), 0, 'unconfirmed email: invite not accepted');
SELECT tests.logout();

SELECT tests.login('b0000000-0000-4000-8000-000000000002');
SELECT is(public.accept_invites(), 1, 'receptionist with the confirmed email accepts');
SELECT is(public.get_my_workspaces()->0->'centers'->0->>'id', tests.center()::text, 'receptionist now works at the center');
SELECT lives_ok(format($$SELECT * FROM public.issue_token((SELECT id FROM public.doctors WHERE center_id = %L AND is_active), 'Walk In', NULL, 'walk_in')$$, tests.center()),
                'receptionist issues a walk-in');
SELECT throws_ok(format($$SELECT public.invite_staff(%L, 'x@example.com')$$, tests.center()), '42501', NULL, 'receptionist: cannot invite');
SELECT throws_ok(format($$SELECT public.get_org_settings(%L)$$, tests.org()), '42501', NULL, 'receptionist: no settings');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- Settings and removing staff
-- ---------------------------------------------------------------------------
SELECT tests.login('b0000000-0000-4000-8000-000000000001');
SELECT is((SELECT jsonb_agg(m->>'email' ORDER BY m->>'email') FROM jsonb_array_elements(public.get_org_settings(tests.org())->'members') m),
          '["new.owner@example.com", "rec@example.com"]'::jsonb, 'settings: members with emails');
SELECT is(public.get_org_settings(tests.org())->'plan'->>'id', 'basic', 'settings: current plan');
SELECT public.remove_staff(tests.center(), 'b0000000-0000-4000-8000-000000000002');
SELECT tests.logout();

SELECT tests.login('b0000000-0000-4000-8000-000000000002');
SELECT throws_ok(format($$SELECT public.get_reception_queue(%L)$$, tests.center()), '42501', NULL, 'removed receptionist loses access');
SELECT tests.logout();

SELECT * FROM finish();
ROLLBACK;
