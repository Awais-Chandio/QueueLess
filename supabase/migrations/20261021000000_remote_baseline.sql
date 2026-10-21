-- Baseline: full schema of the live project (latdblyyakjrwzgxdean) as of 2026-10-21.
-- Generated with `supabase db dump --linked` (public schema) plus the app-owned
-- objects in Supabase-managed schemas, taken from a read-only dump of auth/storage:
--   * trigger on_auth_user_created on auth.users
--   * storage bucket "avatars" and its 4 policies on storage.objects
-- Replaces the 49 dashboard-applied migrations and everything in supabase/archive/.
-- No schema changes vs. production; security fixes come in later migrations.
-- NOTE: some function bodies keep production's CRLF line endings on purpose
-- (byte-exact copy). Don't let an editor normalise this file.




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "hypopg" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "index_advisor" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "moddatetime" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";

-- Supabase's local stack auto-grants ALL on new objects in public to anon,
-- authenticated and service_role (default privileges). Production doesn't have
-- those defaults, and pg_dump only records the GRANTs that exist, never the
-- missing ones. Drop the auto-grants first so each object below ends up with
-- exactly the grants production has; production's own defaults are restored
-- by the ALTER DEFAULT PRIVILEGES statements at the end of the dump.
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "anon", "authenticated", "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "anon", "authenticated", "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "anon", "authenticated", "service_role";






