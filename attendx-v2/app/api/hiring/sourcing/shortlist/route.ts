// ============================================================
// AttendX v2 — REST API: /api/hiring/sourcing/shortlist
// POST: Shortlist sourced candidate into pipeline
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient, isDevMockSupabase } from '@/lib/supabase/server'
import { SourcingService } from '@/lib/hiring/sourcing-service'

export async function POST(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller(['HR'], request)

    const body = await request.json()
    if (!body.sourced_candidate_id || !body.requisition_id) {
      return NextResponse.json(
        { error: 'sourced_candidate_id and requisition_id are required' },
        { status: 400 }
      )
    }

    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1'
    const userAgent = request.headers.get('user-agent') || 'AttendX-Client'

    if (isDevMockSupabase()) {
      const { mockHiringStore } = await import('@/lib/hiring/mock-store')
      const req = mockHiringStore.requisitions.find(
        r => r.id === body.requisition_id && (r.organization_id === caller.tenantId || r.organization_id === '11111111-0000-0000-0000-000000000001' || !r.organization_id)
      )
      if (!req) {
        return NextResponse.json(
          { error: `Job requisition '${body.requisition_id}' not found.` },
          { status: 404 }
        )
      }
      if (req.status !== 'OPEN') {
        return NextResponse.json(
          { error: `Job requisition '${body.requisition_id}' is not eligible for candidate shortlisting (status: ${req.status}). Must be OPEN.` },
          { status: 400 }
        )
      }
      const app = mockHiringStore.createApplication(caller.tenantId, {
        requisition_id: body.requisition_id,
        candidate_name: body.candidate_name || 'Shortlisted Sourced Candidate',
        email: body.email || `sourced.${Date.now()}@example.com`,
        phone: body.phone || '+1-555-0199',
        stage: 'SHORTLISTED',
        match_score: body.match_score || 85,
        skill_score: body.skill_score || 85,
        experience_score: body.experience_score || 85,
        jd_relevance_score: body.role_score || 85,
      })
      return NextResponse.json({
        success: true,
        message: 'Sourced candidate shortlisted into pipeline',
        data: { application: app },
      }, { status: 201 })
    }

    const serviceClient = getSupabaseServiceClient()
    const result = await SourcingService.shortlistCandidate(
      serviceClient,
      caller.tenantId,
      caller.userId,
      body.sourced_candidate_id,
      body.requisition_id,
      { ip, userAgent, stage: body.stage }
    )

    return NextResponse.json({
      success: true,
      message: 'Sourced candidate shortlisted into pipeline',
      data: result,
    }, { status: 201 })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
