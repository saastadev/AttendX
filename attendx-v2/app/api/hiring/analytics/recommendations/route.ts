// ============================================================
// AttendX v2 — REST API: /api/hiring/analytics/recommendations
// GET: Retrieve AI Hiring Recommendations (bottlenecks, sourcing gaps, salary benchmarks)
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { AnalyticsService } from '@/lib/hiring/analytics-service'
import { mockHiringStore } from '@/lib/hiring/mock-store'

export async function GET(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'
    ], request)

    try {
      const serviceClient = getSupabaseServiceClient()
      const recommendations = await AnalyticsService.getAIRecommendations(serviceClient, caller.tenantId)
      return NextResponse.json({ recommendations })
    } catch {
      return NextResponse.json(mockHiringStore.getRecommendations(caller.tenantId))
    }
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
