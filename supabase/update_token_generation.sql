-- ========================================================================
-- SQL Migration: Update Token Assignment to be strictly Center-Specific 
-- and restart daily from 1.
--
-- Run this script in the Supabase SQL Editor.
-- ========================================================================

-- 1. Redefine the trigger function to assign token numbers per center + date
CREATE OR REPLACE FUNCTION public.assign_appointment_token_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_queue_date date;
BEGIN
  -- Determine the date part of the scheduled time
  v_queue_date := public.queue_appointment_date(
    NEW.appointment_date,
    NEW.scheduled_at
  );

  NEW.appointment_date := v_queue_date;

  -- Generate token number on insert if it's null
  IF TG_OP = 'INSERT' AND NEW.token_number IS NULL THEN
    -- Lock concurrently on center_id and queue_date to prevent race conditions (duplicate tokens)
    PERFORM pg_advisory_xact_lock(hashtext(NEW.center_id::text || ':' || v_queue_date::text));

    -- Get the max token number for this center on this specific date and add 1
    SELECT COALESCE(MAX(token_number), 0) + 1
    INTO NEW.token_number
    FROM public.appointments
    WHERE center_id = NEW.center_id
      AND appointment_date = v_queue_date;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Force schema reload to refresh PostgREST views
NOTIFY pgrst, 'reload schema';
