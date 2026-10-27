-- Phase 2B.5: choosing the doctor on the QR page; "Reception doctor
-- chunegi".
--
-- 1. get_public_center: per doctor initials, fee (when the clinic takes fees),
--    available (false when on break, on leave or not in today by their
--    schedule: a doctor with schedules but none for today), waiting; the
--    center's reception_assigns, branding (Basic) and unassigned_waiting.
--    The page groups doctors by specialty, greys out the unavailable ones and
--    skips the choice when only one is available. Per-doctor QR posters link
--    /c/<slug>?d=<doctor>: no database change.
-- 2. service_centers.reception_assigns (owner: set_center_join_settings).
--    On: the QR page also offers "Pata nahi"; issue_public_token with no
--    doctor gives an unassigned token (doctor_id NULL, checked in, numbered
--    per center, no fee). get_reception_queue lists them ('unassigned') and
--    assign_token_doctor(token, doctor) gives one to a doctor: a number in the
--    doctor's sequence, the doctor's fee, and in fee-before mode the token
--    waits for the fee at the desk (payment_status awaiting, still checked in
--    so it keeps its place and is never auto-expired). Unassigned tokens
--    cannot pay online (submit_payment_claim refuses them; they never wait
--    for a fee).
-- 3. get_token_status: status 'unassigned' while reception has to choose.
-- 4. get_reception_queue: owner / reception / admin only (a doctor-only login
--    no longer reads the whole clinic's queue and phones); + unassigned,
--    reception_assigns, the plan's modules; per doctor on_leave.
-- 5. get_org_settings: + per doctor is_me, linked account and pending invite;
--    + per center reception_assigns; + plan status.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.service_centers ADD COLUMN reception_assigns boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.service_centers.reception_assigns IS
  '"Reception doctor chunegi": QR patients may pick "Pata nahi"; reception assigns the doctor (assign_token_doctor).';

ALTER TABLE public.appointments ADD COLUMN assigned_at timestamptz;
COMMENT ON COLUMN public.appointments.assigned_at IS 'When reception gave an unassigned QR token its doctor.';

CREATE INDEX idx_appointments_unassigned ON public.appointments (center_id, appointment_date)
  WHERE doctor_id IS NULL;

CREATE FUNCTION public.set_center_join_settings(p_center_id uuid, p_reception_assigns boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM private.require_owner(private.center_organization(p_center_id));
  UPDATE public.service_centers SET reception_assigns = COALESCE(p_reception_assigns, false) WHERE id = p_center_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- "Ayesha Khan" -> "AK"; "Dr. Bilal" -> "B".
CREATE FUNCTION private.name_initials(p_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT upper(string_agg(left(w, 1), '' ORDER BY n))
  FROM (
    SELECT w, n FROM unnest(regexp_split_to_array(
      btrim(regexp_replace(COALESCE(p_name, ''), '^\s*(dr|prof|mr|mrs|ms)\.?\s+', '', 'i')), '\s+')) WITH ORDINALITY AS t(w, n)
    WHERE w <> ''
    ORDER BY n
    LIMIT 2
  ) s;
$function$;

-- Not in today: on leave, or has a schedule but none for today.
CREATE FUNCTION private.doctor_in_today(p_doctor_id uuid, p_today date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT NOT EXISTS (SELECT 1 FROM public.doctor_leaves l WHERE l.doctor_id = p_doctor_id AND l.leave_date = p_today)
     AND (NOT EXISTS (SELECT 1 FROM public.doctor_schedules s WHERE s.doctor_id = p_doctor_id)
          OR EXISTS (SELECT 1 FROM public.doctor_schedules s
                     WHERE s.doctor_id = p_doctor_id AND s.is_available
                       AND s.day_of_week = EXTRACT(DOW FROM p_today)::integer));
$function$;

-- ---------------------------------------------------------------------------
-- Issuing: unassigned tokens
-- ---------------------------------------------------------------------------
DROP FUNCTION private.issue_token_core(uuid, text, text, text, boolean, boolean);

-- As in 2A.3, plus p_center_id: with no doctor, a public QR join at a center
-- with reception_assigns on gets an unassigned token (no doctor checks, no
-- fee).
CREATE FUNCTION private.issue_token_core(
  p_doctor_id uuid, p_name text, p_phone text, p_source text, p_public boolean, p_await_payment boolean DEFAULT NULL,
  p_center_id uuid DEFAULT NULL
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

  -- Doctor (or, unassigned, the center), center, organization
  IF p_doctor_id IS NOT NULL THEN
    SELECT * INTO v_doctor FROM public.doctors WHERE id = p_doctor_id;
    IF NOT FOUND OR NOT v_doctor.is_active THEN
      RAISE EXCEPTION 'Doctor not found' USING ERRCODE = 'PT404';
    END IF;
    SELECT * INTO v_center FROM public.service_centers WHERE id = v_doctor.center_id;
  ELSE
    SELECT * INTO v_center FROM public.service_centers WHERE id = p_center_id;
    IF NOT FOUND OR NOT p_public OR v_source <> 'qr' OR NOT v_center.reception_assigns THEN
      RAISE EXCEPTION 'Please choose a doctor' USING ERRCODE = 'PT404';
    END IF;
  END IF;
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
    IF v_doctor.id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.doctor_leaves WHERE doctor_id = v_doctor.id AND leave_date = v_today) THEN
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

  IF v_doctor.id IS NOT NULL AND v_ent.max_doctors IS NOT NULL AND v_doctor.id NOT IN (
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

  -- Fee: the doctor's fee, unless fees are off. Only a fee above 0 can be
  -- awaited. Unassigned: the fee comes with the doctor (assign_token_doctor).
  v_fees := private.center_fee_settings(v_center.id);
  v_fee := CASE WHEN v_doctor.id IS NOT NULL AND v_fees.fee_mode <> 'off' THEN round(COALESCE(v_doctor.fee, 0))::integer END;
  v_await := v_fees.fee_mode = 'before' AND COALESCE(v_fee, 0) > 0
    AND COALESCE(p_await_payment, NOT v_is_staff AND v_source IN ('qr', 'online'));

  -- Service: the doctor's first service at this center, else the center's first.
  IF v_doctor.id IS NOT NULL THEN
    SELECT s.id INTO v_service_id
    FROM public.doctor_services ds
    JOIN public.services s ON s.id = ds.service_id AND s.center_id = v_center.id
    WHERE ds.doctor_id = v_doctor.id
    ORDER BY s.created_at, s.id
    LIMIT 1;
  END IF;
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

  -- Token: number from the per-doctor trigger (per center when unassigned).
  -- In the clinic (walk-in, QR) means checked in, unless the fee comes
  -- first; remote joins wait as confirmed.
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

-- Public QR / online join (web server, service role), as in 2A.3. No doctor
-- = "Pata nahi" at a center whose reception chooses.
CREATE OR REPLACE FUNCTION public.issue_public_token(
  p_doctor_id uuid, p_name text, p_phone text, p_source text DEFAULT 'qr', p_center_slug text DEFAULT NULL
)
 RETURNS TABLE (appointment_id uuid, public_code text, token_number integer, people_ahead integer, eta_minutes integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_center_id uuid;
BEGIN
  IF NOT private.is_server_context() THEN
    RAISE EXCEPTION 'Public joins go through the clinic''s join page' USING ERRCODE = '42501';
  END IF;

  IF p_doctor_id IS NULL THEN
    SELECT c.id INTO v_center_id FROM public.service_centers c WHERE c.slug = lower(btrim(COALESCE(p_center_slug, '')));
    IF v_center_id IS NULL THEN
      RAISE EXCEPTION 'Please choose a doctor' USING ERRCODE = 'PT404';
    END IF;
    RETURN QUERY SELECT * FROM private.issue_token_core(NULL, p_name, p_phone, p_source, true, NULL, v_center_id);
    RETURN;
  END IF;

  IF p_center_slug IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.doctors d JOIN public.service_centers c ON c.id = d.center_id
       WHERE d.id = p_doctor_id AND c.slug = lower(btrim(p_center_slug))) THEN
    RAISE EXCEPTION 'Doctor not found' USING ERRCODE = 'PT404';
  END IF;

  RETURN QUERY SELECT * FROM private.issue_token_core(p_doctor_id, p_name, p_phone, p_source, true, NULL);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Reception assigns the doctor
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.assign_token_doctor(p_appointment_id uuid, p_doctor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_appt public.appointments%ROWTYPE;
  v_doctor public.doctors%ROWTYPE;
  v_fees public.center_payment_settings%ROWTYPE;
  v_fee integer;
  v_number integer;
BEGIN
  SELECT * INTO v_appt FROM public.appointments WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token not found' USING ERRCODE = 'PT404';
  END IF;
  IF NOT private.is_server_context() AND NOT private.can_manage_center(v_appt.center_id) THEN
    RAISE EXCEPTION 'Only the clinic''s reception or owner can assign a doctor' USING ERRCODE = '42501';
  END IF;
  PERFORM private.require_module(private.center_organization(v_appt.center_id), 'queue');
  IF v_appt.doctor_id IS NOT NULL THEN
    RAISE EXCEPTION 'Token #% already has a doctor', v_appt.token_number USING ERRCODE = 'PT409';
  END IF;
  IF v_appt.status NOT IN ('pending', 'confirmed', 'checked_in')
     OR v_appt.appointment_date <> private.org_today(private.center_organization(v_appt.center_id)) THEN
    RAISE EXCEPTION 'This token is no longer waiting' USING ERRCODE = 'PT409';
  END IF;

  SELECT * INTO v_doctor FROM public.doctors WHERE id = p_doctor_id;
  IF NOT FOUND OR v_doctor.center_id <> v_appt.center_id OR NOT v_doctor.is_active THEN
    RAISE EXCEPTION 'Doctor not found' USING ERRCODE = 'PT404';
  END IF;
  IF NOT private.doctor_takes_tokens(v_doctor.id) THEN
    RAISE EXCEPTION 'This clinic''s plan doesn''t take tokens for this doctor' USING ERRCODE = 'PT402';
  END IF;
  IF EXISTS (SELECT 1 FROM public.doctor_leaves l WHERE l.doctor_id = v_doctor.id AND l.leave_date = v_appt.appointment_date) THEN
    RAISE EXCEPTION 'This doctor is on leave today' USING ERRCODE = 'PT409';
  END IF;

  -- The doctor's next number (same lock as the token number trigger).
  PERFORM pg_advisory_xact_lock(hashtext(v_doctor.id::text || ':' || v_appt.appointment_date::text));
  SELECT COALESCE(max(a.token_number), 0) + 1 INTO v_number
  FROM public.appointments a WHERE a.doctor_id = v_doctor.id AND a.appointment_date = v_appt.appointment_date;

  v_fees := private.center_fee_settings(v_appt.center_id);
  v_fee := CASE WHEN v_fees.fee_mode <> 'off' THEN round(COALESCE(v_doctor.fee, 0))::integer END;

  -- Fee before: the desk takes the fee next; the token keeps its check-in
  -- time (its place) and is never auto-expired.
  UPDATE public.appointments
  SET doctor_id = v_doctor.id,
      token_number = v_number,
      fee_pkr = v_fee,
      payment_status = CASE WHEN v_fees.fee_mode = 'before' AND COALESCE(v_fee, 0) > 0 THEN 'awaiting' END,
      assigned_at = now()
  WHERE id = v_appt.id
  RETURNING * INTO v_appt;

  RETURN jsonb_build_object('appointment_id', v_appt.id, 'token_number', v_appt.token_number, 'doctor_id', v_doctor.id,
                            'doctor_name', v_doctor.name, 'payment_status', v_appt.payment_status, 'fee_pkr', v_appt.fee_pkr);
END;
$function$;

COMMENT ON FUNCTION public.assign_token_doctor(uuid, uuid) IS
  'Desk: give an unassigned QR token its doctor: the doctor''s next number and fee; fee before -> awaiting (the desk takes the fee).';

-- Unassigned tokens cannot pay online.
CREATE OR REPLACE FUNCTION public.submit_payment_claim(p_public_code text, p_method text, p_reference text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  c_max_claims constant integer := 5;
  v_code text := upper(btrim(COALESCE(p_public_code, '')));
  v_method text := lower(btrim(COALESCE(p_method, '')));
  v_reference text := private.clean_reference(p_reference);
  v_appt public.appointments%ROWTYPE;
  v_fees public.center_payment_settings%ROWTYPE;
  v_org uuid;
  v_payment public.visit_payments%ROWTYPE;
BEGIN
  IF NOT private.is_server_context() THEN
    RAISE EXCEPTION 'Online payments go through the token page' USING ERRCODE = '42501';
  END IF;
  IF v_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$' THEN
    RAISE EXCEPTION 'Token not found' USING ERRCODE = 'PT404';
  END IF;
  IF v_method NOT IN ('easypaisa', 'jazzcash', 'bank') THEN
    RAISE EXCEPTION 'Choose Easypaisa, JazzCash or bank' USING ERRCODE = '22023';
  END IF;
  IF v_reference IS NULL THEN
    RAISE EXCEPTION 'Transaction ID must be 4 to 30 letters or digits' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_appt FROM public.appointments a WHERE a.public_code = v_code FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token not found' USING ERRCODE = 'PT404';
  END IF;
  v_org := private.center_organization(v_appt.center_id);
  IF v_appt.doctor_id IS NULL THEN
    RAISE EXCEPTION 'Reception will choose your doctor first. Please pay at the reception.' USING ERRCODE = 'PT409';
  END IF;
  IF v_appt.payment_status IS DISTINCT FROM 'awaiting' OR v_appt.status NOT IN ('pending', 'confirmed', 'checked_in') THEN
    RAISE EXCEPTION 'This token is not waiting for a fee' USING ERRCODE = 'PT409';
  END IF;
  PERFORM private.require_module(v_org, 'queue');

  v_fees := private.center_fee_settings(v_appt.center_id);
  IF (v_method = 'easypaisa' AND v_fees.easypaisa_number IS NULL)
     OR (v_method = 'jazzcash' AND v_fees.jazzcash_number IS NULL)
     OR (v_method = 'bank' AND v_fees.bank_iban IS NULL AND v_fees.raast_id IS NULL) THEN
    RAISE EXCEPTION 'The clinic doesn''t take % payments', v_method USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.visit_payments vp WHERE vp.appointment_id = v_appt.id AND vp.status = 'claimed') THEN
    RAISE EXCEPTION 'Your payment is already with the reception for checking' USING ERRCODE = 'PT409';
  END IF;
  IF (SELECT count(*) FROM public.visit_payments vp WHERE vp.appointment_id = v_appt.id) >= c_max_claims THEN
    RAISE EXCEPTION 'Too many attempts. Please pay at the reception.' USING ERRCODE = 'PT429';
  END IF;
  PERFORM private.require_unused_reference(v_org, v_method, v_reference, v_appt.id);

  INSERT INTO public.visit_payments (
    organization_id, center_id, appointment_id, patient_id, doctor_id, amount_pkr, method, reference, status
  ) VALUES (
    v_org, v_appt.center_id, v_appt.id, v_appt.patient_id, v_appt.doctor_id,
    COALESCE(v_appt.fee_pkr, 0), v_method, v_reference, 'claimed'
  )
  RETURNING * INTO v_payment;

  -- What the patient may see: no ids.
  RETURN jsonb_build_object('status', 'claimed', 'method', v_payment.method, 'amount_pkr', v_payment.amount_pkr);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 1. Join page
-- ---------------------------------------------------------------------------
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
  v_fees public.center_payment_settings%ROWTYPE;
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
  v_fees := private.center_fee_settings(v_center.id);

  RETURN jsonb_build_object(
    'slug', v_center.slug,
    'name', v_center.name,
    'organization_name', v_org.name,
    'city', v_center.city,
    'address', v_center.address,
    'open_time', v_center.open_time,
    'close_time', v_center.close_time,
    'qr_enabled', v_org.status = 'active' AND private.has_module(v_org.id, 'qr_join'),
    'reception_assigns', v_center.reception_assigns,
    'branding', private.mediq_branding(v_org.id),
    'unassigned_waiting', (SELECT count(*) FROM public.appointments a
                           WHERE a.center_id = v_center.id AND a.doctor_id IS NULL AND a.appointment_date = v_today
                             AND a.status IN ('pending', 'confirmed', 'checked_in')),
    'doctors', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', d.id,
               'name', d.name,
               'initials', private.name_initials(d.name),
               'specialty', d.specialty,
               'room', d.room,
               'fee', CASE WHEN v_fees.fee_mode <> 'off' AND round(COALESCE(d.fee, 0)) > 0 THEN round(d.fee)::integer END,
               'is_on_break', d.is_on_break OR COALESCE(q.is_on_break, false),
               'late_until', CASE WHEN d.late_until > now() THEN d.late_until END,
               'on_leave', EXISTS (SELECT 1 FROM public.doctor_leaves l WHERE l.doctor_id = d.id AND l.leave_date = v_today),
               'in_today', private.doctor_in_today(d.id, v_today),
               'available', NOT (d.is_on_break OR COALESCE(q.is_on_break, false)) AND private.doctor_in_today(d.id, v_today),
               'waiting', (SELECT count(*) FROM public.appointments a
                           WHERE a.doctor_id = d.id AND a.appointment_date = v_today
                             AND a.status IN ('pending', 'confirmed', 'checked_in')
                             AND a.payment_status IS DISTINCT FROM 'awaiting')
             ) ORDER BY d.specialty, d.created_at, d.id)
      FROM public.doctors d
      LEFT JOIN public.doctor_queue_settings q ON q.doctor_id = d.id
      WHERE d.center_id = v_center.id AND d.is_active AND private.doctor_takes_tokens(d.id)
    ), '[]'::jsonb)
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Token status: 'unassigned'
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_token_status(p_public_code text)
 RETURNS TABLE (
   token_number integer,
   people_ahead integer,
   eta_minutes integer,
   current_token integer,
   doctor_name text,
   status text,
   doctor_on_break boolean,
   doctor_late_until timestamptz,
   fee_mode text,
   payment_status text,
   fee_pkr integer,
   payment_seconds_left integer,
   payment_claim text,
   payment_rejected_reason text,
   payment_accounts jsonb
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_code text := upper(btrim(COALESCE(p_public_code, '')));
  v_appt public.appointments%ROWTYPE;
  v_fees public.center_payment_settings%ROWTYPE;
  v_unpaid boolean;
  v_claim boolean;
  v_rejected text;
BEGIN
  IF v_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$' THEN
    RETURN;
  END IF;

  SELECT * INTO v_appt FROM public.appointments a WHERE a.public_code = v_code;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_fees := private.center_fee_settings(v_appt.center_id);
  v_unpaid := v_appt.payment_status = 'awaiting' AND v_appt.status IN ('pending', 'confirmed', 'checked_in');
  v_claim := EXISTS (SELECT 1 FROM public.visit_payments vp WHERE vp.appointment_id = v_appt.id AND vp.status = 'claimed');
  IF v_unpaid AND NOT v_claim THEN
    SELECT vp.reason INTO v_rejected
    FROM public.visit_payments vp
    WHERE vp.appointment_id = v_appt.id AND vp.status = 'rejected'
    ORDER BY vp.received_at DESC LIMIT 1;
  END IF;

  RETURN QUERY
  SELECT
    v_appt.token_number,
    tp.people_ahead,
    tp.eta_minutes,
    tp.current_token,
    d.name,
    CASE
      WHEN v_unpaid THEN 'unpaid'
      WHEN v_appt.payment_status = 'awaiting' AND v_appt.status = 'expired' THEN 'expired'
      WHEN v_appt.doctor_id IS NULL AND v_appt.status IN ('pending', 'confirmed', 'checked_in') THEN 'unassigned'
      WHEN v_appt.status IN ('pending', 'confirmed', 'checked_in') THEN 'waiting'
      WHEN v_appt.status IN ('no_show', 'expired') THEN 'missed'
      ELSE v_appt.status   -- called | in_progress | completed | cancelled
    END,
    COALESCE(d.is_on_break OR q.is_on_break, false),
    CASE WHEN d.late_until > now() THEN d.late_until END,
    v_fees.fee_mode,
    v_appt.payment_status,
    v_appt.fee_pkr,
    CASE WHEN v_unpaid THEN GREATEST(0, CEIL(EXTRACT(EPOCH FROM (private.payment_deadline(v_appt.id) - now()))))::integer END,
    CASE WHEN v_unpaid AND v_claim THEN 'checking' END,
    v_rejected,
    CASE WHEN v_unpaid THEN private.payment_accounts_json(v_fees) END
  FROM private.token_progress(v_appt.id) tp
  LEFT JOIN public.doctors d ON d.id = v_appt.doctor_id
  LEFT JOIN public.doctor_queue_settings q ON q.doctor_id = v_appt.doctor_id;
END;
$function$;

COMMENT ON FUNCTION public.get_token_status(text) IS
  'Public token status by code: token_number, people_ahead, eta_minutes, current_token, doctor_name, status (unpaid|unassigned|waiting|called|in_progress|completed|cancelled|missed|expired), doctor_on_break, doctor_late_until, fee_mode, payment_status, fee_pkr, payment_seconds_left, payment_claim (checking), payment_rejected_reason, payment_accounts (while unpaid). No patient data.';

-- ---------------------------------------------------------------------------
-- 4. Reception queue
-- ---------------------------------------------------------------------------
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

  -- The owner, the center's receptionists and platform admins. A doctor sees
  -- their own queue (get_doctor_queue), not the clinic's.
  IF NOT private.is_server_context() AND NOT private.can_manage_center(p_center_id) THEN
    RAISE EXCEPTION 'Not allowed to view this center''s queue' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_org FROM public.organizations WHERE id = v_center.organization_id;
  v_today := (now() AT TIME ZONE v_org.timezone)::date;
  v_fees := private.center_fee_settings(p_center_id);

  RETURN jsonb_build_object(
    'center', jsonb_build_object(
      'id', v_center.id, 'name', v_center.name, 'slug', v_center.slug,
      'organization_id', v_org.id, 'organization_name', v_org.name, 'timezone', v_org.timezone,
      'reception_assigns', v_center.reception_assigns
    ),
    'today', v_today,
    'server_time', now(),
    'display_key', (SELECT k.display_key FROM public.center_displays k WHERE k.center_id = v_center.id),
    'modules', (SELECT to_jsonb(e.modules) FROM public.org_entitlements e WHERE e.organization_id = v_org.id),
    'tokens_today', (SELECT count(*) FROM public.appointments a
                     JOIN public.service_centers c ON c.id = a.center_id
                     WHERE c.organization_id = v_org.id AND a.appointment_date = v_today AND a.status <> 'cancelled'),
    'tokens_per_day', (SELECT e.tokens_per_day FROM public.org_entitlements e WHERE e.organization_id = v_org.id),
    'fees', jsonb_build_object('fee_mode', v_fees.fee_mode, 'unpaid_expiry_minutes', v_fees.unpaid_expiry_minutes),
    'unassigned', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', a.id,
               'token_number', a.token_number,
               'status', a.status,
               'source', a.source,
               'public_code', a.public_code,
               'patient_name', COALESCE(CASE WHEN p.user_id IS NOT NULL THEN NULLIF(pr.full_name, '') END, p.name, pr.full_name),
               'phone', p.phone,
               'checked_in_at', a.checked_in_at,
               'created_at', a.created_at
             ) ORDER BY COALESCE(a.checked_in_at, a.created_at), a.token_number)
      FROM public.appointments a
      LEFT JOIN public.patients p ON p.id = a.patient_id
      LEFT JOIN public.profiles pr ON pr.id = a.user_id
      WHERE a.center_id = v_center.id AND a.doctor_id IS NULL AND a.appointment_date = v_today
        AND a.status IN ('pending', 'confirmed', 'checked_in')
    ), '[]'::jsonb),
    'doctors', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', d.id,
               'name', d.name,
               'specialty', d.specialty,
               'room', d.room,
               'is_on_break', d.is_on_break OR COALESCE(q.is_on_break, false),
               'late_until', CASE WHEN d.late_until > now() THEN d.late_until END,
               'on_leave', EXISTS (SELECT 1 FROM public.doctor_leaves l WHERE l.doctor_id = d.id AND l.leave_date = v_today),
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
                          'created_at', a.created_at,
                          'assigned_at', a.assigned_at
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

-- ---------------------------------------------------------------------------
-- 5. Settings page
-- ---------------------------------------------------------------------------
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
               'display_key', (SELECT k.display_key FROM public.center_displays k WHERE k.center_id = c.id),
               'fees', private.fee_settings_json(private.center_fee_settings(c.id)),
               'reception_assigns', c.reception_assigns
             ) ORDER BY c.created_at, c.id)
      FROM public.service_centers c WHERE c.organization_id = p_org_id
    ), '[]'::jsonb),
    'doctors', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', d.id, 'center_id', d.center_id, 'name', d.name, 'specialty', d.specialty, 'room', d.room,
               'is_active', d.is_active, 'is_on_break', d.is_on_break, 'has_account', d.profile_id IS NOT NULL,
               'is_me', d.profile_id IS NOT DISTINCT FROM auth.uid() AND d.profile_id IS NOT NULL,
               'account_email', (SELECT u.email FROM auth.users u WHERE u.id = d.profile_id),
               'invite', (SELECT jsonb_build_object('id', i.id, 'email', i.email, 'phone', i.phone,
                                                    'created_at', i.created_at, 'expires_at', i.expires_at)
                          FROM public.doctor_invites i WHERE i.doctor_id = d.id AND i.accepted_at IS NULL),
               'average_minutes', COALESCE(q.average_consultation_time, 10),
               'takes_tokens', private.doctor_takes_tokens(d.id),
               'fee', round(COALESCE(d.fee, 0))::integer
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
    'plan_status', public.get_plan_status(p_org_id),
    'plans', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'monthly_price_pkr', p.monthly_price_pkr,
                                          'modules', to_jsonb(p.modules), 'tokens_per_day', p.tokens_per_day,
                                          'max_doctors', p.max_doctors, 'max_centers', p.max_centers,
                                          'per_doctor', p.per_doctor, 'min_doctors', p.min_doctors,
                                          'recommended', p.recommended)
                       ORDER BY p.sort_order)
      FROM public.plans p WHERE p.is_public
    ), '[]'::jsonb),
    'usage', jsonb_build_object(
      'tokens_today', (SELECT count(*) FROM public.appointments a JOIN public.service_centers c ON c.id = a.center_id
                       WHERE c.organization_id = p_org_id AND a.appointment_date = v_today AND a.status <> 'cancelled'),
      'active_doctors', private.org_active_doctors(p_org_id),
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
REVOKE ALL ON FUNCTION private.name_initials(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.doctor_in_today(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.issue_token_core(uuid, text, text, text, boolean, boolean, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.set_center_join_settings(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_token_doctor(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_center_join_settings(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_token_doctor(uuid, uuid) TO authenticated, service_role;

notify pgrst, 'reload schema';
