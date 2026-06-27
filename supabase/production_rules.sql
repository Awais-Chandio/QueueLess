-- QueueLess Production Rules Schema Upgrade
-- Apply this in the Supabase SQL Editor.

BEGIN;

-- 1. Support 'expired' and 'no_show' statuses in checks
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_status_check;

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
      'cancelled',
      'expired',
      'no_show'
    )
  );

-- 2. Drop and recreate one-active-slot index to include new statuses
DROP INDEX IF EXISTS public.idx_appointments_one_active_per_slot;

CREATE UNIQUE INDEX idx_appointments_one_active_per_slot
  ON public.appointments(center_id, appointment_date, appointment_time)
  WHERE status NOT IN ('cancelled', 'expired', 'no_show');

-- 3. Prevent a user from booking multiple overlapping appointments at the same slot
DROP INDEX IF EXISTS public.idx_appointments_no_user_slot_clash;

CREATE UNIQUE INDEX idx_appointments_no_user_slot_clash
  ON public.appointments(user_id, appointment_date, appointment_time)
  WHERE status NOT IN ('cancelled', 'expired', 'no_show');

-- 4. Create the cleanup function (checks no-show window and expiry duration)
CREATE OR REPLACE FUNCTION public.cleanup_stale_appointments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- A. Mark confirmed appointments that missed their check-in window as 'no_show'
  -- Grace period: 15 minutes after scheduled_at
  UPDATE public.appointments
  SET 
    status = 'no_show',
    notes = CASE 
      WHEN notes IS NULL OR notes = '' THEN 'Auto-marked as No-Show: missed 15-min check-in window'
      ELSE notes || E'\n(Auto-marked as No-Show: missed 15-min check-in window)'
    END
  WHERE status = 'confirmed'
    AND scheduled_at < (now() - interval '15 minutes');

  -- B. Mark active/pending appointments past their duration as 'expired'
  -- Duration: service's avg_duration_mins (default 30 mins) + 15 mins safety buffer
  UPDATE public.appointments
  SET 
    status = 'expired',
    notes = CASE 
      WHEN notes IS NULL OR notes = '' THEN 'Auto-marked as Expired: time slot passed'
      ELSE notes || E'\n(Auto-marked as Expired: time slot passed)'
    END
  WHERE status IN ('pending', 'confirmed', 'checked_in', 'called', 'in_progress')
    AND scheduled_at < (now() - (coalesce((SELECT avg_duration_mins FROM public.services WHERE id = service_id), 30) + 15) * interval '1 minute');
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_stale_appointments() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_appointments() TO authenticated;

-- 5. Create secure cancel appointment RPC function
CREATE OR REPLACE FUNCTION public.cancel_appointment(
  p_appointment_id uuid,
  p_reason text
)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appointment public.appointments%ROWTYPE;
BEGIN
  SELECT * INTO v_appointment FROM public.appointments WHERE id = p_appointment_id FOR UPDATE;
  
  IF NOT FOUND OR v_appointment.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Appointment not found or unauthorized';
  END IF;

  IF v_appointment.status IN ('completed', 'cancelled', 'expired', 'no_show') THEN
    RAISE EXCEPTION 'Cannot cancel an inactive or completed appointment';
  END IF;

  UPDATE public.appointments
  SET
    status = 'cancelled',
    cancel_reason = coalesce(p_reason, 'User requested cancellation'),
    cancelled_by = 'patient',
    cancelled_at = now()
  WHERE id = p_appointment_id
  RETURNING * INTO v_appointment;

  RETURN v_appointment;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_appointment(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_appointment(uuid, text) TO authenticated;

-- 6. Ensure correct column permissions for authenticated users
GRANT SELECT, INSERT ON public.appointments TO authenticated;
GRANT UPDATE(status, checked_in_at) ON public.appointments TO authenticated;

-- 7. Ensure notifications table has type and data columns safely
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS type text DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS data jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE;

UPDATE public.notifications
SET
  type = COALESCE(type, 'general'),
  data = COALESCE(data, '{}'::jsonb)
WHERE type IS NULL OR data IS NULL;

ALTER TABLE public.notifications
  ALTER COLUMN type SET NOT NULL,
  ALTER COLUMN data SET NOT NULL;

COMMIT;

-- Reload Schema cache
NOTIFY pgrst, 'reload schema';
