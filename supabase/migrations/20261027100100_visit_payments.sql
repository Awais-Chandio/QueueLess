-- Phase 2A.2: visit payments (append-only).
--
-- 1. appointments.payment_status: NULL (nothing recorded), awaiting (fee
--    before: not in the line until paid), paid, waived (free visit),
--    refunded. appointments.fee_pkr: the fee due, from the doctor's fee when
--    the token was issued. Both written by the payment RPCs only (UPDATE on
--    appointments is granted per column; these two are not granted).
-- 2. visit_payments: one row per money event. Never deleted; a correction is
--    a new row (refund) or a waive. The only update allowed is resolving an
--    online claim (claimed -> paid | rejected) and the received_by account
--    being deleted.
--      claimed   patient says they paid online (method + TID), waiting for the desk
--      paid      money received (cash at the desk, or a verified claim)
--      rejected  the desk could not find the claimed payment (reason)
--      waived    free visit (reason), amount 0
--      refunded  money given back: refund_of = the paid row, same amount
--    Net received = sum(paid) - sum(refunded).
-- 3. Access: owner and the center's receptionists read their rows; a doctor
--    reads their own patients' rows; anon nothing. Writes through RPCs only.

-- ---------------------------------------------------------------------------
-- 1. appointments
-- ---------------------------------------------------------------------------
ALTER TABLE public.appointments
  ADD COLUMN payment_status text CHECK (payment_status IN ('awaiting', 'paid', 'waived', 'refunded')),
  ADD COLUMN fee_pkr integer CHECK (fee_pkr BETWEEN 0 AND 1000000);

COMMENT ON COLUMN public.appointments.payment_status IS
  'NULL = nothing recorded; awaiting = fee before: not in the line until paid or waived; paid; waived (free); refunded. Written by the payment RPCs.';
COMMENT ON COLUMN public.appointments.fee_pkr IS
  'Fee due in whole rupees, from the doctor''s fee when the token was issued. NULL when the clinic''s fee mode is off.';

CREATE INDEX idx_appointments_awaiting_payment ON public.appointments (center_id, appointment_date)
  WHERE payment_status = 'awaiting';

-- ---------------------------------------------------------------------------
-- 2. visit_payments
-- ---------------------------------------------------------------------------
CREATE TABLE public.visit_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  center_id uuid NOT NULL REFERENCES public.service_centers(id) ON DELETE RESTRICT,
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE RESTRICT,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  doctor_id uuid REFERENCES public.doctors(id) ON DELETE RESTRICT,
  amount_pkr integer NOT NULL CHECK (amount_pkr BETWEEN 0 AND 1000000),
  method text CHECK (method IN ('cash', 'easypaisa', 'jazzcash', 'bank', 'card', 'other')),
  reference text CHECK (reference ~ '^[A-Z0-9/-]{4,30}$'),
  status text NOT NULL CHECK (status IN ('claimed', 'paid', 'rejected', 'waived', 'refunded')),
  reason text CHECK (char_length(reason) BETWEEN 1 AND 200),
  refund_of uuid UNIQUE REFERENCES public.visit_payments(id) ON DELETE RESTRICT,
  received_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  received_at timestamptz,
  -- clock_timestamp: rows written in one transaction keep their order.
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (method IS NOT NULL OR status = 'waived'),
  CHECK (status <> 'claimed' OR (reference IS NOT NULL AND method IN ('easypaisa', 'jazzcash', 'bank') AND received_at IS NULL)),
  CHECK (status NOT IN ('paid', 'waived', 'refunded', 'rejected') OR received_at IS NOT NULL),
  CHECK (status <> 'waived' OR (amount_pkr = 0 AND method IS NULL AND reason IS NOT NULL)),
  CHECK (status <> 'rejected' OR reason IS NOT NULL),
  CHECK ((status = 'refunded') = (refund_of IS NOT NULL)),
  CHECK (status <> 'refunded' OR reason IS NOT NULL)
);

COMMENT ON TABLE public.visit_payments IS
  'Append-only fee records per token: claimed (online, waiting for the desk), paid, rejected, waived, refunded (refund_of the paid row). Net = paid - refunded. Written by the payment RPCs; never deleted.';

-- One open online claim per token at a time.
CREATE UNIQUE INDEX visit_payments_one_open_claim ON public.visit_payments (appointment_id) WHERE status = 'claimed';
CREATE INDEX idx_visit_payments_appointment ON public.visit_payments (appointment_id);
CREATE INDEX idx_visit_payments_center_received ON public.visit_payments (center_id, received_at);
CREATE INDEX idx_visit_payments_center_created ON public.visit_payments (center_id, created_at);
CREATE INDEX idx_visit_payments_reference ON public.visit_payments (organization_id, reference) WHERE reference IS NOT NULL;
CREATE INDEX idx_visit_payments_doctor ON public.visit_payments (doctor_id, received_at);

-- No deletes; the only updates are a claim being resolved and the account
-- that received it being deleted (ON DELETE SET NULL).
CREATE FUNCTION private.visit_payments_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Payment records are never deleted. Record a refund instead.' USING ERRCODE = '42501';
  END IF;

  IF (NEW.id, NEW.organization_id, NEW.center_id, NEW.appointment_id, NEW.patient_id, NEW.doctor_id,
      NEW.amount_pkr, NEW.method, NEW.reference, NEW.refund_of, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.organization_id, OLD.center_id, OLD.appointment_id, OLD.patient_id, OLD.doctor_id,
      OLD.amount_pkr, OLD.method, OLD.reference, OLD.refund_of, OLD.created_at) THEN
    RAISE EXCEPTION 'Payment records cannot be changed. Record a refund instead.' USING ERRCODE = '42501';
  END IF;

  -- The receiving account was deleted.
  IF NEW.status = OLD.status AND NEW.reason IS NOT DISTINCT FROM OLD.reason
     AND NEW.received_at IS NOT DISTINCT FROM OLD.received_at AND NEW.received_by IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'claimed' AND NEW.status IN ('paid', 'rejected') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Payment records cannot be changed. Record a refund instead.' USING ERRCODE = '42501';
END;
$function$;

CREATE TRIGGER visit_payments_append_only
  BEFORE UPDATE OR DELETE ON public.visit_payments
  FOR EACH ROW EXECUTE FUNCTION private.visit_payments_append_only();

-- ---------------------------------------------------------------------------
-- 3. Access
-- ---------------------------------------------------------------------------
ALTER TABLE public.visit_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.visit_payments FROM anon, authenticated;
GRANT SELECT ON public.visit_payments TO authenticated;
GRANT SELECT ON public.visit_payments TO service_role;

-- Owner of the organization, or a receptionist assigned to the center
-- (is_center_staff); platform admins.
CREATE POLICY "center staff read payments" ON public.visit_payments
  FOR SELECT TO authenticated
  USING (private.can_manage_center(center_id));

CREATE POLICY "doctor reads own patients' payments" ON public.visit_payments
  FOR SELECT TO authenticated
  USING (private.is_doctor_self(doctor_id));

REVOKE ALL ON FUNCTION private.visit_payments_append_only() FROM PUBLIC;

notify pgrst, 'reload schema';
