-- ============================================================
-- SQL Migration: Create device_tokens table for Push Notifications
-- ============================================================

CREATE TABLE IF NOT EXISTS public.device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fcm_token text NOT NULL UNIQUE,
  platform text,
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS and setup policies
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own device tokens" ON public.device_tokens;
DROP POLICY IF EXISTS "Users can view own device tokens" ON public.device_tokens;
DROP POLICY IF EXISTS "Users can insert own device tokens" ON public.device_tokens;
DROP POLICY IF EXISTS "Users can update own device tokens" ON public.device_tokens;
DROP POLICY IF EXISTS "Users can delete own device tokens" ON public.device_tokens;

CREATE POLICY "Users can view own device tokens" 
  ON public.device_tokens FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own device tokens" 
  ON public.device_tokens FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own device tokens" 
  ON public.device_tokens FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own device tokens" 
  ON public.device_tokens FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Grant table-level access to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_tokens TO authenticated;

-- Notify schema reload
NOTIFY pgrst, 'reload schema';
