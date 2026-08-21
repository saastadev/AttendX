import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { z } from 'zod'

const loginSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
  next: z.string().optional(),
})

const ROLE_PRIORITY_MAP: Record<string, number> = {
  SUPERADMIN: 1,
  ADMIN: 2,
  HR: 3,
  MANAGER: 4,
  EMPLOYEE: 5,
}

const ROLE_DEFAULT_DESTINATION: Record<string, string> = {
  SUPERADMIN: '/admin/users',
  ADMIN: '/admin/users',
  HR: '/hr/directory',
  MANAGER: '/manager/team',
  EMPLOYEE: '/dashboard',
}

const ROLE_ROUTE_PERMISSIONS: Record<string, string[]> = {
  SUPERADMIN: ['/admin', '/hr', '/manager', '/dashboard', '/attendance', '/leave', '/cases', '/profile', '/copilot', '/performance', '/recognition', '/notifications'],
  ADMIN: ['/admin', '/hr', '/manager', '/dashboard', '/attendance', '/leave', '/cases', '/profile', '/copilot', '/performance', '/recognition', '/notifications'],
  HR: ['/hr', '/manager', '/dashboard', '/attendance', '/leave', '/cases', '/profile', '/copilot', '/performance', '/recognition', '/notifications'],
  MANAGER: ['/manager', '/dashboard', '/attendance', '/leave', '/cases', '/profile', '/copilot', '/performance', '/recognition', '/notifications'],
  EMPLOYEE: ['/dashboard', '/attendance', '/leave', '/cases', '/profile', '/copilot', '/performance', '/recognition', '/notifications'],
}

function resolveSafeDestination(primaryRole: string, requestedNext?: string): string {
  const defaultDest = ROLE_DEFAULT_DESTINATION[primaryRole] || '/dashboard'
  if (!requestedNext || !requestedNext.startsWith('/') || requestedNext.startsWith('//')) {
    return defaultDest
  }

  // Prevent redirect loops to auth pages
  if (requestedNext.startsWith('/auth')) {
    return defaultDest
  }

  const allowedPrefixes = ROLE_ROUTE_PERMISSIONS[primaryRole] || ['/dashboard']
  const isAllowed = allowedPrefixes.some(prefix => requestedNext.startsWith(prefix))

  return isAllowed ? requestedNext : defaultDest
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parseResult = loginSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid email or password format.' },
        { status: 400 }
      )
    }

    const { email, password, next: requestedNext } = parseResult.data
    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    const cleanEmail = email.trim().toLowerCase()

    // 0. Sliding Window Rate Limiting (5 failed attempts per 15 min)
    const { RateLimiter } = await import('@/lib/auth/rate-limiter')
    const rateLimitKey = RateLimiter.generateKey('login', clientIp, cleanEmail)
    const rateStatus = RateLimiter.check(rateLimitKey, 5, 15 * 60 * 1000)

    if (!rateStatus.allowed) {
      return NextResponse.json(
        {
          error: 'Too many failed login attempts. Account temporarily throttled for security.',
          code: 'RATE_LIMIT_EXCEEDED',
          retry_after_seconds: rateStatus.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(rateStatus.retryAfterSeconds) },
        }
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    const cookiesToApply: Array<{ name: string; value: string; options: any }> = []
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            cookiesToApply.push({ name, value, options })
          })
        },
      },
    })

    // 1. Authenticate with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    })

    if (authError || !authData.user) {
      RateLimiter.recordFailure(rateLimitKey)
      return NextResponse.json(
        { error: 'Invalid email or password.', code: 'UNAUTHENTICATED' },
        { status: 401 }
      )
    }

    RateLimiter.reset(rateLimitKey)

    const user = authData.user
    const admin = getSupabaseServiceClient()

    // 2. Fetch authoritative profile and active tenant
    const [profileRes, rolesRes] = await Promise.all([
      admin.from('profiles').select('id, tenant_id, is_active, onboarding_completed, full_name, email').eq('id', user.id).maybeSingle(),
      admin.from('user_roles').select('role, tenant_id').eq('user_id', user.id),
    ])

    const profile = profileRes.data
    const roleRecords = rolesRes.data ?? []

    // 3. Rule 3: Fail-closed on missing profile or deactivated account
    if (!profile) {
      return NextResponse.json(
        { error: 'User profile not found. Please contact your organization administrator.', code: 'UNPROVISIONED' },
        { status: 403 }
      )
    }

    if (profile.is_active === false) {
      // Inactive user: immediately invalidate session globally in GoTrue and client
      try {
        await (admin.auth.admin as any).signOut(user.id, 'global')
      } catch {
        // Fallback to client signOut
        await supabase.auth.signOut()
      }
      return NextResponse.json(
        { error: 'Your account has been deactivated. Please contact your administrator.', code: 'ACCOUNT_DEACTIVATED' },
        { status: 403 }
      )
    }

    // Record session in active_sessions
    try {
      const { SessionManager } = await import('@/lib/auth/session-manager')
      const token = authData.session?.access_token || user.id
      await SessionManager.registerSession({
        userId: user.id,
        tenantId: profile.tenant_id,
        authSessionId: (authData.session as any)?.id || null,
        sessionToken: token,
        uaString: request.headers.get('user-agent') || '',
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
      })
    } catch {
      // Non-blocking
    }

    // 4. Check for first-login password change / onboarding requirement
    if (profile.onboarding_completed === false) {
      const response = NextResponse.json({
        success: true,
        destination: '/auth/onboarding',
        onboarding_required: true,
        user: {
          id: user.id,
          email: profile.email,
          full_name: profile.full_name,
        },
      })
      cookiesToApply.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, options)
      })
      return response
    }

    // 5. Authoritative Server-Side Role Resolution with multi-role precedence
    const userRoles = roleRecords.map(r => r.role as string)
    // Add app_metadata role fallback if present
    const appMetadataRole = (user.app_metadata as Record<string, unknown> | undefined)?.role as string | undefined
    if (appMetadataRole && !userRoles.includes(appMetadataRole)) {
      userRoles.push(appMetadataRole)
    }

    const sortedRoles = userRoles.sort(
      (a, b) => (ROLE_PRIORITY_MAP[a] || 99) - (ROLE_PRIORITY_MAP[b] || 99)
    )
    const primaryRole = sortedRoles[0] || 'EMPLOYEE'

    // 6. Safe destination calculation
    const destination = resolveSafeDestination(primaryRole, requestedNext)

    const response = NextResponse.json({
      success: true,
      destination,
      role: primaryRole,
      roles: sortedRoles,
      tokens: authData.session ? {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
      } : undefined,
      user: {
        id: user.id,
        email: profile.email,
        full_name: profile.full_name,
        tenant_id: profile.tenant_id,
      },
    })

    cookiesToApply.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options)
    })

    return response
  } catch (error: any) {
    console.error('[Login API] Error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred during authentication.' },
      { status: 500 }
    )
  }
}
