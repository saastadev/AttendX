-- ============================================================
-- AttendX Migration: 009_first_login_password_change.sql
-- Scope A (Part 2): First-Login Password Change & Anti-Tampering
-- ============================================================

-- 1. Ensure column onboarding_completed exists on profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false;

-- 2. Anti-tampering trigger: Prevent client-side updates to onboarding_completed
CREATE OR REPLACE FUNCTION public.check_profile_onboarding_tampering()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent client role from directly updating onboarding_completed from false to true
  IF (OLD.onboarding_completed IS FALSE AND NEW.onboarding_completed IS TRUE) THEN
    IF (current_setting('request.jwt.claim.role', true) != 'service_role' 
        AND auth.uid() IS NOT NULL) THEN
      RAISE EXCEPTION 'onboarding_completed cannot be modified directly by client SDK.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_guard_profile_onboarding ON public.profiles;
CREATE TRIGGER trg_guard_profile_onboarding
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.check_profile_onboarding_tampering();

-- 3. Audit log trigger extension for password changes during onboarding
COMMENT ON COLUMN public.profiles.onboarding_completed IS 
  'Flag indicating whether the user has completed forced first-login password change.';
