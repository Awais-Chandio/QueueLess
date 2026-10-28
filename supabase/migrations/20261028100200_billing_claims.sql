-- Phase 2B.3: owners pay MediQ for a plan without a gateway.
--
-- The 2A "manual online" pattern, one level up: the owner sends the plan
-- price to MediQ's own Easypaisa / JazzCash / bank / Raast account, enters
-- the transaction ID (TID) on /settings/plan, and the MediQ team verifies it
-- in /admin. Verify switches the plan on until the end of the paid period.
--
-- 1. platform_settings (one row): MediQ's payment accounts, edited by the
--    platform admin (admin_set_platform_accounts). Owners read them through
--    get_plan_page. Also MediQ's WhatsApp support number
--    (admin_set_support_whatsapp), which every signed-in user reads with
--    get_support_contact (the app's Help button).
-- 2. billing_claims: one row per claim. Only claimed -> verified | rejected
--    ever changes; never deleted. A TID backs one claim at a time and one
--    verified payment ever (unique while claimed or verified). One open claim
--    per clinic, at most 5 claims per clinic per day.
-- 3. submit_billing_claim(org, user, plan, months, method, TID): server only
--    (the web route /api/plan-claim after it checked the signed-in owner,
--    Turnstile and its rate limit). The amount is the plan's price, worked
--    out here: 1 month or 12 (= 10 x monthly); Center x max(4, active doctors).
-- 4. admin_list_billing_claims(status), admin_resolve_billing_claim(claim,
--    accept, reason, note). Verify: the plan is active (lapses) until
--    now + months, or the current period end + months when the clinic renews
--    the plan it is on; a payment and a plan change in billing_events.
-- 5. get_plan_page(org): owner: plan status, the plans with this clinic's
--    prices, MediQ's accounts, open and recent claims.
-- 6. admin_list_clinics: + subscription status, trial end, pending claims.

-- ---------------------------------------------------------------------------
-- 1. MediQ's accounts
-- ---------------------------------------------------------------------------
CREATE TABLE public.platform_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  easypaisa_number text CHECK (easypaisa_number ~ '^03[0-9]{9}$'),
  easypaisa_title text CHECK (char_length(easypaisa_title) BETWEEN 1 AND 100),
  jazzcash_number text CHECK (jazzcash_number ~ '^03[0-9]{9}$'),
  jazzcash_title text CHECK (char_length(jazzcash_title) BETWEEN 1 AND 100),
  bank_name text CHECK (char_length(bank_name) BETWEEN 1 AND 100),
  bank_title text CHECK (char_length(bank_title) BETWEEN 1 AND 100),
  bank_iban text CHECK (bank_iban ~ '^PK[0-9]{2}[A-Z]{4}[0-9]{16}$'),
  raast_id text CHECK (raast_id ~ '^03[0-9]{9}$'),
  support_whatsapp text CHECK (support_whatsapp ~ '^03[0-9]{9}$'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CHECK ((easypaisa_number IS NULL) = (easypaisa_title IS NULL)),
  CHECK ((jazzcash_number IS NULL) = (jazzcash_title IS NULL)),
  CHECK ((bank_name IS NULL) = (bank_title IS NULL) AND (bank_title IS NULL) = (bank_iban IS NULL))
);

COMMENT ON TABLE public.platform_settings IS
  'One row: MediQ''s own payment accounts that clinic owners pay plans to, and its WhatsApp support number. Platform admin writes (admin_set_platform_accounts, admin_set_support_whatsapp); owners see the accounts in get_plan_page, everyone signed in the support number (get_support_contact).';

INSERT INTO public.platform_settings DEFAULT VALUES;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_settings FROM anon, authenticated;

CREATE FUNCTION private.platform_accounts_json()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'easypaisa', CASE WHEN s.easypaisa_number IS NOT NULL THEN
                   jsonb_build_object('number', s.easypaisa_number, 'title', s.easypaisa_title) END,
    'jazzcash', CASE WHEN s.jazzcash_number IS NOT NULL THEN
                  jsonb_build_object('number', s.jazzcash_number, 'title', s.jazzcash_title) END,
    'bank', CASE WHEN s.bank_iban IS NOT NULL THEN
              jsonb_build_object('name', s.bank_name, 'title', s.bank_title, 'iban', s.bank_iban) END,
    'raast', CASE WHEN s.raast_id IS NOT NULL THEN jsonb_build_object('id', s.raast_id) END
  ))
  FROM public.platform_settings s;
