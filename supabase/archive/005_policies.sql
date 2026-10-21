-- 005_policies.sql

-- Enable RLS on core tables
ALTER TABLE public.center_queue_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 1. Center Queue Settings Policies
DROP POLICY IF EXISTS "Enable read access for all users" ON public.center_queue_settings;
CREATE POLICY "Enable read access for all users" ON public.center_queue_settings
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "Staff and admin modify settings" ON public.center_queue_settings;
CREATE POLICY "Staff and admin modify settings" ON public.center_queue_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('staff', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('staff', 'admin')
    )
  );

-- 2. Appointments Policies
DROP POLICY IF EXISTS "Users can view own appointments" ON public.appointments;
CREATE POLICY "Users can view own appointments" ON public.appointments
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own appointments" ON public.appointments;
CREATE POLICY "Users can create own appointments" ON public.appointments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "cancel own appointments" ON public.appointments;
CREATE POLICY "cancel own appointments" ON public.appointments
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Staff and admin view all appointments" ON public.appointments;
CREATE POLICY "Staff and admin view all appointments" ON public.appointments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('staff', 'admin')
    )
  );

DROP POLICY IF EXISTS "Staff and admin update all appointments" ON public.appointments;
CREATE POLICY "Staff and admin update all appointments" ON public.appointments
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('staff', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('staff', 'admin')
    )
  );

-- 3. Profiles Policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Staff and admin view all profiles" ON public.profiles;
CREATE POLICY "Staff and admin view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('staff', 'admin')
  );

-- 4. Queue Updates Policies
DROP POLICY IF EXISTS "Users can view own queue updates" ON public.queue_updates;
CREATE POLICY "Users can view own queue updates" ON public.queue_updates
  FOR SELECT TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM public.appointments
      WHERE appointments.id = queue_updates.appointment_id
        AND (appointments.user_id = auth.uid() OR auth.uid() IS NULL)
    )
  );

DROP POLICY IF EXISTS "Staff and admin manage all queue updates" ON public.queue_updates;
CREATE POLICY "Staff and admin manage all queue updates" ON public.queue_updates
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('staff', 'admin')
    )
  );

-- 5. Notifications Policies
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "System can insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);
