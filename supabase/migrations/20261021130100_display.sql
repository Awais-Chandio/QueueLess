-- Phase 1B.3: TV display.
--
-- center_displays: one secret display_key per center. The TV opens
-- /display/<display_key>; whoever has the key sees the center's token board,
-- nothing else. Kept out of service_centers on purpose: anon can read every
-- column of service_centers.
--
-- get_display_snapshot(display_key), for anon: center name and slug (for the
-- join QR), per active doctor: display name, room, break, the token being
-- served and the next five. Token numbers and statuses only, never a patient
-- name, phone, code or id.
--
-- Realtime: every change to a center's appointments or doctors sends a
-- broadcast "changed" (empty payload) on the public topic display:<key>; the
-- TV refetches the snapshot. Best effort: a failed send never fails a write.

-- 24 symbols from 32 (120 bits), no look-alikes.
CREATE FUNCTION private.generate_display_key()
 RETURNS text
 LANGUAGE sql
 VOLATILE
 SET search_path TO ''
AS $function$
  SELECT string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', get_byte(r.b, i) % 31 + 1, 1), '' ORDER BY i)
  FROM (SELECT extensions.gen_random_bytes(24) AS b) r, generate_series(0, 23) AS i;
$function$;

CREATE TABLE public.center_displays (
  center_id uuid PRIMARY KEY REFERENCES public.service_centers(id) ON DELETE CASCADE,
  display_key text NOT NULL UNIQUE DEFAULT private.generate_display_key()
    CHECK (display_key ~ '^[a-z0-9]{24}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz
);

COMMENT ON TABLE public.center_displays IS
  'Secret key per center for its TV display URL. Readable by the center''s staff; rotated by owners.';

ALTER TABLE public.center_displays ENABLE ROW LEVEL SECURITY;

INSERT INTO public.center_displays (center_id) SELECT id FROM public.service_centers ON CONFLICT DO NOTHING;

CREATE FUNCTION private.service_centers_create_display()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.center_displays (center_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$function$;

CREATE TRIGGER service_centers_create_display
  AFTER INSERT ON public.service_centers
  FOR EACH ROW EXECUTE FUNCTION private.service_centers_create_display();

REVOKE ALL ON public.center_displays FROM anon, authenticated;
GRANT SELECT ON public.center_displays TO authenticated;

CREATE POLICY "center staff read display key" ON public.center_displays
  FOR SELECT TO authenticated
  USING (private.can_manage_center(center_id));

-- ---------------------------------------------------------------------------
-- Snapshot
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.get_display_snapshot(p_display_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_key text := lower(btrim(COALESCE(p_display_key, '')));
  v_center public.service_centers%ROWTYPE;
  v_org public.organizations%ROWTYPE;
  v_today date;
BEGIN
  IF v_key !~ '^[a-z0-9]{24}$' THEN
    RETURN NULL;
  END IF;

  SELECT c.* INTO v_center
  FROM public.center_displays k
  JOIN public.service_centers c ON c.id = k.center_id
  WHERE k.display_key = v_key;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_org FROM public.organizations WHERE id = v_center.organization_id;
  v_today := (now() AT TIME ZONE v_org.timezone)::date;

  RETURN jsonb_build_object(
    'center_name', v_center.name,
    'center_slug', v_center.slug,
    'organization_name', v_org.name,
    'today', v_today,
    'server_time', now(),
    'doctors', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'name', d.name,
               'room', d.room,
               'is_on_break', d.is_on_break OR COALESCE(q.is_on_break, false),
               'now_serving', (
                 SELECT jsonb_build_object('token_number', a.token_number, 'status', a.status, 'called_at', a.called_at)
                 FROM public.appointments a
                 WHERE a.doctor_id = d.id AND a.appointment_date = v_today AND a.status IN ('called', 'in_progress')
                 ORDER BY a.called_at DESC NULLS LAST, a.token_number DESC
                 LIMIT 1),
               'next', COALESCE((
                 SELECT jsonb_agg(n.token_number ORDER BY n.k, n.token_number)
                 FROM (
                   SELECT a.token_number, COALESCE(a.skipped_at, a.created_at, a.scheduled_at) AS k
                   FROM public.appointments a
                   WHERE a.doctor_id = d.id AND a.appointment_date = v_today
                     AND a.status IN ('pending', 'confirmed', 'checked_in')
                   ORDER BY k, a.token_number
                   LIMIT 5
                 ) n), '[]'::jsonb),
               'waiting', (SELECT count(*) FROM public.appointments a
                           WHERE a.doctor_id = d.id AND a.appointment_date = v_today
                             AND a.status IN ('pending', 'confirmed', 'checked_in'))
             ) ORDER BY d.created_at, d.id)
      FROM public.doctors d
      LEFT JOIN public.doctor_queue_settings q ON q.doctor_id = d.id
      WHERE d.center_id = v_center.id AND d.is_active
    ), '[]'::jsonb)
  );
END;
$function$;

COMMENT ON FUNCTION public.get_display_snapshot(text) IS
  'TV board by secret display key: center name/slug, per doctor name, room, break, now serving and next 5 token numbers. No patient data.';

-- Owners (or platform admins) issue a new key; the old TV link stops working.
CREATE FUNCTION public.rotate_display_key(p_center_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_key text;
BEGIN
  IF NOT private.is_server_context()
     AND NOT public.is_admin()
     AND NOT private.has_org_role(private.center_organization(p_center_id), ARRAY['owner']) THEN
    RAISE EXCEPTION 'Only the clinic owner can change the display link' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.center_displays (center_id, display_key, rotated_at)
  VALUES (p_center_id, private.generate_display_key(), now())
  ON CONFLICT (center_id) DO UPDATE SET display_key = EXCLUDED.display_key, rotated_at = now()
  RETURNING display_key INTO v_key;
  RETURN v_key;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Realtime nudge
-- ---------------------------------------------------------------------------
CREATE FUNCTION private.nudge_center_displays(p_center_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_key text;
BEGIN
  FOR v_key IN
    SELECT k.display_key FROM public.center_displays k WHERE k.center_id = ANY (p_center_ids)
  LOOP
    BEGIN
      PERFORM realtime.send('{}'::jsonb, 'changed', 'display:' || v_key, false);
    EXCEPTION WHEN OTHERS THEN
      NULL;  -- realtime unavailable: TVs fall back to polling
    END;
  END LOOP;
END;
$function$;

CREATE FUNCTION private.appointments_nudge_displays()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM private.nudge_center_displays(ARRAY(SELECT DISTINCT center_id FROM changed_rows));
  RETURN NULL;
END;
$function$;

CREATE TRIGGER appointments_nudge_displays_insert
  AFTER INSERT ON public.appointments
  REFERENCING NEW TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION private.appointments_nudge_displays();

CREATE TRIGGER appointments_nudge_displays_update
  AFTER UPDATE ON public.appointments
  REFERENCING NEW TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION private.appointments_nudge_displays();

CREATE TRIGGER doctors_nudge_displays_update
  AFTER UPDATE ON public.doctors
  REFERENCING NEW TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION private.appointments_nudge_displays();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION private.generate_display_key() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.service_centers_create_display() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.nudge_center_displays(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.appointments_nudge_displays() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.get_display_snapshot(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_display_snapshot(text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rotate_display_key(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rotate_display_key(uuid) TO authenticated, service_role;
