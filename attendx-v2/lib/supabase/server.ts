// ============================================================
// AttendX v2 — Supabase Server Client (App Router)
// ============================================================

import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { requireSupabaseConfig, requireServiceRoleKey } from '@/lib/env'
import { isDevMockSupabase, allowDemoAuthentication, isPrivilegedSpyAllowed } from './config'

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
  if (isPrivilegedSpyAllowed()) {
    try {
      const fs = require('node:fs')
      const spyPath = process.env.ATTENDX_TEST_PRIVILEGED_SPY!.trim()
      const stackLines = (new Error().stack || '')
        .split('\n')
        .slice(2, 4)
        .map((line: string) => line.trim())
        .join(' -> ')
      fs.appendFileSync(
        spyPath,
        `ACQUIRED:${new Date().toISOString()} | CALLER:${stackLines}\n`
      )
    } catch {
      // test observation best effort
    }
  }

  if (isDevMockSupabase()) {
    throw new Error('DEV_MOCK_SUPABASE_OFFLINE: Local development mode with mock store')
  }
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

export { isDevMockSupabase, allowDemoAuthentication, isPrivilegedSpyAllowed } from './config'