$function$;

CREATE FUNCTION public.admin_get_platform_settings()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM private.require_platform_admin();
  RETURN (SELECT to_jsonb(s) - 'id' - 'updated_by' FROM public.platform_settings s);
END;
$function$;

-- MediQ's WhatsApp support number (empty clears it).
CREATE FUNCTION public.admin_set_support_whatsapp(p_number text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_number text := private.clean_mobile_account(p_number, 'WhatsApp number');
BEGIN
  PERFORM private.require_platform_admin();
  UPDATE public.platform_settings SET support_whatsapp = v_number, updated_at = now(), updated_by = auth.uid()
  WHERE id;
  RETURN public.admin_get_platform_settings();
END;
$function$;

-- The app's Help button (any signed-in user): {"whatsapp": "03001234567"} or {}.
CREATE FUNCTION public.get_support_contact()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_strip_nulls(jsonb_build_object('whatsapp', s.support_whatsapp)) FROM public.platform_settings s;
$function$;

-- Same rules as set_center_fee_settings: an empty account clears it.
CREATE FUNCTION public.admin_set_platform_accounts(
  p_easypaisa_number text DEFAULT NULL,
  p_easypaisa_title text DEFAULT NULL,
  p_jazzcash_number text DEFAULT NULL,
  p_jazzcash_title text DEFAULT NULL,
  p_bank_name text DEFAULT NULL,
  p_bank_title text DEFAULT NULL,
  p_bank_iban text DEFAULT NULL,
  p_raast_id text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_ep_number text := private.clean_mobile_account(p_easypaisa_number, 'Easypaisa number');
  v_ep_title text := private.clean_text(p_easypaisa_title, 100);
  v_jc_number text := private.clean_mobile_account(p_jazzcash_number, 'JazzCash number');
  v_jc_title text := private.clean_text(p_jazzcash_title, 100);
  v_bank_name text := private.clean_text(p_bank_name, 100);
  v_bank_title text := private.clean_text(p_bank_title, 100);
  v_iban text := NULLIF(upper(regexp_replace(COALESCE(p_bank_iban, ''), '[\s-]', '', 'g')), '');
  v_raast text := private.clean_mobile_account(p_raast_id, 'Raast ID');
BEGIN
  PERFORM private.require_platform_admin();
  IF (v_ep_number IS NULL) <> (v_ep_title IS NULL) THEN
    RAISE EXCEPTION 'Easypaisa needs both the number and the account title' USING ERRCODE = '22023';
  END IF;
  IF (v_jc_number IS NULL) <> (v_jc_title IS NULL) THEN
    RAISE EXCEPTION 'JazzCash needs both the number and the account title' USING ERRCODE = '22023';
  END IF;
  IF NOT ((v_bank_name IS NULL) = (v_bank_title IS NULL) AND (v_bank_title IS NULL) = (v_iban IS NULL)) THEN
    RAISE EXCEPTION 'Bank needs the bank name, account title and IBAN' USING ERRCODE = '22023';
  END IF;
  IF v_iban IS NOT NULL AND v_iban !~ '^PK[0-9]{2}[A-Z]{4}[0-9]{16}$' THEN
    RAISE EXCEPTION 'IBAN must look like PK36SCBL0000001123456702 (24 characters)' USING ERRCODE = '22023';
  END IF;

  UPDATE public.platform_settings
  SET easypaisa_number = v_ep_number, easypaisa_title = v_ep_title,
      jazzcash_number = v_jc_number, jazzcash_title = v_jc_title,
      bank_name = v_bank_name, bank_title = v_bank_title, bank_iban = v_iban,
      raast_id = v_raast, updated_at = now(), updated_by = auth.uid()
  -- The one row (pg_safeupdate refuses an UPDATE without WHERE over the API).
  WHERE id;
  RETURN public.admin_get_platform_settings();
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Claims
-- ---------------------------------------------------------------------------
CREATE TABLE public.billing_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  plan_id text NOT NULL REFERENCES public.plans(id),
  months integer NOT NULL CHECK (months IN (1, 12)),
  -- Doctors the price counts (per-doctor plans); 1 otherwise.
  doctors integer NOT NULL DEFAULT 1 CHECK (doctors BETWEEN 1 AND 1000),
  amount_pkr integer NOT NULL CHECK (amount_pkr BETWEEN 1 AND 100000000),
  method text NOT NULL CHECK (method IN ('easypaisa', 'jazzcash', 'bank')),
  reference text NOT NULL CHECK (reference ~ '^[A-Z0-9/-]{4,30}$'),
  status text NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'verified', 'rejected')),
  reason text CHECK (reason IN ('not_received', 'wrong_amount', 'other')),
  note text CHECK (char_length(note) <= 500),
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  period_start timestamptz,
  period_end timestamptz,
  CHECK ((status = 'claimed') = (resolved_at IS NULL)),
  CHECK ((status = 'rejected') = (reason IS NOT NULL)),
  CHECK ((status = 'verified') = (period_end IS NOT NULL))
);

