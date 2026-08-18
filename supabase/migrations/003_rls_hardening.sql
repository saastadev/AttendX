-- ============================================================
-- AttendX v2 — RLS Hardening
-- Run after 002_rls_policies.sql
--
-- Fixes three verified defects:
--   1. get_my_tenant_id() used `LIMIT 1` with no ORDER BY. A user holding
--      memberships in two tenants resolved to whichever row the heap
--      returned first — reproducibly leaking the other tenant's roster
--      just by changing the order the memberships were granted in.
--   2. get_my_tenant_id/get_my_role/has_role are SECURITY DEFINER with a
--      mutable search_path, the standard definer-function hijack vector.
--   3. profiles_self_update had no WITH CHECK. Rewriting your own
--      profiles.tenant_id was blocked only as a side effect of the
--      SELECT policy — drop or broaden that policy and escalation opens.
-- ============================================================

-- ------------------------------------------------------------
-- 1 + 2. Deterministic, fail-closed tenant resolution.
--
-- Multi-tenant users MUST carry an explicit tenant claim. If the identity
-- is ambiguous and no claim narrows it, we return NULL: every policy is
-- `tenant_id = get_my_tenant_id()`, so NULL denies rather than guessing.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_claim  TEXT;
  v_tenant UUID;
  v_count  INT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  -- Explicit tenant selection: flattened GUC first, then the claims JSON
  -- (app_metadata.tenant_id is where a Supabase auth hook would put it).
  v_claim := NULLIF(current_setting('request.jwt.claim.tenant_id', true), '');

  IF v_claim IS NULL THEN
    BEGIN
      v_claim := NULLIF(
        current_setting('request.jwt.claims', true)::jsonb #>> '{app_metadata,tenant_id}',
        ''
      );
    EXCEPTION WHEN OTHERS THEN
      v_claim := NULL;
    END;
  END IF;

  IF v_claim IS NOT NULL THEN
    -- A claim is only honoured if it maps to a real membership, so a
    -- forged/stale claim cannot mint access to a tenant you never joined.
    BEGIN
      SELECT ur.tenant_id INTO v_tenant
        FROM user_roles ur
       WHERE ur.user_id = v_uid
         AND ur.tenant_id = v_claim::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN NULL;
    END;
    RETURN v_tenant;
  END IF;

  -- No claim: resolve only when the identity is unambiguous.
  SELECT count(*) INTO v_count FROM user_roles ur WHERE ur.user_id = v_uid;

  IF v_count = 1 THEN
    SELECT ur.tenant_id INTO v_tenant FROM user_roles ur WHERE ur.user_id = v_uid;
    RETURN v_tenant;
  END IF;

  -- 0 memberships, or 2+ with nothing to disambiguate: fail closed.
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT role
    FROM user_roles
   WHERE user_id = auth.uid()
     AND tenant_id = public.get_my_tenant_id()
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_role(allowed_roles user_role[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(public.get_my_role() = ANY(allowed_roles), FALSE);
$$;

-- ------------------------------------------------------------
-- 3. Pin identity and tenant on profile self-update.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_self_update" ON profiles;

CREATE POLICY "profiles_self_update" ON profiles
  FOR UPDATE
  USING (id = auth.uid() AND tenant_id = get_my_tenant_id())
  WITH CHECK (id = auth.uid() AND tenant_id = get_my_tenant_id());

-- ------------------------------------------------------------
-- 4. Freeze privileged profile columns against self-service edits.
--
-- RLS gates which ROWS you may write; it does not gate which COLUMNS.
-- Without this a user could self-reactivate (is_active), rewrite their
-- own email, or flip onboarding/face-enrolment state.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Privileged actors and server-side jobs bypass the freeze.
  IF auth.role() = 'service_role' OR has_role(ARRAY['HR','ADMIN','SUPERADMIN']::user_role[]) THEN
    RETURN NEW;
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'profiles.tenant_id is not self-editable';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'profiles.id is not self-editable';
  END IF;
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'profiles.is_active is not self-editable';
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'profiles.email is not self-editable (change it through auth)';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_guard_privileged ON profiles;
CREATE TRIGGER trg_profiles_guard_privileged
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileged_columns();

-- ------------------------------------------------------------
-- 5. Force RLS on tenant-scoped tables so the table owner is not exempt.
-- (service_role still bypasses via its BYPASSRLS attribute, by design.)
-- ------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
