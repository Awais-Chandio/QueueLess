-- Phase 1B.1: public join behind the web server, center slugs, rooms, skip order.
--
-- 1. service_centers.slug: the QR join URL (/c/<slug>). Unique, assigned to
--    every existing center and to new ones by trigger.
-- 2. doctors.room: shown on the TV display and the join page.
-- 3. Queue order understands "skip": a skipped token goes back to waiting,
--    behind everyone who joined before the skip. Waiting order everywhere is
--    (COALESCE(skipped_at, created_at), token_number); token_progress follows
--    it, and current_token is the most recently called token.
-- 4. Public joins go through the web server, which verifies Cloudflare
--    Turnstile first. anon can no longer call issue_token directly (it could
--    skip the captcha); the server calls issue_public_token with the service
--    role. The logic is unchanged and lives in private.issue_token_core;
--    issue_token stays for signed-in callers (staff walk-ins, app joins).
-- 5. get_public_center(slug): what the join page shows, for anon. No patient
--    data.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The clinic's local "today" (token numbering and plan limits use it).
CREATE FUNCTION private.org_today(p_org_id uuid)
 RETURNS date
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT (now() AT TIME ZONE COALESCE((SELECT timezone FROM public.organizations WHERE id = p_org_id), 'Asia/Karachi'))::date;
$function$;

