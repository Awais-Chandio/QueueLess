-- Phase 2B.2: trial and plan lifecycle.
--
-- 1. organizations.trial_ends_at: set once, when the 14-day trial starts.
--    New organizations start on the trial (org_subscriptions: plan trial,
--    status trialing, current_period_end = trial end). One trial per
--    organization: nothing restarts it.
-- 2. Organizations still on plain Free (never set by the platform admin,
--    entitlements not edited by hand) move to the trial, starting now. Every
--    other organization keeps its plan: their subscriptions get lapses =
--    false, so a "paid until" date an admin typed before 2B stays
--    informational.
-- 3. org_subscriptions.lapses: when the period ends the plan lapses. Daily
--    pg_cron 'plan-lifecycle' (00:05 Pakistan time):
--      trialing, trial over                 -> basic
--      active paid period over (lapses)     -> past_due (3 days of grace,
--                                              every feature still on)
--      past_due, grace over                 -> basic
--    Nothing is deleted: Basic keeps every record readable.
-- 4. get_plan_status(org): what the banners show, for every member.
--      banner trial   trialing, from day 10 ("Trial X din baaki")
--             renew   paid plan, 5 days or less left
--             grace   paid period over, grace days left
--             basic   on Basic after the trial or a paid plan
-- 5. admin_set_plan: a "paid until" date now lapses at the end of that day;
--    without one the plan never lapses (as before). Plan 'trial' starts a
--    14-day trial.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.organizations ADD COLUMN trial_ends_at timestamptz;
COMMENT ON COLUMN public.organizations.trial_ends_at IS
  'End of the 14-day trial; set once when it starts (signup, or the 2B move from Free). NULL = never had a trial.';

ALTER TABLE public.org_subscriptions ADD COLUMN lapses boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.org_subscriptions.lapses IS
  'true: at current_period_end the plan lapses (trial -> basic; paid -> 3 days past_due -> basic). false: the period end is informational.';

-- Existing plans (admin overrides) never lapse on their own.
UPDATE public.org_subscriptions SET lapses = false WHERE status <> 'cancelled';

CREATE INDEX idx_org_subscriptions_lifecycle ON public.org_subscriptions (current_period_end)
  WHERE status IN ('trialing', 'active', 'past_due') AND lapses;

-- ---------------------------------------------------------------------------
-- 2. Starting a trial, lapsing to Basic
-- ---------------------------------------------------------------------------
CREATE FUNCTION private.start_trial(p_org_id uuid)
 RETURNS timestamptz
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_ends timestamptz := now() + interval '14 days';
BEGIN
  UPDATE public.org_subscriptions SET status = 'cancelled', current_period_end = COALESCE(current_period_end, now())
  WHERE organization_id = p_org_id AND status <> 'cancelled';
  INSERT INTO public.org_subscriptions (organization_id, plan_id, status, current_period_end, lapses)
  VALUES (p_org_id, 'trial', 'trialing', v_ends, true);
  UPDATE public.organizations SET trial_ends_at = v_ends WHERE id = p_org_id;
  RETURN v_ends;
END;
$function$;

-- The live subscription is replaced by Basic, with a billing event saying why.
CREATE FUNCTION private.lapse_to_basic(p_org_id uuid, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('org_plan:' || p_org_id, 0));
  UPDATE public.org_subscriptions SET status = 'cancelled'
  WHERE organization_id = p_org_id AND status <> 'cancelled';
  INSERT INTO public.org_subscriptions (organization_id, plan_id, status, lapses)
  VALUES (p_org_id, 'basic', 'active', false);
  INSERT INTO public.billing_events (organization_id, kind, plan_id, note)
  VALUES (p_org_id, 'plan_change', 'basic', p_note);
END;
$function$;

-- New organizations start on the trial.
CREATE OR REPLACE FUNCTION private.organizations_default_subscription()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM private.start_trial(NEW.id);
  RETURN NULL;
END;
$function$;

-- Plain Free organizations: on Free, no plan change by the admin ever, and
-- entitlements still exactly the Free plan's.
WITH movers AS (
  SELECT s.organization_id
  FROM public.org_subscriptions s
  JOIN public.org_entitlements e ON e.organization_id = s.organization_id
  JOIN public.plans p ON p.id = 'free'
  WHERE s.status <> 'cancelled' AND s.plan_id = 'free'
    AND NOT EXISTS (SELECT 1 FROM public.billing_events b WHERE b.organization_id = s.organization_id AND b.kind = 'plan_change')
    AND e.plan_id = 'free'
    AND e.modules @> p.modules AND e.modules <@ p.modules
    AND (e.tokens_per_day, e.max_doctors, e.max_centers) IS NOT DISTINCT FROM (p.tokens_per_day, p.max_doctors, p.max_centers)
)
SELECT count(private.start_trial(m.organization_id)) FROM movers m;

INSERT INTO public.billing_events (organization_id, kind, plan_id, period_end, note)
SELECT o.id, 'plan_change', 'trial', (o.trial_ends_at AT TIME ZONE o.timezone)::date, '14-day trial (Phase 2B)'
FROM public.organizations o
WHERE o.trial_ends_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Daily lifecycle
-- ---------------------------------------------------------------------------
CREATE FUNCTION private.run_plan_lifecycle()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_sub public.org_subscriptions%ROWTYPE;
  v_trials integer := 0;
  v_past_due integer := 0;
  v_lapsed integer := 0;
