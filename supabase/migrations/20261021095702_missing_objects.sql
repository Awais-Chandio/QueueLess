-- Phase 0.6: objects the app uses that were never applied to production.
--
-- 1. doctor_reviews (+ rating aggregates on doctors). Source:
--    archive/migrations/20260921120000_add_doctor_reviews.sql. Changes: no anon
--    access, and patient_id is not readable by clients (reviews are visible to
--    every signed-in user and must not reveal who saw which doctor).
-- 2. visit_summaries, prescription_items, save_visit_summary(). Source:
--    archive/migrations/20260921150000_add_visit_summaries.sql (policies unchanged).
-- 3. Admin analytics RPCs busiest_services / busiest_centers / bookings_per_day.
--    Source: archive/admin_dashboard_stats.sql. Now admin-only (were open to
--    anyone, including anon, in archive/missing_migrations.sql).
-- 4. Realtime: appointments, center_queue_settings, doctor_queue_settings.
--
-- All functions use search_path = ''. New functions get no EXECUTE for PUBLIC
-- (default privileges from 20261021080419), so grants below are explicit.

-- ---------------------------------------------------------------------------
-- 1. doctor_reviews
-- ---------------------------------------------------------------------------

CREATE TABLE public.doctor_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- UNIQUE = one review per appointment, whatever the client does.
  appointment_id uuid NOT NULL UNIQUE
    REFERENCES public.appointments(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL
    REFERENCES public.doctors(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text CHECK (comment IS NULL OR char_length(comment) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_doctor_reviews_doctor_created
  ON public.doctor_reviews (doctor_id, created_at DESC);
CREATE INDEX idx_doctor_reviews_patient
  ON public.doctor_reviews (patient_id);

ALTER TABLE public.doctors
  ADD COLUMN avg_rating numeric(3, 2)
    CHECK (avg_rating IS NULL OR avg_rating BETWEEN 1 AND 5),
  ADD COLUMN review_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.doctors.avg_rating IS
  'Mean of doctor_reviews.rating; NULL while review_count = 0. Maintained by trigger, never edited by hand.';
COMMENT ON COLUMN public.doctors.review_count IS
  'Number of doctor_reviews rows for this doctor. Maintained by trigger.';

-- Recomputed from the source rows (not adjusted incrementally), so edits,
-- deletes or a review moved between doctors can never drift the totals.
CREATE FUNCTION public.refresh_doctor_review_stats()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_doctor_id uuid;
BEGIN
  FOR v_doctor_id IN
    SELECT DISTINCT id
    FROM unnest(
      CASE TG_OP
        WHEN 'INSERT' THEN ARRAY[NEW.doctor_id]
        WHEN 'DELETE' THEN ARRAY[OLD.doctor_id]
        ELSE ARRAY[OLD.doctor_id, NEW.doctor_id]
      END
    ) AS id
  LOOP
    UPDATE public.doctors d
    SET
      review_count = stats.review_count,
      avg_rating = stats.avg_rating
    FROM (
      SELECT
        COUNT(*)::integer AS review_count,
        ROUND(AVG(rating)::numeric, 2) AS avg_rating
      FROM public.doctor_reviews
      WHERE doctor_id = v_doctor_id
    ) AS stats
    WHERE d.id = v_doctor_id;
  END LOOP;

  RETURN NULL;
END;
$function$;

CREATE TRIGGER doctor_reviews_refresh_stats
  AFTER INSERT OR DELETE OR UPDATE OF rating, doctor_id
  ON public.doctor_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_doctor_review_stats();

-- doctors has a "doctor self update own record" policy, so without this a
-- doctor could set avg_rating = 5.00 on themselves. A direct client UPDATE runs
-- at trigger depth 1 and is reverted; the aggregate trigger above updates
-- doctors from inside another trigger (depth 2) and passes. Admins may correct.
CREATE FUNCTION public.protect_doctor_review_stats()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF pg_trigger_depth() <= 1
     AND auth.uid() IS NOT NULL
     AND NOT public.is_admin() THEN
    NEW.avg_rating := OLD.avg_rating;
    NEW.review_count := OLD.review_count;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER protect_doctor_review_stats_trigger
  BEFORE UPDATE ON public.doctors
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_doctor_review_stats();

ALTER TABLE public.doctor_reviews ENABLE ROW LEVEL SECURITY;

-- Column grants: every column except patient_id is readable; the insert still
-- writes patient_id (checked by the policy below).
REVOKE ALL ON public.doctor_reviews FROM anon, authenticated;
GRANT SELECT (id, appointment_id, doctor_id, rating, comment, created_at) ON public.doctor_reviews TO authenticated;
GRANT INSERT (appointment_id, patient_id, doctor_id, rating, comment) ON public.doctor_reviews TO authenticated;
-- For the admin policy only; no other policy allows UPDATE/DELETE.
GRANT UPDATE (rating, comment), DELETE ON public.doctor_reviews TO authenticated;

CREATE POLICY "signed-in users read doctor reviews" ON public.doctor_reviews
  FOR SELECT TO authenticated
  USING (true);

-- Only the patient of a completed appointment, for the doctor who saw them.
CREATE POLICY "patient reviews own completed appointment" ON public.doctor_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    patient_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.appointments a
      WHERE a.id = doctor_reviews.appointment_id
        AND a.user_id = (SELECT auth.uid())
        AND a.doctor_id = doctor_reviews.doctor_id
        AND a.status = 'completed'
    )
  );

CREATE POLICY "admin manages doctor reviews" ON public.doctor_reviews
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. visit_summaries, prescription_items, save_visit_summary()
-- ---------------------------------------------------------------------------

CREATE TABLE public.visit_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- UNIQUE = one summary per appointment; also the upsert conflict target.
  appointment_id uuid NOT NULL UNIQUE
    REFERENCES public.appointments(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL
    REFERENCES public.doctors(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  diagnosis text CHECK (diagnosis IS NULL OR char_length(diagnosis) <= 1000),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 4000),
  follow_up_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_visit_summaries_patient ON public.visit_summaries (patient_id);
CREATE INDEX idx_visit_summaries_doctor ON public.visit_summaries (doctor_id);

CREATE TABLE public.prescription_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_summary_id uuid NOT NULL
    REFERENCES public.visit_summaries(id) ON DELETE CASCADE,
  medicine_name text NOT NULL CHECK (char_length(btrim(medicine_name)) BETWEEN 1 AND 200),
  dosage text NOT NULL CHECK (char_length(btrim(dosage)) BETWEEN 1 AND 100),
  frequency text NOT NULL CHECK (char_length(btrim(frequency)) BETWEEN 1 AND 100),
  duration text NOT NULL CHECK (char_length(btrim(duration)) BETWEEN 1 AND 100),
  instructions text CHECK (instructions IS NULL OR char_length(instructions) <= 500),
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX idx_prescription_items_summary
  ON public.prescription_items (visit_summary_id, sort_order);

CREATE FUNCTION public.touch_visit_summary_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER visit_summaries_touch_updated_at
  BEFORE UPDATE ON public.visit_summaries
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_visit_summary_updated_at();

-- No anon. DELETE on visit_summaries only for the admin policy.
REVOKE ALL ON public.visit_summaries FROM anon, authenticated;
REVOKE ALL ON public.prescription_items FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visit_summaries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescription_items TO authenticated;

ALTER TABLE public.visit_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescription_items ENABLE ROW LEVEL SECURITY;

-- The assigned doctor, on a completed appointment; doctor_id / patient_id must
-- agree with the appointment, so a summary can't be filed under someone else.
CREATE POLICY "doctor reads own visit summaries" ON public.visit_summaries
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.appointments a
    JOIN public.doctors d ON d.id = a.doctor_id
    WHERE a.id = visit_summaries.appointment_id
      AND d.profile_id = (SELECT auth.uid())
      AND a.status = 'completed'
  ));

