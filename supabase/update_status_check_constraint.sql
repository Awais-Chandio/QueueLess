-- ========================================================================
-- QueueLess Appointments Status CHECK Constraint Update
-- Safely updates appointments_status_check constraint to include 'called'
-- and all valid application status values.
-- ========================================================================

-- 1. Drop existing status check constraint if present
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_status_check;

-- 2. Add complete status check constraint matching TypeScript AppointmentStatus type
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
      'no_show',
      'skipped'
    )
  );

-- 3. Notify schema reload
NOTIFY pgrst, 'reload schema';
