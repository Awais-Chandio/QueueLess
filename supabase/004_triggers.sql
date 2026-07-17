-- 004_triggers.sql

-- 1. Drop stale/deprecated triggers to resolve execution dependency errors
DROP TRIGGER IF EXISTS sync_doctor_queue_after_appointment_change_trigger ON public.appointments;
DROP TRIGGER IF EXISTS set_appointment_timing_fields_trigger ON public.appointments;

-- 2. Drop active triggers before recreation to ensure idempotency
DROP TRIGGER IF EXISTS assign_appointment_token_number_trigger ON public.appointments;
DROP TRIGGER IF EXISTS sync_center_queue_after_appointment_change_trigger ON public.appointments;
DROP TRIGGER IF EXISTS queue_notification_trigger ON public.appointments;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 3. Create active triggers

-- Assign token number BEFORE insert/update of scheduling-related columns
CREATE TRIGGER assign_appointment_token_number_trigger
  BEFORE INSERT OR UPDATE OF center_id, scheduled_at, appointment_date, token_number
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_appointment_token_number();

-- Update center queue settings AFTER status changes (e.g. called, completed)
CREATE TRIGGER sync_center_queue_after_appointment_change_trigger
  AFTER INSERT OR UPDATE OF status, duration_minutes, token_number
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_center_queue_after_appointment_change();

-- Send notifications when status changes
CREATE TRIGGER queue_notification_trigger
  AFTER INSERT OR UPDATE OF status
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_queue_notification();

-- Create profiles for new auth users automatically
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
