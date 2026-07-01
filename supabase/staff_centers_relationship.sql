-- Migration: Associate Staff with Service Centers and Secure RLS
-- Run this script in the Supabase SQL Editor.

-- 1. Add center_id column to profiles table referencing service_centers
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS center_id UUID REFERENCES public.service_centers(id) ON DELETE SET NULL;

-- 2. Drop existing RLS policies on appointments table
DROP POLICY IF EXISTS "Staff can view appointments" ON public.appointments;
DROP POLICY IF EXISTS "Staff can manage appointments" ON public.appointments;

-- 3. Create updated SELECT policy on appointments table:
-- - Clients can see their own appointments.
-- - Admins can see all appointments.
-- - Staff can only see appointments of their assigned center.
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
        AND (
          profiles.role = 'admin'
          OR (profiles.role = 'staff' AND appointments.center_id = profiles.center_id)
        )
    )
  );

-- 4. Create updated UPDATE policy on appointments table:
-- - Admins can manage all appointments.
-- - Staff can only manage appointments of their assigned center.
CREATE POLICY "Staff can manage appointments"
  ON public.appointments
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND (
          profiles.role = 'admin'
          OR (profiles.role = 'staff' AND appointments.center_id = profiles.center_id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND (
          profiles.role = 'admin'
          OR (profiles.role = 'staff' AND appointments.center_id = profiles.center_id)
        )
    )
  );

-- 5. Force schema reload to refresh PostgREST views
NOTIFY pgrst, 'reload schema';
