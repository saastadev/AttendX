-- ============================================================
-- AttendX v2 — Row-Level Security Policies
-- Run after 001_initial_schema.sql
-- ============================================================

-- Enable RLS on every tenant-scoped table
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE designations ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE geofences ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE breaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE self_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE manager_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE recognition_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE recognition_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE recognition_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_dismissals ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE attrition_risk_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TENANTS
-- Only SUPERADMIN can see all tenants.
-- Users see only their own tenant.
-- ============================================================

CREATE POLICY "tenants_self" ON tenants
  FOR SELECT USING (id = get_my_tenant_id());

CREATE POLICY "tenants_superadmin_all" ON tenants
  FOR ALL USING (has_role(ARRAY['SUPERADMIN']::user_role[]));

CREATE POLICY "tenants_admin_update" ON tenants
  FOR UPDATE USING (id = get_my_tenant_id() AND has_role(ARRAY['ADMIN']::user_role[]));

-- ============================================================
-- PROFILES
-- ============================================================

-- Everyone can read profiles in their own tenant
CREATE POLICY "profiles_tenant_read" ON profiles
  FOR SELECT USING (tenant_id = get_my_tenant_id());

-- Users can update their own profile
CREATE POLICY "profiles_self_update" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- HR/ADMIN can insert profiles (via invite flow)
CREATE POLICY "profiles_hr_insert" ON profiles
  FOR INSERT WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- ============================================================
-- USER ROLES
-- ============================================================

-- Users can read their own role
CREATE POLICY "user_roles_self_read" ON user_roles
  FOR SELECT USING (user_id = auth.uid());

-- ADMIN/HR can read all roles in their tenant
CREATE POLICY "user_roles_admin_read" ON user_roles
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- Only ADMIN/SUPERADMIN can assign/change roles (never trusting client-supplied role)
CREATE POLICY "user_roles_admin_write" ON user_roles
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['ADMIN', 'SUPERADMIN']::user_role[])
  );

-- ============================================================
-- DEPARTMENTS & DESIGNATIONS
-- ============================================================

CREATE POLICY "departments_tenant_read" ON departments
  FOR SELECT USING (tenant_id = get_my_tenant_id());

CREATE POLICY "departments_admin_write" ON departments
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

CREATE POLICY "designations_tenant_read" ON designations
  FOR SELECT USING (tenant_id = get_my_tenant_id());

CREATE POLICY "designations_admin_write" ON designations
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- ============================================================
-- EMPLOYEES
-- ============================================================

-- Employees can read their own record
CREATE POLICY "employees_self_read" ON employees
  FOR SELECT USING (id = auth.uid());

-- Managers can read their direct reports
CREATE POLICY "employees_manager_read" ON employees
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND manager_id = auth.uid()
  );

-- HR/ADMIN can read all employees in their tenant
CREATE POLICY "employees_hr_read" ON employees
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- HR/ADMIN can write employees
CREATE POLICY "employees_hr_write" ON employees
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- Employees can update limited own fields (handled by profile table mostly)
CREATE POLICY "employees_self_update" ON employees
  FOR UPDATE USING (id = auth.uid() AND tenant_id = get_my_tenant_id());

-- ============================================================
-- SHIFTS & GEOFENCES
-- ============================================================

CREATE POLICY "shifts_tenant_read" ON shifts
  FOR SELECT USING (tenant_id = get_my_tenant_id());

CREATE POLICY "shifts_admin_write" ON shifts
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

CREATE POLICY "geofences_tenant_read" ON geofences
  FOR SELECT USING (tenant_id = get_my_tenant_id());

CREATE POLICY "geofences_admin_write" ON geofences
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- ============================================================
-- ATTENDANCE RECORDS
-- ============================================================

-- Employees: own records only
CREATE POLICY "attendance_self_read" ON attendance_records
  FOR SELECT USING (employee_id = auth.uid() AND tenant_id = get_my_tenant_id());

-- Employees can insert their own clock-in/out
CREATE POLICY "attendance_self_insert" ON attendance_records
  FOR INSERT WITH CHECK (employee_id = auth.uid() AND tenant_id = get_my_tenant_id());

