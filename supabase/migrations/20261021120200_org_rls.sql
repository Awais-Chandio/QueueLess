-- Phase 1A.3: policies and RPC caller checks use organization membership.
--
-- 1. The caller-check helpers every policy/RPC already goes through now ask
--    org_members instead of profiles.role:
--      is_center_staff(center) = owner of the center's organization, or its
--        receptionist AND assigned to that center (staff_centers stays the
--        center scope inside an organization).
--      is_doctor_self(doctor)  = the doctor's own account AND a doctor member
--        of the doctor's organization.
--    can_manage_center / can_manage_doctor / can_operate_appointment /
--    can_view_appointment build on these, so every RPC that uses them
--    (call/confirm/start/complete, queue snapshots, breaks, ...) follows.
-- 2. Policies that checked the role inline (doctors.profile_id subqueries, JWT
--    app_role claims, profiles.role subqueries) use the helpers.
-- 3. center_daily_tokens was readable by every signed-in user (other clinics'
--    daily volumes); now staff of the center and platform admins only.
-- 4. appointments: clients may only UPDATE the columns the app writes. Patients
--    could previously rewrite center_id/doctor_id/token_number on their own
--    row, i.e. move it into another clinic's queue.

-- ---------------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.is_center_staff(p_center_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.service_centers c
    WHERE c.id = p_center_id
      AND (
        private.has_org_role(c.organization_id, ARRAY['owner'])
        OR (
          private.has_org_role(c.organization_id, ARRAY['receptionist'])
          AND EXISTS (
            SELECT 1 FROM public.staff_centers sc
            WHERE sc.profile_id = auth.uid() AND sc.center_id = c.id
          )
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION private.is_doctor_self(p_doctor_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.doctors d
    JOIN public.service_centers c ON c.id = d.center_id
    WHERE d.id = p_doctor_id
      AND d.profile_id = auth.uid()
      AND private.has_org_role(c.organization_id, ARRAY['doctor'])
  );
$function$;

-- Staff may read the profile of a patient who has an appointment at a center
-- they operate.
CREATE OR REPLACE FUNCTION private.staff_can_view_profile(p_profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.appointments a
    WHERE a.user_id = p_profile_id
      AND private.is_center_staff(a.center_id)
  );
$function$;

-- ---------------------------------------------------------------------------
-- 2. Policies
-- ---------------------------------------------------------------------------

-- appointments
DROP POLICY "admin update all appointments" ON public.appointments;
CREATE POLICY "admin update all appointments" ON public.appointments
  FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY "doctor read own appointments" ON public.appointments;
CREATE POLICY "doctor read own appointments" ON public.appointments
  FOR SELECT TO authenticated
  USING (private.is_doctor_self(doctor_id));

DROP POLICY "doctor update own appointments" ON public.appointments;
CREATE POLICY "doctor update own appointments" ON public.appointments
  FOR UPDATE TO authenticated
  USING (private.is_doctor_self(doctor_id)) WITH CHECK (private.is_doctor_self(doctor_id));

-- center_daily_tokens
DROP POLICY "Enable read access for authenticated users" ON public.center_daily_tokens;
CREATE POLICY "staff and admin read own center daily tokens" ON public.center_daily_tokens
  FOR SELECT TO authenticated
  USING (private.can_manage_center(center_id));

-- doctor_leaves / doctor_queue_settings / doctor_schedules
DROP POLICY "doctor manage own leaves" ON public.doctor_leaves;
CREATE POLICY "doctor manage own leaves" ON public.doctor_leaves
  FOR ALL TO authenticated
  USING (private.is_doctor_self(doctor_id)) WITH CHECK (private.is_doctor_self(doctor_id));

DROP POLICY "doctor manage own queue settings" ON public.doctor_queue_settings;
CREATE POLICY "doctor manage own queue settings" ON public.doctor_queue_settings
  FOR ALL TO authenticated
  USING (private.is_doctor_self(doctor_id)) WITH CHECK (private.is_doctor_self(doctor_id));

DROP POLICY "doctor manage own schedule" ON public.doctor_schedules;
CREATE POLICY "doctor manage own schedule" ON public.doctor_schedules
  FOR ALL TO authenticated
  USING (private.is_doctor_self(doctor_id)) WITH CHECK (private.is_doctor_self(doctor_id));

-- doctors. "admin manage doctors" trusted the JWT app_role claim; the
-- is_admin() policy "admin manage doctors by profile role" already covers it.
DROP POLICY "admin manage doctors" ON public.doctors;

DROP POLICY "staff read doctors at own center" ON public.doctors;
CREATE POLICY "staff read doctors at own center" ON public.doctors
  FOR SELECT TO authenticated
  USING (private.is_center_staff(center_id));

DROP POLICY "staff toggle break" ON public.doctors;
CREATE POLICY "staff toggle break" ON public.doctors
  FOR UPDATE TO authenticated
  USING (private.is_center_staff(center_id)) WITH CHECK (private.is_center_staff(center_id));

-- visit_summaries / prescription_items: the assigned doctor, completed visits.
DROP POLICY "doctor inserts visit summary for completed appointment" ON public.visit_summaries;
CREATE POLICY "doctor inserts visit summary for completed appointment" ON public.visit_summaries
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = visit_summaries.appointment_id
      AND a.status = 'completed'
      AND a.doctor_id = visit_summaries.doctor_id
      AND a.user_id = visit_summaries.patient_id
      AND private.is_doctor_self(a.doctor_id)
  ));

DROP POLICY "doctor reads own visit summaries" ON public.visit_summaries;
CREATE POLICY "doctor reads own visit summaries" ON public.visit_summaries
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = visit_summaries.appointment_id
      AND a.status = 'completed'
      AND private.is_doctor_self(a.doctor_id)
  ));

