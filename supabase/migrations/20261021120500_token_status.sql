-- Phase 1A.6: public token status.
--
-- get_token_status(p_public_code): what a person holding a token code may
-- see, callable by anon (QR/online guests have no account). Returns exactly:
-- token number, people ahead, ETA, current token, doctor display name,
-- status. Never the patient's name or phone, or any id. An unknown or
-- malformed code returns no row (same as "not found", nothing to probe).

CREATE FUNCTION public.get_token_status(p_public_code text)
 RETURNS TABLE (
   token_number integer,
   people_ahead integer,
   eta_minutes integer,
   current_token integer,
   doctor_name text,
   status text
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_code text := upper(btrim(COALESCE(p_public_code, '')));
  v_appt public.appointments%ROWTYPE;
BEGIN
  IF v_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$' THEN
    RETURN;
  END IF;

  SELECT * INTO v_appt FROM public.appointments a WHERE a.public_code = v_code;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    v_appt.token_number,
    tp.people_ahead,
    tp.eta_minutes,
    tp.current_token,
    d.name,
    CASE
      WHEN v_appt.status IN ('pending', 'confirmed', 'checked_in') THEN 'waiting'
      WHEN v_appt.status IN ('no_show', 'expired') THEN 'missed'
      ELSE v_appt.status   -- called | in_progress | completed | cancelled
    END
  FROM private.token_progress(v_appt.id) tp
  LEFT JOIN public.doctors d ON d.id = v_appt.doctor_id;
END;
$function$;

COMMENT ON FUNCTION public.get_token_status(text) IS
  'Public token status by code: token_number, people_ahead, eta_minutes, current_token, doctor_name, status (waiting|called|in_progress|completed|cancelled|missed). No patient data.';

REVOKE ALL ON FUNCTION public.get_token_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_token_status(text) TO anon, authenticated;
