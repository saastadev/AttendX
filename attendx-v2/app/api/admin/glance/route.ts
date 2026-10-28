// ============================================================
// AttendX v2 — Admin Attendance Glance API (Scope E.30)
// Spec: docs/specs/29_31_ai_data_engine_handoff_spec.md
// ============================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server'
import type { AttendanceGlanceMetrics } from '@/types/reporting'

const ALLOWED_ROLES = ['SUPERADMIN', 'ADMIN'] as const

export async function GET(req: NextRequest) {
  const correlationId = req.headers.get('x-correlation-id') || crypto.randomUUID()

  try {
    const supabase = await getSupabaseServerClient()
    let { data: { user }, error: authErr } = await supabase.auth.getUser()
    const serviceClient = getSupabaseServiceClient()

    if (!user || authErr) {
      const authHeader = req.headers.get('Authorization')
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7).trim()
        const { data: userData } = await serviceClient.auth.getUser(token)
        if (userData?.user) {
          user = userData.user
          authErr = null
        }
      }
    }

    if (!user || authErr) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'UNAUTHENTICATED' },
        { status: 401, headers: { 'x-correlation-id': correlationId } }
      )
    }

    // Resolve candidate tenant ID (server independently verifies membership below)
    const requestedTenantId = req.nextUrl.searchParams.get('tenant_id') || req.headers.get('x-tenant-id')
    let targetTenantId: string | null = requestedTenantId

    if (!targetTenantId) {
      const appMetaTenant = (user.app_metadata as Record<string, unknown> | undefined)?.tenant_id
      if (typeof appMetaTenant === 'string' && appMetaTenant) {
        targetTenantId = appMetaTenant
      }
    }

    if (!targetTenantId) {
      const { data: profile } = await serviceClient
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .maybeSingle()
      if (profile?.tenant_id) {
        targetTenantId = profile.tenant_id
      }
    }

    if (!targetTenantId) {
      const { data: allUserRoles } = await serviceClient
        .from('user_roles')
        .select('tenant_id')
        .eq('user_id', user.id)
      if (allUserRoles && allUserRoles.length === 1) {
        targetTenantId = allUserRoles[0].tenant_id
      }
    }

    if (!targetTenantId) {
      return NextResponse.json(
        { error: 'Forbidden: No organization context established.', code: 'FORBIDDEN_TENANT' },
        { status: 403, headers: { 'x-correlation-id': correlationId } }
      )
    }

    // 1. Authoritative Server-Side Role Verification for the Target Tenant
    const { data: roleRow, error: roleError } = await serviceClient
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)
      .eq('tenant_id', targetTenantId)
      .maybeSingle()

    if (roleError) {
      console.error('[Admin Glance] Authorization lookup error:', roleError)
      return NextResponse.json(
        { error: 'Forbidden: Authorization check failed.', code: 'AUTHORIZATION_CHECK_FAILED' },
        { status: 403, headers: { 'x-correlation-id': correlationId } }
      )
    }

    if (!roleRow) {
      return NextResponse.json(
        { error: 'Forbidden: You do not belong to this organization.', code: 'FORBIDDEN_TENANT' },
        { status: 403, headers: { 'x-correlation-id': correlationId } }
      )
    }

    if (!ALLOWED_ROLES.includes(roleRow.role as any)) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient privileges for this organization.', code: 'FORBIDDEN_ROLE' },
        { status: 403, headers: { 'x-correlation-id': correlationId } }
      )
    }

    // 2. Execute Data Engine Canonical RPC (Strictly Zero API-Layer Math - BRD §30)
    const { data: rpcRows, error: rpcErr } = await serviceClient.rpc('admin_attendance_glance', {
      p_tenant_id: targetTenantId,
    })

    if (rpcErr || !rpcRows) {
      console.error('[Admin Glance RPC Error]:', rpcErr)
      return NextResponse.json(
        { error: 'Data engine reporting query failed', code: 'INTERNAL_ERROR' },
        { status: 500, headers: { 'x-correlation-id': correlationId } }
      )
    }

    const glance: AttendanceGlanceMetrics = {
      PRESENT: 0,
      COMPLETED: 0,
      ON_LEAVE: 0,
      ABSENT: 0,
      TOTAL: 0,
    }

    for (const row of rpcRows as Array<{ status: keyof AttendanceGlanceMetrics; employee_count: string | number }>) {
      if (row.status in glance) {
        glance[row.status] = Number(row.employee_count)
      }
    }

    return NextResponse.json(
      {
        success: true,
        tenant_id: roleRow.tenant_id,
        glance,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
          'x-correlation-id': correlationId,
        },
      }
    )
  } catch (err: any) {
    console.error('[Admin Glance API Error]:', err)
    return NextResponse.json(
      { error: err.message || 'Failed to retrieve attendance glance metrics', code: 'INTERNAL_ERROR' },
      { status: 500, headers: { 'x-correlation-id': correlationId } }
    )
  }
}
