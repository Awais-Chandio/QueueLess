-- Migration: Visit summaries and prescriptions
-- Created: 2026-09-21
-- Purpose: After a visit is 'completed', the assigned doctor records a
-- diagnosis, general notes, a medicine list and an optional follow-up date.
-- The patient can read it from their appointment; nobody else can.
--
-- Column names follow the existing schema: appointments.user_id is the
-- patient (there is no appointments.patient_id) and appointments.doctor_id
-- references doctors.id, not a profile id. visit_summaries mirrors that:
-- patient_id -> auth.users(id), doctor_id -> doctors(id), as in doctor_reviews.
-- Not applied automatically: run it in the Supabase SQL editor / CLI.

BEGIN;

-- 1. Tables -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.visit_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- UNIQUE = one summary per appointment; it is also the upsert conflict target.
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

CREATE INDEX IF NOT EXISTS idx_visit_summaries_patient
  ON public.visit_summaries (patient_id);
CREATE INDEX IF NOT EXISTS idx_visit_summaries_doctor
  ON public.visit_summaries (doctor_id);

CREATE TABLE IF NOT EXISTS public.prescription_items (
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

CREATE INDEX IF NOT EXISTS idx_prescription_items_summary
  ON public.prescription_items (visit_summary_id, sort_order);

-- 2. updated_at -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_visit_summary_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS visit_summaries_touch_updated_at ON public.visit_summaries;
CREATE TRIGGER visit_summaries_touch_updated_at
  BEFORE UPDATE ON public.visit_summaries
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_visit_summary_updated_at();

-- 3. Grants -----------------------------------------------------------------
-- Table privileges are only the outer gate; the policies below decide rows.
-- No grant to anon. DELETE on visit_summaries is granted only so the admin
-- policy can work; no other policy allows it, so RLS denies everyone else.
REVOKE ALL ON public.visit_summaries FROM anon, authenticated;
REVOKE ALL ON public.prescription_items FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visit_summaries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescription_items TO authenticated;

ALTER TABLE public.visit_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescription_items ENABLE ROW LEVEL SECURITY;

-- 4. Row level security: visit_summaries ------------------------------------
-- The assigned doctor: doctors.profile_id = auth.uid() and the appointment is
-- theirs, 'completed', and the row's doctor_id / patient_id agree with the
-- appointment. The last two checks stop a doctor filing a summary under a
-- patient who was not actually in that appointment, which would leak it to them.
DROP POLICY IF EXISTS "doctor reads own visit summaries" ON public.visit_summaries;
CREATE POLICY "doctor reads own visit summaries"
  ON public.visit_summaries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.appointments a
      JOIN public.doctors d ON d.id = a.doctor_id
      WHERE a.id = visit_summaries.appointment_id
        AND d.profile_id = auth.uid()
        AND a.status = 'completed'
    )
  );

DROP POLICY IF EXISTS "doctor inserts visit summary for completed appointment" ON public.visit_summaries;
CREATE POLICY "doctor inserts visit summary for completed appointment"
  ON public.visit_summaries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.appointments a
      JOIN public.doctors d ON d.id = a.doctor_id
      WHERE a.id = visit_summaries.appointment_id
        AND d.profile_id = auth.uid()
        AND a.status = 'completed'
        AND a.doctor_id = visit_summaries.doctor_id
        AND a.user_id = visit_summaries.patient_id
    )
  );

DROP POLICY IF EXISTS "doctor updates own visit summary" ON public.visit_summaries;
CREATE POLICY "doctor updates own visit summary"
  ON public.visit_summaries
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.appointments a
      JOIN public.doctors d ON d.id = a.doctor_id
      WHERE a.id = visit_summaries.appointment_id
        AND d.profile_id = auth.uid()
        AND a.status = 'completed'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.appointments a
      JOIN public.doctors d ON d.id = a.doctor_id
      WHERE a.id = visit_summaries.appointment_id
        AND d.profile_id = auth.uid()
        AND a.status = 'completed'
        AND a.doctor_id = visit_summaries.doctor_id
        AND a.user_id = visit_summaries.patient_id
    )
  );

