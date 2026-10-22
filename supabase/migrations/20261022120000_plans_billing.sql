-- Phase 1E: plan checks on every module RPC, clinic insights, manual billing.
--
-- 1. private.require_module(org, module) raises PT402 (HTTP 402) with a
--    message the desk can act on. Added to the module RPCs that did not check
--    yet (issue_token, charge_message_credits and the outbox already did):
--      queue           call_next, skip_token, mark_no_show, recall_token
--                      (via lock_operable_appointment), set_doctor_break,
--                      set_doctor_late
--      online_booking  lock_slot, book_appointment (app bookings: Free
--                      clinics no longer take them; the app hides booking)
--      analytics       get_clinic_insights (new)
-- 2. get_clinic_insights(center, days): per day tokens, seen, no-shows,
--    average wait and consultation time.
-- 3. Manual billing for the platform admin (profiles.role = 'admin'):
--      billing_events      plan changes, credit top-ups, payments, suspensions
--      admin_list_clinics()
--      admin_set_plan(org, plan, period_end, note)
--      admin_add_credits(org, credits, note)
--      admin_add_payment(org, amount_pkr, method, note, paid_on)
--      admin_set_org_status(org, active|suspended, note)
--      admin_clinic_billing(org)
-- 4. Owners: get_org_settings also returns message language, message usage
--    and billing history; set_message_language(org, ur|en).

-- ---------------------------------------------------------------------------
-- 1. Module checks
-- ---------------------------------------------------------------------------
CREATE FUNCTION private.require_module(p_org_id uuid, p_module text)
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

-- skip / no-show / recall go through this helper.
CREATE OR REPLACE FUNCTION private.lock_operable_appointment(p_appointment_id uuid)
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
  IF NOT private.is_server_context() AND NOT private.can_operate_appointment(v_appt.center_id, v_appt.doctor_id) THEN
    RAISE EXCEPTION 'Only staff of this center or the assigned doctor can change this token' USING ERRCODE = '42501';
  END IF;
  PERFORM private.require_module(private.center_organization(v_appt.center_id), 'queue');
  RETURN v_appt;
END;
$function$;