-- Employees can update their own (e.g. clock-out)
CREATE POLICY "attendance_self_update" ON attendance_records
  FOR UPDATE USING (employee_id = auth.uid() AND tenant_id = get_my_tenant_id());

-- Managers: their team's records
CREATE POLICY "attendance_manager_read" ON attendance_records
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['MANAGER']::user_role[])
    AND employee_id IN (
      SELECT id FROM employees WHERE manager_id = auth.uid() AND tenant_id = get_my_tenant_id()
    )
  );

-- HR/ADMIN: all records in their tenant
CREATE POLICY "attendance_hr_read" ON attendance_records
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

CREATE POLICY "attendance_hr_write" ON attendance_records
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- ============================================================
-- ATTENDANCE CORRECTIONS
-- ============================================================

CREATE POLICY "corrections_self_read" ON attendance_corrections
  FOR SELECT USING (employee_id = auth.uid() AND tenant_id = get_my_tenant_id());

CREATE POLICY "corrections_self_insert" ON attendance_corrections
  FOR INSERT WITH CHECK (employee_id = auth.uid() AND tenant_id = get_my_tenant_id());

CREATE POLICY "corrections_manager_read" ON attendance_corrections
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND (
      reviewed_by = auth.uid()
      OR (
        has_role(ARRAY['MANAGER']::user_role[])
        AND employee_id IN (
          SELECT id FROM employees WHERE manager_id = auth.uid() AND tenant_id = get_my_tenant_id()
        )
      )
    )
  );

CREATE POLICY "corrections_manager_update" ON attendance_corrections
  FOR UPDATE USING (
    tenant_id = get_my_tenant_id()
    AND (
      reviewed_by = auth.uid()
      OR has_role(ARRAY['HR', 'ADMIN']::user_role[])
    )
  );

CREATE POLICY "corrections_hr_all" ON attendance_corrections
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- ============================================================
-- BREAKS
-- ============================================================

CREATE POLICY "breaks_self" ON breaks
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND attendance_id IN (
      SELECT id FROM attendance_records WHERE employee_id = auth.uid()
    )
  );

CREATE POLICY "breaks_hr_read" ON breaks
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'MANAGER', 'SUPERADMIN']::user_role[])
  );

-- ============================================================
-- LEAVE TYPES
-- ============================================================

CREATE POLICY "leave_types_tenant_read" ON leave_types
  FOR SELECT USING (tenant_id = get_my_tenant_id());

CREATE POLICY "leave_types_hr_write" ON leave_types
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- ============================================================
-- LEAVE BALANCES
-- ============================================================

CREATE POLICY "leave_balances_self" ON leave_balances
  FOR SELECT USING (employee_id = auth.uid() AND tenant_id = get_my_tenant_id());

CREATE POLICY "leave_balances_manager" ON leave_balances
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['MANAGER']::user_role[])
    AND employee_id IN (
      SELECT id FROM employees WHERE manager_id = auth.uid() AND tenant_id = get_my_tenant_id()
    )
  );

CREATE POLICY "leave_balances_hr" ON leave_balances
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- ============================================================
-- LEAVE APPLICATIONS
-- ============================================================

CREATE POLICY "leaves_self_read" ON leaves
  FOR SELECT USING (employee_id = auth.uid() AND tenant_id = get_my_tenant_id());

CREATE POLICY "leaves_self_insert" ON leaves
  FOR INSERT WITH CHECK (employee_id = auth.uid() AND tenant_id = get_my_tenant_id());

CREATE POLICY "leaves_self_cancel" ON leaves
  FOR UPDATE USING (
    employee_id = auth.uid()
    AND tenant_id = get_my_tenant_id()
    AND status = 'PENDING'           -- Can only cancel pending requests
  );

CREATE POLICY "leaves_manager_read" ON leaves
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['MANAGER']::user_role[])
    AND employee_id IN (
      SELECT id FROM employees WHERE manager_id = auth.uid() AND tenant_id = get_my_tenant_id()
    )
  );

