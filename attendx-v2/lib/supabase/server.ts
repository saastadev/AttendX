// ============================================================
// AttendX v2 — Supabase Server Client (App Router)
// ============================================================

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSupabaseConfig } from '@/lib/env'

export async function getSupabaseServerClient() {
  const cookieStore = await cookies()
  const config = getSupabaseConfig()

  if (!config) {
    console.warn('[supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY; returning null client.')
    return null
  }

  return createServerClient(
    config.url,
    config.anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server component — cookies can't be set in render, handled in middleware
          }
        },
      },
    }
  )
}

// Service role client for Edge Function-equivalent server actions
// Only used in Server Actions / Route Handlers, never exposed to client
export function getSupabaseServiceClient() {
  const config = getSupabaseConfig()
  if (!config) {
    console.warn('[supabase] Missing Supabase configuration; service client unavailable.')
    return null
  }

  const { createClient } = require('@supabase/supabase-js')
  return createClient(
    config.url,
    process.env.SUPABASE_SERVICE_ROLE_KEY || config.anonKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
