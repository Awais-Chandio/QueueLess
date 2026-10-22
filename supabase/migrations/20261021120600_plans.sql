-- Phase 1A.7: plans, subscriptions, entitlements.
--
-- plans               catalog: modules + limits (NULL limit = unlimited)
-- org_subscriptions   which plan an organization is on (one live row each)
-- org_entitlements    effective modules + limits per organization, derived
--                     from the live subscription by triggers (what checks read)
-- private.has_module(org, module)
--
-- Every organization (existing default ones included) starts on 'free'.
-- issue_token enforces: module per source, tokens_per_day, max_doctors.
-- App bookings (book_appointment) are not limited in 1A, so the existing app
-- behaves exactly as before.

-- ---------------------------------------------------------------------------
-- 1. Catalog
-- ---------------------------------------------------------------------------
CREATE FUNCTION private.known_modules()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT ARRAY['queue', 'qr_join', 'online_booking', 'sms', 'whatsapp', 'analytics', 'multi_center'];
$function$;

CREATE TABLE public.plans (
  id text PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_]*$'),
  name text NOT NULL,
  -- NULL = price not set yet.
  monthly_price_pkr integer CHECK (monthly_price_pkr >= 0),
  modules text[] NOT NULL DEFAULT '{}' CHECK (modules <@ private.known_modules()),
  -- NULL = unlimited.
  tokens_per_day integer CHECK (tokens_per_day > 0),
  max_doctors integer CHECK (max_doctors > 0),
  max_centers integer CHECK (max_centers > 0),
  monthly_message_credits integer NOT NULL DEFAULT 0 CHECK (monthly_message_credits >= 0),
  is_public boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.plans IS 'Plan catalog. NULL limits mean unlimited; NULL price means not set yet.';

INSERT INTO public.plans (id, name, monthly_price_pkr, modules, tokens_per_day, max_doctors, max_centers, monthly_message_credits, sort_order) VALUES
  ('free',   'Free',   0,    ARRAY['queue', 'qr_join'],                                                            30,   1,    1,    0, 1),
  ('clinic', 'Clinic', NULL, ARRAY['queue', 'qr_join', 'online_booking', 'sms'],                                   150,  3,    1,    0, 2),
  ('pro',    'Pro',    NULL, ARRAY['queue', 'qr_join', 'online_booking', 'sms', 'whatsapp', 'analytics'],          NULL, 10,   1,    0, 3),
  ('center', 'Center', NULL, ARRAY['queue', 'qr_join', 'online_booking', 'sms', 'whatsapp', 'analytics', 'multi_center'], NULL, NULL, NULL, 0, 4);

-- ---------------------------------------------------------------------------
-- 2. Subscriptions and entitlements
-- ---------------------------------------------------------------------------
CREATE TABLE public.org_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id text NOT NULL REFERENCES public.plans(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('trialing', 'active', 'past_due', 'cancelled')),
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- At most one live (not cancelled) subscription per organization.
CREATE UNIQUE INDEX org_subscriptions_one_live ON public.org_subscriptions (organization_id) WHERE status <> 'cancelled';