CREATE POLICY "leaves_manager_approve" ON leaves
  FOR UPDATE USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['MANAGER']::user_role[])
    AND employee_id IN (
      SELECT id FROM employees WHERE manager_id = auth.uid() AND tenant_id = get_my_tenant_id()
    )
  );

CREATE POLICY "leaves_hr_all" ON leaves
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- ============================================================
-- HOLIDAYS
-- ============================================================

CREATE POLICY "holidays_tenant_read" ON holidays
  FOR SELECT USING (tenant_id = get_my_tenant_id());

CREATE POLICY "holidays_hr_write" ON holidays
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- ============================================================
-- PERFORMANCE CYCLES, GOALS, REVIEWS
-- ============================================================

CREATE POLICY "perf_cycles_tenant_read" ON performance_cycles
  FOR SELECT USING (tenant_id = get_my_tenant_id());

CREATE POLICY "perf_cycles_hr_write" ON performance_cycles
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

CREATE POLICY "goals_self_read" ON goals
  FOR SELECT USING (employee_id = auth.uid() AND tenant_id = get_my_tenant_id());

CREATE POLICY "goals_manager_team" ON goals
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND (
      assigned_by = auth.uid()
      OR (
        has_role(ARRAY['MANAGER']::user_role[])
        AND employee_id IN (
          SELECT id FROM employees WHERE manager_id = auth.uid() AND tenant_id = get_my_tenant_id()
        )
      )
    )
  );

CREATE POLICY "goals_hr_all" ON goals
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

CREATE POLICY "self_reviews_self" ON self_reviews
  FOR ALL USING (employee_id = auth.uid() AND tenant_id = get_my_tenant_id());

CREATE POLICY "self_reviews_manager" ON self_reviews
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND (
      has_role(ARRAY['MANAGER']::user_role[])
      AND employee_id IN (
        SELECT id FROM employees WHERE manager_id = auth.uid() AND tenant_id = get_my_tenant_id()
      )
    )
  );

CREATE POLICY "self_reviews_hr" ON self_reviews
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

CREATE POLICY "manager_reviews_reviewer" ON manager_reviews
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND reviewer_id = auth.uid()
  );

CREATE POLICY "manager_reviews_employee_read" ON manager_reviews
  FOR SELECT USING (
    employee_id = auth.uid()
    AND tenant_id = get_my_tenant_id()
    AND shared_with_employee = TRUE
  );

CREATE POLICY "manager_reviews_hr" ON manager_reviews
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- ============================================================
-- RECOGNITION
-- ============================================================

CREATE POLICY "recognition_categories_read" ON recognition_categories
  FOR SELECT USING (tenant_id = get_my_tenant_id() AND is_active = TRUE);

CREATE POLICY "recognition_categories_hr_write" ON recognition_categories
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- Everyone in tenant can read public recognition events
CREATE POLICY "recognition_events_tenant_read" ON recognition_events
  FOR SELECT USING (tenant_id = get_my_tenant_id() AND is_public = TRUE);

-- Anyone can give recognition to someone in their tenant
CREATE POLICY "recognition_events_insert" ON recognition_events
  FOR INSERT WITH CHECK (giver_id = auth.uid() AND tenant_id = get_my_tenant_id());

CREATE POLICY "recognition_badges_self" ON recognition_badges
  FOR SELECT USING (employee_id = auth.uid() AND tenant_id = get_my_tenant_id());

CREATE POLICY "recognition_badges_hr_write" ON recognition_badges
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

-- Users see only their own notifications
CREATE POLICY "notifications_self" ON notifications
  FOR ALL USING (user_id = auth.uid() AND tenant_id = get_my_tenant_id());

-- HR/ADMIN can insert notifications for any user in their tenant (for system notifications)
CREATE POLICY "notifications_hr_insert" ON notifications
  FOR INSERT WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

CREATE POLICY "push_tokens_self" ON push_tokens
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "notification_prefs_self" ON notification_preferences
  FOR ALL USING (user_id = auth.uid() AND tenant_id = get_my_tenant_id());

-- ============================================================
-- CASES
-- ============================================================

