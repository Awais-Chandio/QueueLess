-- fix_doctor_schedules_rls_and_seed.sql
-- Run this in the Supabase Dashboard SQL Editor (https://supabase.com/dashboard/project/latdblyyakjrwzgxdean/sql/new)

BEGIN;

-- 1. Fix RLS Policies for doctor_schedules and doctor_leaves
-- Drop old policies relying on legacy 'app_role' claim
DROP POLICY IF EXISTS "admin manage doctor_schedules" ON public.doctor_schedules;
DROP POLICY IF EXISTS "admin manage doctor_schedules by profile role" ON public.doctor_schedules;

CREATE POLICY "admin manage doctor_schedules by profile role"
  ON public.doctor_schedules
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin manage doctor_leaves" ON public.doctor_leaves;
DROP POLICY IF EXISTS "admin manage doctor_leaves by profile role" ON public.doctor_leaves;

CREATE POLICY "admin manage doctor_leaves by profile role"
  ON public.doctor_leaves
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Ensure authenticated role has full permissions on the tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.doctor_schedules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.doctor_leaves TO authenticated;


-- 2. Populate working schedules for existing doctors who have no schedules (recovery step)
INSERT INTO public.doctor_schedules (doctor_id, day_of_week, start_time, end_time, max_tokens_per_day)
SELECT 
  d.id AS doctor_id,
  day_num AS day_of_week,
  '09:00:00'::time AS start_time,
  '17:00:00'::time AS end_time,
  40 AS max_tokens_per_day
FROM public.doctors d
CROSS JOIN generate_series(1, 6) AS day_num
WHERE NOT EXISTS (
  SELECT 1 
  FROM public.doctor_schedules ds 
  WHERE ds.doctor_id = d.id
)
ON CONFLICT (doctor_id, day_of_week) DO NOTHING;


-- 3. Update the RPC function to automatically assign default working schedules (Monday to Saturday, 9:00 AM - 5:00 PM)
CREATE OR REPLACE FUNCTION public.create_doctor_with_account(
  p_email text,
  p_password text,
  p_full_name text,
  p_center_id uuid,
  p_specialty text,
  p_qualification text,
  p_experience_years integer,
  p_service_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_doctor_id uuid;
  v_service_id uuid;
  v_encrypted_pw text;
  v_day_of_week integer;
BEGIN
  -- Hash the password using pgcrypto extension (crypt/gen_salt)
  v_encrypted_pw := crypt(p_password, gen_salt('bf', 10));

  -- 1. Insert into auth.users to create the user account
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    p_email,
    v_encrypted_pw,
    now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object(
      'full_name', p_full_name,
      'role', 'doctor'
    ),
    now(),
    now(),
    '',
    '',
    '',
    ''
  ) RETURNING id INTO v_user_id;

  -- 2. The auth.users trigger handle_new_user() has already created the profile.
  -- Add the doctor-specific center without attempting a second profile insert.
  UPDATE public.profiles
  SET center_id = p_center_id,
      updated_at = now()
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile was not created for auth user % by handle_new_user()', v_user_id;
  END IF;

  -- 3. Insert into doctors
  INSERT INTO public.doctors (
    center_id,
    name,
    specialty,
    qualification,
    experience_years,
    bio,
    is_active,
    is_on_break,
    profile_id,
    employee_code,
    license_number,
    gender,
    fee,
    status
  ) VALUES (
    p_center_id,
    p_full_name,
    p_specialty,
    p_qualification,
    p_experience_years,
    p_full_name || ' is a qualified specialist with ' || p_experience_years || ' years of experience.',
    true,
    false,
    v_user_id,
    'EMP-' || upper(substring(md5(random()::text) from 1 for 5)),
    'LIC-' || upper(substring(md5(random()::text) from 1 for 5)),
    'Male',
    50.0,
    'active'
  ) RETURNING id INTO v_doctor_id;

  -- 4. Insert into doctor_services mapping
  IF p_service_ids IS NOT NULL THEN
    FOREACH v_service_id IN ARRAY p_service_ids LOOP
      INSERT INTO public.doctor_services (doctor_id, service_id)
      VALUES (v_doctor_id, v_service_id);
    END LOOP;
  END IF;

  -- 5. Insert default doctor queue settings
  INSERT INTO public.doctor_queue_settings (
    doctor_id,
    current_token,
    average_consultation_time,
    is_on_break
  ) VALUES (
    v_doctor_id,
    0,
    10.0,
    false
  );

  -- 6. Insert default weekly schedules (Monday to Saturday, day_of_week 1 to 6)
  FOR v_day_of_week IN 1..6 LOOP
    INSERT INTO public.doctor_schedules (doctor_id, day_of_week, start_time, end_time, max_tokens_per_day)
    VALUES (v_doctor_id, v_day_of_week, '09:00:00'::time, '17:00:00'::time, 40);
  END LOOP;

  RETURN v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_doctor_with_account(text, text, text, uuid, text, text, integer, uuid[]) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';

COMMIT;
