-- Phase 4: Centers and Services metadata.
-- Applied to Supabase project QueueLess on 2026-06-09.

ALTER TABLE public.service_centers
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS open_time time,
  ADD COLUMN IF NOT EXISTS close_time time;

UPDATE public.service_centers
SET
  category = CASE
    WHEN name ILIKE '%nadra%' THEN 'Government'
    WHEN name ILIKE '%lab%' THEN 'Diagnostics'
    WHEN name ILIKE '%hospital%' THEN 'Healthcare'
    WHEN name ILIKE '%medicare%' THEN 'Healthcare'
    ELSE COALESCE(category, 'Service Center')
  END,
  open_time = COALESCE(open_time, '09:00'::time),
  close_time = COALESCE(close_time, '18:00'::time)
WHERE category IS NULL
   OR open_time IS NULL
   OR close_time IS NULL;

COMMENT ON COLUMN public.service_centers.category IS
  'Center category used for browsing and filtering.';

COMMENT ON COLUMN public.service_centers.open_time IS
  'Daily opening time shown in the center details flow.';

COMMENT ON COLUMN public.service_centers.close_time IS
  'Daily closing time shown in the center details flow.';
