-- QueueLess Staff Permissions Fix
-- Run this in Supabase SQL Editor to fix infinite recursion and visibility issues for staff

-- 1. Create a secure function to get the current user's role without triggering RLS
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- 2. Fix the "Staff can view profiles" policy to prevent infinite recursion
DROP POLICY IF EXISTS "Staff can view profiles" ON public.profiles;

CREATE POLICY "Staff can view profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR public.get_user_role() IN ('staff', 'admin')
  );

-- 3. Fix appointment policies to use the secure function
DROP POLICY IF EXISTS "Staff can view appointments" ON public.appointments;
DROP POLICY IF EXISTS "Staff can manage appointments" ON public.appointments;

CREATE POLICY "Staff can view appointments"
  ON public.appointments
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.get_user_role() IN ('staff', 'admin')
  );

CREATE POLICY "Staff can manage appointments"
  ON public.appointments
  FOR UPDATE
  TO authenticated
  USING (
    public.get_user_role() IN ('staff', 'admin')
  )
  WITH CHECK (
    public.get_user_role() IN ('staff', 'admin')
  );

-- 4. Grant staff access to VIEW queue updates
DROP POLICY IF EXISTS "Staff can view queue updates" ON public.queue_updates;

CREATE POLICY "Staff can view queue updates"
  ON public.queue_updates
  FOR SELECT
  TO authenticated
  USING (
    public.get_user_role() IN ('staff', 'admin')
  );

-- Also fix staff being able to CREATE queue updates using the secure function
DROP POLICY IF EXISTS "Staff can create queue updates" ON public.queue_updates;

CREATE POLICY "Staff can create queue updates"
  ON public.queue_updates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_user_role() IN ('staff', 'admin')
  );

-- 5. Ensure the view uses security_invoker = true so it respects these policies
ALTER VIEW public.appointments_full SET (security_invoker = true);

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
