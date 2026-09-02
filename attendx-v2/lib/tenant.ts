// ============================================================
// Client-side tenant resolution.
//
// These six call sites previously ended in:
//     || '11111111-0000-0000-0000-000000000001'
// a hardcoded fallback to the "Acme" demo tenant. RLS still refuses the
// rows, so it was not an exploitable leak — but before the user object
// hydrates, every page silently issued queries against a tenant the user
// may not belong to and rendered an empty state instead of a loading or
// "no organisation" state.
//
// Return null and let callers gate their query with `enabled`.
// ============================================================

export function resolveTenantId(user: unknown): string | null {
  if (!user || typeof user !== 'object') return null
  const u = user as Record<string, any>
  return (
    u.tenant?.id ??
    u.app_metadata?.tenant_id ??
    u.profile?.tenant_id ??
    null
  )
}
