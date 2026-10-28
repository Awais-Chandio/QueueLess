#!/bin/sh
# Local stack only: prepares seed center A for reception-walkin-cash.yaml.
# Run after `supabase db reset`. DB_CONTAINER overrides the container name.
set -eu
docker exec -i "${DB_CONTAINER:-supabase_db_QueueLess}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
UPDATE public.center_payment_settings
SET fee_mode = 'before', easypaisa_number = '03001234567', easypaisa_title = 'Liaquat Clinic'
WHERE center_id = '521f1349-05c4-4417-9fa5-5289963af7db';
UPDATE public.doctors SET fee = 1000 WHERE id = 'd0000000-0000-4000-8000-00000000000a';
-- Dr. A's seed tokens move to last week: the walk-in is the only one waiting.
UPDATE public.appointments SET appointment_date = appointment_date - 7 WHERE doctor_id = 'd0000000-0000-4000-8000-00000000000a';
SQL
echo "center A ready: fee before, Dr. A Rs 1,000, empty queue"
