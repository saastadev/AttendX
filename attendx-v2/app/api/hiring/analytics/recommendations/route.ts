// ============================================================
// AttendX v2 — REST API: /api/hiring/analytics/recommendations
// GET: Retrieve AI Hiring Recommendations (bottlenecks, sourcing gaps, salary benchmarks)
// Zero fabrication: Propagates authentic errors and database records
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient, isDevMockSupabase } from '@/lib/supabase/server'
import { AnalyticsService } from '@/lib/hiring/analytics-service'

export async function GET(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'
    ], request)

    // Mock data is ONLY allowed when mock/development mode is explicitly enabled
    if (isDevMockSupabase()) {
      const { mockHiringStore } = await import('@/lib/hiring/mock-store')
      const recommendations = mockHiringStore.getRecommendations(caller.tenantId).recommendations
      return NextResponse.json({ recommendations, data: recommendations })
    }

    // LIVE MODE: Execute strictly against database.
    // Never silently fall back to mock data if the database is unavailable or query fails.
    const serviceClient = getSupabaseServiceClient()
    const recommendations = await AnalyticsService.generateAndSyncRecommendations(serviceClient, caller.tenantId)

    return NextResponse.json({ recommendations, data: recommendations })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}

export async function POST(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'
    ], request)

    // Mock data is ONLY allowed when mock/development mode is explicitly enabled
    if (isDevMockSupabase()) {
      const { mockHiringStore } = await import('@/lib/hiring/mock-store')
      const recommendations = mockHiringStore.getRecommendations(caller.tenantId).recommendations
      return NextResponse.json({ recommendations, data: recommendations, success: true })
    }

    // LIVE MODE: Execute strictly against database.
    // Never silently fall back to mock data if the database is unavailable or query fails.
    const serviceClient = getSupabaseServiceClient()
    const recommendations = await AnalyticsService.generateAndSyncRecommendations(serviceClient, caller.tenantId)

    return NextResponse.json({ recommendations, data: recommendations, success: true })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
