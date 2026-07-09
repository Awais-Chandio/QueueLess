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
CREATE POLICY "Users can manage own device tokens" 
  ON public.device_tokens
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Notify schema reload
NOTIFY pgrst, 'reload schema';
