# Phase 1A: SaaS data model

| Step | Migration | Notes |
|---|---|---|
| 1A.1 Organizations | `20261021120000_organizations.sql` | [1A.1](1A.1-organizations.md) |
| 1A.2 Memberships | `20261021120100_org_members.sql` | [1A.2](1A.2-org-members.md) |
| 1A.3 RLS on membership | `20261021120200_org_rls.sql` | [1A.3](1A.3-org-rls.md) |
| 1A.4 Guest patients | `20261021120300_patients.sql` | [1A.4](1A.4-patients.md) |
| 1A.5 Tokens | `20261021120400_tokens.sql` | [1A.5](1A.5-tokens.md) |
| 1A.6 Public status | `20261021120500_token_status.sql` | [1A.6](1A.6-token-status.md) |
| 1A.7 Plans | `20261021120600_plans.sql` | [1A.7](1A.7-plans.md) |
| 1A.8 Messaging | `20261021120700_messaging.sql` | [1A.8](1A.8-messaging.md) |
| 1A.9 Default orgs, types | `20261021120800_default_organizations.sql` | [1A.9](1A.9-default-orgs-types-app.md) |

Branch `phase-1a-saas` starts from `phase-0-security` (Phase 0 isn't in `main` yet; branching from `main` would
have dropped the live Phase 0 migrations).

## Local checks
```sh
supabase db reset && supabase test db                    # 376 pgTAP checks
SUPABASE_ANON_KEY=$(supabase status -o env | grep '^ANON_KEY=' | cut -d= -f2- | tr -d '"') \
  node supabase/tests/api/phase-1a.mjs && supabase db reset   # 29 API checks (writes locally)
npx tsc --noEmit && npx jest
```

## Production runbook
1. **Backup** (keep outside the repo: it contains patient data):
   ```sh
   mkdir -p ~/queueless-backups/pre-1a
   supabase db dump --linked -f ~/queueless-backups/pre-1a/schema.sql
   supabase db dump --linked --role-only -f ~/queueless-backups/pre-1a/roles.sql
   supabase db dump --linked --data-only --use-copy -f ~/queueless-backups/pre-1a/data.sql
   ```
2. **Preflight** (read-only, SQL editor). The first must be 0, or 1A.1 stops on purpose:
   ```sql
   SELECT count(*) AS orphan_appointments FROM appointments a
   WHERE NOT EXISTS (SELECT 1 FROM service_centers c WHERE c.id = a.center_id);
   SELECT (SELECT count(*) FROM service_centers) AS centers,
          (SELECT count(*) FROM staff_centers) AS staff_links,
          (SELECT count(*) FROM doctors WHERE profile_id IS NOT NULL) AS doctor_accounts,
          (SELECT count(*) FROM appointments) AS appointments,
          (SELECT count(*) FROM center_queue_settings s WHERE NOT EXISTS (SELECT 1 FROM service_centers c WHERE c.id = s.center_id)) AS orphan_queue_settings;
   ```
3. **Dry run**: `supabase db push --linked --dry-run` must list exactly the nine `20261021120000` … `20261021120800` files above.
4. **Push**: `supabase db push --linked`
5. **Checks**: see the Phase 1A summary for the SQL.
