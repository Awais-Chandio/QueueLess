-- Phase 1D.1: notification outbox.
--
-- Triggers only INSERT rows into notification_outbox; nothing here talks to
-- the network. The send-notifications Edge Function (run every minute by
-- pg_cron, 1D.2) claims rows, charges credits once, sends, and records the
-- result:
--
--   claim_notifications(limit)        pending (or abandoned) rows -> sending
--   begin_notification_send(id, ...)  charges via charge_message_credits the
--                                     first time only; a retry reuses the
--                                     same message_log row, never charges again
--   finish_notification_send(id, ...) sent / retry later / failed (+ refund)
--   skip_notification(id, reason)     not sent and not charged
--
-- Events (one message per appointment and event, dedupe_key):
--   token_issued  a token with a phone number was issued (status link)
--   three_ahead   exactly 3 people ahead in the doctor's line
--   your_turn     the token was called
--   doctor_late / doctor_break   the doctor is running late / took a break,
--                 to everyone still waiting for that doctor today
-- Queue triggers are deferred to commit, so call_next (complete + call, two
-- UPDATEs) is seen in its final state.
--
-- Rows are only written for clinics whose plan has 'sms' or 'whatsapp'.
-- Language: the patient's preferred_language, else the clinic's
-- message_language (default Urdu).

-- ---------------------------------------------------------------------------
-- Language preferences
-- ---------------------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN message_language text NOT NULL DEFAULT 'ur' CHECK (message_language IN ('ur', 'en'));
ALTER TABLE public.patients
  ADD COLUMN preferred_language text CHECK (preferred_language IN ('ur', 'en'));

COMMENT ON COLUMN public.organizations.message_language IS 'Default language of patient SMS / WhatsApp messages (ur | en).';
COMMENT ON COLUMN public.patients.preferred_language IS 'Language for this patient''s messages; NULL = the clinic''s message_language.';

-- ---------------------------------------------------------------------------
-- Ledger: refunds
-- ---------------------------------------------------------------------------
ALTER TABLE public.message_log ADD COLUMN refunded_at timestamptz;
COMMENT ON COLUMN public.message_log.refunded_at IS 'Set when a message that finally failed had its credits given back (once).';

