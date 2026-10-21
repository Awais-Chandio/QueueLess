-- Phase 0.4: RLS fixes.
--
-- 1. appointments: no direct INSERT; booking only through book_appointment(),
--    which now also validates the doctor/center/service it is given.
-- 2. Staff see and change appointments only at their own centers
--    (staff_centers); the same scope for the queue tables they write to.
-- 3. profiles: staff see only patients who have an appointment at one of their
--    centers (was: every profile).
-- 4. Avatars: users can write only under <their uid>/ in the avatars bucket.
-- 5. slot_locks: users see only their own locks.
-- 6. current_token_view / queue_view run with the caller's rights.
--
-- Role checks use the is_admin()/is_staff() helpers; center scope uses the
-- private.* helpers from 20261021080419_lock_down_rpcs.sql.

-- ---------------------------------------------------------------------------
-- 1. appointments: booking only via book_appointment()
-- ---------------------------------------------------------------------------

DROP POLICY "users_insert_own_appointments" ON public.appointments;
REVOKE INSERT ON public.appointments FROM anon, authenticated;

-- book_appointment() is now the only way in, so it checks what the old INSERT
-- path never did: the lock's doctor works at the lock's center and the
-- service is offered there.
CREATE OR REPLACE FUNCTION public.lock_slot(p_doctor_id uuid, p_center_id uuid, p_date date, p_time text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_lock_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Please log in to book' using errcode = '42501';
  end if;

  if p_date < (now() at time zone 'Asia/Karachi')::date then
    raise exception 'Please select a future date';
  end if;

  if not exists (select 1 from public.service_centers where id = p_center_id) then
    raise exception 'Clinic not found';
  end if;

  if p_doctor_id is not null and not exists (
    select 1 from public.doctors d
    where d.id = p_doctor_id and d.center_id = p_center_id and d.is_active
  ) then
    raise exception 'This doctor is not available at this clinic';
  end if;

  delete from public.slot_locks where expires_at <= now();

  if exists (
    select 1 from public.appointments
    where doctor_id = p_doctor_id and appointment_date = p_date and status <> 'cancelled'
      and to_char(appointment_time,'HH12:MI AM') = p_time
  ) then
    raise exception 'Slot already booked';
  end if;

  if exists (
    select 1 from public.slot_locks
    where doctor_id = p_doctor_id and appointment_date = p_date and appointment_time = p_time
      and expires_at > now()
  ) then
    raise exception 'Slot currently locked by someone else';
  end if;

  insert into public.slot_locks (user_id, doctor_id, center_id, appointment_date, appointment_time, locked_at, expires_at)
  values (auth.uid(), p_doctor_id, p_center_id, p_date, p_time, now(), now() + interval '10 minutes')
  returning id into v_lock_id;

  return v_lock_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.book_appointment(p_lock_id uuid, p_service_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_lock record;
  v_appointment_id uuid;
  v_time time;
begin
  select * into v_lock from public.slot_locks where id = p_lock_id and user_id = auth.uid() and expires_at > now();
  if v_lock is null then
    raise exception 'Lock expired or not found — please pick a slot again';
  end if;

  if not exists (
    select 1 from public.services s
    where s.id = p_service_id and s.center_id = v_lock.center_id
  ) then
    raise exception 'This service is not offered at this clinic';
  end if;

  v_time := to_timestamp(v_lock.appointment_time, 'HH12:MI AM')::time;

  insert into public.appointments (user_id, center_id, service_id, doctor_id, appointment_date, appointment_time, scheduled_at, status, notes)
  values (auth.uid(), v_lock.center_id, p_service_id, v_lock.doctor_id, v_lock.appointment_date, v_time,
          (v_lock.appointment_date + v_time) at time zone 'Asia/Karachi', 'pending', p_notes)
  returning id into v_appointment_id;

  delete from public.slot_locks where id = p_lock_id;

  return v_appointment_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Staff scope: own centers only
-- ---------------------------------------------------------------------------

DROP POLICY "staff and admin view all appointments" ON public.appointments;

CREATE POLICY "admin view all appointments" ON public.appointments
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "staff view appointments at own centers" ON public.appointments
  FOR SELECT TO authenticated
  USING (private.is_center_staff(center_id));

DROP POLICY "staff update appointments except completion" ON public.appointments;

-- WITH CHECK also stops staff moving an appointment to another center.
CREATE POLICY "staff update appointments at own centers except completion" ON public.appointments
  FOR UPDATE TO authenticated
  USING (private.is_center_staff(center_id))
  WITH CHECK (private.is_center_staff(center_id) AND status <> 'completed');

-- Queue tables staff write to directly (same hole: any staff, any center).
DROP POLICY "Staff and admin modify settings" ON public.center_queue_settings;
CREATE POLICY "staff and admin modify own center settings" ON public.center_queue_settings
  FOR ALL TO authenticated
  USING (private.can_manage_center(center_id))
  WITH CHECK (private.can_manage_center(center_id));

DROP POLICY "staff and admin modify daily tokens" ON public.center_daily_tokens;
CREATE POLICY "staff and admin modify own center daily tokens" ON public.center_daily_tokens
  FOR ALL TO authenticated
  USING (private.can_manage_center(center_id))
  WITH CHECK (private.can_manage_center(center_id));

DROP POLICY "Staff can manage doctor queue settings" ON public.doctor_queue_settings;
CREATE POLICY "staff and admin manage own center doctor queue settings" ON public.doctor_queue_settings
  FOR ALL TO authenticated
  USING (public.is_admin() OR EXISTS (
    SELECT 1 FROM public.doctors d WHERE d.id = doctor_id AND private.is_center_staff(d.center_id)
  ))
  WITH CHECK (public.is_admin() OR EXISTS (
    SELECT 1 FROM public.doctors d WHERE d.id = doctor_id AND private.is_center_staff(d.center_id)
  ));

DROP POLICY "Staff can view queue updates" ON public.queue_updates;
DROP POLICY "Staff can create queue updates" ON public.queue_updates;
DROP POLICY "staff and admin update queue updates" ON public.queue_updates;
DROP POLICY "staff and admin delete queue updates" ON public.queue_updates;

CREATE POLICY "staff and admin view own center queue updates" ON public.queue_updates
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = appointment_id AND private.can_manage_center(a.center_id)
  ));

