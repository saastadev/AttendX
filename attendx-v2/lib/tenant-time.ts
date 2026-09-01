// ============================================================
// Tenant-local "today".
//
// Attendance is a per-calendar-day concept, and the calendar that matters
// is the tenant's, not the server's. `new Date().toISOString()` is UTC, so
// an Asia/Kolkata tenant (UTC+5:30) viewed from a UTC server shows the
// PREVIOUS day's board for the first 5.5 hours of every local day, and a
// US tenant shows tomorrow's (empty) board each evening.
//
// The schema already carries `tenants.timezone` — use it.
// ============================================================

/** Current date in an IANA timezone, as YYYY-MM-DD. */
export function todayInTimezone(timeZone: string, now: Date = new Date()): string {
  try {
    // en-CA formats as YYYY-MM-DD, which is exactly the shape Postgres `date` wants.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)
  } catch {
    // Unknown/garbage tz string: fall back to UTC rather than throwing, but
    // make it visible — a silently wrong date is the bug we are fixing.
    console.warn(`[tenant-time] Unknown timezone "${timeZone}", falling back to UTC`)
    return now.toISOString().slice(0, 10)
  }
}

/** Validates a YYYY-MM-DD string supplied by a caller. */
export function isValidDateParam(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
}