-- call_next as in 1C, plus the queue module.
CREATE OR REPLACE FUNCTION public.call_next(p_doctor_id uuid)
 RETURNS TABLE (appointment_id uuid, token_number integer, patient_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_doctor public.doctors%ROWTYPE;
  v_today date;
  v_next public.appointments%ROWTYPE;
BEGIN
  SELECT * INTO v_doctor FROM public.doctors WHERE id = p_doctor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Doctor not found' USING ERRCODE = 'PT404';
  END IF;
  IF NOT private.is_server_context() AND NOT private.can_manage_doctor(p_doctor_id) THEN
    RAISE EXCEPTION 'Only staff of this center or the doctor can call the next token' USING ERRCODE = '42501';
  END IF;
  PERFORM private.require_module(private.center_organization(v_doctor.center_id), 'queue');
  IF v_doctor.is_on_break OR EXISTS (SELECT 1 FROM public.doctor_queue_settings q WHERE q.doctor_id = p_doctor_id AND q.is_on_break) THEN
    RAISE EXCEPTION 'The doctor is on a break' USING ERRCODE = 'PT409';
  END IF;

  v_today := private.org_today(private.center_organization(v_doctor.center_id));
  -- Two desks pressing "next" at once call two different tokens, in order.
  PERFORM pg_advisory_xact_lock(hashtextextended('call_next:' || p_doctor_id || ':' || v_today, 0));

  IF v_doctor.late_until IS NOT NULL THEN
    UPDATE public.doctors SET late_until = NULL, updated_at = now() WHERE id = p_doctor_id;
  END IF;

  UPDATE public.appointments a
  SET status = 'completed',
      completed_at = now(),
      duration_minutes = COALESCE(a.duration_minutes,
        GREATEST(1, (EXTRACT(EPOCH FROM (now() - COALESCE(a.started_at, a.called_at, now()))) / 60)::integer))
  WHERE a.doctor_id = p_doctor_id
    AND a.appointment_date = v_today
    AND a.status IN ('called', 'in_progress');

  SELECT * INTO v_next
  FROM public.appointments a
  WHERE a.doctor_id = p_doctor_id
    AND a.appointment_date = v_today
    AND a.status IN ('pending', 'confirmed', 'checked_in')
  ORDER BY COALESCE(a.skipped_at, a.created_at, a.scheduled_at), a.token_number
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_next.status = 'pending' THEN
    UPDATE public.appointments SET status = 'confirmed' WHERE id = v_next.id;
  END IF;

  UPDATE public.appointments
  SET status = 'called', called_at = now()
  WHERE id = v_next.id
  RETURNING * INTO v_next;

  RETURN QUERY
  SELECT v_next.id, v_next.token_number,
         COALESCE(CASE WHEN p.user_id IS NOT NULL THEN NULLIF(pr.full_name, '') END, p.name, pr.full_name)
  FROM public.patients p
  LEFT JOIN public.profiles pr ON pr.id = v_next.user_id
  WHERE p.id = v_next.patient_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_doctor_break(p_doctor_id uuid, p_on_break boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_center uuid;
BEGIN
  SELECT center_id INTO v_center FROM public.doctors WHERE id = p_doctor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Doctor not found' USING ERRCODE = 'PT404';
  END IF;
  IF NOT private.is_server_context() AND NOT private.can_manage_doctor(p_doctor_id) THEN
    RAISE EXCEPTION 'Only staff of this center or the doctor can change the break' USING ERRCODE = '42501';
  END IF;
  PERFORM private.require_module(private.center_organization(v_center), 'queue');

  UPDATE public.doctors SET is_on_break = COALESCE(p_on_break, false), updated_at = now() WHERE id = p_doctor_id;

  INSERT INTO public.doctor_queue_settings (doctor_id, is_on_break, break_start, break_end, updated_at)
  VALUES (p_doctor_id, COALESCE(p_on_break, false), CASE WHEN p_on_break THEN now() END, NULL, now())
  ON CONFLICT (doctor_id) DO UPDATE
    SET is_on_break = EXCLUDED.is_on_break, break_start = EXCLUDED.break_start, break_end = NULL, updated_at = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_doctor_late(p_doctor_id uuid, p_minutes integer)
 RETURNS timestamptz
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_center uuid;
  v_until timestamptz;
BEGIN
  SELECT center_id INTO v_center FROM public.doctors WHERE id = p_doctor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Doctor not found' USING ERRCODE = 'PT404';
  END IF;
  IF NOT private.is_server_context() AND NOT private.can_manage_doctor(p_doctor_id) THEN
    RAISE EXCEPTION 'Only staff of this center or the doctor can change this' USING ERRCODE = '42501';
  END IF;
  PERFORM private.require_module(private.center_organization(v_center), 'queue');
  IF p_minutes IS NOT NULL AND (p_minutes < 0 OR p_minutes > 240) THEN
    RAISE EXCEPTION 'Late by 1 to 240 minutes' USING ERRCODE = '22023';
  END IF;

  v_until := CASE WHEN COALESCE(p_minutes, 0) > 0 THEN now() + make_interval(mins => p_minutes) END;
  UPDATE public.doctors SET late_until = v_until, updated_at = now() WHERE id = p_doctor_id;
  RETURN v_until;
END;
$function$;

-- App slot booking: needs online_booking.
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

  perform private.require_module(private.center_organization(p_center_id), 'online_booking');

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

  perform private.require_module(private.center_organization(v_lock.center_id), 'online_booking');

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
-- 2. Clinic insights (analytics module)
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.get_clinic_insights(p_center_id uuid, p_days integer DEFAULT 14)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_org uuid := private.center_organization(p_center_id);
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 14), 1), 90);
  v_today date;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Center not found' USING ERRCODE = 'PT404';
  END IF;
  IF NOT private.is_server_context()
     AND NOT private.can_manage_center(p_center_id)
     AND NOT EXISTS (SELECT 1 FROM public.doctors d WHERE d.center_id = p_center_id AND private.is_doctor_self(d.id))
  THEN
    RAISE EXCEPTION 'Not allowed to view this center''s insights' USING ERRCODE = '42501';
  END IF;
  PERFORM private.require_module(v_org, 'analytics');
  v_today := private.org_today(v_org);

  RETURN (
    WITH days AS (
      SELECT generate_series(v_today - (v_days - 1), v_today, interval '1 day')::date AS day
    ), tokens AS (
      SELECT a.appointment_date AS day, a.status,
             CASE WHEN a.called_at IS NOT NULL
                  THEN EXTRACT(EPOCH FROM (a.called_at - COALESCE(a.checked_in_at, a.created_at))) / 60 END AS wait_minutes,
             CASE WHEN a.status = 'completed' THEN a.duration_minutes END AS consult_minutes,
             EXTRACT(HOUR FROM a.created_at AT TIME ZONE COALESCE((SELECT timezone FROM public.organizations WHERE id = v_org), 'Asia/Karachi'))::integer AS hour
      FROM public.appointments a
      WHERE a.center_id = p_center_id
        AND a.appointment_date BETWEEN v_today - (v_days - 1) AND v_today
        AND a.status <> 'cancelled'
    ), per_day AS (
      SELECT d.day,
             count(t.status)::integer AS tokens,
             count(*) FILTER (WHERE t.status = 'completed')::integer AS seen,
             count(*) FILTER (WHERE t.status IN ('no_show', 'expired'))::integer AS missed,
             round(avg(t.wait_minutes) FILTER (WHERE t.wait_minutes >= 0))::integer AS avg_wait_minutes,
             round(avg(t.consult_minutes))::integer AS avg_consult_minutes
      FROM days d
      LEFT JOIN tokens t ON t.day = d.day
      GROUP BY d.day
    )
    SELECT jsonb_build_object(
      'today', v_today,
      'days', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.day) FROM per_day p),
      'totals', jsonb_build_object(
        'tokens', (SELECT count(*) FROM tokens),
        'seen', (SELECT count(*) FROM tokens WHERE status = 'completed'),
        'missed', (SELECT count(*) FROM tokens WHERE status IN ('no_show', 'expired')),
        'avg_wait_minutes', (SELECT round(avg(wait_minutes))::integer FROM tokens WHERE wait_minutes >= 0),
        'avg_consult_minutes', (SELECT round(avg(consult_minutes))::integer FROM tokens)
      ),
      'busiest_hour', (SELECT hour FROM tokens GROUP BY hour ORDER BY count(*) DESC, hour LIMIT 1)
    )
  );
