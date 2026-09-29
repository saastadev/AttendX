// ============================================================
// AttendX v2 — REST API: /api/hiring/candidates/[id]
// GET: Fetch candidate profile with skills, resumes, and role-masked CTC
// PUT: Update candidate info
// DELETE: Delete candidate (Admin only)
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { CandidateService } from '@/lib/hiring/candidate-service'

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
    const candidate = await CandidateService.getById(
      serviceClient,
      caller.tenantId,
      id,
      caller.role
    )

    return NextResponse.json({ success: true, data: candidate })
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
    const updated = await CandidateService.update(
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
      .from('candidates')
      .delete()
      .eq('organization_id', caller.tenantId)
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: `Candidate '${id}' deleted` })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
