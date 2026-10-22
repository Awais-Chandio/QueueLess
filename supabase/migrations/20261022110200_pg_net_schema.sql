-- Phase 1D.3: pg_net out of the public schema.
--
-- pg_net was installed WITH SCHEMA public (security advisor: "extension in
-- public"). It can't be moved with ALTER EXTENSION ... SET SCHEMA, so it is
-- dropped and created again in "extensions". Its functions live in the "net"
-- schema either way, so callers (private.kick_notification_worker) don't
-- change. Pending requests in net.http_request_queue are dropped with it;
-- nothing in this project queues requests outside the minute-by-minute kick.
--
-- If the platform refuses the drop (an object depends on pg_net), the
-- extension is left where it is and the migration still succeeds.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pg_net' AND n.nspname = 'public'
  ) THEN
    BEGIN
      DROP EXTENSION pg_net;
      CREATE EXTENSION pg_net WITH SCHEMA extensions;
      RAISE NOTICE 'pg_net moved to schema extensions';
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'pg_net left in schema public: %', SQLERRM;
    END;
  ELSIF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    CREATE EXTENSION pg_net WITH SCHEMA extensions;
  END IF;
END
$$;
