import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import crypto from 'node:crypto'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const rawToken = searchParams.get('token')
    const token = rawToken ? rawToken.replace(/\s+/g, '').trim() : null

    if (!token || token === '') {
      return NextResponse.json(
        { valid: false, error: 'Invitation token is missing or invalid.' },
        { status: 400 }
      )
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const admin = getSupabaseServiceClient()

    const { data: invite, error } = await admin
      .from('tenant_invites')
      .select('id, email, role, expires_at, used_at, revoked_at, tenant:tenants(name, app_name, accent_color)')
      .eq('token_hash', tokenHash)
      .maybeSingle()

    if (error || !invite) {
      return NextResponse.json(
        { valid: false, error: 'Invitation is invalid or does not exist.' },
        { status: 400 }
      )
    }

    if (invite.used_at) {
      return NextResponse.json(
        { valid: false, error: 'This invitation has already been used.' },
        { status: 400 }
      )
    }

    if (invite.revoked_at) {
      return NextResponse.json(
        { valid: false, error: 'This invitation has been revoked.' },
        { status: 400 }
      )
    }

    if (new Date(invite.expires_at) <= new Date()) {
      return NextResponse.json(
        { valid: false, error: 'This invitation has expired.' },
        { status: 400 }
      )
    }

    const tenantInfo = invite.tenant as any

    return NextResponse.json({
      valid: true,
      email: invite.email,
      role: invite.role,
      tenant_name: tenantInfo?.name || 'AttendX Organization',
      accent_color: tenantInfo?.accent_color || null,
    })
  } catch (error: any) {
    console.error('[Invite Verify] Error:', error)
    return NextResponse.json(
      { valid: false, error: 'Failed to verify invitation token.' },
      { status: 500 }
    )
  }
}
