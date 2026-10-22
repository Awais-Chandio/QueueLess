-- Phase 1A.2: organization memberships. Run with: supabase test db
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

-- Organization ids of center A / center B, readable by the test roles.
CREATE TABLE tests.orgs AS
SELECT (SELECT organization_id FROM public.service_centers WHERE id = '521f1349-05c4-4417-9fa5-5289963af7db') AS a,
       (SELECT organization_id FROM public.service_centers WHERE id = 'd2c1a3df-bb89-4fde-b73d-5bb9ec763481') AS b;
GRANT SELECT ON tests.orgs TO anon, authenticated;
CREATE FUNCTION tests.org_a() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT a FROM tests.orgs';
CREATE FUNCTION tests.org_b() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT b FROM tests.orgs';
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO anon, authenticated;

-- Seed: admin a..01, staff A a..02, staff B a..03, doctor A a..04 (d..0a),
-- doctor B a..05 (d..0b), patient 1 a..06, owner A a..09.

SELECT plan(30);

-- ---------------------------------------------------------------------------
-- Backfill / sync from the seed
-- ---------------------------------------------------------------------------
SELECT set_eq($$SELECT organization_id, user_id::text, role FROM public.org_members$$,
  $$VALUES (tests.org_a(), 'a0000000-0000-4000-8000-000000000002', 'receptionist'),
           (tests.org_b(), 'a0000000-0000-4000-8000-000000000003', 'receptionist'),
           (tests.org_a(), 'a0000000-0000-4000-8000-000000000004', 'doctor'),
           (tests.org_b(), 'a0000000-0000-4000-8000-000000000005', 'doctor'),
           (tests.org_a(), 'a0000000-0000-4000-8000-000000000009', 'owner')$$,
  'memberships: one receptionist per staff_centers org, one doctor per doctor, the seeded owner');
SELECT is_empty($$SELECT 1 FROM public.org_members WHERE user_id = 'a0000000-0000-4000-8000-000000000001'$$,
                'platform admin (no center) gets no clinic membership');

-- ---------------------------------------------------------------------------
-- has_org_role
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT ok(private.has_org_role(tests.org_a(), ARRAY['receptionist']), 'staff A: receptionist of org A');
SELECT ok(NOT private.has_org_role(tests.org_b(), ARRAY['owner', 'receptionist', 'doctor']), 'staff A: no role in org B');
SELECT ok(NOT private.has_org_role(tests.org_a(), ARRAY['owner']), 'staff A: not owner of org A');
SELECT ok(NOT private.has_org_role(NULL, ARRAY['receptionist']), 'NULL organization: false');
RESET ROLE;

SELECT tests.login('a0000000-0000-4000-8000-000000000004');
SELECT ok(private.has_org_role(tests.org_a(), ARRAY['doctor']), 'doctor A: doctor of org A');
RESET ROLE;

SELECT tests.login('a0000000-0000-4000-8000-000000000009');
SELECT ok(private.has_org_role(tests.org_a(), ARRAY['owner']), 'owner A: owner of org A');
SELECT ok(NOT private.has_org_role(tests.org_b(), ARRAY['owner']), 'owner A: not owner of org B');
RESET ROLE;

SELECT tests.login('a0000000-0000-4000-8000-000000000001');
SELECT ok(public.is_admin() AND NOT private.has_org_role(tests.org_a(), ARRAY['owner', 'receptionist', 'doctor']),
          'platform admin: is_admin(), no clinic role');
RESET ROLE;

UPDATE public.organizations SET status = 'suspended' WHERE id = tests.org_a();
SELECT tests.login('a0000000-0000-4000-8000-000000000009');
SELECT ok(NOT private.has_org_role(tests.org_a(), ARRAY['owner']), 'suspended organization: roles stop working');
RESET ROLE;
UPDATE public.organizations SET status = 'active' WHERE id = tests.org_a();

-- ---------------------------------------------------------------------------
-- Visibility
-- ---------------------------------------------------------------------------
SELECT tests.login_anon();
SELECT throws_ok($$SELECT 1 FROM public.org_members$$, '42501', NULL, 'anon: org_members not readable');
RESET ROLE;

SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT set_eq($$SELECT user_id::text FROM public.org_members$$, ARRAY['a0000000-0000-4000-8000-000000000002'],
              'staff A: sees only own membership');
SELECT set_eq($$SELECT id FROM public.organizations$$, $$SELECT tests.org_a()$$, 'staff A: sees only org A');
SELECT throws_ok($$INSERT INTO public.org_members (organization_id, user_id, role)
                   VALUES (tests.org_a(), 'a0000000-0000-4000-8000-000000000002', 'owner')$$,
                 '42501', NULL, 'staff A: cannot make themselves owner');
RESET ROLE;

SELECT tests.login('a0000000-0000-4000-8000-000000000009');
SELECT set_eq($$SELECT user_id::text FROM public.org_members$$,
              ARRAY['a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000009'],
              'owner A: sees org A roster only');
