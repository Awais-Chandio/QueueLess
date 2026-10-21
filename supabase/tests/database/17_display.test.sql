-- Phase 1B.3: TV display (center_displays, get_display_snapshot, rotate_display_key, realtime nudge).
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
CREATE TABLE tests.keys (label text PRIMARY KEY, k text);
GRANT ALL ON tests.keys TO anon, authenticated;
INSERT INTO tests.keys SELECT 'a', display_key FROM public.center_displays WHERE center_id = '521f1349-05c4-4417-9fa5-5289963af7db';
CREATE FUNCTION tests.key(p_label text) RETURNS text LANGUAGE sql STABLE AS 'SELECT k FROM tests.keys WHERE label = p_label';
CREATE FUNCTION tests.doctor_a(p_snapshot jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS
  $$SELECT d FROM jsonb_array_elements(p_snapshot->'doctors') d WHERE d->>'name' = 'Dr. A'$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO anon, authenticated;

UPDATE public.appointments SET appointment_date = appointment_date - 7 WHERE doctor_id = 'd0000000-0000-4000-8000-00000000000a';
UPDATE public.doctors SET room = 'Room 2' WHERE id = 'd0000000-0000-4000-8000-00000000000a';

-- Seven walk-ins for Dr. A, the first one called.
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT count(*) FROM generate_series(1, 7) i,
  LATERAL public.issue_token('d0000000-0000-4000-8000-00000000000a', 'Hidden Patient ' || i, '+92300555000' || i, 'walk_in');
SELECT * FROM public.call_next('d0000000-0000-4000-8000-00000000000a');
SELECT tests.logout();

SELECT plan(21);

-- ---------------------------------------------------------------------------
-- Keys
-- ---------------------------------------------------------------------------
SELECT is((SELECT count(*)::int FROM public.service_centers c WHERE NOT EXISTS (SELECT 1 FROM public.center_displays k WHERE k.center_id = c.id)), 0,
          'every center has a display key');
SELECT ok((SELECT bool_and(display_key ~ '^[a-z0-9]{24}$') FROM public.center_displays), 'keys are 24 lowercase letters/digits');
INSERT INTO public.service_centers (id, name, city, address) VALUES ('c0000000-0000-4000-8000-0000000000d1', 'New Center', 'Hyderabad', 'X');
SELECT ok(EXISTS (SELECT 1 FROM public.center_displays WHERE center_id = 'c0000000-0000-4000-8000-0000000000d1'), 'a new center gets a key');
SELECT hasnt_column('public', 'service_centers', 'display_key', 'the key is not on service_centers (anon reads that table)');

SELECT tests.login_anon();
SELECT throws_ok($$SELECT * FROM public.center_displays$$, '42501', NULL, 'anon: cannot list display keys');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT set_eq($$SELECT center_id FROM public.center_displays$$, ARRAY['521f1349-05c4-4417-9fa5-5289963af7db'::uuid],
              'receptionist A: reads only center A''s key');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000006');
SELECT is_empty($$SELECT 1 FROM public.center_displays$$, 'patient: no keys');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- Snapshot (anon, by key)
-- ---------------------------------------------------------------------------
SELECT tests.login_anon();
SELECT is(public.get_display_snapshot(tests.key('a'))->>'center_name', 'Liaquat University Hospital', 'anon: snapshot by key');
SELECT is(public.get_display_snapshot(upper(tests.key('a')))->>'center_slug', 'liaquat-university-hospital', 'key is case-insensitive; slug for the join QR');
SELECT is(tests.doctor_a(public.get_display_snapshot(tests.key('a')))->>'room', 'Room 2', 'doctor room on the board');
SELECT is((tests.doctor_a(public.get_display_snapshot(tests.key('a')))->'now_serving'->>'status'), 'called', 'now serving: the called token');
SELECT is(jsonb_array_length(tests.doctor_a(public.get_display_snapshot(tests.key('a')))->'next'), 5, 'next: five tokens');
SELECT is((tests.doctor_a(public.get_display_snapshot(tests.key('a')))->>'waiting')::int, 6, 'waiting count: six');
SELECT ok((SELECT bool_and(jsonb_typeof(t) = 'number') FROM jsonb_array_elements(tests.doctor_a(public.get_display_snapshot(tests.key('a')))->'next') t),
          'next tokens are bare numbers');
SELECT is(public.get_display_snapshot('aaaaaaaaaaaaaaaaaaaaaaaa'), NULL, 'unknown key: NULL');
SELECT is(public.get_display_snapshot('short'), NULL, 'malformed key: NULL');
SELECT tests.logout();

SELECT is_empty($$
  SELECT 1 FROM public.appointments a
  JOIN public.patients p ON p.id = a.patient_id
  CROSS JOIN LATERAL (SELECT public.get_display_snapshot(tests.key('a'))::text AS j) s
  WHERE s.j ILIKE '%' || p.name || '%'
     OR (p.phone IS NOT NULL AND s.j LIKE '%' || right(p.phone, 7) || '%')
     OR s.j LIKE '%' || a.public_code || '%'
     OR s.j LIKE '%' || a.id || '%'
     OR s.j LIKE '%' || a.patient_id || '%'
$$, 'the board never contains a patient name, phone, token code or id');

-- ---------------------------------------------------------------------------
-- Rotation
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT throws_ok($$SELECT public.rotate_display_key('521f1349-05c4-4417-9fa5-5289963af7db')$$, '42501', NULL,
                 'receptionist: cannot rotate the key');
SELECT tests.logout();
SELECT tests.login('a0000000-0000-4000-8000-000000000009');
INSERT INTO tests.keys SELECT 'a2', public.rotate_display_key('521f1349-05c4-4417-9fa5-5289963af7db');
SELECT tests.logout();
SELECT isnt(tests.key('a2'), tests.key('a'), 'owner: rotation issues a new key');
SELECT tests.login_anon();
SELECT is(public.get_display_snapshot(tests.key('a')), NULL, 'the old TV link stops working');
SELECT tests.logout();

-- Realtime nudge never blocks a write.
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'appointments_nudge_displays_update'), 'appointments nudge trigger exists');

SELECT * FROM finish();
ROLLBACK;
