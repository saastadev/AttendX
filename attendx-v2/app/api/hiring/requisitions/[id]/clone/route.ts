// ============================================================
// AttendX v2 — REST API: /api/hiring/requisitions/[id]/clone
// POST: Duplicate a requisition into DRAFT with copied skills
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { RequisitionService } from '@/lib/hiring/requisition-service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR'
    ], request)

    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1'
    const userAgent = request.headers.get('user-agent') || 'AttendX-Client'

    const serviceClient = getSupabaseServiceClient()
    const cloned = await RequisitionService.clone(
      serviceClient,
      caller.tenantId,
      id,
      caller.userId,
      { ip, userAgent }
    )

    return NextResponse.json({ success: true, data: cloned }, { status: 201 })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
