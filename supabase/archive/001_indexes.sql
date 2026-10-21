-- 001_indexes.sql
-- Clean up stale/duplicate past appointments to allow unique index creation
UPDATE public.appointments
SET status = 'expired'
WHERE appointment_date < CURRENT_DATE
  AND status NOT IN ('cancelled', 'expired', 'no_show', 'completed');

-- Drop stale index/uniqueness constraints if they exist
DROP INDEX IF EXISTS public.idx_appointments_one_active_per_slot;
DROP INDEX IF EXISTS public.idx_appointments_no_user_slot_clash;
DROP INDEX IF EXISTS public.idx_appointments_center_scheduled_at_token;

-- Recreate unique slot indexes scoped to Center + Date
CREATE UNIQUE INDEX idx_appointments_one_active_per_slot
  ON public.appointments(center_id, appointment_date, appointment_time)
  WHERE status NOT IN ('cancelled', 'expired', 'no_show');

-- Prevent a user from booking multiple overlapping appointments at the same slot
CREATE UNIQUE INDEX idx_appointments_no_user_slot_clash
  ON public.appointments(user_id, appointment_date, appointment_time)
  WHERE status NOT IN ('cancelled', 'expired', 'no_show');

-- Performance Optimization Indexes
CREATE INDEX IF NOT EXISTS idx_appointments_user_id ON public.appointments(user_id);
CREATE INDEX IF NOT EXISTS idx_appointments_service_id ON public.appointments(service_id);
CREATE INDEX IF NOT EXISTS idx_profiles_center_id ON public.profiles(center_id);
CREATE INDEX IF NOT EXISTS idx_notifications_appointment_id ON public.notifications(appointment_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_staff_user_id ON public.audit_logs(staff_user_id);
CREATE INDEX IF NOT EXISTS idx_appointments_user_scheduled_at ON public.appointments(user_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appointments_center_scheduled_at_token ON public.appointments(center_id, scheduled_at, token_number);
CREATE INDEX IF NOT EXISTS idx_queue_updates_appointment_created_at ON public.queue_updates(appointment_id, created_at DESC);