END;
$function$;

COMMENT ON FUNCTION public.get_clinic_insights(uuid, integer) IS
  'Analytics module: per day tokens, seen, missed, average wait (check-in to call) and consultation minutes for one center. Staff, its doctors, admins.';

-- ---------------------------------------------------------------------------
-- 3. Manual billing
-- ---------------------------------------------------------------------------
CREATE TABLE public.billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('plan_change', 'credits', 'payment', 'status')),
  plan_id text REFERENCES public.plans(id),
  period_end date,
  credits integer,
  amount_pkr integer CHECK (amount_pkr >= 0),
  method text CHECK (char_length(method) <= 50),
  paid_on date,
  status text CHECK (status IN ('active', 'suspended')),
  note text CHECK (char_length(note) <= 500),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- clock_timestamp: several events in one transaction keep their order.
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_billing_events_org_created ON public.billing_events (organization_id, created_at DESC);

COMMENT ON TABLE public.billing_events IS
  'Manual billing history: plan changes, message credit top-ups, payments received, suspensions. Written by the platform admin RPCs.';

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_events FROM anon, authenticated;
GRANT SELECT ON public.billing_events TO authenticated;
CREATE POLICY "owners and admins read billing events" ON public.billing_events
  FOR SELECT TO authenticated
  USING (private.has_org_role(organization_id, ARRAY['owner']) OR public.is_admin());

CREATE FUNCTION private.require_platform_admin()
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT private.is_server_context() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Platform admins only' USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE FUNCTION private.require_org(p_org_id uuid)
 RETURNS public.organizations
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_org public.organizations%ROWTYPE;
BEGIN
  SELECT * INTO v_org FROM public.organizations WHERE id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clinic not found' USING ERRCODE = 'PT404';
  END IF;
  RETURN v_org;
END;
$function$;

-- Every clinic with what billing needs at a glance.
CREATE FUNCTION public.admin_list_clinics()
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
        'owners', COALESCE((SELECT jsonb_agg(u.email ORDER BY u.email) FROM public.org_members m
                            JOIN auth.users u ON u.id = m.user_id
                            WHERE m.organization_id = o.id AND m.role = 'owner'), '[]'::jsonb),
        'centers', (SELECT count(*) FROM public.service_centers sc WHERE sc.organization_id = o.id),
        'active_doctors', (SELECT count(*) FROM public.doctors d JOIN public.service_centers sc ON sc.id = d.center_id
                           WHERE sc.organization_id = o.id AND d.is_active),
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

