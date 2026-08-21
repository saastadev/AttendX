-- ============================================================
-- AttendX v2 — Fix GoTrue Auth Instance & Search Path
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Ensure search_path is set properly for Supabase Auth roles
ALTER ROLE supabase_auth_admin SET search_path = 'auth', 'public', 'extensions';
ALTER ROLE service_role SET search_path = 'public', 'auth', 'extensions';
ALTER ROLE postgres SET search_path = 'public', 'auth', 'extensions';

-- 2. Ensure default auth instance exists
INSERT INTO auth.instances (id, uuid, raw_base_config, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', '{}', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 3. Ensure core extensions exist in extensions schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- 4. Reload schema cache
NOTIFY pgrst, 'reload schema';
