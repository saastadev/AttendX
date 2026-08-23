// ============================================================
// AttendX v2 — Canonical Server-Side AI Auth Helper
// Spec: docs/specs/29_31_ai_data_engine_handoff_spec.md (BRD §29)
// ============================================================

import type { NextRequest } from 'next/server'
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server'
import { AIAuthError, type AIAuthContext } from '@/types/ai'
import type { UserRole } from '@/types/auth'

export { AIAuthError }

/**
 * Resolves the canonical, unforgeable security context required for AI tool executions and RAG queries.
 * MUST be invoked at the start of any AI route or LLM agent tool call.
 */
export async function getAuthoritativeAIContext(req: NextRequest): Promise<AIAuthContext> {
  const correlationId = req.headers.get('x-correlation-id') || crypto.randomUUID()

  // 1. Authenticate Session via SSR Cookies or Authorization Header
  const supabase = await getSupabaseServerClient()
  let { data: { user }, error: authErr } = await supabase.auth.getUser()

  if (!user || authErr) {
    const authHeader = req.headers.get('Authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      const serviceClient = getSupabaseServiceClient()
      const { data: userData } = await serviceClient.auth.getUser(token)
      if (userData?.user) {
        user = userData.user
        authErr = null
      }
    }
  }

  if (!user || authErr) {
    throw new AIAuthError('Unauthorized: No active authenticated session', 401, 'UNAUTHENTICATED')
  }

  const serviceClient = getSupabaseServiceClient()

  // 2. Authoritative Database Membership & Profile Lookup
  const { data: profile, error: profileErr } = await serviceClient
    .from('profiles')
    .select('is_active, onboarding_completed, tenant_id, tenants(name, timezone)')
    .eq('id', user.id)
    .single()

  if (profileErr || !profile || !profile.is_active) {
    throw new AIAuthError(
      'Forbidden: User account is inactive or profile missing',
      403,
      'ACCOUNT_DEACTIVATED'
    )
  }

  // 3. Resolve Primary Role in Verified Tenant
  const { data: roleRow, error: roleErr } = await serviceClient
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('tenant_id', profile.tenant_id)
    .single()

  if (roleErr || !roleRow) {
    throw new AIAuthError(
      'Forbidden: No active role found for this organization',
      403,
      'NO_TENANT_ROLE'
    )
  }

  const tenantRecord = (profile as any).tenants

  return {
    userId: user.id,
    tenantId: profile.tenant_id,
    tenantName: tenantRecord?.name || 'Organization',
    role: roleRow.role as UserRole,
    isActive: profile.is_active,
    onboardingCompleted: profile.onboarding_completed,
    timezone: tenantRecord?.timezone || 'UTC',
    correlationId,
  }
}