-- Switch plan: the live subscription is cancelled and a new active one starts
-- (entitlements follow by trigger). period_end is informational (manual billing).
CREATE FUNCTION public.admin_set_plan(p_org_id uuid, p_plan_id text, p_period_end date DEFAULT NULL, p_note text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_org public.organizations%ROWTYPE;
BEGIN
  PERFORM private.require_platform_admin();
  v_org := private.require_org(p_org_id);
  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE id = p_plan_id) THEN
    RAISE EXCEPTION 'Unknown plan "%"', p_plan_id USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('org_plan:' || p_org_id, 0));
  UPDATE public.org_subscriptions SET status = 'cancelled', current_period_end = COALESCE(current_period_end, now())
  WHERE organization_id = p_org_id AND status <> 'cancelled';
  INSERT INTO public.org_subscriptions (organization_id, plan_id, status, current_period_end)
  VALUES (p_org_id, p_plan_id, 'active', p_period_end);

  INSERT INTO public.billing_events (organization_id, kind, plan_id, period_end, note, created_by)
  VALUES (p_org_id, 'plan_change', p_plan_id, p_period_end, private.clean_text(p_note, 500), auth.uid());

  RETURN (SELECT jsonb_build_object('plan_id', e.plan_id, 'modules', to_jsonb(e.modules), 'tokens_per_day', e.tokens_per_day,
                                    'max_doctors', e.max_doctors, 'max_centers', e.max_centers)
          FROM public.org_entitlements e WHERE e.organization_id = p_org_id);
END;
$function$;

-- Top up (or correct, with a negative number) prepaid message credits.
CREATE FUNCTION public.admin_add_credits(p_org_id uuid, p_credits integer, p_note text DEFAULT NULL)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_org public.organizations%ROWTYPE;
  v_balance integer;
BEGIN
  PERFORM private.require_platform_admin();
  v_org := private.require_org(p_org_id);
  IF p_credits IS NULL OR p_credits = 0 OR abs(p_credits) > 1000000 THEN
    RAISE EXCEPTION 'Credits must be a non-zero number up to 1,000,000' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.message_credits (organization_id, balance) VALUES (p_org_id, 0) ON CONFLICT DO NOTHING;
  UPDATE public.message_credits SET balance = balance + p_credits, updated_at = now()
  WHERE organization_id = p_org_id AND balance + p_credits >= 0
  RETURNING balance INTO v_balance;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The balance can''t go below zero' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.billing_events (organization_id, kind, credits, note, created_by)
  VALUES (p_org_id, 'credits', p_credits, private.clean_text(p_note, 500), auth.uid());
  RETURN v_balance;
END;
$function$;

