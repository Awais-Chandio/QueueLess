-- ============================================================
-- QueueLess Database RLS Policy Optimization Patch
-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard)
-- ============================================================

BEGIN;

-- ==========================================
-- 1. Profiles Table Policies
-- ==========================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Staff can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Staff and admin view all profiles" ON public.profiles;

-- Patient own select
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Staff/admin view all profiles (using high-speed, in-memory JWT metadata claims)
CREATE POLICY "Staff and admin view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('staff', 'admin')
  );

-- Keep insert and update policies simple (no changes needed here as they are direct check only)
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);


-- ==========================================
-- 2. Appointments Table Policies
-- ==========================================
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Staff can view appointments" ON public.appointments;
DROP POLICY IF EXISTS "Staff and admin view all appointments" ON public.appointments;

CREATE POLICY "Users can view own appointments"
  ON public.appointments
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Staff and admin view all appointments"
  ON public.appointments
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('staff', 'admin')
  );

DROP POLICY IF EXISTS "Staff can manage appointments" ON public.appointments;
DROP POLICY IF EXISTS "Staff and admin update all appointments" ON public.appointments;

CREATE POLICY "Staff and admin update all appointments"
  ON public.appointments
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('staff', 'admin')
  )
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('staff', 'admin')
  );


-- ==========================================
-- 3. Center Queue Settings Policies
-- ==========================================
ALTER TABLE public.center_queue_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff and admin modify settings" ON public.center_queue_settings;
DROP POLICY IF EXISTS "Authenticated users can update center settings" ON public.center_queue_settings;

CREATE POLICY "Staff and admin modify settings"
  ON public.center_queue_settings
  FOR ALL
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('staff', 'admin')
  )
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('staff', 'admin')
  );


-- ==========================================
-- 4. Queue Updates Policies
-- ==========================================
ALTER TABLE public.queue_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view queue updates" ON public.queue_updates;
DROP POLICY IF EXISTS "Staff and admin manage all queue updates" ON public.queue_updates;

CREATE POLICY "Staff can view queue updates"
  ON public.queue_updates
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('staff', 'admin')
  );

DROP POLICY IF EXISTS "Staff can create queue updates" ON public.queue_updates;

CREATE POLICY "Staff can create queue updates"
  ON public.queue_updates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('staff', 'admin')
  );


-- ==========================================
-- 5. Notifications Policies
-- ==========================================
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can create notifications" ON public.notifications;

CREATE POLICY "Staff can create notifications"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('staff', 'admin')
  );


-- ==========================================
-- 6. Audit Logs Policies
-- ==========================================
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Staff can view audit logs" ON public.audit_logs;

CREATE POLICY "Staff can insert audit logs"
  ON public.audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    staff_user_id = auth.uid()
    AND (auth.jwt() -> 'user_metadata' ->> 'role') IN ('staff', 'admin')
  );

CREATE POLICY "Staff can view audit logs"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('staff', 'admin')
  );

COMMIT;

-- Reload schema cache to apply immediately
NOTIFY pgrst, 'reload schema';

-- Verification output for active policies on profiles table
SELECT 
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'profiles'
ORDER BY policyname;
