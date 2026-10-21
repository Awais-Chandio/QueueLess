-- Phase 1A.6: public token status. Run with: supabase test db
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
CREATE FUNCTION tests.logout() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true), set_config('role', 'postgres', true);
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO anon, authenticated;

CREATE TABLE tests.codes (label text PRIMARY KEY, code text);
GRANT ALL ON tests.codes TO anon, authenticated;
CREATE FUNCTION tests.code(p_label text) RETURNS text LANGUAGE sql STABLE AS 'SELECT code FROM tests.codes WHERE label = p_label';
CREATE FUNCTION tests.id(p_label text) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS
  'SELECT a.id FROM public.appointments a WHERE a.public_code = tests.code(p_label)';
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO anon, authenticated;

-- Two guests join doctor A by QR (anon).
SELECT tests.login_anon();
INSERT INTO tests.codes SELECT 'first', public_code FROM public.issue_token('d0000000-0000-4000-8000-00000000000a', 'Zainab Secret', '+923331234567', 'qr');
INSERT INTO tests.codes SELECT 'second', public_code FROM public.issue_token('d0000000-0000-4000-8000-00000000000a', 'Hamza Hidden', '+923339876543', 'qr');
SELECT tests.logout();

SELECT plan(19);

-- ---------------------------------------------------------------------------
-- Shape: exactly the six public fields
-- ---------------------------------------------------------------------------
SELECT is((SELECT array_agg(n ORDER BY n) FROM (
             SELECT unnest(proargnames) AS n, unnest(proargmodes) AS m FROM pg_proc WHERE oid = 'public.get_token_status(text)'::regprocedure
           ) s WHERE m = 't'),
          ARRAY['current_token', 'doctor_name', 'eta_minutes', 'people_ahead', 'status', 'token_number']::text[],
          'get_token_status returns exactly: token_number, people_ahead, eta_minutes, current_token, doctor_name, status');
SELECT ok((SELECT provolatile = 's' AND prosecdef FROM pg_proc WHERE oid = 'public.get_token_status(text)'::regprocedure),
          'get_token_status is read-only (STABLE) and SECURITY DEFINER');

-- ---------------------------------------------------------------------------
-- anon reads status by code
-- ---------------------------------------------------------------------------
SELECT tests.login_anon();
SELECT is((SELECT s.doctor_name || '|' || s.status FROM public.get_token_status(tests.code('first')) s), 'Dr. A|waiting',
          'anon: status by code (doctor display name, waiting)');
SELECT is((SELECT people_ahead FROM public.get_token_status(tests.code('second'))),
          (SELECT people_ahead + 1 FROM public.get_token_status(tests.code('first'))),
          'anon: the second guest has one more person ahead');
SELECT is((SELECT eta_minutes FROM public.get_token_status(tests.code('second'))),
          (SELECT people_ahead * 10 FROM public.get_token_status(tests.code('second'))),
          'anon: ETA = people ahead x average consultation time (10 min default)');
SELECT is((SELECT token_number FROM public.get_token_status(lower(' ' || tests.code('first') || ' '))),
          (SELECT token_number FROM public.get_token_status(tests.code('first'))),
          'code is case- and space-insensitive');
SELECT is_empty($$SELECT * FROM public.get_token_status('ZZZZZZZZ')$$, 'unknown code: no row');
SELECT is_empty($$SELECT * FROM public.get_token_status('O0I1O0I1')$$, 'malformed code (look-alike characters): no row');
SELECT is_empty($$SELECT * FROM public.get_token_status(NULL)$$, 'NULL code: no row');
SELECT is_empty($$SELECT * FROM public.get_token_status(''' OR 1=1 --')$$, 'injection-shaped input: no row');
SELECT throws_ok($$SELECT 1 FROM public.patients$$, '42501', NULL, 'anon: still no access to patients');
SELECT is_empty($$SELECT 1 FROM public.appointments$$, 'anon: still no appointments visible');
SELECT tests.logout();

-- ---------------------------------------------------------------------------
-- No PII, for every appointment in the database (seed + guests)
-- ---------------------------------------------------------------------------
SELECT is_empty($$
  SELECT a.id
  FROM public.appointments a
  JOIN public.patients p ON p.id = a.patient_id
  LEFT JOIN public.profiles pr ON pr.id = a.user_id
  CROSS JOIN LATERAL (SELECT to_jsonb(s) AS j FROM public.get_token_status(a.public_code) s) r
  WHERE r.j::text ILIKE '%' || p.name || '%'
     OR (p.phone IS NOT NULL AND r.j::text LIKE '%' || right(p.phone, 7) || '%')
     OR (pr.full_name <> '' AND r.j::text ILIKE '%' || pr.full_name || '%')
     OR (pr.email <> '' AND r.j::text ILIKE '%' || pr.email || '%')
     OR r.j::text LIKE '%' || a.id || '%'
     OR r.j::text LIKE '%' || a.patient_id || '%'
     OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(r.j) k)
        <> ARRAY['current_token', 'doctor_name', 'eta_minutes', 'people_ahead', 'status', 'token_number']
$$, 'no appointment''s status contains a name, phone, email or id, or any extra field');

-- ---------------------------------------------------------------------------
-- Status follows the queue
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT public.call_appointment(tests.id('first'));
SELECT tests.logout();
SELECT tests.login_anon();
SELECT is((SELECT status FROM public.get_token_status(tests.code('first'))), 'called', 'called token shows called');
SELECT is((SELECT current_token FROM public.get_token_status(tests.code('second'))),
          (SELECT token_number FROM public.get_token_status(tests.code('first'))), 'current token = the called one');
SELECT tests.logout();

SELECT tests.login('a0000000-0000-4000-8000-000000000004');
SELECT public.complete_appointment(tests.id('first'));
SELECT tests.logout();
SELECT tests.login_anon();
SELECT is((SELECT status || '|' || people_ahead || '|' || eta_minutes FROM public.get_token_status(tests.code('first'))), 'completed|0|0',
          'completed token: completed, nobody ahead, no wait');
SELECT tests.logout();

SELECT tests.login('a0000000-0000-4000-8000-000000000002');
UPDATE public.appointments SET status = 'cancelled', cancelled_at = now() WHERE id = tests.id('second');
SELECT tests.logout();
SELECT tests.login_anon();
SELECT is((SELECT status FROM public.get_token_status(tests.code('second'))), 'cancelled', 'cancelled token shows cancelled');
SELECT tests.logout();

-- Signed-in users can use it too (patient app showing a guest's code).
SELECT tests.login('a0000000-0000-4000-8000-000000000006');
SELECT isnt_empty(format('SELECT * FROM public.get_token_status(%L)', tests.code('first')), 'signed-in users can read a status by code');
SELECT tests.logout();

SELECT is((SELECT status FROM public.get_token_status((SELECT public_code FROM public.appointments WHERE id = 'e0000000-0000-4000-8000-000000000004'))),
          'waiting', 'app bookings have a code and status too (checked_in -> waiting)');

SELECT * FROM finish();
ROLLBACK;
