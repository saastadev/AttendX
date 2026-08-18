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
-- ============================================================

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  -- Tenant 1: Acme
  ('11111111-1111-1111-1111-111111111111', 'superadmin@acme-tech.com', '{"full_name": "Alice Superadmin"}'::jsonb),
  ('11111111-1111-1111-1111-222222222222', 'admin@acme-tech.com',      '{"full_name": "Bob Admin"}'::jsonb),
  ('11111111-1111-1111-1111-333333333333', 'hr@acme-tech.com',         '{"full_name": "Carol HR"}'::jsonb),
  ('11111111-1111-1111-1111-444444444444', 'manager@acme-tech.com',    '{"full_name": "David Manager"}'::jsonb),
  ('11111111-1111-1111-1111-555555555555', 'employee@acme-tech.com',   '{"full_name": "Eve Employee"}'::jsonb),
  -- Tenant 2: Globex
  ('22222222-2222-2222-2222-111111111111', 'superadmin@globex-corp.com', '{"full_name": "Gary Superadmin"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'admin@globex-corp.com',      '{"full_name": "Grace Admin"}'::jsonb),
  ('22222222-2222-2222-2222-333333333333', 'hr@globex-corp.com',         '{"full_name": "Hannah HR"}'::jsonb),
  ('22222222-2222-2222-2222-444444444444', 'manager@globex-corp.com',    '{"full_name": "Ian Manager"}'::jsonb),
  ('22222222-2222-2222-2222-555555555555', 'employee@globex-corp.com',   '{"full_name": "Ivy Employee"}'::jsonb),
  -- Tenant 3: Initech
  ('33333333-3333-3333-3333-111111111111', 'superadmin@initech-ltd.com', '{"full_name": "Ivan Superadmin"}'::jsonb),
  ('33333333-3333-3333-3333-222222222222', 'admin@initech-ltd.com',      '{"full_name": "Irene Admin"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'hr@initech-ltd.com',         '{"full_name": "Jack HR"}'::jsonb),
  ('33333333-3333-3333-3333-444444444444', 'manager@initech-ltd.com',    '{"full_name": "Karen Manager"}'::jsonb),
  ('33333333-3333-3333-3333-555555555555', 'employee@initech-ltd.com',   '{"full_name": "Leo Employee"}'::jsonb)
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

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
