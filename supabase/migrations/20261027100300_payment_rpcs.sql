-- Phase 2A.4: taking payments. "Manual online": the patient pays the
-- clinic's own Easypaisa / JazzCash / bank / Raast account and enters the
-- transaction ID (TID); the desk checks its own account and verifies with
-- one tap. No payment gateway.
--
--   submit_payment_claim(code, method, reference)   server only (the web
--       route /api/pay-claim, after Turnstile and its own rate limit). An
--       awaiting token, one open claim at a time, at most 5 claims per
--       token, TID 4-30 characters, an account the clinic has set up.
--   record_payment(appointment, amount, method, reference?)   desk: paid
--       (and into the line when it was awaiting)
--   verify_claim(payment, accept, reason?)   desk: accept = paid + into the
--       line; reject needs a reason (not_received | wrong_amount | other)
--   waive_fee(appointment, reason)   desk: free visit (follow_up |
--       staff_family | discount | other), into the line when awaiting
--   refund_payment(payment, reason)   owner only: a refunded row for a paid one
--
-- Desk = the organization's owner, or a receptionist assigned to the center
-- (can_manage_center), or a platform admin. Doctors don't take payments.
-- Every desk RPC needs the queue module. A TID already used for another
-- token at the clinic is refused.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The token, locked, after the caller and module checks of a desk action.
CREATE FUNCTION private.lock_payable_appointment(p_appointment_id uuid)
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
  IF (private.center_fee_settings(v_appt.center_id)).fee_mode = 'off' THEN
    RAISE EXCEPTION 'Fees are switched off for this clinic' USING ERRCODE = 'PT409';
  END IF;
  IF v_appt.status IN ('cancelled', 'expired') THEN
    RAISE EXCEPTION 'This token is %. Issue a new token instead.', v_appt.status USING ERRCODE = 'PT409';
  END IF;
  RETURN v_appt;
END;
$function$;

CREATE FUNCTION private.payment_row_json(p_payment public.visit_payments, p_appt public.appointments)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'payment_id', p_payment.id,
    'appointment_id', p_payment.appointment_id,
    'token_number', p_appt.token_number,
    'status', p_payment.status,
    'amount_pkr', p_payment.amount_pkr,
    'method', p_payment.method,
    'reference', p_payment.reference,
    'reason', p_payment.reason,
    'received_at', p_payment.received_at,
    'payment_status', p_appt.payment_status,
    'appointment_status', p_appt.status
  );
$function$;

-- ---------------------------------------------------------------------------
-- Patient: online claim (server only)
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.submit_payment_claim(p_public_code text, p_method text, p_reference text)
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
  IF v_appt.payment_status IS DISTINCT FROM 'awaiting' OR v_appt.status NOT IN ('pending', 'confirmed') THEN
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

COMMENT ON FUNCTION public.submit_payment_claim(text, text, text) IS
  'Server only (web /api/pay-claim after Turnstile): the patient says they paid the clinic''s account. Awaiting tokens only; one open claim; at most 5 per token; TID 4-30; the clinic must have that account.';

