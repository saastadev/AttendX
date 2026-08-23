// ============================================================
// AttendX v2 — Server-Side Authorization & Session Validator
// Guarantees authoritative database verification
// ============================================================

import { getSupabaseServiceClient } from '@/lib/supabase/server'

export interface AuthorizationResult {
  valid: boolean
  code?: string
  error?: string
  role?: string
  tenant_id?: string
}

export class SessionValidator {
  /**
   * Authoritatively asserts that the user is active in the database
   */
  static async assertActiveUser(userId: string): Promise<{ active: boolean; tenantId?: string }> {
    const serviceClient = getSupabaseServiceClient()
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('is_active, tenant_id')
      .eq('id', userId)
      .maybeSingle()

    if (!profile || profile.is_active === false) {
      return { active: false }
    }
    return { active: true, tenantId: profile.tenant_id }
  }

  /**
   * Authoritatively verifies that the user holds an allowed role in the given tenant
   */
  static async assertActiveRole(
    userId: string,
    tenantId: string,
    allowedRoles: string[]
  ): Promise<AuthorizationResult> {
    const serviceClient = getSupabaseServiceClient()

    // 1. Verify active profile
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('is_active')
      .eq('id', userId)
      .maybeSingle()

    if (!profile || profile.is_active === false) {
      return { valid: false, code: 'ACCOUNT_DEACTIVATED', error: 'Account is deactivated.' }
    }

    // 2. Verify live role in tenant
    const { data: roleRecords } = await serviceClient
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)

    const roles = (roleRecords || []).map((r: { role: string }) => r.role)
    const hasRole = roles.some((r: string) => allowedRoles.includes(r))

    if (!hasRole) {
      return {
        valid: false,
        code: 'ROLE_REVOKED',
        error: 'Forbidden: Insufficient privileges or role revoked.',
      }
    }

    return { valid: true, role: roles[0], tenant_id: tenantId }
  }
}
