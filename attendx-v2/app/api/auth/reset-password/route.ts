// ============================================================
// AttendX v2 — Reset Password API Route
// POST /api/auth/reset-password
// Single-use token consumption, credential update & session revocation
// ============================================================

import { NextResponse, type NextRequest } from 'next/server'
import crypto from 'crypto'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { RateLimiter } from '@/lib/auth/rate-limiter'
import type { ResetPasswordRequest, ResetPasswordResponse } from '@/types/database'

function validatePasswordComplexity(password: string): { valid: boolean; message?: string } {
  if (!password || password.length < 10) {
    return { valid: false, message: 'Password must be at least 10 characters long.' }
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter.' }
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter.' }
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number.' }
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one special character.' }
  }
  return { valid: true }
}

export async function POST(req: NextRequest) {
  try {
    const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    const body: ResetPasswordRequest = await req.json().catch(() => ({}))
    const { token, new_password, confirm_password } = body

    if (!token) {
      return NextResponse.json({ error: 'Reset token is required.' }, { status: 400 })
    }

    if (!new_password || !confirm_password) {
      return NextResponse.json({ error: 'Password and confirmation are required.' }, { status: 400 })
    }

    if (new_password !== confirm_password) {
      return NextResponse.json({ error: 'Passwords do not match.' }, { status: 400 })
    }

    const validation = validatePasswordComplexity(new_password)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.message }, { status: 400 })
    }

    // 1. Rate Limiting Check
    const rateLimitKey = RateLimiter.generateKey('reset-password', clientIp)
    const rateStatus = RateLimiter.check(rateLimitKey, 5, 15 * 60 * 1000)

    if (!rateStatus.allowed) {
      return NextResponse.json(
        {
          error: 'Too many password reset attempts. Please try again later.',
          code: 'RATE_LIMIT_EXCEEDED',
          retry_after_seconds: rateStatus.retryAfterSeconds,
        },
        { status: 429 }
      )
    }

    const serviceClient = getSupabaseServiceClient()
    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex')

    // 2. Query Single-Use Reset Record
    const { data: resetRow, error: resetErr } = await serviceClient
      .from('password_resets')
      .select('*')
      .eq('token_hash', tokenHash)
      .maybeSingle()

    if (resetErr || !resetRow) {
      RateLimiter.recordFailure(rateLimitKey)
      return NextResponse.json(
        { error: 'Invalid or expired password reset link.', code: 'INVALID_TOKEN' },
        { status: 400 }
      )
    }

    // Check if token was already used (Edge Case 6)
    if (resetRow.used_at) {
      RateLimiter.recordFailure(rateLimitKey)
      return NextResponse.json(
        { error: 'This password reset link has already been used.', code: 'TOKEN_ALREADY_USED' },
        { status: 400 }
      )
    }

    // Check if token has expired (Edge Case 5)
    if (new Date(resetRow.expires_at).getTime() < Date.now()) {
      RateLimiter.recordFailure(rateLimitKey)
      return NextResponse.json(
        { error: 'This password reset link has expired (15 minute validity).', code: 'TOKEN_EXPIRED' },
        { status: 400 }
      )
    }

    // 3. Update User Password in GoTrue
    const { error: updateAuthErr } = await serviceClient.auth.admin.updateUserById(
      resetRow.user_id,
      { password: new_password }
    )

    if (updateAuthErr) {
      console.error('[Reset-Password] GoTrue update error:', updateAuthErr.message)
      return NextResponse.json(
        { error: 'Failed to update credentials. Please try again.' },
        { status: 500 }
      )
    }

    // 4. Mark token as consumed atomically
    await serviceClient
      .from('password_resets')
      .update({ used_at: new Date().toISOString() })
      .eq('id', resetRow.id)

    // 5. Global Session Invalidation: Revoke all existing sessions
    await serviceClient
      .from('active_sessions')
      .update({
        is_revoked: true,
        revoked_at: new Date().toISOString(),
      })
      .eq('user_id', resetRow.user_id)

    try {
      await (serviceClient.auth.admin as any).signOut(resetRow.user_id, 'global')
    } catch (err: any) {
      console.warn('[Reset-Password] Global sign-out notice:', err.message)
    }

    // 6. Write Audit Log (Rule 5: Zero Passwords)
    await serviceClient.from('audit_log').insert({
      tenant_id: resetRow.tenant_id,
      actor_id: resetRow.user_id,
      action: 'PASSWORD_RESET_COMPLETED',
      table_name: 'profiles',
      record_id: resetRow.user_id,
      new_data: {
        reset_id: resetRow.id,
        ip: clientIp,
        user_agent: req.headers.get('user-agent') || '',
        reset_at: new Date().toISOString(),
      },
    })

    RateLimiter.reset(rateLimitKey)

    const responseData: ResetPasswordResponse = {
      success: true,
      message: 'Password updated successfully. Please log in with your new password.',
      redirect_url: '/auth/login',
    }

    return NextResponse.json(responseData)
  } catch (err: any) {
    console.error('[Reset-Password] Error:', err.message)
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}
