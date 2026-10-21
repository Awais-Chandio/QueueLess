-- Migration: Doctor reviews (patient ratings) with aggregate columns on doctors
-- Created: 2026-09-21
-- Purpose: Replace the hard-coded star ratings shown on the doctor list, search
-- and profile screens with real patient feedback. A patient may review a
-- doctor once per appointment, and only after that appointment is 'completed'.
--
-- Aggregates live on public.doctors (avg_rating, review_count) because every
-- doctor list already selects doctors.* -- no extra query or join per card.
-- Not applied automatically: run it in the Supabase SQL editor / CLI.

BEGIN;

-- 1. Reviews table ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.doctor_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- UNIQUE = one review per appointment; the insert policy below cannot be
  -- bypassed by a double-tap or a second device.
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

CREATE INDEX IF NOT EXISTS idx_doctor_reviews_doctor_created
  ON public.doctor_reviews (doctor_id, created_at DESC);

-- 2. Aggregate columns on doctors -------------------------------------------
ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS avg_rating numeric(3, 2)
    CHECK (avg_rating IS NULL OR avg_rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS review_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.doctors.avg_rating IS
  'Mean of doctor_reviews.rating; NULL while review_count = 0. Maintained by trigger, never edited by hand.';
COMMENT ON COLUMN public.doctors.review_count IS
  'Number of doctor_reviews rows for this doctor. Maintained by trigger.';

-- 3. Keep the aggregates in sync --------------------------------------------
-- Recomputed from the source rows rather than adjusted incrementally, so an
-- edit, delete, or a review moved between doctors can never drift the totals.
CREATE OR REPLACE FUNCTION public.refresh_doctor_review_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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
$fn$;

DROP TRIGGER IF EXISTS doctor_reviews_refresh_stats ON public.doctor_reviews;
CREATE TRIGGER doctor_reviews_refresh_stats
  AFTER INSERT OR DELETE OR UPDATE OF rating, doctor_id
  ON public.doctor_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_doctor_review_stats();

-- 4. Stop doctors from editing their own rating -----------------------------
-- doctors has a "doctor self update own record" policy and table-wide UPDATE
-- grants, so without this a doctor could set avg_rating = 5.00 on themselves.
-- A direct client UPDATE runs at trigger depth 1 and is reverted; the
-- aggregate trigger above updates doctors from inside another trigger
-- (depth 2) and is allowed through. Admins may still correct a value.
CREATE OR REPLACE FUNCTION public.protect_doctor_review_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF pg_trigger_depth() <= 1
     AND auth.uid() IS NOT NULL
     AND NOT public.is_admin() THEN
    NEW.avg_rating := OLD.avg_rating;
    NEW.review_count := OLD.review_count;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS protect_doctor_review_stats_trigger ON public.doctors;
CREATE TRIGGER protect_doctor_review_stats_trigger
  BEFORE UPDATE ON public.doctors
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_doctor_review_stats();

-- 5. Row level security -----------------------------------------------------
ALTER TABLE public.doctor_reviews ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.doctor_reviews FROM anon, authenticated;
GRANT SELECT ON public.doctor_reviews TO anon, authenticated;
GRANT INSERT ON public.doctor_reviews TO authenticated;
-- UPDATE/DELETE are granted so the admin policy can work; no other policy
-- grants them, so RLS denies everyone else. Reviews are immutable to patients.
GRANT UPDATE, DELETE ON public.doctor_reviews TO authenticated;

DROP POLICY IF EXISTS "anyone can read doctor reviews" ON public.doctor_reviews;
CREATE POLICY "anyone can read doctor reviews"
  ON public.doctor_reviews
  FOR SELECT
  USING (true);

-- Redundant with the policy above while reads are public. Kept so a doctor
-- keeps seeing reviews about themselves if public read is ever narrowed.
DROP POLICY IF EXISTS "doctor reads own reviews" ON public.doctor_reviews;
CREATE POLICY "doctor reads own reviews"
  ON public.doctor_reviews
  FOR SELECT
  TO authenticated
  USING (
    doctor_id IN (
      SELECT doctors.id FROM public.doctors WHERE doctors.profile_id = auth.uid()
    )
  );

-- A patient may review only their own appointment, only once it is
-- 'completed', and only the doctor who actually saw them. Uniqueness on
-- appointment_id enforces "once".
DROP POLICY IF EXISTS "patient reviews own completed appointment" ON public.doctor_reviews;
CREATE POLICY "patient reviews own completed appointment"
  ON public.doctor_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    patient_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.appointments a
      WHERE a.id = doctor_reviews.appointment_id
        AND a.user_id = auth.uid()
        AND a.doctor_id = doctor_reviews.doctor_id
        AND a.status = 'completed'
    )
  );

DROP POLICY IF EXISTS "admin manages doctor reviews" ON public.doctor_reviews;
CREATE POLICY "admin manages doctor reviews"
  ON public.doctor_reviews
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMIT;

NOTIFY pgrst, 'reload schema';
