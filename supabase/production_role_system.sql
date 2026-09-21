-- ============================================================
-- QueueLess Production Role System
-- Purpose:
-- - Public signup remains client by default.
-- - Staff/Admin auth metadata role is preserved in public.profiles.
-- - Existing appointments, notifications, analytics, and realtime tables are untouched.
-- Run in Supabase SQL Editor.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'client';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('client', 'staff', 'admin'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'client'),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.profiles (id, full_name, email, role, created_at, updated_at)
SELECT
  users.id,
  COALESCE(users.raw_user_meta_data->>'full_name', users.email) AS full_name,
  users.email,
  COALESCE(users.raw_user_meta_data->>'role', 'client') AS role,
  NOW(),
  NOW()
FROM auth.users
WHERE NOT EXISTS (
  SELECT 1
  FROM public.profiles
  WHERE profiles.id = users.id
)
ON CONFLICT (id) DO NOTHING;

SELECT
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'handle_new_user';
