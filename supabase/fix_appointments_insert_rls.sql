-- QueueLess booking repair: reset appointments RLS for authenticated users.
-- Run this in Supabase SQL Editor if booking insert fails with:
-- "new row violates row-level security policy for table \"appointments\"".

BEGIN;

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'appointments'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.appointments',
      policy_record.policyname
    );
  END LOOP;
END $$;

CREATE POLICY "Users can view own appointments"
  ON public.appointments
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own appointments"
  ON public.appointments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = user_id
  );

CREATE POLICY "Users can cancel own appointments"
  ON public.appointments
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON public.appointments FROM anon, authenticated;
GRANT SELECT, INSERT ON public.appointments TO authenticated;
GRANT UPDATE(status) ON public.appointments TO authenticated;

COMMIT;

SELECT
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'appointments'
ORDER BY policyname;
