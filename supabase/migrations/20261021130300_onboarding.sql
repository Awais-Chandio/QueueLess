-- Phase 1B.4: owner onboarding and clinic settings from the web app.
--
-- create_organization(...)   signed-in user -> owner of a new organization
--                            with its first center, a default service and
--                            doctors (Free plan limits apply)
-- org_invites                receptionist invites by email; the invitee signs
--                            in with that (confirmed) email and calls
--                            accept_invites()
-- upsert_doctor / update_center / remove_staff / revoke_invite / invite_staff
-- get_org_settings(org)      everything the settings page shows, owners only
--
-- protect_doctor_admin_fields: owners may now edit their own doctors' name,
-- active flag and the other admin fields (not center or linked account).

-- ---------------------------------------------------------------------------
-- Owners edit their doctors
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_doctor_admin_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    -- Never: move a doctor to another center or relink their account.
    NEW.center_id := OLD.center_id;
    NEW.profile_id := OLD.profile_id;
    IF NOT private.has_org_role(private.center_organization(OLD.center_id), ARRAY['owner']) THEN
      NEW.employee_code := OLD.employee_code;
      NEW.license_number := OLD.license_number;
      NEW.fee := OLD.fee;
      NEW.status := OLD.status;
      NEW.is_active := OLD.is_active;
      NEW.name := OLD.name;
      NEW.gender := OLD.gender;
      NEW.experience_years := OLD.experience_years;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE FUNCTION private.require_owner(p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Clinic not found' USING ERRCODE = 'PT404';
  END IF;
  IF NOT private.is_server_context() AND NOT public.is_admin() AND NOT private.has_org_role(p_org_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Only the clinic owner can do this' USING ERRCODE = '42501';
  END IF;
END;
$function$;

-- Refuses activating one more doctor than the plan allows.
CREATE FUNCTION private.check_doctor_limit(p_org_id uuid, p_adding integer)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_max integer;
  v_active integer;
BEGIN
  SELECT max_doctors INTO v_max FROM public.org_entitlements WHERE organization_id = p_org_id;
  IF v_max IS NULL THEN
    RETURN;
  END IF;
  SELECT count(*) INTO v_active
  FROM public.doctors d JOIN public.service_centers c ON c.id = d.center_id
  WHERE c.organization_id = p_org_id AND d.is_active;
  IF v_active + p_adding > v_max THEN
    RAISE EXCEPTION 'Your plan allows % active doctor(s). Upgrade to add more.', v_max USING ERRCODE = 'PT402';
  END IF;
END;
$function$;

CREATE FUNCTION private.clean_text(p_text text, p_max integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT NULLIF(left(btrim(regexp_replace(COALESCE(p_text, ''), '\s+', ' ', 'g')), p_max), '');
$function$;

-- ---------------------------------------------------------------------------
-- Doctors
-- ---------------------------------------------------------------------------

-- New doctor (p_doctor_id NULL) or edit. Linked to the center's first service
-- so tokens can be issued; average minutes feed the ETA.
CREATE FUNCTION public.upsert_doctor(
  p_center_id uuid, p_doctor_id uuid, p_name text, p_specialty text, p_room text,
  p_average_minutes numeric DEFAULT NULL, p_is_active boolean DEFAULT true
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_org uuid := private.center_organization(p_center_id);
  v_name text := private.clean_text(p_name, 100);
  v_specialty text := COALESCE(private.clean_text(p_specialty, 100), 'General Physician');
  v_room text := private.clean_text(p_room, 30);
  v_doctor public.doctors%ROWTYPE;
  v_id uuid := p_doctor_id;
BEGIN
  PERFORM private.require_owner(v_org);
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Please enter the doctor''s name' USING ERRCODE = '22023';
  END IF;
  IF p_average_minutes IS NOT NULL AND (p_average_minutes < 1 OR p_average_minutes > 120) THEN
    RAISE EXCEPTION 'Average consultation time must be 1 to 120 minutes' USING ERRCODE = '22023';
  END IF;

  IF v_id IS NULL THEN
    IF COALESCE(p_is_active, true) THEN
      PERFORM private.check_doctor_limit(v_org, 1);
    END IF;
    INSERT INTO public.doctors (center_id, name, specialty, room, is_active)
    VALUES (p_center_id, v_name, v_specialty, v_room, COALESCE(p_is_active, true))
    RETURNING id INTO v_id;

    INSERT INTO public.doctor_services (doctor_id, service_id)
    SELECT v_id, s.id FROM public.services s WHERE s.center_id = p_center_id ORDER BY s.created_at, s.id LIMIT 1;
  ELSE
    SELECT * INTO v_doctor FROM public.doctors WHERE id = v_id FOR UPDATE;
    IF NOT FOUND OR v_doctor.center_id <> p_center_id THEN
      RAISE EXCEPTION 'Doctor not found' USING ERRCODE = 'PT404';
    END IF;
    IF COALESCE(p_is_active, true) AND NOT v_doctor.is_active THEN
      PERFORM private.check_doctor_limit(v_org, 1);
    END IF;
    UPDATE public.doctors
    SET name = v_name, specialty = v_specialty, room = v_room, is_active = COALESCE(p_is_active, true), updated_at = now()
    WHERE id = v_id;
  END IF;

  IF p_average_minutes IS NOT NULL THEN
    INSERT INTO public.doctor_queue_settings (doctor_id, average_consultation_time, updated_at)
    VALUES (v_id, p_average_minutes, now())
    ON CONFLICT (doctor_id) DO UPDATE SET average_consultation_time = EXCLUDED.average_consultation_time, updated_at = now();
  END IF;

  RETURN v_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Center details and hours
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.update_center(
  p_center_id uuid, p_name text, p_city text, p_address text, p_open_time time, p_close_time time
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_name text := private.clean_text(p_name, 200);
  v_city text := private.clean_text(p_city, 100);
  v_address text := private.clean_text(p_address, 300);
BEGIN
  PERFORM private.require_owner(private.center_organization(p_center_id));
  IF v_name IS NULL OR v_city IS NULL OR v_address IS NULL THEN
    RAISE EXCEPTION 'Name, city and address are required' USING ERRCODE = '22023';
  END IF;
  UPDATE public.service_centers
  SET name = v_name, city = v_city, address = v_address, open_time = p_open_time, close_time = p_close_time
  WHERE id = p_center_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Invites
-- ---------------------------------------------------------------------------
CREATE TABLE public.org_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  center_id uuid NOT NULL REFERENCES public.service_centers(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(btrim(email)) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND char_length(email) <= 254),
  role text NOT NULL DEFAULT 'receptionist' CHECK (role IN ('receptionist')),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX org_invites_one_pending ON public.org_invites (center_id, email) WHERE accepted_at IS NULL;
CREATE INDEX idx_org_invites_email ON public.org_invites (email) WHERE accepted_at IS NULL;

COMMENT ON TABLE public.org_invites IS
  'Staff invites by email. Accepted when the invitee signs in with that confirmed email (accept_invites). Owners read; writes through RPCs.';

ALTER TABLE public.org_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.org_invites FROM anon, authenticated;
GRANT SELECT ON public.org_invites TO authenticated;
CREATE POLICY "owners read their invites" ON public.org_invites
  FOR SELECT TO authenticated
  USING (private.has_org_role(organization_id, ARRAY['owner']) OR public.is_admin());

CREATE FUNCTION public.invite_staff(p_center_id uuid, p_email text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_org uuid := private.center_organization(p_center_id);
  v_email text := lower(btrim(COALESCE(p_email, '')));
  v_id uuid;
BEGIN
  PERFORM private.require_owner(v_org);
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR char_length(v_email) > 254 THEN
    RAISE EXCEPTION 'Please enter a valid email address' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.org_invites WHERE organization_id = v_org AND accepted_at IS NULL) >= 20 THEN
    RAISE EXCEPTION 'Too many pending invites' USING ERRCODE = 'PT429';
  END IF;

  INSERT INTO public.org_invites (organization_id, center_id, email, invited_by)
  VALUES (v_org, p_center_id, v_email, auth.uid())
  ON CONFLICT (center_id, email) WHERE accepted_at IS NULL DO UPDATE SET created_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE FUNCTION public.revoke_invite(p_invite_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_invite public.org_invites%ROWTYPE;
BEGIN
  SELECT * INTO v_invite FROM public.org_invites WHERE id = p_invite_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found' USING ERRCODE = 'PT404';
  END IF;
  PERFORM private.require_owner(v_invite.organization_id);
  DELETE FROM public.org_invites WHERE id = p_invite_id AND accepted_at IS NULL;
END;
$function$;

-- The signed-in user's confirmed email has pending invites: become a
-- receptionist of those centers. Returns how many were accepted.
-- profiles.role is left alone (the web app goes by org_members); the
-- membership is written here because the staff_centers sync only covers
-- profiles with role 'staff'.
CREATE FUNCTION public.accept_invites()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_invite public.org_invites%ROWTYPE;
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501';
  END IF;
  SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = v_uid AND u.email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_invite IN
    SELECT * FROM public.org_invites WHERE email = v_email AND accepted_at IS NULL FOR UPDATE
  LOOP
    INSERT INTO public.staff_centers (profile_id, center_id) VALUES (v_uid, v_invite.center_id) ON CONFLICT DO NOTHING;
    INSERT INTO public.org_members (organization_id, user_id, role)
    VALUES (v_invite.organization_id, v_uid, v_invite.role) ON CONFLICT DO NOTHING;
    UPDATE public.org_invites SET accepted_at = now(), accepted_by = v_uid WHERE id = v_invite.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

-- Takes a receptionist off a center; the membership goes with their last
-- center in the organization (staff_centers sync trigger).
CREATE FUNCTION public.remove_staff(p_center_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_org uuid := private.center_organization(p_center_id);
BEGIN
  PERFORM private.require_owner(v_org);
  DELETE FROM public.staff_centers WHERE profile_id = p_user_id AND center_id = p_center_id;
  -- Receptionists added by invite have no 'staff' profile role, so the sync
  -- trigger may not have created / removed it; do it here as well.
  DELETE FROM public.org_members m
  WHERE m.organization_id = v_org AND m.user_id = p_user_id AND m.role = 'receptionist'
    AND NOT EXISTS (SELECT 1 FROM public.staff_centers sc JOIN public.service_centers c ON c.id = sc.center_id
                    WHERE sc.profile_id = p_user_id AND c.organization_id = v_org);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Onboarding
-- ---------------------------------------------------------------------------

-- p_doctors: [{"name": "...", "specialty": "...", "room": "..."}, ...]
CREATE FUNCTION public.create_organization(
  p_org_name text, p_center_name text, p_city text, p_address text,
  p_doctors jsonb DEFAULT '[]'::jsonb,
  p_timezone text DEFAULT 'Asia/Karachi',
  p_open_time time DEFAULT NULL, p_close_time time DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_org_name text := private.clean_text(p_org_name, 200);
  v_center_name text := COALESCE(private.clean_text(p_center_name, 200), private.clean_text(p_org_name, 200));
  v_city text := private.clean_text(p_city, 100);
  v_address text := private.clean_text(p_address, 300);
  v_org_id uuid := gen_random_uuid();
  v_center public.service_centers%ROWTYPE;
  v_doctor jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501';
  END IF;
  IF v_org_name IS NULL OR v_city IS NULL OR v_address IS NULL THEN
    RAISE EXCEPTION 'Clinic name, city and address are required' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(COALESCE(p_doctors, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Doctors must be a list' USING ERRCODE = '22023';
  END IF;
  -- One account doesn't need many clinics; this stops scripted sign-up spam.
  IF (SELECT count(*) FROM public.org_members WHERE user_id = v_uid AND role = 'owner') >= 5 THEN
    RAISE EXCEPTION 'This account already owns 5 clinics' USING ERRCODE = 'PT429';
  END IF;

  -- Organization (Free subscription and credits come from its triggers).
  INSERT INTO public.organizations (id, name, slug, timezone)
  VALUES (v_org_id, v_org_name, private.slugify(v_org_name) || '-' || left(v_org_id::text, 8), COALESCE(NULLIF(btrim(p_timezone), ''), 'Asia/Karachi'));

  INSERT INTO public.org_members (organization_id, user_id, role) VALUES (v_org_id, v_uid, 'owner');

  INSERT INTO public.service_centers (name, city, address, organization_id, open_time, close_time, category)
  VALUES (v_center_name, v_city, v_address, v_org_id, p_open_time, p_close_time, 'Clinic')
  RETURNING * INTO v_center;

  INSERT INTO public.services (center_id, name, duration_minutes)
  VALUES (v_center.id, 'General consultation', 15);

  FOR v_doctor IN SELECT * FROM jsonb_array_elements(COALESCE(p_doctors, '[]'::jsonb)) LOOP
    PERFORM public.upsert_doctor(v_center.id, NULL, v_doctor->>'name', v_doctor->>'specialty', v_doctor->>'room',
                                 NULLIF(v_doctor->>'average_minutes', '')::numeric, true);
  END LOOP;

  RETURN jsonb_build_object(
    'organization_id', v_org_id,
    'center_id', v_center.id,
    'center_slug', v_center.slug
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- Settings page
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.get_org_settings(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_org public.organizations%ROWTYPE;
  v_today date;
BEGIN
  PERFORM private.require_owner(p_org_id);
  SELECT * INTO v_org FROM public.organizations WHERE id = p_org_id;
  v_today := (now() AT TIME ZONE v_org.timezone)::date;

  RETURN jsonb_build_object(
    'organization', jsonb_build_object('id', v_org.id, 'name', v_org.name, 'slug', v_org.slug,
                                       'timezone', v_org.timezone, 'status', v_org.status),
    'centers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', c.id, 'name', c.name, 'slug', c.slug, 'city', c.city, 'address', c.address,
               'open_time', c.open_time, 'close_time', c.close_time,
               'display_key', (SELECT k.display_key FROM public.center_displays k WHERE k.center_id = c.id)
             ) ORDER BY c.created_at, c.id)
      FROM public.service_centers c WHERE c.organization_id = p_org_id
    ), '[]'::jsonb),
    'doctors', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', d.id, 'center_id', d.center_id, 'name', d.name, 'specialty', d.specialty, 'room', d.room,
               'is_active', d.is_active, 'is_on_break', d.is_on_break, 'has_account', d.profile_id IS NOT NULL,
               'average_minutes', COALESCE(q.average_consultation_time, 10),
               'takes_tokens', private.doctor_takes_tokens(d.id)
             ) ORDER BY d.created_at, d.id)
      FROM public.doctors d
      JOIN public.service_centers c ON c.id = d.center_id
      LEFT JOIN public.doctor_queue_settings q ON q.doctor_id = d.id
      WHERE c.organization_id = p_org_id
    ), '[]'::jsonb),
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'user_id', m.user_id,
               'email', u.email,
               'full_name', NULLIF(pr.full_name, ''),
               'roles', m.roles,
               'center_ids', COALESCE((
                 SELECT jsonb_agg(sc.center_id) FROM public.staff_centers sc
                 JOIN public.service_centers c ON c.id = sc.center_id
                 WHERE sc.profile_id = m.user_id AND c.organization_id = p_org_id), '[]'::jsonb)
             ) ORDER BY u.email)
      FROM (SELECT user_id, jsonb_agg(role ORDER BY role) AS roles
            FROM public.org_members WHERE organization_id = p_org_id GROUP BY user_id) m
      JOIN auth.users u ON u.id = m.user_id
      LEFT JOIN public.profiles pr ON pr.id = m.user_id
    ), '[]'::jsonb),
    'invites', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'center_id', i.center_id, 'created_at', i.created_at)
                       ORDER BY i.created_at)
      FROM public.org_invites i WHERE i.organization_id = p_org_id AND i.accepted_at IS NULL
    ), '[]'::jsonb),
    'plan', (
      SELECT jsonb_build_object('id', e.plan_id, 'name', p.name, 'modules', to_jsonb(e.modules),
                                'tokens_per_day', e.tokens_per_day, 'max_doctors', e.max_doctors,
                                'max_centers', e.max_centers, 'monthly_price_pkr', p.monthly_price_pkr)
      FROM public.org_entitlements e JOIN public.plans p ON p.id = e.plan_id
      WHERE e.organization_id = p_org_id
    ),
    'plans', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'monthly_price_pkr', p.monthly_price_pkr,
                                          'modules', to_jsonb(p.modules), 'tokens_per_day', p.tokens_per_day,
                                          'max_doctors', p.max_doctors, 'max_centers', p.max_centers)
                       ORDER BY p.sort_order)
      FROM public.plans p WHERE p.is_public
    ), '[]'::jsonb),
    'usage', jsonb_build_object(
      'tokens_today', (SELECT count(*) FROM public.appointments a JOIN public.service_centers c ON c.id = a.center_id
                       WHERE c.organization_id = p_org_id AND a.appointment_date = v_today AND a.status <> 'cancelled'),
      'active_doctors', (SELECT count(*) FROM public.doctors d JOIN public.service_centers c ON c.id = d.center_id
                         WHERE c.organization_id = p_org_id AND d.is_active),
      'message_credits', (SELECT balance FROM public.message_credits WHERE organization_id = p_org_id)
    )
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION private.require_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.check_doctor_limit(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.clean_text(text, integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.upsert_doctor(uuid, uuid, text, text, text, numeric, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_center(uuid, text, text, text, time, time) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invite_staff(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_invite(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_invites() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_staff(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_organization(text, text, text, text, jsonb, text, time, time) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_org_settings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_doctor(uuid, uuid, text, text, text, numeric, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_center(uuid, text, text, text, time, time) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.invite_staff(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_invite(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_invites() TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_staff(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_organization(text, text, text, text, jsonb, text, time, time) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_settings(uuid) TO authenticated, service_role;

notify pgrst, 'reload schema';
