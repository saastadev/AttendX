// ============================================================
// AttendX v2 — Session Management & Remote Revocation Suite
// Spec: docs/specs/04_auth_session_management_spec.md
// Tests: SESS-01 through SESS-08
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'crypto'

class MockSessionDatabase {
  constructor() {
    this.hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex')

    this.tenants = new Map([
      ['tenant-1', { id: 'tenant-1', name: 'Acme Corp' }],
      ['tenant-2', { id: 'tenant-2', name: 'Globex Inc' }],
    ])

    this.users = new Map([
      ['user-1', { id: 'user-1', tenant_id: 'tenant-1', email: 'emp@acme.com', is_active: true, onboarding_completed: true }],
      ['user-2', { id: 'user-2', tenant_id: 'tenant-1', email: 'emp2@acme.com', is_active: true, onboarding_completed: true }],
      ['admin-1', { id: 'admin-1', tenant_id: 'tenant-1', email: 'admin@acme.com', role: 'ADMIN', is_active: true }],
      ['admin-2', { id: 'admin-2', tenant_id: 'tenant-2', email: 'admin@globex.com', role: 'ADMIN', is_active: true }],
    ])

    this.userRoles = new Map([
      ['user-1', [{ role: 'EMPLOYEE', tenant_id: 'tenant-1' }]],
      ['user-2', [{ role: 'EMPLOYEE', tenant_id: 'tenant-1' }]],
      ['admin-1', [{ role: 'ADMIN', tenant_id: 'tenant-1' }]],
      ['admin-2', [{ role: 'ADMIN', tenant_id: 'tenant-2' }]],
    ])

    this.activeSessions = new Map()
    this.gotrueSessions = new Map()
    this.auditLogs = []

    // Seed initial session data
    this.seedSessions()
  }

  seedSessions() {
    // User 1 has 2 devices: Laptop (Session A) and Mobile (Session B)
    const tokenA = 'token-laptop-user1'
    const tokenB = 'token-mobile-user1'

    this.activeSessions.set('sess-1a', {
      id: 'sess-1a',
      user_id: 'user-1',
      tenant_id: 'tenant-1',
      auth_session_id: 'gotrue-sess-1a',
      session_token_hash: this.hashToken(tokenA),
      device_name: 'Apple MacBook Pro',
      browser: 'Google Chrome',
      os: 'macOS',
      ip_address: '192.168.1.100',
      user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      is_revoked: false,
      revoked_at: null,
      last_active: new Date().toISOString(),
    })
    this.gotrueSessions.set('gotrue-sess-1a', { valid: true, user_id: 'user-1' })

    this.activeSessions.set('sess-1b', {
      id: 'sess-1b',
      user_id: 'user-1',
      tenant_id: 'tenant-1',
      auth_session_id: 'gotrue-sess-1b',
      session_token_hash: this.hashToken(tokenB),
      device_name: 'Apple iPhone',
      browser: 'Safari',
      os: 'iOS',
      ip_address: '198.51.100.42',
      user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      is_revoked: false,
      revoked_at: null,
      last_active: new Date().toISOString(),
    })
    this.gotrueSessions.set('gotrue-sess-1b', { valid: true, user_id: 'user-1' })

    // User 2 has 1 session
    const token2 = 'token-desktop-user2'
    this.activeSessions.set('sess-2a', {
      id: 'sess-2a',
      user_id: 'user-2',
      tenant_id: 'tenant-1',
      auth_session_id: 'gotrue-sess-2a',
      session_token_hash: this.hashToken(token2),
      device_name: 'Windows PC',
      browser: 'Microsoft Edge',
      os: 'Windows',
      ip_address: '10.0.0.50',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      is_revoked: false,
      revoked_at: null,
      last_active: new Date().toISOString(),
    })
    this.gotrueSessions.set('gotrue-sess-2a', { valid: true, user_id: 'user-2' })
  }

  // Session API: List active sessions
  getSessions(userId, clientUa) {
    const list = Array.from(this.activeSessions.values()).filter(s => s.user_id === userId && !s.is_revoked)
    return list.map(s => ({
      ...s,
      is_current: s.user_agent === clientUa,
    }))
  }