-- ---------------------------------------------------------------------------
-- Desk
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.record_payment(p_appointment_id uuid, p_amount integer, p_method text, p_reference text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_method text := lower(btrim(COALESCE(p_method, '')));
  v_reference text := private.clean_reference(p_reference);
  v_appt public.appointments%ROWTYPE;
  v_was_awaiting boolean;
  v_payment public.visit_payments%ROWTYPE;
BEGIN
  v_appt := private.lock_payable_appointment(p_appointment_id);
  IF v_method NOT IN ('cash', 'easypaisa', 'jazzcash', 'bank', 'card', 'other') THEN
    RAISE EXCEPTION 'Unknown payment method "%"', p_method USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 1000000 THEN
    RAISE EXCEPTION 'Amount must be 1 to 1,000,000 rupees. Use "Free" for a free visit.' USING ERRCODE = '22023';
  END IF;
  IF v_appt.payment_status IN ('paid', 'waived') THEN
    RAISE EXCEPTION 'Token #% is already %', v_appt.token_number,
      CASE v_appt.payment_status WHEN 'paid' THEN 'paid' ELSE 'free' END USING ERRCODE = 'PT409';
  END IF;
  IF EXISTS (SELECT 1 FROM public.visit_payments vp WHERE vp.appointment_id = v_appt.id AND vp.status = 'claimed') THEN
    RAISE EXCEPTION 'Token #% has an online payment to check. Verify or reject it first.', v_appt.token_number
      USING ERRCODE = 'PT409';
  END IF;
  PERFORM private.require_unused_reference(private.center_organization(v_appt.center_id), v_method, v_reference, v_appt.id);

  INSERT INTO public.visit_payments (
    organization_id, center_id, appointment_id, patient_id, doctor_id,
    amount_pkr, method, reference, status, received_by, received_at
  ) VALUES (
    private.center_organization(v_appt.center_id), v_appt.center_id, v_appt.id, v_appt.patient_id, v_appt.doctor_id,
    p_amount, v_method, v_reference, 'paid', auth.uid(), now()
  )
  RETURNING * INTO v_payment;

  v_was_awaiting := v_appt.payment_status = 'awaiting';
  UPDATE public.appointments SET payment_status = 'paid' WHERE id = v_appt.id;
  IF v_was_awaiting THEN
    PERFORM private.admit_paid_token(v_appt.id);
  END IF;

  SELECT * INTO v_appt FROM public.appointments WHERE id = v_appt.id;
  RETURN private.payment_row_json(v_payment, v_appt);
END;
$function$;

CREATE FUNCTION public.verify_claim(p_payment_id uuid, p_accept boolean, p_reason text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_reason text := lower(btrim(COALESCE(p_reason, '')));
  v_payment public.visit_payments%ROWTYPE;
  v_appt public.appointments%ROWTYPE;
  v_was_awaiting boolean;
BEGIN
  SELECT * INTO v_payment FROM public.visit_payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found' USING ERRCODE = 'PT404';
  END IF;
  -- Token first, then the claim: the same lock order as record_payment.
  v_appt := private.lock_payable_appointment(v_payment.appointment_id);
  SELECT * INTO v_payment FROM public.visit_payments WHERE id = p_payment_id FOR UPDATE;
  IF v_payment.status <> 'claimed' THEN
    RAISE EXCEPTION 'This payment was already handled' USING ERRCODE = 'PT409';
  END IF;

  IF COALESCE(p_accept, false) THEN
    IF v_appt.payment_status IN ('paid', 'waived') THEN
      RAISE EXCEPTION 'Token #% is already %. Reject this claim.', v_appt.token_number,
        CASE v_appt.payment_status WHEN 'paid' THEN 'paid' ELSE 'free' END USING ERRCODE = 'PT409';
    END IF;
    PERFORM private.require_unused_reference(v_payment.organization_id, v_payment.method, v_payment.reference, v_appt.id);
    UPDATE public.visit_payments
    SET status = 'paid', received_by = auth.uid(), received_at = now()
    WHERE id = p_payment_id
    RETURNING * INTO v_payment;

    v_was_awaiting := v_appt.payment_status = 'awaiting';
    UPDATE public.appointments SET payment_status = 'paid' WHERE id = v_appt.id;
    IF v_was_awaiting THEN
      PERFORM private.admit_paid_token(v_appt.id);
    END IF;
  ELSE
    IF v_reason NOT IN ('not_received', 'wrong_amount', 'other') THEN
      RAISE EXCEPTION 'Choose why: not received, wrong amount or other' USING ERRCODE = '22023';
    END IF;
    UPDATE public.visit_payments
    SET status = 'rejected', reason = v_reason, received_by = auth.uid(), received_at = now()
    WHERE id = p_payment_id
    RETURNING * INTO v_payment;
  END IF;

  SELECT * INTO v_appt FROM public.appointments WHERE id = v_appt.id;
  RETURN private.payment_row_json(v_payment, v_appt);
END;
$function$;

CREATE FUNCTION public.waive_fee(p_appointment_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_reason text := lower(btrim(COALESCE(p_reason, '')));
  v_appt public.appointments%ROWTYPE;
  v_was_awaiting boolean;
  v_payment public.visit_payments%ROWTYPE;
BEGIN
  v_appt := private.lock_payable_appointment(p_appointment_id);
  IF v_reason NOT IN ('follow_up', 'staff_family', 'discount', 'other') THEN
    RAISE EXCEPTION 'Choose why the visit is free: follow-up, staff / family, discount or other' USING ERRCODE = '22023';
  END IF;
  IF v_appt.payment_status IN ('paid', 'waived') THEN
    RAISE EXCEPTION 'Token #% is already %', v_appt.token_number,
      CASE v_appt.payment_status WHEN 'paid' THEN 'paid' ELSE 'free' END USING ERRCODE = 'PT409';
  END IF;
  IF EXISTS (SELECT 1 FROM public.visit_payments vp WHERE vp.appointment_id = v_appt.id AND vp.status = 'claimed') THEN
    RAISE EXCEPTION 'Token #% has an online payment to check. Verify or reject it first.', v_appt.token_number
      USING ERRCODE = 'PT409';
  END IF;

  INSERT INTO public.visit_payments (
    organization_id, center_id, appointment_id, patient_id, doctor_id,
    amount_pkr, method, status, reason, received_by, received_at
  ) VALUES (
    private.center_organization(v_appt.center_id), v_appt.center_id, v_appt.id, v_appt.patient_id, v_appt.doctor_id,
    0, NULL, 'waived', v_reason, auth.uid(), now()
  )
  RETURNING * INTO v_payment;

  v_was_awaiting := v_appt.payment_status = 'awaiting';
  UPDATE public.appointments SET payment_status = 'waived' WHERE id = v_appt.id;
  IF v_was_awaiting THEN
    PERFORM private.admit_paid_token(v_appt.id);
  END IF;

  SELECT * INTO v_appt FROM public.appointments WHERE id = v_appt.id;
  RETURN private.payment_row_json(v_payment, v_appt);
END;
$function$;

CREATE FUNCTION public.refund_payment(p_payment_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_reason text := private.clean_text(p_reason, 200);
  v_paid public.visit_payments%ROWTYPE;
  v_refund public.visit_payments%ROWTYPE;
  v_appt public.appointments%ROWTYPE;
BEGIN
  SELECT * INTO v_paid FROM public.visit_payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found' USING ERRCODE = 'PT404';
  END IF;
  PERFORM private.require_owner(v_paid.organization_id);
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Please write why the fee is refunded' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_appt FROM public.appointments WHERE id = v_paid.appointment_id FOR UPDATE;
  SELECT * INTO v_paid FROM public.visit_payments WHERE id = p_payment_id FOR UPDATE;
  IF v_paid.status <> 'paid' THEN
    RAISE EXCEPTION 'Only a received payment can be refunded' USING ERRCODE = 'PT409';
  END IF;
  IF EXISTS (SELECT 1 FROM public.visit_payments r WHERE r.refund_of = v_paid.id) THEN
    RAISE EXCEPTION 'This payment was already refunded' USING ERRCODE = 'PT409';
  END IF;

  INSERT INTO public.visit_payments (
    organization_id, center_id, appointment_id, patient_id, doctor_id,
    amount_pkr, method, status, reason, refund_of, received_by, received_at
  ) VALUES (
    v_paid.organization_id, v_paid.center_id, v_paid.appointment_id, v_paid.patient_id, v_paid.doctor_id,
    v_paid.amount_pkr, v_paid.method, 'refunded', v_reason, v_paid.id, auth.uid(), now()
  )
  RETURNING * INTO v_refund;

  -- The token shows "refunded" unless another payment still stands.
  IF NOT EXISTS (
    SELECT 1 FROM public.visit_payments vp
    WHERE vp.appointment_id = v_appt.id AND vp.status = 'paid'
      AND NOT EXISTS (SELECT 1 FROM public.visit_payments r WHERE r.refund_of = vp.id)
  ) THEN
    UPDATE public.appointments SET payment_status = 'refunded' WHERE id = v_appt.id RETURNING * INTO v_appt;
  END IF;

  RETURN private.payment_row_json(v_refund, v_appt);
END;
$function$;

COMMENT ON FUNCTION public.record_payment(uuid, integer, text, text) IS
  'Desk: fee received (cash, easypaisa, jazzcash, bank, card, other). An awaiting token joins the line (checked in now).';
COMMENT ON FUNCTION public.verify_claim(uuid, boolean, text) IS
  'Desk: accept an online claim (paid, into the line) or reject it (not_received | wrong_amount | other).';
COMMENT ON FUNCTION public.waive_fee(uuid, text) IS
  'Desk: free visit (follow_up | staff_family | discount | other). An awaiting token joins the line.';
COMMENT ON FUNCTION public.refund_payment(uuid, text) IS
  'Owner: refund a received payment (a new refunded row; the paid row stays).';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION private.lock_payable_appointment(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.payment_row_json(public.visit_payments, public.appointments) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.submit_payment_claim(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_payment_claim(text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.record_payment(uuid, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_claim(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.waive_fee(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_payment(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_payment(uuid, integer, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_claim(uuid, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.waive_fee(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refund_payment(uuid, text) TO authenticated, service_role;

notify pgrst, 'reload schema';
