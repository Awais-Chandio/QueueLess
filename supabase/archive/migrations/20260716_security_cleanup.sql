-- Migration: Security Cleanup - Revoke Anon Privileges and Tighten RLS Policies
-- Created: 2026-07-16

-- ============================================================================
-- 1. Revoke Function Execution Privileges from Anon and Grant to Authenticated
-- ============================================================================

-- get_doctor_availability(uuid)
REVOKE EXECUTE ON FUNCTION public.get_doctor_availability(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_doctor_availability(uuid) TO authenticated;

-- get_doctor_today_appointments(uuid)
REVOKE EXECUTE ON FUNCTION public.get_doctor_today_appointments(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_doctor_today_appointments(uuid) TO authenticated;

-- get_doctor_schedule(uuid)
REVOKE EXECUTE ON FUNCTION public.get_doctor_schedule(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_doctor_schedule(uuid) TO authenticated;

-- get_doctor_income_summary(uuid)
REVOKE EXECUTE ON FUNCTION public.get_doctor_income_summary(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_doctor_income_summary(uuid) TO authenticated;

-- get_doctor_recent_patients(uuid)
REVOKE EXECUTE ON FUNCTION public.get_doctor_recent_patients(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_doctor_recent_patients(uuid) TO authenticated;

-- get_doctor_queue_snapshot(uuid, date)
REVOKE EXECUTE ON FUNCTION public.get_doctor_queue_snapshot(uuid, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_doctor_queue_snapshot(uuid, date) TO authenticated;

-- get_doctors_availability_batch(uuid[])
REVOKE EXECUTE ON FUNCTION public.get_doctors_availability_batch(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_doctors_availability_batch(uuid[]) TO authenticated;


-- ============================================================================
-- 2. Create public.is_staff() Helper Function (SECURITY DEFINER)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  RETURN (v_role = 'staff');
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;


-- ============================================================================
-- 3. Replace auth.jwt()->'user_metadata' RLS Checks with profiles role checks
-- ============================================================================

-- profiles table
DROP POLICY IF EXISTS "Staff and admin view all profiles" ON public.profiles;
CREATE POLICY "Staff and admin view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin() OR public.is_staff()
  );

-- center_queue_settings table
DROP POLICY IF EXISTS "Staff and admin modify settings" ON public.center_queue_settings;
CREATE POLICY "Staff and admin modify settings"
  ON public.center_queue_settings
  FOR ALL
  TO authenticated
  USING (
    public.is_admin() OR public.is_staff()
  )
  WITH CHECK (
    public.is_admin() OR public.is_staff()
  );

-- queue_updates table
DROP POLICY IF EXISTS "Staff can view queue updates" ON public.queue_updates;
CREATE POLICY "Staff can view queue updates"
  ON public.queue_updates
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin() OR public.is_staff()
  );

DROP POLICY IF EXISTS "Staff can create queue updates" ON public.queue_updates;
CREATE POLICY "Staff can create queue updates"
  ON public.queue_updates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin() OR public.is_staff()
  );

-- notifications table
DROP POLICY IF EXISTS "Staff can create notifications" ON public.notifications;
CREATE POLICY "Staff can create notifications"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin() OR public.is_staff()
  );

-- audit_logs table
DROP POLICY IF EXISTS "Staff can insert audit logs" ON public.audit_logs;
CREATE POLICY "Staff can insert audit logs"
  ON public.audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    staff_user_id = auth.uid()
    AND (public.is_admin() OR public.is_staff())
  );

DROP POLICY IF EXISTS "Staff can view audit logs" ON public.audit_logs;
CREATE POLICY "Staff can view audit logs"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin() OR public.is_staff()
  );
