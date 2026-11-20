-- Adapted from supabase/supabase@docker: sets each service role's password
-- to POSTGRES_PASSWORD. Skips roles that only exist when a service we don't
-- run is installed (e.g. supabase_functions_admin, made by the webhooks
-- script) — one missing role used to abort the database's whole first-time
-- setup, including the steps that let the auth service create its tables.
\set pgpass `echo "$POSTGRES_PASSWORD"`
SELECT set_config('attendx.pgpass', :'pgpass', false);

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['authenticator', 'pgbouncer', 'supabase_auth_admin', 'supabase_functions_admin', 'supabase_storage_admin'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('ALTER USER %I WITH PASSWORD %L', r, current_setting('attendx.pgpass'));
    END IF;
  END LOOP;
END $$;
