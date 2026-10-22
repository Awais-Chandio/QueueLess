-- Phase 1B.1: center slugs, rooms, public join through the server, skip order.
-- Run with: supabase test db. Uses the seed accounts (supabase/seed.sql). Rolled back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO anon, authenticated;
CREATE SCHEMA tests;
GRANT USAGE ON SCHEMA tests TO anon, authenticated, service_role;
CREATE FUNCTION tests.login(p_user uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true),
         set_config('role', 'authenticated', true);
$$;
CREATE FUNCTION tests.login_anon() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '{"role":"anon"}', true), set_config('role', 'anon', true);
$$;
CREATE FUNCTION tests.login_join_server() RETURNS void LANGUAGE sql AS $$
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
CREATE FUNCTION tests.ahead(p_label text) RETURNS integer LANGUAGE sql STABLE AS
  'SELECT people_ahead FROM public.get_token_status(tests.code(p_label))';
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO anon, authenticated, service_role;

-- Doctor A's queue starts empty today (seed appointments moved to last week).
UPDATE public.appointments SET appointment_date = appointment_date - 7 WHERE doctor_id = 'd0000000-0000-4000-8000-00000000000a';
-- A second, later doctor at center A: on the Free plan only Dr. A takes tokens.
INSERT INTO public.doctors (id, center_id, name, specialty, created_at)
VALUES ('d0000000-0000-4000-8000-0000000000a2', '521f1349-05c4-4417-9fa5-5289963af7db', 'Dr. Later', 'GP', now() + interval '1 second');

SELECT plan(27);

-- ---------------------------------------------------------------------------
-- Slugs and rooms
-- ---------------------------------------------------------------------------
SELECT col_not_null('public', 'service_centers', 'slug', 'service_centers.slug is NOT NULL');
SELECT ok(EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'service_centers_slug_key' AND indexdef LIKE 'CREATE UNIQUE%'),
          'center slug is unique');
SELECT is((SELECT slug FROM public.service_centers WHERE id = '521f1349-05c4-4417-9fa5-5289963af7db'), 'liaquat-university-hospital',
          'existing centers got a slug from their name');
INSERT INTO public.service_centers (id, name, city, address) VALUES
  ('c0000000-0000-4000-8000-000000000001', 'Liaquat University Hospital', 'Hyderabad', 'Somewhere'),
  ('c0000000-0000-4000-8000-000000000002', 'Liaquat University Hospital', 'Hyderabad', 'Elsewhere');
SELECT is((SELECT array_agg(slug ORDER BY id) FROM public.service_centers WHERE id IN ('c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002')),
          ARRAY['liaquat-university-hospital-2', 'liaquat-university-hospital-3'], 'new centers with a taken name get -2, -3');
SELECT has_column('public', 'doctors', 'room', 'doctors.room exists');
SELECT throws_ok($$UPDATE public.doctors SET room = repeat('x', 31) WHERE id = 'd0000000-0000-4000-8000-00000000000a'$$, '23514', NULL,
                 'room is at most 30 characters');
UPDATE public.doctors SET room = 'Room 2' WHERE id = 'd0000000-0000-4000-8000-00000000000a';

-- ---------------------------------------------------------------------------
-- get_public_center (anon)
-- ---------------------------------------------------------------------------
SELECT tests.login_anon();
SELECT is((SELECT public.get_public_center('liaquat-university-hospital')->>'name'), 'Liaquat University Hospital', 'anon: center by slug');
SELECT is((SELECT (public.get_public_center('Liaquat-University-Hospital ')->>'qr_enabled')::boolean), true, 'slug is case-insensitive; QR on (Free has qr_join)');
SELECT is((SELECT jsonb_agg(d->>'name') FROM jsonb_array_elements(public.get_public_center('liaquat-university-hospital')->'doctors') d),
          '["Dr. A"]'::jsonb, 'only doctors that take tokens on the plan are listed (Free: the first one)');
SELECT is((SELECT d->>'room' FROM jsonb_array_elements(public.get_public_center('liaquat-university-hospital')->'doctors') d), 'Room 2',
          'doctor room is shown');
