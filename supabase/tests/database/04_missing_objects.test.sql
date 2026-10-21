-- Phase 0.6: doctor_reviews, visit summaries, admin analytics, realtime.
-- Run with: supabase test db --local supabase/tests/database
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

-- e1 (patient 1 / doctor A) goes through the normal flow to 'completed'.
UPDATE public.appointments SET status = 'called' WHERE id = 'e0000000-0000-4000-8000-000000000001';
UPDATE public.appointments SET status = 'completed', completed_at = now() WHERE id = 'e0000000-0000-4000-8000-000000000001';

SELECT plan(33);

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------
SELECT ok((SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN
          ('public.doctor_reviews'::regclass, 'public.visit_summaries'::regclass, 'public.prescription_items'::regclass)),
          'RLS enabled on the new tables');
SELECT ok(NOT has_table_privilege('anon', 'public.doctor_reviews', 'SELECT')
          AND NOT has_table_privilege('anon', 'public.visit_summaries', 'SELECT')
          AND NOT has_table_privilege('anon', 'public.prescription_items', 'SELECT'), 'anon: no access to the new tables');
SELECT ok(NOT has_column_privilege('authenticated', 'public.doctor_reviews', 'patient_id', 'SELECT')
          AND has_column_privilege('authenticated', 'public.doctor_reviews', 'rating', 'SELECT'),
          'reviews: patient_id not readable by clients, rating is');
SELECT set_eq($$SELECT tablename::text FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public'$$,
              ARRAY['appointments', 'center_queue_settings', 'doctor_queue_settings', 'doctors', 'notifications', 'queue_updates'],
              'realtime publication: appointments + both queue settings added');

-- ---------------------------------------------------------------------------
-- doctor_reviews
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000006');
SELECT lives_ok($$INSERT INTO public.doctor_reviews (appointment_id, patient_id, doctor_id, rating, comment)
                  VALUES ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-00000000000a', 5, 'Great')$$,
                'patient 1: reviews own completed visit');
SELECT throws_ok($$INSERT INTO public.doctor_reviews (appointment_id, patient_id, doctor_id, rating)
                   VALUES ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-00000000000a', 4)$$,
                 '23505', NULL, 'patient 1: second review of the same visit rejected');
SELECT throws_ok($$INSERT INTO public.doctor_reviews (appointment_id, patient_id, doctor_id, rating)
                   VALUES ('e0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-00000000000b', 1)$$,
                 '42501', NULL, 'patient 1: cannot review a visit that isn''t completed');
SELECT throws_ok($$SELECT patient_id FROM public.doctor_reviews$$, '42501', NULL, 'patient 1: cannot read patient_id');
RESET ROLE;

SELECT is((SELECT avg_rating FROM public.doctors WHERE id = 'd0000000-0000-4000-8000-00000000000a'), 5.00::numeric(3,2), 'aggregate: avg_rating updated');
SELECT is((SELECT review_count FROM public.doctors WHERE id = 'd0000000-0000-4000-8000-00000000000a'), 1, 'aggregate: review_count updated');

SELECT tests.login('a0000000-0000-4000-8000-000000000007');
SELECT throws_ok($$INSERT INTO public.doctor_reviews (appointment_id, patient_id, doctor_id, rating)
                   VALUES ('e0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-00000000000b', 1)$$,
                 '42501', NULL, 'patient 2: cannot review as someone else');
SELECT is((SELECT rating FROM public.doctor_reviews WHERE doctor_id = 'd0000000-0000-4000-8000-00000000000a'), 5, 'patient 2: reads reviews on a doctor profile');
SELECT is_empty($$UPDATE public.doctor_reviews SET rating = 1 RETURNING id$$, 'patient 2: cannot edit reviews');
RESET ROLE;

SELECT tests.login('a0000000-0000-4000-8000-000000000004');
UPDATE public.doctors SET avg_rating = 1, review_count = 99 WHERE id = 'd0000000-0000-4000-8000-00000000000a';
RESET ROLE;
SELECT is((SELECT review_count FROM public.doctors WHERE id = 'd0000000-0000-4000-8000-00000000000a'), 1, 'doctor A: cannot edit own rating aggregates');

