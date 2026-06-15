-- QueueLess appointments contract repair.
-- Run this in Supabase SQL Editor after the scheduled_at migration.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS token_number integer;

ALTER TABLE public.appointments
  ALTER COLUMN scheduled_at SET NOT NULL;

ALTER TABLE public.appointments
  ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Users can create own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Users can update own appointments" ON public.appointments;

CREATE POLICY "Users can view own appointments"
  ON public.appointments
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own appointments"
  ON public.appointments
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own appointments"
  ON public.appointments
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.appointments TO authenticated;

CREATE INDEX IF NOT EXISTS idx_appointments_user_id
  ON public.appointments(user_id);

CREATE INDEX IF NOT EXISTS idx_appointments_user_scheduled_at
  ON public.appointments(user_id, scheduled_at);

CREATE OR REPLACE VIEW public.appointments_full
WITH (security_invoker = true)
AS
SELECT
  appointments.id,
  appointments.user_id,
  appointments.center_id,
  appointments.service_id,
  service_centers.name AS center_name,
  services.name AS service_name,
  appointments.scheduled_at,
  appointments.status,
  appointments.token_number,
  appointments.created_at
FROM public.appointments
JOIN public.service_centers
  ON service_centers.id = appointments.center_id
JOIN public.services
  ON services.id = appointments.service_id;

GRANT SELECT ON public.appointments_full TO authenticated;
