-- Phase 2B.4: the owner who is also a doctor, doctor logins.
--
-- 1. create_organization(..., p_owner_doctor): onboarding's "Kya aap khud
--    doctor hain?". Yes -> the owner's own doctors row (name, specialty, fee,
--    room) linked to their login, created first, so it is the doctor a
--    one-doctor plan keeps. The same login then holds owner + doctor
--    (org_members, from the doctors sync trigger). add_self_as_doctor does
--    the same later from Settings > Doctors. Both count toward the plan's
--    doctor limit.
-- 2. A doctor login is optional. invite_doctor(doctor, email | phone):
--      email  accepted when they sign in with that confirmed email
--             (accept_invites, as for receptionists) or through the link
--      phone  the owner sends the link (WhatsApp / SMS) to that number
--    Either way the invite has a one-time link /invite/<token>: 7 days,
--    single use, only its hash is stored. accept_doctor_invite(token) links
--    the signed-in user to the doctor. unlink_doctor_account takes it away.
--    One person may be a doctor in several clinics (one doctors row each).
-- 3. protect_doctor_admin_fields: as in 1B.4; the linking functions may set
--    profile_id (a transaction-local flag naming the doctor row).
-- 4. get_my_workspaces: + 'doctors', the caller's own doctor rows in each
--    organization (the "Meri queue" switch). get_my_staff_context: the oldest
--    doctor row first (it returned one at random for a doctor of several
--    clinics).
-- Doctor-only logins: the reception queue stops answering them in 2B.5; the
-- records (get_payment_report), settings and plan RPCs never did.

-- ---------------------------------------------------------------------------
-- 3. Linking a doctor's account
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_doctor_admin_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    -- Never: move a doctor to another center. Relink an account only from
    -- the invite / unlink functions, which name this row.
    NEW.center_id := OLD.center_id;
    IF current_setting('mediq.doctor_link', true) IS DISTINCT FROM OLD.id::text THEN
      NEW.profile_id := OLD.profile_id;
    END IF;
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

