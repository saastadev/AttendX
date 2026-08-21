// ============================================================
// AttendX v2 — Canonical AI Context Types (Scope E.29)
// Spec: docs/specs/29_31_ai_data_engine_handoff_spec.md
// ============================================================

import type { UserRole } from './auth'

export interface AIAuthContext {
  /** Validated Supabase Auth User ID */
  userId: string
  /** Authoritative Organization ID (derived from user_roles & app_metadata) */
  tenantId: string
  /** Organization display name */
  tenantName: string
  /** Verified primary user role */
  role: UserRole
  /** Whether the user account is active */
  isActive: boolean
  /** Whether the user has completed onboarding */
  onboardingCompleted: boolean
  /** Tenant local IANA timezone (e.g. 'America/New_York', 'Asia/Kolkata') */
  timezone: string
  /** Correlation ID for tracing AI tool invocations */
  correlationId: string
}

export class AIAuthError extends Error {
  statusCode: number
  code: string

  constructor(message: string, statusCode: number = 401, code: string = 'AI_AUTH_FAILED') {
    super(message)
    this.name = 'AIAuthError'
    this.statusCode = statusCode
    this.code = code
  }
}
