# Phase 2B: trial, plans, owner-doctor, doctor choice

Branch `phase-2b-plans` here and in `../mediq-web`, both from the deployed 2A heads (QueueLess `8ab052a`,
mediq-web `origin/main` `63f8f84`). Local Supabase only; nothing pushed, the remote DB not touched.

| Step | Migration / code | What |
|---|---|---|
| 2B.1 | `20261028100000_plans_v2.sql` | Catalog trial / basic / solo / pro / center (free, clinic kept hidden). New modules `display` (TV) and `fees` (fee before + desk fees). `plan_price_pkr` (12 months = 10x, Center per doctor, min 4). Every org keeps its current entitlements (+display, fees). Entitlements now follow plan changes only. |
| 2B.2 | `20261028100100_trial_lifecycle.sql` | `organizations.trial_ends_at`; new orgs start a 14-day trial; plain Free orgs move to the trial now. `org_subscriptions.lapses`. pg_cron `plan-lifecycle` daily 00:05 PKT. `get_plan_status` (banners). `admin_set_plan`: a paid-until date now lapses. |
| 2B.3 | `20261028100200_billing_claims.sql` | `platform_settings` (MediQ's accounts), `billing_claims` (TID once), `submit_billing_claim` (service role only), `admin_list_billing_claims`, `admin_resolve_billing_claim`, `get_plan_page`, `admin_list_clinics` + trial / claims |
| 2B.4 | `20261028100300_owner_doctor.sql` | `create_organization(..., p_owner_doctor)`, `add_self_as_doctor`, `doctor_invites` + `invite_doctor` / `accept_doctor_invite` / `revoke_doctor_invite` / `unlink_doctor_account`, `accept_invites` also links doctors, `get_my_workspaces` + own doctor rows |
| 2B.5 | `20261028100400_doctor_choice.sql` | `get_public_center` (initials, fee, available, branding), `service_centers.reception_assigns` + `set_center_join_settings`, unassigned QR tokens, `assign_token_doctor`, `get_token_status` 'unassigned', reception queue owner / reception only, `get_org_settings` new fields |
| web | `../mediq-web` | `/settings/plan` + `/api/plan-claim`, plan banner, `/admin` claims + MediQ accounts, onboarding owner-doctor, `/doctor` (Meri queue) + Clinic / My queue switch, doctor invites (`/api/invite-doctor`, `/invite/<token>`), per-doctor QR poster, join page doctor choice, reception "Doctor to choose" strip, TV locked on Basic |
| app | `src/features/plans`, `staff`, `doctor`, `navigation` | Plan card + "Trial X din baaki" + "Plan website par manage karein" (no link, no buy button), Clinic / Meri queue switch (replaces the doctor app's Reception tab), 2B module tables |

Also on this branch: `fix(web)` reception showed the literal text "current.phone" instead of the patient's phone
(a 2A RTL-merge slip, live in production now).

## Plans

| Plan | Price | Doctors | Tokens / day | Modules | Notes |
|---|---|---|---|---|---|
| trial | free, 14 days | 3 | unlimited | everything Pro has | automatic at signup; not for sale; one per clinic |
| basic | free | 1 | 30 | queue, qr_join | after the trial / an unpaid plan; MediQ branding on join page and TV |
| solo | Rs 2,500 / mo | 1 | unlimited | + display, fees, sms | |
| pro | Rs 4,500 / mo | 3 | unlimited | + analytics, whatsapp, online_booking | "Recommended" |
| center | Rs 1,200 / doctor / mo, min 4 | unlimited | unlimited | + multi_center | price counts active doctors when the claim is made |

Receptionists: unlimited everywhere. A year costs 10 months. SMS / WhatsApp still use prepaid credits.

## Rules the database enforces

- **Basic never deletes or locks data.** Patients, tokens, records (`get_payment_report`, today's view and
  history) stay readable. Doctors beyond the plan stay active but only the first N (by creation) take tokens.
  Without `fees` the fee mode *reads* `off` (the stored choice comes back with the module): QR joins go straight
  into the line, the desk takes no new fees, but tokens already waiting for a fee can still be paid, waived or
  their claim verified. Without `display` the TV board shows a "not in your plan" panel.
- **Lifecycle** (daily): trialing and ended → basic; active + `lapses` and ended → `past_due` (3 days, every
  feature on); past_due + 3 days → basic. Each lapse writes a billing event. Subscriptions with `lapses = false`
  (every plan that existed before 2B, and admin plans without a paid-until date) never lapse.
- **Banners** (`get_plan_status`, every member): `trial` from day 10 (5 days or less left), `renew` 5 days before
  a paid plan ends, `grace` while past due, `basic` on Basic.
- **Plan claims**: server only (`/api/plan-claim`: signed-in owner, Turnstile action `plan`, 10 per IP and 5 per
  user per 10 minutes in memory). The database checks the owner, a plan for sale, 1 or 12 months, an account
  MediQ has, one open claim per clinic, 5 claims per clinic per day, and the TID: unique while claimed or verified
  (a rejected TID can be sent again). The amount is computed in SQL. Claims are append-only.
- **Verify**: the plan is active until now + months, or current period end + months when renewing the same paid
  plan. Paying during the trial starts the paid period at once (unused trial days are not added).
- **Owner-doctor**: the owner's doctor row is created first (so a 1-doctor plan keeps it) and counts toward the
  plan's doctors. `profiles`/`doctors.profile_id` can only be set by the invite / unlink functions.
- **Doctor-only login**: own queue (`get_doctor_queue`, `call_next`, skip / no-show, break), own patients and
  payments (RLS), own income. No reception queue, no records, no settings, no plan page. A person can be a doctor
  in several clinics (one doctors row each; `pgTAP 26` covers it).
- **Doctor invites**: by email (auto-accepted at sign-in with that confirmed email) or by phone (the owner sends
  the link on WhatsApp). Links: 48 hex chars, only the sha256 stored, single use, 7 days, one pending per doctor.
- **Unassigned tokens** ("Pata nahi", only when the center has `reception_assigns`): QR only, no doctor, checked
  in, numbered per center, no fee, cannot pay online. `assign_token_doctor` (owner / reception): the doctor's next
  number and fee; fee before → `awaiting` at the desk but still checked in (keeps its place, never auto-expired).

## Behaviour changes to know before deploying

1. **Every clinic still on plain Free moves to a 14-day trial when the migration runs**, with every Pro feature.
   After 14 days without a verified payment they drop to Basic: 1 doctor taking tokens, 30 tokens a day, no TV
   board, no fee-before, no SMS. Tell them before the push, and set MediQ's accounts in `/admin` right after it
   so they can pay. Who moves:
   ```sql
   SELECT o.name FROM organizations o JOIN org_subscriptions s ON s.organization_id = o.id AND s.status <> 'cancelled'
   WHERE s.plan_id = 'free' AND NOT EXISTS (SELECT 1 FROM billing_events b WHERE b.organization_id = o.id AND b.kind = 'plan_change');
   ```
   (minus any with hand-edited entitlements, which stay.)
2. Clinics an admin put on a plan (including Free) keep it, with their current limits plus `display` and `fees`.
   Their "paid until" dates stay informational (`lapses = false`). Existing Pro clinics keep 10 doctors until
   their next plan change; new Pro is 3.
3. The TV board and fee-before are now plan features. Admin-kept Free / Clinic clinics have them (added in 2B.1).
4. `get_reception_queue` refuses doctor-only logins. The new web app sends them to `/doctor`; the RN doctor app
   never called it. An old web build would show doctors an error on `/reception`: deploy the web app right after
   the push.
5. The join page greys out doctors on break (and on leave, or with a schedule but none today) and does not let
   patients pick them. The server still accepts a join for a doctor on break (e.g. the old page, or a door poster).
6. `create_organization` has a 9th argument (`p_owner_doctor`, default NULL); the 8-argument version is dropped.
   The 2A web build calls it with named arguments and keeps working.
7. New clinics' first doctors created in onboarding share a transaction: the owner's own doctor row is placed
   1 ms earlier on purpose, so Basic keeps the owner.
8. RN app: owner-doctors get a "Clinic / Meri queue" switch instead of a Reception tab, and land on Clinic. The
   old build keeps its tab and still works.
9. The reception "Fee pending" strip now shows even with fees off, if tokens are still waiting for a fee.

## Local checks

```sh
supabase db reset && supabase test db                              # 962 pgTAP checks (23-27 are 2B: 211)
sh supabase/tests/migration/phase-2b-backfill.sh                    # Free -> trial; admin plans / hand edits kept
eval "$(supabase status -o env | grep -E '^(ANON_KEY|SERVICE_ROLE_KEY)=')"
SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY \
  node supabase/tests/api/phase-1a.mjs && supabase db reset          # 33 API checks
npx tsc --noEmit && npx jest                                        # app: 641 tests
cd ../mediq-web && npm run typecheck && npm run lint && npm run test:e2e
```

Results on this branch: see **Results** at the end.

Older suites changed with the intent, not to hide failures: seed clinics now start on the trial, so the suites
that test Free limits (12, 13, 15, 18, 20, phase-1a) put their clinic on Basic, 22 on Solo; 16 / 19 expect a
doctor to be refused the reception queue; 01 lists the new RPCs; 20 counts five cron jobs.

## Production runbook

**Order:** backup → dry run → push → checks → deploy web → set MediQ's accounts in `/admin` → smoke test →
new app build.

1. **Backup** (outside the repo):
   ```sh
   mkdir -p ~/queueless-backups/pre-2b
   supabase db dump --linked -f ~/queueless-backups/pre-2b/schema.sql
   supabase db dump --linked --role-only -f ~/queueless-backups/pre-2b/roles.sql
   supabase db dump --linked --data-only --use-copy -f ~/queueless-backups/pre-2b/data.sql
   ```
   Save the list from "Behaviour changes" 1 (who moves to the trial).
2. **Dry run**: `supabase db push --linked --dry-run` must list exactly these five, in order:
   `20261028100000_plans_v2.sql`, `20261028100100_trial_lifecycle.sql`, `20261028100200_billing_claims.sql`,
   `20261028100300_owner_doctor.sql`, `20261028100400_doctor_choice.sql`. Anything else: stop.
3. **Push**: `supabase db push --linked`.
4. **Checks** (SQL editor, read-only). Every row must be `true`:
   ```sql
   SELECT 'catalog' AS check, (SELECT array_agg(id ORDER BY sort_order) FROM plans WHERE is_public) = ARRAY['basic','solo','pro','center'] AS ok
   UNION ALL SELECT 'every org has a live subscription',
     NOT EXISTS (SELECT 1 FROM organizations o WHERE NOT EXISTS (SELECT 1 FROM org_subscriptions s WHERE s.organization_id = o.id AND s.status <> 'cancelled'))
   UNION ALL SELECT 'old plans never lapse',
     NOT EXISTS (SELECT 1 FROM org_subscriptions WHERE status <> 'cancelled' AND lapses AND plan_id <> 'trial')
   UNION ALL SELECT 'trials have an end', NOT EXISTS (SELECT 1 FROM org_subscriptions WHERE status = 'trialing' AND current_period_end IS NULL)
   UNION ALL SELECT 'kept orgs have display + fees',
     NOT EXISTS (SELECT 1 FROM org_entitlements WHERE plan_id NOT IN ('trial','basic','solo') AND NOT modules @> ARRAY['display','fees'])
   UNION ALL SELECT 'RLS on new tables', (SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN
     ('public.platform_settings'::regclass, 'public.billing_claims'::regclass, 'public.doctor_invites'::regclass))
   UNION ALL SELECT 'claims are server only',
     NOT has_function_privilege('authenticated', 'public.submit_billing_claim(uuid,uuid,text,integer,text,text)', 'execute')
     AND NOT has_function_privilege('anon', 'public.submit_billing_claim(uuid,uuid,text,integer,text,text)', 'execute')
   UNION ALL SELECT 'no client writes to claims', NOT has_table_privilege('authenticated', 'public.billing_claims', 'insert')
     AND NOT has_table_privilege('authenticated', 'public.billing_claims', 'update')
   UNION ALL SELECT 'invite hashes not readable', NOT has_column_privilege('authenticated', 'public.doctor_invites', 'token_hash', 'select')
   UNION ALL SELECT 'five cron jobs', (SELECT count(*) = 5 FROM cron.job WHERE jobname IN
     ('send-notifications','cleanup-stale-appointments','prune-notification-outbox','expire-unpaid-tokens','plan-lifecycle'))
   UNION ALL SELECT 'anon still reads join + token status', has_function_privilege('anon', 'public.get_public_center(text)', 'execute')
     AND has_function_privilege('anon', 'public.get_token_status(text)', 'execute');
   ```
   Then: `SELECT plan_id, status, lapses, count(*) FROM org_subscriptions WHERE status <> 'cancelled' GROUP BY 1,2,3;`
   should match the list saved in step 1 (those on `trial / trialing / true`, the rest unchanged with `false`).
5. **Web**: merge / deploy `mediq-web` `phase-2b-plans`. No new env vars (`/api/plan-claim` uses the existing
   `SUPABASE_SERVICE_ROLE_KEY` and Turnstile keys; the widget uses action `plan`).
6. **MediQ's accounts**: `/admin` → "MediQ payment accounts" (Easypaisa / JazzCash / bank / Raast). Until then
   `/settings/plan` says the accounts aren't set up.
7. **Smoke test** with your own clinic: `/settings/plan` shows four plans and your prices → send a test TID for
   Solo, 1 month → `/admin` "Plan payments to check" → Verify → the plan page says Solo, paid until next month.
   Put the clinic back with `admin_set_plan` (no date) afterwards. Then the next morning (or
   `SELECT private.run_plan_lifecycle();` by hand once): `SELECT * FROM cron.job_run_details WHERE command LIKE
   '%run_plan_lifecycle%' ORDER BY start_time DESC LIMIT 3;` shows `succeeded`.
8. **App**: ship the new build (plan card, banner, mode switch). Store listing: no in-app purchase; plans are
   managed on the website.

## Rollback

New tables and functions can stay. To stop lapses at once: `SELECT cron.unschedule('plan-lifecycle');` and, for
clinics already moved to Basic by mistake, `admin_set_plan(org, 'trial')` (a new 14-day trial) or the plan they had.
To give every module back to an org: `admin_set_plan(org, 'pro')` (no date: never lapses). To restore the 2A
functions (`get_public_center`, `get_reception_queue`, `get_token_status`, `get_org_settings`,
`submit_payment_claim`, `issue_public_token`, `private.issue_token_core` (6 args), `create_organization` (8 args),
`accept_invites`, `get_my_workspaces`, `private.center_fee_settings`, `private.lock_payable_appointment`,
`get_display_snapshot`, `admin_set_plan`, `admin_list_clinics`), take them from
`~/queueless-backups/pre-2b/schema.sql` (drop the 2B signatures first) and redeploy the 2A web app.
`billing_claims` and `billing_events` are records of money received: export them before any cleanup.

## Known limits

- Phone invites can't be verified by the phone number (neither app has phone OTP sign-in for staff). The link is
  the secret: whoever opens it first gets the seat. It expires in 7 days and can be revoked.
- The RN app picks one doctor row (oldest active) for a doctor who works in several clinics; the web lets them
  pick the clinic. The app is English-only, so its banner text is the roman Urdu from the brief.
- "Not in today" uses `doctor_schedules`: a doctor with no schedule rows counts as in. Clinics set up from the web
  have none.
- `/api/plan-claim` and `/api/pay-claim` rate limits are per server instance; the database limits are the hard ones.
- `billingLine` on Settings > Plan names trial / basic changes by id (they aren't public plans).

## Screenshots (`../mediq-web/e2e/screenshots/plans-2b/`, written by `e2e/plans-2b.spec.ts`)

| File | Shows |
|---|---|
| `01-onboarding-owner-doctor-en-1440` | "Are you a doctor here yourself?" → Yes, own specialty and fee, a second doctor |
| `02-trial-banner-en-1440`, `03-…-ur-1440` | "Trial: 4 days left" / "ٹرائل کے 4 دن باقی" with "Choose a plan" |
| `04-my-queue-en-1440` | Meri queue with the Clinic / My queue switch |
| `05-join-choice-ur-390` | QR page: doctors by specialty, initials, fee, waiting |
| `06-join-one-available-ur-390` | One doctor available: no choice |
| `07-join-greyed-ur-390` | A third doctor on break, greyed out |
| `08-poster-doctor-1440` | Door poster with the doctor and `?d=` link |
| `09-door-token-ur-390` | Token from the door poster |
| `10-status-unassigned-ur-390` | "Reception will choose your doctor" |
| `11-reception-unassigned-en-1440` | "Doctor to choose" strip |
| `12-plan-page-en-1440`, `13-plan-claim-open-en-1440` | Plans, Pro 12 months Rs 45,000, MediQ's account, TID; claim being checked |
| `14-admin-claims-1440` | Admin: plan payments to check |
| `15-plan-page-pro-ur-1440` | After Verify: Pro, Urdu |
| `layout-<page>-<ur|en>-<390|1440>` | plan, my-queue, settings-doctors, join-choice, join-door |

## Results

Run on 2026-10-28 against the local stack (each suite after a fresh `supabase db reset`):

| Check | Result |
|---|---|
| pgTAP (`supabase test db`) | 962 / 962 (27 files; 2B suites 23-27: 211) |
| 2B backfill script | ok (plain Free → trial; admin Free, hand-edited Free and Pro with 10 doctors kept) |
| API checks (`phase-1a.mjs`) | 33 / 33 |
| App `tsc --noEmit` / `jest` | clean / 641 / 641 (19 suites; `plans2b.test.ts` new) |
| App lint, changed files | clean. Repo-wide `eslint` has the same 65 errors as on 2A (none in 2B files) |
| Web `typecheck` / `lint` | clean / clean (Playwright's generated `playwright-report/` is now ignored) |
| Playwright | 57 / 57: clinic-flow 9, payments 7, plans-billing 2, plans-2b 7, rtl 32 |
| RTL audit | `plans-2b` layout test: plan, my-queue, settings-doctors, join-choice, join-door × ur/en × 390/1440 with 0 problems; `rtl.spec` 0 problems |

Found and fixed by the Playwright run (not visible to pgTAP): `admin_set_platform_accounts` needed a WHERE
(`pg_safeupdate` is on for API requests); `/invite/[token]` had to read its params inside Suspense for the
production build.

Local note: the e2e specs that need "day 10" move the trial end with `docker exec supabase_db_QueueLess psql`
(no client or service role may write subscriptions); set `DB_CONTAINER` if your container is named differently.
