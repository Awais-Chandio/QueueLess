# Phase 1C–1E: doctor/staff app, notifications, plans + manual billing

Branch `phase-1c-1e` (from `phase-1b-db`) here, and `phase-1c-1e` in `../mediq-web`.

| Step | Migration / code | What |
|---|---|---|
| 1C | `20261022100000_doctor_app.sql` | `doctors.late_until` + `set_doctor_late` (TV, join page, reception, status page, ETA), `get_doctor_queue`, `complete_visit` (notes for guests too), doctor's day in clinic time |
| 1C | app | Org-membership roles, reception screen, doctor queue, marketplace flag, refactor, theme tokens + system dark mode, iOS Firebase guard |
| 1D | `20261022110000_notification_outbox.sql` | Outbox + deferred triggers, worker RPCs (charge once, retry, refund), `set_token_language` |
| 1D | `20261022110100_cron_jobs.sql` | pg_cron: worker kick every minute, nightly cleanup (fixed) and outbox pruning |
| 1D | `20261022110200_pg_net_schema.sql` | pg_net moved to `extensions` (left in `public` with a warning if refused) |
| 1D | `supabase/functions/send-notifications` | Generic HTTP SMS + WhatsApp Cloud API, Urdu/English templates |
| 1E | `20261022120000_plans_billing.sql` | `require_module` on module RPCs, `get_clinic_insights`, `billing_events` + `admin_*` RPCs, owner message settings |
| 1E | web | `/admin`, Settings → Messages / Insights / Plan, Free limit notice |

**Behaviour change:** app slot booking (`lock_slot`, `book_appointment`) now needs the `online_booking` module.
Old app builds can't book at Free clinics (the new build hides booking).

## Local checks
```sh
supabase db reset && supabase test db                                   # 653 pgTAP checks
eval "$(supabase status -o env | grep -E '^(ANON_KEY|SERVICE_ROLE_KEY)=')"
SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY \
  node supabase/tests/api/phase-1a.mjs && supabase db reset               # 32 API checks
npx tsc --noEmit && npx tsc -p supabase/functions && npx jest            # app + Edge Function unit tests
cd ../mediq-web && npm run typecheck && npm run lint && npm run test:e2e && cd ../QueueLess && supabase db reset
```
Edge Function end to end: `supabase functions serve send-notifications --env-file <env> --no-verify-jwt`, Vault
secrets `notifications_worker_url` = `http://supabase_kong_QueueLess:8000/functions/v1/send-notifications` and
`notifications_worker_secret`, a clinic on the Clinic plan with credits, then issue a token with a phone number.

## Production runbook

**Order:** backup → push database → deploy web → deploy Edge Function + secrets → Vault secrets (turns sending on)
→ new app builds.

1. **Backup** (outside the repo):
   ```sh
   mkdir -p ~/queueless-backups/pre-1c
   supabase db dump --linked -f ~/queueless-backups/pre-1c/schema.sql
   supabase db dump --linked --role-only -f ~/queueless-backups/pre-1c/roles.sql
   supabase db dump --linked --data-only --use-copy -f ~/queueless-backups/pre-1c/data.sql
   ```
2. **Dry run**: `supabase db push --linked --dry-run` must list exactly these five, in order:
   `20261022100000_doctor_app.sql`, `20261022110000_notification_outbox.sql`, `20261022110100_cron_jobs.sql`,
   `20261022110200_pg_net_schema.sql`, `20261022120000_plans_billing.sql`. Anything else: stop.
3. **Push**: `supabase db push --linked`. A `WARNING: pg_net left in schema public` line is acceptable.
4. **Web**: merge / deploy `mediq-web` `phase-1c-1e` on Vercel straight after the push.
5. **Checks** (SQL editor, read-only). Every row must be `true` (the pg_net row may be `false`, see 3):
   ```sql
   SELECT 'doctor late column' AS check, EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'doctors' AND column_name = 'late_until') AS ok
   UNION ALL SELECT 'three cron jobs', (SELECT count(*) = 3 FROM cron.job WHERE jobname IN ('send-notifications', 'cleanup-stale-appointments', 'prune-notification-outbox'))
   UNION ALL SELECT 'pg_net not in public', NOT EXISTS (SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pg_net' AND n.nspname = 'public')
   UNION ALL SELECT 'RLS on new tables', (SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('public.notification_outbox'::regclass, 'public.billing_events'::regclass))
   UNION ALL SELECT 'worker RPCs are server only',
     NOT has_function_privilege('authenticated', 'public.claim_notifications(integer,integer)', 'execute')
     AND NOT has_function_privilege('authenticated', 'public.begin_notification_send(uuid,text,integer)', 'execute')
     AND has_function_privilege('service_role', 'public.finish_notification_send(uuid,boolean,text,text,boolean)', 'execute')
   UNION ALL SELECT 'anon has no new RPCs',
     NOT has_function_privilege('anon', 'public.get_doctor_queue(uuid)', 'execute')
     AND NOT has_function_privilege('anon', 'public.admin_list_clinics()', 'execute')
     AND NOT has_function_privilege('anon', 'public.set_token_language(text,text)', 'execute')
   UNION ALL SELECT 'cleanup returns counts', pg_get_function_result('public.cleanup_stale_appointments()'::regprocedure) = 'jsonb'
   UNION ALL SELECT 'outbox triggers', (SELECT count(*) = 3 FROM pg_trigger WHERE tgname IN ('appointments_notify_issued', 'appointments_notify_queue', 'doctors_notify_status'))
   UNION ALL SELECT 'every clinic has entitlements', NOT EXISTS (SELECT 1 FROM public.organizations o WHERE NOT EXISTS (SELECT 1 FROM public.org_entitlements e WHERE e.organization_id = o.id));
   ```
