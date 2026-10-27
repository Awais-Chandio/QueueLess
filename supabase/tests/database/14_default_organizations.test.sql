-- Phase 1A.9: existing centers as default organizations, end to end.
-- Run with: supabase test db. Uses the seed accounts. Everything is rolled back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(8);

SELECT is((SELECT count(*) FROM public.service_centers c JOIN public.organizations o ON o.id = c.organization_id WHERE o.is_legacy),
          (SELECT count(*) FROM public.service_centers), 'every seeded center sits in a default (legacy) organization');
SELECT is((SELECT count(DISTINCT organization_id) FROM public.service_centers), (SELECT count(*) FROM public.service_centers),
          'one organization per center');
SELECT is_empty($$SELECT o.id FROM public.organizations o
                  WHERE NOT EXISTS (SELECT 1 FROM public.org_subscriptions s WHERE s.organization_id = o.id AND s.status = 'trialing' AND s.plan_id = 'trial')
                     OR NOT EXISTS (SELECT 1 FROM public.org_entitlements e WHERE e.organization_id = o.id AND e.plan_id = 'trial')
                     OR NOT EXISTS (SELECT 1 FROM public.message_credits m WHERE m.organization_id = o.id AND m.balance = 0)$$,
                'every organization: trial subscription and entitlements (2B), 0 credits');
SELECT is_empty($$SELECT sc.profile_id FROM public.staff_centers sc
                  JOIN public.service_centers c ON c.id = sc.center_id
                  WHERE NOT EXISTS (SELECT 1 FROM public.org_members m
                                    WHERE m.organization_id = c.organization_id AND m.user_id = sc.profile_id AND m.role = 'receptionist')$$,
                'every staff_centers row is backed by a receptionist membership');
SELECT is_empty($$SELECT d.id FROM public.doctors d JOIN public.service_centers c ON c.id = d.center_id
                  WHERE d.profile_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.org_members m
                    WHERE m.organization_id = c.organization_id AND m.user_id = d.profile_id AND m.role = 'doctor')$$,
                'every doctor account is a doctor member');
SELECT is_empty($$SELECT a.id FROM public.appointments a JOIN public.patients p ON p.id = a.patient_id
                  JOIN public.service_centers c ON c.id = a.center_id WHERE p.organization_id <> c.organization_id$$,
                'every appointment''s patient is in its center''s organization');
SELECT is_empty($$SELECT m.user_id FROM public.org_members m
                  WHERE m.role = 'receptionist' AND NOT EXISTS (
                    SELECT 1 FROM public.staff_centers sc JOIN public.service_centers c ON c.id = sc.center_id
                    WHERE sc.profile_id = m.user_id AND c.organization_id = m.organization_id)$$,
                'no receptionist membership without a center assignment');
SELECT is_empty($$SELECT 1 FROM public.organizations o
                  JOIN public.org_members m ON m.organization_id = o.id AND m.role = 'owner'
                  WHERE o.is_legacy AND m.user_id IN (SELECT id FROM public.profiles WHERE role = 'admin')$$,
                'platform admins are not owners of default organizations');

SELECT * FROM finish();
ROLLBACK;
