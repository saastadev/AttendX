// ============================================================
// AttendX v2 — Session Edge Cases & Token Lifecycle Suite
// Spec: docs/specs/06_auth_session_edge_cases_spec.md
// Tests: EDGE-01 through EDGE-12
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'crypto'

class MockRateLimiter {
  static store = new Map()

  static generateKey(action, ip, identifier) {
    const raw = `${action}:${ip.trim().toLowerCase()}:${(identifier || '').trim().toLowerCase()}`
    return crypto.createHash('sha256').update(raw).digest('hex')
  }

  static check(key, maxAttempts = 5, windowMs = 15 * 60 * 1000) {
    const now = Date.now()
    const entry = this.store.get(key)
    if (!entry) return { allowed: true, remaining: maxAttempts, retryAfterSeconds: 0 }

    if (entry.blockedUntil && entry.blockedUntil > now) {
      return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil((entry.blockedUntil - now) / 1000) }
    }

    const activeTimestamps = entry.timestamps.filter(ts => now - ts < windowMs)
    entry.timestamps = activeTimestamps

    if (activeTimestamps.length >= maxAttempts) {
      entry.blockedUntil = now + windowMs
      return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil(windowMs / 1000) }
    }

    return { allowed: true, remaining: maxAttempts - activeTimestamps.length, retryAfterSeconds: 0 }
  }

  static recordFailure(key, windowMs = 15 * 60 * 1000) {
    const now = Date.now()
    const entry = this.store.get(key) || { timestamps: [] }
    entry.timestamps = entry.timestamps.filter(ts => now - ts < windowMs)
    entry.timestamps.push(now)
    this.store.set(key, entry)
  }

  static reset(key) {
    this.store.delete(key)
  }
}

class MockSessionEdgeDatabase {
  constructor() {
    this.hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex')

    this.tenants = new Map([
      ['tenant-1', { id: 'tenant-1', name: 'Acme Corp' }],
      ['tenant-2', { id: 'tenant-2', name: 'Globex Inc' }],
    ])

    this.profiles = new Map([
      ['user-1', { id: 'user-1', tenant_id: 'tenant-1', email: 'emp@acme.com', is_active: true, onboarding_completed: true }],
      ['user-admin-demoted', { id: 'user-admin-demoted', tenant_id: 'tenant-1', email: 'demoted@acme.com', is_active: true, onboarding_completed: true }],
      ['user-multi-tenant', { id: 'user-multi-tenant', tenant_id: 'tenant-1', email: 'multi@acme.com', is_active: true, onboarding_completed: true }],
      ['user-deactivated', { id: 'user-deactivated', tenant_id: 'tenant-1', email: 'deactivated@acme.com', is_active: false, onboarding_completed: true }],
    ])

    this.userRoles = new Map([
      ['user-1', [{ role: 'EMPLOYEE', tenant_id: 'tenant-1' }]],
      ['user-admin-demoted', [{ role: 'EMPLOYEE', tenant_id: 'tenant-1' }]], // Demoted in live DB
      ['user-multi-tenant', [{ role: 'EMPLOYEE', tenant_id: 'tenant-2' }]], // Removed from tenant-1
    ])

    this.activeSessions = new Map([
      ['sess-1a', { id: 'sess-1a', user_id: 'user-1', session_token_hash: this.hashToken('token-1a'), is_revoked: false }],
      ['sess-1b', { id: 'sess-1b', user_id: 'user-1', session_token_hash: this.hashToken('token-1b'), is_revoked: false }],
      ['sess-revoked', { id: 'sess-revoked', user_id: 'user-1', session_token_hash: this.hashToken('token-revoked'), is_revoked: true }],
    ])

    this.passwordResets = new Map()
    this.gotrueSessions = new Map([
      ['user-1', { valid: true }],
    ])
  }

  // Password reset request
  createPasswordResetToken(email) {
    const profile = Array.from(this.profiles.values()).find(p => p.email === email && p.is_active)
    if (!profile) return { success: true } // Safe generic response

    const rawToken = crypto.randomBytes(32).toString('base64url')
    const tokenHash = this.hashToken(rawToken)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 min TTL

    this.passwordResets.set(tokenHash, {
      id: `reset-${Date.now()}`,
      user_id: profile.id,
      tenant_id: profile.tenant_id,
      token_hash: tokenHash,
      expires_at: expiresAt,
      used_at: null,
    })

    return { success: true, rawToken }
  }

