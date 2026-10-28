// ============================================================
// AttendX v2 — REST API: /api/hiring/interviews/[id]/feedback
// GET: Retrieve interview evaluation scorecards
// POST: Record evaluator feedback, scores, and hiring decision (PASS/FAIL)
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient, isDevMockSupabase } from '@/lib/supabase/server'
import { InterviewService } from '@/lib/hiring/interview-service'
import { mockHiringStore } from '@/lib/hiring/mock-store'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'
    ], request)

    if (isDevMockSupabase()) {
      const interview = mockHiringStore.interviews.find(i => i.id === id && (i.organization_id === caller.tenantId || !caller.tenantId))
      if (!interview) return NextResponse.json({ error: 'Interview not found' }, { status: 404 })
      return NextResponse.json({ success: true, evaluations: interview.evaluations || [] })
    }

    const serviceClient = getSupabaseServiceClient()
    const { data: evaluations, error } = await serviceClient
      .from('candidate_evaluations')
      .select('*')
      .eq('interview_id', id)
      .eq('organization_id', caller.tenantId)

    if (error) {
      const interview = mockHiringStore.interviews.find(i => i.id === id)
      if (interview) return NextResponse.json({ success: true, evaluations: interview.evaluations || [] })
      return NextResponse.json({ error: 'Interview evaluations not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, evaluations: evaluations || [] })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}

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
    if (!body.recommendation) {
      return NextResponse.json(
        { error: 'Evaluator recommendation (STRONG_HIRE, HIRE, HOLD, NO_HIRE) is required' },
        { status: 400 }
      )
    }

    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1'
    const userAgent = request.headers.get('user-agent') || 'AttendX-Client'

    if (isDevMockSupabase()) {
      const result = mockHiringStore.recordInterviewFeedback(caller.tenantId, id, {
        evaluator_id: caller.userId,
        technical_score: body.technical_score,
        communication_score: body.communication_score,
        problem_solving_score: body.problem_solving_score,
        culture_fit_score: body.culture_fit_score,
        overall_score: body.overall_score,
        scorecard_feedback: body.scorecard_feedback || body.feedback,
        recommendation: body.recommendation,
        decision: body.decision,
      })
      return NextResponse.json({ success: true, data: result }, { status: 201 })
    }

    const serviceClient = getSupabaseServiceClient()
    const result = await InterviewService.recordFeedback(
      serviceClient,
      caller.tenantId,
      id,
      caller.userId,
      {
        technical_score: body.technical_score,
        communication_score: body.communication_score,
        problem_solving_score: body.problem_solving_score,
        culture_fit_score: body.culture_fit_score,
        overall_score: body.overall_score,
        scorecard_feedback: body.scorecard_feedback || body.feedback,
        recommendation: body.recommendation,
        decision: body.decision,
      },
      { ip, userAgent }
    )

    return NextResponse.json({ success: true, data: result }, { status: 201 })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
