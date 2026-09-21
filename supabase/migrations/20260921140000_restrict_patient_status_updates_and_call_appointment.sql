-- Migration: Stop patients from setting arbitrary statuses; lock down call_appointment()
-- Created: 2026-09-21
-- Purpose: follow-up to 20260921130000_restrict_appointment_completion_to_doctor.sql.
--
-- 1. "cancel own appointments" only checked ownership, so a patient could set
--    their own appointment to any status the transition trigger allows --
--    e.g. called -> completed, or pending -> confirmed. The WITH CHECK now
--    limits a patient's writes to two statuses:
--      * 'cancelled'  -- the patient cancel flow. The app cancels through the
--                        cancel_appointment() RPC (SECURITY DEFINER, so
--                        unaffected) and falls back to a direct UPDATE.
--      * 'checked_in' -- the patient self check-in in
--                        appointmentService.checkInAppointment(), a direct
--                        UPDATE confirmed -> checked_in used by
--                        AppointmentDetailsScreen and QueueStatusScreen. Only
--                        'cancelled' was requested, but that would have broken
--                        this live feature. validate_appointment_status_transition
--                        still limits it to confirmed -> checked_in.
--    Side effect: a patient UPDATE that leaves status at 'pending'/'confirmed'
--    (e.g. appointmentService.rescheduleAppointment, which has no callers) is
--    now rejected too.
--
-- 2. call_appointment() was SECURITY DEFINER with no role check and EXECUTE for
--    PUBLIC (so anon). It now requires staff, admin, the assigned doctor, or
--    service_role, matching complete_appointment(). Its body is otherwise
--    unchanged.

BEGIN;

-- 1. Patient UPDATE policy --------------------------------------------------
DROP POLICY IF EXISTS "cancel own appointments" ON public.appointments;

CREATE POLICY "cancel own appointments"
  ON public.appointments
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND status IN ('cancelled', 'checked_in')
  );

-- 2. call_appointment(): staff, admin, or the assigned doctor ---------------
CREATE OR REPLACE FUNCTION public.call_appointment(p_appointment_id uuid)
RETURNS appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  called_appointment public.appointments%ROWTYPE;
BEGIN
  SELECT * INTO called_appointment
  FROM public.appointments
  WHERE id = p_appointment_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  -- service_role (server-side jobs) is trusted; every signed-in user must be
  -- staff, an admin, or the doctor this appointment is assigned to.
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.is_staff()
     AND NOT public.is_admin()
     AND NOT EXISTS (
       SELECT 1
       FROM public.doctors d
       WHERE d.id = called_appointment.doctor_id
         AND d.profile_id = auth.uid()
     )
  THEN
    RAISE EXCEPTION 'Only staff or the assigned doctor can call this appointment'
      USING ERRCODE = '42501';
  END IF;

  IF called_appointment.status NOT IN ('confirmed', 'checked_in', 'pending') THEN
    RAISE EXCEPTION 'Cannot call appointment from status: %', called_appointment.status;
  END IF;

  UPDATE public.appointments
  SET status = 'called', called_at = now()
  WHERE id = p_appointment_id
  RETURNING * INTO called_appointment;

  RETURN called_appointment;
END;
$function$;

REVOKE ALL ON FUNCTION public.call_appointment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.call_appointment(uuid) TO authenticated;

COMMIT;
