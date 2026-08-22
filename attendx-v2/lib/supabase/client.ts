// ============================================================
// AttendX v2 — Supabase Client
// Singleton browser client + server client factory
// ============================================================

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseConfig } from '@/lib/env'

// Browser-side singleton
let _browserClient: SupabaseClient | null = null

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (_browserClient) {
    return _browserClient
  }

  const config = getSupabaseConfig()
  if (!config) {
    console.warn('[supabase] Missing Supabase config in browser; returning null client.')
    return null
  }

  _browserClient = createBrowserClient(config.url, config.anonKey)
  return _browserClient
}

// Alias used throughout client components
export const supabase = typeof window !== 'undefined'
  ? getSupabaseBrowserClient()
  : null as unknown as SupabaseClient | null
