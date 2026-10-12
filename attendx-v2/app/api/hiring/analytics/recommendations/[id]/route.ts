// ============================================================
// AttendX v2 — REST API: /api/hiring/analytics/recommendations/[id]
// PATCH: Human Review of AI Recommendation (ACCEPT / REJECT / PENDING)
// Enforces Server-Side Identity, Tenant Isolation, and Compliance Audit Logging
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient, isDevMockSupabase } from '@/lib/supabase/server'
import { AnalyticsService } from '@/lib/hiring/analytics-service'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'Recommendation ID is required' }, { status: 400 })
    }

    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'
    ], request)

    const body = await request.json().catch(() => ({}))
    const { status, review_notes } = body

    if (!status || !['ACCEPTED', 'REJECTED', 'PENDING'].includes(status)) {
      return NextResponse.json({
        error: 'Invalid status. Allowed values: ACCEPTED, REJECTED, PENDING'
      }, { status: 400 })
    }

    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null
    const userAgent = request.headers.get('user-agent') || null

    // Explicit mock mode check: mock data is ONLY allowed when mock/offline mode is explicitly configured
    if (isDevMockSupabase()) {
      const { mockHiringStore } = await import('@/lib/hiring/mock-store')
      const rec = mockHiringStore.reviewRecommendation(caller.tenantId, id, status, review_notes, caller.userId)
      if (rec) {
        return NextResponse.json({
          success: true,
          data: rec,
          recommendation: rec,
        })
      }
      return NextResponse.json({ error: 'Recommendation not found' }, { status: 404 })
    }

    // LIVE MODE: Execute strictly against database.
    // Fails closed with 404 if not found or cross-tenant, 500 on database failure.
    // NEVER fall back to mock store on DB failure.
    const serviceClient = getSupabaseServiceClient()
    const updated = await AnalyticsService.reviewRecommendation(serviceClient, {
      organizationId: caller.tenantId,
      recommendationId: id,
      reviewerId: caller.userId,
      status,
      reviewNotes: review_notes,
      ipAddress,
      userAgent,
    })

    return NextResponse.json({
      success: true,
      data: updated,
      recommendation: updated,
    })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
