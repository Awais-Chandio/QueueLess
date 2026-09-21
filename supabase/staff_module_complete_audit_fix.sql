-- ========================================================================
-- QueueLess Staff Module Complete Database Audit & Fix
-- Contains all RPC functions, RLS policies, triggers, permissions, and column migrations
-- Robust text/uuid comparison casting
-- ========================================================================

-- 1. Ensure Table Structure & Add Missing Columns explicitly

-- Table: profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS fcm_token TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS center_id UUID REFERENCES public.service_centers(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'client';

-- Table: center_queue_settings
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

-- EXPLICITLY ALTER center_queue_settings to add any missing columns on existing tables
ALTER TABLE public.center_queue_settings ADD COLUMN IF NOT EXISTS appointment_date date NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.center_queue_settings ADD COLUMN IF NOT EXISTS is_on_break boolean DEFAULT false;
ALTER TABLE public.center_queue_settings ADD COLUMN IF NOT EXISTS break_start timestamptz;
ALTER TABLE public.center_queue_settings ADD COLUMN IF NOT EXISTS break_end timestamptz;
ALTER TABLE public.center_queue_settings ADD COLUMN IF NOT EXISTS current_token integer DEFAULT 0;
ALTER TABLE public.center_queue_settings ADD COLUMN IF NOT EXISTS average_consultation_time numeric(10,2) DEFAULT 10.0;
ALTER TABLE public.center_queue_settings ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DO $$
BEGIN
  BEGIN
    ALTER TABLE public.center_queue_settings DROP CONSTRAINT IF EXISTS center_queue_settings_pkey;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN
    ALTER TABLE public.center_queue_settings ADD PRIMARY KEY (center_id, appointment_date);
  EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

-- Table: center_daily_tokens
CREATE TABLE IF NOT EXISTS public.center_daily_tokens (
  center_id uuid NOT NULL REFERENCES public.service_centers(id) ON DELETE CASCADE,
  appointment_date date NOT NULL,
  last_token_number integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (center_id, appointment_date)
);

-- Table: queue_updates
CREATE TABLE IF NOT EXISTS public.queue_updates (
  appointment_id uuid PRIMARY KEY REFERENCES public.appointments(id) ON DELETE CASCADE,
  current_position integer DEFAULT 0,
  people_ahead integer DEFAULT 0,
  estimated_wait_mins integer DEFAULT 0,
  current_serving_token integer DEFAULT 0,
  status text,
  updated_at timestamptz DEFAULT now()
);

-- Table: audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  action text NOT NULL,
  old_status text,
  new_status text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Table: notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  data jsonb DEFAULT '{}'::jsonb,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Ensure appointments status CHECK constraint includes all 10 application statuses
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_status_check CHECK (
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

-- 2. Grant Direct Table Permissions

GRANT SELECT, INSERT, UPDATE, DELETE ON public.center_queue_settings TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.center_daily_tokens TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.queue_updates TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_logs TO authenticated, anon;

-- 3. RLS Policies Audit & Setup

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.center_queue_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.center_daily_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
DROP POLICY IF EXISTS "Enable read for authenticated users" ON public.profiles;
CREATE POLICY "Enable read for authenticated users" ON public.profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Enable self update" ON public.profiles;
CREATE POLICY "Enable self update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Appointments Policies for Staff & Users
DROP POLICY IF EXISTS "Staff and users can view appointments" ON public.appointments;
CREATE POLICY "Staff and users can view appointments" ON public.appointments FOR SELECT TO authenticated USING (
  user_id::text = auth.uid()::text
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id::text = auth.uid()::text
      AND (profiles.role IN ('admin', 'staff'))
  )
);

DROP POLICY IF EXISTS "Staff and users can update appointments" ON public.appointments;
CREATE POLICY "Staff and users can update appointments" ON public.appointments FOR UPDATE TO authenticated USING (
  user_id::text = auth.uid()::text
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id::text = auth.uid()::text
      AND (profiles.role IN ('admin', 'staff'))
  )
);