SELECT tests.login_anon();
SELECT throws_ok($$SELECT id FROM public.doctor_reviews$$, '42501', NULL, 'anon: cannot read reviews');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- visit summaries
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000004');
SELECT lives_ok($$SELECT public.save_visit_summary('e0000000-0000-4000-8000-000000000001', 'Flu', 'Rest', CURRENT_DATE + 7,
                  '[{"medicine_name":"Paracetamol","dosage":"500mg","frequency":"3x/day","duration":"5 days"},
                    {"medicine_name":"ORS","dosage":"1 sachet","frequency":"2x/day","duration":"3 days","instructions":"after meals"}]')$$,
                'doctor A: saves a summary with 2 medicines');
SELECT is((SELECT count(*)::int FROM public.prescription_items), 2, 'doctor A: sees both medicines');
SELECT lives_ok($$SELECT public.save_visit_summary('e0000000-0000-4000-8000-000000000001', 'Flu', 'Rest more', NULL,
                  '[{"medicine_name":"Paracetamol","dosage":"500mg","frequency":"2x/day","duration":"3 days"}]')$$,
                'doctor A: edits the summary (items replaced)');
SELECT is((SELECT count(*)::int FROM public.prescription_items), 1, 'doctor A: edit replaced the medicine list');
SELECT throws_ok($$SELECT public.save_visit_summary('e0000000-0000-4000-8000-000000000002', 'x', NULL, NULL, '[]')$$,
                 '42501', NULL, 'doctor A: cannot file a summary for a visit that isn''t completed');
SELECT throws_ok($$SELECT public.save_visit_summary('e0000000-0000-4000-8000-000000000004', 'x', NULL, NULL, '[]')$$,
                 '42501', NULL, 'doctor A: cannot file a summary for another doctor''s patient');
RESET ROLE;

SELECT tests.login('a0000000-0000-4000-8000-000000000005');
SELECT throws_ok($$SELECT public.save_visit_summary('e0000000-0000-4000-8000-000000000001', 'x', NULL, NULL, '[]')$$,
                 '42501', NULL, 'doctor B: cannot write doctor A''s summary');
SELECT is_empty($$SELECT id FROM public.visit_summaries$$, 'doctor B: cannot read doctor A''s summary');
RESET ROLE;

SELECT tests.login('a0000000-0000-4000-8000-000000000006');
SELECT is((SELECT diagnosis FROM public.visit_summaries WHERE appointment_id = 'e0000000-0000-4000-8000-000000000001'), 'Flu', 'patient 1: reads own summary');
SELECT is((SELECT count(*)::int FROM public.prescription_items), 1, 'patient 1: reads own prescription');
SELECT throws_ok($$SELECT public.save_visit_summary('e0000000-0000-4000-8000-000000000001', 'hacked', NULL, NULL, '[]')$$,
                 '42501', NULL, 'patient 1: cannot write a summary');
RESET ROLE;

SELECT tests.login('a0000000-0000-4000-8000-000000000007');
SELECT is_empty($$SELECT id FROM public.visit_summaries$$, 'patient 2: cannot read patient 1''s summary');
RESET ROLE;
SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT is_empty($$SELECT id FROM public.visit_summaries$$, 'staff A: cannot read clinical summaries');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Admin analytics
-- ---------------------------------------------------------------------------
SELECT tests.login('a0000000-0000-4000-8000-000000000001');
SELECT isnt_empty($$SELECT * FROM public.busiest_services('all')$$, 'admin: busiest_services');
SELECT isnt_empty($$SELECT * FROM public.busiest_centers('all')$$, 'admin: busiest_centers');
SELECT isnt_empty($$SELECT * FROM public.bookings_per_day('all')$$, 'admin: bookings_per_day');
RESET ROLE;

SELECT tests.login('a0000000-0000-4000-8000-000000000002');
SELECT throws_ok($$SELECT * FROM public.busiest_centers('all')$$, '42501', NULL, 'staff: analytics denied');
RESET ROLE;
SELECT tests.login_anon();
SELECT throws_ok($$SELECT * FROM public.bookings_per_day('all')$$, '42501', NULL, 'anon: analytics denied');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
