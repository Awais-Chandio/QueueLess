-- Phase 1A.8: messaging ledger.
--
-- message_credits   prepaid balance per organization (never negative)
-- message_log       one row per SMS/WhatsApp message: recipient, template,
--                   status, cost
-- charge_message_credits(...)  server-only: debits and logs atomically, so a
--                   message is never sent without being paid for and two
--                   concurrent sends can't spend the same credit.
--
-- Sending itself (provider, Edge Function) is Phase 1D. No client can write
-- either table; owners and platform admins can read them.

CREATE TABLE public.message_credits (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.message_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('sms', 'whatsapp')),
  -- "to" is a reserved word in SQL; to_phone avoids quoting it everywhere.
  to_phone text NOT NULL CHECK (to_phone ~ '^\+?[0-9]{7,15}$'),
  template text NOT NULL CHECK (char_length(template) BETWEEN 1 AND 100),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'failed')),
  cost integer NOT NULL DEFAULT 0 CHECK (cost >= 0),
  provider_message_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_message_log_org_created ON public.message_log (organization_id, created_at DESC);
CREATE INDEX idx_message_log_appointment ON public.message_log (appointment_id);

COMMENT ON TABLE public.message_log IS 'Outgoing SMS/WhatsApp messages and what they cost (credits). Written server-side only.';

ALTER TABLE public.message_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_log ENABLE ROW LEVEL SECURITY;

-- Every organization has a balance row (0), existing and new.
CREATE FUNCTION private.organizations_default_credits()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.message_credits (organization_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$function$;

CREATE TRIGGER organizations_default_credits
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION private.organizations_default_credits();

INSERT INTO public.message_credits (organization_id)
SELECT id FROM public.organizations
ON CONFLICT DO NOTHING;

-- Debit p_cost credits and log a queued message, or fail with PT402 and
-- change nothing. Server only (service_role / SQL), never a client.
CREATE FUNCTION public.charge_message_credits(
  p_organization_id uuid,
  p_channel text,
  p_to_phone text,
  p_template text,
  p_cost integer,
  p_appointment_id uuid DEFAULT NULL
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_phone text := private.normalize_phone(p_to_phone);
  v_id uuid;
BEGIN
  IF NOT private.is_server_context() THEN
    RAISE EXCEPTION 'charge_message_credits can only run server-side' USING ERRCODE = '42501';
  END IF;
  IF p_cost IS NULL OR p_cost < 0 THEN
    RAISE EXCEPTION 'cost must be zero or more' USING ERRCODE = '22023';
  END IF;
  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'Invalid recipient phone' USING ERRCODE = '22023';
  END IF;
  IF p_channel = 'sms' AND NOT private.has_module(p_organization_id, 'sms')
     OR p_channel = 'whatsapp' AND NOT private.has_module(p_organization_id, 'whatsapp') THEN
    RAISE EXCEPTION 'This clinic''s plan doesn''t include % messages', p_channel USING ERRCODE = 'PT402';
  END IF;
  IF p_appointment_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.appointments a
       JOIN public.service_centers c ON c.id = a.center_id
       WHERE a.id = p_appointment_id AND c.organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'Appointment belongs to another clinic' USING ERRCODE = '42501';
  END IF;

  UPDATE public.message_credits
  SET balance = balance - p_cost, updated_at = now()
  WHERE organization_id = p_organization_id AND balance >= p_cost;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not enough message credits' USING ERRCODE = 'PT402';
  END IF;

  INSERT INTO public.message_log (organization_id, appointment_id, channel, to_phone, template, cost)
  VALUES (p_organization_id, p_appointment_id, p_channel, v_phone, p_template, p_cost)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- Access: owners and platform admins read; nobody writes from a client. The
-- Phase 1D sender (service_role) gets exactly what it needs here.
REVOKE ALL ON public.message_credits, public.message_log FROM anon, authenticated;
GRANT SELECT ON public.message_credits, public.message_log TO authenticated;
GRANT SELECT ON public.message_credits TO service_role;
GRANT SELECT, UPDATE (status, provider_message_id, error, updated_at) ON public.message_log TO service_role;

CREATE POLICY "owners read their message credits" ON public.message_credits
  FOR SELECT TO authenticated
  USING (private.has_org_role(organization_id, ARRAY['owner']) OR public.is_admin());

CREATE POLICY "owners read their message log" ON public.message_log
  FOR SELECT TO authenticated
  USING (private.has_org_role(organization_id, ARRAY['owner']) OR public.is_admin());

REVOKE ALL ON FUNCTION private.organizations_default_credits() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.charge_message_credits(uuid, text, text, text, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.charge_message_credits(uuid, text, text, text, integer, uuid) TO service_role;
