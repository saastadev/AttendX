// ============================================================
// AttendX v2 — REST API: /api/hiring/applications/bulk-action
// POST: Execute bulk stage movements or rejections across applications
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { ApplicationService } from '@/lib/hiring/application-service'

export async function POST(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR'
    ], request)

    const body = await request.json()
    const { application_ids, action, target_stage, reason } = body

    if (!Array.isArray(application_ids) || application_ids.length === 0) {
      return NextResponse.json(
        { error: 'application_ids must be a non-empty array' },
        { status: 400 }
      )
    }

    if (!action || !['MOVE_STAGE', 'REJECT'].includes(action)) {
      return NextResponse.json(
        { error: "action must be either 'MOVE_STAGE' or 'REJECT'" },
        { status: 400 }
      )
    }

    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1'
    const userAgent = request.headers.get('user-agent') || 'AttendX-Client'

    const serviceClient = getSupabaseServiceClient()
    const result = await ApplicationService.bulkAction(
      serviceClient,
      caller.tenantId,
      application_ids,
      action,
      caller.userId,
      { targetStage: target_stage, reason },
      { ip, userAgent }
    )

    return NextResponse.json({ success: true, ...result })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
