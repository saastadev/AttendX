// ============================================================
// AttendX v2 — Request Origin & CSRF Guard
// Spec: docs/specs/20_27_infra_hardening_pwa_security_spec.md (BRD §25)
// ============================================================

import type { NextRequest } from 'next/server'

export class CsrfGuard {
  /**
   * Validates Origin and Sec-Fetch-Site on state-changing HTTP requests
   */
  static validateRequestOrigin(request: NextRequest): boolean {
    const method = request.method.toUpperCase()
    // Safe idempotent methods do not mutate state
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return true
    }

    const origin = request.headers.get('origin')
    const host = request.headers.get('host')

    // If Origin header is missing (e.g. some same-origin browser forms), inspect Sec-Fetch-Site
    if (!origin) {
      const fetchSite = request.headers.get('sec-fetch-site')
      if (fetchSite) {
        return fetchSite === 'same-origin' || fetchSite === 'same-site' || fetchSite === 'none'
      }
      // If neither origin nor sec-fetch-site is present, verify referer host if available
      const referer = request.headers.get('referer')
      if (referer && host) {
        try {
          const refHost = new URL(referer).host
          return refHost === host
        } catch {
          return false
        }
      }
      return true
    }

    if (!host) return false

    try {
      const originHost = new URL(origin).host
      return originHost === host
    } catch {
      return false
    }
  }
}