COMMENT ON TABLE public.billing_claims IS
  'An owner says they paid MediQ for a plan (method + TID); the platform admin verifies (plan on until period_end) or rejects. Only claimed -> verified | rejected changes; never deleted.';

-- A TID backs one open claim and one verified payment, ever.
CREATE UNIQUE INDEX billing_claims_reference_once ON public.billing_claims (reference) WHERE status IN ('claimed', 'verified');
CREATE UNIQUE INDEX billing_claims_one_open ON public.billing_claims (organization_id) WHERE status = 'claimed';
CREATE INDEX idx_billing_claims_org_created ON public.billing_claims (organization_id, created_at DESC);
CREATE INDEX idx_billing_claims_status ON public.billing_claims (status, created_at);

CREATE FUNCTION private.billing_claims_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Billing claims are never deleted' USING ERRCODE = '42501';
  END IF;
  IF (NEW.id, NEW.organization_id, NEW.plan_id, NEW.months, NEW.doctors, NEW.amount_pkr, NEW.method, NEW.reference,
      NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.organization_id, OLD.plan_id, OLD.months, OLD.doctors, OLD.amount_pkr, OLD.method, OLD.reference,
      OLD.created_at) THEN
    RAISE EXCEPTION 'Billing claims cannot be changed' USING ERRCODE = '42501';
  END IF;
  -- An account that submitted or resolved it was deleted.
  IF (NEW.status, NEW.reason, NEW.note, NEW.resolved_at, NEW.period_start, NEW.period_end)
     IS NOT DISTINCT FROM (OLD.status, OLD.reason, OLD.note, OLD.resolved_at, OLD.period_start, OLD.period_end)
     AND (NEW.submitted_by IS NULL OR NEW.submitted_by = OLD.submitted_by)
     AND (NEW.resolved_by IS NULL OR NEW.resolved_by = OLD.resolved_by) THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'claimed' AND NEW.status IN ('verified', 'rejected') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Billing claims cannot be changed' USING ERRCODE = '42501';
END;
$function$;

CREATE TRIGGER billing_claims_append_only
  BEFORE UPDATE OR DELETE ON public.billing_claims
  FOR EACH ROW EXECUTE FUNCTION private.billing_claims_append_only();

