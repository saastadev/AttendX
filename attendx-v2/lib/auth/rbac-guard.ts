// ============================================================
// AttendX v2 — RBAC Multi-Role Precedence & Authorization Guard
// Spec: docs/specs/14_scope_d_rbac_matrix_spec.md
// ============================================================

import type { UserRole } from '@/types/database'

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  SUPERADMIN: 1,
  ADMIN: 2,
  HR: 3,
  MANAGER: 4,
  EMPLOYEE: 5,
}

export class RbacGuard {
  /**
   * Deterministically resolves primary role from multiple assignments
   * Lowest hierarchy number has the highest authority
   */
  static resolvePrimaryRole(roles: UserRole[]): UserRole {
    if (!roles || roles.length === 0) return 'EMPLOYEE'
    return roles.reduce((highest, current) => {
      const currentRank = ROLE_HIERARCHY[current] ?? 99
      const highestRank = ROLE_HIERARCHY[highest] ?? 99
      return currentRank < highestRank ? current : highest
    }, roles[0])
  }

  /**
   * Checks if user holds at least one of the required roles
   */
  static isAuthorizedForRoute(userRoles: UserRole[], requiredRoles: UserRole[]): boolean {
    if (!userRoles || userRoles.length === 0) return false
    return userRoles.some((role) => requiredRoles.includes(role))
  }

  /**
   * Checks if actor role outranks or matches the target role
   */
  static hasPrivilege(actorRole: UserRole, targetRole: UserRole): boolean {
    const actorRank = ROLE_HIERARCHY[actorRole] ?? 99
    const targetRank = ROLE_HIERARCHY[targetRole] ?? 99
    return actorRank <= targetRank
  }
}