SELECT throws_ok($$UPDATE public.org_members SET organization_id = tests.org_b()$$, '42501', NULL,
                 'owner A: cannot rewrite memberships');
RESET ROLE;

SELECT tests.login('a0000000-0000-4000-8000-000000000005');
SELECT set_eq($$SELECT id FROM public.organizations$$, $$SELECT tests.org_b()$$, 'doctor B: sees only org B');
RESET ROLE;

SELECT tests.login('a0000000-0000-4000-8000-000000000006');
SELECT is_empty($$SELECT 1 FROM public.org_members$$, 'patient: no memberships');
SELECT is_empty($$SELECT 1 FROM public.organizations$$, 'patient: no organizations');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Sync with the admin app's writes
-- ---------------------------------------------------------------------------
-- Run as the server (no JWT), like the admin app's privileged writes.
SELECT set_config('request.jwt.claims', '', true);
INSERT INTO public.staff_centers (profile_id, center_id)
VALUES ('a0000000-0000-4000-8000-000000000003', '521f1349-05c4-4417-9fa5-5289963af7db');
SELECT ok(EXISTS (SELECT 1 FROM public.org_members WHERE organization_id = tests.org_a()
                  AND user_id = 'a0000000-0000-4000-8000-000000000003' AND role = 'receptionist'),
          'staff_centers insert: staff B becomes receptionist of org A');
DELETE FROM public.staff_centers
WHERE profile_id = 'a0000000-0000-4000-8000-000000000003' AND center_id = '521f1349-05c4-4417-9fa5-5289963af7db';
SELECT ok(NOT EXISTS (SELECT 1 FROM public.org_members WHERE organization_id = tests.org_a()
                      AND user_id = 'a0000000-0000-4000-8000-000000000003'),
          'staff_centers delete: membership of org A removed');
SELECT ok(EXISTS (SELECT 1 FROM public.org_members WHERE organization_id = tests.org_b()
                  AND user_id = 'a0000000-0000-4000-8000-000000000003'),
          'staff_centers delete: membership of org B untouched');

INSERT INTO public.staff_centers (profile_id, center_id)
VALUES ('a0000000-0000-4000-8000-000000000006', '521f1349-05c4-4417-9fa5-5289963af7db');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.org_members WHERE user_id = 'a0000000-0000-4000-8000-000000000006'),
          'staff_centers row for a non-staff profile grants nothing');
DELETE FROM public.staff_centers WHERE profile_id = 'a0000000-0000-4000-8000-000000000006';

UPDATE public.profiles SET role = 'client' WHERE id = 'a0000000-0000-4000-8000-000000000002';
SELECT ok(NOT EXISTS (SELECT 1 FROM public.org_members WHERE user_id = 'a0000000-0000-4000-8000-000000000002'),
          'demoting staff to client removes receptionist memberships');
UPDATE public.profiles SET role = 'staff' WHERE id = 'a0000000-0000-4000-8000-000000000002';
SELECT ok(EXISTS (SELECT 1 FROM public.org_members WHERE user_id = 'a0000000-0000-4000-8000-000000000002'
                  AND organization_id = tests.org_a() AND role = 'receptionist'),
          'promoting back to staff restores them from staff_centers');

UPDATE public.doctors SET center_id = 'd2c1a3df-bb89-4fde-b73d-5bb9ec763481' WHERE id = 'd0000000-0000-4000-8000-00000000000a';
SELECT set_eq($$SELECT organization_id FROM public.org_members WHERE user_id = 'a0000000-0000-4000-8000-000000000004'$$,
              $$SELECT tests.org_b()$$, 'doctor moved to another center: membership follows');
DELETE FROM public.doctors WHERE id = 'd0000000-0000-4000-8000-00000000000b';
SELECT ok(NOT EXISTS (SELECT 1 FROM public.org_members WHERE user_id = 'a0000000-0000-4000-8000-000000000005'),
          'doctor deleted: membership removed');

INSERT INTO public.doctors (id, center_id, profile_id, name, specialty)
VALUES ('d0000000-0000-4000-8000-0000000000ff', '521f1349-05c4-4417-9fa5-5289963af7db',
        'a0000000-0000-4000-8000-000000000005', 'Dr. B again', 'GP');
SELECT ok(EXISTS (SELECT 1 FROM public.org_members WHERE user_id = 'a0000000-0000-4000-8000-000000000005'
                  AND organization_id = tests.org_a() AND role = 'doctor'),
          'doctor inserted: membership created');

DELETE FROM auth.users WHERE id = 'a0000000-0000-4000-8000-000000000009';
SELECT ok(NOT EXISTS (SELECT 1 FROM public.org_members WHERE user_id = 'a0000000-0000-4000-8000-000000000009'),
          'deleting the account deletes its memberships');

SELECT * FROM finish();
ROLLBACK;