CREATE TABLE public.org_entitlements (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id text NOT NULL REFERENCES public.plans(id),
  modules text[] NOT NULL CHECK (modules <@ private.known_modules()),
  tokens_per_day integer CHECK (tokens_per_day > 0),
  max_doctors integer CHECK (max_doctors > 0),
  max_centers integer CHECK (max_centers > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.org_entitlements IS
  'Effective modules and limits per organization. Rewritten from the live subscription''s plan by triggers; a manual override lasts until the next plan change.';

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_entitlements ENABLE ROW LEVEL SECURITY;

-- Entitlements = the live subscription's plan, or 'free' when there is none.
CREATE FUNCTION private.refresh_org_entitlements(p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_plan public.plans%ROWTYPE;
BEGIN
  SELECT p.* INTO v_plan
  FROM public.org_subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = p_org_id AND s.status <> 'cancelled'
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT * INTO v_plan FROM public.plans WHERE id = 'free';
  END IF;

  INSERT INTO public.org_entitlements (organization_id, plan_id, modules, tokens_per_day, max_doctors, max_centers, updated_at)
  VALUES (p_org_id, v_plan.id, v_plan.modules, v_plan.tokens_per_day, v_plan.max_doctors, v_plan.max_centers, now())
  ON CONFLICT (organization_id) DO UPDATE
    SET plan_id = EXCLUDED.plan_id,
        modules = EXCLUDED.modules,
        tokens_per_day = EXCLUDED.tokens_per_day,
        max_doctors = EXCLUDED.max_doctors,
        max_centers = EXCLUDED.max_centers,
        updated_at = now();
END;
$function$;

CREATE FUNCTION private.org_subscriptions_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER org_subscriptions_touch
  BEFORE UPDATE ON public.org_subscriptions
  FOR EACH ROW EXECUTE FUNCTION private.org_subscriptions_changed();

CREATE FUNCTION private.org_subscriptions_refresh()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM private.refresh_org_entitlements(OLD.organization_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP = 'INSERT' OR NEW.organization_id IS DISTINCT FROM OLD.organization_id) THEN
    PERFORM private.refresh_org_entitlements(NEW.organization_id);
  END IF;
  RETURN NULL;
END;
$function$;

CREATE TRIGGER org_subscriptions_refresh
  AFTER INSERT OR UPDATE OR DELETE ON public.org_subscriptions
  FOR EACH ROW EXECUTE FUNCTION private.org_subscriptions_refresh();

-- Editing a plan's limits applies to every organization on it.
CREATE FUNCTION private.plans_refresh()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM private.refresh_org_entitlements(e.organization_id)
  FROM public.org_entitlements e
  WHERE e.plan_id = NEW.id;
  RETURN NULL;
END;
$function$;

CREATE TRIGGER plans_refresh
  AFTER UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION private.plans_refresh();

-- New organizations start on Free.
CREATE FUNCTION private.organizations_default_subscription()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.org_subscriptions (organization_id, plan_id, status) VALUES (NEW.id, 'free', 'active');
  RETURN NULL;
END;
$function$;

CREATE TRIGGER organizations_default_subscription
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION private.organizations_default_subscription();

-- Backfill: every existing organization on Free.
INSERT INTO public.org_subscriptions (organization_id, plan_id, status)
SELECT o.id, 'free', 'active'
FROM public.organizations o
WHERE NOT EXISTS (SELECT 1 FROM public.org_subscriptions s WHERE s.organization_id = o.id AND s.status <> 'cancelled');

-- ---------------------------------------------------------------------------
-- 3. has_module
-- ---------------------------------------------------------------------------
CREATE FUNCTION private.has_module(p_org_id uuid, p_module text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.org_entitlements e
    WHERE e.organization_id = p_org_id AND p_module = ANY (e.modules)
  );
$function$;

-- ---------------------------------------------------------------------------
-- 4. Access: public plans for everyone (pricing page); entitlements for the
--    organization's members (the app shows what's switched on);
--    subscriptions (billing) for owners. Platform admins read all. No client
--    writes: plan changes happen server-side / by a platform admin.
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.plans, public.org_subscriptions, public.org_entitlements FROM anon, authenticated;
GRANT SELECT ON public.plans TO anon, authenticated;
GRANT SELECT ON public.org_subscriptions, public.org_entitlements TO authenticated;

CREATE POLICY "anyone reads public plans" ON public.plans
  FOR SELECT TO anon, authenticated
  USING (is_public);
CREATE POLICY "platform admin reads all plans" ON public.plans
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "owners read their subscriptions" ON public.org_subscriptions
  FOR SELECT TO authenticated
  USING (private.has_org_role(organization_id, ARRAY['owner']) OR public.is_admin());

CREATE POLICY "members read their entitlements" ON public.org_entitlements
  FOR SELECT TO authenticated
  USING (private.has_org_role(organization_id, ARRAY['owner', 'receptionist', 'doctor']) OR public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. issue_token: same as 1A.5 plus the plan checks (after the caller and
--    input checks, before anything is written):
--      walk_in needs 'queue', qr needs 'qr_join', online/app need
--      'online_booking'; tokens_per_day counts the organization's
--      non-cancelled appointments of the day (any source); max_doctors
--      allows the organization's first N active doctors (by creation).
--    Plan errors use PT402 (HTTP 402).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.issue_token(p_doctor_id uuid, p_name text, p_phone text, p_source text DEFAULT 'qr')
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
  v_is_staff := private.is_server_context() OR public.is_admin() OR private.is_center_staff(v_center.id);

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

REVOKE ALL ON FUNCTION private.known_modules() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.refresh_org_entitlements(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.org_subscriptions_changed() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.org_subscriptions_refresh() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.plans_refresh() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.organizations_default_subscription() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.has_module(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_module(uuid, text) TO authenticated, service_role;
