-- QueueLess Profiles RLS Recursion Fix
-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard)
-- to resolve 'infinite recursion detected in policy for relation "profiles"'.

-- 1. Re-create the secure get_user_role function with SECURITY DEFINER
-- This ensures that it runs as postgres (superuser) and bypasses RLS,
-- preventing any infinite loops when evaluating profile policies.
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- 2. Drop the recursive policy and re-create it safely
DROP POLICY IF EXISTS "Staff can view profiles" ON public.profiles;

CREATE POLICY "Staff can view profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR public.get_user_role() IN ('staff', 'admin')
  );

-- 3. Notify Schema Cache reload to apply changes immediately
NOTIFY pgrst, 'reload schema';
