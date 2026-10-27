#!/bin/sh
# Phase 2B data migration check, LOCAL database only: rebuilds the 2A schema,
# adds clinics in the states production has, applies the 2B migrations and
# checks who moved to the trial and whose admin overrides were kept.
#   Plain Free    -> trial (14 days)
#   Admin Free    -> stays on Free (the admin set it)
#   Edited Free   -> stays on Free with its hand-edited 100 tokens a day
#   Pro (admin)   -> stays on Pro with 10 doctors; its "paid until" date stays informational
# Run from the repo root: sh supabase/tests/migration/phase-2b-backfill.sh
# Ends with `supabase db reset` (a clean local database for the pgTAP suites).
set -eu

DB_CONTAINER=${DB_CONTAINER:-supabase_db_QueueLess}
q() { docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 "$@"; }

supabase db reset --version 20261027100400 >/dev/null 2>&1
q >/dev/null <<'SQL'
INSERT INTO organizations (id, name, slug) VALUES
 ('00000000-0000-4000-8000-0000000000a1', 'Plain Free', 'plain-free'),
 ('00000000-0000-4000-8000-0000000000a2', 'Admin Free', 'admin-free'),
 ('00000000-0000-4000-8000-0000000000a3', 'Pro Ten', 'pro-ten'),
 ('00000000-0000-4000-8000-0000000000a4', 'Edited Free', 'edited-free');
SELECT admin_set_plan('00000000-0000-4000-8000-0000000000a2', 'free', NULL, 'pilot');
SELECT admin_set_plan('00000000-0000-4000-8000-0000000000a3', 'pro', '2026-11-30', 'paid');
UPDATE org_entitlements SET tokens_per_day = 100 WHERE organization_id = '00000000-0000-4000-8000-0000000000a4';
SQL
supabase migration up >/dev/null

got=$(q -c "
SELECT string_agg(o.slug || ':' || s.plan_id || ':' || s.status || ':' || s.lapses || ':' || (o.trial_ends_at IS NOT NULL)
                  || ':' || COALESCE(e.tokens_per_day::text, '-') || ':' || COALESCE(e.max_doctors::text, '-')
                  || ':' || ('display' = ANY (e.modules) AND 'fees' = ANY (e.modules)), ' ' ORDER BY o.slug)
FROM organizations o
JOIN org_subscriptions s ON s.organization_id = o.id AND s.status <> 'cancelled'
JOIN org_entitlements e ON e.organization_id = o.id
WHERE o.slug IN ('plain-free', 'admin-free', 'pro-ten', 'edited-free')")
want="admin-free:free:active:false:false:30:1:true edited-free:free:active:false:false:100:1:true plain-free:trial:trialing:true:true:-:3:true pro-ten:pro:active:false:false:-:10:true"

supabase db reset >/dev/null 2>&1
if [ "$got" = "$want" ]; then
  echo "ok   2B backfill: plain Free -> trial; admin plans and hand edits kept"
else
  echo "FAIL 2B backfill"
  echo "  got:  $got"
  echo "  want: $want"
  exit 1
fi
