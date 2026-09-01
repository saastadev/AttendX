// ============================================================
// AttendX v2 — Supabase Server Client (App Router)
// ============================================================

import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { requireSupabaseConfig, requireServiceRoleKey } from '@/lib/env'

export async function getSupabaseServerClient() {
  const cookieStore = await cookies()
  const { url, anonKey } = requireSupabaseConfig()

  return createServerClient(
    url,
    anonKey,
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
export function getSupabaseServiceClient(): SupabaseClient {
  const { url } = requireSupabaseConfig()
  const serviceKey = requireServiceRoleKey()
  return createClient(
    url,
    serviceKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
