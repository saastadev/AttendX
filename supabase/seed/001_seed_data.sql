-- ============================================================
-- AttendX v2 — Seed Data (100% Idempotent Dynamic Provisioning)
-- 3 Tenants × 5 roles each + realistic multi-tenant data
-- ============================================================

DO $$
DECLARE
  v_uid UUID;
  r RECORD;
  v_emp_acme UUID;
  v_emp_globex UUID;
BEGIN
  -- ============================================================
  -- 1. TENANTS
  -- ============================================================
  INSERT INTO tenants (id, name, slug, accent_color, app_name, timezone) VALUES
    ('11111111-0000-0000-0000-000000000001', 'Acme Technologies', 'acme-tech',    '#6C63FF', 'AttendX',         'Asia/Kolkata'),
    ('22222222-0000-0000-0000-000000000002', 'Globex Corp',       'globex-corp',  '#0EA5E9', 'Globex Attend',   'America/New_York'),
    ('33333333-0000-0000-0000-000000000003', 'Initech Ltd',       'initech-ltd',  '#10B981', 'Initech HR',      'Europe/London')
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug;

  -- ============================================================
  -- 2. DEMO USERS, PROFILES, ROLES & EMPLOYEES
  -- ============================================================
  FOR r IN SELECT * FROM (VALUES
    -- Tenant 1: Acme Technologies
    ('11111111-1111-1111-1111-111111111111'::uuid, '11111111-0000-0000-0000-000000000001'::uuid, 'superadmin@acme-tech.com', 'Alice Superadmin', 'SUPERADMIN'::user_role, NULL::text),
    ('11111111-1111-1111-1111-222222222222'::uuid, '11111111-0000-0000-0000-000000000001'::uuid, 'admin@acme-tech.com',      'Bob Admin',        'ADMIN'::user_role,      NULL::text),
    ('11111111-1111-1111-1111-333333333333'::uuid, '11111111-0000-0000-0000-000000000001'::uuid, 'hr@acme-tech.com',         'Carol HR',         'HR'::user_role,         NULL::text),
    ('11111111-1111-1111-1111-444444444444'::uuid, '11111111-0000-0000-0000-000000000001'::uuid, 'manager@acme-tech.com',    'David Manager',    'MANAGER'::user_role,    NULL::text),
    ('11111111-1111-1111-1111-555555555555'::uuid, '11111111-0000-0000-0000-000000000001'::uuid, 'employee@acme-tech.com',   'Eve Employee',     'EMPLOYEE'::user_role,   'ACM-101'),

    -- Tenant 2: Globex Corp
    ('22222222-2222-2222-2222-111111111111'::uuid, '22222222-0000-0000-0000-000000000002'::uuid, 'superadmin@globex-corp.com', 'Gary Superadmin', 'SUPERADMIN'::user_role, NULL::text),
    ('22222222-2222-2222-2222-222222222222'::uuid, '22222222-0000-0000-0000-000000000002'::uuid, 'admin@globex-corp.com',      'Grace Admin',     'ADMIN'::user_role,      NULL::text),
    ('22222222-2222-2222-2222-333333333333'::uuid, '22222222-0000-0000-0000-000000000002'::uuid, 'hr@globex-corp.com',         'Hannah HR',        'HR'::user_role,         NULL::text),
    ('22222222-2222-2222-2222-444444444444'::uuid, '22222222-0000-0000-0000-000000000002'::uuid, 'manager@globex-corp.com',    'Ian Manager',      'MANAGER'::user_role,    NULL::text),
    ('22222222-2222-2222-2222-555555555555'::uuid, '22222222-0000-0000-0000-000000000002'::uuid, 'employee@globex-corp.com',   'Ivy Employee',     'EMPLOYEE'::user_role,   'GLB-201'),

    -- Tenant 3: Initech Ltd
    ('33333333-3333-3333-3333-111111111111'::uuid, '33333333-0000-0000-0000-000000000003'::uuid, 'superadmin@initech-ltd.com', 'Ivan Superadmin', 'SUPERADMIN'::user_role, NULL::text),
    ('33333333-3333-3333-3333-222222222222'::uuid, '33333333-0000-0000-0000-000000000003'::uuid, 'admin@initech-ltd.com',      'Irene Admin',     'ADMIN'::user_role,      NULL::text),
    ('33333333-3333-3333-3333-333333333333'::uuid, '33333333-0000-0000-0000-000000000003'::uuid, 'hr@initech-ltd.com',         'Jack HR',          'HR'::user_role,         NULL::text),
    ('33333333-3333-3333-3333-444444444444'::uuid, '33333333-0000-0000-0000-000000000003'::uuid, 'manager@initech-ltd.com',    'Karen Manager',    'MANAGER'::user_role,    NULL::text),
    ('33333333-3333-3333-3333-555555555555'::uuid, '33333333-0000-0000-0000-000000000003'::uuid, 'employee@initech-ltd.com',   'Leo Employee',     'EMPLOYEE'::user_role,   'INI-301')
  ) AS t(default_uid, tenant_id, email, full_name, role_name, emp_code)
  LOOP
    -- 1. Resolve or create user in auth.users
    SELECT id INTO v_uid FROM auth.users WHERE email = r.email;

    IF v_uid IS NULL THEN
      IF EXISTS (SELECT 1 FROM auth.users WHERE id = r.default_uid) THEN
        v_uid := gen_random_uuid();
      ELSE
        v_uid := r.default_uid;
      END IF;

      INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        is_sso_user, created_at, updated_at
      ) VALUES (
        v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        r.email, crypt('Password123!', gen_salt('bf')), NOW(),
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'tenant_id', r.tenant_id),
        jsonb_build_object('full_name', r.full_name), false, NOW(), NOW()
      );
    ELSE
      UPDATE auth.users
      SET encrypted_password = crypt('Password123!', gen_salt('bf')),
          email_confirmed_at = NOW(),
          raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'tenant_id', r.tenant_id),
          raw_user_meta_data = jsonb_build_object('full_name', r.full_name),
          updated_at = NOW()
      WHERE id = v_uid;
    END IF;

    -- 2. Upsert auth.identities
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_uid, v_uid, jsonb_build_object('sub', v_uid::text, 'email', r.email, 'email_verified', true),
      'email', v_uid::text, NOW(), NOW(), NOW()
    ) ON CONFLICT (provider, provider_id) DO UPDATE SET
      identity_data = EXCLUDED.identity_data,
      user_id = EXCLUDED.user_id,
      updated_at = NOW();

    -- 3. Upsert profiles
    INSERT INTO profiles (id, tenant_id, email, full_name, is_active, onboarding_completed)
    VALUES (v_uid, r.tenant_id, r.email, r.full_name, TRUE, TRUE)
    ON CONFLICT (id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      tenant_id = EXCLUDED.tenant_id,
      is_active = TRUE,
      onboarding_completed = TRUE;

    -- 4. Upsert user_roles
    INSERT INTO user_roles (user_id, tenant_id, role)
    VALUES (v_uid, r.tenant_id, r.role_name)
    ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = EXCLUDED.role;

    -- 5. Upsert employee record
    IF r.emp_code IS NOT NULL THEN
      INSERT INTO employees (id, tenant_id, employee_code, employment_type)
      VALUES (v_uid, r.tenant_id, r.emp_code, 'FULL_TIME')
      ON CONFLICT (id) DO UPDATE SET employee_code = EXCLUDED.employee_code;
    END IF;
  END LOOP;

  -- 6. Link manager hierarchy dynamically
  UPDATE employees e
  SET manager_id = m.id
  FROM profiles m
  WHERE e.tenant_id = '11111111-0000-0000-0000-000000000001'
    AND e.id = (SELECT id FROM profiles WHERE email = 'employee@acme-tech.com' AND tenant_id = '11111111-0000-0000-0000-000000000001')
    AND m.email = 'manager@acme-tech.com'
    AND m.tenant_id = '11111111-0000-0000-0000-000000000001';

  UPDATE employees e
  SET manager_id = m.id
  FROM profiles m
  WHERE e.tenant_id = '22222222-0000-0000-0000-000000000002'
    AND e.id = (SELECT id FROM profiles WHERE email = 'employee@globex-corp.com' AND tenant_id = '22222222-0000-0000-0000-000000000002')
    AND m.email = 'manager@globex-corp.com'
    AND m.tenant_id = '22222222-0000-0000-0000-000000000002';

  UPDATE employees e
  SET manager_id = m.id
  FROM profiles m
  WHERE e.tenant_id = '33333333-0000-0000-0000-000000000003'
    AND e.id = (SELECT id FROM profiles WHERE email = 'employee@initech-ltd.com' AND tenant_id = '33333333-0000-0000-0000-000000000003')
    AND m.email = 'manager@initech-ltd.com'
    AND m.tenant_id = '33333333-0000-0000-0000-000000000003';

  -- ============================================================
  -- 7. ATTENDANCE & LEAVE RECORDS
  -- ============================================================
  SELECT id INTO v_emp_acme FROM profiles WHERE email = 'employee@acme-tech.com' LIMIT 1;
  SELECT id INTO v_emp_globex FROM profiles WHERE email = 'employee@globex-corp.com' LIMIT 1;

  IF v_emp_acme IS NOT NULL THEN
    INSERT INTO attendance_records (tenant_id, employee_id, date, clock_in_at, status, method, work_minutes)
    VALUES ('11111111-0000-0000-0000-000000000001', v_emp_acme, CURRENT_DATE, NOW() - INTERVAL '4 hours', 'PRESENT', 'SELFIE_GPS', 240)
    ON CONFLICT (tenant_id, employee_id, date) DO NOTHING;

    INSERT INTO attrition_risk_scores (tenant_id, employee_id, score, risk_level, factors)
    VALUES ('11111111-0000-0000-0000-000000000001', v_emp_acme, 0.15, 'LOW', '{"overtime_hours": 2}'::jsonb)
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_emp_globex IS NOT NULL THEN
    INSERT INTO attendance_records (tenant_id, employee_id, date, clock_in_at, status, method, work_minutes)
    VALUES ('22222222-0000-0000-0000-000000000002', v_emp_globex, CURRENT_DATE, NOW() - INTERVAL '5 hours', 'PRESENT', 'SELFIE_GPS', 300)
    ON CONFLICT (tenant_id, employee_id, date) DO NOTHING;

    INSERT INTO attrition_risk_scores (tenant_id, employee_id, score, risk_level, factors)
    VALUES ('22222222-0000-0000-0000-000000000002', v_emp_globex, 0.65, 'HIGH', '{"overtime_hours": 24}'::jsonb)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Audit log entries
  INSERT INTO audit_log (tenant_id, actor_id, action, table_name) VALUES
    ('11111111-0000-0000-0000-000000000001', COALESCE((SELECT id FROM profiles WHERE email = 'superadmin@acme-tech.com' LIMIT 1), '11111111-1111-1111-1111-111111111111'), 'TENANT_CREATED', 'tenants'),
    ('22222222-0000-0000-0000-000000000002', COALESCE((SELECT id FROM profiles WHERE email = 'superadmin@globex-corp.com' LIMIT 1), '22222222-2222-2222-2222-111111111111'), 'TENANT_CREATED', 'tenants')
  ON CONFLICT DO NOTHING;

END $$;
