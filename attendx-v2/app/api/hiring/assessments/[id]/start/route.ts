// ============================================================
// AttendX v2 — REST API: /api/hiring/assessments/[id]/start
// POST: Start or resume candidate assessment session
// Strips answer keys, transitions status ASSIGNED -> IN_PROGRESS,
// and computes authoritative remaining timer seconds
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { AssessmentService } from '@/lib/hiring/assessment-service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER', 'EMPLOYEE', 'CANDIDATE'
    ], request)

    const serviceClient = getSupabaseServiceClient()
    const session = await AssessmentService.startAssessment(
      serviceClient,
      caller.tenantId,
      id
    )

    return NextResponse.json({
      success: true,
      candidate_assessment: session.candidateAssessment,
      assessment: session.assessment,
      time_limit_minutes: session.timeLimitMinutes,
      time_remaining_seconds: session.timeRemainingSeconds,
      data: session,
    })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
