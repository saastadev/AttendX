// ============================================================
// AttendX v2 — Authoritative Server-Side Identity Resolver
// Resolves caller identity and permissions strictly from live database rows
// Never trusts client-supplied headers, query params, or body claims
// ============================================================

import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server'

export interface AuthoritativeCaller {
  userId: string
  tenantId: string
  role: string
  email: string
}

export class ServerIdentity {
  /**
   * Resolves the authenticated caller and verifies provisioning permission
   */
  static async getAuthoritativeCaller(
    allowedRoles: string[] = ['SUPERADMIN', 'ADMIN', 'HR'],
    request?: Request
  ): Promise<AuthoritativeCaller> {
    let user: any = null
    const serviceClient = getSupabaseServiceClient()

    // 1. Try Bearer token from Request Authorization header
    if (request) {
      const authHeader = request.headers.get('authorization')
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim()
        if (token) {
          const { data, error } = await serviceClient.auth.getUser(token)
          if (data?.user && !error) {
            user = data.user
          }
        }
      }
    }

    // 2. Fall back to Next.js cookie session
    if (!user) {
      const supabase = await getSupabaseServerClient()
      const { data, error } = await supabase.auth.getUser()
      if (data?.user && !error) {
        user = data.user
      }
    }

    if (!user) {
      const err = new Error('Unauthorized') as any
      err.status = 401
      throw err
    }

    // 1. Authoritatively query user_roles
    const { data: roleRows, error: roleErr } = await serviceClient
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)

    if (roleErr || !roleRows || roleRows.length === 0) {
      const err = new Error('Forbidden: No active organization membership found.') as any
      err.status = 403
      throw err
    }

    const activeTenantClaim = (user.app_metadata as Record<string, unknown> | undefined)?.tenant_id as string | undefined
    const tenantRoles = (roleRows || []).filter(r => activeTenantClaim ? r.tenant_id === activeTenantClaim : true)
    const matchedRoleRow = tenantRoles.find(r => allowedRoles.includes(r.role)) || tenantRoles[0] || roleRows[0]

    const callerRole = matchedRoleRow.role
    const activeTenantId = matchedRoleRow.tenant_id

    // 2. Enforce permission boundary
    if (!allowedRoles.includes(callerRole)) {
      const err = new Error(`Forbidden: Role '${callerRole}' cannot execute this administrative action.`) as any
      err.status = 403
      throw err
    }

    return {
      userId: user.id,
      tenantId: activeTenantId,
      role: callerRole,
      email: user.email || '',
    }
  }
}
