// ============================================================
// AttendX v2 — REST API: /api/hiring/sourcing/profile
// GET: Retrieve External or Normalized Sourced Candidate Profile
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { SourcingService } from '@/lib/hiring/sourcing-service'

export async function GET(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller(['HR'], request)

    const { searchParams } = new URL(request.url)
    const sourcedCandidateId = searchParams.get('id') || searchParams.get('sourced_candidate_id') || undefined
    const externalId = searchParams.get('external_id') || searchParams.get('externalId') || undefined
    const platform = searchParams.get('platform') || searchParams.get('provider') || undefined

    if (!sourcedCandidateId && (!externalId || !platform)) {
      return NextResponse.json(
        { error: 'Provide either id (sourced_candidate_id) or external_id and platform' },
        { status: 400 }
      )
    }

    const serviceClient = getSupabaseServiceClient()
    const profile = await SourcingService.getCandidateProfile(
      serviceClient,
      caller.tenantId,
      {
        sourcedCandidateId,
        externalId,
        platform,
      }
    )

    return NextResponse.json({
      success: true,
      profile,
      data: profile,
    }, { status: 200 })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
