// ============================================================
// AttendX v2 — Supabase Client
// Singleton browser client + server client factory
// ============================================================

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Browser-side singleton
let _browserClient: SupabaseClient | null = null

export function getSupabaseBrowserClient(): SupabaseClient {
  if (!_browserClient) {
    _browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey)
  }
  return _browserClient
}

// Alias used throughout client components
export const supabase = typeof window !== 'undefined'
  ? getSupabaseBrowserClient()
  : null as unknown as SupabaseClient