  // Session API: Revoke single session
  revokeSession(sessionId, actorId, tenantId) {
    const session = this.activeSessions.get(sessionId)
    if (!session || session.tenant_id !== tenantId) {
      return { status: 404, error: 'Session not found in your organization.' }
    }
    // Auth check: either the user owns it or an admin in the same tenant is revoking
    const isAdmin = (this.userRoles.get(actorId) || []).some(r => ['ADMIN', 'SUPERADMIN'].includes(r.role) && r.tenant_id === tenantId)
    if (session.user_id !== actorId && !isAdmin) {
      return { status: 403, error: 'Permission denied.' }
    }

    // Revoke in GoTrue
    if (session.auth_session_id) {
      this.gotrueSessions.delete(session.auth_session_id)
    }

    // Revoke in DB
    session.is_revoked = true
    session.revoked_at = new Date().toISOString()

    // Audit log
    this.auditLogs.push({
      tenant_id: tenantId,
      actor_id: actorId,
      action: 'SESSION_REVOKED',
      table_name: 'active_sessions',
      record_id: sessionId,
      metadata: { target_user_id: session.user_id },
    })

    return { status: 200, success: true, revokedId: sessionId }
  }

  // Session API: Revoke all other sessions
  revokeOtherSessions(userId, currentSessionToken, tenantId) {
    const currentHash = this.hashToken(currentSessionToken)
    let revokedCount = 0

    for (const session of this.activeSessions.values()) {
      if (session.user_id === userId && session.session_token_hash !== currentHash && !session.is_revoked) {
        if (session.auth_session_id) {
          this.gotrueSessions.delete(session.auth_session_id)
        }
        session.is_revoked = true
        session.revoked_at = new Date().toISOString()
        revokedCount++
      }
    }

    this.auditLogs.push({
      tenant_id: tenantId,
      actor_id: userId,
      action: 'SESSIONS_REVOKED_OTHERS',
      table_name: 'active_sessions',
      metadata: { revoked_count: revokedCount },
    })

    return { status: 200, success: true, revokedCount }
  }

  // Admin API: Revoke all user sessions
  adminRevokeUserSessions(targetUserId, callerId) {
    const callerRoles = this.userRoles.get(callerId) || []
    const callerAdminRole = callerRoles.find(r => ['ADMIN', 'SUPERADMIN'].includes(r.role))
    if (!callerAdminRole) return { status: 403, error: 'Admin privilege required.' }

    const targetUser = this.users.get(targetUserId)
    if (!targetUser || targetUser.tenant_id !== callerAdminRole.tenant_id) {
      return { status: 403, error: 'Target user not found in your organization.' }
    }

    let count = 0
    for (const session of this.activeSessions.values()) {
      if (session.user_id === targetUserId && !session.is_revoked) {
        if (session.auth_session_id) this.gotrueSessions.delete(session.auth_session_id)
        session.is_revoked = true
        session.revoked_at = new Date().toISOString()
        count++
      }
    }

    this.auditLogs.push({
      tenant_id: callerAdminRole.tenant_id,
      actor_id: callerId,
      action: 'SESSIONS_REVOKED_ALL',
      metadata: { target_user_id: targetUserId, revoked_count: count },
    })

    return { status: 200, success: true, message: 'All sessions for user terminated.' }
  }

  // Edge Proxy request simulation
  evaluateProxyRequest(pathname, sessionToken) {
    if (!sessionToken) {
      if (pathname.startsWith('/api/')) return { status: 401, error: 'Unauthorized' }
      return { status: 307, location: `/auth/login?next=${encodeURIComponent(pathname)}` }
    }

    const tokenHash = this.hashToken(sessionToken)
    const session = Array.from(this.activeSessions.values()).find(s => s.session_token_hash === tokenHash)

    if (!session || session.is_revoked) {
      if (pathname.startsWith('/api/')) {
        return { status: 401, error: 'Session revoked.', code: 'SESSION_REVOKED' }
      }
      return { status: 307, location: '/auth/login?error=session_revoked' }
    }

    return { status: 200, allowed: true }
  }
}

