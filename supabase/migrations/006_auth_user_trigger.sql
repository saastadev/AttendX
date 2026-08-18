-- ============================================================
-- AttendX v2 — Migration 006: Auto-Create Profile & User Role
-- Triggers on auth.users INSERT to create public.profiles & user_roles
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID;
  v_full_name TEXT;
BEGIN
  -- Extract tenant_id and full_name from raw_user_meta_data
  BEGIN
    v_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_tenant_id := NULL;
  END;

  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );

  -- Fallback to default Acme tenant if not provided
  IF v_tenant_id IS NULL THEN
    SELECT id INTO v_tenant_id FROM tenants LIMIT 1;
  END IF;

  -- 1. Insert Profile
  INSERT INTO public.profiles (
    id,
    tenant_id,
    email,
    full_name,
    is_active,
    onboarding_completed
  ) VALUES (
    NEW.id,
    v_tenant_id,
    NEW.email,
    v_full_name,
    TRUE,
    TRUE
  ) ON CONFLICT (id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name;

  -- 2. Insert User Role (Default: EMPLOYEE)
  IF v_tenant_id IS NOT NULL THEN
    INSERT INTO public.user_roles (
      user_id,
      tenant_id,
      role
    ) VALUES (
      NEW.id,
      v_tenant_id,
      'EMPLOYEE'
    ) ON CONFLICT (user_id, tenant_id) DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user error: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Trigger on auth.users AFTER INSERT
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
