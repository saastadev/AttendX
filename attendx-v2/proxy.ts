// ============================================================
// AttendX v2 — Next.js Proxy (Server Middleware)
// Next.js 16 uses 'proxy' file convention and 'proxy' export
// ============================================================

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { RbacGuard } from '@/lib/auth/rbac-guard'
import { CsrfGuard } from '@/lib/security/csrf-guard'
import type { UserRole } from '@/types/database'

const PUBLIC_ROUTES = [
  '/auth/login',
  '/auth/signup',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/verify',
  '/api/health',
  '/api/auth/invite/verify',
]

const ONBOARDING_ROUTE = '/auth/onboarding'
const ONBOARDING_API_ROUTE = '/api/auth/first-login-password'

const ROLE_ROUTES: Record<string, UserRole[]> = {
  '/admin': ['SUPERADMIN', 'ADMIN'],
  '/hr': ['SUPERADMIN', 'ADMIN', 'HR'],
  '/manager': ['SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'],
}

export async function proxy(request: NextRequest) {
  // 0. Request Correlation & CSRF Validation (BRD §24, §25)
  const correlationId = request.headers.get('x-correlation-id') || crypto.randomUUID()

  if (!CsrfGuard.validateRequestOrigin(request)) {
    return NextResponse.json(
      { error: 'Forbidden: Invalid request origin.', code: 'CSRF_DETECTED' },
      {
        status: 403,
        headers: { 'x-correlation-id': correlationId },
      }
    )
  }

  let supabaseResponse = NextResponse.next({ request })
  supabaseResponse.headers.set('x-correlation-id', correlationId)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://attendx.supabase.co'
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_anon'

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { pathname } = request.nextUrl
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  // 1. Allow unauthenticated public routes
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    if (user && !userError && !pathname.startsWith('/api/')) {
      // If logged in and visiting auth pages, check onboarding before dashboard
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return supabaseResponse
  }

  // 2. Unauthenticated handling for protected routes
  if (!user || userError) {
    if (pathname.startsWith('/api/')) {
      // Pass through unauthenticated API requests to let route handlers return 401 with standard JSON error
      return supabaseResponse
    }
    const loginUrl = new URL('/auth/login', request.url)
    if (pathname !== '/' && !pathname.startsWith('/auth')) {
      loginUrl.searchParams.set('next', pathname)
    }
    return NextResponse.redirect(loginUrl)
  }

  // 3. Server-Side Identity & Active Status Verification
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  let clientForLookup = supabase
  if (serviceKey) {
    const { createClient } = await import('@supabase/supabase-js')
    clientForLookup = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    ) as any
  }

  const { data: profile } = await clientForLookup
    .from('profiles')
    .select('is_active, onboarding_completed, tenant_id')
    .eq('id', user.id)
    .maybeSingle()

  // Rule 3: Fail-closed on deactivated account
  if (profile && profile.is_active === false) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Account is deactivated.', code: 'ACCOUNT_DEACTIVATED' },
        { status: 403 }
      )
    }
    const loginUrl = new URL('/auth/login', request.url)
    loginUrl.searchParams.set('error', 'account_deactivated')
    return NextResponse.redirect(loginUrl)
  }

  // 4. Forced First-Login Password Change Gate (Spec 03 / BRD §3)
  if (profile && profile.onboarding_completed === false) {
    // Allow the onboarding page and the first-login password API endpoint
    if (pathname === ONBOARDING_ROUTE || pathname === ONBOARDING_API_ROUTE) {
      return supabaseResponse
    }

    // Block all other API calls with explicit 403 code
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        {
          error: 'Password change required before accessing platform resources.',
          code: 'ONBOARDING_REQUIRED',
        },
        { status: 403 }
      )
    }

    // Redirect all other pages to /auth/onboarding
    return NextResponse.redirect(new URL(ONBOARDING_ROUTE, request.url))
  }

  // If onboarding is complete, prevent accessing the onboarding page again
  if (pathname === ONBOARDING_ROUTE) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // 5. Multi-Tenant Selection Interception (Scope C / BRD §13, §14)
  const SELECT_TENANT_ROUTE = '/auth/select-tenant'
  if (pathname === SELECT_TENANT_ROUTE) {
    return supabaseResponse
  }

  const activeTenantClaim = (user.app_metadata as Record<string, unknown> | undefined)?.tenant_id as string | undefined

  if (!activeTenantClaim && !pathname.startsWith('/api/')) {
    // Check if user has multiple tenant roles
    const { count } = await clientForLookup
      .from('user_roles')
      .select('tenant_id', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if (count && count > 1) {
      return NextResponse.redirect(new URL(SELECT_TENANT_ROUTE, request.url))
    }
  }

  // 6. Pass through other API requests for route handlers
  if (pathname.startsWith('/api/')) {
    return supabaseResponse
  }

  // 7. Authoritative RBAC check for privileged routes (Spec 14 / Scope D)
  const matchedRoute = Object.entries(ROLE_ROUTES).find(([prefix]) =>
    pathname.startsWith(prefix)
  )

  if (matchedRoute) {
    const [, allowedRoles] = matchedRoute
    const activeTenantId =
      (user.app_metadata as Record<string, unknown> | undefined)?.tenant_id || profile?.tenant_id

    let query = clientForLookup.from('user_roles').select('role, tenant_id').eq('user_id', user.id)
    if (typeof activeTenantId === 'string') {
      query = query.eq('tenant_id', activeTenantId)
    }

    const { data: roleRecords, error: roleError } = await query

    if (roleError || !roleRecords || roleRecords.length === 0) {
      console.warn(`[proxy] User ${user.email} has no active role in tenant ${activeTenantId}, denied access to ${pathname}`)
      return NextResponse.redirect(new URL('/unauthorized', request.url))
    }

    const userRoles = roleRecords.map((r: any) => r.role as UserRole)

    if (!RbacGuard.isAuthorizedForRoute(userRoles, allowedRoles)) {
      console.warn(`[proxy] User ${user.email} with roles [${userRoles.join(', ')}] denied access to ${pathname}`)
      return NextResponse.redirect(new URL('/unauthorized', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-|icons/|images/).*)',
  ],
}
