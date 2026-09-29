// ============================================================
// AttendX v2 — REST API: /api/hiring/voice/webhook
// POST: Webhook handler for Voice AI call results (Vapi, Twilio, Mock)
// Secure verification with HMAC signatures
// ============================================================

import { NextResponse } from 'next/server'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { VoiceProviderFactory } from '@/lib/hiring/voice-provider'

export async function POST(request: Request) {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get('x-vapi-signature') ||
      request.headers.get('x-twilio-signature') ||
      request.headers.get('x-voice-signature') || ''

    const providerHeader = request.headers.get('x-voice-provider') || 'MOCK'
    const provider = VoiceProviderFactory.getProvider(providerHeader)

    const isVerified = provider.verifyWebhook(rawBody, signature)
    if (!isVerified && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
    }

    const payload = JSON.parse(rawBody || '{}')
    const event = provider.parseWebhookPayload(payload)

    const serviceClient = getSupabaseServiceClient()

    // Look up call by provider_call_id
    const { data: callRecord } = await serviceClient
      .from('ai_voice_calls')
      .select('*')
      .eq('provider_call_id', event.providerCallId)
      .maybeSingle()

    if (callRecord) {
      await serviceClient
        .from('ai_voice_calls')
        .update({
          status: event.status,
          duration_seconds: event.durationSeconds,
          recording_url: event.recordingUrl || callRecord.recording_url,
          transcript: event.transcript || callRecord.transcript,
          ai_summary: event.aiSummary || callRecord.ai_summary,
          overall_score: event.overallScore ?? callRecord.overall_score,
          sentiment: event.sentiment || callRecord.sentiment,
          extracted_data: event.extractedData || callRecord.extracted_data,
          webhook_verified: isVerified,
          updated_at: new Date().toISOString(),
        })
        .eq('id', callRecord.id)
    }

    return NextResponse.json({ success: true, processed: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Webhook processing failed' }, { status: 500 })
  }
}
