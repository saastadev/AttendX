// ============================================================
// AttendX v2 — REST API: /api/hiring/voice/call/[id]/analyze
// POST: Run grounded AI analysis on voice call transcript
// Enforces zero-fabrication: null summaries/scores if transcript is missing
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { VoiceAIService } from '@/lib/hiring/voice-service'

export async function POST(
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
    const analyzedCall = await VoiceAIService.analyzeCall(
      serviceClient,
      caller.tenantId,
      caller.userId,
      callId
    )

    return NextResponse.json({
      success: true,
      data: analyzedCall,
      call: analyzedCall,
    })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
