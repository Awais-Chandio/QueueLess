-- 1. Drop old profiles_role_check constraint and add the new one supporting 'doctor'
-- Apply this SQL in your Supabase Dashboard SQL Editor (https://supabase.com/dashboard/project/latdblyyakjrwzgxdean/sql/new)

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles 
  ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('client', 'staff', 'admin', 'doctor'));

-- 2. Modify the doctors restricted field trigger to only fire BEFORE UPDATE.
-- This ensures that during INSERT (when OLD is NULL), the fields are not cleared/set to NULL.
DROP TRIGGER IF EXISTS prevent_doctor_restricted_field_change_trigger ON public.doctors;
DROP TRIGGER IF EXISTS prevent_doctor_restricted_field_change ON public.doctors;

CREATE TRIGGER prevent_doctor_restricted_field_change_trigger
  BEFORE UPDATE
  ON public.doctors
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_doctor_restricted_field_change();

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
