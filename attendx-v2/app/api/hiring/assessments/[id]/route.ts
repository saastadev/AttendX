// ============================================================
// AttendX v2 — REST API: /api/hiring/assessments/[id]
// GET: Fetch assessment session (candidate context) or template/result (admin context)
// Guarantees zero answer key leakage to test-takers and strict tenant isolation
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { AssessmentService } from '@/lib/hiring/assessment-service'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER', 'EMPLOYEE', 'CANDIDATE'
    ], request)

    const { searchParams } = new URL(request.url)
    const isCandidateRequested =
      searchParams.get('candidate') === 'true' ||
      caller.role === 'CANDIDATE' ||
      caller.role === 'EMPLOYEE'

    const serviceClient = getSupabaseServiceClient()

    // 1. Check if ID refers to a candidate_assessments record
    const { data: candAss, error: candErr } = await serviceClient
      .from('candidate_assessments')
      .select('*, assessment:assessments(*), candidate:candidates(*)')
      .eq('organization_id', caller.tenantId)
      .eq('id', id)
      .maybeSingle()

    if (candErr) {
      return NextResponse.json({ error: candErr.message }, { status: 500 })
    }

    if (candAss) {
      if (isCandidateRequested) {
        // Start or resume test session: strips answer keys and validates remaining timer
        const session = await AssessmentService.startAssessment(
          serviceClient,
          caller.tenantId,
          candAss.id
        )

        return NextResponse.json({
          success: true,
          mode: 'CANDIDATE_SESSION',
          candidate_assessment: session.candidateAssessment,
          assessment: session.assessment,
          time_limit_minutes: session.timeLimitMinutes,
          time_remaining_seconds: session.timeRemainingSeconds,
          data: session,
        })
      } else {
        // Admin / Recruiter review: return full candidate evaluation record
        return NextResponse.json({
          success: true,
          mode: 'ADMIN_REVIEW',
          candidate_assessment: candAss,
          assessment: candAss.assessment,
          candidate: candAss.candidate,
          data: candAss,
        })
      }
    }

    // 2. Check if ID refers to an assessment template
    const { data: tmpl, error: tmplErr } = await serviceClient
      .from('assessments')
      .select('*')
      .eq('organization_id', caller.tenantId)
      .eq('id', id)
      .maybeSingle()

    if (tmplErr) {
      return NextResponse.json({ error: tmplErr.message }, { status: 500 })
    }

    if (tmpl) {
      const assessment = await AssessmentService.getAssessment(
        serviceClient,
        caller.tenantId,
        tmpl.id,
        isCandidateRequested // strip answer keys if candidate context
      )

      return NextResponse.json({
        success: true,
        mode: 'TEMPLATE',
        assessment,
        data: assessment,
      })
    }

    // 3. Not found in tenant
    return NextResponse.json(
      { error: `Assessment '${id}' not found in tenant.` },
      { status: 404 }
    )
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
