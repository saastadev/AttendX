-- ============================================================
-- AttendX v2 — Seed Data
-- 3 Tenants × 5 roles each + realistic multi-tenant data
-- ============================================================

-- ============================================================
-- 1. TENANTS
-- ============================================================

INSERT INTO tenants (id, name, slug, accent_color, app_name, timezone) VALUES
  ('11111111-0000-0000-0000-000000000001', 'Acme Technologies', 'acme-tech',    '#6C63FF', 'AttendX',         'Asia/Kolkata'),
  ('22222222-0000-0000-0000-000000000002', 'Globex Corp',       'globex-corp',  '#0EA5E9', 'Globex Attend',   'America/New_York'),
  ('33333333-0000-0000-0000-000000000003', 'Initech Ltd',       'initech-ltd',  '#10B981', 'Initech HR',      'Europe/London')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug;

-- ============================================================
-- 2. AUTH USERS (3 Tenants × 5 Roles = 15 Users)
-- Complete GoTrue auth.users rows with encrypted password 'Password123!'
-- ============================================================

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

-- 2b. AUTH IDENTITIES (Required for GoTrue password verification)
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
  ('33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', jsonb_build_object('sub', '33333333-3333-3333-3333-111111111111', 'email', 'hr@initech-ltd.com', 'email_verified', true), 'email', '33333333-3333-3333-3333-333333333333', NOW(), NOW(), NOW()),
  ('33333333-3333-3333-3333-444444444444', '33333333-3333-3333-3333-444444444444', jsonb_build_object('sub', '33333333-3333-3333-3333-111111111111', 'email', 'manager@initech-ltd.com', 'email_verified', true), 'email', '33333333-3333-3333-3333-444444444444', NOW(), NOW(), NOW()),
  ('33333333-3333-3333-3333-555555555555', '33333333-3333-3333-3333-555555555555', jsonb_build_object('sub', '33333333-3333-3333-3333-111111111111', 'email', 'employee@initech-ltd.com', 'email_verified', true), 'email', '33333333-3333-3333-3333-555555555555', NOW(), NOW(), NOW())
ON CONFLICT (provider, provider_id) DO UPDATE SET
  identity_data = EXCLUDED.identity_data,
  updated_at = NOW();

-- ============================================================
-- 3. PROFILES
-- ============================================================

INSERT INTO profiles (id, tenant_id, email, full_name, is_active, onboarding_completed) VALUES
  -- Acme
  ('11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-000000000001', 'superadmin@acme-tech.com', 'Alice Superadmin', TRUE, TRUE),
  ('11111111-1111-1111-1111-222222222222', '11111111-0000-0000-0000-000000000001', 'admin@acme-tech.com',      'Bob Admin',        TRUE, TRUE),
  ('11111111-1111-1111-1111-333333333333', '11111111-0000-0000-0000-000000000001', 'hr@acme-tech.com',         'Carol HR',         TRUE, TRUE),
  ('11111111-1111-1111-1111-444444444444', '11111111-0000-0000-0000-000000000001', 'manager@acme-tech.com',    'David Manager',    TRUE, TRUE),
  ('11111111-1111-1111-1111-555555555555', '11111111-0000-0000-0000-000000000001', 'employee@acme-tech.com',   'Eve Employee',     TRUE, TRUE),
  -- Globex
  ('22222222-2222-2222-2222-111111111111', '22222222-0000-0000-0000-000000000002', 'superadmin@globex-corp.com', 'Gary Superadmin', TRUE, TRUE),
  ('22222222-2222-2222-2222-222222222222', '22222222-0000-0000-0000-000000000002', 'admin@globex-corp.com',      'Grace Admin',     TRUE, TRUE),
  ('22222222-2222-2222-2222-333333333333', '22222222-0000-0000-0000-000000000002', 'hr@globex-corp.com',         'Hannah HR',        TRUE, TRUE),
  ('22222222-2222-2222-2222-444444444444', '22222222-0000-0000-0000-000000000002', 'manager@globex-corp.com',    'Ian Manager',      TRUE, TRUE),
  ('22222222-2222-2222-2222-555555555555', '22222222-0000-0000-0000-000000000002', 'employee@globex-corp.com',   'Ivy Employee',     TRUE, TRUE),
  -- Initech
  ('33333333-3333-3333-3333-111111111111', '33333333-0000-0000-0000-000000000003', 'superadmin@initech-ltd.com', 'Ivan Superadmin', TRUE, TRUE),
  ('33333333-3333-3333-3333-222222222222', '33333333-0000-0000-0000-000000000003', 'admin@initech-ltd.com',      'Irene Admin',     TRUE, TRUE),
  ('33333333-3333-3333-3333-333333333333', '33333333-0000-0000-0000-000000000003', 'hr@initech-ltd.com',         'Jack HR',          TRUE, TRUE),
  ('33333333-3333-3333-3333-444444444444', '33333333-0000-0000-0000-000000000003', 'manager@initech-ltd.com',    'Karen Manager',    TRUE, TRUE),
  ('33333333-3333-3333-3333-555555555555', '33333333-0000-0000-0000-000000000003', 'employee@initech-ltd.com',   'Leo Employee',     TRUE, TRUE)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

