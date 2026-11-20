const PRIORITY = ['SUPERADMIN', 'ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'] as const

/** Only current database assignments in the selected workspace grant access. */
export function resolveLoginRoles(records: Array<{ role: string; tenant_id: string }>, tenantId: string): string[] {
  if (!tenantId) return []
  const assigned = new Set(records.filter(record => record.tenant_id === tenantId).map(record => record.role))
  return PRIORITY.filter(role => assigned.has(role))
}

const LANDING: Record<string, string> = {
  SUPERADMIN: '/admin/users', ADMIN: '/admin/users', HR: '/hr/directory',
  MANAGER: '/manager/team', EMPLOYEE: '/dashboard',
}
const SHARED = ['/dashboard', '/attendance', '/leave', '/cases', '/profile', '/copilot', '/performance', '/recognition', '/notifications', '/employee-360']

export function resolveLoginDestination(role: string, next?: string): string {
  const fallback = LANDING[role] || '/auth/login'
  if (!LANDING[role] || !next || !next.startsWith('/') || next.startsWith('//') || /[\\\x00-\x20]/.test(next)) return fallback
  const url = new URL(next, 'https://workspace.invalid')
  if (url.origin !== 'https://workspace.invalid') return fallback
  const allowed = [...SHARED]
  if (['SUPERADMIN', 'ADMIN'].includes(role)) allowed.push('/admin', '/hr', '/manager')
  if (role === 'HR') allowed.push('/hr', '/manager', '/hiring')
  if (role === 'MANAGER') allowed.push('/manager')
  return allowed.some(path => url.pathname === path || url.pathname.startsWith(`${path}/`))
    ? `${url.pathname}${url.search}${url.hash}` : fallback
}
