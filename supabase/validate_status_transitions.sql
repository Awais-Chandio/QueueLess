-- ========================================================================
-- QueueLess Database Layer Validation: Status Transitions & Hardening
-- ========================================================================

-- 1. Create status validation trigger function
CREATE OR REPLACE FUNCTION public.validate_appointment_status_transition()
RETURNS trigger AS $$
BEGIN
  -- If status is not changing, allow it
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Terminal states cannot be changed
  IF OLD.status IN ('completed', 'cancelled', 'expired', 'no_show', 'skipped') THEN
    RAISE EXCEPTION 'Cannot transition from terminal status "%" to "%"', OLD.status, NEW.status;
  END IF;

  -- Validate allowed state transitions
  IF OLD.status = 'pending' THEN
    IF NEW.status NOT IN ('confirmed', 'cancelled', 'expired') THEN
      RAISE EXCEPTION 'Invalid transition from pending to "%"', NEW.status;
    END IF;
  ELSIF OLD.status = 'confirmed' THEN
    IF NEW.status NOT IN ('checked_in', 'called', 'cancelled', 'expired') THEN
      RAISE EXCEPTION 'Invalid transition from confirmed to "%"', NEW.status;
    END IF;
  ELSIF OLD.status = 'checked_in' THEN
    IF NEW.status NOT IN ('called', 'cancelled', 'expired') THEN
      RAISE EXCEPTION 'Invalid transition from checked_in to "%"', NEW.status;
    END IF;
  ELSIF OLD.status = 'called' THEN
    IF NEW.status NOT IN ('in_progress', 'completed', 'no_show', 'cancelled', 'skipped') THEN
      RAISE EXCEPTION 'Invalid transition from called to "%"', NEW.status;
    END IF;
  ELSIF OLD.status = 'in_progress' THEN
    IF NEW.status NOT IN ('completed', 'no_show', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid transition from in_progress to "%"', NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Attach before-update status validation trigger to appointments table
DROP TRIGGER IF EXISTS validate_appointment_status_transition_trigger ON public.appointments;
CREATE TRIGGER validate_appointment_status_transition_trigger
  BEFORE UPDATE OF status ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_appointment_status_transition();

-- 3. Harden confirm_appointment RPC function
CREATE OR REPLACE FUNCTION public.confirm_appointment(p_appointment_id uuid)
RETURNS public.appointments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_appointment public.appointments%ROWTYPE;
BEGIN
  SELECT * INTO target_appointment FROM public.appointments WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Appointment not found'; END IF;
  
  IF target_appointment.status != 'pending' THEN
    RAISE EXCEPTION 'Appointment cannot be confirmed from current status: %', target_appointment.status;
  END IF;

  UPDATE public.appointments SET status = 'confirmed' WHERE id = p_appointment_id RETURNING * INTO target_appointment;
  RETURN target_appointment;
END; $$;

-- 4. Harden complete_appointment RPC function
CREATE OR REPLACE FUNCTION public.complete_appointment(p_appointment_id uuid, p_duration_minutes integer DEFAULT NULL)
RETURNS public.appointments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_appointment public.appointments%ROWTYPE; v_duration integer;
BEGIN
  SELECT * INTO target_appointment FROM public.appointments WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Appointment not found'; END IF;
  
  IF target_appointment.status NOT IN ('called', 'in_progress') THEN
    RAISE EXCEPTION 'Appointment cannot be completed from current status: %', target_appointment.status;
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
END; $$;

-- 5. Force schema reload for PostgREST
NOTIFY pgrst, 'reload schema';
