// ============================================================
// AttendX v2 — Supabase Configuration and Environment Predicates
// Safe to import in both Edge Runtime (middleware) and Node.js
// ============================================================

export function isDevMockSupabase(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  return (
    url.includes('attendx-dev.supabase.co') ||
    url.includes('dummy') ||
    process.env.ATTENDX_OFFLINE_MODE === 'true' ||
    process.env.ATTENDX_MOCK_STORE === 'true'
  )
}

/**
 * Strict security gate: Demo authentication and demo cookie handling
 * are only permitted when BOTH development mode AND mock Supabase are active.
 * Never permitted in test, staging, or production.
 */
export function allowDemoAuthentication(): boolean {
  // Absolute cloud production guards: never allow demo auth in production deployments
  if (
    process.env.VERCEL_ENV === 'production' ||
    process.env.ATTENDX_ENV === 'production' ||
    process.env.RENDER === 'true'
  ) {
    return false
  }

  // Absolute guard: never allow against production Supabase project
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  if (supabaseUrl.includes('xskgtrgiclzmwtyyhpjh')) {
    return false
  }

  if (process.env.ATTENDX_USE_LOCAL_DB === 'true') {
    return true
  }
  return process.env.NODE_ENV === 'development' && isDevMockSupabase()
}

/**
 * Strict security gate for privileged-client test spy:
 * 1. Disabled by default (returns false if ATTENDX_TEST_PRIVILEGED_SPY is unset/empty).
 * 2. Cannot be activated in production through an environment variable alone:
 *    Requires an explicitly permitted test-only environment (`ATTENDX_TEST_ENVIRONMENT === 'true'`).
 * 3. Strictly prohibited in hosted cloud or deployment environments (Vercel production, Render, ATTENDX_ENV=production).
 * 4. Strictly prohibited if targeting hosted production (xskgtrgiclzmwtyyhpjh) or hosted QA (khaxowomjczuckfuraoh) Supabase instances.
 * 5. In production mode (e.g. Next.js production build runner), database target must be local loopback.
 */
export function isPrivilegedSpyAllowed(): boolean {
  const spyPath = process.env.ATTENDX_TEST_PRIVILEGED_SPY?.trim()
  if (!spyPath) return false

  // Disallow activation in hosted cloud or deployment environments
  if (
    process.env.VERCEL_ENV === 'production' ||
    process.env.ATTENDX_ENV === 'production' ||
    process.env.RENDER === 'true'
  ) {
    return false
  }

  // Must require an explicitly permitted test-only environment flag
  // Cannot be activated by ATTENDX_TEST_PRIVILEGED_SPY alone!
  if (process.env.ATTENDX_TEST_ENVIRONMENT !== 'true') {
    return false
  }

  // Absolute guard: never allow against production Supabase project
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  if (supabaseUrl.includes('xskgtrgiclzmwtyyhpjh')) {
    return false
  }

  return true
}
