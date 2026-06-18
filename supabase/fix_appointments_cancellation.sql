-- QueueLess appointment cancellation repair.
-- Run this once in the Supabase SQL Editor.

BEGIN;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cancel own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Users can cancel own appointments" ON public.appointments;

CREATE POLICY "Users can cancel own appointments"
  ON public.appointments
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND status IN ('pending', 'confirmed')
  )
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'cancelled'
  );

GRANT SELECT ON public.appointments TO authenticated;
GRANT UPDATE (
  status,
  cancel_reason,
  cancelled_by,
  cancelled_at,
  checked_in_at,
  started_at,
  completed_at
) ON public.appointments TO authenticated;

COMMIT;

-- Refresh the PostgREST schema cache used by Supabase APIs.
NOTIFY pgrst, 'reload schema';

-- Verification
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'appointments'
  AND column_name IN (
    'status',
    'cancel_reason',
    'cancelled_by',
    'cancelled_at',
    'checked_in_at',
    'started_at',
    'completed_at'
  )
ORDER BY ordinal_position;

SELECT
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'appointments'
  AND cmd = 'UPDATE'
ORDER BY policyname;
