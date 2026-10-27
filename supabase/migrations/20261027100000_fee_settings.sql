-- Phase 2A.1: clinic fee settings.
--
-- 1. center_payment_settings, one row per center (created with the center):
--      fee_mode               before | after | off (default before)
--                               before: QR patients pay first, then join the line
--                               after:  the fee is recorded after the visit (1B-1E behaviour)
--                               off:    no fee anywhere
--      unpaid_expiry_minutes  10..120 (default 30): an unpaid QR token expires
--      payment accounts       shown to patients on the token status page, all
--                             optional: Easypaisa / JazzCash (number + title),
--                             bank (name, title, IBAN), Raast ID.
--    Kept out of service_centers (anon reads every column of that table).
--    Staff read it; the owner writes it with set_center_fee_settings.
-- 2. upsert_doctor takes p_fee (doctors.fee, whole rupees). NULL keeps it.
-- 3. get_org_settings returns each doctor's fee and each center's fee settings.

-- ---------------------------------------------------------------------------
-- 1. Settings
-- ---------------------------------------------------------------------------
CREATE TABLE public.center_payment_settings (
  center_id uuid PRIMARY KEY REFERENCES public.service_centers(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  fee_mode text NOT NULL DEFAULT 'before' CHECK (fee_mode IN ('before', 'after', 'off')),
  unpaid_expiry_minutes integer NOT NULL DEFAULT 30 CHECK (unpaid_expiry_minutes BETWEEN 10 AND 120),
  easypaisa_number text CHECK (easypaisa_number ~ '^03[0-9]{9}$'),
  easypaisa_title text CHECK (char_length(easypaisa_title) BETWEEN 1 AND 100),
  jazzcash_number text CHECK (jazzcash_number ~ '^03[0-9]{9}$'),
  jazzcash_title text CHECK (char_length(jazzcash_title) BETWEEN 1 AND 100),
  bank_name text CHECK (char_length(bank_name) BETWEEN 1 AND 100),
  bank_title text CHECK (char_length(bank_title) BETWEEN 1 AND 100),
  bank_iban text CHECK (bank_iban ~ '^PK[0-9]{2}[A-Z]{4}[0-9]{16}$'),
  raast_id text CHECK (raast_id ~ '^03[0-9]{9}$'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- An account is shown only when it is complete.
  CHECK ((easypaisa_number IS NULL) = (easypaisa_title IS NULL)),
  CHECK ((jazzcash_number IS NULL) = (jazzcash_title IS NULL)),
  CHECK ((bank_name IS NULL) = (bank_title IS NULL) AND (bank_title IS NULL) = (bank_iban IS NULL))
);

COMMENT ON TABLE public.center_payment_settings IS
  'Per center: fee mode (before|after|off), minutes before an unpaid QR token expires, and the clinic''s own payment accounts shown to patients. Staff read; the owner writes via set_center_fee_settings.';

INSERT INTO public.center_payment_settings (center_id, organization_id)
SELECT c.id, c.organization_id FROM public.service_centers c WHERE c.organization_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE FUNCTION private.service_centers_create_payment_settings()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.organization_id IS NOT NULL THEN
    INSERT INTO public.center_payment_settings (center_id, organization_id)
    VALUES (NEW.id, NEW.organization_id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NULL;
END;
$function$;

CREATE TRIGGER service_centers_create_payment_settings
  AFTER INSERT OR UPDATE OF organization_id ON public.service_centers
  FOR EACH ROW EXECUTE FUNCTION private.service_centers_create_payment_settings();

ALTER TABLE public.center_payment_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.center_payment_settings FROM anon, authenticated;
GRANT SELECT ON public.center_payment_settings TO authenticated;
CREATE POLICY "center staff read fee settings" ON public.center_payment_settings
  FOR SELECT TO authenticated
  USING (private.can_manage_center(center_id));

-- The center's settings, defaults when the row is missing.
CREATE FUNCTION private.center_fee_settings(p_center_id uuid)
 RETURNS public.center_payment_settings
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT COALESCE(
    (SELECT s FROM public.center_payment_settings s WHERE s.center_id = p_center_id),
    ROW(p_center_id, private.center_organization(p_center_id), 'before', 30,
        NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, now(), NULL)::public.center_payment_settings
  );
$function$;

-- What a patient sees: the complete accounts only. No internal ids.
CREATE FUNCTION private.payment_accounts_json(p_settings public.center_payment_settings)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'easypaisa', CASE WHEN p_settings.easypaisa_number IS NOT NULL THEN
                   jsonb_build_object('number', p_settings.easypaisa_number, 'title', p_settings.easypaisa_title) END,
    'jazzcash', CASE WHEN p_settings.jazzcash_number IS NOT NULL THEN
                  jsonb_build_object('number', p_settings.jazzcash_number, 'title', p_settings.jazzcash_title) END,
    'bank', CASE WHEN p_settings.bank_iban IS NOT NULL THEN
              jsonb_build_object('name', p_settings.bank_name, 'title', p_settings.bank_title, 'iban', p_settings.bank_iban) END,
    'raast', CASE WHEN p_settings.raast_id IS NOT NULL THEN jsonb_build_object('id', p_settings.raast_id) END
  ));
$function$;

-- Owner's view (settings page): mode, expiry and every account field.
CREATE FUNCTION private.fee_settings_json(p_settings public.center_payment_settings)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'fee_mode', p_settings.fee_mode,
    'unpaid_expiry_minutes', p_settings.unpaid_expiry_minutes,
    'easypaisa_number', p_settings.easypaisa_number,
    'easypaisa_title', p_settings.easypaisa_title,
    'jazzcash_number', p_settings.jazzcash_number,
    'jazzcash_title', p_settings.jazzcash_title,
    'bank_name', p_settings.bank_name,
    'bank_title', p_settings.bank_title,
    'bank_iban', p_settings.bank_iban,
    'raast_id', p_settings.raast_id
  );
