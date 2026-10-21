-- 009_fix_appointments_constraints.sql
-- Run this in the Supabase Dashboard SQL Editor (https://supabase.com/dashboard/project/latdblyyakjrwzgxdean/sql/new)

-- 1. Drop the old center-scoped unique token constraint on appointments table
ALTER TABLE public.appointments 
  DROP CONSTRAINT IF EXISTS unique_center_date_token;

-- 2. Create unique indexes to handle doctor-scoped token numbers
-- This allows different doctors to have duplicate token numbers (e.g. Doctor A gets 1, Doctor B gets 1) at the same center and date
CREATE UNIQUE INDEX IF NOT EXISTS unique_doctor_date_token
  ON public.appointments (doctor_id, appointment_date, token_number)
  WHERE doctor_id IS NOT NULL AND status <> 'cancelled';

-- 3. Create unique index for center-scoped token numbers when doctor_id is null (Any Available Doctor)
CREATE UNIQUE INDEX IF NOT EXISTS unique_center_date_token_null_doctor
  ON public.appointments (center_id, appointment_date, token_number)
  WHERE doctor_id IS NULL AND status <> 'cancelled';

-- 4. Drop the old center-scoped unique slot index
DROP INDEX IF EXISTS public.idx_appointments_one_active_per_slot;

-- 5. Create new unique slot indexes to allow different doctors to be booked at the same time slot
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_one_active_per_slot_doctor
  ON public.appointments (doctor_id, appointment_date, appointment_time)
  WHERE doctor_id IS NOT NULL AND status <> 'cancelled';

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_one_active_per_slot_center
  ON public.appointments (center_id, appointment_date, appointment_time)
  WHERE doctor_id IS NULL AND status <> 'cancelled';
