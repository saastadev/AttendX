// ============================================================
// AttendX v2 — REST API: /api/hiring/voice/webhook
// POST: Webhook handler for Voice AI call results (Vapi, Twilio, Mock)
// Idempotent processing with VoiceAIService
// ============================================================

import { NextResponse } from 'next/server'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { VoiceProviderFactory } from '@/lib/hiring/voice-provider'
import { VoiceAIService } from '@/lib/hiring/voice-service'

export async function POST(request: Request) {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get('x-vapi-signature') ||
      request.headers.get('x-signature') ||
      request.headers.get('x-vapi-secret') ||
      request.headers.get('x-twilio-signature') ||
      request.headers.get('x-voice-signature') || ''

    const providerHeader = request.headers.get('x-voice-provider') ||
      (request.headers.get('x-vapi-signature') || request.headers.get('x-signature') || request.headers.get('x-vapi-secret') ? 'VAPI' : '') ||
      (request.headers.get('x-twilio-signature') ? 'TWILIO' : '') ||
      process.env.VOICE_AI_PROVIDER ||
      'MOCK'
    const provider = VoiceProviderFactory.getProvider(providerHeader)

    const isVerified = provider.verifyWebhook(rawBody, signature)
    if (!isVerified && (process.env.NODE_ENV === 'production' || signature)) {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
    }

    const payload = JSON.parse(rawBody || '{}')
    const event = provider.parseWebhookPayload(payload)

    const serviceClient = getSupabaseServiceClient()

    // Find the call by provider_call_id to get its organization_id
    const { data: callRecord, error: findErr } = await serviceClient
      .from('ai_voice_calls')
      .select('id, organization_id')
      .eq('provider_call_id', event.providerCallId)
      .maybeSingle()

    if (findErr || !callRecord) {
      return NextResponse.json({
        error: `Voice call with provider ID '${event.providerCallId}' not found.`
      }, { status: 404 })
    }

    const result = await VoiceAIService.processProviderEvent(
      serviceClient,
      callRecord.organization_id,
      event
    )

    return NextResponse.json({
      success: true,
      processed: true,
      alreadyProcessed: result.alreadyProcessed,
      call: result.call,
    })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Webhook processing failed' }, { status })
  }
}