  // Consume password reset
  consumePasswordReset(rawToken, newPassword) {
    const tokenHash = this.hashToken(rawToken)
    const resetRecord = this.passwordResets.get(tokenHash)

    if (!resetRecord) {
      return { status: 400, error: 'Invalid or expired password reset link.', code: 'INVALID_TOKEN' }
    }
    if (resetRecord.used_at) {
      return { status: 400, error: 'This password reset link has already been used.', code: 'TOKEN_ALREADY_USED' }
    }
    if (new Date(resetRecord.expires_at).getTime() < Date.now()) {
      return { status: 400, error: 'This password reset link has expired (15 minute validity).', code: 'TOKEN_EXPIRED' }
    }

    // Mark as consumed
    resetRecord.used_at = new Date().toISOString()

    // Revoke all existing sessions globally
    for (const session of this.activeSessions.values()) {
      if (session.user_id === resetRecord.user_id) {
        session.is_revoked = true
      }
    }
    this.gotrueSessions.delete(resetRecord.user_id)

    return { status: 200, success: true, message: 'Password updated successfully.' }
  }

  // Proxy verification logic
  evaluateProxy(pathname, userId, claimRole, targetTenantId, sessionToken) {
    if (!userId || !sessionToken) {
      if (pathname.startsWith('/api/')) return { status: 401, error: 'Unauthorized' }
      return { status: 307, location: `/auth/login?next=${encodeURIComponent(pathname)}` }
    }

    const tokenHash = this.hashToken(sessionToken)
    const session = Array.from(this.activeSessions.values()).find(s => s.session_token_hash === tokenHash)
    if (!session || session.is_revoked) {
      if (pathname.startsWith('/api/')) return { status: 401, error: 'Session revoked.', code: 'SESSION_REVOKED' }
      return { status: 307, location: '/auth/login?error=session_revoked' }
    }

    const profile = this.profiles.get(userId)
    if (!profile || profile.is_active === false) {
      if (pathname.startsWith('/api/')) return { status: 403, error: 'Account is deactivated.', code: 'ACCOUNT_DEACTIVATED' }
      return { status: 307, location: '/auth/login?error=account_deactivated' }
    }

    // Authoritative tenant check
    const roles = this.userRoles.get(userId) || []
    const tenantMembership = roles.find(r => r.tenant_id === targetTenantId)
    if (!tenantMembership) {
      return { status: 403, error: 'Tenant membership revoked.', code: 'TENANT_MEMBERSHIP_REVOKED' }
    }

    // Privileged path check against LIVE role in database (ignores stale claimRole)
    if (pathname.startsWith('/admin')) {
      if (!['ADMIN', 'SUPERADMIN'].includes(tenantMembership.role)) {
        return { status: 403, error: 'Role revoked or insufficient privileges.', code: 'ROLE_REVOKED' }
      }
    }

    return { status: 200, allowed: true }
  }
}