CREATE POLICY "doctor inserts visit summary for completed appointment" ON public.visit_summaries
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.appointments a
    JOIN public.doctors d ON d.id = a.doctor_id
    WHERE a.id = visit_summaries.appointment_id
      AND d.profile_id = (SELECT auth.uid())
      AND a.status = 'completed'
      AND a.doctor_id = visit_summaries.doctor_id
      AND a.user_id = visit_summaries.patient_id
  ));

CREATE POLICY "doctor updates own visit summary" ON public.visit_summaries
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.appointments a
    JOIN public.doctors d ON d.id = a.doctor_id
    WHERE a.id = visit_summaries.appointment_id
      AND d.profile_id = (SELECT auth.uid())
      AND a.status = 'completed'
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.appointments a
    JOIN public.doctors d ON d.id = a.doctor_id
    WHERE a.id = visit_summaries.appointment_id
      AND d.profile_id = (SELECT auth.uid())
      AND a.status = 'completed'
      AND a.doctor_id = visit_summaries.doctor_id
      AND a.user_id = visit_summaries.patient_id
  ));

-- Read-only for the patient, only their own appointment's summary.
CREATE POLICY "patient reads own visit summary" ON public.visit_summaries
  FOR SELECT TO authenticated
  USING (
    patient_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = visit_summaries.appointment_id
        AND a.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "admin manages visit summaries" ON public.visit_summaries
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Items inherit access from their summary. The doctor also gets DELETE here:
-- editing a prescription replaces its rows.
CREATE POLICY "doctor reads own prescription items" ON public.prescription_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.visit_summaries vs
    JOIN public.appointments a ON a.id = vs.appointment_id
    JOIN public.doctors d ON d.id = a.doctor_id
    WHERE vs.id = prescription_items.visit_summary_id
      AND d.profile_id = (SELECT auth.uid())
      AND a.status = 'completed'
  ));