-- The first p_limit active doctors of an organization (by creation) are the
-- ones its plan lets take tokens (same rule as issue_token). NULL = all.
CREATE FUNCTION private.doctor_takes_tokens(p_doctor_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH d AS (
    SELECT c.organization_id, e.max_doctors
    FROM public.doctors doc
    JOIN public.service_centers c ON c.id = doc.center_id
    LEFT JOIN public.org_entitlements e ON e.organization_id = c.organization_id
    WHERE doc.id = p_doctor_id AND doc.is_active
  )
  SELECT EXISTS (SELECT 1 FROM d)
     AND (
       (SELECT max_doctors FROM d) IS NULL
       OR p_doctor_id IN (
         SELECT x.id
         FROM public.doctors x
         JOIN public.service_centers c ON c.id = x.center_id
         WHERE c.organization_id = (SELECT organization_id FROM d) AND x.is_active
         ORDER BY x.created_at, x.id
         LIMIT (SELECT max_doctors FROM d)
       )
     );
$function$;

-- ---------------------------------------------------------------------------
-- 1. service_centers.slug
-- ---------------------------------------------------------------------------
ALTER TABLE public.service_centers
  ADD COLUMN slug text CHECK (char_length(slug) <= 80 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

COMMENT ON COLUMN public.service_centers.slug IS 'Public join URL: /c/<slug>. Unique; printed on QR posters, so it does not change.';

-- slugify(name), then name-2, name-3, ... while taken (p_id excluded).
CREATE FUNCTION private.unique_center_slug(p_name text, p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_base text := private.slugify(p_name);
  v_slug text := v_base;
  v_n integer := 1;
BEGIN
  WHILE EXISTS (SELECT 1 FROM public.service_centers WHERE slug = v_slug AND id IS DISTINCT FROM p_id) LOOP
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  END LOOP;
  RETURN v_slug;
END;
$function$;

CREATE FUNCTION private.service_centers_assign_slug()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.slug IS NULL THEN
    -- Serialize slug picks so two centers with the same name can't race.
    PERFORM pg_advisory_xact_lock(hashtextextended('center_slug', 0));
    NEW.slug := private.unique_center_slug(NEW.name, NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER service_centers_assign_slug
  BEFORE INSERT ON public.service_centers
  FOR EACH ROW EXECUTE FUNCTION private.service_centers_assign_slug();

DO $$
DECLARE
  v_center record;
BEGIN
  FOR v_center IN SELECT id, name FROM public.service_centers WHERE slug IS NULL ORDER BY created_at, id LOOP
    UPDATE public.service_centers SET slug = private.unique_center_slug(v_center.name, v_center.id) WHERE id = v_center.id;
  END LOOP;
END
$$;

ALTER TABLE public.service_centers ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX service_centers_slug_key ON public.service_centers (slug);

-- ---------------------------------------------------------------------------
-- 2. doctors.room
-- ---------------------------------------------------------------------------
ALTER TABLE public.doctors
  ADD COLUMN room text CHECK (room IS NULL OR char_length(btrim(room)) BETWEEN 1 AND 30);

COMMENT ON COLUMN public.doctors.room IS 'Room / counter shown on the TV display and the join page, e.g. "Room 2".';

-- ---------------------------------------------------------------------------
-- 3. Skip: called -> checked_in is allowed when it is a skip (skipped_at
--    changes). Everything else is as before.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_appointment_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  -- If status is not changing, allow it
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Terminal states cannot be changed
  IF OLD.status IN ('completed', 'cancelled', 'expired', 'no_show', 'skipped') THEN
    RAISE EXCEPTION 'Cannot transition from terminal status "%" to "%"', OLD.status, NEW.status;
  END IF;

  -- Validate allowed state transitions
  IF OLD.status = 'pending' THEN
    IF NEW.status NOT IN ('confirmed', 'cancelled', 'expired') THEN
      RAISE EXCEPTION 'Invalid transition from pending to "%"', NEW.status;
    END IF;
  ELSIF OLD.status = 'confirmed' THEN
    IF NEW.status NOT IN ('checked_in', 'called', 'cancelled', 'expired') THEN
      RAISE EXCEPTION 'Invalid transition from confirmed to "%"', NEW.status;
    END IF;
  ELSIF OLD.status = 'checked_in' THEN
    IF NEW.status NOT IN ('called', 'cancelled', 'expired') THEN
      RAISE EXCEPTION 'Invalid transition from checked_in to "%"', NEW.status;
    END IF;
  ELSIF OLD.status = 'called' THEN
    -- Skip: a called patient who isn't there goes back to waiting.
    IF NEW.status = 'checked_in' AND NEW.skipped_at IS DISTINCT FROM OLD.skipped_at THEN
      RETURN NEW;
    END IF;
    IF NEW.status NOT IN ('in_progress', 'completed', 'no_show', 'cancelled', 'skipped') THEN
      RAISE EXCEPTION 'Invalid transition from called to "%"', NEW.status;
    END IF;
  ELSIF OLD.status = 'in_progress' THEN
    IF NEW.status NOT IN ('completed', 'no_show', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid transition from in_progress to "%"', NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Queue position of one token. Waiting = pending/confirmed/checked_in, in
-- order (COALESCE(skipped_at, created_at), token_number). current_token = the
-- most recently called token still with the doctor, else the last completed.
CREATE OR REPLACE FUNCTION private.token_progress(p_appointment_id uuid)
 RETURNS TABLE (people_ahead integer, eta_minutes integer, current_token integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_appt public.appointments%ROWTYPE;
  v_avg numeric;
  v_ahead integer := 0;
  v_current integer;
BEGIN
  SELECT * INTO v_appt FROM public.appointments WHERE id = p_appointment_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT a.token_number INTO v_current
  FROM public.appointments a
  WHERE a.appointment_date = v_appt.appointment_date
    AND (CASE WHEN v_appt.doctor_id IS NOT NULL THEN a.doctor_id = v_appt.doctor_id
              ELSE a.doctor_id IS NULL AND a.center_id = v_appt.center_id END)
    AND a.status IN ('called', 'in_progress')
  ORDER BY a.called_at DESC NULLS LAST, a.token_number DESC
  LIMIT 1;

  IF v_current IS NULL THEN
    SELECT a.token_number INTO v_current
    FROM public.appointments a
    WHERE a.appointment_date = v_appt.appointment_date
      AND (CASE WHEN v_appt.doctor_id IS NOT NULL THEN a.doctor_id = v_appt.doctor_id
                ELSE a.doctor_id IS NULL AND a.center_id = v_appt.center_id END)
      AND a.status = 'completed'
    ORDER BY a.completed_at DESC NULLS LAST, a.token_number DESC
    LIMIT 1;
  END IF;

  IF v_appt.status IN ('pending', 'confirmed', 'checked_in') THEN
    SELECT count(*)::integer INTO v_ahead
    FROM public.appointments a
    WHERE a.appointment_date = v_appt.appointment_date
      AND (CASE WHEN v_appt.doctor_id IS NOT NULL THEN a.doctor_id = v_appt.doctor_id
                ELSE a.doctor_id IS NULL AND a.center_id = v_appt.center_id END)
      AND a.status IN ('pending', 'confirmed', 'checked_in')
      AND a.id <> v_appt.id
      AND (COALESCE(a.skipped_at, a.created_at, a.scheduled_at), a.token_number)
        < (COALESCE(v_appt.skipped_at, v_appt.created_at, v_appt.scheduled_at), v_appt.token_number);
  END IF;

  IF v_appt.doctor_id IS NOT NULL THEN
    SELECT average_consultation_time INTO v_avg
    FROM public.doctor_queue_settings WHERE doctor_id = v_appt.doctor_id;
  ELSE
    SELECT average_consultation_time INTO v_avg
    FROM public.center_queue_settings
    WHERE center_id = v_appt.center_id AND appointment_date = v_appt.appointment_date;
  END IF;

  RETURN QUERY SELECT v_ahead, CEIL(v_ahead * COALESCE(v_avg, 10.0))::integer, COALESCE(v_current, 0);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. issue_token -> private.issue_token_core (1A.7 logic, unchanged except
--    that p_public forces the public rules even for a server caller).
-- ---------------------------------------------------------------------------
CREATE FUNCTION private.issue_token_core(p_doctor_id uuid, p_name text, p_phone text, p_source text, p_public boolean)
 RETURNS TABLE (appointment_id uuid, public_code text, token_number integer, people_ahead integer, eta_minutes integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  c_public_daily_limit constant integer := 3;
  v_uid uuid := auth.uid();
  v_source text := lower(btrim(COALESCE(p_source, '')));
  v_name text := btrim(regexp_replace(COALESCE(p_name, ''), '\s+', ' ', 'g'));
  v_phone text := private.normalize_phone(p_phone);
  v_doctor public.doctors%ROWTYPE;
  v_center public.service_centers%ROWTYPE;
  v_org public.organizations%ROWTYPE;
  v_ent public.org_entitlements%ROWTYPE;
  v_is_staff boolean;
  v_today date;
  v_service_id uuid;
  v_patient_id uuid;
  v_appt public.appointments%ROWTYPE;
BEGIN
  -- Input
  IF v_source NOT IN ('walk_in', 'qr', 'online', 'app') THEN
    RAISE EXCEPTION 'Unknown token source "%"', p_source USING ERRCODE = '22023';
  END IF;
  IF char_length(v_name) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Please enter the patient''s name (up to 100 characters)' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(COALESCE(p_phone, '')), '') IS NOT NULL AND v_phone IS NULL THEN
    RAISE EXCEPTION 'Please enter a valid phone number' USING ERRCODE = '22023';
  END IF;

  -- Doctor, center, organization
  SELECT * INTO v_doctor FROM public.doctors WHERE id = p_doctor_id;
  IF NOT FOUND OR NOT v_doctor.is_active THEN
    RAISE EXCEPTION 'Doctor not found' USING ERRCODE = 'PT404';
  END IF;
  SELECT * INTO v_center FROM public.service_centers WHERE id = v_doctor.center_id;
  SELECT * INTO v_org FROM public.organizations WHERE id = v_center.organization_id;
  IF v_org.status <> 'active' THEN
    RAISE EXCEPTION 'This clinic is not taking tokens right now' USING ERRCODE = 'PT403';
  END IF;

  v_today := (now() AT TIME ZONE v_org.timezone)::date;
  v_is_staff := NOT p_public
    AND (private.is_server_context() OR public.is_admin() OR private.is_center_staff(v_center.id));

  -- Who may use which source
  IF v_is_staff THEN
    IF v_source = 'app' THEN
      RAISE EXCEPTION 'Staff issue walk_in, qr or online tokens' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF v_source = 'walk_in' THEN
      RAISE EXCEPTION 'Only clinic staff can issue walk-in tokens' USING ERRCODE = '42501';
    END IF;
    IF v_source = 'app' AND v_uid IS NULL THEN
      RAISE EXCEPTION 'Sign in to join from the app' USING ERRCODE = '42501';
    END IF;
    IF v_phone IS NULL THEN
      RAISE EXCEPTION 'Please enter a valid phone number' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.doctor_leaves WHERE doctor_id = v_doctor.id AND leave_date = v_today) THEN
      RAISE EXCEPTION 'This doctor is not seeing patients today' USING ERRCODE = 'PT409';
    END IF;
  END IF;

  -- Plan: module for this source, doctor limit, daily token limit.
  SELECT * INTO v_ent FROM public.org_entitlements WHERE organization_id = v_org.id;
  IF NOT private.has_module(v_org.id, CASE v_source
                                        WHEN 'walk_in' THEN 'queue'
                                        WHEN 'qr' THEN 'qr_join'
                                        ELSE 'online_booking' END) THEN
    RAISE EXCEPTION 'This clinic''s plan doesn''t include % tokens', replace(v_source, '_', '-')
      USING ERRCODE = 'PT402';
  END IF;

  IF v_ent.max_doctors IS NOT NULL AND v_doctor.id NOT IN (
       SELECT d.id
       FROM public.doctors d
       JOIN public.service_centers c ON c.id = d.center_id
       WHERE c.organization_id = v_org.id AND d.is_active
       ORDER BY d.created_at, d.id
       LIMIT v_ent.max_doctors) THEN
    RAISE EXCEPTION 'This clinic''s plan allows tokens for % doctor(s)', v_ent.max_doctors
      USING ERRCODE = 'PT402';
  END IF;

  IF v_ent.tokens_per_day IS NOT NULL THEN
    -- One organization's issues count one after the other.
    PERFORM pg_advisory_xact_lock(hashtextextended('org_tokens:' || v_org.id || ':' || v_today, 0));
    IF (SELECT count(*)
        FROM public.appointments a
        JOIN public.service_centers c ON c.id = a.center_id
        WHERE c.organization_id = v_org.id
          AND a.appointment_date = v_today
          AND a.status <> 'cancelled') >= v_ent.tokens_per_day THEN
      RAISE EXCEPTION 'This clinic has reached its plan''s % tokens for today', v_ent.tokens_per_day
        USING ERRCODE = 'PT402';
    END IF;
  END IF;

  IF NOT v_is_staff THEN
    -- Per phone (and per account) per organization per day. The lock makes
    -- concurrent joins from the same phone count one after the other.
    PERFORM pg_advisory_xact_lock(hashtextextended('issue_token:' || v_org.id || ':' || v_today || ':' || v_phone, 0));
    IF (SELECT count(*) FROM private.public_token_joins j
        WHERE j.organization_id = v_org.id AND j.join_date = v_today AND j.phone = v_phone) >= c_public_daily_limit
       OR (v_uid IS NOT NULL AND (SELECT count(*) FROM private.public_token_joins j
           WHERE j.organization_id = v_org.id AND j.join_date = v_today AND j.user_id = v_uid) >= c_public_daily_limit)
    THEN
      RAISE EXCEPTION 'Too many tokens for this phone number today. Please ask at the reception.'
        USING ERRCODE = 'PT429';
    END IF;
  END IF;

  -- Service: the doctor's first service at this center, else the center's first.
  SELECT s.id INTO v_service_id
  FROM public.doctor_services ds
  JOIN public.services s ON s.id = ds.service_id AND s.center_id = v_center.id
  WHERE ds.doctor_id = v_doctor.id
  ORDER BY s.created_at, s.id
  LIMIT 1;
  IF v_service_id IS NULL THEN
    SELECT s.id INTO v_service_id FROM public.services s
    WHERE s.center_id = v_center.id ORDER BY s.created_at, s.id LIMIT 1;
  END IF;
  IF v_service_id IS NULL THEN
    RAISE EXCEPTION 'This clinic has no service set up yet' USING ERRCODE = 'PT409';
  END IF;

  -- Patient: a signed-in patient joining under their own name uses their
  -- record; otherwise the guest with this phone and name, or a new one.
  IF NOT v_is_staff AND v_uid IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.profiles pr WHERE pr.id = v_uid AND lower(btrim(pr.full_name)) = lower(v_name)) THEN
    v_patient_id := private.patient_for_user(v_org.id, v_uid);
  ELSE
    IF v_phone IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('patient:' || v_org.id || ':' || v_phone, 0));
      SELECT p.id INTO v_patient_id
      FROM public.patients p
      WHERE p.organization_id = v_org.id AND p.user_id IS NULL
        AND p.phone = v_phone AND lower(p.name) = lower(v_name)
      ORDER BY p.created_at
      LIMIT 1;
    END IF;
    IF v_patient_id IS NULL THEN
      INSERT INTO public.patients (organization_id, name, phone)
      VALUES (v_org.id, v_name, v_phone)
      RETURNING id INTO v_patient_id;
    END IF;
  END IF;

  -- Token: number from the per-doctor trigger. In the clinic (walk-in, QR)
  -- means checked in; remote joins wait as confirmed.
  INSERT INTO public.appointments (
    user_id, patient_id, center_id, service_id, doctor_id,
    appointment_date, appointment_time, scheduled_at, status, checked_in_at, source
  ) VALUES (
    CASE WHEN v_is_staff THEN NULL ELSE v_uid END, v_patient_id, v_center.id, v_service_id, v_doctor.id,
    v_today, NULL, now(),
    CASE WHEN v_source IN ('walk_in', 'qr') THEN 'checked_in' ELSE 'confirmed' END,
    CASE WHEN v_source IN ('walk_in', 'qr') THEN now() END,
    v_source
  )
  RETURNING * INTO v_appt;

  IF NOT v_is_staff THEN
    INSERT INTO private.public_token_joins (organization_id, join_date, phone, user_id, appointment_id)
    VALUES (v_org.id, v_today, v_phone, v_uid, v_appt.id);
  END IF;

  RETURN QUERY
  SELECT
    CASE WHEN v_is_staff OR (v_uid IS NOT NULL AND v_appt.user_id = v_uid) THEN v_appt.id END,
    v_appt.public_code,
    v_appt.token_number,
    tp.people_ahead,
    tp.eta_minutes
  FROM private.token_progress(v_appt.id) tp;
END;
$function$;

-- Signed-in callers: staff walk-ins (and qr/online on a patient's behalf),
-- patients joining from the app. Same rules as 1A.7.
CREATE OR REPLACE FUNCTION public.issue_token(p_doctor_id uuid, p_name text, p_phone text, p_source text DEFAULT 'qr')
 RETURNS TABLE (appointment_id uuid, public_code text, token_number integer, people_ahead integer, eta_minutes integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT * FROM private.issue_token_core(p_doctor_id, p_name, p_phone, p_source, false);
$function$;

-- Public QR / online join, called by the web server after it verified the
-- captcha. Service role only. Always the public rules (phone required, 3 per
-- phone per clinic per day, no walk-in source). p_center_slug, when given,
-- must be the doctor's center (the join page's URL), so a doctor id from
-- another clinic can't be slipped into a clinic's form.
CREATE FUNCTION public.issue_public_token(
  p_doctor_id uuid, p_name text, p_phone text, p_source text DEFAULT 'qr', p_center_slug text DEFAULT NULL
)
 RETURNS TABLE (appointment_id uuid, public_code text, token_number integer, people_ahead integer, eta_minutes integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT private.is_server_context() THEN
    RAISE EXCEPTION 'Public joins go through the clinic''s join page' USING ERRCODE = '42501';
  END IF;

  IF p_center_slug IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.doctors d JOIN public.service_centers c ON c.id = d.center_id
       WHERE d.id = p_doctor_id AND c.slug = lower(btrim(p_center_slug))) THEN
    RAISE EXCEPTION 'Doctor not found' USING ERRCODE = 'PT404';
  END IF;

  RETURN QUERY SELECT * FROM private.issue_token_core(p_doctor_id, p_name, p_phone, p_source, true);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. get_public_center: the join page. Center and organization name, whether
--    QR joins are on, and the doctors that take tokens today with their
--    queue length. No patient data, no internal ids except the doctor's (the
--    join form needs it).
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.get_public_center(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_slug text := lower(btrim(COALESCE(p_slug, '')));
  v_center public.service_centers%ROWTYPE;
  v_org public.organizations%ROWTYPE;
  v_today date;
BEGIN
  IF v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR char_length(v_slug) > 80 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_center FROM public.service_centers WHERE slug = v_slug;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_org FROM public.organizations WHERE id = v_center.organization_id;
  v_today := (now() AT TIME ZONE v_org.timezone)::date;

  RETURN jsonb_build_object(
    'slug', v_center.slug,
    'name', v_center.name,
    'organization_name', v_org.name,
    'city', v_center.city,
    'address', v_center.address,
    'open_time', v_center.open_time,
    'close_time', v_center.close_time,
    'qr_enabled', v_org.status = 'active' AND private.has_module(v_org.id, 'qr_join'),
    'doctors', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', d.id,
               'name', d.name,
               'specialty', d.specialty,
               'room', d.room,
               'is_on_break', d.is_on_break,
               'on_leave', EXISTS (SELECT 1 FROM public.doctor_leaves l WHERE l.doctor_id = d.id AND l.leave_date = v_today),
               'waiting', (SELECT count(*) FROM public.appointments a
                           WHERE a.doctor_id = d.id AND a.appointment_date = v_today
                             AND a.status IN ('pending', 'confirmed', 'checked_in'))
             ) ORDER BY d.created_at, d.id)
      FROM public.doctors d
      WHERE d.center_id = v_center.id AND d.is_active AND private.doctor_takes_tokens(d.id)
    ), '[]'::jsonb)
  );
END;
$function$;

COMMENT ON FUNCTION public.get_public_center(text) IS
  'Join page data by center slug: names, address, hours, qr_enabled, doctors taking tokens (name, specialty, room, break, leave, waiting count). No patient data.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION private.org_today(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.doctor_takes_tokens(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.unique_center_slug(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.service_centers_assign_slug() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.issue_token_core(uuid, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.org_today(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.issue_token(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_token(uuid, text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.issue_public_token(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_public_token(uuid, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.get_public_center(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_center(text) TO anon, authenticated, service_role;