-- A payment received outside the app (bank transfer, Easypaisa, cash).
CREATE FUNCTION public.admin_add_payment(
  p_org_id uuid, p_amount_pkr integer, p_method text DEFAULT NULL, p_note text DEFAULT NULL, p_paid_on date DEFAULT NULL
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_org public.organizations%ROWTYPE;
  v_id uuid;
BEGIN
  PERFORM private.require_platform_admin();
  v_org := private.require_org(p_org_id);
  IF p_amount_pkr IS NULL OR p_amount_pkr < 0 OR p_amount_pkr > 100000000 THEN
    RAISE EXCEPTION 'Enter the amount in PKR' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.billing_events (organization_id, kind, amount_pkr, method, paid_on, note, created_by)
  VALUES (p_org_id, 'payment', p_amount_pkr, private.clean_text(p_method, 50),
          COALESCE(p_paid_on, private.org_today(p_org_id)), private.clean_text(p_note, 500), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

-- Suspend (e.g. unpaid) or reactivate a clinic. A suspended clinic's staff
-- lose access and it takes no tokens; nothing is deleted.
CREATE FUNCTION public.admin_set_org_status(p_org_id uuid, p_status text, p_note text DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_org public.organizations%ROWTYPE;
BEGIN
  PERFORM private.require_platform_admin();
  v_org := private.require_org(p_org_id);
  IF p_status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'Status must be active or suspended' USING ERRCODE = '22023';
  END IF;
  IF v_org.status = p_status THEN
    RETURN;
  END IF;
  UPDATE public.organizations SET status = p_status WHERE id = p_org_id;
  INSERT INTO public.billing_events (organization_id, kind, status, note, created_by)
  VALUES (p_org_id, 'status', p_status, private.clean_text(p_note, 500), auth.uid());
END;
$function$;

CREATE FUNCTION public.admin_clinic_billing(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_org public.organizations%ROWTYPE;
BEGIN
  PERFORM private.require_platform_admin();
  v_org := private.require_org(p_org_id);
  RETURN jsonb_build_object(
    'events', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', b.id, 'kind', b.kind, 'plan_id', b.plan_id, 'period_end', b.period_end, 'credits', b.credits,
               'amount_pkr', b.amount_pkr, 'method', b.method, 'paid_on', b.paid_on, 'status', b.status, 'note', b.note,
               'created_at', b.created_at, 'created_by', u.email) ORDER BY b.created_at DESC)
      FROM (SELECT * FROM public.billing_events WHERE organization_id = p_org_id ORDER BY created_at DESC LIMIT 100) b
      LEFT JOIN auth.users u ON u.id = b.created_by), '[]'::jsonb),
    'messages_by_status', COALESCE((
      SELECT jsonb_object_agg(status, n) FROM (
        SELECT status, count(*) AS n FROM public.message_log
        WHERE organization_id = p_org_id AND created_at > now() - interval '30 days' GROUP BY status) m), '{}'::jsonb)
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Owners: message language, usage and billing in settings
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.set_message_language(p_org_id uuid, p_language text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM private.require_owner(p_org_id);
  IF p_language NOT IN ('ur', 'en') THEN
    RAISE EXCEPTION 'Language must be ur or en' USING ERRCODE = '22023';
  END IF;
  UPDATE public.organizations SET message_language = p_language WHERE id = p_org_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_org_settings(p_org_id uuid)
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
                                       'timezone', v_org.timezone, 'status', v_org.status,
                                       'message_language', v_org.message_language),
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
                                'max_centers', e.max_centers, 'monthly_price_pkr', p.monthly_price_pkr,
                                'period_end', (SELECT s.current_period_end FROM public.org_subscriptions s
                                               WHERE s.organization_id = p_org_id AND s.status <> 'cancelled' LIMIT 1))
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
    ),
    'messages', jsonb_build_object(
      'sent_30d', (SELECT count(*) FROM public.message_log WHERE organization_id = p_org_id
                   AND created_at > now() - interval '30 days' AND status IN ('sent', 'delivered')),
      'failed_30d', (SELECT count(*) FROM public.message_log WHERE organization_id = p_org_id
                     AND created_at > now() - interval '30 days' AND status = 'failed'),
      'recent', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('channel', l.channel, 'template', l.template, 'status', l.status, 'cost', l.cost,
                                            'to_phone', left(l.to_phone, 4) || '•••' || right(l.to_phone, 3),
                                            'created_at', l.created_at) ORDER BY l.created_at DESC)
        FROM (SELECT * FROM public.message_log WHERE organization_id = p_org_id ORDER BY created_at DESC LIMIT 10) l
      ), '[]'::jsonb)
    ),
    'billing', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('kind', b.kind, 'plan_id', b.plan_id, 'credits', b.credits, 'amount_pkr', b.amount_pkr,
                                          'paid_on', b.paid_on, 'period_end', b.period_end, 'note', b.note,
                                          'created_at', b.created_at) ORDER BY b.created_at DESC)
      FROM (SELECT * FROM public.billing_events WHERE organization_id = p_org_id ORDER BY created_at DESC LIMIT 10) b
    ), '[]'::jsonb)
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION private.require_module(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.require_platform_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.require_org(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.get_clinic_insights(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_clinics() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_plan(uuid, text, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_add_credits(uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_add_payment(uuid, integer, text, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_org_status(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_clinic_billing(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_message_language(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clinic_insights(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_clinics() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_plan(uuid, text, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_add_credits(uuid, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_add_payment(uuid, integer, text, text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_org_status(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_clinic_billing(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_message_language(uuid, text) TO authenticated, service_role;

notify pgrst, 'reload schema';