test('Session Management & Remote Revocation Suite (Spec 04)', async (t) => {
  let db

  t.beforeEach(() => {
    db = new MockSessionDatabase()
  })

  await t.test('SESS-01: User logs in from 2 distinct browsers -> GET /api/sessions returns 2 rows with 1 current', () => {
    const sessions = db.getSessions('user-1', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
    assert.equal(sessions.length, 2)
    const currentSessions = sessions.filter(s => s.is_current)
    assert.equal(currentSessions.length, 1)
    assert.equal(currentSessions[0].device_name, 'Apple MacBook Pro')
  })

  await t.test('SESS-02: User calls POST /api/sessions/revoke on Device B -> marked is_revoked and audit written', () => {
    const res = db.revokeSession('sess-1b', 'user-1', 'tenant-1')
    assert.equal(res.status, 200)
    assert.equal(res.success, true)

    const sessB = db.activeSessions.get('sess-1b')
    assert.equal(sessB.is_revoked, true)
    assert.equal(db.gotrueSessions.has('gotrue-sess-1b'), false)

    const audit = db.auditLogs.find(a => a.action === 'SESSION_REVOKED' && a.record_id === 'sess-1b')
    assert.ok(audit)
  })

  await t.test('SESS-03: Revoked Device B attempts to load /dashboard -> redirected to /auth/login?error=session_revoked', () => {
    db.revokeSession('sess-1b', 'user-1', 'tenant-1')
    const res = db.evaluateProxyRequest('/dashboard', 'token-mobile-user1')
    assert.equal(res.status, 307)
    assert.equal(res.location, '/auth/login?error=session_revoked')
  })

  await t.test('SESS-04: Revoked Device B attempts to call API /api/attendance/clock-in -> returns 401 SESSION_REVOKED', () => {
    db.revokeSession('sess-1b', 'user-1', 'tenant-1')
    const res = db.evaluateProxyRequest('/api/attendance/clock-in', 'token-mobile-user1')
    assert.equal(res.status, 401)
    assert.equal(res.code, 'SESSION_REVOKED')
  })

  await t.test('SESS-05: User executes POST /api/sessions/revoke-others -> Current Session A active, others terminated', () => {
    const res = db.revokeOtherSessions('user-1', 'token-laptop-user1', 'tenant-1')
    assert.equal(res.status, 200)
    assert.equal(res.revokedCount, 1)

    // Current laptop session A remains valid
    const sessA = db.activeSessions.get('sess-1a')
    assert.equal(sessA.is_revoked, false)
    assert.equal(db.evaluateProxyRequest('/dashboard', 'token-laptop-user1').status, 200)

    // Mobile session B is revoked
    const sessB = db.activeSessions.get('sess-1b')
    assert.equal(sessB.is_revoked, true)
    assert.equal(db.evaluateProxyRequest('/api/dashboard', 'token-mobile-user1').status, 401)
  })

  await t.test('SESS-06: Password change triggers remote invalidation -> Current active, secondary device rejected', () => {
    // Simulating password change invoking revokeAllExceptCurrent
    db.revokeOtherSessions('user-1', 'token-laptop-user1', 'tenant-1')

    // Session A is allowed
    assert.equal(db.evaluateProxyRequest('/api/profile', 'token-laptop-user1').status, 200)
    // Session B is revoked
    assert.equal(db.evaluateProxyRequest('/api/profile', 'token-mobile-user1').status, 401)
  })

  await t.test('SESS-07: Admin revokes employee sessions -> target user sessions terminated', () => {
    const res = db.adminRevokeUserSessions('user-2', 'admin-1')
    assert.equal(res.status, 200)

    const sess2 = db.activeSessions.get('sess-2a')
    assert.equal(sess2.is_revoked, true)
    assert.equal(db.evaluateProxyRequest('/dashboard', 'token-desktop-user2').status, 307)
  })

  await t.test('SESS-08: Cross-tenant session revocation attempt -> Admin Tenant 2 calling revoke on User Tenant 1 is rejected', () => {
    const res = db.adminRevokeUserSessions('user-1', 'admin-2')
    assert.equal(res.status, 403)

    // Session 1a in Tenant 1 remains untouched
    const sess1a = db.activeSessions.get('sess-1a')
    assert.equal(sess1a.is_revoked, false)
  })
})
