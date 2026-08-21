-- ============================================================
-- AttendX v2 — Migration 006: Auto-Create Profile & User Role
-- Safe trigger that never fails or blocks auth.users operations
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
  BEGIN
    v_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_tenant_id := NULL;
  END;

  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );

  IF v_tenant_id IS NULL THEN
    SELECT id INTO v_tenant_id FROM tenants LIMIT 1;
  END IF;

  IF v_tenant_id IS NOT NULL THEN
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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
