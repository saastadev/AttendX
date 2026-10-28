// ============================================================
// AttendX v2 — Tenant Switch API Route
// POST /api/auth/tenant/switch
// Authoritative membership validation & context re-binding
// ============================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient, getSupabaseServiceClient, allowDemoAuthentication } from '@/lib/supabase/server'
import type { TenantSwitchRequest, TenantSwitchResponse } from '@/types/database'

export async function POST(req: NextRequest) {
  try {
    const serviceClient = getSupabaseServiceClient()
    const supabase = await getSupabaseServerClient()
    let { data: { user }, error: authErr } = await supabase.auth.getUser()

    if (!user || authErr) {
      const authHeader = req.headers.get('Authorization')
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7)
        const { data: userData } = await serviceClient.auth.getUser(token)
        if (userData?.user) {
          user = userData.user
          authErr = null
        }
      }
    }

    let isDemoUser = false
    let demoPayload: any = null

    if (allowDemoAuthentication()) {
      let demoCookie: string | undefined
      const cookieHeader = req.headers.get('cookie') || ''
      const match = cookieHeader.match(/attendx-demo-session=([^;]+)/)
      if (match) demoCookie = match[1]
      if (demoCookie) {
        try {
          const cleanCookie = decodeURIComponent(demoCookie.trim().replace(/^"|"$/g, ''))
          demoPayload = JSON.parse(Buffer.from(cleanCookie, 'base64').toString('utf-8'))
          if (demoPayload?.id && demoPayload?.role && demoPayload?.tenant_id) {
            isDemoUser = true
            user = {
              id: demoPayload.id,
              email: demoPayload.email || `${demoPayload.role.toLowerCase()}@acme-tech.com`,
              app_metadata: { role: demoPayload.role, tenant_id: demoPayload.tenant_id },
              user_metadata: { full_name: demoPayload.full_name || 'Demo User' },
            } as any
          }
        } catch {
          // ignore
        }
      }
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let targetUserId = user.id
    if (user.email) {
      const { data: p } = await serviceClient.from('profiles').select('id').eq('email', user.email).maybeSingle()
      if (p?.id) targetUserId = p.id
    }

    const body: TenantSwitchRequest = await req.json().catch(() => ({}))
    const { target_tenant_id } = body

    if (!target_tenant_id) {
      return NextResponse.json({ error: 'target_tenant_id is required' }, { status: 400 })
    }

    // 1. Authoritative membership validation
    const [roleRes, allRolesRes, profileRes, tenantRes] = await Promise.all([
      serviceClient.from('user_roles').select('role').eq('user_id', targetUserId).eq('tenant_id', target_tenant_id).maybeSingle(),
      serviceClient.from('user_roles').select('role').eq('user_id', targetUserId),
      serviceClient.from('profiles').select('is_active').eq('id', targetUserId).maybeSingle(),
      serviceClient.from('tenants').select('name').eq('id', target_tenant_id).maybeSingle(),
    ])

    let isValid = false
    let resolvedRole = 'EMPLOYEE'
    let tenantName = tenantRes.data?.name || 'Organization'

    const isSuperAdmin = (allRolesRes.data || []).some((r: any) => r.role === 'SUPERADMIN')
    const isAdmin = (allRolesRes.data || []).some((r: any) => r.role === 'ADMIN')

    if (roleRes.data && profileRes.data?.is_active !== false) {
      isValid = true
      resolvedRole = roleRes.data.role
    } else if ((isSuperAdmin || isAdmin) && tenantRes.data && profileRes.data?.is_active !== false) {
      // Superadmin/Admin has cross-tenant access to all registered organizations
      isValid = true
      resolvedRole = isSuperAdmin ? 'SUPERADMIN' : 'ADMIN'
      // Ensure user_roles has the target tenant association
      await serviceClient.from('user_roles').upsert({
        user_id: targetUserId,
        tenant_id: target_tenant_id,
        role: resolvedRole
      }, { onConflict: 'user_id,tenant_id' })
    }

    if (!isValid) {
      return NextResponse.json(
        { error: 'Forbidden: You do not have active membership in this tenant.' },
        { status: 403 }
      )
    }

    // 2. Set validated claim in app_metadata (Server-Side Only) & sync profile
    const [updateErrRes] = await Promise.all([
      serviceClient.auth.admin.updateUserById(targetUserId, {
        app_metadata: {
          tenant_id: target_tenant_id,
          role: resolvedRole,
        },
      }),
      serviceClient.from('profiles').update({ tenant_id: target_tenant_id }).eq('id', targetUserId)
    ])

    if (updateErrRes.error) {
      console.error('[Tenant Switch] Error updating app_metadata:', updateErrRes.error.message)
      return NextResponse.json({ error: 'Failed to update organization context.' }, { status: 500 })
    }

    // 3. Write immutable audit log
    await serviceClient.from('audit_log').insert({
      tenant_id: target_tenant_id,
      actor_id: targetUserId,
      action: 'TENANT_SWITCHED',
      table_name: 'tenants',
      record_id: target_tenant_id,
      new_data: {
        target_tenant_name: tenantName,
        resolved_role: resolvedRole,
        switched_at: new Date().toISOString(),
      },
    })

    // 4. Resolve default landing destination for newly active role
    const redirectUrl = ['ADMIN', 'SUPERADMIN'].includes(resolvedRole)
      ? '/admin/users'
      : resolvedRole === 'HR'
      ? '/hr/directory'
      : resolvedRole === 'MANAGER'
      ? '/manager/team'
      : '/dashboard'

    const response: TenantSwitchResponse = {
      success: true,
      active_tenant_id: target_tenant_id,
      role: resolvedRole as any,
      redirect_url: redirectUrl,
      message: `Switched context to ${tenantName}.`,
    }

    const nextResponse = NextResponse.json(response)
    if (allowDemoAuthentication()) {
      const updatedDemoPayload = {
        id: targetUserId,
        email: user.email,
        full_name: (user.user_metadata as any)?.full_name || demoPayload?.full_name || user.email?.split('@')[0] || 'User',
        tenant_id: target_tenant_id,
        role: resolvedRole,
        is_active: true,
      }
      nextResponse.cookies.set('attendx-demo-session', Buffer.from(JSON.stringify(updatedDemoPayload)).toString('base64'), {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 86400 * 7,
      })
    }
    return nextResponse
  } catch (err: any) {
    console.error('[Tenant Switch API] Error:', err.message)
    return NextResponse.json({ error: 'An unexpected error occurred during organization switch.' }, { status: 500 })
  }
}
