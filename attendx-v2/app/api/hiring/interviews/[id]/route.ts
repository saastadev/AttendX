// ============================================================
// AttendX v2 — REST API: /api/hiring/interviews/[id]
// GET: Fetch interview details with candidate evaluations
// PATCH: Update status, interviewer notes, or decisions
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient, isDevMockSupabase } from '@/lib/supabase/server'
import { InterviewService } from '@/lib/hiring/interview-service'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'
    ], request)

    if (isDevMockSupabase()) {
      const { mockHiringStore } = await import('@/lib/hiring/mock-store')
      const interviews = mockHiringStore.listInterviews(caller.tenantId)
      const found = interviews.find((i: any) => i.id === id)
      if (found) {
        return NextResponse.json({ success: true, data: found })
      }
      return NextResponse.json({ error: 'Interview not found' }, { status: 404 })
    }

    const serviceClient = getSupabaseServiceClient()
    const { data: interview, error } = await serviceClient
      .from('interviews')
      .select(`
        *,
        candidate:candidates(*),
        application:job_applications(*),
        evaluations:candidate_evaluations(*)
      `)
      .eq('organization_id', caller.tenantId)
      .eq('id', id)
      .single()

    if (error || !interview) {
      return NextResponse.json({ error: 'Interview not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: interview })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'
    ], request)

    const body = await request.json()
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1'
    const userAgent = request.headers.get('user-agent') || 'AttendX-Client'

    if (isDevMockSupabase()) {
      const { mockHiringStore } = await import('@/lib/hiring/mock-store')
      const interview = mockHiringStore.interviews.find(i => i.id === id)
      if (interview) {
        if (body.status) interview.status = body.status
        if (body.notes) interview.notes = body.notes
        return NextResponse.json({ success: true, data: interview })
      }
      return NextResponse.json({ error: 'Interview not found' }, { status: 404 })
    }

    const serviceClient = getSupabaseServiceClient()
    const updated = await InterviewService.updateStatus(
      serviceClient,
      caller.tenantId,
      id,
      caller.userId,
      body.status,
      {
        notes: body.notes,
        decision: body.decision,
        decisionReason: body.decision_reason,
      },
      { ip, userAgent }
    )

    return NextResponse.json({ success: true, data: updated })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