$function$;

-- "0300-123 4567", "+92 300 1234567" -> 03001234567. NULL when empty,
-- raises when it isn't a Pakistani mobile number.
CREATE FUNCTION private.clean_mobile_account(p_number text, p_label text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE
  v text := regexp_replace(COALESCE(p_number, ''), '[\s().-]', '', 'g');
BEGIN
  IF v = '' THEN
    RETURN NULL;
  END IF;
  v := regexp_replace(v, '^(\+92|0092|92)(3[0-9]{9})$', '0\2');
  IF v !~ '^03[0-9]{9}$' THEN
    RAISE EXCEPTION '% must be a mobile number like 03001234567', p_label USING ERRCODE = '22023';
  END IF;
  RETURN v;
END;
$function$;

CREATE FUNCTION public.set_center_fee_settings(
  p_center_id uuid,
  p_fee_mode text,
  p_unpaid_expiry_minutes integer,
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
  v_org uuid := private.center_organization(p_center_id);
  v_mode text := lower(btrim(COALESCE(p_fee_mode, '')));
  v_ep_number text := private.clean_mobile_account(p_easypaisa_number, 'Easypaisa number');
  v_ep_title text := private.clean_text(p_easypaisa_title, 100);
  v_jc_number text := private.clean_mobile_account(p_jazzcash_number, 'JazzCash number');
  v_jc_title text := private.clean_text(p_jazzcash_title, 100);
  v_bank_name text := private.clean_text(p_bank_name, 100);
  v_bank_title text := private.clean_text(p_bank_title, 100);
  v_iban text := NULLIF(upper(regexp_replace(COALESCE(p_bank_iban, ''), '[\s-]', '', 'g')), '');
  v_raast text := private.clean_mobile_account(p_raast_id, 'Raast ID');
  v_row public.center_payment_settings%ROWTYPE;
BEGIN
  PERFORM private.require_owner(v_org);
  IF v_mode NOT IN ('before', 'after', 'off') THEN
    RAISE EXCEPTION 'Fee mode must be before, after or off' USING ERRCODE = '22023';
  END IF;
  IF p_unpaid_expiry_minutes IS NULL OR p_unpaid_expiry_minutes NOT BETWEEN 10 AND 120 THEN
    RAISE EXCEPTION 'Unpaid tokens expire after 10 to 120 minutes' USING ERRCODE = '22023';
  END IF;
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

  INSERT INTO public.center_payment_settings AS s (
    center_id, organization_id, fee_mode, unpaid_expiry_minutes,
    easypaisa_number, easypaisa_title, jazzcash_number, jazzcash_title,
    bank_name, bank_title, bank_iban, raast_id, updated_at, updated_by
  ) VALUES (
    p_center_id, v_org, v_mode, p_unpaid_expiry_minutes,
    v_ep_number, v_ep_title, v_jc_number, v_jc_title,
    v_bank_name, v_bank_title, v_iban, v_raast, now(), auth.uid()
  )
  ON CONFLICT (center_id) DO UPDATE SET
    fee_mode = EXCLUDED.fee_mode,
    unpaid_expiry_minutes = EXCLUDED.unpaid_expiry_minutes,
    easypaisa_number = EXCLUDED.easypaisa_number,
    easypaisa_title = EXCLUDED.easypaisa_title,
    jazzcash_number = EXCLUDED.jazzcash_number,
    jazzcash_title = EXCLUDED.jazzcash_title,
    bank_name = EXCLUDED.bank_name,
    bank_title = EXCLUDED.bank_title,
    bank_iban = EXCLUDED.bank_iban,
    raast_id = EXCLUDED.raast_id,
    updated_at = now(),
    updated_by = auth.uid()
  RETURNING * INTO v_row;

  RETURN private.fee_settings_json(v_row);
END;
$function$;

COMMENT ON FUNCTION public.set_center_fee_settings(uuid, text, integer, text, text, text, text, text, text, text, text) IS
  'Owner: fee mode (before|after|off), unpaid expiry (10-120 min) and the payment accounts patients see. Empty account fields clear that account.';

-- ---------------------------------------------------------------------------
-- 2. Doctor fee
-- ---------------------------------------------------------------------------
DROP FUNCTION public.upsert_doctor(uuid, uuid, text, text, text, numeric, boolean);

-- As in 1B.4, plus p_fee: whole rupees 0..1,000,000; NULL keeps the current fee.
CREATE FUNCTION public.upsert_doctor(
  p_center_id uuid, p_doctor_id uuid, p_name text, p_specialty text, p_room text,
  p_average_minutes numeric DEFAULT NULL, p_is_active boolean DEFAULT true, p_fee integer DEFAULT NULL
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_org uuid := private.center_organization(p_center_id);
  v_name text := private.clean_text(p_name, 100);
  v_specialty text := COALESCE(private.clean_text(p_specialty, 100), 'General Physician');
  v_room text := private.clean_text(p_room, 30);
  v_doctor public.doctors%ROWTYPE;
  v_id uuid := p_doctor_id;
BEGIN
  PERFORM private.require_owner(v_org);
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Please enter the doctor''s name' USING ERRCODE = '22023';
  END IF;
  IF p_average_minutes IS NOT NULL AND (p_average_minutes < 1 OR p_average_minutes > 120) THEN
    RAISE EXCEPTION 'Average consultation time must be 1 to 120 minutes' USING ERRCODE = '22023';
  END IF;
  IF p_fee IS NOT NULL AND (p_fee < 0 OR p_fee > 1000000) THEN
    RAISE EXCEPTION 'Fee must be 0 to 1,000,000 rupees' USING ERRCODE = '22023';
  END IF;

  IF v_id IS NULL THEN
    IF COALESCE(p_is_active, true) THEN
      PERFORM private.check_doctor_limit(v_org, 1);
    END IF;
    INSERT INTO public.doctors (center_id, name, specialty, room, is_active, fee)
    VALUES (p_center_id, v_name, v_specialty, v_room, COALESCE(p_is_active, true), p_fee)
    RETURNING id INTO v_id;

    INSERT INTO public.doctor_services (doctor_id, service_id)
    SELECT v_id, s.id FROM public.services s WHERE s.center_id = p_center_id ORDER BY s.created_at, s.id LIMIT 1;
  ELSE
    SELECT * INTO v_doctor FROM public.doctors WHERE id = v_id FOR UPDATE;
    IF NOT FOUND OR v_doctor.center_id <> p_center_id THEN
      RAISE EXCEPTION 'Doctor not found' USING ERRCODE = 'PT404';
    END IF;
    IF COALESCE(p_is_active, true) AND NOT v_doctor.is_active THEN
      PERFORM private.check_doctor_limit(v_org, 1);
    END IF;
    UPDATE public.doctors
    SET name = v_name, specialty = v_specialty, room = v_room, is_active = COALESCE(p_is_active, true),
        fee = COALESCE(p_fee, fee), updated_at = now()
    WHERE id = v_id;
  END IF;

  IF p_average_minutes IS NOT NULL THEN
    INSERT INTO public.doctor_queue_settings (doctor_id, average_consultation_time, updated_at)
    VALUES (v_id, p_average_minutes, now())
    ON CONFLICT (doctor_id) DO UPDATE SET average_consultation_time = EXCLUDED.average_consultation_time, updated_at = now();
  END IF;

  RETURN v_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Settings page: + doctors.fee, + centers.fees
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
               'fees', private.fee_settings_json(private.center_fee_settings(c.id))
             ) ORDER BY c.created_at, c.id)
      FROM public.service_centers c WHERE c.organization_id = p_org_id
    ), '[]'::jsonb),
    'doctors', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', d.id, 'center_id', d.center_id, 'name', d.name, 'specialty', d.specialty, 'room', d.room,
               'is_active', d.is_active, 'is_on_break', d.is_on_break, 'has_account', d.profile_id IS NOT NULL,
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
REVOKE ALL ON FUNCTION private.service_centers_create_payment_settings() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.center_fee_settings(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.payment_accounts_json(public.center_payment_settings) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.fee_settings_json(public.center_payment_settings) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.clean_mobile_account(text, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.set_center_fee_settings(uuid, text, integer, text, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_center_fee_settings(uuid, text, integer, text, text, text, text, text, text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.upsert_doctor(uuid, uuid, text, text, text, numeric, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_doctor(uuid, uuid, text, text, text, numeric, boolean, integer) TO authenticated, service_role;

notify pgrst, 'reload schema';
