// ============================================================
// AttendX v2 — Sliding Window Rate Limiter
// Prevents brute-force authentication and password guessing
// Default: 5 attempts per 15-minute window
// ============================================================

import crypto from 'crypto'

interface RateLimitEntry {
  timestamps: number[]
  blockedUntil?: number
}

// In-memory sliding window store (isolated per serverless process lifecycle)
const rateLimitStore = new Map<string, RateLimitEntry>()

export class RateLimiter {
  /**
   * Generates a stable SHA-256 key from action, IP, and identifier
   */
  static generateKey(action: string, ip: string, identifier?: string): string {
    const raw = `${action}:${ip.trim().toLowerCase()}:${(identifier || '').trim().toLowerCase()}`
    return crypto.createHash('sha256').update(raw).digest('hex')
  }

  /**
   * Checks if a request is permitted within the sliding window
   */
  static check(
    key: string,
    maxAttempts: number = 5,
    windowMs: number = 15 * 60 * 1000 // 15 minutes
  ): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
    const now = Date.now()
    const entry = rateLimitStore.get(key)

    if (!entry) {
      return { allowed: true, remaining: maxAttempts, retryAfterSeconds: 0 }
    }

    // If currently blocked
    if (entry.blockedUntil && entry.blockedUntil > now) {
      const retryAfterSeconds = Math.ceil((entry.blockedUntil - now) / 1000)
      return { allowed: false, remaining: 0, retryAfterSeconds }
    }

    // Filter out expired timestamps outside the sliding window
    const activeTimestamps = entry.timestamps.filter(ts => now - ts < windowMs)
    entry.timestamps = activeTimestamps

    if (activeTimestamps.length >= maxAttempts) {
      // Apply block penalty for window duration
      entry.blockedUntil = now + windowMs
      const retryAfterSeconds = Math.ceil(windowMs / 1000)
      return { allowed: false, remaining: 0, retryAfterSeconds }
    }

    return {
      allowed: true,
      remaining: maxAttempts - activeTimestamps.length,
      retryAfterSeconds: 0,
    }
  }

  /**
   * Records a failed attempt for the given key
   */
  static recordFailure(key: string, windowMs: number = 15 * 60 * 1000) {
    const now = Date.now()
    const entry = rateLimitStore.get(key) || { timestamps: [] }

    // Prune stale entries
    entry.timestamps = entry.timestamps.filter(ts => now - ts < windowMs)
    entry.timestamps.push(now)

    rateLimitStore.set(key, entry)
  }

  /**
   * Resets the rate limit on successful authentication
   */
  static reset(key: string) {
    rateLimitStore.delete(key)
  }
}
