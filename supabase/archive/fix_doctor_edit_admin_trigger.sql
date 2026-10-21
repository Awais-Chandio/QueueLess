-- Authorize protected doctor-field updates through the canonical profile-backed
-- admin check. The existing BEFORE UPDATE trigger remains unchanged.

CREATE OR REPLACE FUNCTION public.prevent_doctor_restricted_field_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin()
     AND (
       NEW.specialty IS DISTINCT FROM OLD.specialty
       OR NEW.qualification IS DISTINCT FROM OLD.qualification
       OR NEW.experience_years IS DISTINCT FROM OLD.experience_years
       OR NEW.license_number IS DISTINCT FROM OLD.license_number
       OR NEW.employee_code IS DISTINCT FROM OLD.employee_code
       OR NEW.fee IS DISTINCT FROM OLD.fee
       OR NEW.center_id IS DISTINCT FROM OLD.center_id
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.name IS DISTINCT FROM OLD.name
       OR NEW.gender IS DISTINCT FROM OLD.gender
     )
  THEN
    RAISE EXCEPTION 'Only admin can change specialty, qualification, experience, license, employee code, fee, center, status, name, or gender';
  END IF;

  RETURN NEW;
END;
$$;
