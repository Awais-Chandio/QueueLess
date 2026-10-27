-- Phase 1A.1: organizations (tenants). Run with: supabase test db
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

-- Seed: center A = 521f1349 (Liaquat), center B = d2c1a3df (Aga Khan), plus two
-- more public centers. admin a...01, staff A a...02, patient 1 a...06.

SELECT plan(16);

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
SELECT has_table('public', 'organizations', 'organizations table exists');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.organizations'::regclass), 'organizations: RLS on');
SELECT col_not_null('public', 'service_centers', 'organization_id', 'service_centers.organization_id is NOT NULL');

-- Every business table reaches organizations through foreign keys. The
-- exceptions are user-level (an account, not a clinic) or keyed loosely on
-- purpose; see tasks/phase-1a/1A.1-organizations.md.
SELECT is_empty($$
  WITH RECURSIVE fk AS (
    SELECT conrelid AS src, confrelid AS dst
    FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace
  ), reach (tbl) AS (
    SELECT 'public.organizations'::regclass::oid
    UNION
    SELECT fk.src FROM fk JOIN reach ON fk.dst = reach.tbl
  )
  SELECT c.relname::text FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
    AND c.oid NOT IN (SELECT tbl FROM reach)
    AND c.relname NOT IN ('profiles', 'device_tokens', 'notifications', 'doctor_queue_settings', 'plans', 'platform_settings')
$$, 'every business table resolves to an organization through foreign keys');

-- ---------------------------------------------------------------------------
-- Backfill / default organizations
-- ---------------------------------------------------------------------------
SELECT is((SELECT count(DISTINCT organization_id) FROM public.service_centers),
          (SELECT count(*) FROM public.service_centers), 'each existing center has its own organization');
SELECT ok((SELECT bool_and(o.is_legacy AND o.name = c.name AND o.status = 'active' AND o.timezone = 'Asia/Karachi')
           FROM public.service_centers c JOIN public.organizations o ON o.id = c.organization_id),
          'default organizations: legacy, named after the center, active, Asia/Karachi');
SELECT ok((SELECT bool_and(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$') FROM public.organizations), 'slugs are well-formed');

INSERT INTO public.service_centers (id, name, city, address)
VALUES ('c0000000-0000-4000-8000-0000000000aa', 'New Clinic -- Phase 1A!', 'Hyderabad', 'Somewhere');
SELECT is((SELECT o.slug ~ '^new-clinic-phase-1a-[0-9a-f]{8}$' AND o.is_legacy
           FROM public.service_centers c JOIN public.organizations o ON o.id = c.organization_id
           WHERE c.id = 'c0000000-0000-4000-8000-0000000000aa'),
          true, 'a center inserted without organization gets its own default organization');

SELECT throws_ok($$INSERT INTO public.organizations (name, slug, timezone) VALUES ('X', 'x', 'Mars/Olympus')$$,
                 '22023', NULL, 'unknown time zone rejected');

SELECT throws_ok($$DELETE FROM public.service_centers WHERE id = '521f1349-05c4-4417-9fa5-5289963af7db'$$,
                 '23503', NULL, 'a center with appointments cannot be deleted (no orphaned appointments)');

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
SELECT tests.login_anon();
SELECT throws_ok($$SELECT id FROM public.organizations$$, '42501', NULL, 'anon: organizations not readable');
RESET ROLE;

SELECT tests.login('a0000000-0000-4000-8000-000000000006');
SELECT is_empty($$SELECT id FROM public.organizations$$, 'patient: sees no organizations');
SELECT throws_ok($$INSERT INTO public.organizations (name, slug) VALUES ('Mine', 'mine')$$, '42501', NULL,
                 'patient: cannot create organizations');
RESET ROLE;

CREATE TABLE tests.org_count AS SELECT count(*) AS n FROM public.organizations;
GRANT SELECT ON tests.org_count TO authenticated;
SELECT tests.login('a0000000-0000-4000-8000-000000000001');
SELECT is((SELECT count(*) FROM public.organizations), (SELECT n FROM tests.org_count),
          'platform admin: reads every organization');
RESET ROLE;

-- Moving a center between organizations: staff can't (RLS hides the row from
-- UPDATE), a platform admin can.
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
UPDATE public.service_centers
SET organization_id = (SELECT organization_id FROM public.service_centers WHERE id = 'd2c1a3df-bb89-4fde-b73d-5bb9ec763481')
WHERE id = '521f1349-05c4-4417-9fa5-5289963af7db';
RESET ROLE;
SELECT isnt((SELECT organization_id FROM public.service_centers WHERE id = '521f1349-05c4-4417-9fa5-5289963af7db'),
            (SELECT organization_id FROM public.service_centers WHERE id = 'd2c1a3df-bb89-4fde-b73d-5bb9ec763481'),
            'staff: cannot move a center to another organization');

SELECT tests.login('a0000000-0000-4000-8000-000000000001');
UPDATE public.service_centers
SET organization_id = (SELECT organization_id FROM public.service_centers WHERE id = 'd2c1a3df-bb89-4fde-b73d-5bb9ec763481')
WHERE id = 'c0000000-0000-4000-8000-0000000000aa';
RESET ROLE;
SELECT is((SELECT organization_id FROM public.service_centers WHERE id = 'c0000000-0000-4000-8000-0000000000aa'),
          (SELECT organization_id FROM public.service_centers WHERE id = 'd2c1a3df-bb89-4fde-b73d-5bb9ec763481'),
          'platform admin: can move a center to another organization');

SELECT * FROM finish();
ROLLBACK;
