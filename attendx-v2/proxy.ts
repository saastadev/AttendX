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
    if (user && !userError) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return supabaseResponse
  }

  // Redirect unauthenticated users
  if (!user || userError) {
    const loginUrl = new URL('/auth/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // RBAC check for privileged routes
  const matchedRoute = Object.entries(ROLE_ROUTES).find(([prefix]) =>
    pathname.startsWith(prefix)
  )

  // Optimistic RBAC gate only. Per the Next.js docs, proxy must not be the
  // authorization boundary -- RLS in Postgres is. This just avoids rendering
  // a privileged shell the user can't populate.
  if (matchedRoute) {
    const [, allowedRoles] = matchedRoute

    // A user may hold roles in more than one tenant, so this must not use
    // .single() (which errors on multiple rows and would deny a legitimate
    // user). Prefer the active tenant claim when the session carries one.
    const activeTenantId =
      (user.app_metadata as Record<string, unknown> | undefined)?.tenant_id

    let query = supabase.from('user_roles').select('role').eq('user_id', user.id)
    if (typeof activeTenantId === 'string') {
      query = query.eq('tenant_id', activeTenantId)
    }

    const { data: roleRecords, error: roleError } = await query

    if (roleError) {
      console.error('[proxy] role lookup failed:', roleError.message)
      return NextResponse.redirect(new URL('/unauthorized', request.url))
    }

    const roles = (roleRecords ?? []).map(r => r.role as string)
    if (!roles.some(role => allowedRoles.includes(role))) {
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