DROP POLICY "doctor updates own visit summary" ON public.visit_summaries;
CREATE POLICY "doctor updates own visit summary" ON public.visit_summaries
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = visit_summaries.appointment_id
      AND a.status = 'completed'
      AND private.is_doctor_self(a.doctor_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = visit_summaries.appointment_id
      AND a.status = 'completed'
      AND a.doctor_id = visit_summaries.doctor_id
      AND a.user_id = visit_summaries.patient_id
      AND private.is_doctor_self(a.doctor_id)
  ));

DROP POLICY "doctor reads own prescription items" ON public.prescription_items;
CREATE POLICY "doctor reads own prescription items" ON public.prescription_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.visit_summaries vs
    JOIN public.appointments a ON a.id = vs.appointment_id
    WHERE vs.id = prescription_items.visit_summary_id
      AND a.status = 'completed'
      AND private.is_doctor_self(a.doctor_id)
  ));

DROP POLICY "doctor inserts own prescription items" ON public.prescription_items;
CREATE POLICY "doctor inserts own prescription items" ON public.prescription_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.visit_summaries vs
    JOIN public.appointments a ON a.id = vs.appointment_id
    WHERE vs.id = prescription_items.visit_summary_id
      AND a.status = 'completed'
      AND private.is_doctor_self(a.doctor_id)
  ));

DROP POLICY "doctor updates own prescription items" ON public.prescription_items;
CREATE POLICY "doctor updates own prescription items" ON public.prescription_items
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.visit_summaries vs
    JOIN public.appointments a ON a.id = vs.appointment_id
    WHERE vs.id = prescription_items.visit_summary_id
      AND a.status = 'completed'
      AND private.is_doctor_self(a.doctor_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.visit_summaries vs
    JOIN public.appointments a ON a.id = vs.appointment_id
    WHERE vs.id = prescription_items.visit_summary_id
      AND a.status = 'completed'
      AND private.is_doctor_self(a.doctor_id)
  ));

