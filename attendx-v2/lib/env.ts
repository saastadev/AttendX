// ============================================================
// AttendX v2 — Environment validation
//
// Fail loudly, never silently degrade. The predecessor of this file
// returned hardcoded dummy credentials when env vars were missing:
//
//   process.env.SUPABASE_SERVICE_ROLE_KEY
//     || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY   // <-- anon fallback
//     || 'eyJ...dummy_service'
//
// which meant a misconfigured deploy ran privileged server operations
// with ANON privileges instead of erroring — the same silent-degradation
// class as the auth bypass this codebase previously shipped.
// ============================================================

const PLACEHOLDER = /placeholder|dummy_anon|dummy_service|changeme|your-.*-here/i

/**
 * `next build` prerenders pages without real secrets in many setups
 * (our CI passes deliberate placeholders). Construction must not throw
 * during that phase, only at real request time.
 */
function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build'
}

function fail(varName: string, detail: string): never {
  throw new Error(
    `[env] ${varName} ${detail}.\n` +
    `Set it in your deployment environment (Render dashboard / .env.local).\n` +
    `Refusing to fall back to a placeholder: doing so silently downgrades ` +
    `privileges and produces confusing runtime behaviour instead of a clear error.`
  )
}

/** Public Supabase config. Safe to use in browser and server code. */
export function requireSupabaseConfig(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

  if (isBuildPhase()) {
    return { url: url || 'https://build-phase.invalid', anonKey: anonKey || 'build-phase' }
  }
  if (!url) fail('NEXT_PUBLIC_SUPABASE_URL', 'is missing')
  if (!anonKey) fail('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'is missing')
  if (PLACEHOLDER.test(url)) fail('NEXT_PUBLIC_SUPABASE_URL', `is a placeholder ("${url}")`)
  if (PLACEHOLDER.test(anonKey)) fail('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'is a placeholder')

  return { url, anonKey }
}

/**
 * Service-role key. SERVER ONLY — never import from a client component.
 * Deliberately has NO fallback to the anon key: running an admin path with
 * anon privileges is worse than crashing, because it fails quietly.
 */
export function requireServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (isBuildPhase()) return key || 'build-phase'
  if (!key) fail('SUPABASE_SERVICE_ROLE_KEY', 'is missing (required for privileged server operations)')
  if (PLACEHOLDER.test(key)) fail('SUPABASE_SERVICE_ROLE_KEY', 'is a placeholder')

  return key
}

/** Non-throwing probe, for health checks and optional features. */
export function hasSupabaseConfig(): boolean {
  try {
    requireSupabaseConfig()
    return true
  } catch {
    return false
  }
}