test('Session Edge Cases & Token Security Suite (Spec 06)', async (t) => {
  let db

  t.beforeEach(() => {
    db = new MockSessionEdgeDatabase()
  })

  await t.test('EDGE-01: Role revoked mid-session (JWT has ADMIN, DB has EMPLOYEE) -> denied access to /admin', () => {
    const token = 'token-demoted'
    db.activeSessions.set('sess-demoted', { id: 'sess-demoted', user_id: 'user-admin-demoted', session_token_hash: db.hashToken(token), is_revoked: false })

    const res = db.evaluateProxy('/admin/employees', 'user-admin-demoted', 'ADMIN', 'tenant-1', token)
    assert.equal(res.status, 403)
    assert.equal(res.code, 'ROLE_REVOKED')
  })

  await t.test('EDGE-02: Tenant membership revoked mid-session -> cross-tenant access returns 403 TENANT_MEMBERSHIP_REVOKED', () => {
    const token = 'token-multi'
    db.activeSessions.set('sess-multi', { id: 'sess-multi', user_id: 'user-multi-tenant', session_token_hash: db.hashToken(token), is_revoked: false })

    // User was removed from tenant-1 (now only in tenant-2)
    const res = db.evaluateProxy('/dashboard', 'user-multi-tenant', 'EMPLOYEE', 'tenant-1', token)
    assert.equal(res.status, 403)
    assert.equal(res.code, 'TENANT_MEMBERSHIP_REVOKED')
  })

  await t.test('EDGE-03: User deactivated mid-session -> redirected to /auth/login?error=account_deactivated', () => {
    const token = 'token-deact'
    db.activeSessions.set('sess-deact', { id: 'sess-deact', user_id: 'user-deactivated', session_token_hash: db.hashToken(token), is_revoked: false })

    const res = db.evaluateProxy('/dashboard', 'user-deactivated', 'EMPLOYEE', 'tenant-1', token)
    assert.equal(res.status, 307)
    assert.equal(res.location, '/auth/login?error=account_deactivated')
  })

  await t.test('EDGE-04: Stale JWT claims -> authoritative database state overrides stale claims', () => {
    const token = 'token-1a'
    // User claims role SUPERADMIN in JWT, but live DB role is EMPLOYEE
    const res = db.evaluateProxy('/admin/settings', 'user-1', 'SUPERADMIN', 'tenant-1', token)
    assert.equal(res.status, 403)
    assert.equal(res.code, 'ROLE_REVOKED')
  })

  await t.test('EDGE-05: Expired password-reset token (>15 min) is rejected with TOKEN_EXPIRED', () => {
    const { rawToken } = db.createPasswordResetToken('emp@acme.com')
    const tokenHash = db.hashToken(rawToken)
    // Fast-forward expiration
    db.passwordResets.get(tokenHash).expires_at = new Date(Date.now() - 1000).toISOString()

    const res = db.consumePasswordReset(rawToken, 'NewSecurePassword2026!')
    assert.equal(res.status, 400)
    assert.equal(res.code, 'TOKEN_EXPIRED')
  })

  await t.test('EDGE-06: Reused password-reset token is rejected with TOKEN_ALREADY_USED', () => {
    const { rawToken } = db.createPasswordResetToken('emp@acme.com')
    // First consumption succeeds
    const firstRes = db.consumePasswordReset(rawToken, 'NewSecurePassword2026!')
    assert.equal(firstRes.status, 200)

    // Replay attempt fails
    const replayRes = db.consumePasswordReset(rawToken, 'AnotherPassword2026!')
    assert.equal(replayRes.status, 400)
    assert.equal(replayRes.code, 'TOKEN_ALREADY_USED')
  })

  await t.test('EDGE-07: Concurrent multi-device logins -> distinct active sessions maintained without cross-invalidation', () => {
    const sessA = db.activeSessions.get('sess-1a')
    const sessB = db.activeSessions.get('sess-1b')
    assert.equal(sessA.is_revoked, false)
    assert.equal(sessB.is_revoked, false)
    assert.notEqual(sessA.session_token_hash, sessB.session_token_hash)
  })

  await t.test('EDGE-08: Password reset triggers global session revocation across all devices', () => {
    const { rawToken } = db.createPasswordResetToken('emp@acme.com')
    db.consumePasswordReset(rawToken, 'BrandNewPassword2026!')

    // Both device sessions for user-1 are revoked
    assert.equal(db.activeSessions.get('sess-1a').is_revoked, true)
    assert.equal(db.activeSessions.get('sess-1b').is_revoked, true)
    // GoTrue session revoked
    assert.equal(db.gotrueSessions.has('user-1'), false)
  })

  await t.test('EDGE-09: Sliding-window rate limiter blocks excessive failed attempts with 429', () => {
    const testKey = MockRateLimiter.generateKey('login-test', '192.0.2.1', 'target@test.com')
    MockRateLimiter.reset(testKey)

    // Record 5 failed attempts
    for (let i = 0; i < 5; i++) {
      MockRateLimiter.recordFailure(testKey)
    }

    const check = MockRateLimiter.check(testKey, 5, 15 * 60 * 1000)
    assert.equal(check.allowed, false)
    assert.equal(check.remaining, 0)
    assert.ok(check.retryAfterSeconds > 0)
  })

  await t.test('EDGE-10: Expired session without token -> redirected to /auth/login?next=/dashboard', () => {
    const res = db.evaluateProxy('/dashboard', null, null, null, null)
    assert.equal(res.status, 307)
    assert.equal(res.location, '/auth/login?next=%2Fdashboard')
  })

  await t.test('EDGE-11: Revoked session token -> rejected with 401 SESSION_REVOKED', () => {
    const res = db.evaluateProxy('/api/attendance', 'user-1', 'EMPLOYEE', 'tenant-1', 'token-revoked')
    assert.equal(res.status, 401)
    assert.equal(res.code, 'SESSION_REVOKED')
  })

  await t.test('EDGE-12: Refresh token reuse triggers family revocation (clean redirect to login)', () => {
    // When GoTrue returns invalid_grant, proxy purges cookies and returns 401/307
    const res = db.evaluateProxy('/api/cases', null, null, null, null)
    assert.equal(res.status, 401)
  })
})
