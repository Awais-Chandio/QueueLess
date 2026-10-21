-- Phase 0.4 follow-up: decisions on the open access items.
--
-- 1. audit_logs: staff read (and write) only rows for appointments at their
--    own centers; admin reads all.
-- 2. notifications: no client INSERT; rows come only from triggers/server.
-- 3. avatars: no broad SELECT (listing). Each user reads/writes only their own
--    folder; doctor photos (doctors/<doctor_id>/) are managed by that doctor
--    or an admin. Also fixes a 0.4 regression: the own-folder rule blocked
--    doctor photo uploads, which live under doctors/<doctor_id>/.

-- ---------------------------------------------------------------------------
-- 1. audit_logs (no center column; scope through the appointment)
-- ---------------------------------------------------------------------------

DROP POLICY "Staff can view audit logs" ON public.audit_logs;
DROP POLICY "Staff can insert audit logs" ON public.audit_logs;

CREATE POLICY "admin view all audit logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "staff view own center audit logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = appointment_id AND private.is_center_staff(a.center_id)
  ));

CREATE POLICY "staff and admin insert own center audit logs" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    staff_user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = appointment_id AND private.can_manage_center(a.center_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 2. notifications: created only by triggers / server
-- ---------------------------------------------------------------------------

DROP POLICY "Staff can create notifications" ON public.notifications;
DROP POLICY "users_insert_notifications" ON public.notifications;
REVOKE INSERT ON public.notifications FROM anon, authenticated;

-- These triggers were SECURITY INVOKER, so their INSERT ran as whoever
-- changed the appointment (e.g. staff cancelling via a direct UPDATE). With no
-- client INSERT left they must run as owner. search_path is already ''.
ALTER FUNCTION public.create_notification_on_appointment() SECURITY DEFINER;
ALTER FUNCTION public.create_notification_on_cancel() SECURITY DEFINER;
ALTER FUNCTION public.notify_on_cancel() SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 3. avatars bucket
-- ---------------------------------------------------------------------------

-- Caller may manage files in this top-level-folder path: their own <uid>/
-- folder, or doctors/<doctor_id>/ when they are that doctor or an admin.
-- Compares as text so a malformed path is a plain "no", not a cast error.
CREATE OR REPLACE FUNCTION private.can_manage_avatar_path(p_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN (storage.foldername(p_name))[1] = auth.uid()::text THEN true
    WHEN (storage.foldername(p_name))[1] = 'doctors' THEN
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.doctors d
        WHERE d.id::text = (storage.foldername(p_name))[2]
          AND d.profile_id = auth.uid()
      )
    ELSE false
  END;
$function$;

REVOKE ALL ON FUNCTION private.can_manage_avatar_path(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_manage_avatar_path(text) TO authenticated, service_role;

DROP POLICY "avatars_select" ON storage.objects;
DROP POLICY "avatars_insert" ON storage.objects;
DROP POLICY "avatars_update" ON storage.objects;
DROP POLICY "avatars_delete" ON storage.objects;

-- The bucket is public, so displaying avatars uses public URLs and needs no
-- policy. This SELECT is only for the owner: Storage upserts (upsert: true)
-- and the doctor-photo upload check (.list on its own folder) need it.
CREATE POLICY "avatars_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND private.can_manage_avatar_path(name));

CREATE POLICY "avatars_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND private.can_manage_avatar_path(name));

CREATE POLICY "avatars_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND private.can_manage_avatar_path(name))
  WITH CHECK (bucket_id = 'avatars' AND private.can_manage_avatar_path(name));

CREATE POLICY "avatars_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND private.can_manage_avatar_path(name));

notify pgrst, 'reload schema';
