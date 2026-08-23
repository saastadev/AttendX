// ============================================================
// AttendX v2 — Available Tenants API Route
// GET /api/auth/tenants
// Lists all authorized organizations for the calling user
// ============================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server'
import type { AvailableTenant, GetAvailableTenantsResponse } from '@/types/database'

export async function GET(req: NextRequest) {
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

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentTenantClaim = (user.app_metadata as Record<string, unknown> | undefined)?.tenant_id as string | undefined

    // 1. Fetch user's roles, profiles, and all system tenants
    const [roleRows, profileRows, allTenants] = await Promise.all([
      serviceClient.from('user_roles').select('tenant_id, role, tenants:tenant_id(id, name, slug)').eq('user_id', user.id),
      serviceClient.from('profiles').select('tenant_id, is_active').eq('id', user.id),
      serviceClient.from('tenants').select('id, name, slug, accent_color')
    ])

    const roles = roleRows.data || []
    const isSuperOrAdmin = roles.some((r: any) => ['SUPERADMIN', 'ADMIN'].includes(r.role))

    let tenants: AvailableTenant[] = []

    if (isSuperOrAdmin && (allTenants.data || []).length > 0) {
      // Admins & Superadmins have multi-tenant visibility across all registered organizations
      tenants = (allTenants.data || []).map((t: any) => {
        const matchingRole = roles.find((r: any) => r.tenant_id === t.id)?.role || 'ADMIN'
        return {
          tenant_id: t.id,
          tenant_name: t.name,
          tenant_slug: t.slug,
          role: matchingRole,
          is_current: currentTenantClaim ? t.id === currentTenantClaim : t.id === roles[0]?.tenant_id,
        }
      })
    } else {
      const activeTenantIds = new Set(
        (profileRows.data || []).filter((p: any) => p.is_active).map((p: any) => p.tenant_id)
      )

      tenants = roles
        .filter((r: any) => activeTenantIds.has(r.tenant_id))
        .map((r: any) => ({
          tenant_id: r.tenant_id,
          tenant_name: (r.tenants as any)?.name || 'Organization',
          tenant_slug: (r.tenants as any)?.slug || '',
          role: r.role,
          is_current: currentTenantClaim ? r.tenant_id === currentTenantClaim : false,
        }))
    }

    if (tenants.length > 0 && !tenants.some(t => t.is_current)) {
      tenants[0].is_current = true
    }

    const response: GetAvailableTenantsResponse = {
      tenants,
      requires_selection: false,
    }

    return NextResponse.json(response)
  } catch (err: any) {
    console.error('[Available Tenants API] Error:', err.message)
    return NextResponse.json({ error: 'Failed to retrieve organizations.' }, { status: 500 })
  }
}
