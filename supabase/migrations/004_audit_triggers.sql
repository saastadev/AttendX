-- ============================================================
-- AttendX v2 — Migration 004: Audit Triggers & Hardening
-- Automatically writes changes on privileged tables to audit_log
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_audit_log_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID;
  v_tenant_id UUID;
  v_action TEXT;
  v_record_id UUID;
  v_old_data JSONB := NULL;
  v_new_data JSONB := NULL;
BEGIN
  -- Determine current actor
  v_actor_id := auth.uid();
  
  -- Determine action type
  v_action := TG_TABLE_NAME || '_' || TG_OP;

  IF (TG_OP = 'DELETE') THEN
    v_old_data := to_jsonb(OLD);
    v_record_id := OLD.id;
    IF (v_old_data ? 'tenant_id') THEN
      v_tenant_id := (v_old_data->>'tenant_id')::uuid;
    END IF;
  ELSIF (TG_OP = 'UPDATE') THEN
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
    v_record_id := NEW.id;
    IF (v_new_data ? 'tenant_id') THEN
      v_tenant_id := (v_new_data->>'tenant_id')::uuid;
    ELSIF (v_old_data ? 'tenant_id') THEN
      v_tenant_id := (v_old_data->>'tenant_id')::uuid;
    END IF;
  ELSIF (TG_OP = 'INSERT') THEN
    v_new_data := to_jsonb(NEW);
    v_record_id := NEW.id;
    IF (v_new_data ? 'tenant_id') THEN
      v_tenant_id := (v_new_data->>'tenant_id')::uuid;
    END IF;
  END IF;

  -- Fallback to session tenant if not in record
  IF v_tenant_id IS NULL THEN
    v_tenant_id := public.get_my_tenant_id();
  END IF;

  INSERT INTO public.audit_log (
    tenant_id,
    actor_id,
    action,
    table_name,
    record_id,
    old_data,
    new_data
  ) VALUES (
    v_tenant_id,
    v_actor_id,
    v_action,
    TG_TABLE_NAME,
    v_record_id,
    v_old_data,
    v_new_data
  );

  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Fail-open for non-critical logging errors to avoid blocking business operations, but log exception
  RAISE WARNING 'audit_log trigger error: %', SQLERRM;
  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Attach triggers to privileged tables
DROP TRIGGER IF EXISTS trg_audit_user_roles ON user_roles;
CREATE TRIGGER trg_audit_user_roles
  AFTER INSERT OR UPDATE OR DELETE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

DROP TRIGGER IF EXISTS trg_audit_profiles ON profiles;
CREATE TRIGGER trg_audit_profiles
  AFTER INSERT OR UPDATE OR DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

DROP TRIGGER IF EXISTS trg_audit_tenants ON tenants;
CREATE TRIGGER trg_audit_tenants
  AFTER INSERT OR UPDATE OR DELETE ON tenants
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

DROP TRIGGER IF EXISTS trg_audit_leaves ON leaves;
CREATE TRIGGER trg_audit_leaves
  AFTER INSERT OR UPDATE OR DELETE ON leaves
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

DROP TRIGGER IF EXISTS trg_audit_corrections ON attendance_corrections;
CREATE TRIGGER trg_audit_corrections
  AFTER INSERT OR UPDATE OR DELETE ON attendance_corrections
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

DROP TRIGGER IF EXISTS trg_audit_employees ON employees;
CREATE TRIGGER trg_audit_employees
  AFTER INSERT OR UPDATE OR DELETE ON employees
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();
