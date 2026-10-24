// ============================================================
// AttendX v2 — REST API: /api/hiring/analytics/funnel
// GET: Retrieve hiring funnel metrics, stage durations & competency scores
// Zero fabrication: Propagates authentic errors and database calculations
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient, isDevMockSupabase } from '@/lib/supabase/server'
import { AnalyticsService } from '@/lib/hiring/analytics-service'

export async function GET(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller(['HR'], request)

    if (isDevMockSupabase()) {
      const { mockHiringStore } = await import('@/lib/hiring/mock-store')
      const funnel = mockHiringStore.getFunnelMetrics(caller.tenantId)
      const competencies = mockHiringStore.getCompetencies(caller.tenantId).competencies
      const candidateProfiles = mockHiringStore.getCandidateProfiles(caller.tenantId)
      return NextResponse.json({
        funnel,
        competencies: competencies || [],
        candidateProfiles: candidateProfiles || [],
      })
    }

    const serviceClient = getSupabaseServiceClient()
    const [funnel, competencies, candidateProfiles] = await Promise.all([
      AnalyticsService.getFunnelMetrics(serviceClient, caller.tenantId),
      AnalyticsService.getCompetencyScores(serviceClient, caller.tenantId),
      AnalyticsService.getCandidateEvaluationProfiles(serviceClient, caller.tenantId),
    ])

    return NextResponse.json({
      funnel,
      competencies: competencies || [],
      candidateProfiles: candidateProfiles || [],
    })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
