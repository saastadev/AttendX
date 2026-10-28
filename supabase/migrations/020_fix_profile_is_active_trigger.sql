-- ============================================================
-- AttendX Migration: 020_fix_profile_is_active_trigger.sql
-- Fix P0_REG_003: Admin User Deactivation Trigger Defect
-- ============================================================
-- Defect: Migration 011 trigger function guard_profile_privileged_columns()
-- only checked current_setting('request.jwt.claim.role', true) = 'service_role'.
-- Modern PostgREST / Supabase removes individual claim GUCs and passes JWT
-- claims via JSON string request.jwt.claims (or auth.role()), causing valid
-- service_role deactivation/reactivation updates to fail with 42501 Unauthorized.
--
-- Fix:
-- 1. Support service_role check via:
--    - Modern JSON claims: (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') = 'service_role'
--    - Helper function: coalesce(auth.role(), '') = 'service_role'
--    - Session/Current DB roles: session_user / current_user IN ('service_role', 'postgres', 'supabase_admin')
--    - Legacy GUC: current_setting('request.jwt.claim.role', true) = 'service_role'
-- 2. Allow tenant administrators (ADMIN, SUPERADMIN) to modify is_active for users in their tenant.
-- 3. Preserve anti-tampering: regular employees and cross-tenant users are blocked from altering is_active.
-- 4. Preserve strict immutability of profile.id and profile.tenant_id.
-- ============================================================

-- 1. Ensure employees status column exists (defensive migration hygiene)
ALTER TABLE public.employees 
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE';

-- 2. Redefine guard_profile_privileged_columns() with PostgREST 8+ and dual-boundary compatibility
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- A. Allow service_role and internal database maintenance roles to update any column
  IF (
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') = 'service_role'
    OR coalesce(auth.role(), '') = 'service_role'
    OR session_user IN ('service_role', 'postgres', 'supabase_admin')
    OR current_user IN ('service_role', 'postgres', 'supabase_admin')
  ) THEN
    RETURN NEW;
  END IF;

  -- B. Allow tenant administrators (ADMIN, SUPERADMIN) to modify is_active for users in their tenant
  IF (OLD.is_active IS DISTINCT FROM NEW.is_active) THEN
    IF NOT (
      has_role(ARRAY['ADMIN', 'SUPERADMIN']::user_role[])
      AND get_my_tenant_id() = OLD.tenant_id
    ) THEN
      RAISE EXCEPTION 'Unauthorized: is_active can only be modified by tenant administrators.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- C. Block Standard Authenticated Users from altering tenant_id (strictly immutable)
  IF (OLD.tenant_id IS DISTINCT FROM NEW.tenant_id) THEN
    RAISE EXCEPTION 'Unauthorized: tenant_id is immutable.'
      USING ERRCODE = '42501';
  END IF;

  -- D. Block Standard Authenticated Users from altering Profile ID (strictly immutable)
  IF (OLD.id IS DISTINCT FROM NEW.id) THEN
    RAISE EXCEPTION 'Unauthorized: Profile ID is immutable.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 3. Re-bind the BEFORE UPDATE trigger on public.profiles
DROP TRIGGER IF EXISTS trg_guard_profile_privileged_columns ON public.profiles;
CREATE TRIGGER trg_guard_profile_privileged_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_privileged_columns();
