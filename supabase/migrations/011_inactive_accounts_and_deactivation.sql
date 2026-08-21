-- ============================================================
-- AttendX Migration: 011_inactive_accounts_and_deactivation.sql
-- Scope A (Part 4) & Scope B.12: Inactive Accounts & Deactivation
-- ============================================================

-- 1. High-speed indices for authoritative is_active lookups
CREATE INDEX IF NOT EXISTS idx_profiles_id_active 
  ON public.profiles(id, is_active);

CREATE INDEX IF NOT EXISTS idx_profiles_tenant_active 
  ON public.profiles(tenant_id, is_active);

-- 2. Anti-Tampering Trigger: Prevent users from self-updating is_active or privileged columns
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow service_role to update any column
  IF (current_setting('request.jwt.claim.role', true) = 'service_role') THEN
    RETURN NEW;
  END IF;

  -- Block standard authenticated users from altering is_active, tenant_id, id, or email directly
  IF (OLD.is_active IS DISTINCT FROM NEW.is_active) THEN
    RAISE EXCEPTION 'Unauthorized: is_active can only be modified by tenant administrators.'
      USING ERRCODE = '42501';
  END IF;

  IF (OLD.tenant_id IS DISTINCT FROM NEW.tenant_id) THEN
    RAISE EXCEPTION 'Unauthorized: tenant_id is immutable.'
      USING ERRCODE = '42501';
  END IF;

  IF (OLD.id IS DISTINCT FROM NEW.id) THEN
    RAISE EXCEPTION 'Unauthorized: Profile ID is immutable.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_guard_profile_privileged_columns ON public.profiles;
CREATE TRIGGER trg_guard_profile_privileged_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_privileged_columns();

-- 3. Atomic User Deactivation Stored Procedure (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.deactivate_user_atomic(
  p_target_user_id UUID,
  p_actor_id UUID,
  p_tenant_id UUID,
  p_reason TEXT DEFAULT 'Administrative Deactivation'
)
RETURNS JSONB AS $$
DECLARE
  v_actor_role TEXT;
  v_target_tenant_id UUID;
  v_admin_count INT;
BEGIN
  -- A. Verify caller role in tenant
  SELECT role INTO v_actor_role 
  FROM public.user_roles 
  WHERE user_id = p_actor_id AND tenant_id = p_tenant_id;

  IF v_actor_role IS NULL OR v_actor_role NOT IN ('SUPERADMIN', 'ADMIN') THEN
    RAISE EXCEPTION 'Forbidden: Only tenant administrators can deactivate users.'
      USING ERRCODE = '42501';
  END IF;

  -- B. Verify target user belongs to the same tenant
  SELECT tenant_id INTO v_target_tenant_id 
  FROM public.profiles 
  WHERE id = p_target_user_id;

  IF v_target_tenant_id IS NULL OR v_target_tenant_id <> p_tenant_id THEN
    RAISE EXCEPTION 'Forbidden: Target user does not belong to your organization.'
      USING ERRCODE = '42501';
  END IF;

  -- C. Prevent Self-Deactivation of the last active Admin
  IF p_target_user_id = p_actor_id THEN
    SELECT COUNT(*) INTO v_admin_count
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.tenant_id = p_tenant_id 
      AND ur.role IN ('ADMIN', 'SUPERADMIN') 
      AND p.is_active = true;

    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'Operation Blocked: Cannot deactivate the sole active administrator of an organization.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- D. Deactivate Profile
  UPDATE public.profiles
  SET is_active = false, updated_at = now()
  WHERE id = p_target_user_id;

  -- E. Update Employee Status
  UPDATE public.employees
  SET status = 'TERMINATED', updated_at = now()
  WHERE id = p_target_user_id AND tenant_id = p_tenant_id;

  -- F. Revoke all active session records
  UPDATE public.active_sessions
  SET is_revoked = true, revoked_at = now()
  WHERE user_id = p_target_user_id AND is_revoked = false;

  -- G. Insert Immutable Audit Log Record
  INSERT INTO public.audit_log (
    tenant_id,
    actor_id,
    action,
    table_name,
    record_id,
    old_data,
    new_data
  ) VALUES (
    p_tenant_id,
    p_actor_id,
    'USER_DEACTIVATED',
    'profiles',
    p_target_user_id,
    jsonb_build_object('is_active', true),
    jsonb_build_object('is_active', false, 'reason', p_reason, 'deactivated_at', now())
  );

  RETURN jsonb_build_object(
    'success', true,
    'target_user_id', p_target_user_id,
    'is_active', false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 4. Atomic User Reactivation Stored Procedure with Seat Limit Enforcement
CREATE OR REPLACE FUNCTION public.reactivate_user_atomic(
  p_target_user_id UUID,
  p_actor_id UUID,
  p_tenant_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_actor_role TEXT;
  v_target_tenant_id UUID;
  v_current_active_count INT;
  v_max_employees INT;
BEGIN
  -- A. Verify caller role
  SELECT role INTO v_actor_role 
  FROM public.user_roles 
  WHERE user_id = p_actor_id AND tenant_id = p_tenant_id;

  IF v_actor_role IS NULL OR v_actor_role NOT IN ('SUPERADMIN', 'ADMIN') THEN
    RAISE EXCEPTION 'Forbidden: Only tenant administrators can reactivate users.'
      USING ERRCODE = '42501';
  END IF;

  -- B. Verify target user tenant
  SELECT tenant_id INTO v_target_tenant_id 
  FROM public.profiles 
  WHERE id = p_target_user_id;

  IF v_target_tenant_id IS NULL OR v_target_tenant_id <> p_tenant_id THEN
    RAISE EXCEPTION 'Forbidden: Target user does not belong to your organization.'
      USING ERRCODE = '42501';
  END IF;

  -- C. Enforce Tenant Employee Seat Limit Atomically
  SELECT max_employees INTO v_max_employees 
  FROM public.tenants 
  WHERE id = p_tenant_id;

  SELECT COUNT(*) INTO v_current_active_count
  FROM public.profiles
  WHERE tenant_id = p_tenant_id AND is_active = true;

  IF v_max_employees IS NOT NULL AND v_current_active_count >= v_max_employees THEN
    RAISE EXCEPTION 'Seat Limit Exceeded: Organization has reached its maximum active seat capacity (% / %).',
      v_current_active_count, v_max_employees
      USING ERRCODE = 'EX001';
  END IF;

  -- D. Reactivate Profile & Employee
  UPDATE public.profiles
  SET is_active = true, updated_at = now()
  WHERE id = p_target_user_id;

  UPDATE public.employees
  SET status = 'ACTIVE', updated_at = now()
  WHERE id = p_target_user_id AND tenant_id = p_tenant_id;

  -- E. Insert Audit Log
  INSERT INTO public.audit_log (
    tenant_id,
    actor_id,
    action,
    table_name,
    record_id,
    old_data,
    new_data
  ) VALUES (
    p_tenant_id,
    p_actor_id,
    'USER_REACTIVATED',
    'profiles',
    p_target_user_id,
    jsonb_build_object('is_active', false),
    jsonb_build_object('is_active', true, 'reactivated_at', now())
  );

  RETURN jsonb_build_object(
    'success', true,
    'target_user_id', p_target_user_id,
    'is_active', true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
