-- ============================================================
-- Migration 018: Create gps_tracking table for location telemetry
-- Authoritative Model: AttendX MVP DB Design (Attendance/Location Domain)
-- Tenant Isolation: AttendX Multi-Tenant Architecture (Charter Rules 2 & 3)
-- ============================================================

-- 1. Create table public.gps_tracking
-- Note: gps_log_id, employee_id, latitude, longitude, speed, timestamp are explicitly
-- defined in the AttendX MVP DB Design. tenant_id is added in accordance with AttendX
-- multi-tenant architecture and RLS isolation conventions (Rule 2 & 3).
CREATE TABLE IF NOT EXISTS public.gps_tracking (
  gps_log_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id  UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  latitude     DECIMAL(10, 7) NOT NULL,
  longitude    DECIMAL(10, 7) NOT NULL,
  speed        DECIMAL(8, 2) DEFAULT 0.0,
  timestamp    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Tenant / Employee / Time-Series B-tree Indexes
CREATE INDEX IF NOT EXISTS idx_gps_tracking_tenant_emp_time 
  ON public.gps_tracking (tenant_id, employee_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_gps_tracking_employee 
  ON public.gps_tracking (employee_id);

CREATE INDEX IF NOT EXISTS idx_gps_tracking_timestamp 
  ON public.gps_tracking (timestamp DESC);

-- 3. Row Level Security (RLS)
ALTER TABLE public.gps_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gps_tracking FORCE ROW LEVEL SECURITY;

-- Policy 1: Employees can insert their own telemetry within their tenant
CREATE POLICY "gps_tracking_employee_insert" ON public.gps_tracking
  FOR INSERT WITH CHECK (
    employee_id = auth.uid() 
    AND tenant_id = get_my_tenant_id()
  );

-- Policy 2: Employees can view their own telemetry
CREATE POLICY "gps_tracking_employee_select" ON public.gps_tracking
  FOR SELECT USING (
    employee_id = auth.uid() 
    AND tenant_id = get_my_tenant_id()
  );

-- Policy 3: Managers can view route telemetry of their direct reports
CREATE POLICY "gps_tracking_manager_select" ON public.gps_tracking
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['MANAGER']::user_role[])
    AND employee_id IN (
      SELECT id FROM public.employees 
      WHERE manager_id = auth.uid() 
      AND tenant_id = get_my_tenant_id()
    )
  );

-- Policy 4: HR and Admins can view all telemetry within their tenant
CREATE POLICY "gps_tracking_admin_select" ON public.gps_tracking
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- Policy 5: Service Role full operational access
CREATE POLICY "gps_tracking_service_all" ON public.gps_tracking
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
