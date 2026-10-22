-- Phase 1A.1: tenants.
--
-- organizations = one clinic business (the SaaS account). Every service center
-- belongs to exactly one organization; every other business table reaches an
-- organization through service_centers (see tasks/phase-1a/1A.1-organizations.md
-- for the full table -> organization map).
--
-- Existing centers each get their own default organization (is_legacy = true):
-- they are separate hospitals, so they must not share a tenant. Centers created
-- later without an organization (the admin app's "add center" screen) get one
-- the same way, so the existing app keeps working unchanged.

-- ---------------------------------------------------------------------------
-- 0. Preflight: appointments must point at a real center, or they can't be
--    resolved to an organization. Fail before changing anything.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_orphans bigint;
BEGIN
  SELECT count(*) INTO v_orphans
  FROM public.appointments a
  WHERE NOT EXISTS (SELECT 1 FROM public.service_centers c WHERE c.id = a.center_id);

  IF v_orphans > 0 THEN
    RAISE EXCEPTION 'Phase 1A.1: % appointment(s) reference a center that no longer exists; fix them before migrating', v_orphans;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 1. organizations
-- ---------------------------------------------------------------------------
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  slug text NOT NULL UNIQUE
    CHECK (char_length(slug) <= 80 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- "Today" for token numbering and plan limits is the clinic's local day.
  timezone text NOT NULL DEFAULT 'Asia/Karachi',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  -- Created automatically for a pre-SaaS center (by this migration or by the
  -- admin app's center form), not by a clinic signing up.
  is_legacy boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.organizations IS
  'A clinic business (SaaS tenant). Owns service centers; everything else resolves to it through them.';

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Lower-case, dash-separated, never empty.
CREATE FUNCTION private.slugify(p_text text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT COALESCE(
    NULLIF(btrim(left(regexp_replace(lower(COALESCE(p_text, '')), '[^a-z0-9]+', '-', 'g'), 60), '-'), ''),
    'clinic'
  );
$function$;

CREATE FUNCTION private.organizations_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  -- Rejects an unknown time zone name (raises invalid_parameter_value).
  PERFORM now() AT TIME ZONE NEW.timezone;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER organizations_before_write
  BEFORE INSERT OR UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION private.organizations_before_write();

-- Default organization for a center: named after it, slug made unique with the
-- start of the new organization's id.
CREATE FUNCTION private.create_default_organization(p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.organizations (id, name, slug, is_legacy)
  VALUES (
    v_id,
    left(COALESCE(NULLIF(btrim(p_name), ''), 'Clinic'), 200),
    private.slugify(p_name) || '-' || left(v_id::text, 8),
    true
  );
  RETURN v_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. service_centers.organization_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.service_centers
  ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX idx_service_centers_organization ON public.service_centers (organization_id);

-- New centers without an organization get a default one. Only platform admins
-- (or the server) may move a center to another organization.
CREATE FUNCTION private.service_centers_assign_organization()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.organization_id IS NULL THEN
    NEW.organization_id := private.create_default_organization(NEW.name);
  ELSIF TG_OP = 'UPDATE'
        AND NEW.organization_id IS DISTINCT FROM OLD.organization_id
        AND NOT private.is_server_context()
        AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only a platform admin can move a center to another organization'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

-- Created before the backfill so a center inserted while this migration runs
-- is covered either way.
CREATE TRIGGER service_centers_assign_organization
  BEFORE INSERT OR UPDATE OF organization_id ON public.service_centers
  FOR EACH ROW EXECUTE FUNCTION private.service_centers_assign_organization();

-- Backfill: one default organization per existing center.
DO $$
DECLARE
  v_center record;
BEGIN
  FOR v_center IN
    SELECT id, name FROM public.service_centers WHERE organization_id IS NULL ORDER BY created_at, id
  LOOP
    UPDATE public.service_centers
    SET organization_id = private.create_default_organization(v_center.name)
    WHERE id = v_center.id;
  END LOOP;
END
$$;

ALTER TABLE public.service_centers ALTER COLUMN organization_id SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Center links that had no foreign key. The preflight above guarantees
--    appointments are clean, so that one is validated. center_queue_settings
--    rows are per-day display settings; old rows for deleted centers are
--    harmless, so the constraint is validated only when there are none.
--    Deleting a center that has appointments now fails instead of orphaning
--    them (ON DELETE NO ACTION).
-- ---------------------------------------------------------------------------
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_center_id_fkey
  FOREIGN KEY (center_id) REFERENCES public.service_centers(id) NOT VALID;
ALTER TABLE public.appointments VALIDATE CONSTRAINT appointments_center_id_fkey;

ALTER TABLE public.center_queue_settings
  ADD CONSTRAINT center_queue_settings_center_id_fkey
  FOREIGN KEY (center_id) REFERENCES public.service_centers(id) ON DELETE CASCADE NOT VALID;

DO $$
DECLARE
  v_orphans bigint;
BEGIN
  SELECT count(*) INTO v_orphans
  FROM public.center_queue_settings s
  WHERE NOT EXISTS (SELECT 1 FROM public.service_centers c WHERE c.id = s.center_id);

  IF v_orphans = 0 THEN
    ALTER TABLE public.center_queue_settings VALIDATE CONSTRAINT center_queue_settings_center_id_fkey;
  ELSE
    RAISE WARNING 'Phase 1A.1: % center_queue_settings row(s) for deleted centers; foreign key left NOT VALID', v_orphans;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 4. Access. Organization membership arrives in 1A.2; until then only
--    platform admins can read organizations. No client writes.
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.organizations FROM anon, authenticated;
GRANT SELECT ON public.organizations TO authenticated;

CREATE POLICY "platform admin reads organizations"
  ON public.organizations FOR SELECT TO authenticated
  USING (public.is_admin());

-- Helper used by later policies and RPCs: the organization a center belongs to.
CREATE FUNCTION private.center_organization(p_center_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT organization_id FROM public.service_centers WHERE id = p_center_id;
$function$;

REVOKE ALL ON FUNCTION private.slugify(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.organizations_before_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.create_default_organization(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.service_centers_assign_organization() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.center_organization(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.center_organization(uuid) TO authenticated, service_role;
