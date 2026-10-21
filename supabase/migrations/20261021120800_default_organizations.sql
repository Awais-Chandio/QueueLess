-- Phase 1A.9: existing centers as default organizations, final pass.
--
-- 1A.1 already gave every existing center its own default organization (the
-- NOT NULL needed it). This migration makes the result complete and checked:
--   1. Repair (idempotent): fill anything an earlier step's backfill could
--      have missed: memberships from staff_centers / doctors, a Free
--      subscription, entitlements, a credit balance.
--   2. Verify: abort the migration (nothing of it applied) if any tenant
--      invariant fails, rather than leaving a half-attached clinic live.

-- ---------------------------------------------------------------------------
-- 1. Repair
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

INSERT INTO public.org_subscriptions (organization_id, plan_id, status)
SELECT o.id, 'free', 'active'
FROM public.organizations o
WHERE NOT EXISTS (SELECT 1 FROM public.org_subscriptions s WHERE s.organization_id = o.id AND s.status <> 'cancelled');

SELECT private.refresh_org_entitlements(o.id)
FROM public.organizations o
WHERE NOT EXISTS (SELECT 1 FROM public.org_entitlements e WHERE e.organization_id = o.id);

INSERT INTO public.message_credits (organization_id)
SELECT id FROM public.organizations
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Verify
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_problem text;
  v_count bigint;
BEGIN
  FOR v_problem, v_count IN
    SELECT 'centers sharing a default organization', count(*) FROM (
      SELECT c.organization_id FROM public.service_centers c
      JOIN public.organizations o ON o.id = c.organization_id AND o.is_legacy
      GROUP BY c.organization_id HAVING count(*) > 1) x
    UNION ALL
    SELECT 'staff_centers rows of staff without a receptionist membership', count(*)
      FROM public.staff_centers sc
      JOIN public.profiles p ON p.id = sc.profile_id AND p.role = 'staff'
      JOIN public.service_centers c ON c.id = sc.center_id
      WHERE NOT EXISTS (SELECT 1 FROM public.org_members m
                        WHERE m.organization_id = c.organization_id AND m.user_id = sc.profile_id AND m.role = 'receptionist')
    UNION ALL
    SELECT 'doctor accounts without a doctor membership', count(*)
      FROM public.doctors d
      JOIN public.service_centers c ON c.id = d.center_id
      JOIN auth.users u ON u.id = d.profile_id
      WHERE NOT EXISTS (SELECT 1 FROM public.org_members m
                        WHERE m.organization_id = c.organization_id AND m.user_id = d.profile_id AND m.role = 'doctor')
    UNION ALL
    SELECT 'organizations without a live subscription', count(*)
      FROM public.organizations o
      WHERE NOT EXISTS (SELECT 1 FROM public.org_subscriptions s WHERE s.organization_id = o.id AND s.status <> 'cancelled')
    UNION ALL
    SELECT 'organizations without entitlements', count(*)
      FROM public.organizations o
      WHERE NOT EXISTS (SELECT 1 FROM public.org_entitlements e WHERE e.organization_id = o.id)
    UNION ALL
    SELECT 'organizations without a credit balance', count(*)
      FROM public.organizations o
      WHERE NOT EXISTS (SELECT 1 FROM public.message_credits m WHERE m.organization_id = o.id)
    UNION ALL
    SELECT 'appointments whose patient is in another organization', count(*)
      FROM public.appointments a
      JOIN public.patients p ON p.id = a.patient_id
      JOIN public.service_centers c ON c.id = a.center_id
      WHERE p.organization_id <> c.organization_id
    UNION ALL
    SELECT 'appointments without a public code', count(*)
      FROM public.appointments WHERE public_code IS NULL
  LOOP
    IF v_count > 0 THEN
      RAISE EXCEPTION 'Phase 1A.9 check failed: % (%)', v_problem, v_count;
    END IF;
  END LOOP;
END
$$;