-- Read-only for the patient, and only their own appointment's summary.
DROP POLICY IF EXISTS "patient reads own visit summary" ON public.visit_summaries;
CREATE POLICY "patient reads own visit summary"
  ON public.visit_summaries
  FOR SELECT
  TO authenticated
  USING (
    patient_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.appointments a
      WHERE a.id = visit_summaries.appointment_id
        AND a.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "admin manages visit summaries" ON public.visit_summaries;
CREATE POLICY "admin manages visit summaries"
  ON public.visit_summaries
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 5. Row level security: prescription_items ---------------------------------
-- Items inherit access from their summary. The doctor also gets DELETE here
-- (not on visit_summaries): editing a prescription means removing a medicine
-- row, and that is the only way a doctor can.
DROP POLICY IF EXISTS "doctor reads own prescription items" ON public.prescription_items;
CREATE POLICY "doctor reads own prescription items"
  ON public.prescription_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.visit_summaries vs
      JOIN public.appointments a ON a.id = vs.appointment_id
      JOIN public.doctors d ON d.id = a.doctor_id
      WHERE vs.id = prescription_items.visit_summary_id
        AND d.profile_id = auth.uid()
        AND a.status = 'completed'
    )
  );

DROP POLICY IF EXISTS "doctor inserts own prescription items" ON public.prescription_items;
CREATE POLICY "doctor inserts own prescription items"
  ON public.prescription_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.visit_summaries vs
      JOIN public.appointments a ON a.id = vs.appointment_id
      JOIN public.doctors d ON d.id = a.doctor_id
      WHERE vs.id = prescription_items.visit_summary_id
        AND d.profile_id = auth.uid()
        AND a.status = 'completed'
    )
  );

DROP POLICY IF EXISTS "doctor updates own prescription items" ON public.prescription_items;
CREATE POLICY "doctor updates own prescription items"
  ON public.prescription_items
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.visit_summaries vs
      JOIN public.appointments a ON a.id = vs.appointment_id
      JOIN public.doctors d ON d.id = a.doctor_id
      WHERE vs.id = prescription_items.visit_summary_id
        AND d.profile_id = auth.uid()
        AND a.status = 'completed'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.visit_summaries vs
      JOIN public.appointments a ON a.id = vs.appointment_id
      JOIN public.doctors d ON d.id = a.doctor_id
      WHERE vs.id = prescription_items.visit_summary_id
        AND d.profile_id = auth.uid()
        AND a.status = 'completed'
    )
  );

DROP POLICY IF EXISTS "doctor deletes own prescription items" ON public.prescription_items;
CREATE POLICY "doctor deletes own prescription items"
  ON public.prescription_items
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.visit_summaries vs
      JOIN public.appointments a ON a.id = vs.appointment_id
      JOIN public.doctors d ON d.id = a.doctor_id
      WHERE vs.id = prescription_items.visit_summary_id
        AND d.profile_id = auth.uid()
        AND a.status = 'completed'
    )
  );

DROP POLICY IF EXISTS "patient reads own prescription items" ON public.prescription_items;
CREATE POLICY "patient reads own prescription items"
  ON public.prescription_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.visit_summaries vs
      WHERE vs.id = prescription_items.visit_summary_id
        AND vs.patient_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "admin manages prescription items" ON public.prescription_items;
CREATE POLICY "admin manages prescription items"
  ON public.prescription_items
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 6. save_visit_summary(): create-or-edit in one transaction -----------------
-- The app calls this instead of writing the two tables separately, so a
-- summary and its medicine list can never be half saved. SECURITY INVOKER
-- (the default) means every statement still runs under the caller's RLS:
-- anyone but the assigned doctor (or an admin) is rejected by the policies,
-- and an appointment that is not 'completed' fails the same way.
-- p_items is a JSON array of
--   {medicine_name, dosage, frequency, duration, instructions?};
-- array order becomes sort_order. Existing items are replaced wholesale.
CREATE OR REPLACE FUNCTION public.save_visit_summary(
  p_appointment_id uuid,
  p_diagnosis text,
  p_notes text,
  p_follow_up_date date,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $fn$
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
$fn$;

REVOKE ALL ON FUNCTION public.save_visit_summary(uuid, text, text, date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_visit_summary(uuid, text, text, date, jsonb) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