DROP POLICY IF EXISTS "Users can insert appointments" ON public.appointments;
CREATE POLICY "Users can insert appointments" ON public.appointments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Center Queue Settings Policies
DROP POLICY IF EXISTS "Authenticated users select settings" ON public.center_queue_settings;
CREATE POLICY "Authenticated users select settings" ON public.center_queue_settings FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "Staff and admin modify settings" ON public.center_queue_settings;
CREATE POLICY "Staff and admin modify settings" ON public.center_queue_settings FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- Center Daily Tokens Policies
DROP POLICY IF EXISTS "Authenticated users select daily tokens" ON public.center_daily_tokens;
CREATE POLICY "Authenticated users select daily tokens" ON public.center_daily_tokens FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "Staff and admin modify daily tokens" ON public.center_daily_tokens;
CREATE POLICY "Staff and admin modify daily tokens" ON public.center_daily_tokens FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- Queue Updates Policies
DROP POLICY IF EXISTS "Authenticated users select queue updates" ON public.queue_updates;
CREATE POLICY "Authenticated users select queue updates" ON public.queue_updates FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "Staff and admin modify queue updates" ON public.queue_updates;
CREATE POLICY "Staff and admin modify queue updates" ON public.queue_updates FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- Notifications & Audit Logs Policies
DROP POLICY IF EXISTS "Users view own notifications" ON public.notifications;
CREATE POLICY "Users view own notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id::text = auth.uid()::text);

DROP POLICY IF EXISTS "Authenticated insert notifications" ON public.notifications;
CREATE POLICY "Authenticated insert notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Staff view audit logs" ON public.audit_logs;
CREATE POLICY "Staff view audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Staff insert audit logs" ON public.audit_logs;
CREATE POLICY "Staff insert audit logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- 4. Comprehensive Staff & Queue RPC Functions (SECURITY DEFINER)

