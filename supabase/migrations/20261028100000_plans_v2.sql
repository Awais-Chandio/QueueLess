-- Phase 2B.1: the 2B plan catalog.
--
--   trial   14 days, every Pro feature, starts at signup, no payment (2B.2)
--   basic   trial over and nothing paid: 1 doctor, 30 tokens a day, queue +
--           QR join, MediQ branding on the patient pages. Data is never
--           deleted or locked: records, patients and history stay readable.
--   solo    Rs 2,500 / month: 1 doctor, unlimited tokens, queue, QR join,
--           TV display, fees + Hisaab, SMS (prepaid credits)
--   pro     Rs 4,500 / month, "Recommended": up to 3 doctors, Solo +
--           analytics (reports / CSV), WhatsApp, online booking
--   center  Rs 1,200 per doctor / month, minimum 4 doctors: unlimited
--           doctors, more than one branch
--   Receptionists are unlimited on every plan. A year costs 10 months.
--   free and clinic stay in the table (hidden) for the clinics an admin put
--   on them.
--
-- 1. Two new modules: display (the TV board) and fees (fee before joining
--    the line and taking fees at the desk). Without fees a clinic's fee mode
--    reads as off: QR patients join the line directly. Tokens already waiting
--    for their fee can still be settled, and Records stays readable.
-- 2. plans: per_doctor + min_doctors (Center), recommended, mediq_branding.
--    private.plan_price_pkr(plan, months, doctors) is the price of 1 or 12
--    months.
-- 3. Admin overrides are kept: every organization keeps the entitlements it
--    has now (an admin's plan or a hand edit), plus display and fees, which
--    it had before they became modules. Editing the plans below would
--    otherwise rewrite them (plans_refresh), e.g. Pro clinics from 10 doctors
--    to 3. Organizations still on plain Free move to the trial in 2B.2.
-- 4. get_display_snapshot: 'locked' without the display module (no tokens on
--    the TV), 'branding' on Basic (the join page gets it in 2B.5).

-- ---------------------------------------------------------------------------
-- 1. Catalog
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.known_modules()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT ARRAY['queue', 'qr_join', 'display', 'fees', 'online_booking', 'sms', 'whatsapp', 'analytics', 'multi_center'];
$function$;

ALTER TABLE public.plans
  ADD COLUMN per_doctor boolean NOT NULL DEFAULT false,
  ADD COLUMN min_doctors integer CHECK (min_doctors > 0),
  ADD COLUMN recommended boolean NOT NULL DEFAULT false,
  ADD COLUMN mediq_branding boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.plans.per_doctor IS 'monthly_price_pkr is per active doctor (at least min_doctors).';
COMMENT ON COLUMN public.plans.mediq_branding IS 'Patient pages (join, TV) show "MediQ" branding.';

-- Entitlements follow a change of plan only: a new or removed live
-- subscription, or another plan_id. Other updates (period end, status between
-- trialing / active / past_due, lapses) keep a hand-edited override.
CREATE OR REPLACE FUNCTION private.org_subscriptions_refresh()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.organization_id = OLD.organization_id
     AND NEW.plan_id = OLD.plan_id
     AND (NEW.status = 'cancelled') = (OLD.status = 'cancelled') THEN
    RETURN NULL;
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM private.refresh_org_entitlements(OLD.organization_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP = 'INSERT' OR NEW.organization_id IS DISTINCT FROM OLD.organization_id) THEN
    PERFORM private.refresh_org_entitlements(NEW.organization_id);
  END IF;
  RETURN NULL;
END;
$function$;

-- As in 1A.7; with no live subscription an organization is on Basic.
CREATE OR REPLACE FUNCTION private.refresh_org_entitlements(p_org_id uuid)
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
    SELECT * INTO v_plan FROM public.plans WHERE id = 'basic';
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

-- What every organization has today, before the catalog changes.
CREATE TEMP TABLE pre_2b_entitlements AS SELECT * FROM public.org_entitlements;

INSERT INTO public.plans (id, name, monthly_price_pkr, modules, tokens_per_day, max_doctors, max_centers, is_public, sort_order) VALUES
  ('trial', 'Trial', 0, ARRAY['queue', 'qr_join', 'display', 'fees', 'sms', 'analytics', 'whatsapp', 'online_booking'], NULL, 3, 1, false, 0),
  ('basic', 'Basic', 0, ARRAY['queue', 'qr_join'], 30, 1, 1, true, 1),
  ('solo', 'Solo', 2500, ARRAY['queue', 'qr_join', 'display', 'fees', 'sms'], NULL, 1, 1, true, 2);
UPDATE public.plans SET mediq_branding = true WHERE id = 'basic';

UPDATE public.plans
SET monthly_price_pkr = 4500,
    modules = ARRAY['queue', 'qr_join', 'display', 'fees', 'sms', 'analytics', 'whatsapp', 'online_booking'],
    tokens_per_day = NULL, max_doctors = 3, max_centers = 1, recommended = true, is_public = true, sort_order = 3
WHERE id = 'pro';

UPDATE public.plans
SET monthly_price_pkr = 1200, per_doctor = true, min_doctors = 4,
    modules = ARRAY['queue', 'qr_join', 'display', 'fees', 'sms', 'analytics', 'whatsapp', 'online_booking', 'multi_center'],
    tokens_per_day = NULL, max_doctors = NULL, max_centers = NULL, is_public = true, sort_order = 4
WHERE id = 'center';

-- Legacy, hidden: what they had, plus the two new modules.
UPDATE public.plans
SET modules = modules || ARRAY['display', 'fees'], is_public = false, mediq_branding = (id = 'free'),
    sort_order = CASE id WHEN 'free' THEN 8 ELSE 9 END
WHERE id IN ('free', 'clinic');

-- Admin overrides: put back what each organization had (the updates above
-- refreshed every organization on pro / center / free / clinic), with display
-- and fees added.
UPDATE public.org_entitlements e
SET modules = ARRAY(SELECT DISTINCT unnest(p.modules || ARRAY['display', 'fees']) ORDER BY 1),
    tokens_per_day = p.tokens_per_day,
    max_doctors = p.max_doctors,
    max_centers = p.max_centers,
    updated_at = now()
FROM pre_2b_entitlements p
WHERE p.organization_id = e.organization_id;

DROP TABLE pre_2b_entitlements;

-- ---------------------------------------------------------------------------
-- 2. Prices
-- ---------------------------------------------------------------------------
-- 1 month, or 12 for the price of 10. Center: per active doctor, at least
-- min_doctors. NULL when the plan has no price.
CREATE FUNCTION private.plan_price_pkr(p_plan_id text, p_months integer, p_doctors integer DEFAULT 1)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT p.monthly_price_pkr
         * CASE WHEN p.per_doctor THEN GREATEST(COALESCE(p.min_doctors, 1), COALESCE(p_doctors, 1)) ELSE 1 END
         * CASE WHEN p_months = 12 THEN 10 ELSE 1 END
  FROM public.plans p
  WHERE p.id = p_plan_id AND p_months IN (1, 12);
$function$;

COMMENT ON FUNCTION private.plan_price_pkr(text, integer, integer) IS
  'Price of 1 or 12 months (a year = 10 months). Per-doctor plans: monthly price x max(min_doctors, doctors).';

-- Active doctors of an organization (what the Center price counts).
CREATE FUNCTION private.org_active_doctors(p_org_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT count(*)::integer
  FROM public.doctors d JOIN public.service_centers c ON c.id = d.center_id
  WHERE c.organization_id = p_org_id AND d.is_active;
$function$;

-- ---------------------------------------------------------------------------
-- 3. The fees module
-- ---------------------------------------------------------------------------
-- As in 2A.1, but the fee mode reads 'off' when the organization's plan has no
-- fees module (the stored choice comes back with the module). Every queue and
-- payment function reads the mode through this.
CREATE OR REPLACE FUNCTION private.center_fee_settings(p_center_id uuid)
 RETURNS public.center_payment_settings
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_row public.center_payment_settings%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.center_payment_settings s WHERE s.center_id = p_center_id;
  IF NOT FOUND THEN
    v_row := ROW(p_center_id, private.center_organization(p_center_id), 'before', 30,
                 NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, now(), NULL)::public.center_payment_settings;
  END IF;
  IF NOT private.has_module(v_row.organization_id, 'fees') THEN
    v_row.fee_mode := 'off';
  END IF;
  RETURN v_row;
END;
$function$;

-- As in 2A.4. A token already waiting for its fee can always be settled
-- (paid, waived, a claim verified), so nobody is stuck outside the line after
-- the plan loses the fees module; anything else needs fees on.
CREATE OR REPLACE FUNCTION private.lock_payable_appointment(p_appointment_id uuid)
 RETURNS public.appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_appt public.appointments%ROWTYPE;
BEGIN
  SELECT * INTO v_appt FROM public.appointments WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token not found' USING ERRCODE = 'PT404';
  END IF;
  IF NOT private.is_server_context() AND NOT private.can_manage_center(v_appt.center_id) THEN
    RAISE EXCEPTION 'Only the clinic''s reception or owner can take payments' USING ERRCODE = '42501';
  END IF;
  PERFORM private.require_module(private.center_organization(v_appt.center_id), 'queue');
  IF v_appt.payment_status IS DISTINCT FROM 'awaiting' THEN
    PERFORM private.require_module(private.center_organization(v_appt.center_id), 'fees');
    IF (private.center_fee_settings(v_appt.center_id)).fee_mode = 'off' THEN
      RAISE EXCEPTION 'Fees are switched off for this clinic' USING ERRCODE = 'PT409';
    END IF;
  END IF;
  IF v_appt.status IN ('cancelled', 'expired') THEN
    RAISE EXCEPTION 'This token is %. Issue a new token instead.', v_appt.status USING ERRCODE = 'PT409';
  END IF;
  RETURN v_appt;
END;
$function$;

-- As in 1E, plus the two new modules.
CREATE OR REPLACE FUNCTION private.require_module(p_org_id uuid, p_module text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT private.has_module(p_org_id, p_module) THEN
    RAISE EXCEPTION 'This clinic''s plan doesn''t include %. The clinic owner can upgrade the plan.',
      CASE p_module
        WHEN 'queue' THEN 'the live queue'
        WHEN 'qr_join' THEN 'QR joins'
        WHEN 'display' THEN 'the TV display'
        WHEN 'fees' THEN 'fees'
        WHEN 'online_booking' THEN 'online booking'
        WHEN 'sms' THEN 'SMS messages'
        WHEN 'whatsapp' THEN 'WhatsApp messages'
        WHEN 'analytics' THEN 'clinic insights'
        WHEN 'multi_center' THEN 'more than one branch'
        ELSE p_module END
      USING ERRCODE = 'PT402';
  END IF;
END;
$function$;

-- The plan shows MediQ branding on the patient pages (Basic).
CREATE FUNCTION private.mediq_branding(p_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT COALESCE((SELECT p.mediq_branding FROM public.org_entitlements e JOIN public.plans p ON p.id = e.plan_id
                   WHERE e.organization_id = p_org_id), false);
$function$;

-- ---------------------------------------------------------------------------
-- 4. Patient pages
-- ---------------------------------------------------------------------------

-- TV board as in 2A.3, plus 'locked' (no display module: no tokens shown) and
-- 'branding'.
CREATE OR REPLACE FUNCTION public.get_display_snapshot(p_display_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_key text := lower(btrim(COALESCE(p_display_key, '')));
  v_center public.service_centers%ROWTYPE;
  v_org public.organizations%ROWTYPE;
  v_today date;
  v_locked boolean;
BEGIN
  IF v_key !~ '^[a-z0-9]{24}$' THEN
    RETURN NULL;
  END IF;

  SELECT c.* INTO v_center
  FROM public.center_displays k
  JOIN public.service_centers c ON c.id = k.center_id
  WHERE k.display_key = v_key;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_org FROM public.organizations WHERE id = v_center.organization_id;
  v_today := (now() AT TIME ZONE v_org.timezone)::date;
  v_locked := NOT private.has_module(v_org.id, 'display');

  RETURN jsonb_build_object(
    'center_name', v_center.name,
    'center_slug', v_center.slug,
    'organization_name', v_org.name,
    'today', v_today,
    'server_time', now(),
    'locked', v_locked,
    'branding', private.mediq_branding(v_org.id),
    'doctors', CASE WHEN v_locked THEN '[]'::jsonb ELSE COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'name', d.name,
               'room', d.room,
               'is_on_break', d.is_on_break OR COALESCE(q.is_on_break, false),
               'late_until', CASE WHEN d.late_until > now() THEN d.late_until END,
               'now_serving', (
                 SELECT jsonb_build_object('token_number', a.token_number, 'status', a.status, 'called_at', a.called_at)
                 FROM public.appointments a
                 WHERE a.doctor_id = d.id AND a.appointment_date = v_today AND a.status IN ('called', 'in_progress')
                 ORDER BY a.called_at DESC NULLS LAST, a.token_number DESC
                 LIMIT 1),
               'next', COALESCE((
                 SELECT jsonb_agg(n.token_number ORDER BY n.k, n.token_number)
                 FROM (
                   SELECT a.token_number, COALESCE(a.skipped_at, a.checked_in_at, a.created_at, a.scheduled_at) AS k
                   FROM public.appointments a
                   WHERE a.doctor_id = d.id AND a.appointment_date = v_today
                     AND a.status IN ('pending', 'confirmed', 'checked_in')
                     AND a.payment_status IS DISTINCT FROM 'awaiting'
                   ORDER BY k, a.token_number
                   LIMIT 5
                 ) n), '[]'::jsonb),
               'waiting', (SELECT count(*) FROM public.appointments a
                           WHERE a.doctor_id = d.id AND a.appointment_date = v_today
                             AND a.status IN ('pending', 'confirmed', 'checked_in')
                             AND a.payment_status IS DISTINCT FROM 'awaiting')
             ) ORDER BY d.created_at, d.id)
      FROM public.doctors d
      LEFT JOIN public.doctor_queue_settings q ON q.doctor_id = d.id
      WHERE d.center_id = v_center.id AND d.is_active
    ), '[]'::jsonb) END
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION private.plan_price_pkr(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.org_active_doctors(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.mediq_branding(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.plan_price_pkr(text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.org_active_doctors(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.mediq_branding(uuid) TO authenticated, service_role;

notify pgrst, 'reload schema';
