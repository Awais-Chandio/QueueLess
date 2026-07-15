-- Consolidated Migration: Missing Objects for QueueLess Time Booking & Analytics
-- Apply this SQL in your Supabase Dashboard SQL Editor (https://supabase.com/dashboard/project/latdblyyakjrwzgxdean/sql/new)

-- 1. Create missing unique slot index to prevent duplicate active bookings
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_one_active_per_slot
  ON public.appointments(center_id, appointment_date, appointment_time)
  WHERE status <> 'cancelled';

-- 2. Create missing get_available_slots RPC for slot booking
CREATE OR REPLACE FUNCTION public.get_available_slots(
  p_appointment_date date,
  p_center_id uuid DEFAULT NULL
)
RETURNS text[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH slots(slot_time) AS (
    VALUES
      ('09:00 AM'::text),
      ('09:30 AM'::text),
      ('10:00 AM'::text),
      ('10:30 AM'::text),
      ('11:00 AM'::text)
  ),
  booked(slot_time) AS (
    SELECT DISTINCT
      CASE
        WHEN appointment_time ~ '^\d{2}:\d{2}(:\d{2})?$'
          THEN to_char(appointment_time::time, 'HH12:MI AM')
        ELSE upper(trim(appointment_time))
      END AS slot_time
    FROM public.appointments
    WHERE appointment_date = p_appointment_date
      AND status <> 'cancelled'
      AND (
        p_center_id IS NULL
        OR center_id = p_center_id
      )
  )
  SELECT COALESCE(array_agg(slots.slot_time ORDER BY slots.slot_time), '{}'::text[])
  FROM slots
  WHERE NOT EXISTS (
    SELECT 1
    FROM booked
    WHERE booked.slot_time = slots.slot_time
  );
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.get_available_slots(date, uuid) TO authenticated, anon;

-- 3. Create missing Admin Analytics Dashboard RPCs
CREATE OR REPLACE FUNCTION public.bookings_per_day(p_range text)
RETURNS TABLE (
  booking_date date,
  count bigint
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_start_date timestamptz;
BEGIN
  IF p_range = 'today' THEN
    v_start_date := CURRENT_DATE;
  ELSIF p_range = 'week' THEN
    v_start_date := CURRENT_DATE - INTERVAL '7 days';
  ELSIF p_range = 'month' THEN
    v_start_date := CURRENT_DATE - INTERVAL '30 days';
  ELSE
    v_start_date := '1970-01-01'::timestamptz;
  END IF;

  RETURN QUERY
  SELECT
    appointment_date::date,
    COUNT(*)::bigint
  FROM public.appointments
  WHERE scheduled_at >= v_start_date
  GROUP BY appointment_date
  ORDER BY appointment_date ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.busiest_services(p_range text)
RETURNS TABLE (
  service_name text,
  count bigint
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_start_date timestamptz;
BEGIN
  IF p_range = 'today' THEN
    v_start_date := CURRENT_DATE;
  ELSIF p_range = 'week' THEN
    v_start_date := CURRENT_DATE - INTERVAL '7 days';
  ELSIF p_range = 'month' THEN
    v_start_date := CURRENT_DATE - INTERVAL '30 days';
  ELSE
    v_start_date := '1970-01-01'::timestamptz;
  END IF;

  RETURN QUERY
  SELECT
    s.name::text as service_name,
    COUNT(*)::bigint
  FROM public.appointments a
  JOIN public.services s ON s.id = a.service_id
  WHERE a.scheduled_at >= v_start_date
  GROUP BY s.name
  ORDER BY COUNT(*) DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.busiest_centers(p_range text)
RETURNS TABLE (
  center_name text,
  count bigint
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_start_date timestamptz;
BEGIN
  IF p_range = 'today' THEN
    v_start_date := CURRENT_DATE;
  ELSIF p_range = 'week' THEN
    v_start_date := CURRENT_DATE - INTERVAL '7 days';
  ELSIF p_range = 'month' THEN
    v_start_date := CURRENT_DATE - INTERVAL '30 days';
  ELSE
    v_start_date := '1970-01-01'::timestamptz;
  END IF;

  RETURN QUERY
  SELECT
    c.name::text as center_name,
    COUNT(*)::bigint
  FROM public.appointments a
  JOIN public.service_centers c ON c.id = a.center_id
  WHERE a.scheduled_at >= v_start_date
  GROUP BY c.name
  ORDER BY COUNT(*) DESC;
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.bookings_per_day(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.busiest_services(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.busiest_centers(text) TO authenticated, anon;

-- Force postgrest schema cache reload
NOTIFY pgrst, 'reload schema';
