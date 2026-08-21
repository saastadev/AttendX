import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import crypto from 'node:crypto'
import { z } from 'zod'

const acceptInviteSchema = z.object({
  token: z.string().min(1, 'Invitation token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  full_name: z.string().min(2, 'Full name must be at least 2 characters'),
})

export async function POST(request: NextRequest) {
  let createdAuthUserId: string | null = null
  const admin = getSupabaseServiceClient()

  try {
    const body = await request.json()
    const parseResult = acceptInviteSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { token: rawToken, password, full_name } = parseResult.data
    const token = rawToken.replace(/\s+/g, '').trim()
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

    // 1. Verify invite record
    const { data: invite, error: inviteError } = await admin
      .from('tenant_invites')
      .select('id, tenant_id, email, role, expires_at, used_at, revoked_at, tenant:tenants(name)')
      .eq('token_hash', tokenHash)
      .maybeSingle()

    if (inviteError || !invite) {
      return NextResponse.json(
        { error: 'Invalid or unrecognized invitation token.' },
        { status: 400 }
      )
    }

    if (invite.used_at) {
      return NextResponse.json(
        { error: 'This invitation has already been accepted.' },
        { status: 400 }
      )
    }

    if (invite.revoked_at) {
      return NextResponse.json(
        { error: 'This invitation has been revoked by an administrator.' },
        { status: 400 }
      )
    }

    if (new Date(invite.expires_at) <= new Date()) {
      return NextResponse.json(
        { error: 'This invitation has expired. Please request a new one.' },
        { status: 400 }
      )
    }

    const normalizedEmail = invite.email.toLowerCase().trim()

    // 2. Create Auth user with server-authoritative app_metadata
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      app_metadata: {
        tenant_id: invite.tenant_id,
        role: invite.role,
      },
      user_metadata: {
        full_name: full_name.trim(),
      },
    })

    if (authError || !authData.user) {
      if (authError?.message?.includes('already been registered') || authError?.status === 422 || (authError as any)?.code === 'email_exists') {
        // Look up existing user and update credentials + metadata
        const { data: usersData } = await admin.auth.admin.listUsers()
        const existingUser = usersData?.users?.find(u => u.email?.toLowerCase() === normalizedEmail)

        if (existingUser) {
          createdAuthUserId = existingUser.id
          await admin.auth.admin.updateUserById(existingUser.id, {
            password,
            app_metadata: {
              ...(existingUser.app_metadata || {}),
              tenant_id: invite.tenant_id,
              role: invite.role,
            },
            user_metadata: {
              ...(existingUser.user_metadata || {}),
              full_name: full_name.trim(),
            },
          })
        } else {
          return NextResponse.json(
            { error: 'An account with this email address already exists. Please log in.' },
            { status: 409 }
          )
        }
      } else {
        console.error('[Invite Accept] Auth user creation error:', authError)
        return NextResponse.json(
          { error: authError?.message || 'Failed to create user account.' },
          { status: 500 }
        )
      }
    } else {
      createdAuthUserId = authData.user.id
    }

    // 3. Provision profile
    const { error: profileError } = await admin.from('profiles').upsert({
      id: createdAuthUserId,
      tenant_id: invite.tenant_id,
      email: normalizedEmail,
      full_name: full_name.trim(),
      is_active: true,
      face_enrolled: false,
      onboarding_completed: true,
    })

    if (profileError) {
      console.error('[Invite Accept] Profile provisioning error:', profileError)
      await admin.auth.admin.deleteUser(createdAuthUserId)
      return NextResponse.json(
        { error: 'Failed to complete profile creation. No partial data was created.' },
        { status: 500 }
      )
    }

    // 4. Provision user role
    const { error: roleError } = await admin.from('user_roles').upsert({
      user_id: createdAuthUserId,
      tenant_id: invite.tenant_id,
      role: invite.role,
      assigned_at: new Date().toISOString(),
    }, { onConflict: 'user_id,tenant_id' })

    if (roleError) {
      console.error('[Invite Accept] Role provisioning error:', roleError)
      await admin.from('profiles').delete().eq('id', createdAuthUserId)
      await admin.auth.admin.deleteUser(createdAuthUserId)
      return NextResponse.json(
        { error: 'Failed to assign role. No partial data was created.' },
        { status: 500 }
      )
    }

    // 5. Mark invite as used
    const { error: inviteUpdateError } = await admin
      .from('tenant_invites')
      .update({ used_at: new Date().toISOString() })
      .eq('id', invite.id)

    if (inviteUpdateError) {
      console.error('[Invite Accept] Invite update error:', inviteUpdateError)
      await admin.from('user_roles').delete().eq('user_id', createdAuthUserId)
      await admin.from('profiles').delete().eq('id', createdAuthUserId)
      await admin.auth.admin.deleteUser(createdAuthUserId)
      return NextResponse.json(
        { error: 'Failed to finalize invitation. No partial data was created.' },
        { status: 500 }
      )
    }

    // 6. Audit log entry
    const { error: auditError } = await admin.from('audit_log').insert({
      tenant_id: invite.tenant_id,
      actor_id: createdAuthUserId,
      action: 'INVITE_ACCEPTED',
      table_name: 'tenant_invites',
      record_id: invite.id,
      new_data: {
        email: invite.email,
        role: invite.role,
        user_id: createdAuthUserId,
      },
    })
    if (auditError) {
      console.warn('[Invite Accept] Non-fatal audit log warning:', auditError)
    }

    const tenantInfo = invite.tenant as any

    return NextResponse.json({
      success: true,
      message: 'Account registered successfully. Please log in.',
      tenant_name: tenantInfo?.name || 'AttendX Organization',
    })
  } catch (error: any) {
    console.error('[Invite Accept] Fatal error:', error)
    // Emergency Compensating Rollback
    if (createdAuthUserId) {
      try {
        await admin.auth.admin.deleteUser(createdAuthUserId)
      } catch (rollbackErr) {
        console.error('[Invite Accept] Rollback failed:', rollbackErr)
      }
    }
    return NextResponse.json(
      { error: 'An unexpected error occurred during account registration.' },
      { status: 500 }
    )
  }
}