CREATE POLICY "doctor inserts own prescription items" ON public.prescription_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.visit_summaries vs
    JOIN public.appointments a ON a.id = vs.appointment_id
    JOIN public.doctors d ON d.id = a.doctor_id
    WHERE vs.id = prescription_items.visit_summary_id
      AND d.profile_id = (SELECT auth.uid())
      AND a.status = 'completed'
  ));

CREATE POLICY "doctor updates own prescription items" ON public.prescription_items
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.visit_summaries vs
    JOIN public.appointments a ON a.id = vs.appointment_id
    JOIN public.doctors d ON d.id = a.doctor_id
    WHERE vs.id = prescription_items.visit_summary_id
      AND d.profile_id = (SELECT auth.uid())
      AND a.status = 'completed'
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.visit_summaries vs
    JOIN public.appointments a ON a.id = vs.appointment_id
    JOIN public.doctors d ON d.id = a.doctor_id
    WHERE vs.id = prescription_items.visit_summary_id
      AND d.profile_id = (SELECT auth.uid())
      AND a.status = 'completed'
  ));

CREATE POLICY "doctor deletes own prescription items" ON public.prescription_items
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.visit_summaries vs
    JOIN public.appointments a ON a.id = vs.appointment_id
    JOIN public.doctors d ON d.id = a.doctor_id
    WHERE vs.id = prescription_items.visit_summary_id
      AND d.profile_id = (SELECT auth.uid())
      AND a.status = 'completed'
  ));

CREATE POLICY "patient reads own prescription items" ON public.prescription_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.visit_summaries vs
    WHERE vs.id = prescription_items.visit_summary_id
      AND vs.patient_id = (SELECT auth.uid())
  ));

CREATE POLICY "admin manages prescription items" ON public.prescription_items
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Create-or-edit a summary and its medicine list in one transaction.
-- SECURITY INVOKER: every statement runs under the caller's RLS, so anyone but
-- the assigned doctor (or an admin) is rejected, as is a non-completed visit.
-- p_items: JSON array of {medicine_name, dosage, frequency, duration,
-- instructions?}; array order becomes sort_order; existing items are replaced.
CREATE FUNCTION public.save_visit_summary(
  p_appointment_id uuid,
  p_diagnosis text,
  p_notes text,
  p_follow_up_date date,
  p_items jsonb
)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_appt public.appointments%ROWTYPE;
  v_summary_id uuid;
