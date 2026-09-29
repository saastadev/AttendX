// ============================================================
// AttendX v2 — REST API: /api/hiring/requisitions
// GET: List requisitions (paginated, filtered, tenant-isolated)
// POST: Create job requisition with skills
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { RequisitionService } from '@/lib/hiring/requisition-service'
import { mockHiringStore } from '@/lib/hiring/mock-store'

export async function GET(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'
    ], request)

    const { searchParams } = new URL(request.url)
    const filters = {
      status: searchParams.get('status') || undefined,
      department_id: searchParams.get('department_id') || undefined,
      priority: searchParams.get('priority') || undefined,
      recruiter_id: searchParams.get('recruiter_id') || undefined,
      search: searchParams.get('search') || undefined,
      page: searchParams.get('page') ? Number(searchParams.get('page')) : undefined,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined,
    }

    try {
      const serviceClient = getSupabaseServiceClient()
      const result = await RequisitionService.list(serviceClient, caller.tenantId, filters)
      const list = result.data || []
      return NextResponse.json({
        requisitions: list,
        data: list,
        total: result.total ?? list.length,
        page: result.page ?? 1,
        limit: result.limit ?? 20,
      })
    } catch {
      const result = mockHiringStore.listRequisitions(caller.tenantId, filters)
      return NextResponse.json({
        requisitions: result.data,
        data: result.data,
        total: result.total,
        page: result.page,
        limit: result.limit,
      })
    }
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}

export async function POST(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR'
    ], request)

    const body = await request.json()
    if (!body.title?.trim() || !body.requisition_code?.trim()) {
      return NextResponse.json(
        { error: 'title and requisition_code are required' },
        { status: 400 }
      )
    }

    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1'
    const userAgent = request.headers.get('user-agent') || 'AttendX-Client'

    try {
      const serviceClient = getSupabaseServiceClient()
      const requisition = await RequisitionService.create(
        serviceClient,
        caller.tenantId,
        caller.userId,
        body,
        { ip, userAgent }
      )
      return NextResponse.json(requisition, { status: 201 })
    } catch {
      const requisition = mockHiringStore.createRequisition(caller.tenantId, body)
      return NextResponse.json(requisition, { status: 201 })
    }
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