SELECT is(public.get_public_center('no-such-clinic'), NULL, 'unknown slug: NULL');
SELECT is(public.get_public_center('''; DROP TABLE x; --'), NULL, 'malformed slug: NULL');
SELECT is((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(
             (SELECT d FROM jsonb_array_elements(public.get_public_center('liaquat-university-hospital')->'doctors') d LIMIT 1)) k),
          ARRAY['id', 'is_on_break', 'late_until', 'name', 'on_leave', 'room', 'specialty', 'waiting'],
          'doctor entries carry only display fields');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- issue_public_token: center slug must match
-- ---------------------------------------------------------------------------
SELECT tests.login_join_server();
SELECT throws_ok($$SELECT * FROM public.issue_public_token('d0000000-0000-4000-8000-00000000000a', 'Guest', '+923001110000', 'qr', 'aga-khan-maternal-and-child-care-centre')$$,
                 'PT404', NULL, 'a doctor from another clinic is refused on this clinic''s page');
INSERT INTO tests.codes SELECT 'g1', public_code FROM public.issue_public_token('d0000000-0000-4000-8000-00000000000a', 'Guest One', '+923001110001', 'qr', 'liaquat-university-hospital');
SELECT ok(tests.code('g1') IS NOT NULL, 'join with the matching slug works');
SELECT throws_ok($$SELECT * FROM public.issue_public_token('d0000000-0000-4000-8000-00000000000a', 'X', '+923001110002', 'walk_in')$$,
                 '42501', NULL, 'public join: walk-in source refused');
SELECT throws_ok($$SELECT * FROM public.issue_public_token('d0000000-0000-4000-8000-0000000000a2', 'X', '+923001110003', 'qr')$$,
                 'PT402', NULL, 'public join: doctor beyond the plan''s doctor limit refused');
SELECT tests.logout();
SELECT is((SELECT (public.get_public_center('liaquat-university-hospital')->'doctors'->0->>'waiting')::int), 1,
          'waiting count follows joins');

-- ---------------------------------------------------------------------------
-- Skip order
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
INSERT INTO tests.codes SELECT 'w2', public_code FROM public.issue_token('d0000000-0000-4000-8000-00000000000a', 'Walk Two', NULL, 'walk_in');
INSERT INTO tests.codes SELECT 'w3', public_code FROM public.issue_token('d0000000-0000-4000-8000-00000000000a', 'Walk Three', NULL, 'walk_in');
SELECT is(tests.ahead('w3'), 2, 'before the skip: two ahead of w3');
SELECT public.skip_token(tests.id('g1'));
SELECT is(tests.ahead('w3'), 1, 'after skipping g1: one ahead of w3');
SELECT is(tests.ahead('g1'), 2, 'the skipped token goes behind the tokens that joined before the skip');
INSERT INTO tests.codes SELECT 'w4', public_code FROM public.issue_token('d0000000-0000-4000-8000-00000000000a', 'Walk Four', NULL, 'walk_in');
SELECT is(tests.ahead('w4'), 2, 'a token issued in the same transaction (created before the skip time) stays ahead of the skipped one');

-- called -> checked_in only as a skip
SELECT public.call_appointment(tests.id('w2'));
SELECT throws_ok(format($$UPDATE public.appointments SET status = 'checked_in' WHERE id = %L$$, tests.id('w2')), 'P0001', NULL,
                 'called -> checked_in without a skip is still refused');
SELECT lives_ok(format($$SELECT public.skip_token(%L)$$, tests.id('w2')), 'called -> waiting through skip_token');
SELECT is((SELECT status FROM public.get_token_status(tests.code('w2'))), 'waiting', 'skipped token shows waiting again');
SELECT tests.logout();

-- current_token = most recently called
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT public.call_appointment(tests.id('w4'));
SELECT public.call_appointment(tests.id('w3'));
SELECT tests.logout();
UPDATE public.appointments SET called_at = now() + interval '1 minute' WHERE id = tests.id('w4');
SELECT is((SELECT current_token FROM public.get_token_status(tests.code('g1'))),
          (SELECT token_number FROM public.get_token_status(tests.code('w4'))), 'current token = the most recently called');

-- No PII anywhere in the join page data.
SELECT is_empty($$
  SELECT 1 FROM public.patients p
  WHERE public.get_public_center('liaquat-university-hospital')::text ILIKE '%' || p.name || '%'
     OR (p.phone IS NOT NULL AND public.get_public_center('liaquat-university-hospital')::text LIKE '%' || right(p.phone, 7) || '%')
$$, 'join page data contains no patient name or phone');

SELECT * FROM finish();
ROLLBACK;
