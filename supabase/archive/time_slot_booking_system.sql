-- QueueLess Time Slot Booking System
-- Uses existing appointment_date and appointment_time columns. No columns are
-- created here.

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_one_active_per_slot
  ON public.appointments(center_id, appointment_date, appointment_time)
  WHERE status <> 'cancelled';

CREATE OR REPLACE FUNCTION public.get_available_slots(
  p_appointment_date date,
  p_center_id uuid DEFAULT NULL
)
RETURNS text[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH slots(slot_time) AS (
    VALUES
      ('09:00 AM'::text),
      ('09:30 AM'::text),
      ('10:00 AM'::text),
      ('10:30 AM'::text),
      ('11:00 AM'::text)
  ),
  booked(slot_time) AS (
    SELECT DISTINCT
      CASE
        WHEN appointment_time ~ '^\d{2}:\d{2}(:\d{2})?$'
          THEN to_char(appointment_time::time, 'HH12:MI AM')
        ELSE upper(trim(appointment_time))
      END AS slot_time
    FROM public.appointments
    WHERE appointment_date = p_appointment_date
      AND status <> 'cancelled'
      AND (
        p_center_id IS NULL
        OR center_id = p_center_id
      )
  )
  SELECT COALESCE(array_agg(slots.slot_time ORDER BY slots.slot_time), '{}'::text[])
  FROM slots
  WHERE NOT EXISTS (
    SELECT 1
    FROM booked
    WHERE booked.slot_time = slots.slot_time
  );
$$;

REVOKE ALL ON FUNCTION public.get_available_slots(date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_available_slots(date, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
