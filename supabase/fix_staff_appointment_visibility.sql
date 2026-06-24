-- QueueLess staff appointment visibility hotfix
-- Apply in Supabase SQL Editor when staff/admin users sign in but see no
-- appointments created by patients.

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view appointments" ON public.appointments;
DROP POLICY IF EXISTS "Staff can manage appointments" ON public.appointments;

CREATE POLICY "Staff can view appointments"
  ON public.appointments
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('staff', 'admin')
    )
  );

CREATE POLICY "Staff can manage appointments"
  ON public.appointments
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('staff', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('staff', 'admin')
    )
  );

GRANT SELECT ON public.appointments TO authenticated;
GRANT UPDATE (
  status,
  cancel_reason,
  cancelled_by,
  cancelled_at,
  checked_in_at,
  called_at,
  started_at,
  completed_at
) ON public.appointments TO authenticated;

GRANT SELECT ON public.appointments_full TO authenticated;

DROP POLICY IF EXISTS "Staff can view profiles" ON public.profiles;

CREATE POLICY "Staff can view profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1
      FROM public.profiles staff_profile
      WHERE staff_profile.id = auth.uid()
        AND staff_profile.role IN ('staff', 'admin')
    )
  );

GRANT SELECT ON public.profiles TO authenticated;

NOTIFY pgrst, 'reload schema';
