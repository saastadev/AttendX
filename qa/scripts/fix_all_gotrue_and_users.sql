-- ============================================================
-- AttendX v2 — Complete GoTrue Auth & Demo Account Activation
-- Run this in your Supabase SQL Editor (khaxowomjczuckfuraoh)
-- ============================================================

-- 1. Grant extensions & search_path to Supabase Auth Admin role (Fixes 500 error)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

ALTER ROLE supabase_auth_admin SET search_path = 'auth', 'public', 'extensions';
ALTER ROLE service_role SET search_path = 'public', 'auth', 'extensions';
ALTER ROLE postgres SET search_path = 'public', 'auth', 'extensions';

-- 2. Ensure default auth instance exists
INSERT INTO auth.instances (id, uuid, raw_base_config, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', '{}', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 3. Insert / Update auth.users with password 'Password123!'
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_sso_user,
  created_at,
  updated_at
) VALUES
  -- Acme Technologies (IT)
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'superadmin@acme-tech.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"],"tenant_id":"11111111-0000-0000-0000-000000000001"}'::jsonb, '{"full_name":"Alice Superadmin"}'::jsonb, false, NOW(), NOW()),
  ('11111111-1111-1111-1111-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@acme-tech.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"],"tenant_id":"11111111-0000-0000-0000-000000000001"}'::jsonb, '{"full_name":"Bob Admin"}'::jsonb, false, NOW(), NOW()),
  ('11111111-1111-1111-1111-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hr@acme-tech.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"],"tenant_id":"11111111-0000-0000-0000-000000000001"}'::jsonb, '{"full_name":"Carol HR"}'::jsonb, false, NOW(), NOW()),
  ('11111111-1111-1111-1111-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager@acme-tech.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"],"tenant_id":"11111111-0000-0000-0000-000000000001"}'::jsonb, '{"full_name":"David Manager"}'::jsonb, false, NOW(), NOW()),
  ('11111111-1111-1111-1111-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'employee@acme-tech.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"],"tenant_id":"11111111-0000-0000-0000-000000000001"}'::jsonb, '{"full_name":"Eve Employee"}'::jsonb, false, NOW(), NOW()),

  -- Globex Corp (Retail)
  ('22222222-2222-2222-2222-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'superadmin@globex-corp.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"],"tenant_id":"22222222-0000-0000-0000-000000000002"}'::jsonb, '{"full_name":"Gary Superadmin"}'::jsonb, false, NOW(), NOW()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@globex-corp.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"],"tenant_id":"22222222-0000-0000-0000-000000000002"}'::jsonb, '{"full_name":"Grace Admin"}'::jsonb, false, NOW(), NOW()),
  ('22222222-2222-2222-2222-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hr@globex-corp.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"],"tenant_id":"22222222-0000-0000-0000-000000000002"}'::jsonb, '{"full_name":"Hannah HR"}'::jsonb, false, NOW(), NOW()),
  ('22222222-2222-2222-2222-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager@globex-corp.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"],"tenant_id":"22222222-0000-0000-0000-000000000002"}'::jsonb, '{"full_name":"Ian Manager"}'::jsonb, false, NOW(), NOW()),
  ('22222222-2222-2222-2222-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'employee@globex-corp.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"],"tenant_id":"22222222-0000-0000-0000-000000000002"}'::jsonb, '{"full_name":"Ivy Employee"}'::jsonb, false, NOW(), NOW()),

  -- Initech Ltd (Healthcare)
  ('33333333-3333-3333-3333-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'superadmin@initech-ltd.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"],"tenant_id":"33333333-0000-0000-0000-000000000003"}'::jsonb, '{"full_name":"Ivan Superadmin"}'::jsonb, false, NOW(), NOW()),
  ('33333333-3333-3333-3333-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@initech-ltd.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"],"tenant_id":"33333333-0000-0000-0000-000000000003"}'::jsonb, '{"full_name":"Irene Admin"}'::jsonb, false, NOW(), NOW()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hr@initech-ltd.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"],"tenant_id":"33333333-0000-0000-0000-000000000003"}'::jsonb, '{"full_name":"Jack HR"}'::jsonb, false, NOW(), NOW()),
  ('33333333-3333-3333-3333-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager@initech-ltd.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"],"tenant_id":"33333333-0000-0000-0000-000000000003"}'::jsonb, '{"full_name":"Karen Manager"}'::jsonb, false, NOW(), NOW()),
  ('33333333-3333-3333-3333-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'employee@initech-ltd.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"],"tenant_id":"33333333-0000-0000-0000-000000000003"}'::jsonb, '{"full_name":"Leo Employee"}'::jsonb, false, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET 
  encrypted_password = EXCLUDED.encrypted_password,
  email_confirmed_at = NOW(),
  raw_app_meta_data = EXCLUDED.raw_app_meta_data;

-- 4. Insert / Update auth.identities
INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) VALUES
  -- Acme
  ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', jsonb_build_object('sub', '11111111-1111-1111-1111-111111111111', 'email', 'superadmin@acme-tech.com', 'email_verified', true), 'email', '11111111-1111-1111-1111-111111111111', NOW(), NOW(), NOW()),
  ('11111111-1111-1111-1111-222222222222', '11111111-1111-1111-1111-222222222222', jsonb_build_object('sub', '11111111-1111-1111-1111-222222222222', 'email', 'admin@acme-tech.com', 'email_verified', true), 'email', '11111111-1111-1111-1111-222222222222', NOW(), NOW(), NOW()),
  ('11111111-1111-1111-1111-333333333333', '11111111-1111-1111-1111-333333333333', jsonb_build_object('sub', '11111111-1111-1111-1111-333333333333', 'email', 'hr@acme-tech.com', 'email_verified', true), 'email', '11111111-1111-1111-1111-333333333333', NOW(), NOW(), NOW()),
  ('11111111-1111-1111-1111-444444444444', '11111111-1111-1111-1111-444444444444', jsonb_build_object('sub', '11111111-1111-1111-1111-444444444444', 'email', 'manager@acme-tech.com', 'email_verified', true), 'email', '11111111-1111-1111-1111-444444444444', NOW(), NOW(), NOW()),
  ('11111111-1111-1111-1111-555555555555', '11111111-1111-1111-1111-555555555555', jsonb_build_object('sub', '11111111-1111-1111-1111-555555555555', 'email', 'employee@acme-tech.com', 'email_verified', true), 'email', '11111111-1111-1111-1111-555555555555', NOW(), NOW(), NOW()),
  -- Globex
  ('22222222-2222-2222-2222-111111111111', '22222222-2222-2222-2222-111111111111', jsonb_build_object('sub', '22222222-2222-2222-2222-111111111111', 'email', 'superadmin@globex-corp.com', 'email_verified', true), 'email', '22222222-2222-2222-2222-111111111111', NOW(), NOW(), NOW()),
  ('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', jsonb_build_object('sub', '22222222-2222-2222-2222-222222222222', 'email', 'admin@globex-corp.com', 'email_verified', true), 'email', '22222222-2222-2222-2222-222222222222', NOW(), NOW(), NOW()),
  ('22222222-2222-2222-2222-333333333333', '22222222-2222-2222-2222-333333333333', jsonb_build_object('sub', '22222222-2222-2222-2222-333333333333', 'email', 'hr@globex-corp.com', 'email_verified', true), 'email', '22222222-2222-2222-2222-333333333333', NOW(), NOW(), NOW()),
  ('22222222-2222-2222-2222-444444444444', '22222222-2222-2222-2222-444444444444', jsonb_build_object('sub', '22222222-2222-2222-2222-444444444444', 'email', 'manager@globex-corp.com', 'email_verified', true), 'email', '22222222-2222-2222-2222-444444444444', NOW(), NOW(), NOW()),
  ('22222222-2222-2222-2222-555555555555', '22222222-2222-2222-2222-555555555555', jsonb_build_object('sub', '22222222-2222-2222-2222-555555555555', 'email', 'employee@globex-corp.com', 'email_verified', true), 'email', '22222222-2222-2222-2222-555555555555', NOW(), NOW(), NOW()),
  -- Initech
  ('33333333-3333-3333-3333-111111111111', '33333333-3333-3333-3333-111111111111', jsonb_build_object('sub', '33333333-3333-3333-3333-111111111111', 'email', 'superadmin@initech-ltd.com', 'email_verified', true), 'email', '33333333-3333-3333-3333-111111111111', NOW(), NOW(), NOW()),
  ('33333333-3333-3333-3333-222222222222', '33333333-3333-3333-3333-222222222222', jsonb_build_object('sub', '33333333-3333-3333-3333-222222222222', 'email', 'admin@initech-ltd.com', 'email_verified', true), 'email', '33333333-3333-3333-3333-222222222222', NOW(), NOW(), NOW()),
  ('33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', jsonb_build_object('sub', '33333333-3333-3333-3333-333333333333', 'email', 'hr@initech-ltd.com', 'email_verified', true), 'email', '33333333-3333-3333-3333-333333333333', NOW(), NOW(), NOW()),
  ('33333333-3333-3333-3333-444444444444', '33333333-3333-3333-3333-444444444444', jsonb_build_object('sub', '33333333-3333-3333-3333-444444444444', 'email', 'manager@initech-ltd.com', 'email_verified', true), 'email', '33333333-3333-3333-3333-444444444444', NOW(), NOW(), NOW()),
  ('33333333-3333-3333-3333-555555555555', '33333333-3333-3333-3333-555555555555', jsonb_build_object('sub', '33333333-3333-3333-3333-555555555555', 'email', 'employee@initech-ltd.com', 'email_verified', true), 'email', '33333333-3333-3333-3333-555555555555', NOW(), NOW(), NOW())
ON CONFLICT (provider, provider_id) DO UPDATE SET
  identity_data = EXCLUDED.identity_data,
  updated_at = NOW();

-- 5. Reload Schema
NOTIFY pgrst, 'reload schema';
