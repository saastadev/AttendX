// ============================================================
// AttendX v2 — REST API: /api/hiring/sourcing/shortlist
// POST: Shortlist sourced candidate into pipeline
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { SourcingService } from '@/lib/hiring/sourcing-service'

export async function POST(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR'
    ], request)

    const body = await request.json()
    if (!body.sourced_candidate_id || !body.requisition_id) {
      return NextResponse.json(
        { error: 'sourced_candidate_id and requisition_id are required' },
        { status: 400 }
      )
    }

    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1'
    const userAgent = request.headers.get('user-agent') || 'AttendX-Client'

    const serviceClient = getSupabaseServiceClient()
    const result = await SourcingService.shortlistCandidate(
      serviceClient,
      caller.tenantId,
      caller.userId,
      body.sourced_candidate_id,
      body.requisition_id,
      { ip, userAgent }
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
