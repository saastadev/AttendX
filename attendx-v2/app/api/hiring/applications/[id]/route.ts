// ============================================================
// AttendX v2 — REST API: /api/hiring/applications/[id]
// GET: Fetch application with candidate profile, resume, and requisition info
// PATCH: Update application details or HR decision
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { ApplicationService } from '@/lib/hiring/application-service'

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
    const application = await ApplicationService.getById(
      serviceClient,
      caller.tenantId,
      id,
      caller.role
    )

    return NextResponse.json({ success: true, data: application })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'
    ], request)

    const body = await request.json()
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1'
    const userAgent = request.headers.get('user-agent') || 'AttendX-Client'
    const serviceClient = getSupabaseServiceClient()

    // If updating decision
    if (body.current_decision) {
      const updated = await ApplicationService.setDecision(
        serviceClient,
        caller.tenantId,
        id,
        body.current_decision,
        caller.userId,
        body.rejection_reason || body.reason,
        { ip, userAgent }
      )
      return NextResponse.json({ success: true, data: updated })
    }

    // Generic update
    const { data: updated, error } = await serviceClient
      .from('job_applications')
      .update(body)
      .eq('organization_id', caller.tenantId)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: updated })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