CREATE POLICY "staff and admin create own center queue updates" ON public.queue_updates
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = appointment_id AND private.can_manage_center(a.center_id)
  ));

CREATE POLICY "staff and admin update own center queue updates" ON public.queue_updates
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = appointment_id AND private.can_manage_center(a.center_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = appointment_id AND private.can_manage_center(a.center_id)
  ));

CREATE POLICY "staff and admin delete own center queue updates" ON public.queue_updates
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = appointment_id AND private.can_manage_center(a.center_id)
  ));

-- ---------------------------------------------------------------------------
-- 3. profiles: staff see only their centers' patients
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER so the appointments lookup doesn't re-enter RLS.
CREATE OR REPLACE FUNCTION private.staff_can_view_profile(p_profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT public.is_staff()
     AND EXISTS (
       SELECT 1
       FROM public.appointments a
       JOIN public.staff_centers sc ON sc.center_id = a.center_id
       WHERE a.user_id = p_profile_id
         AND sc.profile_id = auth.uid()
     );
$function$;

REVOKE ALL ON FUNCTION private.staff_can_view_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.staff_can_view_profile(uuid) TO authenticated, service_role;

DROP POLICY "Staff and admin view all profiles" ON public.profiles;

CREATE POLICY "admin view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "staff view patients at own centers" ON public.profiles
  FOR SELECT TO authenticated
  USING (private.staff_can_view_profile(id));

-- ---------------------------------------------------------------------------
-- 4. Avatars: own folder only (the app uploads to <uid>/avatar.<ext>)
-- ---------------------------------------------------------------------------

DROP POLICY "avatars_insert" ON storage.objects;
DROP POLICY "avatars_update" ON storage.objects;
DROP POLICY "avatars_delete" ON storage.objects;

CREATE POLICY "avatars_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE POLICY "avatars_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE POLICY "avatars_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

-- ---------------------------------------------------------------------------
-- 5. slot_locks: own locks only (get_available_slots/lock_slot see all locks
--    server-side, so the booking flow doesn't need to read other people's)
-- ---------------------------------------------------------------------------

DROP POLICY "Anyone can view active slot locks" ON public.slot_locks;

CREATE POLICY "Users can view own slot locks" ON public.slot_locks
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 6. Views: caller's rights (advisor: security_definer_view). No client role
--    has SELECT on either view, so nothing the app sees changes.
-- ---------------------------------------------------------------------------

ALTER VIEW public.current_token_view SET (security_invoker = true);
ALTER VIEW public.queue_view SET (security_invoker = true);

notify pgrst, 'reload schema';
