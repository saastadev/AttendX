// ============================================================
// AttendX v2 — Admin Attendance Glance API (Scope E.30)
// Spec: docs/specs/29_31_ai_data_engine_handoff_spec.md
// ============================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server'
import type { AttendanceGlanceMetrics } from '@/types/reporting'

const ALLOWED_ROLES = ['SUPERADMIN', 'ADMIN', 'HR'] as const

export async function GET(req: NextRequest) {
  const correlationId = req.headers.get('x-correlation-id') || crypto.randomUUID()

  try {
    const supabase = await getSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (!user || authErr) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'UNAUTHENTICATED' },
        { status: 401, headers: { 'x-correlation-id': correlationId } }
      )
    }

    const serviceClient = getSupabaseServiceClient()

    // 1. Authoritative Role Verification
    const { data: roleRow } = await serviceClient
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!roleRow || !ALLOWED_ROLES.includes(roleRow.role as any)) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient privileges', code: 'FORBIDDEN_ROLE' },
        { status: 403, headers: { 'x-correlation-id': correlationId } }
      )
    }

    // 2. Execute Data Engine Canonical RPC (Strictly Zero API-Layer Math - BRD §30)
    const { data: rpcRows, error: rpcErr } = await serviceClient.rpc('admin_attendance_glance', {
      p_tenant_id: roleRow.tenant_id,
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
