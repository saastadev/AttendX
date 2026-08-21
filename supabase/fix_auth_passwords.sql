-- ============================================================
-- AttendX v2 — Complete Supabase GoTrue Auth Activation Script
-- Populates auth.users AND auth.identities for all 15 demo accounts
-- Uses jsonb_build_object to prevent syntax/newline issues
-- ============================================================

-- 1. Insert / Update auth.users with standard password 'Password123!'
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
  -- Tenant 1: Acme Technologies
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'superadmin@acme-tech.com', crypt('Password123!', gen_salt('bf')), NOW(), jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'tenant_id', '11111111-0000-0000-0000-000000000001'), jsonb_build_object('full_name', 'Alice Superadmin'), false, NOW(), NOW()),
  ('11111111-1111-1111-1111-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@acme-tech.com', crypt('Password123!', gen_salt('bf')), NOW(), jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'tenant_id', '11111111-0000-0000-0000-000000000001'), jsonb_build_object('full_name', 'Bob Admin'), false, NOW(), NOW()),
  ('11111111-1111-1111-1111-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hr@acme-tech.com', crypt('Password123!', gen_salt('bf')), NOW(), jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'tenant_id', '11111111-0000-0000-0000-000000000001'), jsonb_build_object('full_name', 'Carol HR'), false, NOW(), NOW()),
  ('11111111-1111-1111-1111-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager@acme-tech.com', crypt('Password123!', gen_salt('bf')), NOW(), jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'tenant_id', '11111111-0000-0000-0000-000000000001'), jsonb_build_object('full_name', 'David Manager'), false, NOW(), NOW()),
  ('11111111-1111-1111-1111-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'employee@acme-tech.com', crypt('Password123!', gen_salt('bf')), NOW(), jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'tenant_id', '11111111-0000-0000-0000-000000000001'), jsonb_build_object('full_name', 'Eve Employee'), false, NOW(), NOW()),
  -- Tenant 2: Globex Corp
  ('22222222-2222-2222-2222-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'superadmin@globex-corp.com', crypt('Password123!', gen_salt('bf')), NOW(), jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'tenant_id', '22222222-0000-0000-0000-000000000002'), jsonb_build_object('full_name', 'Gary Superadmin'), false, NOW(), NOW()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@globex-corp.com', crypt('Password123!', gen_salt('bf')), NOW(), jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'tenant_id', '22222222-0000-0000-0000-000000000002'), jsonb_build_object('full_name', 'Grace Admin'), false, NOW(), NOW()),
  ('22222222-2222-2222-2222-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hr@globex-corp.com', crypt('Password123!', gen_salt('bf')), NOW(), jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'tenant_id', '22222222-0000-0000-0000-000000000002'), jsonb_build_object('full_name', 'Hannah HR'), false, NOW(), NOW()),
  ('22222222-2222-2222-2222-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager@globex-corp.com', crypt('Password123!', gen_salt('bf')), NOW(), jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'tenant_id', '22222222-0000-0000-0000-000000000002'), jsonb_build_object('full_name', 'Ian Manager'), false, NOW(), NOW()),
  ('22222222-2222-2222-2222-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'employee@globex-corp.com', crypt('Password123!', gen_salt('bf')), NOW(), jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'tenant_id', '22222222-0000-0000-0000-000000000002'), jsonb_build_object('full_name', 'Ivy Employee'), false, NOW(), NOW()),
  -- Tenant 3: Initech Ltd
  ('33333333-3333-3333-3333-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'superadmin@initech-ltd.com', crypt('Password123!', gen_salt('bf')), NOW(), jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'tenant_id', '33333333-0000-0000-0000-000000000003'), jsonb_build_object('full_name', 'Ivan Superadmin'), false, NOW(), NOW()),
  ('33333333-3333-3333-3333-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@initech-ltd.com', crypt('Password123!', gen_salt('bf')), NOW(), jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'tenant_id', '33333333-0000-0000-0000-000000000003'), jsonb_build_object('full_name', 'Irene Admin'), false, NOW(), NOW()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hr@initech-ltd.com', crypt('Password123!', gen_salt('bf')), NOW(), jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'tenant_id', '33333333-0000-0000-0000-000000000003'), jsonb_build_object('full_name', 'Jack HR'), false, NOW(), NOW()),
  ('33333333-3333-3333-3333-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager@initech-ltd.com', crypt('Password123!', gen_salt('bf')), NOW(), jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'tenant_id', '33333333-0000-0000-0000-000000000003'), jsonb_build_object('full_name', 'Karen Manager'), false, NOW(), NOW()),
  ('33333333-3333-3333-3333-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'employee@initech-ltd.com', crypt('Password123!', gen_salt('bf')), NOW(), jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'tenant_id', '33333333-0000-0000-0000-000000000003'), jsonb_build_object('full_name', 'Leo Employee'), false, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET 
  instance_id = '00000000-0000-0000-0000-000000000000',
  aud = 'authenticated',
  role = 'authenticated',
  email = EXCLUDED.email,
  encrypted_password = EXCLUDED.encrypted_password,
  email_confirmed_at = NOW(),
  raw_app_meta_data = EXCLUDED.raw_app_meta_data,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  updated_at = NOW();

-- 2. Insert / Update auth.identities (Required for GoTrue password verification)
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
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
