-- ========================================================================
-- QueueLess Comprehensive Production Fixes
-- Includes:
-- 1. appointments_status_check constraint update (adds 'called', 'expired', 'no_show', 'skipped')
-- 2. FCM token syncing RPC (update_user_fcm_token)
-- 3. center_queue_settings table migration & column fix (appointment_date)
-- 4. Robust sync_center_queue_after_appointment_change trigger with exception safety
-- 5. Expanded call_appointment RPC allowing 'checked_in', 'confirmed', 'pending'
-- ========================================================================

-- 0. Update appointments_status_check constraint safely
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
      'no_show',
      'skipped'
    )
  );

-- 1. Ensure fcm_token column exists on profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS fcm_token TEXT;

-- RPC for updating FCM token reliably with SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.update_user_fcm_token(
  p_token text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.profiles
  SET fcm_token = p_token,
      updated_at = now()
  WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_user_fcm_token(text) TO authenticated;

-- 2. Ensure center_queue_settings has appointment_date column and correct primary key
CREATE TABLE IF NOT EXISTS public.center_queue_settings (
  center_id uuid NOT NULL REFERENCES public.service_centers(id) ON DELETE CASCADE,
  appointment_date date NOT NULL DEFAULT CURRENT_DATE,
  is_on_break boolean DEFAULT false,
  break_start timestamptz,
  break_end timestamptz,
  current_token integer DEFAULT 0,
  average_consultation_time numeric(10,2) DEFAULT 10.0,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (center_id, appointment_date)
);

ALTER TABLE public.center_queue_settings
  ADD COLUMN IF NOT EXISTS appointment_date date NOT NULL DEFAULT CURRENT_DATE;

-- Safely re-establish composite primary key (center_id, appointment_date)
DO $$
BEGIN
  BEGIN
    ALTER TABLE public.center_queue_settings DROP CONSTRAINT IF EXISTS center_queue_settings_pkey;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    ALTER TABLE public.center_queue_settings ADD PRIMARY KEY (center_id, appointment_date);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;

-- Enable RLS & policies on center_queue_settings
ALTER TABLE public.center_queue_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can select center settings" ON public.center_queue_settings;
CREATE POLICY "Authenticated users can select center settings"
  ON public.center_queue_settings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can update center settings" ON public.center_queue_settings;
CREATE POLICY "Authenticated users can update center settings"
  ON public.center_queue_settings FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 3. Exception-safe sync_center_queue_after_appointment_change trigger function
CREATE OR REPLACE FUNCTION public.sync_center_queue_after_appointment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue_date date;
BEGIN
  IF NEW.center_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_queue_date := COALESCE(NEW.appointment_date, (NEW.scheduled_at AT TIME ZONE 'UTC')::date, CURRENT_DATE);

  -- Ensure row exists in center_queue_settings safely
  INSERT INTO public.center_queue_settings (center_id, appointment_date, current_token, updated_at)
  VALUES (NEW.center_id, v_queue_date, COALESCE(NEW.token_number, 0), now())
  ON CONFLICT (center_id, appointment_date) DO NOTHING;

  IF NEW.status IN ('called', 'in_progress') AND NEW.token_number IS NOT NULL THEN
    UPDATE public.center_queue_settings
    SET
      current_token = GREATEST(current_token, NEW.token_number),
      updated_at = now()
    WHERE center_id = NEW.center_id
      AND appointment_date = v_queue_date;
  END IF;

  IF NEW.status = 'completed'
    AND NEW.duration_minutes IS NOT NULL
    AND (
      TG_OP = 'INSERT'
      OR OLD.status IS DISTINCT FROM NEW.status
      OR OLD.duration_minutes IS DISTINCT FROM NEW.duration_minutes
    )
  THEN
    BEGIN
      PERFORM public.recalculate_center_average(NEW.center_id, v_queue_date);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  -- Refresh queue positions
  BEGIN
    PERFORM public.refresh_live_queue(NEW.center_id, v_queue_date);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'sync_center_queue_after_appointment_change warning: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_doctor_queue_after_appointment_change_trigger ON public.appointments;
DROP TRIGGER IF EXISTS sync_center_queue_after_appointment_change_trigger ON public.appointments;

CREATE TRIGGER sync_center_queue_after_appointment_change_trigger
  AFTER INSERT OR UPDATE OF status, duration_minutes, token_number
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_center_queue_after_appointment_change();

-- 4. Expanded call_appointment RPC Function
CREATE OR REPLACE FUNCTION public.call_appointment(
  p_appointment_id uuid
)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  called_appointment public.appointments%ROWTYPE;
BEGIN
  SELECT *
  INTO called_appointment
  FROM public.appointments
  WHERE id = p_appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  IF called_appointment.status NOT IN ('confirmed', 'checked_in', 'pending') THEN
    RAISE EXCEPTION 'Appointment cannot be called from current status: %', called_appointment.status;
  END IF;

  UPDATE public.appointments
  SET
    status = 'called',
    called_at = now()
  WHERE id = p_appointment_id
  RETURNING *
  INTO called_appointment;

  RETURN called_appointment;
END;
$$;

GRANT EXECUTE ON FUNCTION public.call_appointment(uuid) TO authenticated;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
