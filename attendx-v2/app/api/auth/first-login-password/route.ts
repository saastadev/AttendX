// ============================================================
// AttendX v2 — First-Login Forced Password Change Handler
// POST /api/auth/first-login-password
// Enforces password complexity, GoTrue credential update,
// and profiles.onboarding_completed = true transition.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server'
import type { FirstLoginPasswordRequest, FirstLoginPasswordResponse } from '@/types/database'

// Password Complexity Validator
function validatePassword(password: string): { valid: boolean; message?: string } {
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

export async function POST(request: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()

    if (!user || authErr) {
      return NextResponse.json(
        { success: false, error: 'Authentication required.' },
        { status: 401 }
      )
    }

    const body: FirstLoginPasswordRequest = await request.json()
    const { new_password, confirm_password } = body

    if (!new_password || !confirm_password) {
      return NextResponse.json(
        { success: false, error: 'New password and confirmation are required.' },
        { status: 400 }
      )
    }

    if (new_password !== confirm_password) {
      return NextResponse.json(
        { success: false, error: 'Passwords do not match.' },
        { status: 400 }
      )
    }

    const validation = validatePassword(new_password)
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.message },
        { status: 400 }
      )
    }

    const serviceClient = getSupabaseServiceClient()

    // 1. Authoritative Profile Verification
    const { data: profile, error: profileErr } = await serviceClient
      .from('profiles')
      .select('id, tenant_id, is_active, onboarding_completed')
      .eq('id', user.id)
      .maybeSingle()

    if (profileErr || !profile) {
      return NextResponse.json(
        { success: false, error: 'User profile not found.' },
        { status: 404 }
      )
    }

    // Fail closed if deactivated
    if (profile.is_active === false) {
      return NextResponse.json(
        { success: false, error: 'Account is deactivated.', code: 'ACCOUNT_DEACTIVATED' },
        { status: 403 }
      )
    }

    // Check if onboarding is already completed
    if (profile.onboarding_completed === true) {
      return NextResponse.json(
        { success: false, error: 'Onboarding has already been completed.' },
        { status: 400 }
      )
    }

    // 2. Update Password in GoTrue via Admin API
    const { error: updateAuthErr } = await serviceClient.auth.admin.updateUserById(user.id, {
      password: new_password,
    })

    if (updateAuthErr) {
      console.error('[First-Login Password] GoTrue update error:', updateAuthErr.message)
      return NextResponse.json(
        { success: false, error: 'Failed to update credentials. Please try again.' },
        { status: 500 }
      )
    }

    // 3. Update profiles.onboarding_completed = true
    const { error: updateProfileErr } = await serviceClient
      .from('profiles')
      .update({
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (updateProfileErr) {
      console.error('[First-Login Password] Profile update error:', updateProfileErr.message)
      return NextResponse.json(
        { success: false, error: 'Failed to complete onboarding profile update.' },
        { status: 500 }
      )
    }

    // 4. Invalidate all older sessions if active_sessions table exists
    try {
      await serviceClient
        .from('active_sessions')
        .update({
          is_revoked: true,
          revoked_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('is_revoked', false)
    } catch {
      // Non-blocking if table is not yet migrated
    }

    // 5. Write immutable audit log entry (Rule 5: Zero Passwords)
    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    const clientUa = request.headers.get('user-agent') || 'unknown'

    await serviceClient.from('audit_log').insert({
      tenant_id: profile.tenant_id,
      actor_id: user.id,
      action: 'PASSWORD_CHANGED_ONBOARDING',
      table_name: 'profiles',
      record_id: user.id,
      new_data: {
        onboarding_completed: true,
        ip: clientIp,
        user_agent: clientUa,
      },
    })

    // 6. Resolve role landing destination
    const { data: roles } = await serviceClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', profile.tenant_id)

    const roleList = (roles || []).map((r: { role: string }) => r.role)
    let redirectUrl = '/dashboard'

    if (roleList.includes('SUPERADMIN') || roleList.includes('ADMIN')) {
      redirectUrl = '/admin'
    } else if (roleList.includes('HR')) {
      redirectUrl = '/hr'
    } else if (roleList.includes('MANAGER')) {
      redirectUrl = '/manager'
    }

    const responseData: FirstLoginPasswordResponse = {
      success: true,
      message: 'Password updated successfully. Onboarding completed.',
      redirect_url: redirectUrl,
    }

    return NextResponse.json(responseData)
  } catch (err: any) {
    console.error('[First-Login Password] Unexpected error:', err)
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred.' },
      { status: 500 }
    )
  }
}
