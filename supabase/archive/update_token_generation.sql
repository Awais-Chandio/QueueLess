-- ========================================================================
-- QueueLess Per-Center, Per-Day Transactional Token Allocation System
--
-- Requirements:
-- 1. Token numbers unique per (center_id, appointment_date).
-- 2. Token numbering starts from 1 automatically for every center every new day.
-- 3. Advance bookings receive the correct token for their selected appointment date.
-- 4. No auto-increment sequence or global identity column.
-- 5. New table `center_daily_tokens` tracks per-center, per-day sequence counters.
-- 6. Transactional token allocation prevents duplicates during concurrent bookings.
-- 7. Queue functions strictly scoped to center_id and appointment_date.
-- ========================================================================

-- 1. Create table center_daily_tokens if not exists
CREATE TABLE IF NOT EXISTS public.center_daily_tokens (
  center_id uuid NOT NULL REFERENCES public.service_centers(id) ON DELETE CASCADE,
  appointment_date date NOT NULL,
  last_token_number integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (center_id, appointment_date)
);

-- RLS for center_daily_tokens
ALTER TABLE public.center_daily_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.center_daily_tokens;
CREATE POLICY "Enable read access for authenticated users"
  ON public.center_daily_tokens FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Enable write access for authenticated users" ON public.center_daily_tokens;
CREATE POLICY "Enable write access for authenticated users"
  ON public.center_daily_tokens FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 2. Ensure token_number column is NOT an auto-increment identity column
ALTER TABLE public.appointments ALTER COLUMN token_number DROP IDENTITY IF EXISTS;

-- 3. Backfill appointment_date for any existing rows if missing
UPDATE public.appointments
SET appointment_date = (scheduled_at AT TIME ZONE 'UTC')::date
WHERE appointment_date IS NULL;

-- 4. Deduplicate / Re-index existing tokens per (center_id, appointment_date)
UPDATE public.appointments
SET token_number = s.new_token
FROM (
  SELECT id,
         row_number() OVER (
           PARTITION BY center_id, appointment_date 
           ORDER BY COALESCE(token_number, 0), created_at
         ) as new_token
  FROM public.appointments
) s
WHERE public.appointments.id = s.id;

-- 5. Seed center_daily_tokens with max token_number for existing records
INSERT INTO public.center_daily_tokens (center_id, appointment_date, last_token_number, updated_at)
SELECT center_id, appointment_date, COALESCE(MAX(token_number), 0), now()
FROM public.appointments
WHERE center_id IS NOT NULL AND appointment_date IS NOT NULL
GROUP BY center_id, appointment_date
ON CONFLICT (center_id, appointment_date)
DO UPDATE SET
  last_token_number = GREATEST(center_daily_tokens.last_token_number, EXCLUDED.last_token_number),
  updated_at = now();

-- 6. Apply UNIQUE constraint per (center_id, appointment_date, token_number)
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS unique_center_date_token,
  ADD CONSTRAINT unique_center_date_token UNIQUE (center_id, appointment_date, token_number);

-- 7. Helper function: Determine appointment queue date
CREATE OR REPLACE FUNCTION public.queue_appointment_date(
  p_appointment_date date,
  p_scheduled_at timestamptz
)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_appointment_date, (p_scheduled_at AT TIME ZONE 'UTC')::date);
$$;

-- 8. Transactional RPC: get_next_token(p_center_id, p_appointment_date)
-- Generates and locks the next token number for a specific center and date atomically
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
  IF p_center_id IS NULL THEN
    RAISE EXCEPTION 'center_id is required to allocate a token';
  END IF;

  IF p_appointment_date IS NULL THEN
    RAISE EXCEPTION 'appointment_date is required to allocate a token';
  END IF;

  -- Transactional lock using advisory lock to guarantee absolute isolation under high concurrency
  PERFORM pg_advisory_xact_lock(hashtext(p_center_id::text || ':' || p_appointment_date::text));

  -- Atomic upsert to increment last_token_number
  INSERT INTO public.center_daily_tokens (center_id, appointment_date, last_token_number, updated_at)
  VALUES (p_center_id, p_appointment_date, 1, now())
  ON CONFLICT (center_id, appointment_date)
  DO UPDATE SET
    last_token_number = public.center_daily_tokens.last_token_number + 1,
    updated_at = now()
  RETURNING last_token_number INTO v_next_token;

  RETURN v_next_token;
END;
$$;

-- 9. BEFORE INSERT/UPDATE trigger for automatic per-center per-date token assignment
CREATE OR REPLACE FUNCTION public.assign_appointment_token_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue_date date;
BEGIN
  -- Determine queue date
  v_queue_date := public.queue_appointment_date(NEW.appointment_date, NEW.scheduled_at);
  NEW.appointment_date := v_queue_date;

  -- Transactional Token Allocation if token_number is not set
  IF TG_OP = 'INSERT' AND NEW.token_number IS NULL THEN
    IF NEW.center_id IS NULL THEN
      RAISE EXCEPTION 'center_id is required for token allocation';
    END IF;

    -- Allocate next token via transactional get_next_token function
    NEW.token_number := public.get_next_token(NEW.center_id, v_queue_date);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_appointment_token_number_trigger ON public.appointments;
CREATE TRIGGER assign_appointment_token_number_trigger
  BEFORE INSERT OR UPDATE OF center_id, scheduled_at, appointment_date, token_number
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_appointment_token_number();

-- 10. Per-Center, Per-Date Queue Functions

-- get_current_token: Filtered strictly by center_id and appointment_date
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
BEGIN
  IF p_center_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(MAX(token_number), 0)
  INTO v_current_token
  FROM public.appointments
  WHERE center_id = p_center_id
    AND appointment_date = p_queue_date
    AND status IN ('called', 'in_progress');

  RETURN COALESCE(v_current_token, 0);
END;
$$;

-- people_ahead: Filtered by appointment_id -> center_id & appointment_date
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
  SELECT * INTO v_appointment FROM public.appointments WHERE id = p_appointment_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  v_current_token := public.get_current_token(v_appointment.center_id, v_appointment.appointment_date);
  RETURN GREATEST(COALESCE(v_appointment.token_number, 0) - v_current_token, 0);
END;
$$;

-- Grant RPC execution permissions
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE ON public.center_daily_tokens TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_token(uuid, date) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_current_token(uuid, date) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.people_ahead(uuid) TO authenticated, anon;

-- 11. Refresh schema cache
NOTIFY pgrst, 'reload schema';
