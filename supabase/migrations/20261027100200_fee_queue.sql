-- Phase 2A.3: the queue with fees.
--
-- 1. Fee before (center_payment_settings.fee_mode = 'before'):
--    a public QR / online join for a doctor with a fee is issued with
--    payment_status 'awaiting', status 'pending' and no check-in. It is not
--    in the line (call_next, positions, TV, join page, doctor queue,
--    notifications) until it is paid or waived; then it is checked in and
--    queues by that time.
-- 2. Waiting order everywhere is now (COALESCE(skipped_at, checked_in_at,
--    created_at), token_number): the line follows payment / check-in time,
--    not join time. Walk-ins and in-clinic QR tokens are checked in when
--    issued, so their order does not change.
-- 3. issue_walk_in(doctor, name, phone, fee_received, amount, method,
--    reference): the desk's walk-in in one transaction. Fee before: the token
--    and its payment together (fee received), or an awaiting token (not
--    received yet). Fee after / off: a plain walk-in. issue_token is
--    unchanged for its callers (the staff app), whose walk-ins go straight
--    into the line.
-- 4. Unpaid QR / online tokens expire after the clinic's
--    unpaid_expiry_minutes, counted from the join (or from the last rejected
--    online claim). Never while an online claim waits for the desk.
--    pg_cron 'expire-unpaid-tokens' every minute.
-- 5. get_reception_queue / get_doctor_queue: payment status, fee and the
--    open online claim per token; the reception queue also has the center's
--    fee mode.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- When an awaiting token expires: join time (or the last rejected online
-- claim, so a patient who mistyped the TID gets the full time again) plus
-- the clinic's unpaid_expiry_minutes.
CREATE FUNCTION private.payment_deadline(p_appointment_id uuid)
 RETURNS timestamptz
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT GREATEST(a.created_at,
                  COALESCE((SELECT max(vp.received_at) FROM public.visit_payments vp
                            WHERE vp.appointment_id = a.id AND vp.status = 'rejected'), a.created_at))
         + make_interval(mins => (private.center_fee_settings(a.center_id)).unpaid_expiry_minutes)
  FROM public.appointments a
  WHERE a.id = p_appointment_id;
$function$;

-- Queue position of one token. Waiting = pending/confirmed/checked_in and
-- not awaiting payment, in order (COALESCE(skipped_at, checked_in_at,
-- created_at), token_number). An awaiting token would join at the end: its
-- people_ahead is everyone waiting.
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
  v_delay integer := 0;
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
      AND a.payment_status IS DISTINCT FROM 'awaiting'
      AND a.id <> v_appt.id
      AND (v_appt.payment_status = 'awaiting'
           OR (COALESCE(a.skipped_at, a.checked_in_at, a.created_at, a.scheduled_at), a.token_number)
            < (COALESCE(v_appt.skipped_at, v_appt.checked_in_at, v_appt.created_at, v_appt.scheduled_at), v_appt.token_number));
    IF v_appt.doctor_id IS NOT NULL THEN
      v_delay := private.doctor_delay_minutes(v_appt.doctor_id);
    END IF;
  END IF;

  IF v_appt.doctor_id IS NOT NULL THEN
    SELECT average_consultation_time INTO v_avg
    FROM public.doctor_queue_settings WHERE doctor_id = v_appt.doctor_id;
  ELSE
    SELECT average_consultation_time INTO v_avg
    FROM public.center_queue_settings
    WHERE center_id = v_appt.center_id AND appointment_date = v_appt.appointment_date;
  END IF;

  RETURN QUERY SELECT v_ahead, CEIL(v_ahead * COALESCE(v_avg, 10.0))::integer + v_delay, COALESCE(v_current, 0);
END;
$function$;

