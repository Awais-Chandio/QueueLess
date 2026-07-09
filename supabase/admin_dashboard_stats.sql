-- ============================================================
-- SQL Migration: PL/pgSQL Analytics RPC Functions for Admin Dashboard
-- ============================================================

-- 1. bookings_per_day
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

-- 2. busiest_services
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

-- 3. busiest_centers
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

-- 4. staff_performance
CREATE OR REPLACE FUNCTION public.staff_performance(p_range text)
RETURNS TABLE (
  staff_name text,
  completed_count bigint,
  avg_time_minutes numeric(10, 2)
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
    p.full_name::text as staff_name,
    COUNT(a.id)::bigint as completed_count,
    ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM (a.completed_at - a.called_at))::numeric / 60), 0), 2) as avg_time_minutes
  FROM public.appointments a
  JOIN public.profiles p ON p.id = a.doctor_id
  WHERE a.status = 'completed'
    AND a.called_at IS NOT NULL
    AND a.completed_at IS NOT NULL
    AND a.scheduled_at >= v_start_date
  GROUP BY p.full_name
  ORDER BY COUNT(a.id) DESC;
END;
$$;

-- Grant execution rights to authenticated users
GRANT EXECUTE ON FUNCTION public.bookings_per_day(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.busiest_services(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.busiest_centers(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_performance(text) TO authenticated;

-- Reload schema
NOTIFY pgrst, 'reload schema';
