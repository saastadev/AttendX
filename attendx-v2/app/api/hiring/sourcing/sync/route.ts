// ============================================================
// AttendX v2 — REST API: /api/hiring/sourcing/sync
// POST: Synchronize External Applicants from Job Boards (LinkedIn Mock, Indeed Mock)
// Mode 1: Applicant Synchronization into Candidate Pipeline
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
    const simulateEmpty = Boolean(body.simulate_empty || body.simulateEmpty)
    const limit = body.limit !== undefined ? Number(body.limit) : undefined
    const offset = body.offset !== undefined ? Number(body.offset) : undefined

    const serviceClient = getSupabaseServiceClient()
    const result = await SourcingService.syncApplicants(
      serviceClient,
      caller.tenantId,
      caller.userId,
      body.requisition_id,
      platforms,
      { ip, userAgent, simulateError, simulateEmpty, limit, offset }
    )

    return NextResponse.json({
      success: true,
      message: `Synchronized ${result.syncedCount} applicant(s) into pipeline`,
      synced_count: result.syncedCount,
      applications: result.applications,
      providerStatuses: result.providerStatuses,
      data: result,
    }, { status: 200 })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
