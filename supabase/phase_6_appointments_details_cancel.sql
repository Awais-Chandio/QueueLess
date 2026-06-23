-- QueueLess Phase 6: appointment details view and cancel flow.
-- Run in Supabase SQL Editor after Phase 5 appointment creation is working.

-- Step 1: verify appointment rows and required columns.
SELECT *
FROM public.appointments
LIMIT 5;

-- Step 5: verify current status values.
SELECT DISTINCT status
FROM public.appointments;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_status_check'
      AND conrelid = 'public.appointments'::regclass
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_status_check
      CHECK (
        status IN (
          'pending',
          'confirmed',
          'checked_in',
          'called',
          'in_progress',
          'completed',
          'cancelled'
        )
      )
      NOT VALID;
  END IF;
END;
$$;

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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'appointments'
      AND policyname = 'cancel own appointments'
  ) THEN
    CREATE POLICY "cancel own appointments"
      ON public.appointments
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END;
$$;

GRANT UPDATE(status) ON public.appointments TO authenticated;