ALTER TABLE public.billing_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_claims FROM anon, authenticated;
GRANT SELECT ON public.billing_claims TO authenticated;
CREATE POLICY "owners and admins read billing claims" ON public.billing_claims
  FOR SELECT TO authenticated
  USING (private.has_org_role(organization_id, ARRAY['owner']) OR public.is_admin());

CREATE FUNCTION private.billing_claim_json(p_claim public.billing_claims)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'id', p_claim.id, 'plan_id', p_claim.plan_id, 'plan_name', (SELECT name FROM public.plans WHERE id = p_claim.plan_id),
    'months', p_claim.months, 'doctors', p_claim.doctors, 'amount_pkr', p_claim.amount_pkr,
    'method', p_claim.method, 'reference', p_claim.reference, 'status', p_claim.status,
    'reason', p_claim.reason, 'note', p_claim.note, 'created_at', p_claim.created_at,
    'resolved_at', p_claim.resolved_at, 'period_end', p_claim.period_end
  );
$function$;

-- ---------------------------------------------------------------------------
-- 3. Owner: submit (server only)
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.submit_billing_claim(
  p_org_id uuid, p_user_id uuid, p_plan_id text, p_months integer, p_method text, p_reference text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  c_daily_max constant integer := 5;
  v_method text := lower(btrim(COALESCE(p_method, '')));
  v_reference text := private.clean_reference(p_reference);
  v_plan public.plans%ROWTYPE;
  v_accounts public.platform_settings%ROWTYPE;
  v_doctors integer;
  v_claim public.billing_claims%ROWTYPE;
BEGIN
  IF NOT private.is_server_context() THEN
    RAISE EXCEPTION 'Plan payments go through the plan page' USING ERRCODE = '42501';
  END IF;
  PERFORM private.require_org(p_org_id);
  IF p_user_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.org_members m WHERE m.organization_id = p_org_id AND m.user_id = p_user_id AND m.role = 'owner') THEN
    RAISE EXCEPTION 'Only the clinic owner can pay for a plan' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_plan FROM public.plans WHERE id = p_plan_id;
  IF NOT FOUND OR NOT v_plan.is_public OR COALESCE(v_plan.monthly_price_pkr, 0) <= 0 THEN
    RAISE EXCEPTION 'Choose Solo, Pro or Center' USING ERRCODE = '22023';
  END IF;
  IF p_months IS NULL OR p_months NOT IN (1, 12) THEN
    RAISE EXCEPTION 'Pay for 1 month or 12 months' USING ERRCODE = '22023';
  END IF;
  IF v_method NOT IN ('easypaisa', 'jazzcash', 'bank') THEN
    RAISE EXCEPTION 'Choose Easypaisa, JazzCash or bank' USING ERRCODE = '22023';
  END IF;
  IF v_reference IS NULL THEN
    RAISE EXCEPTION 'Transaction ID must be 4 to 30 letters or digits' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_accounts FROM public.platform_settings;
  IF (v_method = 'easypaisa' AND v_accounts.easypaisa_number IS NULL)
     OR (v_method = 'jazzcash' AND v_accounts.jazzcash_number IS NULL)
     OR (v_method = 'bank' AND v_accounts.bank_iban IS NULL AND v_accounts.raast_id IS NULL) THEN
    RAISE EXCEPTION 'MediQ doesn''t take % payments', v_method USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('billing_claim:' || p_org_id, 0));
  IF EXISTS (SELECT 1 FROM public.billing_claims WHERE organization_id = p_org_id AND status = 'claimed') THEN
    RAISE EXCEPTION 'Your last payment is still being checked by MediQ' USING ERRCODE = 'PT409';
  END IF;
  IF (SELECT count(*) FROM public.billing_claims
      WHERE organization_id = p_org_id AND created_at > now() - interval '1 day') >= c_daily_max THEN
    RAISE EXCEPTION 'Too many attempts today. Please contact MediQ.' USING ERRCODE = 'PT429';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('billing_tid:' || v_reference, 0));
  IF EXISTS (SELECT 1 FROM public.billing_claims WHERE reference = v_reference AND status IN ('claimed', 'verified')) THEN
    RAISE EXCEPTION 'This transaction ID was already used' USING ERRCODE = 'PT409';
  END IF;

  v_doctors := CASE WHEN v_plan.per_doctor
                    THEN GREATEST(COALESCE(v_plan.min_doctors, 1), private.org_active_doctors(p_org_id)) ELSE 1 END;
  INSERT INTO public.billing_claims (organization_id, plan_id, months, doctors, amount_pkr, method, reference, submitted_by)
  VALUES (p_org_id, v_plan.id, p_months, v_doctors, private.plan_price_pkr(v_plan.id, p_months, v_doctors),
          v_method, v_reference, p_user_id)
  RETURNING * INTO v_claim;

  RETURN private.billing_claim_json(v_claim);