6. **Edge Function and secrets** (keep `SECRET` for step 7):
   ```sh
   SECRET=$(openssl rand -hex 32)
   supabase functions deploy send-notifications --no-verify-jwt --project-ref latdblyyakjrwzgxdean
   supabase secrets set --project-ref latdblyyakjrwzgxdean \
     NOTIFY_WORKER_SECRET="$SECRET" PUBLIC_SITE_URL="https://app.mediq.pk" \
     SMS_HTTP_URL="https://<gateway>/send" SMS_HTTP_HEADERS='{"Authorization":"Bearer <api key>"}' \
     SMS_SENDER="MediQ" SMS_HTTP_ID_FIELD="<id path, e.g. data.id>" \
     NOTIFY_CHANNEL_ORDER="sms"
   # Gateway shape: SMS_HTTP_BODY (default {"to":"{{to}}","message":"{{text}}","sender":"{{sender}}"}),
   # SMS_HTTP_CONTENT_TYPE, SMS_HTTP_METHOD, SMS_PHONE_FORMAT (international|e164|local), SMS_HTTP_OK_REGEX.
   # WhatsApp, once templates are approved: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, then NOTIFY_CHANNEL_ORDER="whatsapp,sms".
   curl -s -X POST "https://latdblyyakjrwzgxdean.supabase.co/functions/v1/send-notifications" -H "x-worker-secret: $SECRET"
   # -> {"ok":true,"providers":["sms"],"claimed":0,...}
   ```
7. **Turn sending on** (SQL editor; same secret):
   ```sql
   SELECT vault.create_secret('https://latdblyyakjrwzgxdean.supabase.co/functions/v1/send-notifications', 'notifications_worker_url');
   SELECT vault.create_secret('<SECRET from step 6>', 'notifications_worker_secret');
   ```
   Then: platform admin → `/admin` → put the pilot clinic on Clinic, add credits; issue a walk-in with your own
   phone. Within a minute: `SELECT event, status, last_error FROM notification_outbox ORDER BY created_at DESC LIMIT 5;`
   and `SELECT status, return_message FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;`
8. **Platform admin account** (if not yet): `UPDATE profiles SET role = 'admin' WHERE id = (SELECT id FROM auth.users WHERE email = '<you>');`
   Prices shown to owners: `UPDATE plans SET monthly_price_pkr = <n> WHERE id = 'clinic';` (same for pro / center).

## WhatsApp templates (Meta → WhatsApp Manager → Message templates)
Category **Utility**, names `mediq_<event>`, one per language (`ur`, `en`). Body parameters in this order
(`_shared/notify/templates.ts`). Meta rejects a body that starts or ends with a variable, so keep fixed text around them:

| Template | Parameters | English body |
|---|---|---|
| `mediq_token_issued` | clinic, token, doctor, ahead, link | `MediQ: {{1}} — your token is {{2}} for {{3}}. People ahead of you: {{4}}. Track your turn: {{5}} . Thank you.` |
| `mediq_three_ahead` | clinic, token, room | `MediQ: {{1}} — token {{2}}, only 3 people are ahead of you. Please come near {{3}}.` |
| `mediq_your_turn` | clinic, token, doctor, room | `MediQ: {{1}} — it's your turn! Token {{2}}, please go to {{3}} ({{4}}) now.` |
| `mediq_doctor_late` | clinic, doctor, time, token, link | `MediQ: {{1}} — {{2}} is running late, expected around {{3}}. Your place (token {{4}}) is kept: {{5}} . Thank you.` |
| `mediq_doctor_break` | clinic, doctor, token, link | `MediQ: {{1}} — {{2}} is on a short break. Your place (token {{3}}) is kept: {{4}} . Thank you.` |

Urdu bodies: the texts in `templates.ts` with the same parameters, prefixed `MediQ:` and ending `شکریہ۔`.

## Rollback
New objects can stay unused. To stop sending: `SELECT cron.unschedule('send-notifications');` (or delete the Vault
secrets). To restore the 1B queue functions, take `call_next`, `set_doctor_break`, `get_reception_queue`,
`get_display_snapshot`, `get_public_center`, `get_token_status`, `lock_slot`, `book_appointment`, `get_org_settings`
and `cleanup_stale_appointments` from `~/queueless-backups/pre-1c/schema.sql` (drop `get_token_status` and
`cleanup_stale_appointments` first: their return types changed), and redeploy the 1B web app.
