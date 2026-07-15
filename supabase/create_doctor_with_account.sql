-- RPC function to atomically create a doctor auth account, profile, doctor details, services, and queue settings.
-- Apply this SQL in your Supabase Dashboard SQL Editor (https://supabase.com/dashboard/project/latdblyyakjrwzgxdean/sql/new)

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

  RETURN v_user_id;
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.create_doctor_with_account(text, text, text, uuid, text, text, integer, uuid[]) TO authenticated, anon;
