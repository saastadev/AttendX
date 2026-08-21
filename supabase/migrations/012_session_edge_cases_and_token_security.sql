-- ============================================================
-- AttendX Migration: 012_session_edge_cases_and_token_security.sql
-- Scope A (Part 5) & Scope E.27: Session Edge Cases & Token Security
-- ============================================================

-- 1. Password Resets Table (Cryptographic Single-Use Tokens)
CREATE TABLE IF NOT EXISTS public.password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_hash_active 
  ON public.password_resets(token_hash) 
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_password_resets_user 
  ON public.password_resets(user_id);

ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_resets FORCE ROW LEVEL SECURITY;

-- 2. Auth Rate Limits Table (Sliding Window Counter)
CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash TEXT NOT NULL UNIQUE, -- SHA-256(ip + ':' + action + ':' + identifier)
  attempt_count INT NOT NULL DEFAULT 1,
  first_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  blocked_until TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_key 
  ON public.auth_rate_limits(key_hash);

ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_rate_limits FORCE ROW LEVEL SECURITY;

-- 3. Comprehensive Session Validation Stored Procedure
CREATE OR REPLACE FUNCTION public.validate_session_and_role_atomic(
  p_user_id UUID,
  p_tenant_id UUID,
  p_session_token_hash TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_is_active BOOLEAN;
  v_onboarding_completed BOOLEAN;
  v_role TEXT;
  v_session_revoked BOOLEAN;
BEGIN
  -- A. Check Profile Active State & Onboarding
  SELECT is_active, onboarding_completed INTO v_is_active, v_onboarding_completed
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_is_active IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'code', 'USER_NOT_FOUND');
  END IF;

  IF v_is_active = false THEN
    RETURN jsonb_build_object('valid', false, 'code', 'ACCOUNT_DEACTIVATED');
  END IF;

  -- B. Check Active Session Revocation Status
  SELECT is_revoked INTO v_session_revoked
  FROM public.active_sessions
  WHERE session_token_hash = p_session_token_hash;

  IF v_session_revoked IS TRUE THEN
    RETURN jsonb_build_object('valid', false, 'code', 'SESSION_REVOKED');
  END IF;

  -- C. Check Tenant Role Membership
  SELECT role INTO v_role
  FROM public.user_roles
  WHERE user_id = p_user_id AND tenant_id = p_tenant_id;

  IF v_role IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'code', 'TENANT_MEMBERSHIP_REVOKED');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'role', v_role,
    'tenant_id', p_tenant_id,
    'onboarding_completed', v_onboarding_completed
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 4. Triggers for Authorization Changes
CREATE OR REPLACE FUNCTION public.trg_handle_user_authorization_change()
RETURNS TRIGGER AS $$
BEGIN
  -- If user was deactivated, immediately revoke all active sessions
  IF (TG_TABLE_NAME = 'profiles' AND OLD.is_active = true AND NEW.is_active = false) THEN
    UPDATE public.active_sessions 
    SET is_revoked = true, revoked_at = now() 
    WHERE user_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_profiles_deactivation_change ON public.profiles;
CREATE TRIGGER trg_profiles_deactivation_change
  AFTER UPDATE OF is_active ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_handle_user_authorization_change();
