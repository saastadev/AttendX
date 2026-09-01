// ============================================================
// AttendX v2 — Supabase Client
// Singleton browser client + server client factory
// ============================================================

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireSupabaseConfig } from '@/lib/env'

// Browser-side singleton
let _browserClient: SupabaseClient | null = null

export function getSupabaseBrowserClient(): SupabaseClient {
  if (!_browserClient) {
    const { url, anonKey } = requireSupabaseConfig()
    _browserClient = createBrowserClient(url, anonKey)
  }
  return _browserClient
}

// Alias used throughout client components
export const supabase = typeof window !== 'undefined'
  ? getSupabaseBrowserClient()
  : null as unknown as SupabaseClient
