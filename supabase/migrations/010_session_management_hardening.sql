-- ============================================================
-- AttendX Migration: 010_session_management_hardening.sql
-- Scope A (Part 3): Session Management, Device Tracking & Revocation
-- ============================================================

-- 1. Create or harden public.active_sessions
CREATE TABLE IF NOT EXISTS public.active_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  auth_session_id UUID, -- Corresponds to Supabase auth session if available
  session_token_hash TEXT,
  device_name TEXT NOT NULL DEFAULT 'Unknown Device',
  browser TEXT NOT NULL DEFAULT 'Unknown Browser',
  os TEXT NOT NULL DEFAULT 'Unknown OS',
  ip_address TEXT,
  city TEXT,
  country TEXT,
  user_agent TEXT NOT NULL DEFAULT '',
  is_revoked BOOLEAN NOT NULL DEFAULT false,
  revoked_at TIMESTAMPTZ DEFAULT NULL,
  last_active TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure all columns exist if table was already created
ALTER TABLE public.active_sessions ADD COLUMN IF NOT EXISTS auth_session_id UUID;
ALTER TABLE public.active_sessions ADD COLUMN IF NOT EXISTS session_token_hash TEXT;
ALTER TABLE public.active_sessions ADD COLUMN IF NOT EXISTS device_name TEXT NOT NULL DEFAULT 'Unknown Device';
ALTER TABLE public.active_sessions ADD COLUMN IF NOT EXISTS browser TEXT NOT NULL DEFAULT 'Unknown Browser';
ALTER TABLE public.active_sessions ADD COLUMN IF NOT EXISTS os TEXT NOT NULL DEFAULT 'Unknown OS';
ALTER TABLE public.active_sessions ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE public.active_sessions ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.active_sessions ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE public.active_sessions ADD COLUMN IF NOT EXISTS user_agent TEXT NOT NULL DEFAULT '';
ALTER TABLE public.active_sessions ADD COLUMN IF NOT EXISTS is_revoked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.active_sessions ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.active_sessions ADD COLUMN IF NOT EXISTS last_active TIMESTAMPTZ NOT NULL DEFAULT now();

-- 2. Indices for fast lookup and revocation queries
CREATE INDEX IF NOT EXISTS idx_active_sessions_user_lookup 
  ON public.active_sessions(user_id, is_revoked) 
  WHERE is_revoked IS FALSE;

CREATE INDEX IF NOT EXISTS idx_active_sessions_token_hash 
  ON public.active_sessions(session_token_hash);

CREATE INDEX IF NOT EXISTS idx_active_sessions_tenant 
  ON public.active_sessions(tenant_id);

-- 3. Enable & Force Row Level Security
ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_sessions FORCE ROW LEVEL SECURITY;

-- 4. RLS Policies
DROP POLICY IF EXISTS active_sessions_self_select ON public.active_sessions;
CREATE POLICY active_sessions_self_select ON public.active_sessions
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() 
    AND tenant_id = public.get_my_tenant_id()
  );

DROP POLICY IF EXISTS active_sessions_admin_select ON public.active_sessions;
CREATE POLICY active_sessions_admin_select ON public.active_sessions
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.get_my_tenant_id()
    AND public.has_role(ARRAY['ADMIN', 'SUPERADMIN']::user_role[])
  );

DROP POLICY IF EXISTS active_sessions_service_modify ON public.active_sessions;
CREATE POLICY active_sessions_service_modify ON public.active_sessions
  FOR ALL
  TO authenticated
  USING (current_setting('request.jwt.claim.role', true) = 'service_role')
  WITH CHECK (current_setting('request.jwt.claim.role', true) = 'service_role');
