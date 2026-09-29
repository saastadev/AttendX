// ============================================================
// AttendX v2 — REST API: /api/hiring/requisitions/[id]/skills
// GET: List requisition skills
// POST: Add skill with weight & requirement flag
// DELETE: Remove skill from requisition
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
    const { data, error } = await serviceClient
      .from('job_requisition_skills')
      .select('*')
      .eq('organization_id', caller.tenantId)
      .eq('requisition_id', id)
      .order('weight', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR'
    ], request)

    const body = await request.json()
    if (!body.skill_name?.trim()) {
      return NextResponse.json({ error: 'skill_name is required' }, { status: 400 })
    }

    const serviceClient = getSupabaseServiceClient()
    const skill = await RequisitionService.addSkill(
      serviceClient,
      caller.tenantId,
      id,
      body.skill_name,
      body.weight || 1,
      body.is_required !== false,
      body.min_experience_years || 0
    )

    return NextResponse.json({ success: true, data: skill }, { status: 201 })
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
      'SUPERADMIN', 'ADMIN', 'HR'
    ], request)

    const { searchParams } = new URL(request.url)
    const skillId = searchParams.get('skill_id')
    if (!skillId) {
      return NextResponse.json({ error: 'skill_id query parameter is required' }, { status: 400 })
    }

    const serviceClient = getSupabaseServiceClient()
    const result = await RequisitionService.removeSkill(
      serviceClient,
      caller.tenantId,
      id,
      skillId
    )

    return NextResponse.json(result)
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
