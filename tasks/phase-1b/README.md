# Phase 1B: web app

The web app lives in its own repo, `../mediq-web` (Next.js + `@supabase/ssr`, same Supabase project).
This branch (`phase-1b-db`) holds only the database side.

| Step | Migration | What |
|---|---|---|
| 1B.1 Public join | `20261021130000_public_join.sql` | `service_centers.slug`, `doctors.room`, skip-aware queue order, `issue_public_token` (service role only; **anon can no longer call `issue_token`**), `get_public_center` |
| 1B.2 Display | `20261021130100_display.sql` | `center_displays` secret keys, `get_display_snapshot` (anon, token numbers only), `rotate_display_key`, realtime broadcast `changed` on `display:<key>` |
| 1B.3 Reception | `20261021130200_reception.sql` | `get_my_workspaces`, `get_reception_queue`, `call_next`, `skip_token`, `mark_no_show`, `recall_token`, `set_doctor_break` |
| 1B.4 Onboarding | `20261021130300_onboarding.sql` | `create_organization`, `org_invites` + `invite_staff` / `revoke_invite` / `accept_invites`, `upsert_doctor`, `update_center`, `remove_staff`, `get_org_settings` |

Tests: `supabase/tests/database/15_public_join` … `18_onboarding` (pgTAP), `supabase/tests/api/phase-1a.mjs`
(now with the service-role public join), and the Playwright suite in `../mediq-web/e2e`.

`supabase/config.toml`: local auth also accepts redirects to the web app on `localhost:3000` / `:3100`.

## Local checks
```sh
supabase db reset && supabase test db                              # 502 pgTAP checks
eval "$(supabase status -o env | grep -E '^(ANON_KEY|SERVICE_ROLE_KEY)=')"
SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY \
  node supabase/tests/api/phase-1a.mjs && supabase db reset          # API checks (writes locally)
cd ../mediq-web && npm run typecheck && npm run lint && npm run test:e2e
```

## Production runbook

**Order matters**: 1B revokes anon `issue_token`. Push the database, then deploy the web app straight after.
(The Android app only calls `issue_token` signed in, so it keeps working.)

1. **Backup** (outside the repo: it contains patient data):
   ```sh
   mkdir -p ~/queueless-backups/pre-1b
   supabase db dump --linked -f ~/queueless-backups/pre-1b/schema.sql
   supabase db dump --linked --role-only -f ~/queueless-backups/pre-1b/roles.sql
   supabase db dump --linked --data-only --use-copy -f ~/queueless-backups/pre-1b/data.sql
   ```
2. **Dry run**: `supabase db push --linked --dry-run` must list exactly these four, in order:
   `20261021130000_public_join.sql`, `20261021130100_display.sql`, `20261021130200_reception.sql`,
   `20261021130300_onboarding.sql`. Anything else: stop.
3. **Push**: `supabase db push --linked`
4. **Checks** (SQL editor, read-only). Every row must say `true`:
   ```sql
   SELECT 'every center has a slug' AS check, NOT EXISTS (SELECT 1 FROM service_centers WHERE slug IS NULL) AS ok
   UNION ALL SELECT 'every center has a display key',
     (SELECT count(*) FROM service_centers) = (SELECT count(*) FROM center_displays)
   UNION ALL SELECT 'anon cannot issue_token',
     NOT has_function_privilege('anon', 'public.issue_token(uuid,text,text,text)', 'execute')
   UNION ALL SELECT 'only service_role issues public tokens',
     NOT has_function_privilege('anon', 'public.issue_public_token(uuid,text,text,text,text)', 'execute')
     AND NOT has_function_privilege('authenticated', 'public.issue_public_token(uuid,text,text,text,text)', 'execute')
     AND has_function_privilege('service_role', 'public.issue_public_token(uuid,text,text,text,text)', 'execute')
   UNION ALL SELECT 'anon reads join page and TV',
     has_function_privilege('anon', 'public.get_public_center(text)', 'execute')
     AND has_function_privilege('anon', 'public.get_display_snapshot(text)', 'execute')
     AND has_function_privilege('anon', 'public.get_token_status(text)', 'execute')
   UNION ALL SELECT 'anon cannot run staff RPCs',
     NOT has_function_privilege('anon', 'public.call_next(uuid)', 'execute')
     AND NOT has_function_privilege('anon', 'public.get_reception_queue(uuid)', 'execute')
     AND NOT has_function_privilege('anon', 'public.create_organization(text,text,text,text,jsonb,text,time,time)', 'execute')
   UNION ALL SELECT 'RLS on new tables',
     (SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('public.center_displays'::regclass, 'public.org_invites'::regclass))
   UNION ALL SELECT 'anon cannot read display keys',
     NOT has_table_privilege('anon', 'public.center_displays', 'select')
   UNION ALL SELECT 'display nudge triggers',
     (SELECT count(*) = 3 FROM pg_trigger WHERE tgname IN
       ('appointments_nudge_displays_insert', 'appointments_nudge_displays_update', 'doctors_nudge_displays_update'));
   ```
   Then over HTTP, with the anon key (expect a JSON object with `qr_enabled` and `doctors`, no names of patients):
   ```sh
   curl -s "$SUPABASE_URL/rest/v1/rpc/get_public_center" -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
     -d "{\"p_slug\": \"$(psql "$DB_URL" -Atc 'select slug from service_centers limit 1')\"}"
   ```
   and anon `issue_token` must now be refused (HTTP 401/403/404, never 200).
5. **Realtime**: Dashboard → Realtime → Settings: "Allow public access" must be ON (the TV and reception
   listen on the public `display:<key>` topic; the payload is empty). If it is off, both fall back to polling.

## Rollback
The 1B migrations only add objects, except that `issue_token` loses its anon grant and
`validate_appointment_status_transition` / `token_progress` / `protect_doctor_admin_fields` are replaced.
To undo quickly: restore those three functions from `~/queueless-backups/pre-1b/schema.sql` and
`GRANT EXECUTE ON FUNCTION public.issue_token(uuid,text,text,text) TO anon;`. The new tables and functions can
stay in place, unused.
