// ============================================================
// AttendX v2 — REST API: /api/hiring/requisitions/[id]
// GET: Fetch requisition details with joins
// PUT: Update requisition metadata & status workflow
// DELETE: Archive / remove requisition (Admin/HR only)
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { RequisitionService } from '@/lib/hiring/requisition-service'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'
    ], request)

    const serviceClient = getSupabaseServiceClient()
    const requisition = await RequisitionService.getById(serviceClient, caller.tenantId, id)

    return NextResponse.json({ success: true, data: requisition })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR'
    ], request)

    const body = await request.json()
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1'
    const userAgent = request.headers.get('user-agent') || 'AttendX-Client'

    const serviceClient = getSupabaseServiceClient()
    const updated = await RequisitionService.update(
      serviceClient,
      caller.tenantId,
      id,
      caller.userId,
      body,
      { ip, userAgent }
    )

    return NextResponse.json({ success: true, data: updated })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN'
    ], request)

    const serviceClient = getSupabaseServiceClient()
    const { error } = await serviceClient
      .from('job_requisitions')
      .delete()
      .eq('organization_id', caller.tenantId)
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: `Requisition '${id}' deleted` })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
