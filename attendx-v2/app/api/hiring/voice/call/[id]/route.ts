// ============================================================
// AttendX v2 — REST API: /api/hiring/voice/call/[id]
// GET: Retrieve a specific Voice AI call by ID (tenant isolated)
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { VoiceAIService } from '@/lib/hiring/voice-service'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: callId } = await params
    const caller = await ServerIdentity.getAuthoritativeCaller(['HR'], request)

    if (!callId) {
      return NextResponse.json({ error: 'Call ID is required' }, { status: 400 })
    }

    const serviceClient = getSupabaseServiceClient()
    const callRecord = await VoiceAIService.getCallById(
      serviceClient,
      caller.tenantId,
      callId
    )

    return NextResponse.json({
      success: true,
      data: callRecord,
      call: callRecord,
    })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
