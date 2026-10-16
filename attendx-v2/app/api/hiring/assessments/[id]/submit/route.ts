// ============================================================
// AttendX v2 — REST API: /api/hiring/assessments/[id]/submit
// POST: Submit and evaluate candidate assessment answers
// Enforces server-side time verification, deterministic scoring,
// pass/fail threshold, application state sync, and atomic audit logging
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
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'
    ], request)

    const body = await request.json()
    const answers = body.answers || {}

    if (typeof answers !== 'object' || answers === null) {
      return NextResponse.json({ error: 'answers payload must be an object' }, { status: 400 })
    }

    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1'
    const userAgent = request.headers.get('user-agent') || 'AttendX-Client'

    const serviceClient = getSupabaseServiceClient()
    const result = await AssessmentService.submitAssessment(
      serviceClient,
      caller.tenantId,
      {
        candidate_assessment_id: id,
        answers,
      },
      {
        userId: caller.userId,
        ip,
        userAgent,
      }
    )

    return NextResponse.json({
      success: true,
      result,
      evaluation: result,
      data: result,
    })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
