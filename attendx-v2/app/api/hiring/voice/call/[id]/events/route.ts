// ============================================================
// AttendX v2 — REST API: /api/hiring/voice/call/[id]/events
// POST: State machine transition event for Voice AI call
// Enforces authoritative state machine (rejects invalid transitions with 409 Conflict)
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

    const body = await request.json()
    const { status, duration_seconds, recording_url, transcript, ai_summary, overall_score, sentiment, extracted_data } = body

    if (!status) {
      return NextResponse.json({ error: 'Target status is required' }, { status: 400 })
    }

    const serviceClient = getSupabaseServiceClient()
    const updatedCall = await VoiceAIService.transitionStatus(
      serviceClient,
      caller.tenantId,
      callId,
      status,
      {
        durationSeconds: duration_seconds,
        recordingUrl: recording_url,
        transcript,
        aiSummary: ai_summary,
        overallScore: overall_score,
        sentiment,
        extractedData: extracted_data,
      },
      caller.userId
    )

    return NextResponse.json({
      success: true,
      data: updatedCall,
      call: updatedCall,
    })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
