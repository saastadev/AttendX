-- ============================================================
-- AttendX v2 — Migration 007: Admin Provisioning & Glance View
-- ============================================================

-- ------------------------------------------------------------
-- 1. Fix handle_new_user to honor role from raw_user_meta_data
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID;
  v_full_name TEXT;
  v_role      user_role;
BEGIN
  BEGIN
    v_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_tenant_id := NULL;
  END;

  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );

  BEGIN
    v_role := (NEW.raw_user_meta_data->>'role')::user_role;
  EXCEPTION WHEN OTHERS THEN
    v_role := 'EMPLOYEE';
  END;
  IF v_role IS NULL THEN v_role := 'EMPLOYEE'; END IF;

  IF v_tenant_id IS NULL THEN
    SELECT id INTO v_tenant_id FROM tenants LIMIT 1;
  END IF;

  INSERT INTO public.profiles (id, tenant_id, email, full_name, is_active, onboarding_completed)
  VALUES (NEW.id, v_tenant_id, NEW.email, v_full_name, TRUE, FALSE)
  ON CONFLICT (id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    email     = EXCLUDED.email,
    full_name = EXCLUDED.full_name;

  IF v_tenant_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, tenant_id, role)
    VALUES (NEW.id, v_tenant_id, v_role)
    ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user error: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 2. Atomic admin_provision_employee RPC (service_role only)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_provision_employee(
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
  v_emp_code TEXT;
  v_seq      INT;
BEGIN
  SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(employee_code, '[^0-9]', '', 'g') AS INT)), 0) + 1
    INTO v_seq FROM employees WHERE tenant_id = p_tenant_id;

  v_emp_code := 'EMP-' || LPAD(v_seq::TEXT, 4, '0');

  INSERT INTO public.profiles (id, tenant_id, email, full_name, is_active, onboarding_completed)
  VALUES (p_auth_user_id, p_tenant_id, p_email, p_full_name, TRUE, FALSE)
  ON CONFLICT (id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id, email = EXCLUDED.email,
    full_name = EXCLUDED.full_name, is_active = TRUE;

  INSERT INTO public.user_roles (user_id, tenant_id, role, assigned_by, assigned_at)
  VALUES (p_auth_user_id, p_tenant_id, p_role, p_assigned_by, NOW())
  ON CONFLICT (user_id, tenant_id) DO UPDATE SET
    role = EXCLUDED.role, assigned_by = EXCLUDED.assigned_by, assigned_at = EXCLUDED.assigned_at;

  INSERT INTO public.employees (id, tenant_id, employee_code, department_id, designation_id, join_date)
  VALUES (p_auth_user_id, p_tenant_id, v_emp_code, p_department_id, p_designation_id, p_join_date)
  ON CONFLICT (id) DO UPDATE SET
    employee_code = v_emp_code, department_id = EXCLUDED.department_id,
    designation_id = EXCLUDED.designation_id, join_date = EXCLUDED.join_date;

  INSERT INTO public.audit_log (tenant_id, actor_id, action, table_name, record_id, new_data)
  VALUES (p_tenant_id, p_assigned_by, 'EMPLOYEE_PROVISIONED', 'employees', p_auth_user_id,
    jsonb_build_object('email', p_email, 'full_name', p_full_name, 'role', p_role, 'employee_code', v_emp_code));

  RETURN jsonb_build_object('user_id', p_auth_user_id, 'employee_code', v_emp_code, 'role', p_role);
END;
$$;

-- ------------------------------------------------------------
-- 3. Today-at-a-Glance for Admin Dashboard (tenant TZ aware)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_attendance_glance(p_tenant_id UUID)
RETURNS TABLE (status TEXT, employee_count BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH tz AS (SELECT timezone FROM tenants WHERE id = p_tenant_id),
  today_date AS (SELECT (NOW() AT TIME ZONE (SELECT timezone FROM tz))::date AS d),
  all_active AS (
    SELECT e.id FROM employees e JOIN profiles p ON p.id = e.id
     WHERE e.tenant_id = p_tenant_id AND p.is_active = TRUE
  ),
  records AS (
    SELECT ar.employee_id, ar.status, ar.clock_in_at, ar.clock_out_at
      FROM attendance_records ar
     WHERE ar.tenant_id = p_tenant_id AND ar.date = (SELECT d FROM today_date)
  )
  SELECT 'PRESENT'::TEXT,
         COUNT(*) FILTER (WHERE clock_in_at IS NOT NULL AND clock_out_at IS NULL) FROM records
  UNION ALL
  SELECT 'COMPLETED'::TEXT, COUNT(*) FILTER (WHERE clock_out_at IS NOT NULL) FROM records
  UNION ALL
  SELECT 'ON_LEAVE'::TEXT, COUNT(*) FILTER (WHERE status = 'ON_LEAVE') FROM records
  UNION ALL
  SELECT 'ABSENT'::TEXT, (
    SELECT COUNT(*) FROM all_active ae
     WHERE ae.id NOT IN (SELECT employee_id FROM records WHERE clock_in_at IS NOT NULL))
  UNION ALL
  SELECT 'TOTAL'::TEXT, COUNT(*) FROM all_active;
$$;

REVOKE ALL ON FUNCTION public.admin_attendance_glance(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_attendance_glance(UUID) TO service_role;
REVOKE ALL ON FUNCTION public.admin_provision_employee(UUID,UUID,TEXT,TEXT,user_role,UUID,UUID,DATE,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_provision_employee(UUID,UUID,TEXT,TEXT,user_role,UUID,UUID,DATE,UUID) TO service_role;