END;
$function$;

COMMENT ON FUNCTION public.submit_billing_claim(uuid, uuid, text, integer, text, text) IS
  'Server only (web /api/plan-claim after it checked the signed-in owner and Turnstile): the owner paid MediQ for a plan. Amount from the plan price; one open claim per clinic; 5 a day; a TID once.';

-- ---------------------------------------------------------------------------
-- 4. Platform admin
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.admin_list_billing_claims(p_status text DEFAULT 'claimed')
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM private.require_platform_admin();
  IF p_status IS NOT NULL AND p_status NOT IN ('claimed', 'verified', 'rejected') THEN
    RAISE EXCEPTION 'Status must be claimed, verified or rejected' USING ERRCODE = '22023';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(private.billing_claim_json(c) || jsonb_build_object(
             'organization_id', o.id,
             'organization_name', o.name,
             'current_plan_id', e.plan_id,
             'submitted_by', u.email,
             'resolved_by', ru.email)
           ORDER BY c.created_at)
    FROM (SELECT * FROM public.billing_claims
          WHERE p_status IS NULL OR status = p_status
          ORDER BY created_at DESC LIMIT 200) c
    JOIN public.organizations o ON o.id = c.organization_id
    LEFT JOIN public.org_entitlements e ON e.organization_id = o.id
    LEFT JOIN auth.users u ON u.id = c.submitted_by
    LEFT JOIN auth.users ru ON ru.id = c.resolved_by
  ), '[]'::jsonb);
END;
$function$;

