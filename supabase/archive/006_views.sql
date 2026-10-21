-- 006_views.sql

-- Drop the old view if it exists
DROP VIEW IF EXISTS public.appointments_full;

-- Recreate view with security_invoker = true
CREATE OR REPLACE VIEW public.appointments_full
WITH (security_invoker = true)
AS
WITH latest_queue_updates AS (
  -- Retrieve the latest queue update record for each appointment
  SELECT DISTINCT ON (queue_updates.appointment_id)
    queue_updates.appointment_id,
    queue_updates.current_position,
    queue_updates.people_ahead,
    queue_updates.estimated_wait_mins,
    queue_updates.current_serving_token,
    queue_updates.status AS queue_status
  FROM public.queue_updates
  ORDER BY queue_updates.appointment_id, queue_updates.created_at DESC
)
SELECT
  appointments.id,
  appointments.user_id,
  profiles.full_name AS patient_name,
  appointments.center_id,
  appointments.service_id,
  appointments.doctor_id,
  doctors.name AS doctor_name,
  service_centers.name AS center_name,
  services.name AS service_name,
  appointments.scheduled_at,
  appointments.appointment_date,
  appointments.appointment_time,
  appointments.status,
  appointments.token_number,
  appointments.notes,
  appointments.cancel_reason,
  appointments.cancelled_by,
  appointments.cancelled_at,
  appointments.checked_in_at,
  appointments.called_at,
  appointments.started_at,
  appointments.completed_at,
  appointments.skipped_at,
  appointments.duration_minutes,
  appointments.created_at,
  COALESCE(
    latest_queue_updates.estimated_wait_mins,
    appointments.estimated_wait_mins
  ) AS estimated_wait_mins,
  COALESCE(
    latest_queue_updates.estimated_wait_mins,
    appointments.estimated_wait_mins
  ) AS estimated_wait_time,
  latest_queue_updates.current_position,
  latest_queue_updates.current_position AS queue_position,
  latest_queue_updates.people_ahead,
  latest_queue_updates.queue_status,
  latest_queue_updates.current_serving_token,
  latest_queue_updates.current_serving_token AS current_token,
  -- Map doctor consulting fields to center queue settings for frontend compatibility
  COALESCE(
    center_queue_settings.average_consultation_time,
    10.0
  ) AS doctor_average_time,
  COALESCE(
    center_queue_settings.average_consultation_time,
    10.0
  ) AS average_consultation_time,
  (
    COALESCE(center_queue_settings.is_on_break, false)
    OR (
      center_queue_settings.break_start IS NOT NULL
      AND center_queue_settings.break_start <= now()
      AND (
        center_queue_settings.break_end IS NULL
        OR center_queue_settings.break_end > now()
      )
    )
  ) AS is_on_break,
  center_queue_settings.break_start AS break_start,
  center_queue_settings.break_end AS break_end
FROM public.appointments
LEFT JOIN public.profiles
  ON profiles.id = appointments.user_id
LEFT JOIN public.service_centers
  ON service_centers.id = appointments.center_id
LEFT JOIN public.services
  ON services.id = appointments.service_id
LEFT JOIN public.doctors
  ON doctors.id = appointments.doctor_id
LEFT JOIN latest_queue_updates
  ON latest_queue_updates.appointment_id = appointments.id
LEFT JOIN public.center_queue_settings
  ON center_queue_settings.center_id::text = appointments.center_id::text
  AND center_queue_settings.appointment_date = appointments.appointment_date;
