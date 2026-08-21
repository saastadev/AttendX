-- ============================================================
-- AttendX Migration: 013_admin_provisioning_hardening.sql
-- Scope B (Specs 07-12): Admin Provisioning, Atomic Seat Limit & Rollback RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_provision_employee_v2(
  p_auth_user_id   UUID,
  p_tenant_id      UUID,
  p_full_name      TEXT,
  p_email          TEXT,
  p_role           user_role DEFAULT 'EMPLOYEE',
  p_department_id  UUID      DEFAULT NULL,
  p_designation_id UUID      DEFAULT NULL,
  p_join_date      DATE      DEFAULT CURRENT_DATE,
  p_assigned_by    UUID      DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_max_employees INT;
  v_current_count INT;
  v_emp_code      TEXT;
  v_seq           INT;
BEGIN
  -- 1. Atomic Seat Limit Enforcement with Row Lock (BRD §10)
  SELECT max_employees INTO v_max_employees
  FROM public.tenants
  WHERE id = p_tenant_id
  FOR UPDATE; -- Prevents concurrent race conditions

  IF v_max_employees IS NOT NULL THEN
    SELECT COUNT(*) INTO v_current_count
    FROM public.profiles p
    WHERE p.tenant_id = p_tenant_id AND p.is_active = TRUE;

    IF v_current_count >= v_max_employees THEN
      RAISE EXCEPTION 'SEAT_LIMIT_REACHED: Tenant limit of % active employees reached.', v_max_employees
        USING ERRCODE = 'EX001';
    END IF;
  END IF;

  -- 2. Sequential Employee Code Generation
  SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(employee_code, '[^0-9]', '', 'g') AS INT)), 0) + 1
  INTO v_seq
  FROM public.employees
  WHERE tenant_id = p_tenant_id;

  v_emp_code := 'EMP-' || LPAD(v_seq::TEXT, 4, '0');

  -- 3. Create / Upsert Profile (Onboarding Incomplete for First-Login Setup)
  INSERT INTO public.profiles (
    id, tenant_id, email, full_name, is_active, onboarding_completed, created_at, updated_at
  )
  VALUES (
    p_auth_user_id, p_tenant_id, LOWER(TRIM(p_email)), TRIM(p_full_name), TRUE, FALSE, NOW(), NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    is_active = TRUE,
    onboarding_completed = FALSE,
    updated_at = NOW();

  -- 4. Assign Role
  INSERT INTO public.user_roles (
    user_id, tenant_id, role, assigned_by, assigned_at
  )
  VALUES (
    p_auth_user_id, p_tenant_id, p_role, p_assigned_by, NOW()
  )
  ON CONFLICT (user_id, tenant_id) DO UPDATE SET
    role = EXCLUDED.role,
    assigned_by = EXCLUDED.assigned_by,
    assigned_at = NOW();

  -- 5. Create Employee Record
  INSERT INTO public.employees (
    id, tenant_id, employee_code, department_id, designation_id, join_date, created_at, updated_at
  )
  VALUES (
    p_auth_user_id, p_tenant_id, v_emp_code, p_department_id, p_designation_id, p_join_date, NOW(), NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    employee_code = v_emp_code,
    department_id = EXCLUDED.department_id,
    designation_id = EXCLUDED.designation_id,
    join_date = EXCLUDED.join_date,
    updated_at = NOW();

  -- 6. Immutable Audit Log Entry (Rule 5: Zero Passwords)
  INSERT INTO public.audit_log (
    tenant_id, actor_id, action, table_name, record_id, new_data, created_at
  )
  VALUES (
    p_tenant_id,
    p_assigned_by,
    'EMPLOYEE_PROVISIONED',
    'employees',
    p_auth_user_id,
    jsonb_build_object(
      'email', LOWER(TRIM(p_email)),
      'full_name', TRIM(p_full_name),
      'role', p_role,
      'employee_code', v_emp_code
    ),
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_auth_user_id,
    'employee_code', v_emp_code,
    'role', p_role
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_provision_employee_v2 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_provision_employee_v2 TO service_role;