CREATE FUNCTION public.admin_resolve_billing_claim(p_claim_id uuid, p_accept boolean, p_reason text DEFAULT NULL, p_note text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_reason text := lower(btrim(COALESCE(p_reason, '')));
  v_note text := private.clean_text(p_note, 500);
  v_claim public.billing_claims%ROWTYPE;
  v_org public.organizations%ROWTYPE;
  v_live public.org_subscriptions%ROWTYPE;
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  PERFORM private.require_platform_admin();
  SELECT * INTO v_claim FROM public.billing_claims WHERE id = p_claim_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim not found' USING ERRCODE = 'PT404';
  END IF;
  -- Plan first, then the claim: the same order as every plan change.
  PERFORM pg_advisory_xact_lock(hashtextextended('org_plan:' || v_claim.organization_id, 0));
  SELECT * INTO v_claim FROM public.billing_claims WHERE id = p_claim_id FOR UPDATE;
  IF v_claim.status <> 'claimed' THEN
    RAISE EXCEPTION 'This claim was already handled' USING ERRCODE = 'PT409';
  END IF;
  SELECT * INTO v_org FROM public.organizations WHERE id = v_claim.organization_id;

  IF NOT COALESCE(p_accept, false) THEN
    IF v_reason NOT IN ('not_received', 'wrong_amount', 'other') THEN
      RAISE EXCEPTION 'Choose why: not received, wrong amount or other' USING ERRCODE = '22023';
    END IF;
    UPDATE public.billing_claims
    SET status = 'rejected', reason = v_reason, note = v_note, resolved_by = auth.uid(), resolved_at = now()
    WHERE id = p_claim_id
    RETURNING * INTO v_claim;
    RETURN private.billing_claim_json(v_claim);
  END IF;

  -- Renewing the plan it is on (still paid): the new months follow on.
  SELECT * INTO v_live FROM public.org_subscriptions
  WHERE organization_id = v_claim.organization_id AND status <> 'cancelled'
  ORDER BY created_at DESC LIMIT 1;
  v_start := CASE WHEN v_live.plan_id = v_claim.plan_id AND v_live.status = 'active' AND v_live.lapses
                       AND v_live.current_period_end > now()
                  THEN v_live.current_period_end ELSE now() END;
  v_end := v_start + make_interval(months => v_claim.months);

  UPDATE public.org_subscriptions SET status = 'cancelled', current_period_end = COALESCE(current_period_end, now())
  WHERE organization_id = v_claim.organization_id AND status <> 'cancelled';
  INSERT INTO public.org_subscriptions (organization_id, plan_id, status, current_period_start, current_period_end, lapses)
  VALUES (v_claim.organization_id, v_claim.plan_id, 'active', now(), v_end, true);

  INSERT INTO public.billing_events (organization_id, kind, amount_pkr, method, paid_on, note, created_by)
  VALUES (v_claim.organization_id, 'payment', v_claim.amount_pkr, v_claim.method, private.org_today(v_claim.organization_id),
          'TID ' || v_claim.reference || ' · ' || v_claim.months || ' month(s)' || COALESCE(' · ' || v_note, ''), auth.uid());
  INSERT INTO public.billing_events (organization_id, kind, plan_id, period_end, note, created_by)
  VALUES (v_claim.organization_id, 'plan_change', v_claim.plan_id, (v_end AT TIME ZONE v_org.timezone)::date,
          'Paid online (verified)', auth.uid());

  UPDATE public.billing_claims
  SET status = 'verified', note = v_note, resolved_by = auth.uid(), resolved_at = now(),
      period_start = v_start, period_end = v_end
  WHERE id = p_claim_id
  RETURNING * INTO v_claim;
  RETURN private.billing_claim_json(v_claim);
END;
$function$;

COMMENT ON FUNCTION public.admin_resolve_billing_claim(uuid, boolean, text, text) IS
  'Platform admin: verify a plan payment (plan active until now + months, or current period end + months on a renewal) or reject it (not_received | wrong_amount | other).';

-- ---------------------------------------------------------------------------
-- 5. Owner: the plan page
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.get_plan_page(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_doctors integer;
BEGIN
  PERFORM private.require_owner(p_org_id);
  v_doctors := private.org_active_doctors(p_org_id);
  RETURN jsonb_build_object(
    'status', public.get_plan_status(p_org_id),
    'active_doctors', v_doctors,
    'plans', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', p.id, 'name', p.name, 'monthly_price_pkr', p.monthly_price_pkr,
               'per_doctor', p.per_doctor, 'min_doctors', p.min_doctors, 'recommended', p.recommended,
               'modules', to_jsonb(p.modules), 'tokens_per_day', p.tokens_per_day,
               'max_doctors', p.max_doctors, 'max_centers', p.max_centers,
               'price_1', private.plan_price_pkr(p.id, 1, v_doctors),
               'price_12', private.plan_price_pkr(p.id, 12, v_doctors)
             ) ORDER BY p.sort_order)
      FROM public.plans p WHERE p.is_public
    ), '[]'::jsonb),
    'accounts', private.platform_accounts_json(),
    'open_claim', (SELECT private.billing_claim_json(c) FROM public.billing_claims c
                   WHERE c.organization_id = p_org_id AND c.status = 'claimed'),
    'claims', COALESCE((
      SELECT jsonb_agg(private.billing_claim_json(c) ORDER BY c.created_at DESC)
      FROM (SELECT * FROM public.billing_claims WHERE organization_id = p_org_id ORDER BY created_at DESC LIMIT 10) c
    ), '[]'::jsonb)
  );
