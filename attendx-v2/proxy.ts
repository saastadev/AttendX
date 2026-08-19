// ============================================================
// AttendX v2 — Next.js Proxy (was: middleware)
// Next.js 16 uses 'proxy' file convention and 'proxy' export
// ============================================================

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_ROUTES = [
  '/auth/login',
  '/auth/signup',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/verify',
  '/api/health',
]

const ROLE_ROUTES: Record<string, string[]> = {
  '/admin': ['SUPERADMIN', 'ADMIN'],
  '/hr': ['SUPERADMIN', 'ADMIN', 'HR'],
  '/manager': ['SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'],
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  // Allow public routes
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    if (user && !userError && !pathname.startsWith('/api/')) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return supabaseResponse
  }

  // Pass through all /api/ requests to let API route handlers evaluate session/Bearer tokens
  if (pathname.startsWith('/api/')) {
    return supabaseResponse
  }

  // Redirect unauthenticated users for page routes
  if (!user || userError) {
    const loginUrl = new URL('/auth/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // RBAC check for privileged routes
  const matchedRoute = Object.entries(ROLE_ROUTES).find(([prefix]) =>
    pathname.startsWith(prefix)
  )

  if (matchedRoute) {
    const [, allowedRoles] = matchedRoute

    const activeTenantId =
      (user.app_metadata as Record<string, unknown> | undefined)?.tenant_id

    // Use service role if available for reliable role lookup, falling back to authenticated client
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    let clientForRole = supabase
    if (serviceKey) {
      const { createClient } = await import('@supabase/supabase-js')
      clientForRole = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceKey,
        { auth: { autoRefreshToken: false, persistSession: false } }
      ) as any
    }

    let query = clientForRole.from('user_roles').select('role, tenant_id').eq('user_id', user.id)
    if (typeof activeTenantId === 'string') {
      query = query.eq('tenant_id', activeTenantId)
    }

    const { data: roleRecords, error: roleError } = await query

    if (roleError) {
      console.error('[proxy] role lookup error:', roleError.message)
      return NextResponse.redirect(new URL('/unauthorized', request.url))
    }

    const roles = (roleRecords ?? []).map(r => r.role as string)
    // Also consider role in app_metadata if present
    const appRole = (user.app_metadata as Record<string, unknown> | undefined)?.role as string | undefined
    if (appRole && !roles.includes(appRole)) {
      roles.push(appRole)
    }

    if (!roles.some(role => allowedRoles.includes(role))) {
      console.warn(`[proxy] User ${user.email} with roles [${roles.join(', ')}] denied access to ${pathname}`)
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