CREATE OR REPLACE FUNCTION "public"."admin_delete_staff_account"("staff_profile_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  target_role text;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can delete staff accounts';
  END IF;

  SELECT role INTO target_role FROM public.profiles WHERE id = staff_profile_id;

  IF target_role IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF target_role <> 'staff' THEN
    RAISE EXCEPTION 'This function can only delete staff accounts (found role: %)', target_role;
  END IF;

  -- Deleting the auth.users row cascades to delete the profiles row (confirmed FK ON DELETE CASCADE)
  DELETE FROM auth.users WHERE id = staff_profile_id;
END;
$$;


ALTER FUNCTION "public"."admin_delete_staff_account"("staff_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_appointment_token_number"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_queue_date date;
BEGIN
  v_queue_date := COALESCE(NEW.appointment_date, (NEW.scheduled_at AT TIME ZONE 'UTC')::date, CURRENT_DATE);
  NEW.appointment_date := v_queue_date;
  IF TG_OP = 'INSERT' AND NEW.token_number IS NULL THEN
    IF NEW.doctor_id IS NOT NULL THEN
      -- Advisory lock to serialize token allocation for the specific doctor + date
      PERFORM pg_advisory_xact_lock(hashtext(NEW.doctor_id::text || ':' || v_queue_date::text));
      SELECT COALESCE(MAX(token_number), 0) + 1
      INTO NEW.token_number
      FROM public.appointments
      WHERE doctor_id = NEW.doctor_id
        AND appointment_date = v_queue_date;
    ELSE
      -- Fallback to center-scoped sequence
      IF NEW.center_id IS NULL THEN
        RAISE EXCEPTION 'center_id required';
      END IF;
      NEW.token_number := public.get_next_token(NEW.center_id, v_queue_date);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."assign_appointment_token_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."book_appointment"("p_lock_id" "uuid", "p_service_id" "uuid", "p_notes" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_lock record;
  v_appointment_id uuid;
  v_time time;
begin
  select * into v_lock from slot_locks where id = p_lock_id and user_id = auth.uid() and expires_at > now();

  if v_lock is null then
    raise exception 'Lock expired or not found — please pick a slot again';
  end if;

  v_time := to_timestamp(v_lock.appointment_time, 'HH12:MI AM')::time;

  insert into appointments (user_id, center_id, service_id, doctor_id, appointment_date, appointment_time, scheduled_at, status, notes)
  values (auth.uid(), v_lock.center_id, p_service_id, v_lock.doctor_id, v_lock.appointment_date, v_time,
          (v_lock.appointment_date + v_time) at time zone 'Asia/Karachi', 'pending', p_notes)
  returning id into v_appointment_id;

  delete from slot_locks where id = p_lock_id;

  return v_appointment_id;
end;
$$;


ALTER FUNCTION "public"."book_appointment"("p_lock_id" "uuid", "p_service_id" "uuid", "p_notes" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."appointments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "center_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "appointment_date" "date" DEFAULT CURRENT_DATE,
    "appointment_time" time without time zone,
    "scheduled_at" timestamp with time zone NOT NULL,
    "token_number" integer NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "estimated_wait_mins" integer DEFAULT 0,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "cancelled_by" "uuid",
    "cancelled_at" timestamp with time zone,
    "cancellation_reason" "text",
    "completed_at" timestamp with time zone,
    "cancel_reason" "text",
    "queue_position" integer DEFAULT 0,
    "called_at" timestamp with time zone,
    "checked_in_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "is_currently_serving" boolean DEFAULT false,
    "doctor_id" "uuid",
    "skipped_at" timestamp with time zone,
    "duration_minutes" integer,
    CONSTRAINT "appointments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'checked_in'::"text", 'called'::"text", 'in_progress'::"text", 'completed'::"text", 'cancelled'::"text", 'expired'::"text", 'no_show'::"text"])))
);


ALTER TABLE "public"."appointments" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."call_appointment"("p_appointment_id" "uuid") RETURNS "public"."appointments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  called_appointment public.appointments%ROWTYPE;
BEGIN
  SELECT * INTO called_appointment
  FROM public.appointments
  WHERE id = p_appointment_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.is_staff()
     AND NOT public.is_admin()
     AND NOT EXISTS (
       SELECT 1
       FROM public.doctors d
       WHERE d.id = called_appointment.doctor_id
         AND d.profile_id = auth.uid()
     )
  THEN
    RAISE EXCEPTION 'Only staff or the assigned doctor can call this appointment'
      USING ERRCODE = '42501';
  END IF;

  IF called_appointment.status NOT IN ('confirmed', 'checked_in', 'pending') THEN
    RAISE EXCEPTION 'Cannot call appointment from status: %', called_appointment.status;
  END IF;

  UPDATE public.appointments
  SET status = 'called', called_at = now()
  WHERE id = p_appointment_id
  RETURNING * INTO called_appointment;

  RETURN called_appointment;
END;
$$;


ALTER FUNCTION "public"."call_appointment"("p_appointment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_appointment"("p_appointment_id" "uuid", "p_reason" "text") RETURNS "public"."appointments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_appointment public.appointments%ROWTYPE;
BEGIN
  SELECT * INTO v_appointment
  FROM public.appointments
  WHERE id = p_appointment_id FOR UPDATE;
  
  IF NOT FOUND OR v_appointment.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Appointment not found or unauthorized';
  END IF;

  IF v_appointment.status IN ('completed', 'cancelled', 'expired', 'no_show') THEN
    RAISE EXCEPTION 'Cannot cancel an inactive or completed appointment';
  END IF;

  UPDATE public.appointments
  SET
    status = 'cancelled',
    cancel_reason = COALESCE(p_reason, 'User requested cancellation'),
    cancelled_by = 'patient',
    cancelled_at = now()
  WHERE id = p_appointment_id
  RETURNING * INTO v_appointment;

  RETURN v_appointment;
END;
$$;


ALTER FUNCTION "public"."cancel_appointment"("p_appointment_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_in_appointment"("p_appointment_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_appointment public.appointments%ROWTYPE;
BEGIN
  SELECT *
  INTO v_appointment
  FROM public.appointments
  WHERE id = p_appointment_id
  FOR UPDATE;

  IF NOT FOUND OR v_appointment.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  IF v_appointment.status NOT IN ('pending', 'confirmed', 'checked_in') THEN
    RAISE EXCEPTION 'This appointment cannot be checked in';
  END IF;

  IF v_appointment.status <> 'checked_in' THEN
    UPDATE public.appointments
    SET
      status = 'checked_in',
      checked_in_at = COALESCE(checked_in_at, now())
    WHERE id = p_appointment_id;
  END IF;
END;
$$;


ALTER FUNCTION "public"."check_in_appointment"("p_appointment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_stale_appointments"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- A. Mark confirmed appointments that missed their check-in window as 'no_show'
  -- Grace period: 15 minutes after scheduled_at
  UPDATE public.appointments
  SET 
    status = 'no_show',
    notes = CASE 
      WHEN notes IS NULL OR notes = '' THEN 'Auto-marked as No-Show: missed 15-min check-in window'
      ELSE notes || E'\n(Auto-marked as No-Show: missed 15-min check-in window)'
    END
  WHERE status = 'confirmed'
    AND scheduled_at < (now() - interval '15 minutes');

  -- B. Mark active/pending appointments past their duration as 'expired'
  -- Duration: service's duration_minutes (default 30 mins) + 15 mins safety buffer
  UPDATE public.appointments
  SET 
    status = 'expired',
    notes = CASE 
      WHEN notes IS NULL OR notes = '' THEN 'Auto-marked as Expired: time slot passed'
      ELSE notes || E'\n(Auto-marked as Expired: time slot passed)'
    END
  WHERE status IN ('pending', 'confirmed', 'checked_in', 'called', 'in_progress')
    AND scheduled_at < (now() - (COALESCE((SELECT duration_minutes FROM public.services WHERE id = service_id), 30) + 15) * interval '1 minute');
END;
$$;


ALTER FUNCTION "public"."cleanup_stale_appointments"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_appointment"("p_appointment_id" "uuid", "p_duration_minutes" integer DEFAULT NULL::integer) RETURNS "public"."appointments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  target_appointment public.appointments%ROWTYPE;
  v_duration integer;
BEGIN
  SELECT * INTO target_appointment
  FROM public.appointments
  WHERE id = p_appointment_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.is_admin()
     AND NOT EXISTS (
       SELECT 1
       FROM public.doctors d
       WHERE d.id = target_appointment.doctor_id
         AND d.profile_id = auth.uid()
     )
  THEN
    RAISE EXCEPTION 'Only the assigned doctor can complete this appointment'
      USING ERRCODE = '42501';
  END IF;

  IF p_duration_minutes IS NOT NULL THEN
    v_duration := p_duration_minutes;
  ELSIF target_appointment.started_at IS NOT NULL THEN
    v_duration := GREATEST(1, EXTRACT(EPOCH FROM (now() - target_appointment.started_at))::integer / 60);
  ELSE
    v_duration := 15;
  END IF;

  UPDATE public.appointments
  SET status = 'completed', completed_at = now(), duration_minutes = v_duration
  WHERE id = p_appointment_id
  RETURNING * INTO target_appointment;

  RETURN target_appointment;
END;
$$;


ALTER FUNCTION "public"."complete_appointment"("p_appointment_id" "uuid", "p_duration_minutes" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_appointment"("p_appointment_id" "uuid") RETURNS "public"."appointments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  target_appointment public.appointments%ROWTYPE;
BEGIN
  UPDATE public.appointments
  SET status = 'confirmed'
  WHERE id = p_appointment_id
  RETURNING * INTO target_appointment;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;
  
  RETURN target_appointment;
END;
$$;


ALTER FUNCTION "public"."confirm_appointment"("p_appointment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_doctor_with_account"("p_email" "text", "p_password" "text", "p_full_name" "text", "p_center_id" "uuid", "p_specialty" "text", "p_qualification" "text", "p_experience_years" integer, "p_service_ids" "uuid"[]) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'extensions'
    AS $$
DECLARE
  v_user_id uuid;
  v_doctor_id uuid;
  v_service_id uuid;
  v_encrypted_pw text;
  v_day_of_week integer;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can create doctor accounts';
  END IF;

  v_encrypted_pw := crypt(p_password, gen_salt('bf', 10));

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    p_email, v_encrypted_pw, now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('full_name', p_full_name, 'role', 'doctor'),
    now(), now(), '', '', '', ''
  ) RETURNING id INTO v_user_id;

  UPDATE public.profiles
  SET role = 'doctor', center_id = p_center_id, updated_at = now()
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile was not created for auth user % by handle_new_user()', v_user_id;
  END IF;

  INSERT INTO public.doctors (
    center_id, name, specialty, qualification, experience_years, bio,
    is_active, is_on_break, profile_id, employee_code, license_number, gender, fee, status
  ) VALUES (
    p_center_id, p_full_name, p_specialty, p_qualification, p_experience_years,
    p_full_name || ' is a qualified specialist with ' || p_experience_years || ' years of experience.',
    true, false, v_user_id,
    'EMP-' || upper(substring(md5(random()::text) from 1 for 5)),
    'LIC-' || upper(substring(md5(random()::text) from 1 for 5)),
    'Male', 50.0, 'active'
  ) RETURNING id INTO v_doctor_id;

  IF p_service_ids IS NOT NULL THEN
    FOREACH v_service_id IN ARRAY p_service_ids LOOP
      INSERT INTO public.doctor_services (doctor_id, service_id) VALUES (v_doctor_id, v_service_id);
    END LOOP;
  END IF;

  INSERT INTO public.doctor_queue_settings (doctor_id, current_token, average_consultation_time, is_on_break)
  VALUES (v_doctor_id, 0, 10.0, false);

  FOR v_day_of_week IN 1..6 LOOP
    INSERT INTO public.doctor_schedules (doctor_id, day_of_week, start_time, end_time, max_tokens_per_day)
    VALUES (v_doctor_id, v_day_of_week, '09:00:00'::time, '17:00:00'::time, 40);
  END LOOP;

  RETURN v_user_id;
END;
$$;


ALTER FUNCTION "public"."create_doctor_with_account"("p_email" "text", "p_password" "text", "p_full_name" "text", "p_center_id" "uuid", "p_specialty" "text", "p_qualification" "text", "p_experience_years" integer, "p_service_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_notification_on_appointment"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  INSERT INTO notifications (
    user_id,
    title,
    message,
    appointment_id,
    is_read,
    created_at
  ) VALUES (
    NEW.user_id,
    'Appointment Confirmed',
    'Your appointment has been booked successfully',
    NEW.id,
    false,
    now()
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_notification_on_appointment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_notification_on_cancel"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO notifications (
      user_id,
      title,
      message,
      appointment_id,
      is_read,
      created_at
    ) VALUES (
      NEW.user_id,
      'Appointment Cancelled',
      'Your appointment has been cancelled by staff/admin',
      NEW.id,
      false,
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_notification_on_cancel"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."custom_access_token_hook"("event" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role
  FROM public.profiles
  WHERE id = (event->>'user_id')::uuid;

  event := jsonb_set(event, '{claims,app_role}',
    to_jsonb(COALESCE(user_role, 'client')));
  RETURN event;
END;
$$;


ALTER FUNCTION "public"."custom_access_token_hook"("event" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_daily_token"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.token_number IS NULL THEN
    SELECT COALESCE(MAX(token_number), 0) + 1
    INTO NEW.token_number
    FROM public.appointments
    WHERE center_id = NEW.center_id
      AND DATE(scheduled_at) = DATE(NEW.scheduled_at);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."generate_daily_token"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_token_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  SELECT COALESCE(MAX(token_number), 0) + 1
  INTO NEW.token_number
  FROM public.appointments
  WHERE center_id = NEW.center_id
  AND appointment_date = NEW.appointment_date;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."generate_token_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_token_number"("p_center_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    next_token INT;
BEGIN
    SELECT COALESCE(MAX(token_number), 0) + 1
    INTO next_token
    FROM public.appointments
    WHERE center_id = p_center_id
      AND appointment_date = CURRENT_DATE;

    RETURN next_token;
END;
$$;


ALTER FUNCTION "public"."generate_token_number"("p_center_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_appointment_queue_snapshot"("p_appointment_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_appointment public.appointments%ROWTYPE;
  v_queue_snapshot jsonb;
  v_current_token integer;
  v_average numeric(10, 2);
  v_people_ahead integer;
  v_estimated_wait integer;
BEGIN
  SELECT * INTO v_appointment FROM public.appointments WHERE id = p_appointment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Appointment not found'; END IF;
  IF v_appointment.doctor_id IS NOT NULL THEN
    v_queue_snapshot := public.get_doctor_queue_snapshot(v_appointment.doctor_id, v_appointment.appointment_date);
  ELSE
    v_queue_snapshot := public.get_center_queue_snapshot(v_appointment.center_id, v_appointment.appointment_date);
  END IF;
  v_current_token := COALESCE((v_queue_snapshot->>'current_token')::integer, 0);
  v_average := COALESCE((v_queue_snapshot->>'average_consultation_time')::numeric, 10.0);
  v_people_ahead := GREATEST(COALESCE(v_appointment.token_number, 0) - v_current_token, 0);
  v_estimated_wait := CEIL(v_people_ahead * v_average)::integer;
  RETURN v_queue_snapshot || jsonb_build_object(
    'appointment_id', v_appointment.id,
    'your_token', v_appointment.token_number,
    'token_number', v_appointment.token_number,
    'queue_position', CASE WHEN v_appointment.status IN ('confirmed', 'checked_in') THEN GREATEST(v_people_ahead, 1) ELSE 0 END,
    'current_position', CASE WHEN v_appointment.status IN ('confirmed', 'checked_in') THEN GREATEST(v_people_ahead, 1) ELSE 0 END,
    'people_ahead', v_people_ahead,
    'estimated_wait_time', v_estimated_wait,
    'estimated_wait_mins', v_estimated_wait,
    'status', CASE
      WHEN (v_queue_snapshot->>'is_on_break')::boolean THEN 'doctor_on_break'
      WHEN v_appointment.status IN ('called', 'in_progress') THEN 'called'
      WHEN v_appointment.status = 'checked_in' THEN 'checked_in'
      WHEN v_appointment.status = 'confirmed' THEN 'waiting'
      ELSE v_appointment.status
    END
  );
END;
$$;


ALTER FUNCTION "public"."get_appointment_queue_snapshot"("p_appointment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_available_slots"("p_doctor_id" "uuid", "p_date" "date") RETURNS "text"[]
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_day_of_week int := extract(dow from p_date);
  v_schedule record;
  v_all_slots text[] := '{}';
  v_free_slots text[];
  v_cursor time;
begin
  select * into v_schedule from doctor_schedules
  where doctor_id = p_doctor_id and day_of_week = v_day_of_week;

  if v_schedule is null then
    return '{}'::text[];
  end if;

  v_cursor := v_schedule.start_time;
  while v_cursor < v_schedule.end_time loop
    v_all_slots := array_append(v_all_slots, to_char(v_cursor, 'HH12:MI AM'));
    v_cursor := v_cursor + (v_schedule.slot_duration_minutes || ' minutes')::interval;
  end loop;

  select coalesce(array_agg(s order by s), '{}') into v_free_slots
  from unnest(v_all_slots) s
  where not exists (
    select 1 from appointments a
    where a.doctor_id = p_doctor_id and a.appointment_date = p_date
      and a.status <> 'cancelled'
      and to_char(a.appointment_time, 'HH12:MI AM') = s
  )
  and not exists (
    select 1 from slot_locks sl
    where sl.doctor_id = p_doctor_id and sl.appointment_date = p_date
      and sl.appointment_time = s and sl.expires_at > now()
  );

  return v_free_slots;
end;
$$;


ALTER FUNCTION "public"."get_available_slots"("p_doctor_id" "uuid", "p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_center_queue_snapshot"("p_center_id" "uuid", "p_queue_date" "date" DEFAULT CURRENT_DATE) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_settings public.center_queue_settings%ROWTYPE;
  v_current_token integer;
  v_next_token integer;
  v_is_on_break boolean;
BEGIN
  -- Ensure settings row exists for the day
  INSERT INTO public.center_queue_settings (center_id, appointment_date)
  VALUES (p_center_id, p_queue_date)
  ON CONFLICT (center_id, appointment_date) DO NOTHING;

  SELECT * INTO v_settings
  FROM public.center_queue_settings
  WHERE center_id = p_center_id AND appointment_date = p_queue_date;

  v_current_token := public.get_current_token(p_center_id, p_queue_date);

  SELECT COALESCE(MAX(token_number), 0) + 1 INTO v_next_token
  FROM public.appointments
  WHERE center_id = p_center_id AND appointment_date = p_queue_date;

  v_is_on_break := COALESCE(v_settings.is_on_break, false)
    OR (v_settings.break_start IS NOT NULL AND v_settings.break_start <= now() AND (v_settings.break_end IS NULL OR v_settings.break_end > now()));

  RETURN jsonb_build_object(
    'center_id', p_center_id,
    'queue_date', p_queue_date,
    'current_token', v_current_token,
    'next_token', v_next_token,
    'doctor_average_time', COALESCE(v_settings.average_consultation_time, 10.0),
    'average_consultation_time', COALESCE(v_settings.average_consultation_time, 10.0),
    'is_on_break', v_is_on_break,
    'break_start', v_settings.break_start,
    'break_end', v_settings.break_end
  );
END;
$$;


ALTER FUNCTION "public"."get_center_queue_snapshot"("p_center_id" "uuid", "p_queue_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_token"() RETURNS integer
    LANGUAGE "sql"
    AS $$
  SELECT COALESCE(MIN(token_number), 0)
  FROM appointments
  WHERE status = 'checked_in';
$$;


ALTER FUNCTION "public"."get_current_token"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_token"("p_center_id" "uuid", "p_queue_date" "date" DEFAULT CURRENT_DATE) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_current_token integer;
  v_settings_token integer;
BEGIN
  IF p_center_id IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Get current token from settings
  SELECT current_token INTO v_settings_token
  FROM public.center_queue_settings
  WHERE center_id = p_center_id AND appointment_date = p_queue_date;

  -- Get current token from highest active appointment status (called/in_progress)
  SELECT COALESCE(MAX(token_number), 0) INTO v_current_token
  FROM public.appointments
  WHERE center_id = p_center_id
    AND appointment_date = p_queue_date
    AND status IN ('called', 'in_progress');
    
  RETURN GREATEST(COALESCE(v_settings_token, 0), COALESCE(v_current_token, 0));
END;
$$;


ALTER FUNCTION "public"."get_current_token"("p_center_id" "uuid", "p_queue_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_doctor_availability"("p_doctor_id" "uuid") RETURNS TABLE("status" "text", "tokens_ahead" integer, "estimated_wait_minutes" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_day_of_week int := extract(dow from (now() at time zone 'Asia/Karachi'));
  v_now time := (now() at time zone 'Asia/Karachi')::time;
  v_schedule record;
  v_on_leave boolean;
  v_on_break boolean;
  v_tokens_today int;
  v_avg_consultation_time numeric;
  v_max_tokens int;
BEGIN
  -- 1. Check Leaves
  SELECT EXISTS (
    SELECT 1 FROM public.doctor_leaves
    WHERE doctor_id = p_doctor_id AND leave_date = (CURRENT_DATE at time zone 'Asia/Karachi')::date
  ) INTO v_on_leave;
  IF v_on_leave THEN
    RETURN QUERY SELECT 'on_leave'::text, 0, 0;
    RETURN;
  END IF;
  -- 2. Check Weekly Schedule from doctor_availability table
  SELECT * INTO v_schedule FROM public.doctor_availability
  WHERE doctor_id = p_doctor_id AND day_of_week = v_day_of_week;
  IF v_schedule IS NULL OR NOT v_schedule.is_available OR v_now < v_schedule.start_time OR v_now > v_schedule.end_time THEN
    RETURN QUERY SELECT 'not_working'::text, 0, 0;
    RETURN;
  END IF;
  -- 3. Check Break Status (Staff Toggle)
  SELECT is_on_break INTO v_on_break FROM public.doctors WHERE id = p_doctor_id;
  IF v_on_break THEN
    RETURN QUERY SELECT 'on_break'::text, 0, 0;
    RETURN;
  END IF;
  -- 4. Count Today's Active Tokens
  SELECT count(*)::int INTO v_tokens_today FROM public.appointments a
  WHERE a.doctor_id = p_doctor_id
    AND a.appointment_date = (CURRENT_DATE at time zone 'Asia/Karachi')::date
    AND a.status NOT IN ('cancelled');
  -- 5. Calculate Max Tokens (dynamically based on schedule start/end time and slot duration)
  v_max_tokens := COALESCE(NULLIF(((extract(epoch from (v_schedule.end_time::time - v_schedule.start_time::time)) / 60) / COALESCE(v_schedule.slot_duration, 15))::int, 0), 40);
  -- 6. Check Token Limits
  IF v_tokens_today >= v_max_tokens THEN
    RETURN QUERY SELECT 'fully_booked'::text, 0, 0;
    RETURN;
  END IF;
  -- 7. Resolve average consultation time from doctor settings
  SELECT COALESCE(average_consultation_time, 10.0) INTO v_avg_consultation_time
  FROM public.doctor_queue_settings
  WHERE doctor_id = p_doctor_id;
  IF v_avg_consultation_time IS NULL THEN
    v_avg_consultation_time := 10.0;
  END IF;
  RETURN QUERY
  SELECT
    CASE WHEN v_tokens_today > 15 THEN 'busy'::text ELSE 'available'::text END,
    v_tokens_today,
    (v_tokens_today * v_avg_consultation_time)::integer;
END;
$$;


ALTER FUNCTION "public"."get_doctor_availability"("p_doctor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_doctor_income_summary"("p_doctor_id" "uuid") RETURNS TABLE("today_appointments_count" bigint, "completed_count" bigint, "total_fee" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(a.id)::bigint AS today_appointments_count,
    COUNT(CASE WHEN a.status = 'completed' THEN 1 END)::bigint AS completed_count,
    COALESCE(SUM(CASE WHEN a.status = 'completed' THEN d.fee ELSE 0.0 END), 0.0)::numeric AS total_fee
  FROM public.appointments a
  INNER JOIN public.doctors d ON a.doctor_id = d.id
  WHERE a.doctor_id = p_doctor_id
    AND a.appointment_date = CURRENT_DATE;
END;
$$;


ALTER FUNCTION "public"."get_doctor_income_summary"("p_doctor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_doctor_queue_snapshot"("p_doctor_id" "uuid", "p_queue_date" "date" DEFAULT CURRENT_DATE) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_settings public.doctor_queue_settings%ROWTYPE;
  v_current_token integer;
  v_next_token integer;
  v_is_on_break boolean;
BEGIN
  INSERT INTO public.doctor_queue_settings (doctor_id)
  VALUES (p_doctor_id)
  ON CONFLICT (doctor_id) DO NOTHING;
  SELECT * INTO v_settings FROM public.doctor_queue_settings WHERE doctor_id = p_doctor_id;
  SELECT COALESCE(MAX(token_number), 0) INTO v_current_token
  FROM public.appointments
  WHERE doctor_id = p_doctor_id
    AND appointment_date = p_queue_date
    AND status IN ('called', 'in_progress');
  v_current_token := GREATEST(COALESCE(v_settings.current_token, 0), COALESCE(v_current_token, 0));
  SELECT COALESCE(MAX(token_number), 0) + 1 INTO v_next_token
  FROM public.appointments
  WHERE doctor_id = p_doctor_id
    AND appointment_date = p_queue_date;
  v_is_on_break := COALESCE(v_settings.is_on_break, false)
    OR (
      v_settings.break_start IS NOT NULL
      AND v_settings.break_start <= now()
      AND (v_settings.break_end IS NULL OR v_settings.break_end > now())
    );
  RETURN jsonb_build_object(
    'doctor_id', p_doctor_id,
    'queue_date', p_queue_date,
    'current_token', v_current_token,
    'next_token', v_next_token,
    'doctor_average_time', COALESCE(v_settings.average_consultation_time, 10.0),
    'average_consultation_time', COALESCE(v_settings.average_consultation_time, 10.0),
    'is_on_break', v_is_on_break,
    'break_start', v_settings.break_start,
    'break_end', v_settings.break_end
  );
END;
$$;


ALTER FUNCTION "public"."get_doctor_queue_snapshot"("p_doctor_id" "uuid", "p_queue_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_doctor_recent_patients"("p_doctor_id" "uuid") RETURNS TABLE("patient_name" "text", "last_appointment_date" "date", "status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  WITH unique_patients AS (
    SELECT DISTINCT ON (a.user_id)
      p.full_name AS p_name,
      a.appointment_date AS last_date,
      a.status::text AS last_status,
      a.scheduled_at AS sched_at
    FROM public.appointments a
    INNER JOIN public.profiles p ON a.user_id = p.id AND p.role = 'client'
    WHERE a.doctor_id = p_doctor_id
    ORDER BY a.user_id, a.appointment_date DESC, a.scheduled_at DESC
  )
  SELECT 
    up.p_name AS patient_name,
    up.last_date AS last_appointment_date,
    up.last_status AS status
  FROM unique_patients up
  ORDER BY up.sched_at DESC
  LIMIT 20;
END;
$$;


ALTER FUNCTION "public"."get_doctor_recent_patients"("p_doctor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_doctor_schedule"("p_doctor_id" "uuid") RETURNS TABLE("day_of_week" integer, "start_time" time without time zone, "end_time" time without time zone, "slot_duration" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  select ds.day_of_week, ds.start_time, ds.end_time, ds.slot_duration_minutes
  from doctor_schedules ds
  where ds.doctor_id = p_doctor_id
  order by ds.day_of_week asc;
end;
$$;


ALTER FUNCTION "public"."get_doctor_schedule"("p_doctor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_doctor_today_appointments"("p_doctor_id" "uuid") RETURNS TABLE("appointment_id" "uuid", "patient_name" "text", "appointment_time" "text", "status" "text", "token_number" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id AS appointment_id,
    p.full_name AS patient_name,
    a.appointment_time::text AS appointment_time,
    a.status::text AS status,
    a.token_number::int AS token_number
  FROM public.appointments a
  INNER JOIN public.profiles p ON a.user_id = p.id
  WHERE a.doctor_id = p_doctor_id
    AND a.appointment_date = CURRENT_DATE
  ORDER BY a.token_number ASC;
END;
$$;


ALTER FUNCTION "public"."get_doctor_today_appointments"("p_doctor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_doctors_availability_batch"("p_doctor_ids" "uuid"[]) RETURNS TABLE("doctor_id" "uuid", "status" "text", "tokens_ahead" integer, "estimated_wait_minutes" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_day_of_week int := extract(dow from (now() at time zone 'Asia/Karachi'));
  v_now time := (now() at time zone 'Asia/Karachi')::time;
begin
  return query
  select
    d.id,
    case
      when dl.leave_date is not null then 'on_leave'
      when ds.doctor_id is null or v_now < ds.start_time or v_now > ds.end_time then 'not_working'
      when d.is_on_break then 'on_break'
      when coalesce(tok.tokens_today,0) >= coalesce(ds.max_tokens_per_day, 999999) then 'fully_booked'
      when coalesce(tok.tokens_today,0) > 15 then 'busy'
      else 'available'
    end,
    coalesce(tok.tokens_today,0),
    (coalesce(tok.tokens_today,0) * coalesce(dqs.average_consultation_time,10.0))::int
  from doctors d
  left join doctor_schedules ds on ds.doctor_id = d.id and ds.day_of_week = v_day_of_week
  left join doctor_leaves dl on dl.doctor_id = d.id and dl.leave_date = current_date
  left join doctor_queue_settings dqs on dqs.doctor_id = d.id
  left join (
    select a.doctor_id, count(*)::int as tokens_today
    from appointments a
    where a.appointment_date = current_date and a.status not in ('cancelled')
    group by a.doctor_id
  ) tok on tok.doctor_id = d.id
  where d.id = any(p_doctor_ids);
end;
$$;


ALTER FUNCTION "public"."get_doctors_availability_batch"("p_doctor_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_staff_context"() RETURNS TABLE("role" "text", "is_doctor" boolean, "doctor_id" "uuid")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select p.role, (d.id is not null), d.id
  from profiles p
  left join doctors d on d.profile_id = p.id
  where p.id = auth.uid();
$$;


ALTER FUNCTION "public"."get_my_staff_context"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_nearby_centers"("p_lat" numeric, "p_lng" numeric, "p_radius_km" numeric DEFAULT 15) RETURNS TABLE("id" "uuid", "name" "text", "address" "text", "city" "text", "latitude" numeric, "longitude" numeric, "open_time" time without time zone, "close_time" time without time zone, "image_url" "text", "distance_km" numeric)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select * from (
    select
      c.id, c.name, c.address, c.city, c.latitude, c.longitude, c.open_time, c.close_time, c.image_url,
      round((6371 * acos(
        least(1.0, greatest(-1.0,
          cos(radians(p_lat)) * cos(radians(c.latitude)) * cos(radians(c.longitude) - radians(p_lng))
          + sin(radians(p_lat)) * sin(radians(c.latitude))
        ))
      ))::numeric, 1) as distance_km
    from service_centers c
    where c.latitude is not null and c.longitude is not null
  ) sub
  where distance_km <= p_radius_km
  order by distance_km asc;
$$;


ALTER FUNCTION "public"."get_nearby_centers"("p_lat" numeric, "p_lng" numeric, "p_radius_km" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_next_token"("p_center_id" "uuid", "p_appointment_date" "date") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_next_token integer;
BEGIN
  IF p_center_id IS NULL OR p_appointment_date IS NULL THEN
    RAISE EXCEPTION 'center_id and appointment_date required';
  END IF;
  
  -- Advisory lock to serialize token allocation for the specific center + date
  PERFORM pg_advisory_xact_lock(hashtext(p_center_id::text || ':' || p_appointment_date::text));
  
  INSERT INTO public.center_daily_tokens (center_id, appointment_date, last_token_number, updated_at)
  VALUES (p_center_id, p_appointment_date, 1, now())
  ON CONFLICT (center_id, appointment_date)
  DO UPDATE SET last_token_number = public.center_daily_tokens.last_token_number + 1, updated_at = now()
  RETURNING last_token_number INTO v_next_token;
  
  RETURN v_next_token;
END;
$$;


ALTER FUNCTION "public"."get_next_token"("p_center_id" "uuid", "p_appointment_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_role"() RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."get_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    'client',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_profiles_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_profiles_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_doctor"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'doctor'
  );
$$;


ALTER FUNCTION "public"."is_doctor"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_staff"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  RETURN (v_role = 'staff');
END;
$$;


ALTER FUNCTION "public"."is_staff"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lock_slot"("p_doctor_id" "uuid", "p_center_id" "uuid", "p_date" "date", "p_time" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_lock_id uuid;
begin
  delete from slot_locks where expires_at <= now();

  if exists (
    select 1 from appointments
    where doctor_id = p_doctor_id and appointment_date = p_date and status <> 'cancelled'
      and to_char(appointment_time,'HH12:MI AM') = p_time
  ) then
    raise exception 'Slot already booked';
  end if;

  if exists (
    select 1 from slot_locks
    where doctor_id = p_doctor_id and appointment_date = p_date and appointment_time = p_time
      and expires_at > now()
  ) then
    raise exception 'Slot currently locked by someone else';
  end if;

  insert into slot_locks (user_id, doctor_id, center_id, appointment_date, appointment_time, locked_at, expires_at)
  values (auth.uid(), p_doctor_id, p_center_id, p_date, p_time, now(), now() + interval '10 minutes')
  returning id into v_lock_id;

  return v_lock_id;
end;
$$;


ALTER FUNCTION "public"."lock_slot"("p_doctor_id" "uuid", "p_center_id" "uuid", "p_date" "date", "p_time" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_appointment_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Log the status change into history
    IF (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status) THEN
        INSERT INTO public.appointment_status_history (appointment_id, status, notes, changed_by)
        VALUES (NEW.id, NEW.status, NEW.notes, auth.uid());
        
        -- Send specific notifications based on the exact status
        IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
            INSERT INTO public.notifications (user_id, type, title, message, data)
            VALUES (NEW.user_id, 'appointment_booked', 'Appointment Booked', 'Your appointment has been successfully booked and is pending confirmation.', jsonb_build_object('appointment_id', NEW.id));
        ELSIF NEW.status = 'confirmed' THEN
            INSERT INTO public.notifications (user_id, type, title, message, data)
            VALUES (NEW.user_id, 'appointment_confirmed', 'Appointment Confirmed', 'Your appointment has been confirmed by the staff.', jsonb_build_object('appointment_id', NEW.id));
        ELSIF NEW.status = 'called' THEN
            INSERT INTO public.notifications (user_id, type, title, message, data)
            VALUES (NEW.user_id, 'token_called', 'Token Called', 'It''s your turn! Please proceed to the counter.', jsonb_build_object('appointment_id', NEW.id));
        ELSIF NEW.status = 'completed' THEN
            INSERT INTO public.notifications (user_id, type, title, message, data)
            VALUES (NEW.user_id, 'appointment_completed', 'Appointment Completed', 'Thank you for visiting. Your appointment is complete.', jsonb_build_object('appointment_id', NEW.id));
        ELSIF NEW.status = 'cancelled' THEN
            INSERT INTO public.notifications (user_id, type, title, message, data)
            VALUES (NEW.user_id, 'appointment_cancelled', 'Appointment Cancelled', 'Your appointment has been cancelled by the staff.', jsonb_build_object('appointment_id', NEW.id));
        END IF;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_appointment_status_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_cancel"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  insert into notifications (
    user_id,
    title,
    message,
    appointment_id,
    is_read,
    created_at
  )
  values (
    NEW.user_id,
    'Appointment Cancelled',
    'Your appointment has been cancelled',
    NEW.id,
    false,
    now()
  );

  return NEW;
end;
$$;


ALTER FUNCTION "public"."notify_on_cancel"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."people_ahead"("my_token" integer) RETURNS integer
    LANGUAGE "sql"
    AS $$
  SELECT COUNT(*)
  FROM appointments
  WHERE status = 'checked_in'
  AND token_number < my_token;
$$;


ALTER FUNCTION "public"."people_ahead"("my_token" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."people_ahead"("p_appointment_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_appointment public.appointments%ROWTYPE;
  v_current_token integer;
BEGIN
  SELECT * INTO v_appointment
  FROM public.appointments
  WHERE id = p_appointment_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  v_current_token := public.get_current_token(v_appointment.center_id, v_appointment.appointment_date);
  RETURN GREATEST(COALESCE(v_appointment.token_number, 0) - v_current_token, 0);
END;
$$;


ALTER FUNCTION "public"."people_ahead"("p_appointment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_doctor_admin_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_admin() THEN
    NEW.employee_code := OLD.employee_code;
    NEW.license_number := OLD.license_number;
    NEW.fee := OLD.fee;
    NEW.status := OLD.status;
    NEW.center_id := OLD.center_id;
    NEW.is_active := OLD.is_active;
    NEW.profile_id := OLD.profile_id;
    NEW.name := OLD.name;
    NEW.gender := OLD.gender;
    NEW.experience_years := OLD.experience_years;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."protect_doctor_admin_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_profile_privileged_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_admin() THEN
    NEW.role := OLD.role;
    NEW.center_id := OLD.center_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."protect_profile_privileged_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."queue_appointment_date"("p_appointment_date" "date", "p_scheduled_at" timestamp with time zone) RETURNS "date"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT COALESCE(p_appointment_date, (p_scheduled_at AT TIME ZONE 'UTC')::date);
$$;


ALTER FUNCTION "public"."queue_appointment_date"("p_appointment_date" "date", "p_scheduled_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalculate_doctor_average"("p_doctor_id" "uuid") RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_average numeric(10, 2);
BEGIN
  SELECT COALESCE(ROUND(AVG(duration_minutes)::numeric, 2), 10.0)
  INTO v_average
  FROM (
    SELECT duration_minutes
    FROM public.appointments
    WHERE doctor_id = p_doctor_id
      AND status = 'completed'
      AND duration_minutes IS NOT NULL
      AND duration_minutes > 0
    ORDER BY completed_at DESC NULLS LAST
    LIMIT 20
  ) recent_completed;
  INSERT INTO public.doctor_queue_settings (doctor_id, average_consultation_time, updated_at)
  VALUES (p_doctor_id, COALESCE(v_average, 10.0), now())
  ON CONFLICT (doctor_id)
  DO UPDATE SET
    average_consultation_time = EXCLUDED.average_consultation_time,
    updated_at = now();
  RETURN COALESCE(v_average, 10.0);
END;
$$;


ALTER FUNCTION "public"."recalculate_doctor_average"("p_doctor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_live_queue"("p_doctor_id" "uuid", "p_queue_date" "date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_current_token integer;
  v_average numeric(10, 2);
  v_is_on_break boolean;
BEGIN
  INSERT INTO public.doctor_queue_settings (doctor_id)
  VALUES (p_doctor_id)
  ON CONFLICT (doctor_id) DO NOTHING;

  SELECT
    COALESCE(
      NULLIF(current_token, 0),
      (
        SELECT COALESCE(MAX(token_number), 0)
        FROM public.appointments
        WHERE COALESCE(doctor_id, service_id) = p_doctor_id
          AND appointment_date = p_queue_date
          AND status IN ('called', 'in_progress')
      ),
      0
    ),
    COALESCE(average_consultation_time, 10),
    (
      is_on_break
      OR (
        break_start IS NOT NULL
        AND break_start <= now()
        AND (break_end IS NULL OR break_end > now())
      )
    )
  INTO v_current_token, v_average, v_is_on_break
  FROM public.doctor_queue_settings
  WHERE doctor_id = p_doctor_id;

  INSERT INTO public.queue_updates (
    appointment_id,
    current_position,
    people_ahead,
    estimated_wait_mins,
    current_serving_token,
    status
  )
  SELECT
    appointment.id,
    CASE
      WHEN appointment.status IN ('confirmed', 'checked_in')
        THEN GREATEST(appointment.token_number - v_current_token, 1)
      ELSE 0
    END,
    CASE
      WHEN appointment.status IN ('confirmed', 'checked_in')
        THEN GREATEST(appointment.token_number - v_current_token, 0)
      ELSE 0
    END,
    CASE
      WHEN appointment.status IN ('confirmed', 'checked_in')
        THEN GREATEST(appointment.token_number - v_current_token, 0) * v_average
      ELSE 0
    END::integer,
    v_current_token,
    CASE
      WHEN v_is_on_break THEN 'doctor_on_break'
      WHEN appointment.status IN ('called', 'in_progress') THEN 'called'
      WHEN appointment.status = 'checked_in' THEN 'checked_in'
      WHEN appointment.status = 'confirmed' THEN 'waiting'
      ELSE appointment.status
    END
  FROM public.appointments appointment
  WHERE COALESCE(appointment.doctor_id, appointment.service_id) = p_doctor_id
    AND appointment.appointment_date = p_queue_date
    AND appointment.token_number IS NOT NULL;
END;
$$;


ALTER FUNCTION "public"."refresh_live_queue"("p_doctor_id" "uuid", "p_queue_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_slot"("p_lock_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  delete from slot_locks where id = p_lock_id and user_id = auth.uid();
$$;


ALTER FUNCTION "public"."release_slot"("p_lock_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_center_tokens"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  update center_queue_settings
  set current_token = 0,
      today_date = current_date
  where today_date <> current_date;
end;
$$;


ALTER FUNCTION "public"."reset_center_tokens"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_center_break"("p_center_id" "uuid", "p_queue_date" "date", "p_break_start" timestamp with time zone, "p_break_end" timestamp with time zone, "p_is_on_break" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_result public.center_queue_settings%ROWTYPE;
BEGIN
  INSERT INTO public.center_queue_settings (center_id, appointment_date, break_start, break_end, is_on_break, updated_at)
  VALUES (p_center_id, p_queue_date, p_break_start, p_break_end, p_is_on_break, now())
  ON CONFLICT (center_id, appointment_date)
  DO UPDATE SET break_start = EXCLUDED.break_start, break_end = EXCLUDED.break_end, is_on_break = EXCLUDED.is_on_break, updated_at = now()
  RETURNING * INTO v_result;

  RETURN to_jsonb(v_result);
END;
$$;


ALTER FUNCTION "public"."set_center_break"("p_center_id" "uuid", "p_queue_date" "date", "p_break_start" timestamp with time zone, "p_break_end" timestamp with time zone, "p_is_on_break" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_token_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF NEW.token_number IS NULL THEN
        NEW.token_number := public.generate_token_number(NEW.center_id);
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_token_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."staff_performance"("p_range" "text") RETURNS TABLE("staff_name" "text", "completed_count" bigint, "avg_time_minutes" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_start_date timestamptz;
BEGIN
  IF p_range = 'today' THEN
    v_start_date := CURRENT_DATE;
  ELSIF p_range = 'week' THEN
    v_start_date := CURRENT_DATE - INTERVAL '7 days';
  ELSIF p_range = 'month' THEN
    v_start_date := CURRENT_DATE - INTERVAL '30 days';
  ELSE
    v_start_date := '1970-01-01'::timestamptz;
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(d.name, 'Any Available Doctor')::text as staff_name,
    COUNT(a.id)::bigint as completed_count,
    ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM (a.completed_at - a.called_at))::numeric / 60), 0), 2) as avg_time_minutes
  FROM public.appointments a
  LEFT JOIN public.doctors d ON d.id = a.doctor_id
  WHERE a.status = 'completed'
    AND a.called_at IS NOT NULL
    AND a.completed_at IS NOT NULL
    AND a.scheduled_at >= v_start_date
  GROUP BY COALESCE(d.name, 'Any Available Doctor')
  ORDER BY COUNT(a.id) DESC;
END;
$$;


ALTER FUNCTION "public"."staff_performance"("p_range" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_service"("p_appointment_id" "uuid") RETURNS "public"."appointments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  target_appointment public.appointments%ROWTYPE;
BEGIN
  SELECT * INTO target_appointment
  FROM public.appointments
  WHERE id = p_appointment_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  UPDATE public.appointments
  SET status = 'in_progress', started_at = COALESCE(started_at, now()), called_at = COALESCE(called_at, now())
  WHERE id = p_appointment_id
  RETURNING * INTO target_appointment;

  RETURN target_appointment;
END;
$$;


ALTER FUNCTION "public"."start_service"("p_appointment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_center_queue_after_appointment_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_queue_date date;
BEGIN
  IF NEW.center_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  v_queue_date := COALESCE(NEW.appointment_date, (NEW.scheduled_at AT TIME ZONE 'UTC')::date, CURRENT_DATE);

  -- Ensure settings row exists
  INSERT INTO public.center_queue_settings (center_id, appointment_date, current_token, updated_at)
  VALUES (NEW.center_id, v_queue_date, COALESCE(NEW.token_number, 0), now())
  ON CONFLICT (center_id, appointment_date) DO NOTHING;

  -- Advance the current token if this appointment was called/in_progress
  IF NEW.status IN ('called', 'in_progress') AND NEW.token_number IS NOT NULL THEN
    UPDATE public.center_queue_settings
    SET current_token = GREATEST(current_token, NEW.token_number), updated_at = now()
    WHERE center_id = NEW.center_id AND appointment_date = v_queue_date;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_center_queue_after_appointment_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_live_queue_after_appointment_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND (
      OLD.center_id IS DISTINCT FROM NEW.center_id
      OR OLD.scheduled_at::date IS DISTINCT FROM NEW.scheduled_at::date
    )
  THEN
    PERFORM public.refresh_live_queue(
      OLD.center_id,
      OLD.scheduled_at::date
    );
  END IF;

  PERFORM public.refresh_live_queue(
    NEW.center_id,
    NEW.scheduled_at::date
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_live_queue_after_appointment_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_queue_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $_$
DECLARE
  v_payload jsonb;
  v_url text;
  v_has_net boolean; -- This variable must be declared here!
BEGIN
  -- Kong Gateway URL for Supabase Edge Functions
  v_url := 'http://kong:8000/functions/v1/send-queue-notification';
  -- Trigger notification on:
  -- 1. INSERT if status is 'confirmed'
  -- 2. UPDATE if status transitions to a new value
  IF (TG_OP = 'INSERT' AND NEW.status = 'confirmed') OR
     (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status)
  THEN
    v_payload := jsonb_build_object(
      'type', TG_OP,
      'table', 'appointments',
      'record', jsonb_build_object(
        'id', NEW.id,
        'user_id', NEW.user_id,
        'status', NEW.status,
        'token_number', NEW.token_number,
        'center_id', NEW.center_id,
        'doctor_id', NEW.doctor_id,
        'appointment_date', NEW.appointment_date,
        'cancelled_by', NEW.cancelled_by,
        'old_status', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END
      )
    );
    -- Check if pg_net is actually installed in the database
    SELECT EXISTS (
      SELECT 1 FROM pg_extension WHERE extname = 'pg_net'
    ) OR EXISTS (
      SELECT 1 FROM pg_namespace WHERE nspname = 'net'
    ) INTO v_has_net;
    IF v_has_net THEN
      BEGIN
        EXECUTE 'SELECT net.http_post(
          url := $1,
          headers := $2,
          body := $3
        )' USING v_url, '{"Content-Type": "application/json"}'::jsonb, v_payload;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to execute net.http_post: %', SQLERRM;
      END;
    ELSE
      RAISE WARNING 'pg_net extension is not enabled in database. Skipping edge function call.';
    END IF;
  END IF;
  RETURN NEW;
END;
$_$;


ALTER FUNCTION "public"."trigger_queue_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_center_average_consultation_time"("p_center_id" "uuid", "p_queue_date" "date", "p_avg_mins" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_result public.center_queue_settings%ROWTYPE;
BEGIN
  INSERT INTO public.center_queue_settings (center_id, appointment_date, average_consultation_time, updated_at)
  VALUES (p_center_id, p_queue_date, p_avg_mins, now())
  ON CONFLICT (center_id, appointment_date)
  DO UPDATE SET average_consultation_time = EXCLUDED.average_consultation_time, updated_at = now()
  RETURNING * INTO v_result;

  RETURN to_jsonb(v_result);
END;
$$;


ALTER FUNCTION "public"."update_center_average_consultation_time"("p_center_id" "uuid", "p_queue_date" "date", "p_avg_mins" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_fcm_token"("p_token" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.profiles SET fcm_token = p_token, updated_at = now() WHERE id::text = auth.uid()::text;
END; $$;


ALTER FUNCTION "public"."update_user_fcm_token"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_appointment_status_transition"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- If status is not changing, allow it
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Terminal states cannot be changed
  IF OLD.status IN ('completed', 'cancelled', 'expired', 'no_show', 'skipped') THEN
    RAISE EXCEPTION 'Cannot transition from terminal status "%" to "%"', OLD.status, NEW.status;
  END IF;

  -- Validate allowed state transitions
  IF OLD.status = 'pending' THEN
    IF NEW.status NOT IN ('confirmed', 'cancelled', 'expired') THEN
      RAISE EXCEPTION 'Invalid transition from pending to "%"', NEW.status;
    END IF;
  ELSIF OLD.status = 'confirmed' THEN
    IF NEW.status NOT IN ('checked_in', 'called', 'cancelled', 'expired') THEN
      RAISE EXCEPTION 'Invalid transition from confirmed to "%"', NEW.status;
    END IF;
  ELSIF OLD.status = 'checked_in' THEN
    IF NEW.status NOT IN ('called', 'cancelled', 'expired') THEN
      RAISE EXCEPTION 'Invalid transition from checked_in to "%"', NEW.status;
    END IF;
  ELSIF OLD.status = 'called' THEN
    IF NEW.status NOT IN ('in_progress', 'completed', 'no_show', 'cancelled', 'skipped') THEN
      RAISE EXCEPTION 'Invalid transition from called to "%"', NEW.status;
    END IF;
  ELSIF OLD.status = 'in_progress' THEN
    IF NEW.status NOT IN ('completed', 'no_show', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid transition from in_progress to "%"', NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_appointment_status_transition"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."center_queue_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "center_id" "uuid" NOT NULL,
    "current_token" integer DEFAULT 0,
    "today_date" "date" DEFAULT CURRENT_DATE,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "appointment_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "is_on_break" boolean DEFAULT false,
    "break_start" timestamp with time zone,
    "break_end" timestamp with time zone,
    "average_consultation_time" numeric(10,2) DEFAULT 10.0,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."center_queue_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."doctor_queue_settings" (
    "doctor_id" "uuid" NOT NULL,
    "current_token" integer DEFAULT 0 NOT NULL,
    "average_consultation_time" numeric(10,2) DEFAULT 10 NOT NULL,
    "break_start" timestamp with time zone,
    "break_end" timestamp with time zone,
    "is_on_break" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."doctor_queue_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."doctors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "center_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "specialty" "text" NOT NULL,
    "qualification" "text",
    "experience_years" integer DEFAULT 0 NOT NULL,
    "photo_url" "text",
    "bio" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "is_on_break" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "profile_id" "uuid",
    "employee_code" "text",
    "license_number" "text",
    "gender" "text",
    "fee" numeric,
    "status" "text" DEFAULT 'active'::"text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."doctors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "full_name" "text" DEFAULT ''::"text",
    "email" "text" DEFAULT ''::"text",
    "phone" "text" DEFAULT ''::"text",
    "avatar_url" "text" DEFAULT ''::"text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "role" "text" DEFAULT 'client'::"text" NOT NULL,
    "auth_provider" "text" DEFAULT 'email'::"text",
    "center_id" "uuid",
    "fcm_token" "text",
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['client'::"text", 'staff'::"text", 'admin'::"text", 'doctor'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."queue_updates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "appointment_id" "uuid" NOT NULL,
    "current_position" integer DEFAULT 0,
    "people_ahead" integer DEFAULT 0,
    "estimated_wait_mins" integer DEFAULT 0,
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "uuid",
    "current_serving_token" integer
);


ALTER TABLE "public"."queue_updates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_centers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "city" "text" NOT NULL,
    "address" "text" NOT NULL,
    "image_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "category" "text",
    "open_time" time without time zone,
    "close_time" time without time zone,
    "latitude" numeric,
    "longitude" numeric,
    CONSTRAINT "service_centers_latitude_valid" CHECK ((("latitude" IS NULL) OR (("latitude" >= ('-90'::integer)::numeric) AND ("latitude" <= (90)::numeric)))),
    CONSTRAINT "service_centers_longitude_valid" CHECK ((("longitude" IS NULL) OR (("longitude" >= ('-180'::integer)::numeric) AND ("longitude" <= (180)::numeric))))
);


ALTER TABLE "public"."service_centers" OWNER TO "postgres";


COMMENT ON COLUMN "public"."service_centers"."category" IS 'Center category used for browsing and filtering.';



COMMENT ON COLUMN "public"."service_centers"."open_time" IS 'Daily opening time shown in the center details flow.';



COMMENT ON COLUMN "public"."service_centers"."close_time" IS 'Daily closing time shown in the center details flow.';



CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "center_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "duration_minutes" integer DEFAULT 15 NOT NULL,
    "price" numeric(10,2),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "on_duty_note" "text"
);


ALTER TABLE "public"."services" OWNER TO "postgres";


COMMENT ON COLUMN "public"."services"."on_duty_note" IS 'Optional message from the on-duty doctor or general notes about the department availability.';



CREATE OR REPLACE VIEW "public"."appointments_full" WITH ("security_invoker"='true') AS
 WITH "latest_queue_updates" AS (
         SELECT DISTINCT ON ("queue_updates"."appointment_id") "queue_updates"."appointment_id",
            "queue_updates"."current_position",
            "queue_updates"."people_ahead",
            "queue_updates"."estimated_wait_mins",
            "queue_updates"."current_serving_token",
            "queue_updates"."status" AS "queue_status"
           FROM "public"."queue_updates"
          ORDER BY "queue_updates"."appointment_id", "queue_updates"."created_at" DESC
        )
 SELECT "appointments"."id",
    "appointments"."user_id",
    "profiles"."full_name" AS "patient_name",
    "appointments"."center_id",
    "appointments"."service_id",
    "appointments"."doctor_id",
    "doctors"."name" AS "doctor_name",
    "service_centers"."name" AS "center_name",
    "services"."name" AS "service_name",
    "appointments"."scheduled_at",
    "appointments"."appointment_date",
    "appointments"."appointment_time",
    "appointments"."status",
    "appointments"."token_number",
    "appointments"."notes",
    "appointments"."cancel_reason",
    "appointments"."cancelled_by",
    "appointments"."cancelled_at",
    "appointments"."checked_in_at",
    "appointments"."called_at",
    "appointments"."started_at",
    "appointments"."completed_at",
    "appointments"."skipped_at",
    "appointments"."duration_minutes",
    "appointments"."created_at",
    COALESCE("latest_queue_updates"."estimated_wait_mins", "appointments"."estimated_wait_mins") AS "estimated_wait_mins",
    COALESCE("latest_queue_updates"."estimated_wait_mins", "appointments"."estimated_wait_mins") AS "estimated_wait_time",
    "latest_queue_updates"."current_position",
    "latest_queue_updates"."current_position" AS "queue_position",
    "latest_queue_updates"."people_ahead",
    "latest_queue_updates"."queue_status",
    "latest_queue_updates"."current_serving_token",
    "latest_queue_updates"."current_serving_token" AS "current_token",
    COALESCE(
        CASE
            WHEN ("appointments"."doctor_id" IS NOT NULL) THEN "doctor_queue_settings"."average_consultation_time"
            ELSE "center_queue_settings"."average_consultation_time"
        END, 10.0) AS "doctor_average_time",
    COALESCE(
        CASE
            WHEN ("appointments"."doctor_id" IS NOT NULL) THEN "doctor_queue_settings"."average_consultation_time"
            ELSE "center_queue_settings"."average_consultation_time"
        END, 10.0) AS "average_consultation_time",
        CASE
            WHEN ("appointments"."doctor_id" IS NOT NULL) THEN (COALESCE("doctor_queue_settings"."is_on_break", false) OR (("doctor_queue_settings"."break_start" IS NOT NULL) AND ("doctor_queue_settings"."break_start" <= "now"()) AND (("doctor_queue_settings"."break_end" IS NULL) OR ("doctor_queue_settings"."break_end" > "now"()))))
            ELSE (COALESCE("center_queue_settings"."is_on_break", false) OR (("center_queue_settings"."break_start" IS NOT NULL) AND ("center_queue_settings"."break_start" <= "now"()) AND (("center_queue_settings"."break_end" IS NULL) OR ("center_queue_settings"."break_end" > "now"()))))
        END AS "is_on_break",
        CASE
            WHEN ("appointments"."doctor_id" IS NOT NULL) THEN "doctor_queue_settings"."break_start"
            ELSE "center_queue_settings"."break_start"
        END AS "break_start",
        CASE
            WHEN ("appointments"."doctor_id" IS NOT NULL) THEN "doctor_queue_settings"."break_end"
            ELSE "center_queue_settings"."break_end"
        END AS "break_end"
   FROM ((((((("public"."appointments"
     LEFT JOIN "public"."profiles" ON (("profiles"."id" = "appointments"."user_id")))
     LEFT JOIN "public"."service_centers" ON (("service_centers"."id" = "appointments"."center_id")))
     LEFT JOIN "public"."services" ON (("services"."id" = "appointments"."service_id")))
     LEFT JOIN "public"."doctors" ON (("doctors"."id" = "appointments"."doctor_id")))
     LEFT JOIN "latest_queue_updates" ON (("latest_queue_updates"."appointment_id" = "appointments"."id")))
     LEFT JOIN "public"."center_queue_settings" ON ((("center_queue_settings"."center_id" = "appointments"."center_id") AND ("center_queue_settings"."appointment_date" = "appointments"."appointment_date"))))
     LEFT JOIN "public"."doctor_queue_settings" ON (("doctor_queue_settings"."doctor_id" = "appointments"."doctor_id")));


ALTER VIEW "public"."appointments_full" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "staff_user_id" "uuid",
    "appointment_id" "uuid",
    "action" "text" NOT NULL,
    "old_status" "text",
    "new_status" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."center_daily_tokens" (
    "center_id" "uuid" NOT NULL,
    "appointment_date" "date" NOT NULL,
    "last_token_number" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."center_daily_tokens" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."current_token_view" AS
 SELECT "min"("token_number") AS "current_token"
   FROM "public"."appointments"
  WHERE ("status" = 'checked_in'::"text");


ALTER VIEW "public"."current_token_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."device_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "fcm_token" "text" NOT NULL,
    "platform" "text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."device_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."doctor_leaves" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "leave_date" "date" NOT NULL,
    "reason" "text"
);


ALTER TABLE "public"."doctor_leaves" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."doctor_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "day_of_week" integer NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "max_tokens_per_day" integer DEFAULT 40 NOT NULL,
    "slot_duration_minutes" integer DEFAULT 15 NOT NULL,
    "is_available" boolean DEFAULT true NOT NULL,
    CONSTRAINT "doctor_schedules_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6)))
);


ALTER TABLE "public"."doctor_schedules" OWNER TO "postgres";


COMMENT ON COLUMN "public"."doctor_schedules"."is_available" IS 'Whether the doctor accepts bookings on this day_of_week row. Off Day toggle in the doctor Availability screen writes this.';



CREATE TABLE IF NOT EXISTS "public"."doctor_services" (
    "doctor_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL
);


ALTER TABLE "public"."doctor_services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "appointment_id" "uuid",
    "type" "text",
    "data" "jsonb"
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."queue_view" AS
 SELECT "id",
    "user_id",
    "center_id",
    "service_id",
    "appointment_date",
    "appointment_time",
    "scheduled_at",
    "token_number",
    "status",
    "estimated_wait_mins",
    "notes",
    "created_at",
    "approved_by",
    "approved_at",
    "cancelled_by",
    "cancelled_at",
    "cancellation_reason",
    "completed_at",
    "cancel_reason",
    "queue_position",
    "called_at",
    "checked_in_at",
    "started_at",
    "is_currently_serving"
   FROM "public"."appointments"
  WHERE ("status" = 'checked_in'::"text")
  ORDER BY "token_number";


ALTER VIEW "public"."queue_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."slot_locks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "center_id" "uuid",
    "appointment_date" "date" NOT NULL,
    "appointment_time" "text" NOT NULL,
    "locked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '00:10:00'::interval) NOT NULL,
    "doctor_id" "uuid"
);


ALTER TABLE "public"."slot_locks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_centers" (
    "profile_id" "uuid" NOT NULL,
    "center_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."staff_centers" OWNER TO "postgres";


ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."center_daily_tokens"
    ADD CONSTRAINT "center_daily_tokens_pkey" PRIMARY KEY ("center_id", "appointment_date");



ALTER TABLE ONLY "public"."center_queue_settings"
    ADD CONSTRAINT "center_queue_settings_pkey" PRIMARY KEY ("center_id", "appointment_date");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "center_services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_centers"
    ADD CONSTRAINT "centers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."device_tokens"
    ADD CONSTRAINT "device_tokens_fcm_token_key" UNIQUE ("fcm_token");



ALTER TABLE ONLY "public"."device_tokens"
    ADD CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."doctor_leaves"
    ADD CONSTRAINT "doctor_leaves_doctor_id_leave_date_key" UNIQUE ("doctor_id", "leave_date");



ALTER TABLE ONLY "public"."doctor_leaves"
    ADD CONSTRAINT "doctor_leaves_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."doctor_queue_settings"
    ADD CONSTRAINT "doctor_queue_settings_pkey" PRIMARY KEY ("doctor_id");



ALTER TABLE ONLY "public"."doctor_schedules"
    ADD CONSTRAINT "doctor_schedules_doctor_id_day_of_week_key" UNIQUE ("doctor_id", "day_of_week");



ALTER TABLE ONLY "public"."doctor_schedules"
    ADD CONSTRAINT "doctor_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."doctor_services"
    ADD CONSTRAINT "doctor_services_pkey" PRIMARY KEY ("doctor_id", "service_id");



ALTER TABLE ONLY "public"."doctors"
    ADD CONSTRAINT "doctors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."queue_updates"
    ADD CONSTRAINT "queue_updates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."slot_locks"
    ADD CONSTRAINT "slot_locks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_centers"
    ADD CONSTRAINT "staff_centers_pkey" PRIMARY KEY ("profile_id", "center_id");



CREATE INDEX "idx_appointments_cancelled_at" ON "public"."appointments" USING "btree" ("cancelled_at");



CREATE INDEX "idx_appointments_center" ON "public"."appointments" USING "btree" ("center_id");



CREATE INDEX "idx_appointments_center_queue" ON "public"."appointments" USING "btree" ("center_id", "scheduled_at", "status", "token_number");



CREATE INDEX "idx_appointments_doctor_created_at" ON "public"."appointments" USING "btree" ("doctor_id", "created_at");



CREATE INDEX "idx_appointments_doctor_date" ON "public"."appointments" USING "btree" ("doctor_id", "appointment_date");



CREATE UNIQUE INDEX "idx_appointments_one_active_per_slot_center" ON "public"."appointments" USING "btree" ("center_id", "appointment_date", "appointment_time") WHERE (("doctor_id" IS NULL) AND ("status" <> 'cancelled'::"text"));



CREATE UNIQUE INDEX "idx_appointments_one_active_per_slot_doctor" ON "public"."appointments" USING "btree" ("doctor_id", "appointment_date", "appointment_time") WHERE (("doctor_id" IS NOT NULL) AND ("status" <> 'cancelled'::"text"));



CREATE INDEX "idx_appointments_queue" ON "public"."appointments" USING "btree" ("status", "token_number");



CREATE INDEX "idx_appointments_status_token" ON "public"."appointments" USING "btree" ("status", "token_number");



CREATE INDEX "idx_appointments_user" ON "public"."appointments" USING "btree" ("user_id");



CREATE INDEX "idx_audit_logs_appointment_created_at" ON "public"."audit_logs" USING "btree" ("appointment_id", "created_at" DESC);



CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_profiles_role" ON "public"."profiles" USING "btree" ("role");



CREATE INDEX "idx_service_centers_coordinates" ON "public"."service_centers" USING "btree" ("latitude", "longitude") WHERE (("latitude" IS NOT NULL) AND ("longitude" IS NOT NULL));



CREATE INDEX "idx_service_centers_location" ON "public"."service_centers" USING "btree" ("latitude", "longitude");



CREATE INDEX "idx_slot_locks_expiry" ON "public"."slot_locks" USING "btree" ("center_id", "appointment_date", "expires_at");



CREATE INDEX "profiles_role_idx" ON "public"."profiles" USING "btree" ("role");



CREATE UNIQUE INDEX "unique_center_date_token_null_doctor" ON "public"."appointments" USING "btree" ("center_id", "appointment_date", "token_number") WHERE (("doctor_id" IS NULL) AND ("status" <> 'cancelled'::"text"));



CREATE UNIQUE INDEX "unique_doctor_date_token" ON "public"."appointments" USING "btree" ("doctor_id", "appointment_date", "token_number") WHERE (("doctor_id" IS NOT NULL) AND ("status" <> 'cancelled'::"text"));



CREATE OR REPLACE TRIGGER "appointment_cancel_notification" AFTER UPDATE ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."create_notification_on_cancel"();



CREATE OR REPLACE TRIGGER "appointment_created_notification" AFTER INSERT ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."create_notification_on_appointment"();



CREATE OR REPLACE TRIGGER "assign_appointment_token_number_trigger" BEFORE INSERT OR UPDATE OF "center_id", "scheduled_at", "appointment_date", "token_number", "doctor_id" ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."assign_appointment_token_number"();



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "protect_doctor_admin_fields_trigger" BEFORE UPDATE ON "public"."doctors" FOR EACH ROW EXECUTE FUNCTION "public"."protect_doctor_admin_fields"();



CREATE OR REPLACE TRIGGER "protect_profile_privileged_fields_trigger" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_profile_privileged_fields"();



CREATE OR REPLACE TRIGGER "queue_notification_trigger" AFTER INSERT OR UPDATE OF "status" ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_queue_notification"();



CREATE OR REPLACE TRIGGER "set_daily_token_number" BEFORE INSERT ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."generate_daily_token"();



CREATE OR REPLACE TRIGGER "set_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_profiles_updated_at"();



CREATE OR REPLACE TRIGGER "sync_center_queue_after_appointment_change_trigger" AFTER INSERT OR UPDATE OF "status", "duration_minutes", "token_number" ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."sync_center_queue_after_appointment_change"();



CREATE OR REPLACE TRIGGER "sync_live_queue_after_appointment_change" AFTER INSERT OR UPDATE ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."sync_live_queue_after_appointment_change"();



CREATE OR REPLACE TRIGGER "validate_appointment_status_transition_trigger" BEFORE UPDATE OF "status" ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."validate_appointment_status_transition"();



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."center_daily_tokens"
    ADD CONSTRAINT "center_daily_tokens_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "public"."service_centers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "center_services_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "public"."service_centers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."device_tokens"
    ADD CONSTRAINT "device_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."doctor_leaves"
    ADD CONSTRAINT "doctor_leaves_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."doctor_schedules"
    ADD CONSTRAINT "doctor_schedules_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."doctor_services"
    ADD CONSTRAINT "doctor_services_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."doctor_services"
    ADD CONSTRAINT "doctor_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."doctors"
    ADD CONSTRAINT "doctors_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "public"."service_centers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."doctors"
    ADD CONSTRAINT "doctors_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "public"."service_centers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."queue_updates"
    ADD CONSTRAINT "queue_updates_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."slot_locks"
    ADD CONSTRAINT "slot_locks_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "public"."service_centers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."slot_locks"
    ADD CONSTRAINT "slot_locks_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id");



ALTER TABLE ONLY "public"."slot_locks"
    ADD CONSTRAINT "slot_locks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_centers"
    ADD CONSTRAINT "staff_centers_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "public"."service_centers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_centers"
    ADD CONSTRAINT "staff_centers_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Anyone can view active slot locks" ON "public"."slot_locks" FOR SELECT TO "authenticated" USING (("expires_at" > "now"()));



CREATE POLICY "Enable read access for all users" ON "public"."center_queue_settings" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Enable read access for authenticated users" ON "public"."center_daily_tokens" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Public can view center services" ON "public"."services" FOR SELECT USING (true);



CREATE POLICY "Staff and admin modify settings" ON "public"."center_queue_settings" TO "authenticated" USING (("public"."is_admin"() OR "public"."is_staff"())) WITH CHECK (("public"."is_admin"() OR "public"."is_staff"()));



CREATE POLICY "Staff and admin view all profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR "public"."is_staff"()));



CREATE POLICY "Staff can create notifications" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() OR "public"."is_staff"()));



CREATE POLICY "Staff can create queue updates" ON "public"."queue_updates" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() OR "public"."is_staff"()));



CREATE POLICY "Staff can insert audit logs" ON "public"."audit_logs" FOR INSERT TO "authenticated" WITH CHECK ((("staff_user_id" = "auth"."uid"()) AND ("public"."is_admin"() OR "public"."is_staff"())));



CREATE POLICY "Staff can manage doctor queue settings" ON "public"."doctor_queue_settings" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['staff'::"text", 'admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['staff'::"text", 'admin'::"text"]))))));



CREATE POLICY "Staff can view audit logs" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR "public"."is_staff"()));



CREATE POLICY "Staff can view queue updates" ON "public"."queue_updates" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR "public"."is_staff"()));



CREATE POLICY "Users can delete own device tokens" ON "public"."device_tokens" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own slot locks" ON "public"."slot_locks" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own device tokens" ON "public"."device_tokens" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert own slot locks" ON "public"."slot_locks" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own device tokens" ON "public"."device_tokens" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view doctor queue settings" ON "public"."doctor_queue_settings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Users can view own device tokens" ON "public"."device_tokens" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "admin manage doctor services by profile role" ON "public"."doctor_services" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin manage doctor_leaves by profile role" ON "public"."doctor_leaves" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin manage doctor_schedules by profile role" ON "public"."doctor_schedules" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin manage doctors" ON "public"."doctors" USING ((("auth"."jwt"() ->> 'app_role'::"text") = 'admin'::"text"));



CREATE POLICY "admin manage doctors by profile role" ON "public"."doctors" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin manage services" ON "public"."services" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin manage staff_centers" ON "public"."staff_centers" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin manages centers" ON "public"."service_centers" USING ((( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = 'admin'::"text")) WITH CHECK ((( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = 'admin'::"text"));



CREATE POLICY "admin update all appointments" ON "public"."appointments" FOR UPDATE USING (((("auth"."jwt"() ->> 'app_role'::"text") = 'admin'::"text") OR "public"."is_admin"())) WITH CHECK (((("auth"."jwt"() ->> 'app_role'::"text") = 'admin'::"text") OR "public"."is_admin"()));



CREATE POLICY "admin update all profiles" ON "public"."profiles" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cancel own appointments" ON "public"."appointments" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK ((("auth"."uid"() = "user_id") AND ("status" = ANY (ARRAY['cancelled'::"text", 'checked_in'::"text"]))));



ALTER TABLE "public"."center_daily_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."center_queue_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clients read active doctors" ON "public"."doctors" FOR SELECT USING (("is_active" = true));



CREATE POLICY "clients read centers" ON "public"."service_centers" FOR SELECT USING (true);



CREATE POLICY "clients read doctor_leaves" ON "public"."doctor_leaves" FOR SELECT USING (true);



CREATE POLICY "clients read doctor_schedules" ON "public"."doctor_schedules" FOR SELECT USING (true);



CREATE POLICY "clients read doctor_services" ON "public"."doctor_services" FOR SELECT USING (true);



ALTER TABLE "public"."device_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "doctor manage own leaves" ON "public"."doctor_leaves" USING (("doctor_id" IN ( SELECT "doctors"."id"
   FROM "public"."doctors"
  WHERE ("doctors"."profile_id" = "auth"."uid"())))) WITH CHECK (("doctor_id" IN ( SELECT "doctors"."id"
   FROM "public"."doctors"
  WHERE ("doctors"."profile_id" = "auth"."uid"()))));



CREATE POLICY "doctor manage own queue settings" ON "public"."doctor_queue_settings" USING (("doctor_id" IN ( SELECT "doctors"."id"
   FROM "public"."doctors"
  WHERE ("doctors"."profile_id" = "auth"."uid"())))) WITH CHECK (("doctor_id" IN ( SELECT "doctors"."id"
   FROM "public"."doctors"
  WHERE ("doctors"."profile_id" = "auth"."uid"()))));



CREATE POLICY "doctor manage own queue updates" ON "public"."queue_updates" USING ((EXISTS ( SELECT 1
   FROM ("public"."appointments" "a"
     JOIN "public"."doctors" "d" ON (("d"."id" = "a"."doctor_id")))
  WHERE (("a"."id" = "queue_updates"."appointment_id") AND ("d"."profile_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."appointments" "a"
     JOIN "public"."doctors" "d" ON (("d"."id" = "a"."doctor_id")))
  WHERE (("a"."id" = "queue_updates"."appointment_id") AND ("d"."profile_id" = "auth"."uid"())))));



CREATE POLICY "doctor manage own schedule" ON "public"."doctor_schedules" USING (("doctor_id" IN ( SELECT "doctors"."id"
   FROM "public"."doctors"
  WHERE ("doctors"."profile_id" = "auth"."uid"())))) WITH CHECK (("doctor_id" IN ( SELECT "doctors"."id"
   FROM "public"."doctors"
  WHERE ("doctors"."profile_id" = "auth"."uid"()))));



CREATE POLICY "doctor read own appointments" ON "public"."appointments" FOR SELECT USING (("doctor_id" IN ( SELECT "doctors"."id"
   FROM "public"."doctors"
  WHERE ("doctors"."profile_id" = "auth"."uid"()))));



CREATE POLICY "doctor read own record" ON "public"."doctors" FOR SELECT USING (("profile_id" = "auth"."uid"()));



CREATE POLICY "doctor self update own record" ON "public"."doctors" FOR UPDATE USING (("profile_id" = "auth"."uid"())) WITH CHECK (("profile_id" = "auth"."uid"()));



CREATE POLICY "doctor update own appointments" ON "public"."appointments" FOR UPDATE USING (("doctor_id" IN ( SELECT "doctors"."id"
   FROM "public"."doctors"
  WHERE ("doctors"."profile_id" = "auth"."uid"())))) WITH CHECK (("doctor_id" IN ( SELECT "doctors"."id"
   FROM "public"."doctors"
  WHERE ("doctors"."profile_id" = "auth"."uid"()))));



ALTER TABLE "public"."doctor_leaves" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."doctor_queue_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."doctor_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."doctor_services" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."doctors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_delete_own" ON "public"."notifications" FOR DELETE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."queue_updates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."service_centers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."slot_locks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff and admin delete queue updates" ON "public"."queue_updates" FOR DELETE USING (("public"."is_admin"() OR "public"."is_staff"()));



CREATE POLICY "staff and admin modify daily tokens" ON "public"."center_daily_tokens" USING (("public"."is_admin"() OR "public"."is_staff"())) WITH CHECK (("public"."is_admin"() OR "public"."is_staff"()));



CREATE POLICY "staff and admin update queue updates" ON "public"."queue_updates" FOR UPDATE USING (("public"."is_admin"() OR "public"."is_staff"())) WITH CHECK (("public"."is_admin"() OR "public"."is_staff"()));



CREATE POLICY "staff and admin view all appointments" ON "public"."appointments" FOR SELECT USING (((("auth"."jwt"() ->> 'app_role'::"text") = ANY (ARRAY['admin'::"text", 'staff'::"text"])) OR "public"."is_admin"() OR "public"."is_staff"()));



CREATE POLICY "staff read doctors at own center" ON "public"."doctors" FOR SELECT USING ((((("auth"."jwt"() ->> 'app_role'::"text") = 'staff'::"text") OR "public"."is_staff"()) AND ("center_id" IN ( SELECT "staff_centers"."center_id"
   FROM "public"."staff_centers"
  WHERE ("staff_centers"."profile_id" = "auth"."uid"())))));



CREATE POLICY "staff toggle break" ON "public"."doctors" FOR UPDATE USING ((((("auth"."jwt"() ->> 'app_role'::"text") = 'staff'::"text") OR "public"."is_staff"()) AND ("center_id" IN ( SELECT "staff_centers"."center_id"
   FROM "public"."staff_centers"
  WHERE ("staff_centers"."profile_id" = "auth"."uid"()))))) WITH CHECK ((((("auth"."jwt"() ->> 'app_role'::"text") = 'staff'::"text") OR "public"."is_staff"()) AND ("center_id" IN ( SELECT "staff_centers"."center_id"
   FROM "public"."staff_centers"
  WHERE ("staff_centers"."profile_id" = "auth"."uid"())))));



CREATE POLICY "staff update appointments except completion" ON "public"."appointments" FOR UPDATE USING (((("auth"."jwt"() ->> 'app_role'::"text") = 'staff'::"text") OR "public"."is_staff"())) WITH CHECK ((((("auth"."jwt"() ->> 'app_role'::"text") = 'staff'::"text") OR "public"."is_staff"()) AND ("status" <> 'completed'::"text")));



CREATE POLICY "staff view own center assignments" ON "public"."staff_centers" FOR SELECT USING (("profile_id" = "auth"."uid"()));



ALTER TABLE "public"."staff_centers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users can read own queue updates" ON "public"."queue_updates" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."appointments" "a"
  WHERE (("a"."id" = "queue_updates"."appointment_id") AND ("a"."user_id" = "auth"."uid"())))));



CREATE POLICY "users manage own device tokens" ON "public"."device_tokens" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "users_insert_notifications" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "users_insert_own_appointments" ON "public"."appointments" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "users_select_own_appointments" ON "public"."appointments" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users_select_own_notifications" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users_update_own_notifications" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."doctors";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."queue_updates";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
GRANT USAGE ON SCHEMA "public" TO "supabase_auth_admin";
































































































































































































GRANT ALL ON FUNCTION "public"."admin_delete_staff_account"("staff_profile_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."book_appointment"("p_lock_id" "uuid", "p_service_id" "uuid", "p_notes" "text") TO "authenticated";



GRANT ALL ON TABLE "public"."appointments" TO "anon";
GRANT ALL ON TABLE "public"."appointments" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."appointments" TO "service_role";



GRANT UPDATE("status") ON TABLE "public"."appointments" TO "authenticated";



GRANT UPDATE("cancelled_by") ON TABLE "public"."appointments" TO "authenticated";



GRANT UPDATE("cancelled_at") ON TABLE "public"."appointments" TO "authenticated";



GRANT UPDATE("completed_at") ON TABLE "public"."appointments" TO "authenticated";



GRANT UPDATE("cancel_reason") ON TABLE "public"."appointments" TO "authenticated";



GRANT UPDATE("called_at") ON TABLE "public"."appointments" TO "authenticated";



GRANT UPDATE("checked_in_at") ON TABLE "public"."appointments" TO "authenticated";



GRANT UPDATE("started_at") ON TABLE "public"."appointments" TO "authenticated";



GRANT UPDATE("duration_minutes") ON TABLE "public"."appointments" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."call_appointment"("p_appointment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."call_appointment"("p_appointment_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."cancel_appointment"("p_appointment_id" "uuid", "p_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."check_in_appointment"("p_appointment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_in_appointment"("p_appointment_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."cleanup_stale_appointments"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."complete_appointment"("p_appointment_id" "uuid", "p_duration_minutes" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_appointment"("p_appointment_id" "uuid", "p_duration_minutes" integer) TO "authenticated";



GRANT ALL ON FUNCTION "public"."confirm_appointment"("p_appointment_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_doctor_with_account"("p_email" "text", "p_password" "text", "p_full_name" "text", "p_center_id" "uuid", "p_specialty" "text", "p_qualification" "text", "p_experience_years" integer, "p_service_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_doctor_with_account"("p_email" "text", "p_password" "text", "p_full_name" "text", "p_center_id" "uuid", "p_specialty" "text", "p_qualification" "text", "p_experience_years" integer, "p_service_ids" "uuid"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") TO "supabase_auth_admin";



GRANT ALL ON FUNCTION "public"."get_appointment_queue_snapshot"("p_appointment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_appointment_queue_snapshot"("p_appointment_id" "uuid") TO "anon";



GRANT ALL ON FUNCTION "public"."get_available_slots"("p_doctor_id" "uuid", "p_date" "date") TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_center_queue_snapshot"("p_center_id" "uuid", "p_queue_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_center_queue_snapshot"("p_center_id" "uuid", "p_queue_date" "date") TO "anon";



GRANT ALL ON FUNCTION "public"."get_current_token"("p_center_id" "uuid", "p_queue_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_token"("p_center_id" "uuid", "p_queue_date" "date") TO "anon";



REVOKE ALL ON FUNCTION "public"."get_doctor_availability"("p_doctor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_doctor_availability"("p_doctor_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_doctor_income_summary"("p_doctor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_doctor_income_summary"("p_doctor_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_doctor_queue_snapshot"("p_doctor_id" "uuid", "p_queue_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_doctor_queue_snapshot"("p_doctor_id" "uuid", "p_queue_date" "date") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_doctor_recent_patients"("p_doctor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_doctor_recent_patients"("p_doctor_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_doctor_schedule"("p_doctor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_doctor_schedule"("p_doctor_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_doctor_today_appointments"("p_doctor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_doctor_today_appointments"("p_doctor_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_doctors_availability_batch"("p_doctor_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_doctors_availability_batch"("p_doctor_ids" "uuid"[]) TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_my_staff_context"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_next_token"("p_center_id" "uuid", "p_appointment_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_token"("p_center_id" "uuid", "p_appointment_date" "date") TO "anon";



REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."is_staff"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."lock_slot"("p_doctor_id" "uuid", "p_center_id" "uuid", "p_date" "date", "p_time" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."people_ahead"("p_appointment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."people_ahead"("p_appointment_id" "uuid") TO "anon";



GRANT ALL ON FUNCTION "public"."release_slot"("p_lock_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_center_break"("p_center_id" "uuid", "p_queue_date" "date", "p_break_start" timestamp with time zone, "p_break_end" timestamp with time zone, "p_is_on_break" boolean) TO "authenticated";



GRANT ALL ON FUNCTION "public"."start_service"("p_appointment_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."update_center_average_consultation_time"("p_center_id" "uuid", "p_queue_date" "date", "p_avg_mins" numeric) TO "authenticated";



GRANT ALL ON FUNCTION "public"."update_user_fcm_token"("p_token" "text") TO "authenticated";
























GRANT ALL ON TABLE "public"."center_queue_settings" TO "anon";
GRANT ALL ON TABLE "public"."center_queue_settings" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."center_queue_settings" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."doctor_queue_settings" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."doctor_queue_settings" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."doctor_queue_settings" TO "service_role";



GRANT ALL ON TABLE "public"."doctors" TO "anon";
GRANT ALL ON TABLE "public"."doctors" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."doctors" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "service_role";



GRANT UPDATE("full_name") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("phone") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("avatar_url") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("updated_at") ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."queue_updates" TO "anon";
GRANT ALL ON TABLE "public"."queue_updates" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."queue_updates" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."service_centers" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."service_centers" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."service_centers" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."services" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."services" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."services" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."appointments_full" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."appointments_full" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."appointments_full" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."center_daily_tokens" TO "anon";
GRANT ALL ON TABLE "public"."center_daily_tokens" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."center_daily_tokens" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."current_token_view" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."current_token_view" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."current_token_view" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."device_tokens" TO "anon";
GRANT ALL ON TABLE "public"."device_tokens" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."device_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."doctor_leaves" TO "anon";
GRANT ALL ON TABLE "public"."doctor_leaves" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."doctor_leaves" TO "service_role";



GRANT ALL ON TABLE "public"."doctor_schedules" TO "anon";
GRANT ALL ON TABLE "public"."doctor_schedules" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."doctor_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."doctor_services" TO "anon";
GRANT ALL ON TABLE "public"."doctor_services" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."doctor_services" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."notifications" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."queue_view" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."queue_view" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."queue_view" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."slot_locks" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."slot_locks" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."slot_locks" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."staff_centers" TO "anon";
GRANT ALL ON TABLE "public"."staff_centers" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."staff_centers" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";

-- ---------------------------------------------------------------------------
-- App-owned objects in Supabase-managed schemas (not covered by the public dump)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE TRIGGER "on_auth_user_created" AFTER INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();

INSERT INTO "storage"."buckets" ("id", "name", "public", "file_size_limit", "allowed_mime_types")
VALUES ('avatars', 'avatars', true, 10485760, NULL)
ON CONFLICT ("id") DO NOTHING;

CREATE POLICY "avatars_delete" ON "storage"."objects" FOR DELETE TO "authenticated" USING (("bucket_id" = 'avatars'::"text"));

CREATE POLICY "avatars_insert" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK (("bucket_id" = 'avatars'::"text"));

CREATE POLICY "avatars_select" ON "storage"."objects" FOR SELECT TO "authenticated" USING (("bucket_id" = 'avatars'::"text"));

CREATE POLICY "avatars_update" ON "storage"."objects" FOR UPDATE TO "authenticated" USING (("bucket_id" = 'avatars'::"text")) WITH CHECK (("bucket_id" = 'avatars'::"text"));

notify pgrst, 'reload schema';
