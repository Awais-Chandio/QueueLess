-- Phase 7: Realtime queue readiness repair.
-- Run this in Supabase SQL Editor if the Queue Status screen does not receive
-- live current_position, people_ahead, and estimated_wait_mins values.

CREATE TABLE IF NOT EXISTS public.queue_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  current_position integer,
  people_ahead integer NOT NULL DEFAULT 0,
  estimated_wait_mins integer,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.queue_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own queue updates" ON public.queue_updates;
DROP POLICY IF EXISTS "Users can create own queue updates" ON public.queue_updates;
DROP POLICY IF EXISTS "Users can update own queue updates" ON public.queue_updates;

CREATE POLICY "Users can view own queue updates"
  ON public.queue_updates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.appointments
      WHERE appointments.id = queue_updates.appointment_id
        AND appointments.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create own queue updates"
  ON public.queue_updates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.appointments
      WHERE appointments.id = queue_updates.appointment_id
        AND appointments.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own queue updates"
  ON public.queue_updates
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.appointments
      WHERE appointments.id = queue_updates.appointment_id
        AND appointments.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.appointments
      WHERE appointments.id = queue_updates.appointment_id
        AND appointments.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.queue_updates TO authenticated;

CREATE INDEX IF NOT EXISTS idx_queue_updates_appointment_created_at
  ON public.queue_updates(appointment_id, created_at DESC);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.queue_updates;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

CREATE OR REPLACE VIEW public.appointments_full
WITH (security_invoker = true)
AS
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
  appointments.center_id,
  appointments.service_id,
  service_centers.name AS center_name,
  services.name AS service_name,
  appointments.scheduled_at,
  appointments.status,
  appointments.token_number,
  appointments.notes,
  appointments.created_at,
  COALESCE(
    latest_queue_updates.estimated_wait_mins,
    appointments.estimated_wait_mins
  ) AS estimated_wait_mins,
  latest_queue_updates.current_position,
  latest_queue_updates.people_ahead,
  latest_queue_updates.queue_status
FROM public.appointments
LEFT JOIN public.service_centers
  ON service_centers.id = appointments.center_id
LEFT JOIN public.services
  ON services.id = appointments.service_id
LEFT JOIN latest_queue_updates
  ON latest_queue_updates.appointment_id = appointments.id;

GRANT SELECT ON public.appointments_full TO authenticated;
