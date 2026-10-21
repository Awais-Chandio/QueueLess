-- 1. Grant select privilege on doctor_availability table to client application
GRANT SELECT, INSERT, UPDATE, DELETE ON public.doctor_availability TO authenticated;
GRANT SELECT ON public.doctor_availability TO anon;

-- Ensure RLS is enabled and allows read access for everyone
ALTER TABLE public.doctor_availability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access for all users" ON public.doctor_availability;
CREATE POLICY "Allow read access for all users"
  ON public.doctor_availability
  FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "Doctors can manage own availability" ON public.doctor_availability;
CREATE POLICY "Doctors can manage own availability"
  ON public.doctor_availability
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.doctors d
      WHERE d.id = doctor_availability.doctor_id AND d.profile_id = auth.uid()
    )
  );

-- 2. Update get_doctor_availability RPC function to query doctor_availability and correct the timezone mismatch (Asia/Karachi)
CREATE OR REPLACE FUNCTION public.get_doctor_availability(p_doctor_id uuid)
RETURNS table (
  status text,
  tokens_ahead int,
  estimated_wait_minutes int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day_of_week int := extract(dow from (now() at time zone 'Asia/Karachi'));
  v_now time := (now() at time zone 'Asia/Karachi')::time;
  v_schedule record;
  v_on_leave boolean;
  v_on_break boolean;
  v_tokens_today int;
  v_avg_consultation_time numeric;
  v_max_tokens int;
BEGIN
  -- 1. Check Leaves
  SELECT EXISTS (
    SELECT 1 FROM public.doctor_leaves
    WHERE doctor_id = p_doctor_id AND leave_date = (CURRENT_DATE at time zone 'Asia/Karachi')::date
  ) INTO v_on_leave;

  IF v_on_leave THEN
    RETURN QUERY SELECT 'on_leave'::text, 0, 0;
    RETURN;
  END IF;

  -- 2. Check Weekly Schedule from doctor_availability table
  SELECT * INTO v_schedule FROM public.doctor_availability
  WHERE doctor_id = p_doctor_id AND day_of_week = v_day_of_week;

  IF v_schedule IS NULL OR NOT v_schedule.is_available OR v_now < v_schedule.start_time OR v_now > v_schedule.end_time THEN
    RETURN QUERY SELECT 'not_working'::text, 0, 0;
    RETURN;
  END IF;

  -- 3. Check Break Status (Staff Toggle)
  SELECT is_on_break INTO v_on_break FROM public.doctors WHERE id = p_doctor_id;
  IF v_on_break THEN
    RETURN QUERY SELECT 'on_break'::text, 0, 0;
    RETURN;
  END IF;

  -- 4. Count Today's Active Tokens
  SELECT count(*)::int INTO v_tokens_today FROM public.appointments a
  WHERE a.doctor_id = p_doctor_id
    AND a.appointment_date = (CURRENT_DATE at time zone 'Asia/Karachi')::date
    AND a.status NOT IN ('cancelled');

  -- 5. Calculate Max Tokens (dynamically based on schedule start/end time and slot duration)
  v_max_tokens := COALESCE(NULLIF(((extract(epoch from (v_schedule.end_time::time - v_schedule.start_time::time)) / 60) / COALESCE(v_schedule.slot_duration, 15))::int, 0), 40);

  -- 6. Check Token Limits
  IF v_tokens_today >= v_max_tokens THEN
    RETURN QUERY SELECT 'fully_booked'::text, 0, 0;
    RETURN;
  END IF;

  -- 7. Resolve average consultation time from doctor settings
  SELECT COALESCE(average_consultation_time, 10.0) INTO v_avg_consultation_time
  FROM public.doctor_queue_settings
  WHERE doctor_id = p_doctor_id;

  IF v_avg_consultation_time IS NULL THEN
    v_avg_consultation_time := 10.0;
  END IF;

  RETURN QUERY
  SELECT
    CASE WHEN v_tokens_today > 15 THEN 'busy'::text ELSE 'available'::text END,
    v_tokens_today,
    (v_tokens_today * v_avg_consultation_time)::integer;
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.get_doctor_availability(uuid) TO authenticated, anon;
