// ============================================================
// AttendX v2 — REST API: /api/hiring/applications/pipeline
// GET: Kanban pipeline grouped by stage for a requisition
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { ApplicationService } from '@/lib/hiring/application-service'

export async function GET(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'
    ], request)

    const { searchParams } = new URL(request.url)
    const requisitionId = searchParams.get('requisition_id') || undefined

    const serviceClient = getSupabaseServiceClient()
    const pipeline = await ApplicationService.getPipeline(
      serviceClient,
      caller.tenantId,
      requisitionId,
      caller.role
    )

    return NextResponse.json({ success: true, data: pipeline })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
