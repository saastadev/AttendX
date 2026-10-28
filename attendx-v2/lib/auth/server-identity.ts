// ============================================================
// AttendX v2 — Authoritative Server-Side Identity Resolver
// Resolves caller identity and permissions strictly from live database rows
// Never trusts client-supplied headers, query params, or body claims
// ============================================================

import { allowDemoAuthentication, isDevMockSupabase } from '../supabase/config.ts'

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
    let isDemo = false
    let demoCaller: AuthoritativeCaller | null = null

    // 0. Check demo session cookie ONLY when explicitly allowed:
    // Strict requirement: BOTH process.env.NODE_ENV === 'development' AND isDevMockSupabase() must be true.
    // In staging, test, and production, forged demo cookies are strictly ignored.
    const allowDemo = allowDemoAuthentication()

    if (allowDemo) {
      let demoCookie: string | undefined
      if (request) {
        const cookieHeader = request.headers.get('cookie') || ''
        const match = cookieHeader.match(/attendx-demo-session=([^;]+)/)
        if (match) demoCookie = match[1]
      }
      if (!demoCookie) {
        try {
          const { cookies } = await import('next/headers')
          const cookieStore = await cookies()
          demoCookie = cookieStore.get('attendx-demo-session')?.value
        } catch {
          // Not in server component context or headers not available
        }
      }

      let demoPayload: any = null
      if (demoCookie) {
        try {
          const cleanCookie = decodeURIComponent(demoCookie.trim().replace(/^"|"$/g, ''))
          demoPayload = JSON.parse(Buffer.from(cleanCookie, 'base64').toString('utf-8'))
          if (demoPayload && demoPayload.id && demoPayload.role && demoPayload.tenant_id) {
            isDemo = true
            demoCaller = {
              userId: demoPayload.id,
              tenantId: demoPayload.tenant_id,
              role: demoPayload.role,
              email: demoPayload.email || `${demoPayload.role.toLowerCase()}@acme-tech.com`,
            }
          }
        } catch {
          // ignore malformed cookie - fails closed
        }
      }

      if (isDemo && demoCaller) {
        if (demoPayload && demoPayload.is_active === false) {
          const err = new Error('Forbidden: Account is deactivated.') as any
          err.status = 403
          err.code = 'ACCOUNT_DEACTIVATED'
          throw err
        }

        if (process.env.ATTENDX_USE_LOCAL_DB === 'true') {
          try {
            const { getSupabaseServiceClient } = await import('../supabase/server.ts')
            const sc = getSupabaseServiceClient()
            const { data: p } = await sc
              .from('profiles')
              .select('is_active')
              .eq('id', demoCaller.userId)
              .maybeSingle()
            if (p && p.is_active === false) {
              const err = new Error('Forbidden: Account is deactivated.') as any
              err.status = 403
              err.code = 'ACCOUNT_DEACTIVATED'
              throw err
            }
          } catch (e: any) {
            if (e?.status === 403) throw e
          }
        }

        if (!allowedRoles.includes(demoCaller.role)) {
          const err = new Error(`Forbidden: Role '${demoCaller.role}' cannot execute this administrative action.`) as any
          err.status = 403
          throw err
        }
        return demoCaller
      }
    }

    if (isDevMockSupabase()) {
      const err = new Error('Unauthenticated: No active session found.') as any
      err.status = 401
      throw err
    }

    const { getSupabaseServiceClient, getSupabaseServerClient } = await import('../supabase/server.ts')

    // 1. Try Bearer token from Request Authorization header
    if (request) {
      const authHeader = request.headers.get('authorization')
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim()
        if (token) {
          try {
            const serviceClient = getSupabaseServiceClient()
            const { data, error } = await serviceClient.auth.getUser(token)
            if (data?.user && !error) {
              user = data.user
            }
          } catch {
            // ignore network failure
          }
        }
      }
    }

    // 2. Fall back to Next.js cookie session
    if (!user) {
      try {
        const supabase = await getSupabaseServerClient()
        const { data, error } = await supabase.auth.getUser()
        if (data?.user && !error) {
          user = data.user
        }
      } catch {
        // ignore network failure
      }
    }

    if (!user) {
      const err = new Error('Unauthorized') as any
      err.status = 401
      throw err
    }

    const serviceClient = getSupabaseServiceClient()
    let activeTenantClaim = (user.app_metadata as Record<string, unknown> | undefined)?.tenant_id as string | undefined

    if (activeTenantClaim) {
      const { data: tenantRow } = await serviceClient
        .from('tenants')
        .select('id')
        .eq('id', activeTenantClaim)
        .maybeSingle()
      if (!tenantRow) {
        // The claimed tenant ID does not exist in the active database (e.g. stale/legacy claim from another environment).
        // Treat as unconstrained tenant claim so authoritative membership in active database can be resolved.
        activeTenantClaim = undefined
      }
    }

    // 1. Authoritatively query user_roles
    let { data: roleRows, error: roleErr } = await serviceClient
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)

    let canonicalUserId = user.id

    // Fallback: If no role row by user.id and user has an email, look up profile by email
    // to map authenticated session identity to canonical tenant profiles in the active database.
    // Strict security requirements:
    // 1. Caller identity originates from a cryptographically validated session (guaranteed by line 145).
    // 2. Query is scoped to activeTenantClaim if present.
    // 3. Fails closed if multiple profiles match the same email (prevents cross-tenant email collisions).
    if ((!roleRows || roleRows.length === 0) && user.email) {
      let profileQuery = serviceClient
        .from('profiles')
        .select('id, tenant_id, is_active')
        .eq('email', user.email)

      if (activeTenantClaim) {
        profileQuery = profileQuery.eq('tenant_id', activeTenantClaim)
      }

      const { data: matchedProfiles } = await profileQuery
      if (matchedProfiles && matchedProfiles.length > 1) {
        const err = new Error('Forbidden: Ambiguous profile identity across tenants.') as any
        err.status = 403
        throw err
      }

      const profile = matchedProfiles?.[0]
      if (profile?.id) {
        canonicalUserId = profile.id
        const retry = await serviceClient
          .from('user_roles')
          .select('role, tenant_id')
          .eq('user_id', profile.id)
        roleRows = retry.data || []
      }
    }

    // 2. Fail-closed on deactivated account (Rule 3)
    const { data: profileActiveCheck } = await serviceClient
      .from('profiles')
      .select('id, is_active')
      .eq('id', canonicalUserId)
      .maybeSingle()

    if (profileActiveCheck && profileActiveCheck.is_active === false) {
      const err = new Error('Forbidden: Account is deactivated.') as any
      err.status = 403
      err.code = 'ACCOUNT_DEACTIVATED'
      throw err
    }

    if (roleErr || !roleRows || roleRows.length === 0) {
      const err = new Error('Forbidden: No active organization membership found.') as any
      err.status = 403
      throw err
    }

    const tenantRoles = (roleRows || []).filter(r => activeTenantClaim ? r.tenant_id === activeTenantClaim : true)

    if (activeTenantClaim && tenantRoles.length === 0) {
      const err = new Error('Forbidden: Caller has no membership in the claimed tenant.') as any
      err.status = 403
      throw err
    }

    const matchedRoleRow = tenantRoles.find(r => allowedRoles.includes(r.role)) || tenantRoles[0]
    if (!matchedRoleRow) {
      const err = new Error('Forbidden: No matching role found for the active tenant.') as any
      err.status = 403
      throw err
    }

    const callerRole = matchedRoleRow.role
    const activeTenantId = matchedRoleRow.tenant_id

    // 3. Enforce permission boundary
    if (!allowedRoles.includes(callerRole)) {
      const err = new Error(`Forbidden: Role '${callerRole}' cannot execute this administrative action.`) as any
      err.status = 403
      throw err
    }

    return {
      userId: canonicalUserId,
      tenantId: activeTenantId,
      role: callerRole,
      email: user.email || '',
    }
  }
}
