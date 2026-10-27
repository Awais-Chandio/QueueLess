-- Phase 2A.5: records ("Hisaab"), doctor income from real payments, token
-- status with the fee.
--
-- 1. get_payment_report(center, from, to, doctor?): totals (patients, paid,
--    net total, cash, online, card, other, free, refunded, claims to check),
--    by method, cash closing per person who received it, and the rows (time,
--    token, patient, phone, doctor, amount, method, TID, status, reason,
--    received by). Days are the clinic's local days; money counts on the day
--    it was received (refunds on the day of the refund).
--    Owner: any range up to 366 days; a range other than today needs the
--    analytics module. Receptionist: today only.
-- 2. get_doctor_income_summary: the clinic's local today (was UTC) and the
--    fees actually received for the doctor's tokens (paid - refunded), not
--    completed visits x doctors.fee.
-- 3. get_token_status: + fee_mode, payment_status, fee_pkr,
--    payment_seconds_left, payment_claim ('checking' while the desk checks
--    an online payment), payment_rejected_reason, payment_accounts (while
--    unpaid). status is 'unpaid' while the token waits for its fee and
--    'expired' when it expired unpaid. Still no patient data.

-- ---------------------------------------------------------------------------
-- 1. Report
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.get_payment_report(p_center_id uuid, p_from date, p_to date, p_doctor_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_org uuid := private.center_organization(p_center_id);
  v_tz text;
  v_today date;
  v_from date := COALESCE(p_from, p_to);
  v_to date := COALESCE(p_to, p_from);
  v_is_owner boolean;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Center not found' USING ERRCODE = 'PT404';
  END IF;
  IF NOT private.is_server_context() AND NOT private.can_manage_center(p_center_id) THEN
    RAISE EXCEPTION 'Only the clinic''s reception or owner can see its records' USING ERRCODE = '42501';
  END IF;
  IF p_doctor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.doctors d WHERE d.id = p_doctor_id AND d.center_id = p_center_id) THEN
    RAISE EXCEPTION 'Doctor not found' USING ERRCODE = 'PT404';
  END IF;

  SELECT COALESCE(o.timezone, 'Asia/Karachi') INTO v_tz FROM public.organizations o WHERE o.id = v_org;
  v_today := (now() AT TIME ZONE v_tz)::date;
  v_from := COALESCE(v_from, v_today);
  v_to := COALESCE(v_to, v_today);
  IF v_from > v_to OR v_to - v_from > 366 THEN
    RAISE EXCEPTION 'Choose a range of up to one year' USING ERRCODE = '22023';
  END IF;

  v_is_owner := private.is_server_context() OR public.is_admin() OR private.has_org_role(v_org, ARRAY['owner']);
  IF (v_from, v_to) IS DISTINCT FROM (v_today, v_today) THEN
    IF NOT v_is_owner THEN
      RAISE EXCEPTION 'Reception sees today''s records. Ask the owner for other days.' USING ERRCODE = '42501';
    END IF;
    PERFORM private.require_module(v_org, 'analytics');
  END IF;

  RETURN (
    WITH pay AS (
      SELECT vp.*,
             COALESCE(vp.received_at, vp.created_at) AS at,
             (COALESCE(vp.received_at, vp.created_at) AT TIME ZONE v_tz)::date AS day,
             CASE vp.status WHEN 'paid' THEN vp.amount_pkr WHEN 'refunded' THEN -vp.amount_pkr ELSE 0 END AS net
      FROM public.visit_payments vp
      WHERE vp.center_id = p_center_id
        AND (p_doctor_id IS NULL OR vp.doctor_id = p_doctor_id)
        AND COALESCE(vp.received_at, vp.created_at) >= (v_from::timestamp AT TIME ZONE v_tz)
        AND COALESCE(vp.received_at, vp.created_at) < ((v_to + 1)::timestamp AT TIME ZONE v_tz)
    ), tokens AS (
      SELECT a.id
      FROM public.appointments a
      WHERE a.center_id = p_center_id
        AND a.appointment_date BETWEEN v_from AND v_to
        AND (p_doctor_id IS NULL OR a.doctor_id = p_doctor_id)
        AND a.status <> 'cancelled'
        -- Never paid and expired: the patient never joined the line.
        AND NOT (a.status = 'expired' AND a.payment_status = 'awaiting')
    )
    SELECT jsonb_build_object(
      'from', v_from,
      'to', v_to,
      'today', v_today,
      'timezone', v_tz,
      'can_range', private.has_module(v_org, 'analytics'),
      'is_owner', v_is_owner,
      'totals', jsonb_build_object(
        'patients', (SELECT count(*) FROM tokens),
        'paid', (SELECT count(*) FROM pay WHERE status = 'paid'),
        'total_pkr', (SELECT COALESCE(sum(net), 0) FROM pay),
        'cash_pkr', (SELECT COALESCE(sum(net), 0) FROM pay WHERE method = 'cash'),
        'online_pkr', (SELECT COALESCE(sum(net), 0) FROM pay WHERE method IN ('easypaisa', 'jazzcash', 'bank')),
        'card_pkr', (SELECT COALESCE(sum(net), 0) FROM pay WHERE method = 'card'),
        'other_pkr', (SELECT COALESCE(sum(net), 0) FROM pay WHERE method = 'other'),
        'free', (SELECT count(*) FROM pay WHERE status = 'waived'),
        'refunded', (SELECT count(*) FROM pay WHERE status = 'refunded'),
        'refunded_pkr', (SELECT COALESCE(sum(amount_pkr), 0) FROM pay WHERE status = 'refunded'),
        'claims', (SELECT count(*) FROM pay WHERE status = 'claimed')
      ),
      'by_method', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('method', m.method, 'count', m.n, 'amount_pkr', m.amount) ORDER BY m.amount DESC, m.method)
        FROM (SELECT method, count(*) FILTER (WHERE status = 'paid') AS n, sum(net) AS amount
              FROM pay WHERE status IN ('paid', 'refunded') GROUP BY method) m
      ), '[]'::jsonb),
      'cash_closing', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('user_id', c.received_by, 'name', c.name, 'count', c.n, 'cash_pkr', c.cash)
                         ORDER BY c.cash DESC, c.name)
        FROM (SELECT p.received_by, COALESCE(NULLIF(pr.full_name, ''), u.email, '-') AS name,
                     count(*) FILTER (WHERE p.status = 'paid') AS n, sum(p.net) AS cash
              FROM pay p
              LEFT JOIN public.profiles pr ON pr.id = p.received_by
              LEFT JOIN auth.users u ON u.id = p.received_by
              WHERE p.method = 'cash' AND p.status IN ('paid', 'refunded')
              GROUP BY p.received_by, pr.full_name, u.email) c
      ), '[]'::jsonb),
      'rows', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', p.id,
                 'at', p.at,
                 'day', p.day,
                 'token_number', a.token_number,
                 'patient_name', COALESCE(CASE WHEN pt.user_id IS NOT NULL THEN NULLIF(pr.full_name, '') END, pt.name, pr.full_name),
                 'phone', pt.phone,
                 'doctor_name', d.name,
                 'amount_pkr', p.amount_pkr,
                 'method', p.method,
                 'reference', p.reference,
                 'status', p.status,
                 'reason', p.reason,
                 'refund_of', p.refund_of,
                 'received_by', COALESCE(NULLIF(rp.full_name, ''), ru.email)
               ) ORDER BY p.at DESC, p.created_at DESC)
        FROM (SELECT * FROM pay ORDER BY at DESC LIMIT 5000) p
        JOIN public.appointments a ON a.id = p.appointment_id
        JOIN public.patients pt ON pt.id = p.patient_id
        LEFT JOIN public.profiles pr ON pr.id = a.user_id
        LEFT JOIN public.doctors d ON d.id = p.doctor_id
        LEFT JOIN public.profiles rp ON rp.id = p.received_by
        LEFT JOIN auth.users ru ON ru.id = p.received_by
      ), '[]'::jsonb)
    )
  );
