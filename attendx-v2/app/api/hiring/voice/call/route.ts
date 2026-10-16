// ============================================================
// AttendX v2 — REST API: /api/hiring/voice/call
// POST: Initiate an automated Voice AI screening/scheduling/follow-up call
// GET: List voice calls for tenant with optional filters
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient, isDevMockSupabase } from '@/lib/supabase/server'
import { VoiceAIService } from '@/lib/hiring/voice-service'

export async function POST(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'
    ], request)

    const body = await request.json()
    const ip = request.headers.get('x-forwarded-for') || undefined
    const userAgent = request.headers.get('user-agent') || undefined

    if (isDevMockSupabase()) {
      const { mockHiringStore } = await import('@/lib/hiring/mock-store')
      const callRecord = mockHiringStore.initiateVoiceCall(caller.tenantId, caller.userId, body)
      return NextResponse.json({
        success: true,
        call: callRecord,
        data: callRecord,
        provider: callRecord.call_provider,
      })
    }

    const serviceClient = getSupabaseServiceClient()
    const callRecord = await VoiceAIService.initiateCall(
      serviceClient,
      caller.tenantId,
      caller.userId,
      body,
      { ip, userAgent }
    )

    return NextResponse.json({
      success: true,
      call: callRecord,
      data: callRecord,
      provider: callRecord.call_provider,
    })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}

export async function GET(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'
    ], request)

    const { searchParams } = new URL(request.url)
    const candidateId = searchParams.get('candidate_id') || undefined
    const requisitionId = searchParams.get('requisition_id') || undefined
    const callPurpose = searchParams.get('call_purpose') || undefined
    const statusFilter = searchParams.get('status') || undefined

    if (isDevMockSupabase()) {
      const { mockHiringStore } = await import('@/lib/hiring/mock-store')
      const calls = mockHiringStore.listVoiceCalls(caller.tenantId, {
        candidate_id: candidateId,
        requisition_id: requisitionId,
        call_purpose: callPurpose,
        status: statusFilter,
      })
      return NextResponse.json({
        success: true,
        data: calls,
        calls,
        total: calls.length,
      })
    }

    const serviceClient = getSupabaseServiceClient()
    const calls = await VoiceAIService.listCalls(serviceClient, caller.tenantId, {
      candidate_id: candidateId,
      requisition_id: requisitionId,
      call_purpose: callPurpose,
      status: statusFilter,
    })

    return NextResponse.json({
      success: true,
      data: calls,
      calls,
      total: calls.length,
    })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