DROP POLICY "doctor deletes own prescription items" ON public.prescription_items;
CREATE POLICY "doctor deletes own prescription items" ON public.prescription_items
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.visit_summaries vs
    JOIN public.appointments a ON a.id = vs.appointment_id
    WHERE vs.id = prescription_items.visit_summary_id
      AND a.status = 'completed'
      AND private.is_doctor_self(a.doctor_id)
  ));

-- queue_updates
DROP POLICY "doctor manage own queue updates" ON public.queue_updates;
CREATE POLICY "doctor manage own queue updates" ON public.queue_updates
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = queue_updates.appointment_id AND private.is_doctor_self(a.doctor_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = queue_updates.appointment_id AND private.is_doctor_self(a.doctor_id)
  ));

-- service_centers: platform admin (was a profiles.role subquery, for PUBLIC).
DROP POLICY "admin manages centers" ON public.service_centers;
CREATE POLICY "admin manages centers" ON public.service_centers
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. RPC caller checks that still matched doctors.profile_id inline
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_center_queue_snapshot(p_center_id uuid, p_queue_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_settings public.center_queue_settings%ROWTYPE;
  v_current_token integer;
  v_next_token integer;
  v_is_on_break boolean;
BEGIN
  IF NOT private.is_server_context()
     AND NOT private.can_manage_center(p_center_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.doctors d
       WHERE d.center_id = p_center_id AND private.is_doctor_self(d.id)
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.appointments a
       WHERE a.center_id = p_center_id AND a.appointment_date = p_queue_date AND a.user_id = auth.uid()
     )
  THEN
    RAISE EXCEPTION 'Not allowed to view this center''s queue'
      USING ERRCODE = '42501';
  END IF;

  -- Ensure settings row exists for the day
  INSERT INTO public.center_queue_settings (center_id, appointment_date)
  VALUES (p_center_id, p_queue_date)
  ON CONFLICT (center_id, appointment_date) DO NOTHING;

  SELECT * INTO v_settings
  FROM public.center_queue_settings
  WHERE center_id = p_center_id AND appointment_date = p_queue_date;

  v_current_token := public.get_current_token(p_center_id, p_queue_date);

  SELECT COALESCE(MAX(token_number), 0) + 1 INTO v_next_token
  FROM public.appointments
  WHERE center_id = p_center_id AND appointment_date = p_queue_date;

  v_is_on_break := COALESCE(v_settings.is_on_break, false)
    OR (v_settings.break_start IS NOT NULL AND v_settings.break_start <= now() AND (v_settings.break_end IS NULL OR v_settings.break_end > now()));

  RETURN jsonb_build_object(
    'center_id', p_center_id,
    'queue_date', p_queue_date,
    'current_token', v_current_token,
    'next_token', v_next_token,
    'doctor_average_time', COALESCE(v_settings.average_consultation_time, 10.0),
    'average_consultation_time', COALESCE(v_settings.average_consultation_time, 10.0),
    'is_on_break', v_is_on_break,
    'break_start', v_settings.break_start,
    'break_end', v_settings.break_end
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_appointment(p_appointment_id uuid, p_duration_minutes integer DEFAULT NULL::integer)
 RETURNS public.appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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

  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.is_admin()
     AND NOT private.is_doctor_self(target_appointment.doctor_id)
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

-- ---------------------------------------------------------------------------
-- 4. appointments: column-level UPDATE for clients. These are the columns the
--    app writes directly (status changes and their timestamps, cancel fields,
--    reschedule). Everything that places a row in a queue (center, doctor,
--    service, date/time slot, token, owner) changes only through RPCs.
-- ---------------------------------------------------------------------------
REVOKE UPDATE ON public.appointments FROM anon, authenticated;
REVOKE INSERT, DELETE ON public.appointments FROM anon;
GRANT UPDATE (
  status, notes, scheduled_at, estimated_wait_mins, queue_position, is_currently_serving,
  approved_by, approved_at, cancelled_by, cancelled_at, cancellation_reason, cancel_reason,
  checked_in_at, called_at, started_at, completed_at, skipped_at, duration_minutes
) ON public.appointments TO authenticated;
