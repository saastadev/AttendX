import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import crypto from 'node:crypto'
import { z } from 'zod'

const createInviteSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['SUPERADMIN', 'ADMIN', 'HR', 'MANAGER', 'EMPLOYEE']),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const admin = getSupabaseServiceClient()

    // 1. Authenticate caller server-side
    let supabaseResponse = NextResponse.next({ request })
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    })

    let { data: { user }, error: userError } = await supabase.auth.getUser()

    if (!user || userError) {
      const authHeader = request.headers.get('Authorization')
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7)
        const { data: userData } = await admin.auth.getUser(token)
        if (userData?.user) {
          user = userData.user
          userError = null
        }
      }
    }

    if (!user || userError) {
      return NextResponse.json({ error: 'Unauthorized: Authentication required' }, { status: 401 })
    }

    // 2. Resolve caller profile and roles server-side
    const [profileRes, rolesRes] = await Promise.all([
      admin.from('profiles').select('id, tenant_id, is_active').eq('id', user.id).maybeSingle(),
      admin.from('user_roles').select('role, tenant_id').eq('user_id', user.id),
    ])

    const callerProfile = profileRes.data
    const callerRoles = (rolesRes.data ?? []).map(r => r.role)

    if (!callerProfile || !callerProfile.is_active) {
      return NextResponse.json({ error: 'Forbidden: Account is inactive or unprovisioned' }, { status: 403 })
    }

    const isAuthorized = callerRoles.some(r => ['SUPERADMIN', 'ADMIN', 'HR'].includes(r))
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Forbidden: Insufficient permissions to create invitations' }, { status: 403 })
    }

    // 3. Parse & Validate request body
    const body = await request.json()
    const parseResult = createInviteSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { email, role, metadata = {} } = parseResult.data
    const tenantId = callerProfile.tenant_id

    // 4. Generate 256-bit cryptographically secure token & SHA-256 hash
    const rawToken = crypto.randomBytes(32).toString('base64url')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString() // 72 hours

    // 5. Insert invite record
    const { data: invite, error: insertError } = await admin
      .from('tenant_invites')
      .insert({
        tenant_id: tenantId,
        email: email.toLowerCase().trim(),
        role,
        token_hash: tokenHash,
        invited_by: callerProfile.id,
        expires_at: expiresAt,
        metadata,
      })
      .select('id, expires_at')
      .single()

    if (insertError) {
      console.error('[Invite Create] Database insertion error:', insertError)
      return NextResponse.json({ error: 'Failed to create invitation record' }, { status: 500 })
    }

    // 6. Write audit log
    await admin.from('audit_log').insert({
      tenant_id: tenantId,
      actor_id: callerProfile.id,
      action: 'INVITE_CREATED',
      table_name: 'tenant_invites',
      record_id: invite.id,
      new_data: {
        email,
        role,
        expires_at: expiresAt,
      },
    })

    const origin = request.nextUrl.origin || 'http://localhost:3000'
    const inviteUrl = `${origin}/auth/signup?token=${rawToken}`

    return NextResponse.json(
      {
        success: true,
        invite_id: invite.id,
        invite_url: inviteUrl,
        expires_at: invite.expires_at,
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('[Invite Create] Unhandled error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
