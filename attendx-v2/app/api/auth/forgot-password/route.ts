// ============================================================
// AttendX v2 — Forgot Password API Route
// POST /api/auth/forgot-password
// Generates single-use 15-minute cryptographic reset token
// ============================================================

import { NextResponse, type NextRequest } from 'next/server'
import crypto from 'crypto'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { RateLimiter } from '@/lib/auth/rate-limiter'
import type { ForgotPasswordRequest, ForgotPasswordResponse } from '@/types/database'

export async function POST(req: NextRequest) {
  try {
    const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    const body: ForgotPasswordRequest = await req.json().catch(() => ({}))
    const email = body?.email?.trim().toLowerCase()

    if (!email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
    }

    // 1. Sliding Window Rate Limiting (5 attempts per 15 min)
    const rateLimitKey = RateLimiter.generateKey('forgot-password', clientIp, email)
    const rateStatus = RateLimiter.check(rateLimitKey, 5, 15 * 60 * 1000)

    if (!rateStatus.allowed) {
      return NextResponse.json(
        {
          error: 'Too many password reset requests. Please try again later.',
          code: 'RATE_LIMIT_EXCEEDED',
          retry_after_seconds: rateStatus.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(rateStatus.retryAfterSeconds) },
        }
      )
    }

    RateLimiter.recordFailure(rateLimitKey)

    const serviceClient = getSupabaseServiceClient()

    // 2. Query user profile (fail safe without leaking existence)
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('id, tenant_id, is_active')
      .eq('email', email)
      .maybeSingle()

    if (profile && profile.is_active) {
      // 3. Generate 256-bit cryptographic token
      const rawToken = crypto.randomBytes(32).toString('base64url')
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15-min TTL

      await serviceClient.from('password_resets').insert({
        user_id: profile.id,
        tenant_id: profile.tenant_id,
        token_hash: tokenHash,
        expires_at: expiresAt,
        ip_address: clientIp,
        user_agent: req.headers.get('user-agent') || '',
      })

      // In production, send reset email containing link with rawToken
      console.log(`[Forgot-Password] Generated reset token for ${email}: (Token expires in 15 mins)`)
    }

    const responseData: ForgotPasswordResponse = {
      success: true,
      message: 'If an account exists with this email address, password reset instructions have been generated.',
    }

    return NextResponse.json(responseData)
  } catch (err: any) {
    console.error('[Forgot-Password] Error:', err.message)
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}
