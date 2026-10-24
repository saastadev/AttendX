// ============================================================
// AttendX v2 — REST API: /api/hiring/screenings/[id]/review
// POST: Submit human review on an AI screening evaluation
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { ScreeningService } from '@/lib/hiring/screening-service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const caller = await ServerIdentity.getAuthoritativeCaller(['HR'], request)

    const body = await request.json()
    const decision = body.decision
    if (!['ACCEPT', 'REJECT', 'MODIFY'].includes(decision)) {
      return NextResponse.json(
        { error: "decision must be one of 'ACCEPT', 'REJECT', or 'MODIFY'" },
        { status: 400 }
      )
    }

    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1'
    const userAgent = request.headers.get('user-agent') || 'AttendX-Client'

    const serviceClient = getSupabaseServiceClient()
    const updated = await ScreeningService.recordHumanReview(
      serviceClient,
      caller.tenantId,
      caller.userId,
      id,
      decision,
      body.notes,
      { ip, userAgent }
    )

    return NextResponse.json({
      success: true,
      message: 'Human review recorded successfully',
      data: updated,
    })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
