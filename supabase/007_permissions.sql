-- 007_permissions.sql

-- Ensure basic schema usage is granted
GRANT USAGE ON SCHEMA public TO authenticated, anon;

-- Fix the permission denied error on doctors table by granting select access
GRANT SELECT ON public.doctors TO authenticated, anon;

-- Grant select access on profiles, centers, and services
GRANT SELECT ON public.profiles TO authenticated, anon;
GRANT SELECT ON public.service_centers TO authenticated, anon;
GRANT SELECT ON public.services TO authenticated, anon;

-- Grant select access on queue settings and updates
GRANT SELECT ON public.center_queue_settings TO authenticated, anon;
GRANT SELECT ON public.queue_updates TO authenticated, anon;

-- Grant access on appointments and updates for patients
GRANT SELECT, INSERT ON public.appointments TO authenticated;
GRANT UPDATE(status, checked_in_at, cancelled_at, cancelled_by, cancel_reason, completed_at, duration_minutes) ON public.appointments TO authenticated;

-- Grant access on notifications and queue_updates
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.queue_updates TO authenticated;

-- Grant select access on views
GRANT SELECT ON public.appointments_full TO authenticated;

-- Grant function execution permissions explicitly
GRANT EXECUTE ON FUNCTION public.get_next_token(uuid, date) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_current_token(uuid, date) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_center_queue_snapshot(uuid, date) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_appointment_queue_snapshot(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.people_ahead(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.call_appointment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_service(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_appointment(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_appointment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_center_break(uuid, date, timestamptz, timestamptz, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_center_average_consultation_time(uuid, date, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_appointment(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_appointments() TO authenticated;
