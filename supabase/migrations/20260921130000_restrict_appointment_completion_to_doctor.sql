-- Migration: Only the assigned doctor (or an admin) may complete a visit
-- Created: 2026-09-21
-- Purpose: 'completed' means the consultation happened, which is the doctor's
-- call. Staff run the front desk: confirm, check in, call in, cancel, no-show.
--
-- Two paths could set status = 'completed' for staff, and both are closed here:
--   1. Direct table UPDATE -- the staff policy had no status restriction.
--   2. public.complete_appointment() -- SECURITY DEFINER with no role check and
--      EXECUTE granted to PUBLIC, so it bypassed RLS for anyone, even anon.
-- The doctor's own path (policy "doctor update own appointments" and the RPC
-- for their own appointment) is unchanged and still passes
-- validate_appointment_status_transition (called/in_progress -> completed).
--
-- Not covered (separate follow-up): patients can still set their own
-- appointment to any status via "cancel own appointments".

BEGIN;

-- 1. Staff UPDATE policy: everything except 'completed' --------------------
DROP POLICY IF EXISTS "staff and admin update all appointments" ON public.appointments;
DROP POLICY IF EXISTS "admin update all appointments" ON public.appointments;
DROP POLICY IF EXISTS "staff update appointments except completion" ON public.appointments;

CREATE POLICY "admin update all appointments"
  ON public.appointments
  FOR UPDATE
  USING (
    (auth.jwt() ->> 'app_role') = 'admin' OR public.is_admin()
  )
  WITH CHECK (
    (auth.jwt() ->> 'app_role') = 'admin' OR public.is_admin()
  );

CREATE POLICY "staff update appointments except completion"
  ON public.appointments
  FOR UPDATE
  USING (
    (auth.jwt() ->> 'app_role') = 'staff' OR public.is_staff()
  )
  WITH CHECK (
    ((auth.jwt() ->> 'app_role') = 'staff' OR public.is_staff())
    AND status <> 'completed'
  );

-- 2. complete_appointment(): assigned doctor or admin only ------------------
CREATE OR REPLACE FUNCTION public.complete_appointment(
  p_appointment_id uuid,
  p_duration_minutes integer DEFAULT NULL::integer
)
RETURNS appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  target_appointment public.appointments%ROWTYPE;
  v_duration integer;
BEGIN
  SELECT * INTO target_appointment
  FROM public.appointments
  WHERE id = p_appointment_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  -- service_role (server-side jobs) is trusted; every signed-in user must be
  -- an admin or the doctor this appointment is assigned to.
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.is_admin()
     AND NOT EXISTS (
       SELECT 1
       FROM public.doctors d
       WHERE d.id = target_appointment.doctor_id
         AND d.profile_id = auth.uid()
     )
  THEN
    RAISE EXCEPTION 'Only the assigned doctor can complete this appointment'
      USING ERRCODE = '42501';
  END IF;

  IF p_duration_minutes IS NOT NULL THEN
    v_duration := p_duration_minutes;
  ELSIF target_appointment.started_at IS NOT NULL THEN
    v_duration := GREATEST(1, EXTRACT(EPOCH FROM (now() - target_appointment.started_at))::integer / 60);
  ELSE
    v_duration := 15;
  END IF;

  UPDATE public.appointments
  SET status = 'completed', completed_at = now(), duration_minutes = v_duration
  WHERE id = p_appointment_id
  RETURNING * INTO target_appointment;

  RETURN target_appointment;
END;
$function$;

-- Signed-in users only; the role check above decides which of them.
REVOKE ALL ON FUNCTION public.complete_appointment(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_appointment(uuid, integer) TO authenticated;

COMMIT;
