-- ============================================================
-- SQL Migration: Add fcm_token column to public.profiles
-- Run this script in the Supabase SQL Editor
-- ============================================================

-- 1. Add fcm_token column if it doesn't already exist
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS fcm_token TEXT;

-- 2. Verify column is added successfully
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'profiles' AND column_name = 'fcm_token';