BEGIN
  FOR v_sub IN
    SELECT * FROM public.org_subscriptions
    WHERE status = 'trialing' AND lapses AND current_period_end <= now()
  LOOP
    PERFORM private.lapse_to_basic(v_sub.organization_id, 'Trial ended');
    v_trials := v_trials + 1;
  END LOOP;

  UPDATE public.org_subscriptions
  SET status = 'past_due'
  WHERE status = 'active' AND lapses AND current_period_end <= now();
  GET DIAGNOSTICS v_past_due = ROW_COUNT;

  FOR v_sub IN
    SELECT * FROM public.org_subscriptions
    WHERE status = 'past_due' AND lapses AND current_period_end + interval '3 days' <= now()
  LOOP
    PERFORM private.lapse_to_basic(v_sub.organization_id, 'Plan expired (not renewed)');
    v_lapsed := v_lapsed + 1;
  END LOOP;

  RETURN jsonb_build_object('trials_ended', v_trials, 'past_due', v_past_due, 'lapsed', v_lapsed);
END;
$function$;

COMMENT ON FUNCTION private.run_plan_lifecycle() IS
  'pg_cron daily: ended trials -> basic; ended paid periods -> past_due; past_due + 3 days -> basic.';

SELECT cron.schedule('plan-lifecycle', '5 19 * * *', 'SELECT private.run_plan_lifecycle()');

-- ---------------------------------------------------------------------------
-- 4. Banners
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.get_plan_status(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_org public.organizations%ROWTYPE;
  v_sub public.org_subscriptions%ROWTYPE;
  v_plan public.plans%ROWTYPE;
  v_until timestamptz;
  v_days integer;
  v_banner text;
BEGIN
  v_org := private.require_org(p_org_id);
  IF NOT private.is_server_context() AND NOT public.is_admin()
     AND NOT private.has_org_role(p_org_id, ARRAY['owner', 'receptionist', 'doctor']) THEN
    RAISE EXCEPTION 'Not a member of this clinic' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_sub FROM public.org_subscriptions
  WHERE organization_id = p_org_id AND status <> 'cancelled' ORDER BY created_at DESC LIMIT 1;
  SELECT p.* INTO v_plan FROM public.org_entitlements e JOIN public.plans p ON p.id = e.plan_id
  WHERE e.organization_id = p_org_id;

  v_until := CASE
    WHEN NOT COALESCE(v_sub.lapses, false) THEN NULL
    WHEN v_sub.status = 'past_due' THEN v_sub.current_period_end + interval '3 days'
    ELSE v_sub.current_period_end END;
  v_days := CASE WHEN v_until IS NOT NULL THEN GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_until - now())) / 86400))::integer END;

  v_banner := CASE
    WHEN v_sub.status = 'trialing' AND v_days <= 5 THEN 'trial'
    WHEN v_sub.status = 'past_due' THEN 'grace'
    WHEN v_sub.status = 'active' AND v_days <= 5 THEN 'renew'
    WHEN v_plan.id = 'basic' THEN 'basic'
  END;

  RETURN jsonb_build_object(
    'plan_id', v_plan.id,
    'plan_name', v_plan.name,
    'status', v_sub.status,
    'trial_ends_at', v_org.trial_ends_at,
    'period_end', v_sub.current_period_end,
    'lapses', COALESCE(v_sub.lapses, false),
    'grace_ends_at', CASE WHEN v_sub.status = 'past_due' THEN v_until END,
    'days_left', v_days,
    'banner', v_banner,
    'is_owner', private.is_server_context() OR public.is_admin() OR private.has_org_role(p_org_id, ARRAY['owner'])
  );
END;
$function$;

COMMENT ON FUNCTION public.get_plan_status(uuid) IS
  'Members: plan, subscription status, trial / period / grace end, days left, banner (trial from day 10 | renew 5 days before | grace | basic).';

-- ---------------------------------------------------------------------------
-- 5. admin_set_plan
-- ---------------------------------------------------------------------------
-- As in 1E. A "paid until" date lapses at the end of that day (clinic time);
-- no date = never lapses. 'trial' starts a 14-day trial instead.
CREATE OR REPLACE FUNCTION public.admin_set_plan(p_org_id uuid, p_plan_id text, p_period_end date DEFAULT NULL, p_note text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_org public.organizations%ROWTYPE;
  v_end timestamptz;
BEGIN
  PERFORM private.require_platform_admin();
  v_org := private.require_org(p_org_id);
  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE id = p_plan_id) THEN
    RAISE EXCEPTION 'Unknown plan "%"', p_plan_id USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('org_plan:' || p_org_id, 0));
  IF p_plan_id = 'trial' THEN
    v_end := private.start_trial(p_org_id);
  ELSE
    v_end := CASE WHEN p_period_end IS NOT NULL THEN (p_period_end + 1)::timestamp AT TIME ZONE v_org.timezone END;
    UPDATE public.org_subscriptions SET status = 'cancelled', current_period_end = COALESCE(current_period_end, now())
    WHERE organization_id = p_org_id AND status <> 'cancelled';
    INSERT INTO public.org_subscriptions (organization_id, plan_id, status, current_period_end, lapses)
    VALUES (p_org_id, p_plan_id, 'active', v_end, v_end IS NOT NULL);
  END IF;

  INSERT INTO public.billing_events (organization_id, kind, plan_id, period_end, note, created_by)
  VALUES (p_org_id, 'plan_change', p_plan_id, COALESCE(p_period_end, (v_end AT TIME ZONE v_org.timezone)::date),
          private.clean_text(p_note, 500), auth.uid());

  RETURN (SELECT jsonb_build_object('plan_id', e.plan_id, 'modules', to_jsonb(e.modules), 'tokens_per_day', e.tokens_per_day,
                                    'max_doctors', e.max_doctors, 'max_centers', e.max_centers)
          FROM public.org_entitlements e WHERE e.organization_id = p_org_id);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION private.start_trial(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.lapse_to_basic(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.run_plan_lifecycle() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.get_plan_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_plan_status(uuid) TO authenticated, service_role;

notify pgrst, 'reload schema';
