// ============================================================
// AttendX v2 — REST API: /api/hiring/audit-logs
// GET: Fetch immutable hiring audit logs (Admin only)
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN'
    ], request)

    const { searchParams } = new URL(request.url)
    const entityType = searchParams.get('entity_type') || undefined
    const entityId = searchParams.get('entity_id') || undefined
    const page = Math.max(Number(searchParams.get('page')) || 1, 1)
    const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 25, 1), 100)
    const offset = (page - 1) * limit

    const serviceClient = getSupabaseServiceClient()
    let query = serviceClient
      .from('hiring_audit_logs')
      .select('*', { count: 'exact' })
      .eq('organization_id', caller.tenantId)

    if (entityType) {
      query = query.eq('entity_type', entityType)
    }
    if (entityId) {
      query = query.eq('entity_id', entityId)
    }

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1)

    const { data, count, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      page,
      limit,
    })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
