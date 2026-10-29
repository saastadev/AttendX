// ============================================================
// AttendX v2 — Webhook: /api/webhooks/resend
// Ingests verified Resend email delivery events (delivered, bounced, opened)
// Idempotent, timing-safe Svix signature validation, Zero Fabrication.
// ============================================================

import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { mockHiringStore } from '@/lib/hiring/mock-store'
import { getSupabaseServiceClient } from '@/lib/supabase/server'

// In-memory processed webhook event cache for idempotency
const processedWebhookEvents = new Set<string>()

// Status mapping for Resend event types
const EVENT_STATUS_MAP: Record<string, string> = {
  'email.sent': 'SENT',
  'email.delivered': 'DELIVERED',
  'email.delivery_delayed': 'PENDING_DELIVERY',
  'email.bounced': 'BOUNCED',
  'email.complained': 'FAILED',
  'email.opened': 'OPENED',
  'email.clicked': 'CLICKED',
}

function verifyResendSignature(
  payload: string,
  headers: Headers,
  secret: string
): boolean {
  const svixId = headers.get('svix-id')
  const svixTimestamp = headers.get('svix-timestamp')
  const svixSignature = headers.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return false
  }

  // Prevent replay attacks (tolerance: 5 minutes)
  const timestamp = parseInt(svixTimestamp, 10)
  const now = Math.floor(Date.now() / 1000)
  if (isNaN(timestamp) || Math.abs(now - timestamp) > 300) {
    return false
  }

  // Handle whsec_ prefix (base64 encoded key) or raw string key
  const secretKey = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice(6), 'base64')
    : Buffer.from(secret)

  const toSign = `${svixId}.${svixTimestamp}.${payload}`
  const expectedSignature = crypto
    .createHmac('sha256', secretKey)
    .update(toSign)
    .digest('base64')

  const signatures = svixSignature.split(' ')
  for (const sig of signatures) {
    const [version, signature] = sig.split(',')
    if (version === 'v1' && signature) {
      try {
        const expectedBuf = Buffer.from(expectedSignature)
        const actualBuf = Buffer.from(signature)
        if (
          expectedBuf.length === actualBuf.length &&
          crypto.timingSafeEqual(expectedBuf, actualBuf)
        ) {
          return true
        }
      } catch {
        continue
      }
    }
  }

  return false
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text()
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET

    // Signature verification (when RESEND_WEBHOOK_SECRET is configured)
    if (webhookSecret) {
      const isValid = verifyResendSignature(rawBody, request.headers, webhookSecret)
      if (!isValid) {
        return NextResponse.json(
          { error: 'Invalid webhook signature.' },
          { status: 401 }
        )
      }
    }

    let payload: any
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 })
    }

    const eventId =
      request.headers.get('svix-id') ||
      payload.id ||
      `${payload.data?.email_id || 'unknown'}_${payload.type}`

    // Idempotency check: discard already-processed event IDs
    if (processedWebhookEvents.has(eventId)) {
      return NextResponse.json({
        success: true,
        duplicate: true,
        message: 'Event already processed.',
      })
    }

    const eventType = payload.type
    const emailId = payload.data?.email_id || payload.data?.id
    const mappedStatus = EVENT_STATUS_MAP[eventType]

    if (mappedStatus && emailId) {
      // 1. Update in mock hiring store if match found
      for (const interview of mockHiringStore.interviews) {
        if (
          interview.notes?.includes(emailId) ||
          interview.invitation_subject?.includes(emailId)
        ) {
          interview.invitation_status = mappedStatus
          interview.updated_at = new Date().toISOString()
        }
      }

      // 2. Update in Supabase database if connected
      try {
        const serviceClient = getSupabaseServiceClient()
        await serviceClient
          .from('interviews')
          .update({
            notes: `Delivery Event: ${mappedStatus} (Updated via Resend Webhook ${eventType})`,
          })
          .ilike('notes', `%${emailId}%`)
      } catch {
        // Non-fatal table fallback
      }
    }

    // Mark event as processed
    processedWebhookEvents.add(eventId)

    // Keep event set bounded (max 10,000 items)
    if (processedWebhookEvents.size > 10000) {
      const iter = processedWebhookEvents.values()
      for (let i = 0; i < 2000; i++) {
        const next = iter.next()
        if (next.done) break
        processedWebhookEvents.delete(next.value)
      }
    }

    return NextResponse.json({
      success: true,
      processed: true,
      event: eventType,
      email_id: emailId || null,
      status: mappedStatus || 'UNRECOGNIZED',
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Webhook processing failed.' },
      { status: 500 }
    )
  }
}
