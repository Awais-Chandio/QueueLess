-- Phase 1A.2: organization memberships.
--
-- org_members(user, organization, role): owner | receptionist | doctor.
-- private.has_org_role(org, roles[]) answers "does the caller hold one of these
-- roles in this organization?". public.is_admin() stays the platform-admin
-- check (the QueueLess operator), separate from any clinic role.
--
-- Backfill and sync from the legacy tables the admin app still writes:
--   staff_centers + profiles.role = 'staff'      -> receptionist
--   doctors.profile_id                           -> doctor
--   profiles.role = 'admin' with a center_id     -> owner of that center's org
-- Platform admins without a center get no membership: their access stays
-- is_admin(), so a later role change can't leave them owning every clinic.
-- Triggers keep memberships in step with later admin-app writes.

CREATE TABLE public.org_members (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'receptionist', 'doctor')),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- One row per role: a person can be, say, both owner and doctor of a clinic.
  PRIMARY KEY (organization_id, user_id, role)
);

CREATE INDEX idx_org_members_user ON public.org_members (user_id);

COMMENT ON TABLE public.org_members IS
  'Clinic roles per organization. Receptionist and doctor rows are kept in sync with staff_centers / doctors by triggers.';

ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Helper
-- ---------------------------------------------------------------------------

-- Caller holds one of p_roles in p_org_id, and the organization is active.
CREATE FUNCTION private.has_org_role(p_org_id uuid, p_roles text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.org_members m
    JOIN public.organizations o ON o.id = m.organization_id
    WHERE m.organization_id = p_org_id
      AND m.user_id = auth.uid()
      AND m.role = ANY (p_roles)
      AND o.status = 'active'
  );
$function$;

-- ---------------------------------------------------------------------------
-- Sync triggers (created before the backfill, see 1A.1)
-- ---------------------------------------------------------------------------

-- staff_centers row -> receptionist of that center's organization, while the
-- profile is staff. Removing the last center of an organization removes it.
CREATE FUNCTION private.sync_staff_center_membership()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_org uuid;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_org := private.center_organization(OLD.center_id);
    DELETE FROM public.org_members m
    WHERE m.organization_id = v_org
      AND m.user_id = OLD.profile_id
      AND m.role = 'receptionist'
      AND NOT EXISTS (
        SELECT 1
        FROM public.staff_centers sc
        JOIN public.service_centers c ON c.id = sc.center_id
        WHERE sc.profile_id = OLD.profile_id AND c.organization_id = v_org
      );
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    INSERT INTO public.org_members (organization_id, user_id, role)
    SELECT c.organization_id, p.id, 'receptionist'
    FROM public.service_centers c
    JOIN public.profiles p ON p.id = NEW.profile_id AND p.role = 'staff'
    WHERE c.id = NEW.center_id
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NULL;
END;
$function$;

CREATE TRIGGER sync_staff_center_membership
  AFTER INSERT OR UPDATE OR DELETE ON public.staff_centers
  FOR EACH ROW EXECUTE FUNCTION private.sync_staff_center_membership();

-- doctors.profile_id -> doctor of the doctor's center's organization.
CREATE FUNCTION private.sync_doctor_membership()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_org uuid;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.profile_id IS NOT NULL THEN
    v_org := private.center_organization(OLD.center_id);
    DELETE FROM public.org_members m
    WHERE m.organization_id = v_org
      AND m.user_id = OLD.profile_id
      AND m.role = 'doctor'
      AND NOT EXISTS (
        SELECT 1
        FROM public.doctors d
        JOIN public.service_centers c ON c.id = d.center_id
        WHERE d.profile_id = OLD.profile_id AND c.organization_id = v_org
      );
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.profile_id IS NOT NULL THEN
    INSERT INTO public.org_members (organization_id, user_id, role)
    SELECT c.organization_id, NEW.profile_id, 'doctor'
    FROM public.service_centers c
    WHERE c.id = NEW.center_id
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NULL;
END;
$function$;

CREATE TRIGGER sync_doctor_membership
  AFTER INSERT OR UPDATE OF profile_id, center_id OR DELETE ON public.doctors
  FOR EACH ROW EXECUTE FUNCTION private.sync_doctor_membership();

-- profiles.role is what the admin app changes to promote/demote staff. Leaving
-- 'staff' drops receptionist rows; becoming 'staff' restores them from
-- staff_centers.
CREATE FUNCTION private.sync_profile_role_membership()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF OLD.role = 'staff' AND NEW.role IS DISTINCT FROM 'staff' THEN
    DELETE FROM public.org_members
    WHERE user_id = NEW.id AND role = 'receptionist';
  ELSIF NEW.role = 'staff' AND OLD.role IS DISTINCT FROM 'staff' THEN
    INSERT INTO public.org_members (organization_id, user_id, role)
    SELECT DISTINCT c.organization_id, NEW.id, 'receptionist'
    FROM public.staff_centers sc
    JOIN public.service_centers c ON c.id = sc.center_id
    WHERE sc.profile_id = NEW.id
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NULL;
END;
$function$;

CREATE TRIGGER sync_profile_role_membership
  AFTER UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.sync_profile_role_membership();

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------
INSERT INTO public.org_members (organization_id, user_id, role)
SELECT DISTINCT c.organization_id, p.id, 'receptionist'
FROM public.staff_centers sc
JOIN public.profiles p ON p.id = sc.profile_id AND p.role = 'staff'
JOIN public.service_centers c ON c.id = sc.center_id
ON CONFLICT DO NOTHING;

INSERT INTO public.org_members (organization_id, user_id, role)
SELECT DISTINCT c.organization_id, d.profile_id, 'doctor'
FROM public.doctors d
JOIN public.service_centers c ON c.id = d.center_id
JOIN auth.users u ON u.id = d.profile_id
ON CONFLICT DO NOTHING;

INSERT INTO public.org_members (organization_id, user_id, role)
SELECT DISTINCT c.organization_id, p.id, 'owner'
FROM public.profiles p
JOIN public.service_centers c ON c.id = p.center_id
WHERE p.role = 'admin'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Access. Members read their own rows; owners read their organization's
-- roster; platform admins read everything. Writes go through the triggers
-- above (or a platform admin/server); no client write grants.
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.org_members FROM anon, authenticated;
GRANT SELECT ON public.org_members TO authenticated;

CREATE POLICY "members read own memberships"
  ON public.org_members FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "owners read their organization roster"
  ON public.org_members FOR SELECT TO authenticated
  USING (private.has_org_role(organization_id, ARRAY['owner']));

CREATE POLICY "platform admin reads all memberships"
  ON public.org_members FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "members read their organization"
  ON public.organizations FOR SELECT TO authenticated
  USING (private.has_org_role(id, ARRAY['owner', 'receptionist', 'doctor']));

REVOKE ALL ON FUNCTION private.sync_staff_center_membership() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.sync_doctor_membership() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.sync_profile_role_membership() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.has_org_role(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_org_role(uuid, text[]) TO authenticated, service_role;
