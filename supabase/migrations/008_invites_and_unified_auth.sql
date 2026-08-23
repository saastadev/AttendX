-- ============================================================
-- AttendX v2 — Migration 008: Invites and Unified Authentication
-- Implements single-use cryptographic invite tokens & verification
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tenant_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('SUPERADMIN', 'ADMIN', 'HR', 'MANAGER', 'EMPLOYEE')),
  token_hash TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES public.profiles(id),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NULL,
  revoked_at TIMESTAMPTZ DEFAULT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices for rapid lookup and tenant isolation
CREATE INDEX IF NOT EXISTS idx_tenant_invites_hash 
  ON public.tenant_invites(token_hash) 
  WHERE used_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_invites_tenant 
  ON public.tenant_invites(tenant_id);

CREATE INDEX IF NOT EXISTS idx_tenant_invites_email 
  ON public.tenant_invites(tenant_id, email);

-- Enable & Force RLS
ALTER TABLE public.tenant_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_invites FORCE ROW LEVEL SECURITY;

-- RLS Policy: Only ADMIN, SUPERADMIN, and HR within the active tenant can view & manage invites
DROP POLICY IF EXISTS tenant_invites_admin_all ON public.tenant_invites;
CREATE POLICY tenant_invites_admin_all ON public.tenant_invites
  FOR ALL
  TO authenticated
  USING (
    tenant_id = public.get_my_tenant_id() 
    AND public.has_role(ARRAY['ADMIN', 'SUPERADMIN', 'HR']::user_role[])
  )
  WITH CHECK (
    tenant_id = public.get_my_tenant_id() 
    AND public.has_role(ARRAY['ADMIN', 'SUPERADMIN', 'HR']::user_role[])
  );

-- Attach audit log trigger
DROP TRIGGER IF EXISTS audit_tenant_invites ON public.tenant_invites;
CREATE TRIGGER audit_tenant_invites
  AFTER INSERT OR UPDATE OR DELETE ON public.tenant_invites
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

-- ------------------------------------------------------------
-- Atomic RPC: accept_tenant_invite
-- Validates token hash, marks invite used, provisions profile and role in one transaction
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_tenant_invite(
  p_token_hash TEXT,
  p_user_id UUID,
  p_full_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invite public.tenant_invites%ROWTYPE;
  v_tenant public.tenants%ROWTYPE;
BEGIN
  -- 1. Fetch and lock invite record
  SELECT * INTO v_invite
  FROM public.tenant_invites
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVITE_NOT_FOUND: Invalid or unrecognized invitation token' USING ERRCODE = 'P0002';
  END IF;

  IF v_invite.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'INVITE_ALREADY_USED: This invitation has already been accepted' USING ERRCODE = 'P0003';
  END IF;

  IF v_invite.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'INVITE_REVOKED: This invitation has been revoked by an administrator' USING ERRCODE = 'P0004';
  END IF;

  IF v_invite.expires_at <= now() THEN
    RAISE EXCEPTION 'INVITE_EXPIRED: This invitation has expired' USING ERRCODE = 'P0005';
  END IF;

  -- 2. Validate tenant exists
  SELECT * INTO v_tenant
  FROM public.tenants
  WHERE id = v_invite.tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_NOT_FOUND: Organization for this invite does not exist' USING ERRCODE = 'P0006';
  END IF;

  -- 3. Upsert profile
  INSERT INTO public.profiles (
    id,
    tenant_id,
    email,
    full_name,
    is_active,
    face_enrolled,
    onboarding_completed,
    created_at,
    updated_at
  ) VALUES (
    p_user_id,
    v_invite.tenant_id,
    v_invite.email,
    COALESCE(NULLIF(trim(p_full_name), ''), v_invite.metadata->>'full_name', 'Member'),
    true,
    false,
    true,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    is_active = true,
    onboarding_completed = true,
    updated_at = now();

  -- 4. Upsert user_role
  INSERT INTO public.user_roles (
    user_id,
    tenant_id,
    role,
    created_at
  ) VALUES (
    p_user_id,
    v_invite.tenant_id,
    v_invite.role::public.user_role,
    now()
  )
  ON CONFLICT (user_id, tenant_id, role) DO NOTHING;

  -- 5. Mark invite as used
  UPDATE public.tenant_invites
  SET used_at = now(),
      updated_at = now()
  WHERE id = v_invite.id;

  -- 6. Insert audit log record
  INSERT INTO public.audit_log (
    tenant_id,
    actor_id,
    action,
    table_name,
    record_id,
    new_data
  ) VALUES (
    v_invite.tenant_id,
    p_user_id,
    'INVITE_ACCEPTED',
    'tenant_invites',
    v_invite.id,
    jsonb_build_object(
      'email', v_invite.email,
      'role', v_invite.role,
      'user_id', p_user_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', v_invite.tenant_id,
    'tenant_name', v_tenant.name,
    'role', v_invite.role,
    'email', v_invite.email
  );
END;
$$;
