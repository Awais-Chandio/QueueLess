-- doctor_selection_permissions_fix.sql
-- Run this in the Supabase Dashboard SQL Editor as the postgres user to restore permissions

-- 1. Grant SELECT access on all doctor-related tables
GRANT SELECT ON public.doctors TO authenticated, anon;
GRANT SELECT ON public.doctor_services TO authenticated, anon;
GRANT SELECT ON public.doctor_schedules TO authenticated, anon;
GRANT SELECT ON public.doctor_leaves TO authenticated, anon;

-- 2. Grant EXECUTE permissions on the new live queue RPC functions
GRANT EXECUTE ON FUNCTION public.get_doctor_availability(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_doctor_queue_snapshot(uuid, date) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.set_doctor_break(uuid, date, timestamptz, timestamptz, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_doctor_average_consultation_time(uuid, date, numeric) TO authenticated;

-- 3. Confirm permissions
SELECT table_name, grantee, privilege_type 
FROM information_schema.role_table_grants 
WHERE table_name IN ('doctors', 'doctor_services', 'doctor_schedules', 'doctor_leaves') 
  AND grantee IN ('authenticated', 'anon');
