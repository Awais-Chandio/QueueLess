-- Allow authenticated admins to manage doctor records using the canonical
-- public.profiles.role value. The live JWTs do not currently contain the
-- legacy top-level app_role claim, so policies based only on
-- auth.jwt() ->> 'app_role' silently filter every UPDATE/DELETE row.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.doctors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.doctor_services TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE(full_name, phone, avatar_url, updated_at) ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "admin manage doctors by profile role" ON public.doctors;
CREATE POLICY "admin manage doctors by profile role"
  ON public.doctors
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin manage doctor services by profile role" ON public.doctor_services;
CREATE POLICY "admin manage doctor services by profile role"
  ON public.doctor_services
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin read profiles by profile role" ON public.profiles;
CREATE POLICY "admin read profiles by profile role"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "admin update profiles by profile role" ON public.profiles;
CREATE POLICY "admin update profiles by profile role"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Recover doctor accounts whose auth/profile creation succeeded but whose
-- doctors insert was previously blocked by grants/RLS. Keep them inactive
-- until an admin completes the clinical fields in Edit Doctor.
INSERT INTO public.doctors (
  center_id,
  name,
  specialty,
  qualification,
  experience_years,
  bio,
  is_active,
  is_on_break,
  profile_id,
  employee_code,
  license_number,
  gender,
  fee,
  status
)
SELECT
  profiles.center_id,
  profiles.full_name,
  'General Physician',
  NULL,
  0,
  'Doctor profile setup pending.',
  false,
  false,
  profiles.id,
  'EMP-' || upper(left(replace(profiles.id::text, '-', ''), 8)),
  NULL,
  NULL,
  0,
  'inactive'
FROM public.profiles
WHERE profiles.role = 'doctor'
  AND profiles.center_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.doctors
    WHERE doctors.profile_id = profiles.id
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