-- Employees can read/create their own cases
CREATE POLICY "cases_self_read" ON cases
  FOR SELECT USING (reporter_id = auth.uid() AND tenant_id = get_my_tenant_id());

CREATE POLICY "cases_self_insert" ON cases
  FOR INSERT WITH CHECK (reporter_id = auth.uid() AND tenant_id = get_my_tenant_id());

-- HR/ADMIN manage all cases in their tenant
CREATE POLICY "cases_hr_all" ON cases
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- Assignees can update their assigned cases
CREATE POLICY "cases_assignee_update" ON cases
  FOR UPDATE USING (assignee_id = auth.uid() AND tenant_id = get_my_tenant_id());

CREATE POLICY "case_messages_tenant" ON case_messages
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND (
      -- Reporter sees non-internal messages on their cases
      (
        is_internal = FALSE
        AND case_id IN (SELECT id FROM cases WHERE reporter_id = auth.uid())
      )
      -- HR sees all
      OR has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
    )
  );

CREATE POLICY "case_messages_insert" ON case_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND tenant_id = get_my_tenant_id()
    AND (
      -- Non-HR can only send non-internal messages
      is_internal = FALSE
      OR has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
    )
  );

CREATE POLICY "case_attachments_case_read" ON case_attachments
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND (
      case_id IN (SELECT id FROM cases WHERE reporter_id = auth.uid())
      OR has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
    )
  );

CREATE POLICY "case_attachments_insert" ON case_attachments
  FOR INSERT WITH CHECK (
    uploaded_by = auth.uid()
    AND tenant_id = get_my_tenant_id()
  );

-- ============================================================
-- ANNOUNCEMENTS
-- ============================================================

-- Users see active announcements targeted at their role, in their tenant
CREATE POLICY "announcements_read" ON announcements
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND is_active = TRUE
    AND get_my_role() = ANY(target_roles)
    AND starts_at <= NOW()
    AND (ends_at IS NULL OR ends_at > NOW())
  );

CREATE POLICY "announcements_hr_all" ON announcements
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

CREATE POLICY "announcement_dismissals_self" ON announcement_dismissals
  FOR ALL USING (user_id = auth.uid());

-- ============================================================
-- AI / SKILL EMBEDDINGS
-- ============================================================

-- Employees see their own embeddings
CREATE POLICY "skill_embeddings_self" ON skill_embeddings
  FOR SELECT USING (employee_id = auth.uid() AND tenant_id = get_my_tenant_id());

-- HR can read all embeddings in their tenant (for skill-gap analysis)
CREATE POLICY "skill_embeddings_hr_read" ON skill_embeddings
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- Only Edge Functions (service role) can write embeddings
CREATE POLICY "skill_embeddings_service_write" ON skill_embeddings
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- ATTRITION RISK (HR only, advisory)
-- ============================================================

CREATE POLICY "attrition_hr_read" ON attrition_risk_scores
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

CREATE POLICY "attrition_service_write" ON attrition_risk_scores
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- AUDIT LOG (ADMIN/HR read, service role write)
-- ============================================================

CREATE POLICY "audit_log_admin_read" ON audit_log
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['ADMIN', 'SUPERADMIN']::user_role[])
  );

CREATE POLICY "audit_log_service_write" ON audit_log
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- SESSIONS
-- ============================================================

CREATE POLICY "sessions_self" ON active_sessions
  FOR ALL USING (user_id = auth.uid() AND tenant_id = get_my_tenant_id());

-- ============================================================
-- ONBOARDING
-- ============================================================

CREATE POLICY "onboarding_self" ON onboarding_state
  FOR ALL USING (user_id = auth.uid() AND tenant_id = get_my_tenant_id());

-- ============================================================
-- OFFLINE SYNC LOG
-- ============================================================

CREATE POLICY "offline_log_self" ON offline_sync_log
  FOR ALL USING (user_id = auth.uid() AND tenant_id = get_my_tenant_id());

CREATE POLICY "offline_log_service" ON offline_sync_log
  FOR ALL USING (auth.role() = 'service_role');
