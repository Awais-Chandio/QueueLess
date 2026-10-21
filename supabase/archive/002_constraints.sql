-- 002_constraints.sql
-- Ensure status checks allow new statuses like expired and no_show
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_status_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_status_check
  CHECK (
    status IN (
      'pending',
      'confirmed',
      'checked_in',
      'called',
      'in_progress',
      'completed',
      'cancelled',
      'expired',
      'no_show'
    )
  );

-- Ensure profiles role checks are solid
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('client', 'staff', 'admin'));
