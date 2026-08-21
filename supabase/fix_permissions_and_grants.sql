-- ============================================================
-- AttendX v2 — Standard Supabase Role Permissions
-- Compatible with PostgreSQL 15+ / Supabase SQL Editor
-- ============================================================

-- 1. Grant schema usage & create privileges
GRANT USAGE, CREATE ON SCHEMA public TO postgres, anon, authenticated, service_role;

-- 2. Grant privileges on all existing tables, sequences, and functions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- 3. Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON FUNCTIONS TO postgres, anon, authenticated, service_role;