BEGIN
  SELECT * INTO v_appt FROM public.appointments WHERE id = p_appointment_id;

  IF NOT FOUND OR v_appt.doctor_id IS NULL THEN
    RAISE EXCEPTION 'Appointment not found' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(COALESCE(p_items, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'p_items must be a JSON array' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.visit_summaries
    (appointment_id, doctor_id, patient_id, diagnosis, notes, follow_up_date)
  VALUES
    (p_appointment_id, v_appt.doctor_id, v_appt.user_id,
     NULLIF(btrim(p_diagnosis), ''), NULLIF(btrim(p_notes), ''), p_follow_up_date)
  ON CONFLICT (appointment_id) DO UPDATE
    SET diagnosis = EXCLUDED.diagnosis,
        notes = EXCLUDED.notes,
        follow_up_date = EXCLUDED.follow_up_date
  RETURNING id INTO v_summary_id;

  DELETE FROM public.prescription_items WHERE visit_summary_id = v_summary_id;

  INSERT INTO public.prescription_items
    (visit_summary_id, medicine_name, dosage, frequency, duration, instructions, sort_order)
  SELECT
    v_summary_id,
    btrim(item ->> 'medicine_name'),
    btrim(item ->> 'dosage'),
    btrim(item ->> 'frequency'),
    btrim(item ->> 'duration'),
    NULLIF(btrim(item ->> 'instructions'), ''),
    (ord - 1)::integer
  FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) WITH ORDINALITY AS t(item, ord);

  RETURN v_summary_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Admin analytics (admin dashboard only)
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.busiest_services(p_range text)
 RETURNS TABLE(service_name text, count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_start_date timestamptz;
BEGIN
  IF NOT private.is_server_context() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can view analytics'
      USING ERRCODE = '42501';
  END IF;

  IF p_range = 'today' THEN
    v_start_date := CURRENT_DATE;
  ELSIF p_range = 'week' THEN
    v_start_date := CURRENT_DATE - INTERVAL '7 days';
  ELSIF p_range = 'month' THEN
    v_start_date := CURRENT_DATE - INTERVAL '30 days';
  ELSE
    v_start_date := '1970-01-01'::timestamptz;
  END IF;

  RETURN QUERY
  SELECT
    s.name::text AS service_name,
    COUNT(*)::bigint
  FROM public.appointments a
  JOIN public.services s ON s.id = a.service_id
  WHERE a.scheduled_at >= v_start_date
  GROUP BY s.name
  ORDER BY COUNT(*) DESC;
END;
$function$;

CREATE FUNCTION public.busiest_centers(p_range text)
 RETURNS TABLE(center_name text, count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_start_date timestamptz;
BEGIN
  IF NOT private.is_server_context() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can view analytics'
      USING ERRCODE = '42501';
  END IF;

  IF p_range = 'today' THEN
    v_start_date := CURRENT_DATE;
  ELSIF p_range = 'week' THEN
    v_start_date := CURRENT_DATE - INTERVAL '7 days';
  ELSIF p_range = 'month' THEN
    v_start_date := CURRENT_DATE - INTERVAL '30 days';
  ELSE
    v_start_date := '1970-01-01'::timestamptz;
  END IF;

  RETURN QUERY
  SELECT
    c.name::text AS center_name,
    COUNT(*)::bigint
  FROM public.appointments a
  JOIN public.service_centers c ON c.id = a.center_id
  WHERE a.scheduled_at >= v_start_date
  GROUP BY c.name
  ORDER BY COUNT(*) DESC;
END;
$function$;

CREATE FUNCTION public.bookings_per_day(p_range text)
 RETURNS TABLE(booking_date date, count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_start_date timestamptz;
BEGIN
  IF NOT private.is_server_context() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can view analytics'
      USING ERRCODE = '42501';
  END IF;

  IF p_range = 'today' THEN
    v_start_date := CURRENT_DATE;
  ELSIF p_range = 'week' THEN
    v_start_date := CURRENT_DATE - INTERVAL '7 days';
  ELSIF p_range = 'month' THEN
    v_start_date := CURRENT_DATE - INTERVAL '30 days';
  ELSE
    v_start_date := '1970-01-01'::timestamptz;
  END IF;

  RETURN QUERY
  SELECT
    a.appointment_date::date,
    COUNT(*)::bigint
  FROM public.appointments a
  WHERE a.scheduled_at >= v_start_date
  GROUP BY a.appointment_date
  ORDER BY a.appointment_date ASC;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Function privileges (new functions start with no EXECUTE for PUBLIC)
-- ---------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION
  public.refresh_doctor_review_stats(),
  public.protect_doctor_review_stats(),
  public.touch_visit_summary_updated_at(),
  public.save_visit_summary(uuid, text, text, date, jsonb),
  public.busiest_services(text),
  public.busiest_centers(text),
  public.bookings_per_day(text)
TO service_role;

GRANT EXECUTE ON FUNCTION public.save_visit_summary(uuid, text, text, date, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.busiest_services(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.busiest_centers(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bookings_per_day(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Realtime. Postgres-changes events still respect RLS, so staff only get
--    events for their own centers' appointments.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['appointments', 'center_queue_settings', 'doctor_queue_settings'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END;
$$;

notify pgrst, 'reload schema';
