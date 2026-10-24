// ============================================================
// AttendX v2 — REST API: /api/hiring/applications
// GET: List applications with stage/role/score filters and pagination
// POST: Submit a candidate application for a requisition
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient, isDevMockSupabase } from '@/lib/supabase/server'
import { ApplicationService } from '@/lib/hiring/application-service'

export async function GET(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller(['HR'], request)

    const { searchParams } = new URL(request.url)
    const filters = {
      requisition_id: searchParams.get('requisition_id') || undefined,
      stage: searchParams.get('stage') || undefined,
      decision: searchParams.get('decision') || undefined,
      min_score: searchParams.get('min_score') ? Number(searchParams.get('min_score')) : undefined,
      page: searchParams.get('page') ? Number(searchParams.get('page')) : undefined,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined,
      role: caller.role,
    }

    if (isDevMockSupabase()) {
      const { mockHiringStore } = await import('@/lib/hiring/mock-store')
      const mockResult = mockHiringStore.listApplications(caller.tenantId, filters)
      return NextResponse.json({
        applications: mockResult.applications,
        data: mockResult.applications,
        total: mockResult.total,
        page: mockResult.page,
        limit: mockResult.limit,
      })
    }

    const serviceClient = getSupabaseServiceClient()
    const result = await ApplicationService.list(serviceClient, caller.tenantId, filters)
    const list = result.data || []
    return NextResponse.json({
      applications: list,
      data: list,
      total: result.total ?? list.length,
      page: result.page ?? 1,
      limit: result.limit ?? 20,
    })
  } catch (err: any) {
    console.error('[API /api/hiring/applications] Error listing applications:', err.message || err)
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}

export async function POST(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller(['HR'], request)

    const body = await request.json()
    if (!body.requisition_id || !body.candidate_id) {
      return NextResponse.json(
        { error: 'requisition_id and candidate_id are required' },
        { status: 400 }
      )
    }

    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1'
    const userAgent = request.headers.get('user-agent') || 'AttendX-Client'

    if (isDevMockSupabase()) {
      return NextResponse.json({ success: true, message: 'Application submitted successfully' }, { status: 201 })
    }

    const serviceClient = getSupabaseServiceClient()
    const application = await ApplicationService.create(
      serviceClient,
      caller.tenantId,
      caller.userId,
      body,
      { ip, userAgent }
    )
    return NextResponse.json({ success: true, data: application }, { status: 201 })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
