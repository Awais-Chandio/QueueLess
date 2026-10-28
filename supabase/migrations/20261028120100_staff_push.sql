-- Phase 2C.3: push notifications to clinic staff (the MediQ app, FCM).
--
--   fee_claim     a patient sent an online payment (TID): the clinic's owners
--                 and the center's receptionists, so someone verifies it.
--   paid_waiting  a token's fee was settled (paid or free) and it is waiting:
--                 its doctor, when the doctor has an app account. Not when the
--                 doctor settled it themselves (an owner-doctor at the desk).
--
-- Triggers only INSERT rows into push_outbox (one per person and event) and
-- kick the worker; nothing here talks to FCM. The send-notifications Edge
-- Function (already run every minute by pg_cron) drains this outbox after the
-- SMS one: claim_push -> FCM -> finish_push, and forget_device_tokens for
-- tokens FCM says are gone. Rows nobody acted on in 30 minutes, or no longer
-- relevant (the claim was handled, the token left the line), are skipped.
--
-- Also: any payment row change (a claim, a verify, a reject) nudges the
-- center's realtime channel, so reception screens and the token page update
-- at once instead of on their next poll (a claim never touches appointments).

-- ---------------------------------------------------------------------------
-- Outbox
-- ---------------------------------------------------------------------------
CREATE TABLE public.push_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('fee_claim', 'paid_waiting')),
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES public.visit_payments(id) ON DELETE CASCADE,
  dedupe_key text NOT NULL UNIQUE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 400),
  -- FCM data: string values only.
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 4 CHECK (max_attempts BETWEEN 1 AND 10),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX idx_push_outbox_due ON public.push_outbox (next_attempt_at) WHERE status IN ('pending', 'sending');
CREATE INDEX idx_push_outbox_user ON public.push_outbox (user_id);
CREATE INDEX idx_device_tokens_user ON public.device_tokens (user_id);

COMMENT ON TABLE public.push_outbox IS
  'Staff push notifications (FCM) waiting to be sent. Inserted by triggers, sent by the send-notifications Edge Function. No client access.';

ALTER TABLE public.push_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_outbox FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enqueue
-- ---------------------------------------------------------------------------

-- One push per person who has the app (a device token). Never raises.
CREATE FUNCTION private.enqueue_push(
  p_user_ids uuid[], p_org_id uuid, p_kind text, p_key text, p_title text, p_body text, p_data jsonb,
  p_appointment_id uuid DEFAULT NULL, p_payment_id uuid DEFAULT NULL
)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.push_outbox (user_id, organization_id, kind, appointment_id, payment_id, dedupe_key, title, body, data)
  SELECT u.id, p_org_id, p_kind, p_appointment_id, p_payment_id, p_key || ':' || u.id, left(p_title, 120), left(p_body, 400),
         jsonb_build_object('type', p_kind) || COALESCE(p_data, '{}'::jsonb)
  FROM (SELECT DISTINCT unnest(p_user_ids) AS id) u
  WHERE u.id IS NOT NULL AND EXISTS (SELECT 1 FROM public.device_tokens t WHERE t.user_id = u.id)
  ON CONFLICT (dedupe_key) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    BEGIN
      PERFORM private.kick_notification_worker();
    EXCEPTION WHEN OTHERS THEN
      NULL;  -- the minute job sends it
    END;
  END IF;
  RETURN v_count;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'enqueue_push(%, %) failed: %', p_kind, p_key, SQLERRM;
  RETURN 0;
END;
$function$;

