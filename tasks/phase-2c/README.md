# Phase 2C: daily work on the phone, heavy work on the web

Branch `phase-2c-mobile` here and in `../mediq-web`, both on top of `phase-2b-plans` (2B is built, not deployed: deploy
2B first, then 2C). Rebased onto the 2B changes of 2026-10-28 (Basic 10 tokens, Help button, "Plan" in the owner's nav). Local Supabase only; nothing pushed, the remote DB not touched.

| Step | Migration / code | What |
|---|---|---|
| 2C.1 | `20261028120000_walk_in_fees.sql` | `issue_token(..., 'walk_in')` goes through `issue_walk_in` with the fee not received: no walk-in skips the fee any more (old app builds included) |
| 2C.3 | `20261028120100_staff_push.sql` | `push_outbox`; triggers: online claim → owners + the center's receptionists, fee settled and waiting → the doctor; `claim_push` / `finish_push` / `forget_device_tokens` (service role); any `visit_payments` change nudges the center's realtime channel; the minute job (`kick_notification_worker`) and the nightly prune also cover pushes |
| 2C.3 | `supabase/functions/_shared/push/`, `send-notifications` | FCM HTTP v1 sender (service-account JWT, WebCrypto) and the push worker; `send-notifications` drains the push outbox after the SMS one |
| 2C.1 | app `src/features/staff` | Walk-in with fee in one step (`issue_walk_in`: amount = doctor fee, Cash, "Fee received" on); "Fee pending" for the whole center (claims first) → fee sheet (methods, Free + reason, Paid); claims show method + TID with Verify / Reject (+ reason); call next / skip / no-show / break per doctor as before; realtime via the center channel |
| 2C.2 | app `OwnerHomeScreen`, `StaffNavigator` | Owners land on **Today**: patients, total Rs, cash, online, free (`get_payment_report`, today) and cash per receptionist; "N online payments to check" → Reception tab; Help (2B) in the header; **"Detailed report web pe dekhein"** opens `/hisaab?center=<id>&from=app` in the browser. Receptionists keep the desk only |
| 2C.3 | app `useStaffPush`, `useNotifications`, `useAuth` | Desk and doctor app ask for notification permission (Android 13+ `POST_NOTIFICATIONS`) and save the FCM token; staff pushes never open the patient screen; sign-out removes this phone's token |
| 2C.4 | `../mediq-web` | PWA: `app/manifest.ts` (standalone, theme `#0E7C86`, start `/reception`, 192/512 + maskable icons from the brand master), `apple-icon.png`, `public/sw.js` + `public/offline.html` (Urdu / English), `PwaRegister` (production only), `/sw.js` never cached. `?center=` picks that clinic, `?from=app` hides plan links in that tab (the 2B "Plan" nav item too). Fee strip: names keep their own direction (an English name in Urdu was cut at the wrong end) |
| 2C.5 | tests | pgTAP `28_staff_push` (34), app `reception2c.test.tsx` (31), `push.test.ts` (14), Playwright `e2e/pwa-2c.spec.ts` (9), Maestro `.maestro/reception-walkin-cash.yaml` |

## Rules

- **Walk-ins**: the app and the web desk both call `issue_walk_in`. Fee before + a doctor fee: the token and the
  payment in one transaction, or (switch off) an awaiting token in "Fee pending". Fee after / off, or a doctor
  without a fee: a plain walk-in. `issue_token` with `walk_in` now does the same with "fee not received".
- **Fee sheet / claims**: same RPCs and rules as the web (`record_payment`, `waive_fee` with a reason,
  `verify_claim` accept / reject with a reason). The sheet follows the live queue: paid elsewhere, it closes.
- **Owner Today**: the selected center's clinic-local day. Ranges, CSV and refunds stay on the web. The app links
  to records only, never to a plan or payment page (Google Play); the web hides its plan banner link, "Upgrade"
  buttons and the Settings plan button for the rest of a tab opened with `from=app`.
- **Pushes** (only to people with the app installed and signed in, i.e. a `device_tokens` row):
  - `fee_claim`: "Online payment to check" / "Token 7 · Sana Bibi · Easypaisa Rs 1,000 · TID EP77881234" to every
    owner of the clinic and the receptionists assigned to that center.
  - `paid_waiting`: "Token 7 is waiting" / "Sana Bibi · Fee paid Rs 1,000" (or "Free visit") to the token's doctor,
    when the fee is settled (paid or free; online verify, fee sheet, or a walk-in with its fee) and the token is in
    the line. Not when the doctor settled it themselves (an owner-doctor at the desk). On Android a doctor's
    "waiting" pushes replace each other (one tag per doctor); each claim stays on its own.
  - Not sent if no longer relevant when the worker runs (claim handled, token left the line), or older than 30
    minutes. Retried 3 times (15s, 30s, 1m) on FCM errors that can pass; gone devices are deleted.
  - Pushes are queued at commit and the worker is kicked at once (pg_net); the minute job is the fallback.
- **PWA**: the service worker caches only `/offline.html` and its logo. Pages, queue data, fees and records always
  come from the network; a page that can't load shows the offline page, which reloads itself when the
  connection returns.

## Behaviour changes to know before deploying

1. **Old app builds at fee-before clinics**: their walk-ins for a doctor with a fee now wait in "Fee pending"
   instead of going straight into the line with no fee recorded. The desk takes the fee on the web or the new app.
   Who can be affected (fee before is only the default for clinics created after 2A):
   ```sql
   SELECT c.name, count(*) AS doctors_with_fee FROM center_payment_settings s
   JOIN service_centers c ON c.id = s.center_id JOIN doctors d ON d.center_id = c.id AND d.is_active AND COALESCE(d.fee, 0) > 0
   WHERE s.fee_mode = 'before' GROUP BY 1;
   ```
2. Doctors with the app get a push for **every** token whose fee is settled, including cash walk-ins. Owners and
   receptionists get one per online claim.
3. Staff apps ask for notification permission when the desk / doctor app opens (once; Android 13+ shows the
   system prompt).
4. Owners open on **Today**, with Reception as the second tab. Receptionists see no change in navigation.
5. Claims, verifies and rejects now nudge the realtime channel: reception screens, the TV and token pages refresh
   at once (more broadcasts than before, one per payment change).
6. **Deploy the `send-notifications` function together with the migration.** The old function doesn't drain
   `push_outbox`; pending rows would make the minute job call it every minute (harmless, but useless) until it is
   deployed.
7. The service worker registers for every visitor of the web app (`scope: /`), patients' `/c` and `/t` pages
   included. It only adds the offline page; it caches nothing else.
8. `create_organization`, `get_reception_queue` and the other 2B signatures are unchanged.

## Local checks

```sh
supabase db reset && supabase test db                              # 1003 pgTAP checks (28_staff_push: 34)
sh supabase/tests/migration/phase-2b-backfill.sh                    # still ok
eval "$(supabase status -o env | grep -E '^(ANON_KEY|SERVICE_ROLE_KEY)=')"
SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY \
  node supabase/tests/api/phase-1a.mjs && supabase db reset          # 33 API checks
npx tsc --noEmit && npx tsc -p supabase/functions && npx jest       # app + functions: 711 tests
cd ../mediq-web && npm run typecheck && npm run lint
npx next build && npx next start -p 3100 &                          # then each spec in the foreground:
npx playwright test e2e/pwa-2c.spec.ts                               # (and clinic-flow, payments, plans-*, rtl)
```

Older suites changed with the intent: 16, 17, 19 and 20 run with `fee_mode = 'after'` (like 10, 11, 15 since 2A),
because their walk-ins (`issue_token`) at seed center A (fee before, Dr. A Rs 1,000) now wait for the fee.

**Push worker by hand** (no FCM secrets locally, so rows end `failed`, "FCM is not configured"):
```sh
printf 'NOTIFY_WORKER_SECRET=local-test-secret\n' > /tmp/fn.env
supabase functions serve send-notifications --no-verify-jwt --env-file /tmp/fn.env &
# make a claim (see 28_staff_push), then:
curl -s -X POST http://127.0.0.1:54321/functions/v1/send-notifications -H 'x-worker-secret: local-test-secret' -d '{}'
```

**Maestro smoke flow** (receptionist: walk-in with cash → call next):
```sh
supabase db reset && sh .maestro/setup.sh          # center A: fee before, Dr. A Rs 1,000, empty queue
# .env (local only, don't commit): SUPABASE_URL=http://10.0.2.2:54321, SUPABASE_ANON_KEY=<local anon key>
npx react-native run-android && maestro test .maestro/reception-walkin-cash.yaml
```

## Production runbook

**Order:** 2B deployed → backup → dry run → push → checks → deploy `send-notifications` → FCM secrets → deploy
web → smoke test → new app build.

1. **Backup** (outside the repo):
   ```sh
   mkdir -p ~/queueless-backups/pre-2c
   supabase db dump --linked -f ~/queueless-backups/pre-2c/schema.sql
   supabase db dump --linked --data-only --use-copy -f ~/queueless-backups/pre-2c/data.sql
   ```
   Save the list from "Behaviour changes" 1.
2. **Dry run**: `supabase db push --linked --dry-run` must list exactly `20261028120000_walk_in_fees.sql` and
   `20261028120100_staff_push.sql`. Anything else (e.g. 2B not pushed yet): stop.
3. **Push**: `supabase db push --linked`.
4. **Checks** (SQL editor, read-only). Every row must be `true`:
   ```sql
   SELECT 'RLS on push_outbox' AS check, (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.push_outbox'::regclass) AS ok
   UNION ALL SELECT 'no client access to push_outbox',
     NOT has_table_privilege('authenticated', 'public.push_outbox', 'select') AND NOT has_table_privilege('anon', 'public.push_outbox', 'select')
   UNION ALL SELECT 'worker RPCs server only',
     NOT has_function_privilege('authenticated', 'public.claim_push(integer,integer)', 'execute')
     AND NOT has_function_privilege('authenticated', 'public.finish_push(uuid,boolean,text,boolean)', 'execute')
     AND NOT has_function_privilege('authenticated', 'public.forget_device_tokens(text[])', 'execute')
     AND has_function_privilege('service_role', 'public.claim_push(integer,integer)', 'execute')
   UNION ALL SELECT 'push triggers', (SELECT count(*) = 4 FROM pg_trigger WHERE tgname IN
     ('visit_payments_push_claim', 'appointments_push_paid', 'visit_payments_nudge_displays_insert', 'visit_payments_nudge_displays_update'))
   UNION ALL SELECT 'walk-ins go through issue_walk_in',
     (SELECT prosrc LIKE '%issue_walk_in%' FROM pg_proc WHERE oid = 'public.issue_token(uuid,text,text,text)'::regprocedure)
   UNION ALL SELECT 'staff still issue tokens', has_function_privilege('authenticated', 'public.issue_token(uuid,text,text,text)', 'execute')
     AND has_function_privilege('authenticated', 'public.issue_walk_in(uuid,text,text,boolean,integer,text,text)', 'execute')
   UNION ALL SELECT 'five cron jobs, unchanged', (SELECT count(*) = 5 FROM cron.job WHERE jobname IN
     ('send-notifications','cleanup-stale-appointments','prune-notification-outbox','expire-unpaid-tokens','plan-lifecycle'));
   ```
5. **Function**: `supabase functions deploy send-notifications --no-verify-jwt --project-ref latdblyyakjrwzgxdean` (as in 1D). The checks above all return `true` on the local stack.
6. **FCM secrets** (project-wide; `send-queue-notification` already reads them):
   `supabase secrets list --linked` must show `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.
   If not: a Firebase service account with the Firebase Cloud Messaging API, then
   `supabase secrets set --linked FIREBASE_PROJECT_ID=... FIREBASE_CLIENT_EMAIL=... FIREBASE_PRIVATE_KEY="$(cat key.pem)"`.
   Without them pushes are marked `failed` ("FCM is not configured"); nothing else breaks.
7. **Web**: merge / deploy `mediq-web` `phase-2c-mobile`. No new env vars. After deploy:
   `curl -sI https://<web>/sw.js | grep -i cache-control` → `no-cache…`; `https://<web>/manifest.webmanifest` loads;
   Chrome DevTools → Application → Manifest shows no errors.
8. **Smoke test** with your own clinic and a test doctor (fee > 0, fee before), a phone with the new app signed in
   as the owner and one as the doctor:
   - App, Reception → Walk-in → name → Issue: "Token N issued · Rs X Cash", straight into the line; the doctor's
     phone gets "Token N is waiting".
   - QR join on another phone → pay online with a test TID → the owner's phone gets "Online payment to check"
     within seconds → app "Fee pending" shows method + TID → Verify.
   - Today: the cards and "Cash per receptionist" match the web Records; "Detailed report web pe dekhein" opens
     Records for the same clinic with no plan links.
   - Refund the test payments from the web Records to keep the totals clean.
   - `SELECT kind, status, last_error, count(*) FROM push_outbox GROUP BY 1,2,3;` → `sent` (or `skipped` for
     handled claims).
   - Phone browser → `/reception` → "Add to Home screen" → opens standalone; airplane mode → the offline page.
9. **App**: set `WEB_APP_URL` in `.env` for the release build if the web app isn't at `https://app.mediq.pk`
   (the default), then ship the build. Store listing: still no in-app purchase.

## Rollback

- **Pushes off at once**: `ALTER TABLE public.visit_payments DISABLE TRIGGER visit_payments_push_claim;`
  `ALTER TABLE public.appointments DISABLE TRIGGER appointments_push_paid;` then
  `UPDATE public.push_outbox SET status = 'skipped', last_error = 'rollback' WHERE status IN ('pending','sending');`
  (`pg_safeupdate` only applies to API requests; the SQL editor is fine).
- **Old-build walk-ins straight into the line again**: restore the 2A body of `issue_token`
  (`SELECT * FROM private.issue_token_core(p_doctor_id, p_name, p_phone, p_source, false, NULL);`, `LANGUAGE sql`)
  from `~/queueless-backups/pre-2c/schema.sql`. The new app doesn't use it.
- `kick_notification_worker` / `prune_notification_outbox` with push support are harmless to keep. The realtime
  nudge triggers on `visit_payments` can stay.
- Web: redeploy the 2B build. Browsers that installed the worker keep it until they next load `/sw.js`; to remove
  it, deploy a `public/sw.js` that calls `self.registration.unregister()` on activate (never delete the file
  outright while workers are installed).

## Known limits

- No real FCM send was made here (no Firebase credentials locally): the sender is covered by unit tests (JWT
  verified with the public key, request body, error handling) and the worker by the local function run above.
- iOS: push needs the APNs key in Firebase and a build with `GoogleService-Info.plist` (builds without it have no
  push, as before). Push texts are English, like the app.
- Owner Today covers one center at a time (the center picker switches); owners of several clinics see each one.
- "Fee pending" in the app does not yet show the "Doctor to choose" (unassigned QR) strip; reception assigns
  those on the web.
- `from=app` hiding is per browser tab; the web site itself is not the app and keeps its plan pages.
- The PWA has no offline data (by design: a stale queue is worse than none). iOS installs only through Share →
  Add to Home Screen.
- The Maestro flow was written and its setup script run, but the flow itself was not run here (no Maestro
  install; it needs a debug build pointed at the local stack).

## Screenshots (`../mediq-web/e2e/screenshots/pwa-2c/`, written by `e2e/pwa-2c.spec.ts`)

| File | Shows |
|---|---|
| `01-offline-en-390`, `02-offline-ur-390` | Offline page, English first / Urdu first, logo from the worker's cache |
| `03-reception-<en|ur>-390` | Reception at 390: fee pending (claim with TID, Verify / Reject; unpaid walk-in), walk-in form with fee, now serving, line |
| `04-fee-sheet-<en|ur>-390` | Fee sheet with Free + reasons open |
| `05-records-<en|ur>-390` | Records (Hisaab) today at 390 |
| `06-records-from-app-en-390` | Opened from the app: the app's clinic, "This week" locked, no plan link |

## Results

Run on 2026-10-28 against the local stack (each suite after a fresh `supabase db reset`), again after the rebase onto
the 2B changes:

| Check | Result |
|---|---|
| pgTAP (`supabase test db`) | 1003 / 1003 (28 files; `28_staff_push`: 34) |
| 2B backfill script | ok |
| API checks (`phase-1a.mjs`) | 33 / 33 |
| App `tsc --noEmit` / functions `tsc -p supabase/functions` / `jest` | clean / clean / 711 / 711 (22 suites; `reception2c.test.tsx` 31 and `push.test.ts` 14 new) |
| App lint, changed files | 0 errors (the only warnings are in files 2C didn't touch). Repo-wide: the same 65 errors as 2B, plus 3 in the untracked `marketing/` folder |
| `send-notifications` served locally | claim → `push_outbox` row with the right text → worker claims it → `failed: FCM is not configured` |
| Web `typecheck` / `lint` | clean / clean |
| Playwright | 66 / 66: clinic-flow 9, payments 7, plans-billing 2, plans-2b 7, rtl 32, pwa-2c 9 |
| PWA | Chrome `Page.getAppManifest` and `Page.getInstallabilityErrors`: none; icons are real 192 / 512 / 180 px PNGs |
| 390px, Urdu + English | reception, fee sheet (Free open), Records, offline page: no sideways scroll, no cut-off text |
| Maestro | written + setup script run; flow not run (see Known limits) |

Found and fixed by the screenshots (the layout audit doesn't catch them): the offline page's logo didn't load
offline (the worker only answered navigations), and an English patient name in the Urdu fee strip was cut at its
start ("…ab Fatima Khan").
