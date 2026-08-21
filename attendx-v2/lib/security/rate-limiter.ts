// ============================================================
// AttendX v2 — Multi-Window Sliding Rate Limiter
// Spec: docs/specs/20_27_infra_hardening_pwa_security_spec.md (BRD §22)
// ============================================================

export interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

export type RateLimitEndpointType =
  | 'auth:login'
  | 'auth:reset'
  | 'auth:invite-accept'
  | 'admin:provision'
  | 'sessions:manage'
  | 'tenant:switch'
  | 'payroll:export'

export const ENDPOINT_LIMITS: Record<RateLimitEndpointType, RateLimitConfig> = {
  'auth:login':         { maxRequests: 5,  windowMs: 5 * 60 * 1000 },  // 5 attempts / 5 min
  'auth:reset':         { maxRequests: 3,  windowMs: 15 * 60 * 1000 }, // 3 attempts / 15 min
  'auth:invite-accept': { maxRequests: 5,  windowMs: 15 * 60 * 1000 }, // 5 attempts / 15 min
  'admin:provision':    { maxRequests: 10, windowMs: 60 * 1000 },      // 10 calls / min
  'sessions:manage':    { maxRequests: 20, windowMs: 60 * 1000 },      // 20 calls / min
  'tenant:switch':      { maxRequests: 10, windowMs: 60 * 1000 },      // 10 switches / min
  'payroll:export':     { maxRequests: 3,  windowMs: 5 * 60 * 1000 },  // 3 exports / 5 min
}

const memoryStore = new Map<string, { count: number; resetAt: number }>()

export class SecurityRateLimiter {
  /**
   * Evaluates request against configured endpoint rate limit window
   */
  static check(
    key: string,
    limitType: RateLimitEndpointType
  ): { allowed: boolean; retryAfter?: number; count: number; max: number } {
    const config = ENDPOINT_LIMITS[limitType]
    const now = Date.now()
    const compositeKey = `${limitType}:${key}`
    const record = memoryStore.get(compositeKey)

    if (!record || record.resetAt < now) {
      memoryStore.set(compositeKey, { count: 1, resetAt: now + config.windowMs })
      return { allowed: true, count: 1, max: config.maxRequests }
    }

    if (record.count >= config.maxRequests) {
      const retryAfter = Math.ceil((record.resetAt - now) / 1000)
      return { allowed: false, retryAfter, count: record.count, max: config.maxRequests }
    }

    record.count++
    return { allowed: true, count: record.count, max: config.maxRequests }
  }

  /**
   * Resets limit for testing
   */
  static reset(key?: string) {
    if (key) {
      for (const k of memoryStore.keys()) {
        if (k.endsWith(`:${key}`)) memoryStore.delete(k)
      }
    } else {
      memoryStore.clear()
    }
  }
}
