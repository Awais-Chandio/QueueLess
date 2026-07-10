-- ============================================================
-- QueueLess Staff Dashboard + Queue Notifications Migration
-- Idempotent patch for columns/tables missing from earlier migrations.
-- Run in Supabase SQL Editor after existing QueueLess migrations.
-- ============================================================

-- 1. Appointment workflow fields used by staff actions.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'client';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('client', 'staff', 'admin'));

DROP POLICY IF EXISTS "Staff can view profiles" ON public.profiles;

CREATE POLICY "Staff can view profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR public.get_user_role() IN ('staff', 'admin')
  );

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_status_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_status_check
  CHECK (
    status IN (
      'pending',
      'confirmed',
      'checked_in',
      'in_progress',
      'completed',
      'cancelled'
    )
  );

CREATE INDEX IF NOT EXISTS idx_appointments_status_scheduled_at
  ON public.appointments(status, scheduled_at);

-- 2. Notifications table exists in production_upgrade.sql; add missing fields safely.
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Staff can create notifications" ON public.notifications;

CREATE POLICY "Users can view own notifications"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Staff can create notifications"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('staff', 'admin')
    )
  );

CREATE INDEX IF NOT EXISTS idx_notifications_user_created_at
  ON public.notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id)
  WHERE is_read = false;

-- 3. Audit log for staff appointment actions.
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  action text NOT NULL,
  old_status text,
  new_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Staff can view audit logs" ON public.audit_logs;

CREATE POLICY "Staff can insert audit logs"
  ON public.audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    staff_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('staff', 'admin')
    )
  );

CREATE POLICY "Staff can view audit logs"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('staff', 'admin')
    )
  );

CREATE INDEX IF NOT EXISTS idx_audit_logs_appointment_created_at
  ON public.audit_logs(appointment_id, created_at DESC);

-- 4. Staff/admin appointment and queue-update permissions.
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

GRANT SELECT, UPDATE (
  status,
  cancel_reason,
  cancelled_by,
  cancelled_at,
  checked_in_at,
  started_at,
  completed_at
) ON public.appointments TO authenticated;

DROP POLICY IF EXISTS "Staff can create queue updates" ON public.queue_updates;

CREATE POLICY "Staff can create queue updates"
  ON public.queue_updates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('staff', 'admin')
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.queue_updates TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;

-- 5. Keep realtime publications idempotently aligned.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_updates;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;

-- 6. Refresh full appointment view with staff workflow fields.
CREATE OR REPLACE VIEW public.appointments_full AS
WITH latest_queue_updates AS (
  SELECT DISTINCT ON (queue_updates.appointment_id)
    queue_updates.appointment_id,
    queue_updates.current_position,
    queue_updates.people_ahead,
    queue_updates.estimated_wait_mins,
    queue_updates.status AS queue_status
  FROM public.queue_updates
  ORDER BY queue_updates.appointment_id, queue_updates.created_at DESC
)
SELECT
  appointments.id,
  appointments.user_id,
  profiles.full_name AS patient_name,
  appointments.center_id,
  appointments.service_id,
  service_centers.name AS center_name,
  services.name AS service_name,
  appointments.scheduled_at,
  appointments.status,
  appointments.token_number,
  appointments.notes,
  appointments.cancel_reason,
  appointments.cancelled_by,
  appointments.cancelled_at,
  appointments.checked_in_at,
  appointments.started_at,
  appointments.completed_at,
  appointments.created_at,
  COALESCE(
    latest_queue_updates.estimated_wait_mins,
    appointments.estimated_wait_mins
  ) AS estimated_wait_mins,
  latest_queue_updates.current_position,
  latest_queue_updates.people_ahead,
  latest_queue_updates.queue_status
FROM public.appointments
LEFT JOIN public.profiles
  ON profiles.id = appointments.user_id
LEFT JOIN public.service_centers
  ON service_centers.id = appointments.center_id
LEFT JOIN public.services
  ON services.id = appointments.service_id
LEFT JOIN latest_queue_updates
  ON latest_queue_updates.appointment_id = appointments.id;

GRANT SELECT ON public.appointments_full TO authenticated;
