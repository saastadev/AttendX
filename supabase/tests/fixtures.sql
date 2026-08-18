-- ============================================================
-- AttendX v2 — Test Fixtures
-- Fixtures for RLS isolation & anti-regression testing.
-- Guarantees deterministic tenants, users, roles, and business data.
-- ============================================================

-- 1. Ensure Tenants exist
INSERT INTO tenants (id, name, slug, accent_color, app_name, timezone) VALUES
  ('11111111-0000-0000-0000-000000000001', 'Acme Technologies', 'acme-tech',    '#6C63FF', 'AttendX',       'Asia/Kolkata'),
  ('22222222-0000-0000-0000-000000000002', 'Globex Corp',       'globex-corp',  '#0EA5E9', 'Globex Attend', 'America/New_York'),
  ('33333333-0000-0000-0000-000000000003', 'Initech Ltd',       'initech-ltd',  '#10B981', 'Initech HR',    'Europe/London')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug;

-- 2. Auth Users for Tenant 1 (Acme) & Tenant 2 (Globex)
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('11111111-1111-1111-1111-111111111111', 'superadmin@acme-tech.com', '{"full_name": "Alice Superadmin"}'::jsonb),
  ('11111111-1111-1111-1111-222222222222', 'admin@acme-tech.com',      '{"full_name": "Bob Admin"}'::jsonb),
  ('11111111-1111-1111-1111-333333333333', 'hr@acme-tech.com',         '{"full_name": "Carol HR"}'::jsonb),
  ('11111111-1111-1111-1111-444444444444', 'manager@acme-tech.com',    '{"full_name": "David Manager"}'::jsonb),
  ('11111111-1111-1111-1111-555555555555', 'employee@acme-tech.com',   '{"full_name": "Eve Employee"}'::jsonb),

  ('22222222-2222-2222-2222-111111111111', 'superadmin@globex-corp.com', '{"full_name": "Gary Superadmin"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'admin@globex-corp.com',      '{"full_name": "Grace Admin"}'::jsonb),
  ('22222222-2222-2222-2222-333333333333', 'hr@globex-corp.com',         '{"full_name": "Hannah HR"}'::jsonb),
  ('22222222-2222-2222-2222-444444444444', 'manager@globex-corp.com',    '{"full_name": "Ian Manager"}'::jsonb),
  ('22222222-2222-2222-2222-555555555555', 'employee@globex-corp.com',   '{"full_name": "Ivy Employee"}'::jsonb),

  ('44444444-4444-4444-4444-444444444444', 'multitenant@dual-tenant.com', '{"full_name": "Multi Tenant User"}'::jsonb)
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

-- 3. Profiles
INSERT INTO profiles (id, tenant_id, email, full_name, is_active, onboarding_completed) VALUES
  ('11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-000000000001', 'superadmin@acme-tech.com', 'Alice Superadmin', TRUE, TRUE),
  ('11111111-1111-1111-1111-222222222222', '11111111-0000-0000-0000-000000000001', 'admin@acme-tech.com',      'Bob Admin',        TRUE, TRUE),
  ('11111111-1111-1111-1111-333333333333', '11111111-0000-0000-0000-000000000001', 'hr@acme-tech.com',         'Carol HR',         TRUE, TRUE),
  ('11111111-1111-1111-1111-444444444444', '11111111-0000-0000-0000-000000000001', 'manager@acme-tech.com',    'David Manager',    TRUE, TRUE),
  ('11111111-1111-1111-1111-555555555555', '11111111-0000-0000-0000-000000000001', 'employee@acme-tech.com',   'Eve Employee',     TRUE, TRUE),

  ('22222222-2222-2222-2222-111111111111', '22222222-0000-0000-0000-000000000002', 'superadmin@globex-corp.com', 'Gary Superadmin', TRUE, TRUE),
  ('22222222-2222-2222-2222-222222222222', '22222222-0000-0000-0000-000000000002', 'admin@globex-corp.com',      'Grace Admin',     TRUE, TRUE),
  ('22222222-2222-2222-2222-333333333333', '22222222-0000-0000-0000-000000000002', 'hr@globex-corp.com',         'Hannah HR',        TRUE, TRUE),
  ('22222222-2222-2222-2222-444444444444', '22222222-0000-0000-0000-000000000002', 'manager@globex-corp.com',    'Ian Manager',      TRUE, TRUE),
  ('22222222-2222-2222-2222-555555555555', '22222222-0000-0000-0000-000000000002', 'employee@globex-corp.com',   'Ivy Employee',     TRUE, TRUE),

  ('44444444-4444-4444-4444-444444444444', '11111111-0000-0000-0000-000000000001', 'multitenant@dual-tenant.com', 'Multi Tenant User', TRUE, TRUE)
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

-- 4. User Roles
INSERT INTO user_roles (user_id, tenant_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-000000000001', 'SUPERADMIN'),
  ('11111111-1111-1111-1111-222222222222', '11111111-0000-0000-0000-000000000001', 'ADMIN'),
  ('11111111-1111-1111-1111-333333333333', '11111111-0000-0000-0000-000000000001', 'HR'),
  ('11111111-1111-1111-1111-444444444444', '11111111-0000-0000-0000-000000000001', 'MANAGER'),
  ('11111111-1111-1111-1111-555555555555', '11111111-0000-0000-0000-000000000001', 'EMPLOYEE'),

  ('22222222-2222-2222-2222-111111111111', '22222222-0000-0000-0000-000000000002', 'SUPERADMIN'),
  ('22222222-2222-2222-2222-222222222222', '22222222-0000-0000-0000-000000000002', 'ADMIN'),
  ('22222222-2222-2222-2222-333333333333', '22222222-0000-0000-0000-000000000002', 'HR'),
  ('22222222-2222-2222-2222-444444444444', '22222222-0000-0000-0000-000000000002', 'MANAGER'),
  ('22222222-2222-2222-2222-555555555555', '22222222-0000-0000-0000-000000000002', 'EMPLOYEE'),

  ('44444444-4444-4444-4444-444444444444', '11111111-0000-0000-0000-000000000001', 'EMPLOYEE'),
  ('44444444-4444-4444-4444-444444444444', '22222222-0000-0000-0000-000000000002', 'EMPLOYEE')
ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = EXCLUDED.role;

-- 5. Attendance Records
INSERT INTO attendance_records (id, tenant_id, employee_id, date, status, method, clock_in_at, work_minutes) VALUES
  ('11111111-aaaa-1111-aaaa-111111111111', '11111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-555555555555', CURRENT_DATE, 'PRESENT', 'SELFIE_GPS', NOW() - INTERVAL '4 hours', 240),
  ('22222222-bbbb-2222-bbbb-222222222222', '22222222-0000-0000-0000-000000000002', '22222222-2222-2222-2222-555555555555', CURRENT_DATE, 'PRESENT', 'SELFIE_GPS', NOW() - INTERVAL '5 hours', 300)
ON CONFLICT (tenant_id, employee_id, date) DO UPDATE SET status = EXCLUDED.status;
