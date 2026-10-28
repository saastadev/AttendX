// ============================================================
// AttendX v2 — REST API: /api/hiring/assessments/assign
// POST: Assign an assessment template to a candidate
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { AssessmentService } from '@/lib/hiring/assessment-service'

export async function POST(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller(['HR'], request)

    const body = await request.json()
    const assessmentId = body.assessment_id || body.assessmentId
    const candidateId = body.candidate_id || body.candidateId
    const applicationId = body.application_id || body.applicationId

    if (!assessmentId) {
      return NextResponse.json({ error: 'assessment_id is required' }, { status: 400 })
    }

    if (!candidateId) {
      return NextResponse.json({ error: 'candidate_id is required' }, { status: 400 })
    }

    const serviceClient = getSupabaseServiceClient()
    const candidateAssessment = await AssessmentService.assignAssessment(
      serviceClient,
      caller.tenantId,
      caller.userId,
      {
        assessmentId,
        candidateId,
        applicationId,
      }
    )

    return NextResponse.json(
      {
        success: true,
        candidate_assessment: candidateAssessment,
        data: candidateAssessment,
      },
      { status: 201 }
    )
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
