// ============================================================
// AttendX v2 — REST API: /api/hiring/sourcing/publish
// POST: Publish Job Requisition to External Job Boards (LinkedIn Mock, Indeed Mock)
// Mode 1: Job Posting
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { SourcingService } from '@/lib/hiring/sourcing-service'

export async function POST(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller(['HR'], request)

    const body = await request.json()
    if (!body.requisition_id) {
      return NextResponse.json(
        { error: 'requisition_id is required' },
        { status: 400 }
      )
    }

    const platforms = Array.isArray(body.platforms) && body.platforms.length > 0
      ? body.platforms
      : ['LINKEDIN', 'INDEED']

    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1'
    const userAgent = request.headers.get('user-agent') || 'AttendX-Client'
    const simulateError = Boolean(body.simulate_error || body.simulateError)

    const serviceClient = getSupabaseServiceClient()
    const result = await SourcingService.publishJob(
      serviceClient,
      caller.tenantId,
      caller.userId,
      body.requisition_id,
      platforms,
      { ip, userAgent, simulateError }
    )

    return NextResponse.json({
      success: true,
      message: `Job posted to ${result.results.length} external board(s)`,
      data: result.results,
      publications: result.results,
      providerStatuses: result.providerStatuses,
    }, { status: 201 })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
