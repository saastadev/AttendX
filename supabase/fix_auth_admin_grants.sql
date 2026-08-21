-- ============================================================
-- AttendX v2 — Fix Supabase Auth Admin & GoTrue Permissions
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Grant full access on auth schema to supabase_auth_admin
GRANT USAGE, CREATE ON SCHEMA auth TO postgres, supabase_auth_admin, service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA auth TO postgres, supabase_auth_admin, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA auth TO postgres, supabase_auth_admin, service_role;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA auth TO postgres, supabase_auth_admin, service_role;

-- 2. Grant access on public schema to supabase_auth_admin
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO supabase_auth_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO supabase_auth_admin;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO supabase_auth_admin;

-- 3. Grant usage on extensions schema
GRANT USAGE ON SCHEMA extensions TO postgres, supabase_auth_admin, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA extensions TO postgres, supabase_auth_admin, anon, authenticated, service_role;

-- 4. Reload schema cache
NOTIFY pgrst, 'reload schema';