-- ============================================================
-- 4. USER ROLES
-- ============================================================

INSERT INTO user_roles (user_id, tenant_id, role) VALUES
  -- Acme
  ('11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-000000000001', 'SUPERADMIN'),
  ('11111111-1111-1111-1111-222222222222', '11111111-0000-0000-0000-000000000001', 'ADMIN'),
  ('11111111-1111-1111-1111-333333333333', '11111111-0000-0000-0000-000000000001', 'HR'),
  ('11111111-1111-1111-1111-444444444444', '11111111-0000-0000-0000-000000000001', 'MANAGER'),
  ('11111111-1111-1111-1111-555555555555', '11111111-0000-0000-0000-000000000001', 'EMPLOYEE'),
  -- Globex
  ('22222222-2222-2222-2222-111111111111', '22222222-0000-0000-0000-000000000002', 'SUPERADMIN'),
  ('22222222-2222-2222-2222-222222222222', '22222222-0000-0000-0000-000000000002', 'ADMIN'),
  ('22222222-2222-2222-2222-333333333333', '22222222-0000-0000-0000-000000000002', 'HR'),
  ('22222222-2222-2222-2222-444444444444', '22222222-0000-0000-0000-000000000002', 'MANAGER'),
  ('22222222-2222-2222-2222-555555555555', '22222222-0000-0000-0000-000000000002', 'EMPLOYEE'),
  -- Initech
  ('33333333-3333-3333-3333-111111111111', '33333333-0000-0000-0000-000000000003', 'SUPERADMIN'),
  ('33333333-3333-3333-3333-222222222222', '33333333-0000-0000-0000-000000000003', 'ADMIN'),
  ('33333333-3333-3333-3333-333333333333', '33333333-0000-0000-0000-000000000003', 'HR'),
  ('33333333-3333-3333-3333-444444444444', '33333333-0000-0000-0000-000000000003', 'MANAGER'),
  ('33333333-3333-3333-3333-555555555555', '33333333-0000-0000-0000-000000000003', 'EMPLOYEE')
ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = EXCLUDED.role;

-- ============================================================
-- 5. EMPLOYEES
-- ============================================================

INSERT INTO employees (id, tenant_id, employee_code, employment_type, manager_id) VALUES
  ('11111111-1111-1111-1111-555555555555', '11111111-0000-0000-0000-000000000001', 'ACM-101', 'FULL_TIME', '11111111-1111-1111-1111-444444444444'),
  ('22222222-2222-2222-2222-555555555555', '22222222-0000-0000-0000-000000000002', 'GLB-201', 'FULL_TIME', '22222222-2222-2222-2222-444444444444'),
  ('33333333-3333-3333-3333-555555555555', '33333333-0000-0000-0000-000000000003', 'INI-301', 'FULL_TIME', '33333333-3333-3333-3333-444444444444')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 6. ATTENDANCE & LEAVE RECORDS
-- ============================================================

INSERT INTO attendance_records (tenant_id, employee_id, date, clock_in_at, status, method, work_minutes) VALUES
  ('11111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-555555555555', CURRENT_DATE, NOW() - INTERVAL '4 hours', 'PRESENT', 'SELFIE_GPS', 240),
  ('22222222-0000-0000-0000-000000000002', '22222222-2222-2222-2222-555555555555', CURRENT_DATE, NOW() - INTERVAL '5 hours', 'PRESENT', 'SELFIE_GPS', 300)
ON CONFLICT (tenant_id, employee_id, date) DO NOTHING;

-- Attrition risk score
INSERT INTO attrition_risk_scores (tenant_id, employee_id, score, risk_level, factors) VALUES
  ('11111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-555555555555', 0.15, 'LOW', '{"overtime_hours": 2}'::jsonb),
  ('22222222-0000-0000-0000-000000000002', '22222222-2222-2222-2222-555555555555', 0.65, 'HIGH', '{"overtime_hours": 24}'::jsonb)
ON CONFLICT DO NOTHING;

-- Audit log entries
INSERT INTO audit_log (tenant_id, actor_id, action, table_name) VALUES
  ('11111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'TENANT_CREATED', 'tenants'),
  ('22222222-0000-0000-0000-000000000002', '22222222-2222-2222-2222-111111111111', 'TENANT_CREATED', 'tenants')
ON CONFLICT DO NOTHING;
