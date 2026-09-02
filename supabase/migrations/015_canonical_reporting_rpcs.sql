-- ============================================================
-- AttendX v2 — Migration 016: Canonical Data Engine Reporting RPCs
-- Spec: docs/specs/29_31_ai_data_engine_handoff_spec.md (BRD §30)
-- ============================================================

-- 1. Today-at-a-Glance Workforce Summary (Tenant-Timezone Aware)
CREATE OR REPLACE FUNCTION public.admin_attendance_glance(p_tenant_id UUID)
RETURNS TABLE (status TEXT, employee_count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH tz AS (
    SELECT COALESCE(timezone, 'UTC') AS tz_name 
    FROM public.tenants 
    WHERE id = p_tenant_id
  ),
  today_date AS (
    SELECT (NOW() AT TIME ZONE (SELECT tz_name FROM tz))::date AS d
  ),
  all_active AS (
    SELECT e.id 
    FROM public.employees e 
    JOIN public.profiles p ON p.id = e.id
    WHERE e.tenant_id = p_tenant_id 
      AND p.is_active = TRUE
  ),
  records AS (
    SELECT ar.employee_id, ar.status, ar.clock_in_at, ar.clock_out_at
    FROM public.attendance_records ar
    WHERE ar.tenant_id = p_tenant_id 
      AND ar.date = (SELECT d FROM today_date)
  )
  SELECT 'PRESENT'::TEXT,
         COUNT(*) FILTER (WHERE clock_in_at IS NOT NULL AND clock_out_at IS NULL) 
  FROM records
  UNION ALL
  SELECT 'COMPLETED'::TEXT, 
         COUNT(*) FILTER (WHERE clock_out_at IS NOT NULL) 
  FROM records
  UNION ALL
  SELECT 'ON_LEAVE'::TEXT, 
         COUNT(*) FILTER (WHERE status = 'ON_LEAVE') 
  FROM records
  UNION ALL
  SELECT 'ABSENT'::TEXT, (
    SELECT COUNT(*) 
    FROM all_active ae
    WHERE ae.id NOT IN (SELECT employee_id FROM records WHERE clock_in_at IS NOT NULL OR status = 'ON_LEAVE')
  )
  UNION ALL
  SELECT 'TOTAL'::TEXT, 
         COUNT(*) 
  FROM all_active;
$$;

REVOKE ALL ON FUNCTION public.admin_attendance_glance(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_attendance_glance(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_attendance_glance(UUID) TO authenticated;
