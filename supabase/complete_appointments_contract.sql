-- QueueLess appointments contract repair.
-- Run this in Supabase SQL Editor after the scheduled_at migration.

CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  center_id uuid NOT NULL REFERENCES public.service_centers(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  token_number integer,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS token_number integer;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS estimated_wait_mins integer,
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.appointments
  ALTER COLUMN scheduled_at SET NOT NULL;

ALTER TABLE public.appointments
  ALTER COLUMN status SET DEFAULT 'pending';

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
      CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled'))
      NOT VALID;
  END IF;
END;
$$;

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

REVOKE ALL ON public.appointments FROM anon, authenticated;
GRANT SELECT, INSERT ON public.appointments TO authenticated;
GRANT UPDATE(status) ON public.appointments TO authenticated;

CREATE INDEX IF NOT EXISTS idx_appointments_user_id
  ON public.appointments(user_id);

CREATE INDEX IF NOT EXISTS idx_appointments_user_scheduled_at
  ON public.appointments(user_id, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_appointments_center_scheduled_at_token
  ON public.appointments(center_id, scheduled_at, token_number);

CREATE OR REPLACE FUNCTION public.assign_appointment_token_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.token_number IS NULL THEN
    SELECT COALESCE(MAX(token_number), 0) + 1
    INTO NEW.token_number
    FROM public.appointments
    WHERE center_id = NEW.center_id
      AND (scheduled_at AT TIME ZONE 'UTC')::date =
        (NEW.scheduled_at AT TIME ZONE 'UTC')::date;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_appointment_token_number_trigger
  ON public.appointments;

CREATE TRIGGER assign_appointment_token_number_trigger
  BEFORE INSERT ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_appointment_token_number();

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

DO $$
BEGIN
  IF to_regclass('public.bookings') IS NOT NULL THEN
    REVOKE ALL ON public.bookings FROM anon, authenticated;
    COMMENT ON TABLE public.bookings IS
      'Deprecated. QueueLess uses public.appointments as the single source of truth.';
  END IF;
END;
$$;
