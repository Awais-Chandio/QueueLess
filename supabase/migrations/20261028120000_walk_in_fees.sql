-- Phase 2C.1: no walk-in skips the fee.
--
-- The staff app used issue_token(..., 'walk_in'), which never asked for a fee
-- (2A: "fees are taken on the web desk only"). The 2C app issues walk-ins with
-- issue_walk_in, like the web desk. An older app build still calls
-- issue_token: its walk-ins now follow the same fee rules with "fee not
-- received", so with fee before and a doctor fee above 0 the token waits in
-- "Fee pending" until the desk takes the fee (web or the 2C app). Fee after /
-- off, or a doctor without a fee: a plain walk-in, exactly as before.
--
-- Other sources (qr / online from staff, app joins) are unchanged.

CREATE OR REPLACE FUNCTION public.issue_token(p_doctor_id uuid, p_name text, p_phone text, p_source text DEFAULT 'qr')
 RETURNS TABLE (appointment_id uuid, public_code text, token_number integer, people_ahead integer, eta_minutes integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF lower(btrim(COALESCE(p_source, ''))) = 'walk_in' THEN
    RETURN QUERY
    SELECT w.appointment_id, w.public_code, w.token_number, w.people_ahead, w.eta_minutes
    FROM public.issue_walk_in(p_doctor_id, p_name, p_phone, false) w;
    RETURN;
  END IF;
  RETURN QUERY SELECT * FROM private.issue_token_core(p_doctor_id, p_name, p_phone, p_source, false, NULL);
END;
$function$;

COMMENT ON FUNCTION public.issue_token(uuid, text, text, text) IS
  'Signed-in token. walk_in (staff) goes through issue_walk_in with the fee not received: fee before + a doctor fee = an awaiting token in "Fee pending". Prefer issue_walk_in, which takes the fee in the same step.';

notify pgrst, 'reload schema';