END;
$function$;

COMMENT ON FUNCTION public.get_plan_page(uuid) IS
  'Owner: plan status, public plans with this clinic''s 1- and 12-month prices, MediQ''s payment accounts, the open claim and the last 10 claims.';

-- ---------------------------------------------------------------------------
-- 6. admin_list_clinics as in 1E, plus subscription status, trial end and
--    pending claims
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_clinics()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM private.require_platform_admin();
  RETURN COALESCE((
    SELECT jsonb_agg(c ORDER BY c->>'created_at' DESC)
    FROM (
      SELECT jsonb_build_object(
        'id', o.id,
        'name', o.name,
        'slug', o.slug,
        'status', o.status,
        'created_at', o.created_at,
        'plan_id', e.plan_id,
        'plan_name', p.name,
        'period_end', s.current_period_end,
        'subscription_status', s.status,
        'lapses', s.lapses,
        'trial_ends_at', o.trial_ends_at,
        'pending_claims', (SELECT count(*) FROM public.billing_claims bc WHERE bc.organization_id = o.id AND bc.status = 'claimed'),
        'owners', COALESCE((SELECT jsonb_agg(u.email ORDER BY u.email) FROM public.org_members m
                            JOIN auth.users u ON u.id = m.user_id
                            WHERE m.organization_id = o.id AND m.role = 'owner'), '[]'::jsonb),
        'centers', (SELECT count(*) FROM public.service_centers sc WHERE sc.organization_id = o.id),
        'active_doctors', private.org_active_doctors(o.id),
        'tokens_today', (SELECT count(*) FROM public.appointments a JOIN public.service_centers sc ON sc.id = a.center_id
                         WHERE sc.organization_id = o.id AND a.appointment_date = private.org_today(o.id) AND a.status <> 'cancelled'),
        'tokens_30d', (SELECT count(*) FROM public.appointments a JOIN public.service_centers sc ON sc.id = a.center_id
                       WHERE sc.organization_id = o.id AND a.appointment_date > private.org_today(o.id) - 30 AND a.status <> 'cancelled'),
        'message_credits', COALESCE((SELECT balance FROM public.message_credits mc WHERE mc.organization_id = o.id), 0),
        'messages_30d', (SELECT count(*) FROM public.message_log ml
                         WHERE ml.organization_id = o.id AND ml.created_at > now() - interval '30 days' AND ml.status IN ('sent', 'delivered')),
        'last_payment', (SELECT jsonb_build_object('amount_pkr', b.amount_pkr, 'paid_on', b.paid_on, 'method', b.method, 'note', b.note)
                         FROM public.billing_events b WHERE b.organization_id = o.id AND b.kind = 'payment'
                         ORDER BY b.paid_on DESC NULLS LAST, b.created_at DESC LIMIT 1)
      ) AS c
      FROM public.organizations o
      LEFT JOIN public.org_entitlements e ON e.organization_id = o.id
      LEFT JOIN public.plans p ON p.id = e.plan_id
      LEFT JOIN public.org_subscriptions s ON s.organization_id = o.id AND s.status <> 'cancelled'
    ) clinics
  ), '[]'::jsonb);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION private.platform_accounts_json() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.billing_claims_append_only() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.billing_claim_json(public.billing_claims) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.submit_billing_claim(uuid, uuid, text, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_billing_claim(uuid, uuid, text, integer, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_get_platform_settings() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_support_whatsapp(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_support_contact() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_platform_accounts(text, text, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_billing_claims(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_resolve_billing_claim(uuid, boolean, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_plan_page(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_platform_settings() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_support_whatsapp(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_support_contact() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_platform_accounts(text, text, text, text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_billing_claims(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_resolve_billing_claim(uuid, boolean, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_plan_page(uuid) TO authenticated, service_role;

notify pgrst, 'reload schema';