CREATE FUNCTION private.set_doctor_profile(p_doctor_id uuid, p_profile_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM set_config('mediq.doctor_link', p_doctor_id::text, true);
  UPDATE public.doctors SET profile_id = p_profile_id, updated_at = now() WHERE id = p_doctor_id;
  PERFORM set_config('mediq.doctor_link', '', true);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 1. The owner as a doctor
-- ---------------------------------------------------------------------------
CREATE FUNCTION private.add_owner_doctor(
  p_center_id uuid, p_user_id uuid, p_name text, p_specialty text, p_room text, p_fee integer
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_org uuid := private.center_organization(p_center_id);
  v_name text := COALESCE(private.clean_text(p_name, 100),
                          (SELECT private.clean_text(pr.full_name, 100) FROM public.profiles pr WHERE pr.id = p_user_id));
  v_id uuid;
BEGIN
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Please enter your name as the patients should see it' USING ERRCODE = '22023';
  END IF;
  IF p_fee IS NOT NULL AND (p_fee < 0 OR p_fee > 1000000) THEN
    RAISE EXCEPTION 'Fee must be 0 to 1,000,000 rupees' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.doctors WHERE center_id = p_center_id AND profile_id = p_user_id) THEN
    RAISE EXCEPTION 'You are already a doctor at this clinic' USING ERRCODE = 'PT409';
  END IF;
  PERFORM private.check_doctor_limit(v_org, 1);

  -- A millisecond before the transaction's other doctors: onboarding creates
  -- them all in one transaction (same now()), and plans keep the oldest.
  INSERT INTO public.doctors (center_id, profile_id, name, specialty, room, is_active, fee, created_at)
  VALUES (p_center_id, p_user_id, v_name, COALESCE(private.clean_text(p_specialty, 100), 'General Physician'),
          private.clean_text(p_room, 30), true, p_fee, now() - interval '1 millisecond')
  RETURNING id INTO v_id;

  INSERT INTO public.doctor_services (doctor_id, service_id)
  SELECT v_id, s.id FROM public.services s WHERE s.center_id = p_center_id ORDER BY s.created_at, s.id LIMIT 1;
  RETURN v_id;
END;
$function$;

CREATE FUNCTION public.add_self_as_doctor(
  p_center_id uuid, p_specialty text, p_room text DEFAULT NULL, p_fee integer DEFAULT NULL, p_name text DEFAULT NULL
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_org uuid := private.center_organization(p_center_id);
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_org_role(v_org, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Only the clinic owner can do this' USING ERRCODE = '42501';
  END IF;
  RETURN private.add_owner_doctor(p_center_id, auth.uid(), p_name, p_specialty, p_room, p_fee);
END;
$function$;

COMMENT ON FUNCTION public.add_self_as_doctor(uuid, text, text, integer, text) IS
  'Owner: "I am a doctor here too": a doctors row linked to the owner''s login (counts toward the plan''s doctors).';

DROP FUNCTION public.create_organization(text, text, text, text, jsonb, text, time, time);

-- As in 1B.4, plus p_owner_doctor: {"specialty", "fee", "room", "name"?}
-- creates the owner's own doctor row first.
CREATE FUNCTION public.create_organization(
  p_org_name text, p_center_name text, p_city text, p_address text,
  p_doctors jsonb DEFAULT '[]'::jsonb,
  p_timezone text DEFAULT 'Asia/Karachi',
  p_open_time time DEFAULT NULL, p_close_time time DEFAULT NULL,
  p_owner_doctor jsonb DEFAULT NULL
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
  v_owner_doctor uuid;
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
  IF p_owner_doctor IS NOT NULL AND jsonb_typeof(p_owner_doctor) <> 'object' THEN
    RAISE EXCEPTION 'Owner doctor must be an object' USING ERRCODE = '22023';
  END IF;
  -- One account doesn't need many clinics; this stops scripted sign-up spam.
  IF (SELECT count(*) FROM public.org_members WHERE user_id = v_uid AND role = 'owner') >= 5 THEN
    RAISE EXCEPTION 'This account already owns 5 clinics' USING ERRCODE = 'PT429';
  END IF;

  -- Organization (trial subscription and credits come from its triggers).
  INSERT INTO public.organizations (id, name, slug, timezone)
  VALUES (v_org_id, v_org_name, private.slugify(v_org_name) || '-' || left(v_org_id::text, 8), COALESCE(NULLIF(btrim(p_timezone), ''), 'Asia/Karachi'));

  INSERT INTO public.org_members (organization_id, user_id, role) VALUES (v_org_id, v_uid, 'owner');

  INSERT INTO public.service_centers (name, city, address, organization_id, open_time, close_time, category)
  VALUES (v_center_name, v_city, v_address, v_org_id, p_open_time, p_close_time, 'Clinic')
  RETURNING * INTO v_center;

  INSERT INTO public.services (center_id, name, duration_minutes)
  VALUES (v_center.id, 'General consultation', 15);

  IF p_owner_doctor IS NOT NULL THEN
    v_owner_doctor := private.add_owner_doctor(
      v_center.id, v_uid, p_owner_doctor->>'name', p_owner_doctor->>'specialty', p_owner_doctor->>'room',
      CASE WHEN COALESCE(p_owner_doctor->>'fee', '') ~ '^[0-9]{1,7}$' THEN (p_owner_doctor->>'fee')::integer END);
  END IF;

  FOR v_doctor IN SELECT * FROM jsonb_array_elements(COALESCE(p_doctors, '[]'::jsonb)) LOOP
    PERFORM public.upsert_doctor(v_center.id, NULL, v_doctor->>'name', v_doctor->>'specialty', v_doctor->>'room',
                                 NULLIF(v_doctor->>'average_minutes', '')::numeric, true,
                                 CASE WHEN COALESCE(v_doctor->>'fee', '') ~ '^[0-9]{1,7}$' THEN (v_doctor->>'fee')::integer END);
  END LOOP;

  RETURN jsonb_build_object(
    'organization_id', v_org_id,
    'center_id', v_center.id,
    'center_slug', v_center.slug,
    'owner_doctor_id', v_owner_doctor
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Doctor invites
-- ---------------------------------------------------------------------------
CREATE TABLE public.doctor_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  email text CHECK (email = lower(btrim(email)) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND char_length(email) <= 254),
  phone text CHECK (phone ~ '^\+?[0-9]{7,15}$'),
  -- sha256 of the link token; the token itself is only returned once.
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CHECK ((email IS NULL) <> (phone IS NULL))
);

CREATE UNIQUE INDEX doctor_invites_one_pending ON public.doctor_invites (doctor_id) WHERE accepted_at IS NULL;
CREATE INDEX idx_doctor_invites_email ON public.doctor_invites (email) WHERE accepted_at IS NULL AND email IS NOT NULL;

COMMENT ON TABLE public.doctor_invites IS
  'Doctor login invites (email or phone) with a one-time link (7 days). Owners read; writes through RPCs.';

ALTER TABLE public.doctor_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.doctor_invites FROM anon, authenticated;
GRANT SELECT (id, organization_id, doctor_id, email, phone, created_at, expires_at, accepted_at) ON public.doctor_invites TO authenticated;
CREATE POLICY "owners read their doctor invites" ON public.doctor_invites
  FOR SELECT TO authenticated
  USING (private.has_org_role(organization_id, ARRAY['owner']) OR public.is_admin());

CREATE FUNCTION private.token_sha256(p_token text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex');
$function$;

-- Returns the link token once: {id, token, email, phone, expires_at}.
CREATE FUNCTION public.invite_doctor(p_doctor_id uuid, p_email text DEFAULT NULL, p_phone text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_doctor public.doctors%ROWTYPE;
  v_org uuid;
  v_email text := NULLIF(lower(btrim(COALESCE(p_email, ''))), '');
  v_phone text := private.normalize_phone(p_phone);
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_invite public.doctor_invites%ROWTYPE;
BEGIN
  SELECT * INTO v_doctor FROM public.doctors WHERE id = p_doctor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Doctor not found' USING ERRCODE = 'PT404';
  END IF;
  v_org := private.center_organization(v_doctor.center_id);
  PERFORM private.require_owner(v_org);
  IF v_doctor.profile_id IS NOT NULL THEN
    RAISE EXCEPTION 'This doctor already has a login' USING ERRCODE = 'PT409';
  END IF;
  IF v_email IS NOT NULL AND (v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR char_length(v_email) > 254) THEN
    RAISE EXCEPTION 'Please enter a valid email address' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(COALESCE(p_phone, '')), '') IS NOT NULL AND v_phone IS NULL THEN
    RAISE EXCEPTION 'Please enter a valid phone number' USING ERRCODE = '22023';
  END IF;
  IF (v_email IS NULL) = (v_phone IS NULL) THEN
    RAISE EXCEPTION 'Invite by email or by phone' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.doctor_invites WHERE organization_id = v_org AND created_at > now() - interval '1 day') >= 30 THEN
    RAISE EXCEPTION 'Too many invites today' USING ERRCODE = 'PT429';
  END IF;

  -- A new invite replaces the doctor's pending one (and its link).
  DELETE FROM public.doctor_invites WHERE doctor_id = p_doctor_id AND accepted_at IS NULL;
  INSERT INTO public.doctor_invites (organization_id, doctor_id, email, phone, token_hash, invited_by)
  VALUES (v_org, p_doctor_id, v_email, v_phone, private.token_sha256(v_token), auth.uid())
  RETURNING * INTO v_invite;

  RETURN jsonb_build_object('id', v_invite.id, 'token', v_token, 'email', v_invite.email, 'phone', v_invite.phone,
                            'expires_at', v_invite.expires_at);
END;
$function$;

CREATE FUNCTION public.revoke_doctor_invite(p_invite_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_invite public.doctor_invites%ROWTYPE;
BEGIN
  SELECT * INTO v_invite FROM public.doctor_invites WHERE id = p_invite_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found' USING ERRCODE = 'PT404';
  END IF;
  PERFORM private.require_owner(v_invite.organization_id);
  DELETE FROM public.doctor_invites WHERE id = p_invite_id AND accepted_at IS NULL;
END;
$function$;

-- Links the signed-in user to the invite's doctor (when it is still free).
CREATE FUNCTION private.accept_doctor_invite_row(p_invite public.doctor_invites, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_doctor public.doctors%ROWTYPE;
BEGIN
  SELECT * INTO v_doctor FROM public.doctors WHERE id = p_invite.doctor_id FOR UPDATE;
  IF NOT FOUND OR v_doctor.profile_id IS NOT NULL THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM public.doctors WHERE center_id = v_doctor.center_id AND profile_id = p_user_id) THEN
    RETURN false;
  END IF;
  PERFORM private.set_doctor_profile(v_doctor.id, p_user_id);
  UPDATE public.doctor_invites SET accepted_at = now(), accepted_by = p_user_id WHERE id = p_invite.id;
  RETURN true;
END;
$function$;

CREATE FUNCTION public.accept_doctor_invite(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_invite public.doctor_invites%ROWTYPE;
  v_doctor public.doctors%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(p_token, '') !~ '^[0-9a-f]{48}$' THEN
    RAISE EXCEPTION 'This invite link is not valid' USING ERRCODE = 'PT404';
  END IF;
  SELECT * INTO v_invite FROM public.doctor_invites WHERE token_hash = private.token_sha256(p_token) FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This invite link is not valid' USING ERRCODE = 'PT404';
  END IF;
  SELECT * INTO v_doctor FROM public.doctors WHERE id = v_invite.doctor_id;
  IF v_invite.accepted_at IS NOT NULL THEN
    IF v_invite.accepted_by = v_uid THEN
      RETURN jsonb_build_object('doctor_id', v_doctor.id, 'center_id', v_doctor.center_id, 'organization_id', v_invite.organization_id);
    END IF;
    RAISE EXCEPTION 'This invite was already used' USING ERRCODE = 'PT409';
  END IF;
  IF v_invite.expires_at <= now() THEN
    RAISE EXCEPTION 'This invite link has expired. Ask the clinic for a new one.' USING ERRCODE = 'PT409';
  END IF;
  IF NOT private.accept_doctor_invite_row(v_invite, v_uid) THEN
    RAISE EXCEPTION 'This doctor already has a login, or you are already a doctor at this clinic' USING ERRCODE = 'PT409';
  END IF;
  RETURN jsonb_build_object('doctor_id', v_doctor.id, 'center_id', v_doctor.center_id, 'organization_id', v_invite.organization_id);
END;
$function$;

COMMENT ON FUNCTION public.accept_doctor_invite(text) IS
  'Signed-in user opens /invite/<token>: becomes that doctor (the doctor role in the clinic). Single use, 7 days.';

-- As in 1B.4, plus doctor invites sent to the user's confirmed email.
CREATE OR REPLACE FUNCTION public.accept_invites()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_invite public.org_invites%ROWTYPE;
  v_doctor_invite public.doctor_invites%ROWTYPE;
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

  FOR v_doctor_invite IN
    SELECT * FROM public.doctor_invites
    WHERE email = v_email AND accepted_at IS NULL AND expires_at > now()
    ORDER BY created_at
    FOR UPDATE
  LOOP
    IF private.accept_doctor_invite_row(v_doctor_invite, v_uid) THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$function$;

-- The doctor keeps their record (and history); only the login goes.
CREATE FUNCTION public.unlink_doctor_account(p_doctor_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_doctor public.doctors%ROWTYPE;
BEGIN
  SELECT * INTO v_doctor FROM public.doctors WHERE id = p_doctor_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Doctor not found' USING ERRCODE = 'PT404';
  END IF;
  PERFORM private.require_owner(private.center_organization(v_doctor.center_id));
  IF v_doctor.profile_id IS NOT NULL THEN
    PERFORM private.set_doctor_profile(p_doctor_id, NULL);
  END IF;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Workspaces
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_workspaces()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT COALESCE(jsonb_agg(w ORDER BY w->>'organization_name'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'organization_id', o.id,
      'organization_name', o.name,
      'organization_status', o.status,
      'roles', (SELECT jsonb_agg(m.role ORDER BY m.role) FROM public.org_members m
                WHERE m.organization_id = o.id AND m.user_id = auth.uid()),
      'centers', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug) ORDER BY c.name)
        FROM public.service_centers c
        WHERE c.organization_id = o.id
          AND (
            EXISTS (SELECT 1 FROM public.org_members m
                    WHERE m.organization_id = o.id AND m.user_id = auth.uid() AND m.role = 'owner')
            OR EXISTS (SELECT 1 FROM public.staff_centers sc WHERE sc.profile_id = auth.uid() AND sc.center_id = c.id)
            OR EXISTS (SELECT 1 FROM public.doctors d WHERE d.profile_id = auth.uid() AND d.center_id = c.id)
          )
      ), '[]'::jsonb),
      'doctors', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', d.id, 'center_id', d.center_id, 'name', d.name, 'is_active', d.is_active)
                         ORDER BY d.created_at, d.id)
        FROM public.doctors d JOIN public.service_centers c ON c.id = d.center_id
        WHERE c.organization_id = o.id AND d.profile_id = auth.uid()
      ), '[]'::jsonb)
    ) AS w
    FROM public.organizations o
    WHERE EXISTS (SELECT 1 FROM public.org_members m WHERE m.organization_id = o.id AND m.user_id = auth.uid())
  ) s;
$function$;

COMMENT ON FUNCTION public.get_my_workspaces() IS
  'The caller''s organizations: roles, the centers they work at (all of them for an owner) and their own doctor rows.';

CREATE OR REPLACE FUNCTION public.get_my_staff_context()
 RETURNS TABLE(role text, is_doctor boolean, doctor_id uuid)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.role, (d.id is not null), d.id
  from public.profiles p
  left join public.doctors d on d.profile_id = p.id
  where p.id = auth.uid()
  order by d.is_active desc nulls last, d.created_at, d.id;
$function$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION private.set_doctor_profile(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.add_owner_doctor(uuid, uuid, text, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.token_sha256(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.accept_doctor_invite_row(public.doctor_invites, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.add_self_as_doctor(uuid, text, text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_organization(text, text, text, text, jsonb, text, time, time, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invite_doctor(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_doctor_invite(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_doctor_invite(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unlink_doctor_account(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_self_as_doctor(uuid, text, text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization(text, text, text, text, jsonb, text, time, time, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_doctor(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_doctor_invite(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_doctor_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_doctor_account(uuid) TO authenticated, service_role;

notify pgrst, 'reload schema';
