// ============================================================
// AttendX v2 — Sentry Observability & PII Sanitizer
// Spec: docs/specs/20_27_infra_hardening_pwa_security_spec.md (BRD §23)
// ============================================================

export function sanitizePayload(data: any): any {
  if (!data || typeof data !== 'object') return data

  const BANNED_KEYS = [
    'password',
    'temp_password',
    'token',
    'access_token',
    'refresh_token',
    'service_role',
    'authorization',
    'cookie',
    'secret',
  ]

  if (Array.isArray(data)) {
    return data.map((item) => sanitizePayload(item))
  }

  const sanitized: Record<string, any> = {}
  for (const [key, value] of Object.entries(data)) {
    if (BANNED_KEYS.some((k) => key.toLowerCase().includes(k))) {
      sanitized[key] = '[REDACTED]'
    } else if (value && typeof value === 'object') {
      sanitized[key] = sanitizePayload(value)
    } else {
      sanitized[key] = value
    }
  }

  return sanitized
}
