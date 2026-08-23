-- ============================================================
-- AttendX Migration: 014_multi_tenant_switcher_rpc.sql
-- Scope C (Specs 13-14): Multi-Tenant Switcher & Membership Validation
-- ============================================================

-- 1. RPC to list all authorized, active tenants for the calling user
CREATE OR REPLACE FUNCTION public.get_my_available_tenants()
RETURNS TABLE (
  tenant_id UUID,
  tenant_name TEXT,
  tenant_slug TEXT,
  role user_role,
  is_current BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_current_tenant UUID := public.get_my_tenant_id();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    t.id AS tenant_id,
    t.name AS tenant_name,
    t.slug AS tenant_slug,
    ur.role AS role,
    (t.id = v_current_tenant) AS is_current
  FROM public.user_roles ur
  JOIN public.tenants t ON t.id = ur.tenant_id
  JOIN public.profiles p ON p.id = ur.user_id AND p.tenant_id = ur.tenant_id
  WHERE ur.user_id = v_uid
    AND p.is_active = TRUE
  ORDER BY t.name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_available_tenants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_available_tenants() TO authenticated;

-- 2. Verification RPC to atomically validate membership before switching
CREATE OR REPLACE FUNCTION public.validate_tenant_membership(
  p_user_id UUID,
  p_tenant_id UUID
)
RETURNS TABLE (
  is_valid BOOLEAN,
  resolved_role user_role,
  tenant_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    TRUE AS is_valid,
    ur.role AS resolved_role,
    t.name AS tenant_name
  FROM public.user_roles ur
  JOIN public.tenants t ON t.id = ur.tenant_id
  JOIN public.profiles p ON p.id = ur.user_id AND p.tenant_id = ur.tenant_id
  WHERE ur.user_id = p_user_id
    AND ur.tenant_id = p_tenant_id
    AND p.is_active = TRUE
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_tenant_membership(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_tenant_membership(UUID, UUID) TO service_role;