-- Waiting tokens of one doctor's day, in call order (notifications).
CREATE OR REPLACE FUNCTION private.doctor_waiting_tokens(p_doctor_id uuid, p_date date)
 RETURNS TABLE (appointment_id uuid, people_ahead integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT a.id, (row_number() OVER (ORDER BY COALESCE(a.skipped_at, a.checked_in_at, a.created_at, a.scheduled_at), a.token_number) - 1)::integer
  FROM public.appointments a
  WHERE a.doctor_id = p_doctor_id
    AND a.appointment_date = p_date
    AND a.status IN ('pending', 'confirmed', 'checked_in')
    AND a.payment_status IS DISTINCT FROM 'awaiting';
$function$;

-- Paid or waived: an awaiting token joins the line now.
CREATE FUNCTION private.admit_paid_token(p_appointment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.appointments WHERE id = p_appointment_id;
  -- The status trigger allows pending -> confirmed -> checked_in.
  IF v_status = 'pending' THEN
    UPDATE public.appointments SET status = 'confirmed' WHERE id = p_appointment_id;
    v_status := 'confirmed';
  END IF;
  IF v_status = 'confirmed' THEN
    UPDATE public.appointments SET status = 'checked_in', checked_in_at = now() WHERE id = p_appointment_id;
  END IF;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 1. Issuing tokens
-- ---------------------------------------------------------------------------
DROP FUNCTION private.issue_token_core(uuid, text, text, text, boolean);

-- As in 1B.1, plus fees: fee_pkr from the doctor's fee unless the center's
-- fee mode is off. p_await_payment: NULL = automatic (fee before + public
-- QR/online join + a fee to pay); true / false = the desk's choice (only
-- honoured in fee-before mode, and only when there is a fee).
CREATE FUNCTION private.issue_token_core(
  p_doctor_id uuid, p_name text, p_phone text, p_source text, p_public boolean, p_await_payment boolean DEFAULT NULL
)
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
  v_fees public.center_payment_settings%ROWTYPE;
  v_fee integer;
  v_await boolean;
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

  -- Fee: the doctor's fee, unless fees are off. Only a fee above 0 can be awaited.
  v_fees := private.center_fee_settings(v_center.id);
  v_fee := CASE WHEN v_fees.fee_mode <> 'off' THEN round(COALESCE(v_doctor.fee, 0))::integer END;
  v_await := v_fees.fee_mode = 'before' AND COALESCE(v_fee, 0) > 0
    AND COALESCE(p_await_payment, NOT v_is_staff AND v_source IN ('qr', 'online'));

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
  -- means checked in, unless the fee comes first; remote joins wait as
  -- confirmed.
  INSERT INTO public.appointments (
    user_id, patient_id, center_id, service_id, doctor_id,
    appointment_date, appointment_time, scheduled_at, status, checked_in_at, source,
    payment_status, fee_pkr
  ) VALUES (
    CASE WHEN v_is_staff THEN NULL ELSE v_uid END, v_patient_id, v_center.id, v_service_id, v_doctor.id,
    v_today, NULL, now(),
    CASE WHEN v_await THEN 'pending' WHEN v_source IN ('walk_in', 'qr') THEN 'checked_in' ELSE 'confirmed' END,
    CASE WHEN NOT v_await AND v_source IN ('walk_in', 'qr') THEN now() END,
    v_source,
    CASE WHEN v_await THEN 'awaiting' END,
    v_fee
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

-- Signed-in callers (staff app walk-ins, app joins): unchanged rules; staff
-- tokens never wait for a fee here.
CREATE OR REPLACE FUNCTION public.issue_token(p_doctor_id uuid, p_name text, p_phone text, p_source text DEFAULT 'qr')
 RETURNS TABLE (appointment_id uuid, public_code text, token_number integer, people_ahead integer, eta_minutes integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT * FROM private.issue_token_core(p_doctor_id, p_name, p_phone, p_source, false, NULL);
$function$;

-- Public QR / online join (web server, service role). Fee before: awaiting.
CREATE OR REPLACE FUNCTION public.issue_public_token(
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

  RETURN QUERY SELECT * FROM private.issue_token_core(p_doctor_id, p_name, p_phone, p_source, true, NULL);
END;
$function$;

-- TIDs and bank references: upper case, no spaces; 4-30 of A-Z 0-9 / -.
CREATE FUNCTION private.clean_reference(p_reference text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE
  v text := NULLIF(upper(regexp_replace(COALESCE(p_reference, ''), '\s', '', 'g')), '');
BEGIN
  IF v IS NOT NULL AND v !~ '^[A-Z0-9/-]{4,30}$' THEN
    RAISE EXCEPTION 'Transaction ID must be 4 to 30 letters or digits' USING ERRCODE = '22023';
  END IF;
  RETURN v;
END;
$function$;

-- A TID already used for another payment at this clinic (claimed or paid,
-- not refunded) is refused: the same screenshot can't pay twice.
CREATE FUNCTION private.require_unused_reference(p_org_id uuid, p_method text, p_reference text, p_appointment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF p_reference IS NULL OR p_method = 'cash' THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.visit_payments vp
    WHERE vp.organization_id = p_org_id AND vp.method = p_method AND vp.reference = p_reference
      AND vp.status IN ('claimed', 'paid')
      AND NOT (vp.status = 'claimed' AND vp.appointment_id = p_appointment_id)
      AND NOT EXISTS (SELECT 1 FROM public.visit_payments r WHERE r.refund_of = vp.id)
  ) THEN
    RAISE EXCEPTION 'This transaction ID was already used for another token' USING ERRCODE = 'PT409';
  END IF;
END;
$function$;

-- The desk's walk-in in one step. Returns what issue_token returns plus the
-- payment state.
CREATE FUNCTION public.issue_walk_in(
  p_doctor_id uuid,
  p_name text,
  p_phone text,
  p_fee_received boolean DEFAULT true,
  p_amount integer DEFAULT NULL,
  p_method text DEFAULT 'cash',
  p_reference text DEFAULT NULL
)
 RETURNS TABLE (appointment_id uuid, public_code text, token_number integer, people_ahead integer, eta_minutes integer,
                payment_status text, fee_pkr integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_doctor public.doctors%ROWTYPE;
  v_fees public.center_payment_settings%ROWTYPE;
  v_method text := lower(btrim(COALESCE(p_method, 'cash')));
  v_reference text := private.clean_reference(p_reference);
  v_take_fee boolean;
  v_issued record;
  v_appt public.appointments%ROWTYPE;
  v_amount integer;
BEGIN
  SELECT * INTO v_doctor FROM public.doctors WHERE id = p_doctor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Doctor not found' USING ERRCODE = 'PT404';
  END IF;
  IF NOT private.is_server_context() AND NOT public.is_admin() AND NOT private.is_center_staff(v_doctor.center_id) THEN
    RAISE EXCEPTION 'Only clinic staff can issue walk-in tokens' USING ERRCODE = '42501';
  END IF;

  v_fees := private.center_fee_settings(v_doctor.center_id);
  v_take_fee := v_fees.fee_mode = 'before' AND round(COALESCE(v_doctor.fee, 0)) > 0;
  IF v_take_fee AND COALESCE(p_fee_received, true) THEN
    IF v_method NOT IN ('cash', 'easypaisa', 'jazzcash', 'bank', 'card', 'other') THEN
      RAISE EXCEPTION 'Unknown payment method "%"', p_method USING ERRCODE = '22023';
    END IF;
    IF p_amount IS NOT NULL AND (p_amount < 1 OR p_amount > 1000000) THEN
      RAISE EXCEPTION 'Amount must be 1 to 1,000,000 rupees. Use "Free" for a free visit.' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT * INTO v_issued
  FROM private.issue_token_core(p_doctor_id, p_name, p_phone, 'walk_in', false,
                                CASE WHEN v_take_fee THEN NOT COALESCE(p_fee_received, true) END) t;

  SELECT * INTO v_appt FROM public.appointments a WHERE a.public_code = v_issued.public_code FOR UPDATE;

  IF v_take_fee AND COALESCE(p_fee_received, true) THEN
    v_amount := COALESCE(p_amount, v_appt.fee_pkr);
    PERFORM private.require_unused_reference(private.center_organization(v_appt.center_id), v_method, v_reference, v_appt.id);
    INSERT INTO public.visit_payments (
      organization_id, center_id, appointment_id, patient_id, doctor_id,
      amount_pkr, method, reference, status, received_by, received_at
    ) VALUES (
      private.center_organization(v_appt.center_id), v_appt.center_id, v_appt.id, v_appt.patient_id, v_appt.doctor_id,
      v_amount, v_method, v_reference, 'paid', auth.uid(), now()
    );
    UPDATE public.appointments a SET payment_status = 'paid' WHERE a.id = v_appt.id RETURNING * INTO v_appt;
  END IF;

  RETURN QUERY SELECT v_issued.appointment_id, v_issued.public_code, v_issued.token_number,
                      v_issued.people_ahead, v_issued.eta_minutes, v_appt.payment_status, v_appt.fee_pkr;
END;
$function$;

COMMENT ON FUNCTION public.issue_walk_in(uuid, text, text, boolean, integer, text, text) IS
  'Desk walk-in. Fee before (doctor has a fee): token + payment in one transaction when the fee is received (amount defaults to the doctor''s fee, method cash), else an awaiting token. Fee after / off: a plain walk-in.';

-- App check-in can't let an unpaid token into the line.
CREATE OR REPLACE FUNCTION public.check_in_appointment(p_appointment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_appointment public.appointments%ROWTYPE;
BEGIN
  SELECT *
  INTO v_appointment
  FROM public.appointments
  WHERE id = p_appointment_id
  FOR UPDATE;

  IF NOT FOUND OR v_appointment.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  IF v_appointment.status NOT IN ('pending', 'confirmed', 'checked_in') THEN
    RAISE EXCEPTION 'This appointment cannot be checked in';
  END IF;

  IF v_appointment.payment_status = 'awaiting' THEN
    RAISE EXCEPTION 'Please pay the fee first' USING ERRCODE = 'PT409';
  END IF;

  IF v_appointment.status <> 'checked_in' THEN
    UPDATE public.appointments
    SET
      status = 'checked_in',
      checked_in_at = COALESCE(checked_in_at, now())
    WHERE id = p_appointment_id;
  END IF;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. The line skips awaiting tokens and follows check-in time
-- ---------------------------------------------------------------------------

-- call_next as in 1E: never calls an awaiting token; check-in order.
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
    AND a.payment_status IS DISTINCT FROM 'awaiting'
  ORDER BY COALESCE(a.skipped_at, a.checked_in_at, a.created_at, a.scheduled_at), a.token_number
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

-- TV board as in 1C: awaiting tokens are not "next" or "waiting".
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

  RETURN jsonb_build_object(
    'center_name', v_center.name,
    'center_slug', v_center.slug,
    'organization_name', v_org.name,
    'today', v_today,
    'server_time', now(),
    'doctors', COALESCE((
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
    ), '[]'::jsonb)
  );
END;
$function$;

-- Join page as in 1C: waiting counts leave out awaiting tokens.
CREATE OR REPLACE FUNCTION public.get_public_center(p_slug text)
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
               'late_until', CASE WHEN d.late_until > now() THEN d.late_until END,
               'on_leave', EXISTS (SELECT 1 FROM public.doctor_leaves l WHERE l.doctor_id = d.id AND l.leave_date = v_today),
               'waiting', (SELECT count(*) FROM public.appointments a
                           WHERE a.doctor_id = d.id AND a.appointment_date = v_today
                             AND a.status IN ('pending', 'confirmed', 'checked_in')
                             AND a.payment_status IS DISTINCT FROM 'awaiting')
             ) ORDER BY d.created_at, d.id)
      FROM public.doctors d
      WHERE d.center_id = v_center.id AND d.is_active AND private.doctor_takes_tokens(d.id)
    ), '[]'::jsonb)
  );
END;
$function$;

-- One token's payment fields for the desk and the doctor app.
CREATE FUNCTION private.token_payment_json(p_appt public.appointments, p_with_claim boolean)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'payment_status', p_appt.payment_status,
    'fee_pkr', p_appt.fee_pkr,
    'payment_deadline', CASE WHEN p_appt.payment_status = 'awaiting'
                                  AND p_appt.status IN ('pending', 'confirmed', 'checked_in')
                             THEN private.payment_deadline(p_appt.id) END,
    'paid', (SELECT jsonb_build_object('amount_pkr', vp.amount_pkr, 'method', vp.method)
             FROM public.visit_payments vp
             WHERE vp.appointment_id = p_appt.id AND vp.status = 'paid'
               AND NOT EXISTS (SELECT 1 FROM public.visit_payments r WHERE r.refund_of = vp.id)
             ORDER BY vp.received_at DESC LIMIT 1),
    'claim', CASE WHEN p_with_claim THEN (
               SELECT jsonb_build_object('id', vp.id, 'method', vp.method, 'reference', vp.reference,
                                         'amount_pkr', vp.amount_pkr, 'created_at', vp.created_at)
               FROM public.visit_payments vp
               WHERE vp.appointment_id = p_appt.id AND vp.status = 'claimed') END
  );
$function$;

-- Reception queue as in 1C, plus per token: payment status, fee, the open
-- online claim and the expiry time; awaiting tokens sort after the line;
-- 'fees': the center's fee mode and expiry minutes.
CREATE OR REPLACE FUNCTION public.get_reception_queue(p_center_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_center public.service_centers%ROWTYPE;
  v_org public.organizations%ROWTYPE;
  v_fees public.center_payment_settings%ROWTYPE;
  v_today date;
BEGIN
  SELECT * INTO v_center FROM public.service_centers WHERE id = p_center_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Center not found' USING ERRCODE = 'PT404';
  END IF;

  IF NOT private.is_server_context()
     AND NOT private.can_manage_center(p_center_id)
     AND NOT EXISTS (SELECT 1 FROM public.doctors d WHERE d.center_id = p_center_id AND private.is_doctor_self(d.id))
  THEN
    RAISE EXCEPTION 'Not allowed to view this center''s queue' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_org FROM public.organizations WHERE id = v_center.organization_id;
  v_today := (now() AT TIME ZONE v_org.timezone)::date;
  v_fees := private.center_fee_settings(p_center_id);

  RETURN jsonb_build_object(
    'center', jsonb_build_object(
      'id', v_center.id, 'name', v_center.name, 'slug', v_center.slug,
      'organization_id', v_org.id, 'organization_name', v_org.name, 'timezone', v_org.timezone
    ),
    'today', v_today,
    'server_time', now(),
    'display_key', (SELECT k.display_key FROM public.center_displays k WHERE k.center_id = v_center.id),
    'tokens_today', (SELECT count(*) FROM public.appointments a
                     JOIN public.service_centers c ON c.id = a.center_id
                     WHERE c.organization_id = v_org.id AND a.appointment_date = v_today AND a.status <> 'cancelled'),
    'tokens_per_day', (SELECT e.tokens_per_day FROM public.org_entitlements e WHERE e.organization_id = v_org.id),
    'fees', jsonb_build_object('fee_mode', v_fees.fee_mode, 'unpaid_expiry_minutes', v_fees.unpaid_expiry_minutes),
    'doctors', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', d.id,
               'name', d.name,
               'specialty', d.specialty,
               'room', d.room,
               'is_on_break', d.is_on_break OR COALESCE(q.is_on_break, false),
               'late_until', CASE WHEN d.late_until > now() THEN d.late_until END,
               'takes_tokens', private.doctor_takes_tokens(d.id),
               'average_minutes', COALESCE(q.average_consultation_time, 10),
               'fee', round(COALESCE(d.fee, 0))::integer,
               'tokens', COALESCE((
                 SELECT jsonb_agg(jsonb_build_object(
                          'id', a.id,
                          'token_number', a.token_number,
                          'status', a.status,
                          'source', a.source,
                          'public_code', a.public_code,
                          'patient_name', COALESCE(CASE WHEN p.user_id IS NOT NULL THEN NULLIF(pr.full_name, '') END, p.name, pr.full_name),
                          'phone', p.phone,
                          'appointment_time', a.appointment_time,
                          'checked_in_at', a.checked_in_at,
                          'called_at', a.called_at,
                          'completed_at', a.completed_at,
                          'skipped_at', a.skipped_at,
                          'created_at', a.created_at
                        ) || private.token_payment_json(a, true)
                        ORDER BY
                          CASE WHEN a.status IN ('called', 'in_progress') THEN 0
                               WHEN a.status IN ('pending', 'confirmed', 'checked_in')
                                    AND a.payment_status IS DISTINCT FROM 'awaiting' THEN 1
                               WHEN a.status IN ('pending', 'confirmed', 'checked_in') THEN 2
                               ELSE 3 END,
                          CASE WHEN a.status IN ('pending', 'confirmed', 'checked_in')
                               THEN COALESCE(a.skipped_at, a.checked_in_at, a.created_at, a.scheduled_at) END,
                          a.token_number)
                 FROM public.appointments a
                 LEFT JOIN public.patients p ON p.id = a.patient_id
                 LEFT JOIN public.profiles pr ON pr.id = a.user_id
                 WHERE a.doctor_id = d.id AND a.appointment_date = v_today
               ), '[]'::jsonb)
             ) ORDER BY d.created_at, d.id)
      FROM public.doctors d
      LEFT JOIN public.doctor_queue_settings q ON q.doctor_id = d.id
      WHERE d.center_id = v_center.id AND d.is_active
    ), '[]'::jsonb)
  );