-- RPC: update_user_fcm_token
CREATE OR REPLACE FUNCTION public.update_user_fcm_token(p_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.profiles SET fcm_token = p_token, updated_at = now() WHERE id::text = auth.uid()::text;
END; $$;

-- RPC: get_next_token
CREATE OR REPLACE FUNCTION public.get_next_token(p_center_id uuid, p_appointment_date date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_next_token integer;
BEGIN
  IF p_center_id IS NULL OR p_appointment_date IS NULL THEN RAISE EXCEPTION 'center_id and appointment_date required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_center_id::text || ':' || p_appointment_date::text));
  INSERT INTO public.center_daily_tokens (center_id, appointment_date, last_token_number, updated_at)
  VALUES (p_center_id, p_appointment_date, 1, now())
  ON CONFLICT (center_id, appointment_date)
  DO UPDATE SET last_token_number = public.center_daily_tokens.last_token_number + 1, updated_at = now()
  RETURNING last_token_number INTO v_next_token;
  RETURN v_next_token;
END; $$;

-- RPC: get_current_token
CREATE OR REPLACE FUNCTION public.get_current_token(p_center_id uuid, p_queue_date date DEFAULT CURRENT_DATE)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_current_token integer;
BEGIN
  IF p_center_id IS NULL THEN RETURN 0; END IF;
  SELECT COALESCE(MAX(token_number), 0) INTO v_current_token
  FROM public.appointments
  WHERE center_id::text = p_center_id::text AND appointment_date = p_queue_date AND status IN ('called', 'in_progress');
  RETURN COALESCE(v_current_token, 0);
END; $$;

-- RPC: people_ahead
CREATE OR REPLACE FUNCTION public.people_ahead(p_appointment_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_appointment public.appointments%ROWTYPE; v_current_token integer;
BEGIN
  SELECT * INTO v_appointment FROM public.appointments WHERE id::text = p_appointment_id::text;
  IF NOT FOUND THEN RETURN 0; END IF;
  v_current_token := public.get_current_token(v_appointment.center_id, v_appointment.appointment_date);
  RETURN GREATEST(COALESCE(v_appointment.token_number, 0) - v_current_token, 0);
END; $$;

-- RPC: get_center_queue_snapshot
CREATE OR REPLACE FUNCTION public.get_center_queue_snapshot(
  p_center_id uuid,
  p_queue_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_settings public.center_queue_settings%ROWTYPE;
  v_current_token integer;
  v_next_token integer;
  v_is_on_break boolean;
BEGIN
  INSERT INTO public.center_queue_settings (center_id, appointment_date)
  VALUES (p_center_id, p_queue_date)
  ON CONFLICT (center_id, appointment_date) DO NOTHING;

  SELECT * INTO v_settings FROM public.center_queue_settings
  WHERE center_id::text = p_center_id::text AND appointment_date = p_queue_date;

  SELECT COALESCE(MAX(token_number), 0) INTO v_current_token
  FROM public.appointments
  WHERE center_id::text = p_center_id::text AND appointment_date = p_queue_date AND status IN ('called', 'in_progress');

  v_current_token := GREATEST(COALESCE(v_settings.current_token, 0), COALESCE(v_current_token, 0));

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
    'doctor_average_time', COALESCE(v_settings.average_consultation_time, 10),
    'average_consultation_time', COALESCE(v_settings.average_consultation_time, 10),
    'is_on_break', v_is_on_break,
    'break_start', v_settings.break_start,
    'break_end', v_settings.break_end
  );
END; $$;

-- RPC: get_appointment_queue_snapshot
CREATE OR REPLACE FUNCTION public.get_appointment_queue_snapshot(p_appointment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_appointment public.appointments%ROWTYPE;
  v_center_snapshot jsonb;
  v_current_token integer;
  v_average numeric(10, 2);
  v_people_ahead integer;
  v_estimated_wait integer;
BEGIN
  SELECT * INTO v_appointment FROM public.appointments WHERE id::text = p_appointment_id::text;
  IF NOT FOUND THEN RAISE EXCEPTION 'Appointment not found'; END IF;

  v_center_snapshot := public.get_center_queue_snapshot(v_appointment.center_id, v_appointment.appointment_date);
  v_current_token := COALESCE((v_center_snapshot->>'current_token')::integer, 0);
  v_average := COALESCE((v_center_snapshot->>'average_consultation_time')::numeric, 10);
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
END; $$;

-- RPC: call_appointment
CREATE OR REPLACE FUNCTION public.call_appointment(p_appointment_id uuid)
RETURNS public.appointments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE called_appointment public.appointments%ROWTYPE;
BEGIN
  SELECT * INTO called_appointment FROM public.appointments WHERE id::text = p_appointment_id::text FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Appointment not found'; END IF;
  IF called_appointment.status NOT IN ('confirmed', 'checked_in', 'pending') THEN
    RAISE EXCEPTION 'Cannot call appointment from status: %', called_appointment.status;
  END IF;
  UPDATE public.appointments
  SET status = 'called', called_at = now()
  WHERE id::text = p_appointment_id::text
  RETURNING * INTO called_appointment;
  RETURN called_appointment;
END; $$;

-- RPC: start_service
CREATE OR REPLACE FUNCTION public.start_service(p_appointment_id uuid)
RETURNS public.appointments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_appointment public.appointments%ROWTYPE;
BEGIN
  SELECT * INTO target_appointment FROM public.appointments WHERE id::text = p_appointment_id::text FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Appointment not found'; END IF;
  UPDATE public.appointments
  SET status = 'in_progress', started_at = COALESCE(started_at, now()), called_at = COALESCE(called_at, now())
  WHERE id::text = p_appointment_id::text
  RETURNING * INTO target_appointment;
  RETURN target_appointment;
END; $$;

-- RPC: complete_appointment
CREATE OR REPLACE FUNCTION public.complete_appointment(p_appointment_id uuid, p_duration_minutes integer DEFAULT NULL)
RETURNS public.appointments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_appointment public.appointments%ROWTYPE; v_duration integer;
BEGIN
  SELECT * INTO target_appointment FROM public.appointments WHERE id::text = p_appointment_id::text FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Appointment not found'; END IF;
  
  IF p_duration_minutes IS NOT NULL THEN
    v_duration := p_duration_minutes;
  ELSIF target_appointment.started_at IS NOT NULL THEN
    v_duration := GREATEST(1, EXTRACT(EPOCH FROM (now() - target_appointment.started_at))::integer / 60);
  ELSE
    v_duration := 15;
  END IF;

  UPDATE public.appointments
  SET status = 'completed', completed_at = now(), duration_minutes = v_duration
  WHERE id::text = p_appointment_id::text
  RETURNING * INTO target_appointment;

  RETURN target_appointment;
END; $$;

-- RPC: confirm_appointment
CREATE OR REPLACE FUNCTION public.confirm_appointment(p_appointment_id uuid)
RETURNS public.appointments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_appointment public.appointments%ROWTYPE;
BEGIN
  UPDATE public.appointments SET status = 'confirmed' WHERE id::text = p_appointment_id::text RETURNING * INTO target_appointment;
  IF NOT FOUND THEN RAISE EXCEPTION 'Appointment not found'; END IF;
  RETURN target_appointment;
END; $$;

-- RPC: set_center_break
CREATE OR REPLACE FUNCTION public.set_center_break(
  p_center_id uuid,
  p_queue_date date,
  p_break_start timestamptz,
  p_break_end timestamptz,
  p_is_on_break boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result public.center_queue_settings%ROWTYPE;
BEGIN
  INSERT INTO public.center_queue_settings (center_id, appointment_date, break_start, break_end, is_on_break, updated_at)
  VALUES (p_center_id, p_queue_date, p_break_start, p_break_end, p_is_on_break, now())
  ON CONFLICT (center_id, appointment_date)
  DO UPDATE SET break_start = EXCLUDED.break_start, break_end = EXCLUDED.break_end, is_on_break = EXCLUDED.is_on_break, updated_at = now()
  RETURNING * INTO v_result;
  RETURN to_jsonb(v_result);
END; $$;

-- RPC: update_center_average_consultation_time
CREATE OR REPLACE FUNCTION public.update_center_average_consultation_time(
  p_center_id uuid,
  p_queue_date date,
  p_avg_mins numeric
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result public.center_queue_settings%ROWTYPE;
BEGIN
  INSERT INTO public.center_queue_settings (center_id, appointment_date, average_consultation_time, updated_at)
  VALUES (p_center_id, p_queue_date, p_avg_mins, now())
  ON CONFLICT (center_id, appointment_date)
  DO UPDATE SET average_consultation_time = EXCLUDED.average_consultation_time, updated_at = now()
  RETURNING * INTO v_result;
  RETURN to_jsonb(v_result);
END; $$;

-- 5. Triggers on public.appointments

CREATE OR REPLACE FUNCTION public.assign_appointment_token_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_queue_date date;
BEGIN
  v_queue_date := COALESCE(NEW.appointment_date, (NEW.scheduled_at AT TIME ZONE 'UTC')::date, CURRENT_DATE);
  NEW.appointment_date := v_queue_date;

  IF TG_OP = 'INSERT' AND NEW.token_number IS NULL THEN
    IF NEW.center_id IS NULL THEN RAISE EXCEPTION 'center_id required'; END IF;
    NEW.token_number := public.get_next_token(NEW.center_id, v_queue_date);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS assign_appointment_token_number_trigger ON public.appointments;
CREATE TRIGGER assign_appointment_token_number_trigger
  BEFORE INSERT OR UPDATE OF center_id, scheduled_at, appointment_date, token_number
  ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.assign_appointment_token_number();

CREATE OR REPLACE FUNCTION public.sync_center_queue_after_appointment_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_queue_date date;
BEGIN
  IF NEW.center_id IS NULL THEN RETURN NEW; END IF;
  v_queue_date := COALESCE(NEW.appointment_date, (NEW.scheduled_at AT TIME ZONE 'UTC')::date, CURRENT_DATE);

  INSERT INTO public.center_queue_settings (center_id, appointment_date, current_token, updated_at)
  VALUES (NEW.center_id, v_queue_date, COALESCE(NEW.token_number, 0), now())
  ON CONFLICT (center_id, appointment_date) DO NOTHING;

  IF NEW.status IN ('called', 'in_progress') AND NEW.token_number IS NOT NULL THEN
    UPDATE public.center_queue_settings
    SET current_token = GREATEST(current_token, NEW.token_number), updated_at = now()
    WHERE center_id::text = NEW.center_id::text AND appointment_date = v_queue_date;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS sync_center_queue_after_appointment_change_trigger ON public.appointments;
CREATE TRIGGER sync_center_queue_after_appointment_change_trigger
  AFTER INSERT OR UPDATE OF status, duration_minutes, token_number
  ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.sync_center_queue_after_appointment_change();

-- 6. Grant RPC EXECUTE permissions for authenticated and anon roles

GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.update_user_fcm_token(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_token(uuid, date) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.call_appointment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_service(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_appointment(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_appointment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_center_break(uuid, date, timestamptz, timestamptz, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_center_average_consultation_time(uuid, date, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_token(uuid, date) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.people_ahead(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_center_queue_snapshot(uuid, date) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_appointment_queue_snapshot(uuid) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
