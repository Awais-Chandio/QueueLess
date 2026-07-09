-- 003_functions.sql

-- 1. Drop deprecated functions to clean up schema and avoid signature conflicts
DROP FUNCTION IF EXISTS public.queue_scope_doctor_id(uuid, uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.recalculate_doctor_average(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.sync_doctor_queue_after_appointment_change() CASCADE;
DROP FUNCTION IF EXISTS public.set_doctor_break(uuid, timestamptz, timestamptz, boolean) CASCADE;
DROP FUNCTION IF EXISTS public.get_doctor_queue_snapshot(uuid, date) CASCADE;
DROP FUNCTION IF EXISTS public.recalculate_center_average(uuid, date) CASCADE;

-- Drop old signatures of get_next_token / get_current_token
DROP FUNCTION IF EXISTS public.get_next_token(uuid, uuid, uuid, date) CASCADE;
DROP FUNCTION IF EXISTS public.get_current_token(uuid, uuid, uuid, date) CASCADE;
DROP FUNCTION IF EXISTS public.people_ahead(integer, integer) CASCADE;

-- Drop current active signatures before recreation to avoid mismatch errors
DROP FUNCTION IF EXISTS public.get_next_token(uuid, date) CASCADE;
DROP FUNCTION IF EXISTS public.get_current_token(uuid, date) CASCADE;
DROP FUNCTION IF EXISTS public.people_ahead(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_center_queue_snapshot(uuid, date) CASCADE;
DROP FUNCTION IF EXISTS public.get_appointment_queue_snapshot(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.call_appointment(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.start_service(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.complete_appointment(uuid, integer) CASCADE;
DROP FUNCTION IF EXISTS public.confirm_appointment(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.set_center_break(uuid, date, timestamptz, timestamptz, boolean) CASCADE;
DROP FUNCTION IF EXISTS public.update_center_average_consultation_time(uuid, date, numeric) CASCADE;
DROP FUNCTION IF EXISTS public.cancel_appointment(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_stale_appointments() CASCADE;
DROP FUNCTION IF EXISTS public.trigger_queue_notification() CASCADE;
DROP FUNCTION IF EXISTS public.assign_appointment_token_number() CASCADE;
DROP FUNCTION IF EXISTS public.sync_center_queue_after_appointment_change() CASCADE;

-- 2. Define active Center-scoped queue functions

-- RPC: get_next_token (transaction-safe atomic increment)
CREATE OR REPLACE FUNCTION public.get_next_token(
  p_center_id uuid,
  p_appointment_date date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_token integer;
BEGIN
  IF p_center_id IS NULL OR p_appointment_date IS NULL THEN
    RAISE EXCEPTION 'center_id and appointment_date required';
  END IF;
  
  -- Advisory lock to serialize token allocation for the specific center + date
  PERFORM pg_advisory_xact_lock(hashtext(p_center_id::text || ':' || p_appointment_date::text));
  
  INSERT INTO public.center_daily_tokens (center_id, appointment_date, last_token_number, updated_at)
  VALUES (p_center_id, p_appointment_date, 1, now())
  ON CONFLICT (center_id, appointment_date)
  DO UPDATE SET last_token_number = public.center_daily_tokens.last_token_number + 1, updated_at = now()
  RETURNING last_token_number INTO v_next_token;
  
  RETURN v_next_token;
END;
$$;

-- RPC: get_current_token (currently serving token)
CREATE OR REPLACE FUNCTION public.get_current_token(
  p_center_id uuid,
  p_queue_date date DEFAULT CURRENT_DATE
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_token integer;
  v_settings_token integer;
BEGIN
  IF p_center_id IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Get current token from settings
  SELECT current_token INTO v_settings_token
  FROM public.center_queue_settings
  WHERE center_id::text = p_center_id::text AND appointment_date = p_queue_date;

  -- Get current token from highest active appointment status (called/in_progress)
  SELECT COALESCE(MAX(token_number), 0) INTO v_current_token
  FROM public.appointments
  WHERE center_id::text = p_center_id::text
    AND appointment_date = p_queue_date
    AND status IN ('called', 'in_progress');
    
  RETURN GREATEST(COALESCE(v_settings_token, 0), COALESCE(v_current_token, 0));
END;
$$;

-- RPC: people_ahead
CREATE OR REPLACE FUNCTION public.people_ahead(
  p_appointment_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appointment public.appointments%ROWTYPE;
  v_current_token integer;
BEGIN
  SELECT * INTO v_appointment
  FROM public.appointments
  WHERE id = p_appointment_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  v_current_token := public.get_current_token(v_appointment.center_id, v_appointment.appointment_date);
  RETURN GREATEST(COALESCE(v_appointment.token_number, 0) - v_current_token, 0);
END;
$$;

-- RPC: get_center_queue_snapshot
CREATE OR REPLACE FUNCTION public.get_center_queue_snapshot(
  p_center_id uuid,
  p_queue_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.center_queue_settings%ROWTYPE;
  v_current_token integer;
  v_next_token integer;
  v_is_on_break boolean;
BEGIN
  -- Ensure settings row exists for the day
  INSERT INTO public.center_queue_settings (center_id, appointment_date)
  VALUES (p_center_id, p_queue_date)
  ON CONFLICT (center_id, appointment_date) DO NOTHING;

  SELECT * INTO v_settings
  FROM public.center_queue_settings
  WHERE center_id::text = p_center_id::text AND appointment_date = p_queue_date;

  v_current_token := public.get_current_token(p_center_id, p_queue_date);

  SELECT COALESCE(MAX(token_number), 0) + 1 INTO v_next_token
  FROM public.appointments
  WHERE center_id::text = p_center_id::text AND appointment_date = p_queue_date;

  v_is_on_break := COALESCE(v_settings.is_on_break, false)
    OR (v_settings.break_start IS NOT NULL AND v_settings.break_start <= now() AND (v_settings.break_end IS NULL OR v_settings.break_end > now()));

  RETURN jsonb_build_object(
    'center_id', p_center_id,
    'queue_date', p_queue_date,
    'current_token', v_current_token,
    'next_token', v_next_token,
    'doctor_average_time', COALESCE(v_settings.average_consultation_time, 10.0),
    'average_consultation_time', COALESCE(v_settings.average_consultation_time, 10.0),
    'is_on_break', v_is_on_break,
    'break_start', v_settings.break_start,
    'break_end', v_settings.break_end
  );
END;
$$;

-- RPC: get_appointment_queue_snapshot
CREATE OR REPLACE FUNCTION public.get_appointment_queue_snapshot(
  p_appointment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appointment public.appointments%ROWTYPE;
  v_center_snapshot jsonb;
  v_current_token integer;
  v_average numeric(10, 2);
  v_people_ahead integer;
  v_estimated_wait integer;
BEGIN
  SELECT * INTO v_appointment
  FROM public.appointments
  WHERE id = p_appointment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  v_center_snapshot := public.get_center_queue_snapshot(v_appointment.center_id, v_appointment.appointment_date);
  v_current_token := COALESCE((v_center_snapshot->>'current_token')::integer, 0);
  v_average := COALESCE((v_center_snapshot->>'average_consultation_time')::numeric, 10.0);
  v_people_ahead := GREATEST(COALESCE(v_appointment.token_number, 0) - v_current_token, 0);
  v_estimated_wait := CEIL(v_people_ahead * v_average)::integer;

  RETURN v_center_snapshot || jsonb_build_object(
    'appointment_id', v_appointment.id,
    'your_token', v_appointment.token_number,
    'token_number', v_appointment.token_number,
    'queue_position', CASE WHEN v_appointment.status IN ('confirmed', 'checked_in') THEN GREATEST(v_people_ahead, 1) ELSE 0 END,
    'current_position', CASE WHEN v_appointment.status IN ('confirmed', 'checked_in') THEN GREATEST(v_people_ahead, 1) ELSE 0 END,
    'people_ahead', v_people_ahead,
    'estimated_wait_time', v_estimated_wait,
    'estimated_wait_mins', v_estimated_wait,
    'status', CASE
      WHEN (v_center_snapshot->>'is_on_break')::boolean THEN 'doctor_on_break'
      WHEN v_appointment.status IN ('called', 'in_progress') THEN 'called'
      WHEN v_appointment.status = 'checked_in' THEN 'checked_in'
      WHEN v_appointment.status = 'confirmed' THEN 'waiting'
      ELSE v_appointment.status
    END
  );
END;
$$;

-- RPC: call_appointment
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
  SELECT * INTO called_appointment
  FROM public.appointments
  WHERE id = p_appointment_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  IF called_appointment.status NOT IN ('confirmed', 'checked_in', 'pending') THEN
    RAISE EXCEPTION 'Cannot call appointment from status: %', called_appointment.status;
  END IF;

  UPDATE public.appointments
  SET status = 'called', called_at = now()
  WHERE id = p_appointment_id
  RETURNING * INTO called_appointment;

  RETURN called_appointment;
END;
$$;

-- RPC: start_service
CREATE OR REPLACE FUNCTION public.start_service(
  p_appointment_id uuid
)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_appointment public.appointments%ROWTYPE;
BEGIN
  SELECT * INTO target_appointment
  FROM public.appointments
  WHERE id = p_appointment_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  UPDATE public.appointments
  SET status = 'in_progress', started_at = COALESCE(started_at, now()), called_at = COALESCE(called_at, now())
  WHERE id = p_appointment_id
  RETURNING * INTO target_appointment;

  RETURN target_appointment;
END;
$$;

-- RPC: complete_appointment
CREATE OR REPLACE FUNCTION public.complete_appointment(
  p_appointment_id uuid,
  p_duration_minutes integer DEFAULT NULL
)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_appointment public.appointments%ROWTYPE;
  v_duration integer;
BEGIN
  SELECT * INTO target_appointment
  FROM public.appointments
  WHERE id = p_appointment_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;
  
  IF p_duration_minutes IS NOT NULL THEN
    v_duration := p_duration_minutes;
  ELSIF target_appointment.started_at IS NOT NULL THEN
    v_duration := GREATEST(1, EXTRACT(EPOCH FROM (now() - target_appointment.started_at))::integer / 60);
  ELSE
    v_duration := 15;
  END IF;

  UPDATE public.appointments
  SET status = 'completed', completed_at = now(), duration_minutes = v_duration
  WHERE id = p_appointment_id
  RETURNING * INTO target_appointment;

  RETURN target_appointment;
END;
$$;

-- RPC: confirm_appointment
CREATE OR REPLACE FUNCTION public.confirm_appointment(
  p_appointment_id uuid
)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_appointment public.appointments%ROWTYPE;
BEGIN
  UPDATE public.appointments
  SET status = 'confirmed'
  WHERE id = p_appointment_id
  RETURNING * INTO target_appointment;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;
  
  RETURN target_appointment;
END;
$$;

-- RPC: set_center_break
CREATE OR REPLACE FUNCTION public.set_center_break(
  p_center_id uuid,
  p_queue_date date,
  p_break_start timestamptz,
  p_break_end timestamptz,
  p_is_on_break boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result public.center_queue_settings%ROWTYPE;
BEGIN
  INSERT INTO public.center_queue_settings (center_id, appointment_date, break_start, break_end, is_on_break, updated_at)
  VALUES (p_center_id, p_queue_date, p_break_start, p_break_end, p_is_on_break, now())
  ON CONFLICT (center_id, appointment_date)
  DO UPDATE SET break_start = EXCLUDED.break_start, break_end = EXCLUDED.break_end, is_on_break = EXCLUDED.is_on_break, updated_at = now()
  RETURNING * INTO v_result;

  RETURN to_jsonb(v_result);
END;
$$;

-- RPC: update_center_average_consultation_time
CREATE OR REPLACE FUNCTION public.update_center_average_consultation_time(
  p_center_id uuid,
  p_queue_date date,
  p_avg_mins numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result public.center_queue_settings%ROWTYPE;
BEGIN
  INSERT INTO public.center_queue_settings (center_id, appointment_date, average_consultation_time, updated_at)
  VALUES (p_center_id, p_queue_date, p_avg_mins, now())
  ON CONFLICT (center_id, appointment_date)
  DO UPDATE SET average_consultation_time = EXCLUDED.average_consultation_time, updated_at = now()
  RETURNING * INTO v_result;

  RETURN to_jsonb(v_result);
END;
$$;

-- RPC: cancel_appointment
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
  SELECT * INTO v_appointment
  FROM public.appointments
  WHERE id = p_appointment_id FOR UPDATE;
  
  IF NOT FOUND OR v_appointment.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Appointment not found or unauthorized';
  END IF;

  IF v_appointment.status IN ('completed', 'cancelled', 'expired', 'no_show') THEN
    RAISE EXCEPTION 'Cannot cancel an inactive or completed appointment';
  END IF;

  UPDATE public.appointments
  SET
    status = 'cancelled',
    cancel_reason = COALESCE(p_reason, 'User requested cancellation'),
    cancelled_by = 'patient',
    cancelled_at = now()
  WHERE id = p_appointment_id
  RETURNING * INTO v_appointment;

  RETURN v_appointment;
END;
$$;

-- Function: cleanup_stale_appointments
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
  -- Duration: service's duration_minutes (default 30 mins) + 15 mins safety buffer
  UPDATE public.appointments
  SET 
    status = 'expired',
    notes = CASE 
      WHEN notes IS NULL OR notes = '' THEN 'Auto-marked as Expired: time slot passed'
      ELSE notes || E'\n(Auto-marked as Expired: time slot passed)'
    END
  WHERE status IN ('pending', 'confirmed', 'checked_in', 'called', 'in_progress')
    AND scheduled_at < (now() - (COALESCE((SELECT duration_minutes FROM public.services WHERE id = service_id), 30) + 15) * interval '1 minute');
END;
$$;

-- Function: trigger_queue_notification
CREATE OR REPLACE FUNCTION public.trigger_queue_notification()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_payload jsonb;
  v_url text;
BEGIN
  -- Kong Gateway URL for Supabase Edge Functions
  v_url := 'http://kong:8000/functions/v1/send-queue-notification';

  -- Trigger notification on:
  -- 1. INSERT if status is 'confirmed'
  -- 2. UPDATE if status transitions to a new value
  IF (TG_OP = 'INSERT' AND NEW.status = 'confirmed') OR
     (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status)
  THEN
    v_payload := jsonb_build_object(
      'type', TG_OP,
      'table', 'appointments',
      'record', jsonb_build_object(
        'id', NEW.id,
        'user_id', NEW.user_id,
        'status', NEW.status,
        'token_number', NEW.token_number,
        'center_id', NEW.center_id,
        'doctor_id', NEW.doctor_id,
        'appointment_date', NEW.appointment_date,
        'cancelled_by', NEW.cancelled_by,
        'old_status', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END
      )
    );

    -- Call Edge Function asynchronously using pg_net extension
    PERFORM net.http_post(
      url := v_url,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := v_payload
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger Function: assign_appointment_token_number
CREATE OR REPLACE FUNCTION public.assign_appointment_token_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue_date date;
BEGIN
  v_queue_date := COALESCE(NEW.appointment_date, (NEW.scheduled_at AT TIME ZONE 'UTC')::date, CURRENT_DATE);
  NEW.appointment_date := v_queue_date;

  IF NEW.token_number IS NULL THEN
    IF NEW.center_id IS NULL THEN
      RAISE EXCEPTION 'center_id required';
    END IF;
    NEW.token_number := public.get_next_token(NEW.center_id, v_queue_date);
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger Function: sync_center_queue_after_appointment_change
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

  -- Ensure settings row exists
  INSERT INTO public.center_queue_settings (center_id, appointment_date, current_token, updated_at)
  VALUES (NEW.center_id, v_queue_date, COALESCE(NEW.token_number, 0), now())
  ON CONFLICT (center_id, appointment_date) DO NOTHING;

  -- Advance the current token if this appointment was called/in_progress
  IF NEW.status IN ('called', 'in_progress') AND NEW.token_number IS NOT NULL THEN
    UPDATE public.center_queue_settings
    SET current_token = GREATEST(current_token, NEW.token_number), updated_at = now()
    WHERE center_id::text = NEW.center_id::text AND appointment_date = v_queue_date;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
