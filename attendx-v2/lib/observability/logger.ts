// ============================================================
// AttendX v2 — Zero-PII Structured Logger
// Spec: docs/specs/20_27_infra_hardening_pwa_security_spec.md (BRD §23)
// ============================================================

import { sanitizePayload } from './sentry'

export interface LogContext {
  tenantId?: string | null
  correlationId?: string | null
  userId?: string | null
  route?: string | null
  [key: string]: any
}

export class AppLogger {
  private static format(
    level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG',
    message: string,
    context?: LogContext,
    error?: any
  ): string {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      tenantId: context?.tenantId || null,
      correlationId: context?.correlationId || null,
      userId: context?.userId || null,
      route: context?.route || null,
      ...(context ? { context: sanitizePayload(context) } : {}),
      ...(error ? { error: error.message || String(error) } : {}),
    }

    return JSON.stringify(entry)
  }

  static info(message: string, context?: LogContext) {
    console.log(this.format('INFO', message, context))
  }

  static warn(message: string, context?: LogContext, error?: any) {
    console.warn(this.format('WARN', message, context, error))
  }

  static error(message: string, context?: LogContext, error?: any) {
    console.error(this.format('ERROR', message, context, error))
  }

  static debug(message: string, context?: LogContext) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(this.format('DEBUG', message, context))
    }
  }
}
