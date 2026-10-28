// ============================================================
// AttendX v2 — REST API: /api/hiring/screenings
// GET: List AI screening evaluations
// POST: Run AI screening evaluation on application
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { ScreeningService } from '@/lib/hiring/screening-service'

export async function GET(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller(['HR'], request)

    const { searchParams } = new URL(request.url)
    const filters = {
      applicationId: searchParams.get('application_id') || undefined,
      candidateId: searchParams.get('candidate_id') || undefined,
      requisitionId: searchParams.get('requisition_id') || undefined,
    }

    const serviceClient = getSupabaseServiceClient()
    const screenings = await ScreeningService.list(serviceClient, caller.tenantId, filters)

    return NextResponse.json({ success: true, data: screenings, screenings })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}

export async function POST(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller(['HR'], request)

    const body = await request.json()
    if (!body.application_id) {
      return NextResponse.json({ error: 'application_id is required' }, { status: 400 })
    }

    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1'
    const userAgent = request.headers.get('user-agent') || 'AttendX-Client'

    const serviceClient = getSupabaseServiceClient()
    const result = await ScreeningService.evaluate(
      serviceClient,
      caller.tenantId,
      caller.userId,
      body.application_id,
      { ip, userAgent }
    )

    if (result.status === 'INSUFFICIENT_DATA') {
      return NextResponse.json(
        {
          success: false,
          status: 'INSUFFICIENT_DATA',
          message: result.message,
          data: result,
        },
        { status: 422 }
      )
    }

    return NextResponse.json({ success: true, data: result.screening, evaluation: result }, { status: 201 })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