CREATE FUNCTION private.method_label(p_method text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT CASE p_method
    WHEN 'easypaisa' THEN 'Easypaisa' WHEN 'jazzcash' THEN 'JazzCash' WHEN 'bank' THEN 'Bank'
    WHEN 'cash' THEN 'Cash' WHEN 'card' THEN 'Card' ELSE 'Other' END;
$function$;

CREATE FUNCTION private.appointment_patient_name(p_appointment_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT COALESCE(CASE WHEN p.user_id IS NOT NULL THEN NULLIF(pr.full_name, '') END, p.name, pr.full_name)
  FROM public.appointments a
  LEFT JOIN public.patients p ON p.id = a.patient_id
  LEFT JOIN public.profiles pr ON pr.id = a.user_id
  WHERE a.id = p_appointment_id;
$function$;

-- New online claim -> the clinic's owners and the center's receptionists.
CREATE FUNCTION private.visit_payments_push_claim()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_appt public.appointments%ROWTYPE;
  v_name text;
BEGIN
  SELECT * INTO v_appt FROM public.appointments WHERE id = NEW.appointment_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  v_name := private.appointment_patient_name(v_appt.id);

  PERFORM private.enqueue_push(
    ARRAY(
      SELECT m.user_id FROM public.org_members m
      WHERE m.organization_id = NEW.organization_id AND m.role = 'owner'
      UNION
      SELECT m.user_id FROM public.org_members m
      JOIN public.staff_centers sc ON sc.profile_id = m.user_id AND sc.center_id = NEW.center_id
      WHERE m.organization_id = NEW.organization_id AND m.role = 'receptionist'
    ),
    NEW.organization_id,
    'fee_claim',
    'fee_claim:' || NEW.id,
    'Online payment to check',
    concat_ws(' · ', 'Token ' || v_appt.token_number, v_name,
              private.method_label(NEW.method) || ' Rs ' || to_char(NEW.amount_pkr, 'FM999,999,990'),
              'TID ' || NEW.reference),
    jsonb_build_object('center_id', NEW.center_id::text, 'appointment_id', v_appt.id::text, 'payment_id', NEW.id::text,
                       'token_number', v_appt.token_number::text),
    v_appt.id,
    NEW.id
  );
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'visit_payments_push_claim(%) failed: %', NEW.id, SQLERRM;
  RETURN NULL;
END;
$function$;

-- Fee settled and the token is in the line -> its doctor. Runs at commit, so
-- a walk-in issued with its fee (insert, then paid) is seen in its final state.
CREATE FUNCTION private.appointments_push_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_appt public.appointments%ROWTYPE;
  v_doctor public.doctors%ROWTYPE;
  v_paid integer;
BEGIN
  SELECT * INTO v_appt FROM public.appointments WHERE id = NEW.id;
  IF NOT FOUND OR v_appt.payment_status NOT IN ('paid', 'waived')
     OR v_appt.status NOT IN ('pending', 'confirmed', 'checked_in') OR v_appt.doctor_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_doctor FROM public.doctors WHERE id = v_appt.doctor_id;
  IF v_doctor.profile_id IS NULL OR v_doctor.profile_id IS NOT DISTINCT FROM auth.uid() THEN
    RETURN NULL;
  END IF;

  SELECT vp.amount_pkr INTO v_paid FROM public.visit_payments vp
  WHERE vp.appointment_id = v_appt.id AND vp.status = 'paid'
  ORDER BY vp.received_at DESC NULLS LAST LIMIT 1;

  PERFORM private.enqueue_push(
    ARRAY[v_doctor.profile_id],
    private.center_organization(v_appt.center_id),
    'paid_waiting',
    'paid_waiting:' || v_appt.id,
    'Token ' || v_appt.token_number || ' is waiting',
    concat_ws(' · ', private.appointment_patient_name(v_appt.id),
              CASE WHEN v_appt.payment_status = 'waived' THEN 'Free visit'
                   ELSE 'Fee paid' || COALESCE(' Rs ' || to_char(v_paid, 'FM999,999,990'), '') END),
    jsonb_build_object('doctor_id', v_doctor.id::text, 'appointment_id', v_appt.id::text,
                       'token_number', v_appt.token_number::text),
    v_appt.id
  );
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'appointments_push_paid(%) failed: %', NEW.id, SQLERRM;
  RETURN NULL;
END;
$function$;

-- Claims, verifies and rejects -> the center's realtime channel.
CREATE FUNCTION private.visit_payments_nudge_displays()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM private.nudge_center_displays(ARRAY(SELECT DISTINCT center_id FROM changed_rows));
  RETURN NULL;
END;
$function$;

CREATE TRIGGER visit_payments_push_claim
  AFTER INSERT ON public.visit_payments
  FOR EACH ROW
  WHEN (NEW.status = 'claimed')
  EXECUTE FUNCTION private.visit_payments_push_claim();

CREATE CONSTRAINT TRIGGER appointments_push_paid
  AFTER UPDATE ON public.appointments
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (OLD.payment_status IS DISTINCT FROM NEW.payment_status AND NEW.payment_status IN ('paid', 'waived'))
  EXECUTE FUNCTION private.appointments_push_paid();

CREATE TRIGGER visit_payments_nudge_displays_insert
  AFTER INSERT ON public.visit_payments
  REFERENCING NEW TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION private.visit_payments_nudge_displays();

CREATE TRIGGER visit_payments_nudge_displays_update
  AFTER UPDATE ON public.visit_payments
  REFERENCING NEW TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION private.visit_payments_nudge_displays();

-- ---------------------------------------------------------------------------
-- Worker RPCs (server only: the Edge Function with the service role)
-- ---------------------------------------------------------------------------

-- Skips what no longer makes sense, then claims up to p_limit due rows with
-- the person's device tokens. A row left in 'sending' is claimed again once
-- its lock expires.
CREATE FUNCTION public.claim_push(p_limit integer DEFAULT 50, p_lock_seconds integer DEFAULT 120)
 RETURNS TABLE (
   id uuid, user_id uuid, kind text, title text, body text, data jsonb, attempts integer, max_attempts integer, tokens text[]
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
BEGIN
  PERFORM private.require_server();

  UPDATE public.push_outbox o
  SET status = 'skipped', locked_until = NULL, updated_at = now(),
      last_error = CASE
        WHEN o.created_at < now() - interval '30 minutes' THEN 'stale'
        WHEN NOT EXISTS (SELECT 1 FROM public.device_tokens t WHERE t.user_id = o.user_id) THEN 'no device'
        WHEN o.kind = 'fee_claim' THEN 'claim already handled'
        ELSE 'no longer waiting' END
  WHERE o.status = 'pending'
    AND (
      o.created_at < now() - interval '30 minutes'
      OR NOT EXISTS (SELECT 1 FROM public.device_tokens t WHERE t.user_id = o.user_id)
      OR (o.kind = 'fee_claim' AND NOT EXISTS (
            SELECT 1 FROM public.visit_payments vp WHERE vp.id = o.payment_id AND vp.status = 'claimed'))
      OR (o.kind = 'paid_waiting' AND NOT EXISTS (
            SELECT 1 FROM public.appointments a WHERE a.id = o.appointment_id AND a.status IN ('pending', 'confirmed', 'checked_in')))
    );

  RETURN QUERY
  WITH due AS (
    SELECT q.id
    FROM public.push_outbox q
    WHERE (q.status = 'pending' AND q.next_attempt_at <= now())
       OR (q.status = 'sending' AND q.locked_until < now())
    ORDER BY q.next_attempt_at, q.created_at
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.push_outbox o
    SET status = 'sending',
        attempts = o.attempts + 1,
        locked_until = now() + make_interval(secs => GREATEST(30, COALESCE(p_lock_seconds, 120))),
        updated_at = now()
    FROM due
    WHERE o.id = due.id
    RETURNING o.*
  )
  SELECT c.id, c.user_id, c.kind, c.title, c.body, c.data, c.attempts, c.max_attempts,
         ARRAY(SELECT t.fcm_token FROM public.device_tokens t WHERE t.user_id = c.user_id ORDER BY t.updated_at DESC NULLS LAST LIMIT 10)
  FROM claimed c
  ORDER BY c.created_at;
END;
$function$;

-- Sent: done. Retryable with attempts left: pending again after 15s, 30s, 1m.
-- Otherwise failed.
CREATE FUNCTION public.finish_push(p_id uuid, p_ok boolean, p_error text DEFAULT NULL, p_retryable boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_row public.push_outbox%ROWTYPE;
BEGIN
  PERFORM private.require_server();
  SELECT * INTO v_row FROM public.push_outbox WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Push not found' USING ERRCODE = 'PT404';
  END IF;
  IF v_row.status <> 'sending' THEN
    RETURN v_row.status;
  END IF;

  IF p_ok THEN
    UPDATE public.push_outbox SET status = 'sent', sent_at = now(), locked_until = NULL, last_error = NULL, updated_at = now()
    WHERE id = p_id;
    RETURN 'sent';
  END IF;
  IF COALESCE(p_retryable, false) AND v_row.attempts < v_row.max_attempts THEN
    UPDATE public.push_outbox
    SET status = 'pending', locked_until = NULL, last_error = left(p_error, 500), updated_at = now(),
        next_attempt_at = now() + interval '15 seconds' * power(2, GREATEST(v_row.attempts - 1, 0))
    WHERE id = p_id;
    RETURN 'pending';
  END IF;
  UPDATE public.push_outbox SET status = 'failed', locked_until = NULL, last_error = left(p_error, 500), updated_at = now()
  WHERE id = p_id;
  RETURN 'failed';
END;
$function$;

-- FCM said these tokens are gone (app uninstalled, signed out, token rotated).
CREATE FUNCTION public.forget_device_tokens(p_tokens text[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_count integer;
BEGIN
  PERFORM private.require_server();
  DELETE FROM public.device_tokens WHERE fcm_token = ANY (COALESCE(p_tokens, '{}'::text[]));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

-- ---------------------------------------------------------------------------
-- The minute job also wakes the worker for pushes; finished rows are pruned
-- with the SMS outbox (pushes after 7 days).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.kick_notification_worker()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_url text;
  v_secret text;
  v_request bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.notification_outbox
    WHERE (status = 'pending' AND next_attempt_at <= now())
       OR (status = 'sending' AND locked_until < now())
  ) AND NOT EXISTS (
    SELECT 1 FROM public.push_outbox
    WHERE (status = 'pending' AND next_attempt_at <= now())
       OR (status = 'sending' AND locked_until < now())
  ) THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'notifications_worker_url';
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'notifications_worker_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE NOTICE 'send-notifications: Vault secrets notifications_worker_url / notifications_worker_secret are not set';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) INTO v_request;
  RETURN v_request;
END;
$function$;

CREATE OR REPLACE FUNCTION private.prune_notification_outbox()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_count integer;
  v_push integer;
BEGIN
  DELETE FROM public.notification_outbox
  WHERE status IN ('sent', 'failed', 'skipped') AND updated_at < now() - interval '30 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  DELETE FROM public.push_outbox
  WHERE status IN ('sent', 'failed', 'skipped') AND updated_at < now() - interval '7 days';
  GET DIAGNOSTICS v_push = ROW_COUNT;
  RETURN v_count + v_push;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION private.enqueue_push(uuid[], uuid, text, text, text, text, jsonb, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.method_label(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.appointment_patient_name(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.visit_payments_push_claim() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.appointments_push_paid() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.visit_payments_nudge_displays() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.claim_push(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_push(uuid, boolean, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.forget_device_tokens(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_push(uuid, boolean, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.forget_device_tokens(text[]) TO service_role;

notify pgrst, 'reload schema';