END;
$function$;

-- Doctor app as in 1C, plus payment status and fee per token (no claim
-- details, no phones); awaiting tokens sort after the line.
CREATE OR REPLACE FUNCTION public.get_doctor_queue(p_doctor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_doctor public.doctors%ROWTYPE;
  v_center public.service_centers%ROWTYPE;
  v_org public.organizations%ROWTYPE;
  v_today date;
BEGIN
  SELECT * INTO v_doctor FROM public.doctors WHERE id = p_doctor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Doctor not found' USING ERRCODE = 'PT404';
  END IF;
  IF NOT private.is_server_context() AND NOT public.is_admin() AND NOT private.can_manage_doctor(p_doctor_id) THEN
    RAISE EXCEPTION 'Only this doctor or their clinic''s staff can view this queue' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_center FROM public.service_centers WHERE id = v_doctor.center_id;
  SELECT * INTO v_org FROM public.organizations WHERE id = v_center.organization_id;
  v_today := (now() AT TIME ZONE v_org.timezone)::date;

  RETURN jsonb_build_object(
    'doctor', (
      SELECT jsonb_build_object(
        'id', v_doctor.id,
        'name', v_doctor.name,
        'specialty', v_doctor.specialty,
        'room', v_doctor.room,
        'is_on_break', v_doctor.is_on_break OR COALESCE(q.is_on_break, false),
        'break_start', q.break_start,
        'late_until', CASE WHEN v_doctor.late_until > now() THEN v_doctor.late_until END,
        'average_minutes', COALESCE(q.average_consultation_time, 10),
        'takes_tokens', private.doctor_takes_tokens(v_doctor.id))
      FROM (SELECT 1) one
      LEFT JOIN public.doctor_queue_settings q ON q.doctor_id = v_doctor.id),
    'center', jsonb_build_object('id', v_center.id, 'name', v_center.name, 'slug', v_center.slug),
    'organization', jsonb_build_object('id', v_org.id, 'name', v_org.name, 'timezone', v_org.timezone),
    'plan', (SELECT jsonb_build_object('id', e.plan_id, 'modules', to_jsonb(e.modules), 'tokens_per_day', e.tokens_per_day)
             FROM public.org_entitlements e WHERE e.organization_id = v_org.id),
    'fee_mode', (private.center_fee_settings(v_center.id)).fee_mode,
    'today', v_today,
    'server_time', now(),
    'tokens', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', a.id,
               'token_number', a.token_number,
               'status', a.status,
               'source', a.source,
               'patient_name', COALESCE(CASE WHEN p.user_id IS NOT NULL THEN NULLIF(pr.full_name, '') END, p.name, pr.full_name),
               'is_guest', p.user_id IS NULL,
               'appointment_time', a.appointment_time,
               'checked_in_at', a.checked_in_at,
               'called_at', a.called_at,
               'started_at', a.started_at,
               'completed_at', a.completed_at,
               'skipped_at', a.skipped_at,
               'created_at', a.created_at,
               'has_summary', EXISTS (SELECT 1 FROM public.visit_summaries vs WHERE vs.appointment_id = a.id),
               'payment_status', a.payment_status,
               'fee_pkr', a.fee_pkr
             ) ORDER BY
               CASE WHEN a.status IN ('called', 'in_progress') THEN 0
                    WHEN a.status IN ('pending', 'confirmed', 'checked_in')
                         AND a.payment_status IS DISTINCT FROM 'awaiting' THEN 1
                    WHEN a.status IN ('pending', 'confirmed', 'checked_in') THEN 2
                    ELSE 3 END,
               CASE WHEN a.status IN ('pending', 'confirmed', 'checked_in')
                    THEN COALESCE(a.skipped_at, a.checked_in_at, a.created_at, a.scheduled_at) END,
               CASE WHEN a.status NOT IN ('called', 'in_progress', 'pending', 'confirmed', 'checked_in')
                    THEN COALESCE(a.completed_at, a.called_at, a.created_at) END DESC,
               a.token_number)
      FROM public.appointments a
      LEFT JOIN public.patients p ON p.id = a.patient_id
      LEFT JOIN public.profiles pr ON pr.id = a.user_id
      WHERE a.doctor_id = v_doctor.id AND a.appointment_date = v_today
    ), '[]'::jsonb)
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Expiry of unpaid QR / online tokens (pg_cron, every minute)
-- ---------------------------------------------------------------------------
CREATE FUNCTION private.expire_unpaid_tokens()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.appointments a
  SET status = 'expired',
      notes = CASE
        WHEN a.notes IS NULL OR a.notes = '' THEN 'Auto-expired: fee not paid in time'
        ELSE a.notes || E'\n(Auto-expired: fee not paid in time)'
      END
  WHERE a.payment_status = 'awaiting'
    AND a.status IN ('pending', 'confirmed')
    AND a.source IN ('qr', 'online')
    AND private.payment_deadline(a.id) <= now()
    AND NOT EXISTS (SELECT 1 FROM public.visit_payments vp WHERE vp.appointment_id = a.id AND vp.status = 'claimed');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

COMMENT ON FUNCTION private.expire_unpaid_tokens() IS
  'pg_cron every minute: QR / online tokens still awaiting their fee after the clinic''s unpaid_expiry_minutes expire. Tokens with an online claim waiting for the desk are left alone.';

SELECT cron.schedule('expire-unpaid-tokens', '* * * * *', 'SELECT private.expire_unpaid_tokens()');

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION private.payment_deadline(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.admit_paid_token(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.issue_token_core(uuid, text, text, text, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.clean_reference(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.require_unused_reference(uuid, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.token_payment_json(public.appointments, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.expire_unpaid_tokens() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.issue_walk_in(uuid, text, text, boolean, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_walk_in(uuid, text, text, boolean, integer, text, text) TO authenticated, service_role;

notify pgrst, 'reload schema';