-- ---------------------------------------------------------------------------
-- Outbox
-- ---------------------------------------------------------------------------
CREATE TABLE public.notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  event text NOT NULL CHECK (event IN ('token_issued', 'three_ahead', 'your_turn', 'doctor_late', 'doctor_break')),
  dedupe_key text NOT NULL UNIQUE,
  to_phone text NOT NULL CHECK (to_phone ~ '^\+?[0-9]{7,15}$'),
  language text NOT NULL CHECK (language IN ('ur', 'en')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  channel text CHECK (channel IN ('sms', 'whatsapp')),
  message_log_id uuid REFERENCES public.message_log(id) ON DELETE SET NULL,
  provider_message_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX idx_notification_outbox_due ON public.notification_outbox (next_attempt_at)
  WHERE status IN ('pending', 'sending');
CREATE INDEX idx_notification_outbox_org_created ON public.notification_outbox (organization_id, created_at DESC);
CREATE INDEX idx_notification_outbox_appointment ON public.notification_outbox (appointment_id);

COMMENT ON TABLE public.notification_outbox IS
  'Patient SMS / WhatsApp messages waiting to be sent. Inserted by triggers, sent by the send-notifications Edge Function. No client writes.';

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_outbox FROM anon, authenticated;
GRANT SELECT ON public.notification_outbox TO authenticated, service_role;

CREATE POLICY "owners read their outbox" ON public.notification_outbox
  FOR SELECT TO authenticated
  USING (private.has_org_role(organization_id, ARRAY['owner']) OR public.is_admin());

-- ---------------------------------------------------------------------------
-- Enqueue
-- ---------------------------------------------------------------------------

-- One message for one appointment, if the clinic can send messages and the
-- patient has a phone. Never raises: a failed enqueue must not undo the queue
-- change that caused it.
CREATE FUNCTION private.enqueue_notification(p_appointment_id uuid, p_event text, p_dedupe_key text, p_extra jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_row record;
BEGIN
  SELECT a.id, a.token_number, a.public_code, a.status, a.appointment_date,
         p.phone, COALESCE(p.preferred_language, o.message_language) AS language,
         o.id AS organization_id, o.name AS organization_name, o.timezone,
         c.name AS center_name, d.name AS doctor_name, d.room
  INTO v_row
  FROM public.appointments a
  JOIN public.patients p ON p.id = a.patient_id
  JOIN public.service_centers c ON c.id = a.center_id
  JOIN public.organizations o ON o.id = c.organization_id
  LEFT JOIN public.doctors d ON d.id = a.doctor_id
  WHERE a.id = p_appointment_id;

  IF NOT FOUND OR v_row.phone IS NULL OR v_row.token_number IS NULL THEN
    RETURN;
  END IF;
  IF NOT (private.has_module(v_row.organization_id, 'sms') OR private.has_module(v_row.organization_id, 'whatsapp')) THEN
    RETURN;
  END IF;

  INSERT INTO public.notification_outbox (organization_id, appointment_id, event, dedupe_key, to_phone, language, payload)
  VALUES (
    v_row.organization_id, v_row.id, p_event, p_dedupe_key, v_row.phone, v_row.language,
    jsonb_build_object(
      'token_number', v_row.token_number,
      'public_code', v_row.public_code,
      'clinic_name', v_row.center_name,
      'organization_name', v_row.organization_name,
      'doctor_name', v_row.doctor_name,
      'room', v_row.room,
      'timezone', v_row.timezone,
      'people_ahead', (SELECT tp.people_ahead FROM private.token_progress(v_row.id) tp)
    ) || COALESCE(p_extra, '{}'::jsonb)
  )
  ON CONFLICT (dedupe_key) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'enqueue_notification(%, %) failed: %', p_appointment_id, p_event, SQLERRM;
END;
$function$;

-- Waiting tokens of one doctor's day, in call order.
CREATE FUNCTION private.doctor_waiting_tokens(p_doctor_id uuid, p_date date)
 RETURNS TABLE (appointment_id uuid, people_ahead integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT a.id, (row_number() OVER (ORDER BY COALESCE(a.skipped_at, a.created_at, a.scheduled_at), a.token_number) - 1)::integer
  FROM public.appointments a
  WHERE a.doctor_id = p_doctor_id
    AND a.appointment_date = p_date
    AND a.status IN ('pending', 'confirmed', 'checked_in');
$function$;

-- New token -> token_issued (with the status link).
CREATE FUNCTION private.appointments_notify_issued()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.status NOT IN ('cancelled', 'expired') THEN
    PERFORM private.enqueue_notification(NEW.id, 'token_issued', 'token_issued:' || NEW.id);
  END IF;
  RETURN NULL;
END;
$function$;

-- Queue moved -> your_turn for a called token, three_ahead for whoever is now
-- exactly 3 behind the front of that doctor's line. Runs at commit.
CREATE FUNCTION private.appointments_notify_queue()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_current public.appointments%ROWTYPE;
  v_target uuid;
BEGIN
  -- Deferred: read the row as it is now, not as it was mid-transaction.
  SELECT * INTO v_current FROM public.appointments WHERE id = NEW.id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_current.status = 'called' THEN
    PERFORM private.enqueue_notification(v_current.id, 'your_turn', 'your_turn:' || v_current.id);
  END IF;

  IF v_current.doctor_id IS NOT NULL THEN
    SELECT w.appointment_id INTO v_target
    FROM private.doctor_waiting_tokens(v_current.doctor_id, v_current.appointment_date) w
    WHERE w.people_ahead = 3;
    IF v_target IS NOT NULL THEN
      PERFORM private.enqueue_notification(v_target, 'three_ahead', 'three_ahead:' || v_target);
    END IF;
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'appointments_notify_queue(%) failed: %', NEW.id, SQLERRM;
  RETURN NULL;
END;
$function$;

-- Doctor running late (new late_until in the future) or starting a break ->
-- everyone still waiting for that doctor today. Runs at commit.
CREATE FUNCTION private.doctors_notify_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_doctor public.doctors%ROWTYPE;
  v_today date;
  v_event text;
  v_stamp text;
  v_waiting record;
BEGIN
  SELECT * INTO v_doctor FROM public.doctors WHERE id = NEW.id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_doctor.is_on_break AND NOT COALESCE(OLD.is_on_break, false) THEN
    v_event := 'doctor_break';
    v_stamp := to_char(date_trunc('minute', now()), 'YYYYMMDDHH24MI');
  ELSIF v_doctor.late_until IS NOT NULL AND v_doctor.late_until > now()
        AND v_doctor.late_until IS DISTINCT FROM OLD.late_until THEN
    v_event := 'doctor_late';
    v_stamp := to_char(v_doctor.late_until, 'YYYYMMDDHH24MI');
  ELSE
    RETURN NULL;
  END IF;

  v_today := private.org_today(private.center_organization(v_doctor.center_id));
  FOR v_waiting IN SELECT * FROM private.doctor_waiting_tokens(v_doctor.id, v_today) LOOP
    PERFORM private.enqueue_notification(
      v_waiting.appointment_id, v_event, v_event || ':' || v_waiting.appointment_id || ':' || v_stamp,
      CASE WHEN v_event = 'doctor_late' THEN jsonb_build_object('late_until', v_doctor.late_until) ELSE '{}'::jsonb END);
  END LOOP;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'doctors_notify_status(%) failed: %', NEW.id, SQLERRM;
  RETURN NULL;
END;
$function$;

CREATE CONSTRAINT TRIGGER appointments_notify_issued
  AFTER INSERT ON public.appointments
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION private.appointments_notify_issued();

CREATE CONSTRAINT TRIGGER appointments_notify_queue
  AFTER UPDATE ON public.appointments
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.skipped_at IS DISTINCT FROM NEW.skipped_at)
  EXECUTE FUNCTION private.appointments_notify_queue();

CREATE CONSTRAINT TRIGGER doctors_notify_status
  AFTER UPDATE ON public.doctors
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (OLD.is_on_break IS DISTINCT FROM NEW.is_on_break OR OLD.late_until IS DISTINCT FROM NEW.late_until)
  EXECUTE FUNCTION private.doctors_notify_status();

-- ---------------------------------------------------------------------------
-- Worker RPCs (server only: the Edge Function with the service role)
-- ---------------------------------------------------------------------------
CREATE FUNCTION private.require_server()
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT private.is_server_context() THEN
    RAISE EXCEPTION 'Server only' USING ERRCODE = '42501';
  END IF;
END;
$function$;

-- Skips messages that no longer make sense (the patient was seen, the token
-- was cancelled, or it is too old), then claims up to p_limit due rows. A row
-- left in 'sending' (worker crashed) is claimed again once its lock expires.
CREATE FUNCTION public.claim_notifications(p_limit integer DEFAULT 20, p_lock_seconds integer DEFAULT 120)
 RETURNS TABLE (
   id uuid, organization_id uuid, appointment_id uuid, event text, to_phone text, language text,
   payload jsonb, attempts integer, max_attempts integer, channel text, message_log_id uuid, modules text[]
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
BEGIN
  PERFORM private.require_server();

  UPDATE public.notification_outbox o
  SET status = 'skipped', locked_until = NULL, updated_at = now(),
      last_error = CASE
        WHEN a.id IS NULL THEN 'appointment removed'
        WHEN o.created_at < now() - interval '3 hours' THEN 'stale'
        ELSE 'no longer relevant (' || a.status || ')' END
  FROM public.notification_outbox o2
  LEFT JOIN public.appointments a ON a.id = o2.appointment_id
  WHERE o.id = o2.id
    AND o.status = 'pending'
    AND o.message_log_id IS NULL
    AND (
      a.id IS NULL
      OR o.created_at < now() - interval '3 hours'
      OR (o.event IN ('three_ahead', 'doctor_late', 'doctor_break') AND a.status NOT IN ('pending', 'confirmed', 'checked_in'))
      OR (o.event = 'your_turn' AND a.status NOT IN ('called', 'in_progress'))
      OR (o.event = 'token_issued' AND a.status IN ('cancelled', 'expired'))
    );

  RETURN QUERY
  WITH due AS (
    SELECT q.id
    FROM public.notification_outbox q
    WHERE (q.status = 'pending' AND q.next_attempt_at <= now())
       OR (q.status = 'sending' AND q.locked_until < now())
    ORDER BY q.next_attempt_at, q.created_at
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 100))
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.notification_outbox o
    SET status = 'sending',
        attempts = o.attempts + 1,
        locked_until = now() + make_interval(secs => GREATEST(30, COALESCE(p_lock_seconds, 120))),
        updated_at = now()
    FROM due
    WHERE o.id = due.id
    RETURNING o.*
  )
  SELECT c.id, c.organization_id, c.appointment_id, c.event, c.to_phone, c.language,
         c.payload, c.attempts, c.max_attempts, c.channel, c.message_log_id,
         COALESCE(e.modules, '{}'::text[])
  FROM claimed c
  LEFT JOIN public.org_entitlements e ON e.organization_id = c.organization_id
  ORDER BY c.created_at;
END;
$function$;

-- Charges for a claimed row the first time; later attempts reuse that charge.
-- Not enough credits / no module: the row is skipped, nothing is charged.
-- Returns {"message_log_id", "charged": bool} or {"skipped": true, "reason"}.
CREATE FUNCTION public.begin_notification_send(p_outbox_id uuid, p_channel text, p_cost integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_row public.notification_outbox%ROWTYPE;
  v_log uuid;
BEGIN
  PERFORM private.require_server();
  SELECT * INTO v_row FROM public.notification_outbox WHERE id = p_outbox_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notification not found' USING ERRCODE = 'PT404';
  END IF;
  IF v_row.status <> 'sending' THEN
    RAISE EXCEPTION 'Notification is not being sent (status %)', v_row.status USING ERRCODE = 'PT409';
  END IF;

  IF v_row.message_log_id IS NOT NULL THEN
    RETURN jsonb_build_object('message_log_id', v_row.message_log_id, 'channel', v_row.channel, 'charged', false);
  END IF;

  BEGIN
    v_log := public.charge_message_credits(v_row.organization_id, p_channel, v_row.to_phone,
                                           v_row.event || ':' || v_row.language, p_cost, v_row.appointment_id);
  EXCEPTION WHEN SQLSTATE 'PT402' THEN
    UPDATE public.notification_outbox
    SET status = 'skipped', locked_until = NULL, last_error = SQLERRM, updated_at = now()
    WHERE id = p_outbox_id;
    RETURN jsonb_build_object('skipped', true, 'reason', SQLERRM);
  END;

  UPDATE public.notification_outbox
  SET message_log_id = v_log, channel = p_channel, updated_at = now()
  WHERE id = p_outbox_id;
  RETURN jsonb_build_object('message_log_id', v_log, 'channel', p_channel, 'charged', true);
END;
$function$;

-- Records the provider's answer. Sent: done. Retryable failure with attempts
-- left: back to pending after a backoff (30s, 1m, 2m, 4m ... max 30m), the
-- charge is kept for the retry. Otherwise: failed, and the credits are given
-- back once.
CREATE FUNCTION public.finish_notification_send(
  p_outbox_id uuid, p_ok boolean, p_provider_message_id text DEFAULT NULL, p_error text DEFAULT NULL, p_retryable boolean DEFAULT false
)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_row public.notification_outbox%ROWTYPE;
  v_log public.message_log%ROWTYPE;
  v_error text := left(p_error, 500);
BEGIN
  PERFORM private.require_server();
  SELECT * INTO v_row FROM public.notification_outbox WHERE id = p_outbox_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notification not found' USING ERRCODE = 'PT404';
  END IF;
  IF v_row.status <> 'sending' THEN
    RETURN v_row.status;  -- already finished (a duplicate call changes nothing)
  END IF;

  IF p_ok THEN
    UPDATE public.notification_outbox
    SET status = 'sent', sent_at = now(), locked_until = NULL, provider_message_id = left(p_provider_message_id, 200),
        last_error = NULL, updated_at = now()
    WHERE id = p_outbox_id;
    UPDATE public.message_log
    SET status = 'sent', provider_message_id = left(p_provider_message_id, 200), error = NULL, updated_at = now()
    WHERE id = v_row.message_log_id;
    RETURN 'sent';
  END IF;

  IF COALESCE(p_retryable, false) AND v_row.attempts < v_row.max_attempts THEN
    UPDATE public.notification_outbox
    SET status = 'pending', locked_until = NULL, last_error = v_error, updated_at = now(),
        next_attempt_at = now() + LEAST(interval '30 minutes', interval '30 seconds' * power(2, GREATEST(v_row.attempts - 1, 0)))
    WHERE id = p_outbox_id;
    RETURN 'pending';
  END IF;

  UPDATE public.notification_outbox
  SET status = 'failed', locked_until = NULL, last_error = v_error, updated_at = now()
  WHERE id = p_outbox_id;

  SELECT * INTO v_log FROM public.message_log WHERE id = v_row.message_log_id FOR UPDATE;
  IF FOUND THEN
    UPDATE public.message_log SET status = 'failed', error = v_error, updated_at = now(),
           refunded_at = COALESCE(refunded_at, now())
    WHERE id = v_log.id;
    IF v_log.refunded_at IS NULL AND v_log.cost > 0 THEN
      UPDATE public.message_credits SET balance = balance + v_log.cost, updated_at = now()
      WHERE organization_id = v_log.organization_id;
    END IF;
  END IF;
  RETURN 'failed';
END;
$function$;

-- The web join page's language (Urdu / English) for a token it just issued:
-- saved on the patient, and applied to messages for that token not yet sent.
-- Service role only (/api/join, after issue_public_token).
CREATE FUNCTION public.set_token_language(p_public_code text, p_language text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_appt public.appointments%ROWTYPE;
BEGIN
  PERFORM private.require_server();
  IF p_language NOT IN ('ur', 'en') THEN
    RAISE EXCEPTION 'Language must be ur or en' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_appt FROM public.appointments WHERE public_code = upper(btrim(COALESCE(p_public_code, '')));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token not found' USING ERRCODE = 'PT404';
  END IF;
  UPDATE public.patients SET preferred_language = p_language WHERE id = v_appt.patient_id AND user_id IS NULL;
  UPDATE public.notification_outbox SET language = p_language, updated_at = now()
  WHERE appointment_id = v_appt.id AND status = 'pending';
END;
$function$;

-- Not sent and not charged (e.g. no channel configured for the clinic's plan).
CREATE FUNCTION public.skip_notification(p_outbox_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM private.require_server();
  UPDATE public.notification_outbox
  SET status = 'skipped', locked_until = NULL, last_error = left(p_reason, 500), updated_at = now()
  WHERE id = p_outbox_id AND status IN ('pending', 'sending') AND message_log_id IS NULL;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION private.enqueue_notification(uuid, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.doctor_waiting_tokens(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.appointments_notify_issued() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.appointments_notify_queue() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.doctors_notify_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.require_server() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.require_server() TO service_role;

REVOKE ALL ON FUNCTION public.claim_notifications(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.begin_notification_send(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_notification_send(uuid, boolean, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.skip_notification(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_token_language(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_token_language(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_notifications(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_notification_send(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_notification_send(uuid, boolean, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.skip_notification(uuid, text) TO service_role;

notify pgrst, 'reload schema';
