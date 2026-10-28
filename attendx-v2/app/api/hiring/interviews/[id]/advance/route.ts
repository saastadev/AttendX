// ============================================================
// AttendX v2 — REST API: /api/hiring/interviews/[id]/advance
// POST: Advance candidate to next round (Round 1 -> 2, 2 -> 3) or final selection
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient, isDevMockSupabase } from '@/lib/supabase/server'
import { InterviewService } from '@/lib/hiring/interview-service'
import { mockHiringStore } from '@/lib/hiring/mock-store'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'
    ], request)

    const body = await request.json().catch(() => ({}))
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1'
    const userAgent = request.headers.get('user-agent') || 'AttendX-Client'

    if (isDevMockSupabase()) {
      const result = mockHiringStore.advanceRound(caller.tenantId, id, body)
      return NextResponse.json({ success: true, data: result }, { status: 200 })
    }

    const serviceClient = getSupabaseServiceClient()
    const result = await InterviewService.advanceRound(
      serviceClient,
      caller.tenantId,
      id,
      caller.userId,
      body,
      { ip, userAgent }
    )

    return NextResponse.json({ success: true, data: result }, { status: 200 })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
