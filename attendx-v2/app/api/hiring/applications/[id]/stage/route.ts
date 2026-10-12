// ============================================================
// AttendX v2 — REST API: /api/hiring/applications/[id]/stage
// POST/PATCH: Move application stage via Unified State Machine
// Rejects invalid transitions with 409 Conflict
// Writes hiring_funnel_events & hiring_audit_logs atomically
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient, isDevMockSupabase } from '@/lib/supabase/server'
import { ApplicationService } from '@/lib/hiring/application-service'
import type { HiringStage } from '@/types/hiring'

async function handleStageTransition(
  request: Request,
  params: Promise<{ id: string }>
) {
  try {
    const { id } = await params
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'
    ], request)

    const body = await request.json()
    const target_stage = body.target_stage || body.to_stage || body.stage
    const decision = body.decision
    const reason = body.reason || body.notes
    const metadata = body.metadata

    if (!target_stage) {
      return NextResponse.json(
        { error: 'target_stage or to_stage is required' },
        { status: 400 }
      )
    }

    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1'
    const userAgent = request.headers.get('user-agent') || 'AttendX-Client'

    if (isDevMockSupabase()) {
      const { mockHiringStore } = await import('@/lib/hiring/mock-store')
      const updated = mockHiringStore.updateApplicationStage(caller.tenantId, id, target_stage, decision, reason)
      return NextResponse.json({
        success: true,
        message: `Stage transitioned to '${target_stage}'`,
        data: updated,
      })
    }

    const serviceClient = getSupabaseServiceClient()
    const updated = await ApplicationService.moveStage(
      serviceClient,
      caller.tenantId,
      id,
      target_stage as HiringStage,
      caller.userId,
      { reason, decision, ...(metadata || {}) },
      { ip, userAgent }
    )

    return NextResponse.json({
      success: true,
      message: `Stage transitioned to '${target_stage}'`,
      data: updated,
    })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json(
      {
        error: err.message || 'Stage transition failed',
        code: status === 409 ? 'INVALID_STATE_TRANSITION' : 'TRANSITION_ERROR',
        fromStage: err.fromStage,
        toStage: err.toStage,
      },
      { status }
    )
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return handleStageTransition(request, context.params)
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return handleStageTransition(request, context.params)
}
