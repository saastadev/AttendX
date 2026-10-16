// ============================================================
// AttendX v2 — REST API: /api/hiring/assessments
// GET: List assessment templates for authoritative tenant
// POST: Create new assessment template with questions
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { AssessmentService } from '@/lib/hiring/assessment-service'

export async function GET(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'
    ], request)

    const { searchParams } = new URL(request.url)
    const requisitionId = searchParams.get('requisition_id') || undefined

    const serviceClient = getSupabaseServiceClient()
    const assessments = await AssessmentService.listAssessments(
      serviceClient,
      caller.tenantId,
      requisitionId
    )

    return NextResponse.json({
      success: true,
      assessments,
      data: assessments,
    })
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

    const body = await request.json()

    if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
      return NextResponse.json({ error: 'Assessment title is required' }, { status: 400 })
    }

    if (body.time_limit_minutes !== undefined && Number(body.time_limit_minutes) < 5) {
      return NextResponse.json({ error: 'Time limit must be at least 5 minutes' }, { status: 400 })
    }

    if (body.passing_score !== undefined && (Number(body.passing_score) < 0 || Number(body.passing_score) > 100)) {
      return NextResponse.json({ error: 'Passing score must be between 0 and 100' }, { status: 400 })
    }

    const serviceClient = getSupabaseServiceClient()
    const assessment = await AssessmentService.createAssessment(
      serviceClient,
      caller.tenantId,
      caller.userId,
      {
        requisition_id: body.requisition_id || null,
        title: body.title.trim(),
        description: body.description || null,
        time_limit_minutes: body.time_limit_minutes ? Number(body.time_limit_minutes) : 45,
        passing_score: body.passing_score !== undefined ? Number(body.passing_score) : 60,
        questions: Array.isArray(body.questions) ? body.questions : [],
        is_active: body.is_active !== undefined ? Boolean(body.is_active) : true,
      }
    )

    return NextResponse.json(
      { success: true, assessment, data: assessment },
      { status: 201 }
    )
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