END;
$function$;

COMMENT ON FUNCTION public.get_payment_report(uuid, date, date, uuid) IS
  'Records: totals, by method, cash closing per person and payment rows for a center over clinic-local days. Owner any range (other than today needs analytics); receptionist today only.';

-- ---------------------------------------------------------------------------
-- 2. Doctor income
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_doctor_income_summary(p_doctor_id uuid)
 RETURNS TABLE(today_appointments_count bigint, completed_count bigint, total_fee numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_org uuid;
  v_tz text;
  v_today date;
BEGIN
  IF NOT private.is_server_context() AND NOT public.is_admin() AND NOT private.is_doctor_self(p_doctor_id) THEN
    RAISE EXCEPTION 'Only this doctor can view their income'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.organization_id INTO v_org
  FROM public.doctors d JOIN public.service_centers c ON c.id = d.center_id
  WHERE d.id = p_doctor_id;
  SELECT COALESCE(o.timezone, 'Asia/Karachi') INTO v_tz FROM public.organizations o WHERE o.id = v_org;
  v_tz := COALESCE(v_tz, 'Asia/Karachi');
  v_today := (now() AT TIME ZONE v_tz)::date;

  RETURN QUERY
  SELECT
    (SELECT count(*) FROM public.appointments a
     WHERE a.doctor_id = p_doctor_id AND a.appointment_date = v_today
       AND a.status <> 'cancelled' AND NOT (a.status = 'expired' AND a.payment_status = 'awaiting'))::bigint,
    (SELECT count(*) FROM public.appointments a
     WHERE a.doctor_id = p_doctor_id AND a.appointment_date = v_today AND a.status = 'completed')::bigint,
    (SELECT COALESCE(sum(CASE vp.status WHEN 'paid' THEN vp.amount_pkr ELSE -vp.amount_pkr END), 0)
     FROM public.visit_payments vp
     WHERE vp.doctor_id = p_doctor_id
       AND vp.status IN ('paid', 'refunded')
       AND vp.received_at >= (v_today::timestamp AT TIME ZONE v_tz)
       AND vp.received_at < ((v_today + 1)::timestamp AT TIME ZONE v_tz))::numeric;
END;
$function$;

COMMENT ON FUNCTION public.get_doctor_income_summary(uuid) IS
  'The doctor''s today (clinic''s local day): tokens, completed visits, and fees received for their tokens (paid - refunded).';

-- ---------------------------------------------------------------------------
-- 3. Public token status
-- ---------------------------------------------------------------------------
DROP FUNCTION public.get_token_status(text);
CREATE FUNCTION public.get_token_status(p_public_code text)
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
  'Public token status by code: token_number, people_ahead, eta_minutes, current_token, doctor_name, status (unpaid|waiting|called|in_progress|completed|cancelled|missed|expired), doctor_on_break, doctor_late_until, fee_mode, payment_status, fee_pkr, payment_seconds_left, payment_claim (checking), payment_rejected_reason, payment_accounts (while unpaid). No patient data.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_payment_report(uuid, date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_payment_report(uuid, date, date, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_token_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_token_status(text) TO anon, authenticated, service_role;

notify pgrst, 'reload schema';
