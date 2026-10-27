# Phase 2A: QR fee + payment records

Branch `phase-2a-payments` here and in `../mediq-web` (there it starts from `fix/rtl`, which only adds the
uncommitted RTL work: `notranslate` on `<html>` and `e2e/rtl.spec.ts`).

"Manual online" payments, no gateway: the patient pays the clinic's own Easypaisa / JazzCash / bank / Raast
account, types the transaction ID (TID) on the token page, and reception verifies it with one tap.

| Step | Migration / code | What |
|---|---|---|
| 2A.1 | `20261027100000_fee_settings.sql` | `center_payment_settings` (fee mode `before`/`after`/`off`, default `before`; unpaid expiry 10-120 min, default 30; payment accounts), `set_center_fee_settings` (owner), `upsert_doctor(..., p_fee)`, fees in `get_org_settings` |
| 2A.2 | `20261027100100_visit_payments.sql` | `visit_payments` (append-only: no deletes; only claimed -> paid/rejected), `appointments.payment_status` / `fee_pkr`, RLS |
| 2A.3 | `20261027100200_fee_queue.sql` | Fee before: QR / online joins wait outside the line (`payment_status = 'awaiting'`); line order = check-in / payment time; `issue_walk_in` (token + payment in one transaction); pg_cron `expire-unpaid-tokens` every minute |
| 2A.4 | `20261027100300_payment_rpcs.sql` | `submit_payment_claim` (service role only), `record_payment`, `verify_claim`, `waive_fee`, `refund_payment` (owner) |
| 2A.5 | `20261027100400_payment_reports.sql` | `get_payment_report`, `get_doctor_income_summary` from real payments (clinic's day), `get_token_status` + fee fields |
| web | `../mediq-web` | Settings → Fees + doctor fee, reception fee strip / fee sheet / one-step walk-in / badges, `/t/[code]` pay panel, `/api/pay-claim`, `/hisaab` (Records) |
| app | `src/features/queue`, `doctor`, `staff` | Paid / Free chips, fee-due tokens out of the waiting list, income card = fees received |

## Rules the database enforces

- **Fee before** applies to public QR / online joins for a doctor whose fee is above 0. A doctor with fee 0 (or
  NULL) takes tokens exactly as before. `call_next`, people-ahead, ETA, the TV, the join page's waiting count,
  the doctor queue and SMS "3 ahead" all skip awaiting tokens.
- Paid / waived → the token is checked in **now** and queues by that time, not by when it joined.
- Expiry: `created_at` (or the last rejected claim) + `unpaid_expiry_minutes`. A token with an open online claim is
  never expired. Walk-ins whose fee wasn't received are not expired by the job (the desk has them); the nightly
  cleanup closes them with the day like any token.
- Claims: awaiting tokens only, one open claim per token, at most 5 claims per token, TID 4-30 of `A-Z 0-9 / -`
  (spaces removed, upper case), only to an account the clinic has filled in, and a TID already used (claimed or
  paid, not refunded) for another token at the clinic is refused. `/api/pay-claim` adds Turnstile (action `pay`)
  and 10 claims per IP per 10 minutes (in memory, per server instance).
- Desk RPCs (`record_payment`, `verify_claim`, `waive_fee`, `issue_walk_in`): owner, a receptionist assigned to
  the center, or a platform admin; `queue` module. Doctors read their own patients' payments but take none.
  Refunds: owner only, once per payment, with a reason.
- Records: today on every plan; any other range (and CSV) needs `analytics`; receptionists see today only.
  Money counts on the clinic-local day it was received; refunds on the day of the refund.

**Behaviour changes to know before deploying**

1. Centers that exist when the migration runs get `fee_mode = 'after'`: nothing changes for live clinics until the
   owner switches to "Before joining the line" in Settings → Fees. Clinics created after the push start on `before`
   (the column default). Fee before also needs a doctor fee above 0. To see which clinics have doctor fees already:
   ```sql
   SELECT c.name, d.name, d.fee FROM doctors d JOIN service_centers c ON c.id = d.center_id
   WHERE d.is_active AND COALESCE(d.fee, 0) > 0 ORDER BY 1, 2;
   ```
2. Waiting order everywhere is `COALESCE(skipped_at, checked_in_at, created_at)` (was `skipped_at, created_at`).
   Walk-ins and in-clinic QR tokens are checked in when issued, so nothing changes for them; app bookings now queue
   by their check-in time.
3. `get_token_status` has new columns (drop + create) and two new statuses: `unpaid` and `expired`. Deploy the web
   app right after the push (an old status page shows an unpaid token without its pay panel).
4. `upsert_doctor` gains `p_fee` (the 7-argument version is dropped). The 1E web build calls it with named
   arguments, so it keeps working.
5. The staff app's walk-ins (`issue_token`) are unchanged: straight into the line, no fee recorded. Fees are taken
   on the web desk.
6. Expired unpaid tokens still count toward the Free plan's `tokens_per_day` (they were issued).

## Local checks
```sh
supabase db reset && supabase test db                                   # 751 pgTAP checks (22_payments: 98)
eval "$(supabase status -o env | grep -E '^(ANON_KEY|SERVICE_ROLE_KEY)=')"
SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY \
  node supabase/tests/api/phase-1a.mjs && supabase db reset               # 32 API checks
npx tsc --noEmit && npx jest                                             # app (377 tests)
cd ../mediq-web && npm run typecheck && npm run lint && npx playwright test e2e/payments.spec.ts e2e/clinic-flow.spec.ts e2e/plans-billing.spec.ts
```
The pre-fee suites (`10_tokens`, `11_token_status`, `15_public_join`) run with `fee_mode = 'after'`; fee before is
covered by `22_payments`.

`e2e/rtl.spec.ts` is the unfinished `fix/rtl` audit. It failed on all 17 pages before 2A and still fails on all 19
(17 + Settings → Fees + Records), for two app-wide causes this phase doesn't change: `<html lang/dir>` is set only
after hydration (17 pages), and the staff header changes height when the language is toggled (its nav labels wrap
differently). Leftovers on pages 2A didn't touch: `/admin` scrolls sideways at 390, the TV title runs off at 390.
2A removed these baseline findings: reception sideways scroll at 390, Urdu text fields clipping Latin text, and
clipped Nastaliq in the staff header, patient names and the doctor specialty. The payments spec runs the same
in-page audit (without the hydration and header checks) on its pages and passes.

## Production runbook

**Order:** backup → push database → check existing clinics are on `after` → deploy web → checks → new app
build. No new secrets or env vars: `/api/pay-claim` uses the existing `SUPABASE_SERVICE_ROLE_KEY` and
`TURNSTILE_SECRET_KEY` / `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.

1. **Backup** (outside the repo):
   ```sh
   mkdir -p ~/queueless-backups/pre-2a
   supabase db dump --linked -f ~/queueless-backups/pre-2a/schema.sql
   supabase db dump --linked --role-only -f ~/queueless-backups/pre-2a/roles.sql
   supabase db dump --linked --data-only --use-copy -f ~/queueless-backups/pre-2a/data.sql
   ```
2. **Dry run**: `supabase db push --linked --dry-run` must list exactly these five, in order:
   `20261027100000_fee_settings.sql`, `20261027100100_visit_payments.sql`, `20261027100200_fee_queue.sql`,
   `20261027100300_payment_rpcs.sql`, `20261027100400_payment_reports.sql`. Anything else: stop.
3. **Push**: `supabase db push --linked`.
4. **Existing clinics**: `SELECT fee_mode, count(*) FROM center_payment_settings GROUP BY 1;` must show only `after`.
5. **Web**: merge / deploy `mediq-web` `phase-2a-payments` on Vercel straight after.
6. **Checks** (SQL editor, read-only). Every row must be `true`:
   ```sql
   SELECT 'every center has fee settings' AS check,
     (SELECT count(*) FROM service_centers) = (SELECT count(*) FROM center_payment_settings) AS ok
   UNION ALL SELECT 'RLS on new tables',
     (SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('public.visit_payments'::regclass, 'public.center_payment_settings'::regclass))
   UNION ALL SELECT 'anon reads no payments or settings',
     NOT has_table_privilege('anon', 'public.visit_payments', 'select')
     AND NOT has_table_privilege('anon', 'public.center_payment_settings', 'select')
   UNION ALL SELECT 'no client writes to payments',
     NOT has_table_privilege('authenticated', 'public.visit_payments', 'insert')
     AND NOT has_table_privilege('authenticated', 'public.visit_payments', 'update')
     AND NOT has_table_privilege('authenticated', 'public.visit_payments', 'delete')
   UNION ALL SELECT 'claims are server only',
     NOT has_function_privilege('anon', 'public.submit_payment_claim(text,text,text)', 'execute')
     AND NOT has_function_privilege('authenticated', 'public.submit_payment_claim(text,text,text)', 'execute')
     AND has_function_privilege('service_role', 'public.submit_payment_claim(text,text,text)', 'execute')
   UNION ALL SELECT 'anon has no desk RPCs',
     NOT has_function_privilege('anon', 'public.record_payment(uuid,integer,text,text)', 'execute')
     AND NOT has_function_privilege('anon', 'public.get_payment_report(uuid,date,date,uuid)', 'execute')
     AND NOT has_function_privilege('anon', 'public.issue_walk_in(uuid,text,text,boolean,integer,text,text)', 'execute')
   UNION ALL SELECT 'append-only trigger', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'visit_payments_append_only')
   UNION ALL SELECT 'four cron jobs', (SELECT count(*) = 4 FROM cron.job WHERE jobname IN
     ('send-notifications', 'cleanup-stale-appointments', 'prune-notification-outbox', 'expire-unpaid-tokens'))
   UNION ALL SELECT 'anon still reads token status', has_function_privilege('anon', 'public.get_token_status(text)', 'execute');
   ```
   A minute later: `SELECT status, return_message FROM cron.job_run_details WHERE command LIKE '%expire_unpaid%' ORDER BY start_time DESC LIMIT 3;`
   must show `succeeded`.
7. **Smoke test** with a test doctor (fee > 0) at your own clinic: scan the QR → the token page asks for the fee →
   "Online bhejein" → a test TID → reception shows it in "Fee pending" → Verify → the token page says
   "Paid — you're in the line". Then Records shows it. Refund it from Records (owner) to leave the totals clean.
8. **App**: ship the new build (Paid / Free chips, income card). The old build keeps working but counts fee-due
   tokens as "to confirm".

## Rollback
New tables and functions can stay. To switch fees off everywhere at once:
`UPDATE public.center_payment_settings SET fee_mode = 'off';` (awaiting tokens stay out of the line: waive them
or let them expire; `SELECT cron.unschedule('expire-unpaid-tokens');` stops the expiry).
To restore the 1E queue functions, take `call_next`, `get_reception_queue`, `get_display_snapshot`,
`get_public_center`, `get_doctor_queue`, `get_org_settings`, `check_in_appointment`, `issue_token`,
`issue_public_token`, `private.token_progress`, `private.doctor_waiting_tokens`, `private.issue_token_core`
(5 arguments) and `get_doctor_income_summary` from `~/queueless-backups/pre-2a/schema.sql` (drop
`get_token_status` and `upsert_doctor` first: their signatures changed), and redeploy the 1E web app.
`visit_payments` rows are records of money received: export them before any cleanup.

## Screenshots (`../mediq-web/e2e/screenshots/payments/`, written by `e2e/payments.spec.ts`)
| File | Shows |
|---|---|
| `01-settings-doctor-fee-en-1440` | Settings → Doctors with the fee field |
| `02-settings-fees-en-1440` | Settings → Fees: mode, expiry, accounts (IBAN tidied after save) |
| `03-status-unpaid-ur-390` | Token page, Urdu: "ٹوکن نمبر 1 — 1,500 روپے فیس جمع کروائیں…" + countdown |
| `04-status-counter-ur-390` | "کاؤنٹر پر نقد / کارڈ" instructions |
| `05-status-online-ur-390` | "آن لائن بھیجیں": accounts with copy buttons, TID field |
| `06-status-checking-ur-390` | "استقبالیہ آپ کی ادائیگی چیک کر رہا ہے" |
| `07-reception-claim-en-1440` | Reception "Fee pending" strip with Easypaisa + TID, Verify / Reject |
| `08-status-rejected-ur-390` | Rejected with the reason + "استقبالیہ سے رابطہ کریں" |
| `09-status-paid-in-line-ur-390`, `10-…-en-390` | "فیس ادا — آپ لائن میں ہیں…" / "Paid — you're in the line…" |
| `11-reception-walkin-fee-en-1440` | One-step walk-in: amount 1500, Cash, "Fee received" on |
| `12-reception-fee-pending-en-1440` | Two walk-ins without the fee in the strip |
| `13-reception-fee-sheet-en-1440`, `14-…-free-en-1440` | Fee sheet; Free with reason |
| `15-reception-badges-en-1440` | Paid / Free badges on every row |
| `16-records-today-en-1440` | Records: cards, cash closing, rows |
| `17-records-range-locked-en-1440` | "This week" on Free → Upgrade card |
| `18-records-month-refund-en-1440` | Pro: this month + a refund |
| `layout-<page>-<ur|en>-<390|1440>` | status-unpaid, status-paid, reception, records, settings-fees in both languages and widths |
