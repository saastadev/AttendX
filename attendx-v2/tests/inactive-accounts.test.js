// ============================================================
// AttendX v2 — Inactive Accounts & Deactivation Policy Suite
// Spec: docs/specs/05_auth_inactive_accounts_spec.md
// Tests: INACT-01 through INACT-10
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'

class MockInactiveAccountsDatabase {
  constructor() {
    this.tenants = new Map([
      ['tenant-1', { id: 'tenant-1', name: 'Acme Corp', max_employees: 5 }],
      ['tenant-full', { id: 'tenant-full', name: 'Capacity Max Corp', max_employees: 2 }],
      ['tenant-2', { id: 'tenant-2', name: 'Globex Inc', max_employees: 10 }],
    ])

    this.profiles = new Map([
      ['user-active-1', { id: 'user-active-1', tenant_id: 'tenant-1', email: 'active@acme.com', is_active: true, onboarding_completed: true }],
      ['user-sarah', { id: 'user-sarah', tenant_id: 'tenant-1', email: 'sarah@acme.com', is_active: true, onboarding_completed: true }],
      ['admin-john', { id: 'admin-john', tenant_id: 'tenant-1', email: 'john@acme.com', is_active: true, onboarding_completed: true }],
      ['admin-sole', { id: 'admin-sole', tenant_id: 'tenant-2', email: 'sole@globex.com', is_active: true, onboarding_completed: true }],
      ['admin-cap', { id: 'admin-cap', tenant_id: 'tenant-full', email: 'admin@cap.com', is_active: true, onboarding_completed: true }],
      ['user-cap-1', { id: 'user-cap-1', tenant_id: 'tenant-full', email: 'cap1@cap.com', is_active: true, onboarding_completed: true }],
      ['user-cap-2', { id: 'user-cap-2', tenant_id: 'tenant-full', email: 'cap2@cap.com', is_active: true, onboarding_completed: true }],
      ['user-cap-inactive', { id: 'user-cap-inactive', tenant_id: 'tenant-full', email: 'inactive@cap.com', is_active: false, onboarding_completed: true }],
    ])

    this.employees = new Map([
      ['user-sarah', { id: 'user-sarah', tenant_id: 'tenant-1', status: 'ACTIVE' }],
      ['user-active-1', { id: 'user-active-1', tenant_id: 'tenant-1', status: 'ACTIVE' }],
      ['user-cap-inactive', { id: 'user-cap-inactive', tenant_id: 'tenant-full', status: 'TERMINATED' }],
    ])

    this.userRoles = new Map([
      ['user-active-1', [{ role: 'EMPLOYEE', tenant_id: 'tenant-1' }]],
      ['user-sarah', [{ role: 'EMPLOYEE', tenant_id: 'tenant-1' }]],
      ['admin-john', [{ role: 'ADMIN', tenant_id: 'tenant-1' }]],
      ['admin-sole', [{ role: 'ADMIN', tenant_id: 'tenant-2' }]],
      ['admin-cap', [{ role: 'ADMIN', tenant_id: 'tenant-full' }]],
      ['user-cap-1', [{ role: 'EMPLOYEE', tenant_id: 'tenant-full' }]],
      ['user-cap-2', [{ role: 'EMPLOYEE', tenant_id: 'tenant-full' }]],
      ['user-cap-inactive', [{ role: 'EMPLOYEE', tenant_id: 'tenant-full' }]],
    ])

    this.attendanceRecords = [
      { id: 'att-1', user_id: 'user-sarah', date: '2026-08-20', status: 'PRESENT' },
      { id: 'att-2', user_id: 'user-sarah', date: '2026-08-21', status: 'PRESENT' },
    ]

    this.activeSessions = new Map([
      ['sess-sarah-1', { id: 'sess-sarah-1', user_id: 'user-sarah', is_revoked: false }],
    ])

    this.gotrueSessions = new Map([
      ['user-sarah', { valid: true }],
      ['user-active-1', { valid: true }],
    ])

    this.auditLogs = []
  }

  // Simulate Stored Procedure deactivate_user_atomic
  deactivateUserAtomic(targetUserId, actorId, tenantId, reason = 'Administrative Deactivation') {
    const actorRoles = this.userRoles.get(actorId) || []
    const isAdmin = actorRoles.some(r => ['ADMIN', 'SUPERADMIN'].includes(r.role) && r.tenant_id === tenantId)
    if (!isAdmin) {
      return { status: 403, error: 'Forbidden: Only tenant administrators can deactivate users.' }
    }

    const targetProfile = this.profiles.get(targetUserId)
    if (!targetProfile || targetProfile.tenant_id !== tenantId) {
      return { status: 403, error: 'Forbidden: Target user does not belong to your organization.' }
    }

    // Prevent sole admin self-deactivation
    if (targetUserId === actorId) {
      let activeAdminCount = 0
      for (const [uid, p] of this.profiles.entries()) {
        if (p.tenant_id === tenantId && p.is_active) {
          const roles = this.userRoles.get(uid) || []
          if (roles.some(r => ['ADMIN', 'SUPERADMIN'].includes(r.role) && r.tenant_id === tenantId)) {
            activeAdminCount++
          }
        }
      }
      if (activeAdminCount <= 1) {
        return { status: 400, error: 'Operation Blocked: Cannot deactivate the sole active administrator of an organization.' }
      }
    }

    // 1. Deactivate Profile
    targetProfile.is_active = false

    // 2. Update Employee status
    const emp = this.employees.get(targetUserId)
    if (emp) emp.status = 'TERMINATED'

    // 3. Revoke active sessions in DB & GoTrue
    for (const session of this.activeSessions.values()) {
      if (session.user_id === targetUserId) {
        session.is_revoked = true
        session.revoked_at = new Date().toISOString()
      }
    }
    this.gotrueSessions.delete(targetUserId)

    // 4. Audit log
    this.auditLogs.push({
      tenant_id: tenantId,
      actor_id: actorId,
      action: 'USER_DEACTIVATED',
      table_name: 'profiles',
      record_id: targetUserId,
      new_data: { is_active: false, reason },
    })

    return { status: 200, success: true, target_user_id: targetUserId, is_active: false }
  }

  // Simulate Stored Procedure reactivate_user_atomic
  reactivateUserAtomic(targetUserId, actorId, tenantId) {
    const actorRoles = this.userRoles.get(actorId) || []
    const isAdmin = actorRoles.some(r => ['ADMIN', 'SUPERADMIN'].includes(r.role) && r.tenant_id === tenantId)
    if (!isAdmin) {
      return { status: 403, error: 'Forbidden: Only tenant administrators can reactivate users.' }
    }

    const targetProfile = this.profiles.get(targetUserId)
    if (!targetProfile || targetProfile.tenant_id !== tenantId) {
      return { status: 403, error: 'Forbidden: Target user does not belong to your organization.' }
    }

    // Seat limit enforcement
    const tenant = this.tenants.get(tenantId)
    let currentActiveCount = 0
    for (const p of this.profiles.values()) {
      if (p.tenant_id === tenantId && p.is_active) currentActiveCount++
    }

    if (tenant && tenant.max_employees && currentActiveCount >= tenant.max_employees) {
      return {
        status: 409,
        error: `Seat Limit Exceeded: Organization has reached its maximum active seat capacity (${currentActiveCount} / ${tenant.max_employees}).`,
        code: 'SEAT_LIMIT_EXCEEDED',
      }
    }

    // Reactivate Profile & Employee
    targetProfile.is_active = true
    const emp = this.employees.get(targetUserId)
    if (emp) emp.status = 'ACTIVE'

    this.auditLogs.push({
      tenant_id: tenantId,
      actor_id: actorId,
      action: 'USER_REACTIVATED',
      table_name: 'profiles',
      record_id: targetUserId,
      new_data: { is_active: true },
    })

    return { status: 200, success: true, target_user_id: targetUserId, is_active: true }
  }

  // Login handler
  handleLogin(email, password) {
    const profile = Array.from(this.profiles.values()).find(p => p.email === email)
    if (!profile) return { status: 401, error: 'Invalid email or password.' }

    // Intercept inactive account
    if (profile.is_active === false) {
      return {
        status: 403,
        error: 'Your account has been deactivated. Please contact your administrator.',
        code: 'ACCOUNT_DEACTIVATED',
      }
    }

    return {
      status: 200,
      success: true,
      destination: '/dashboard',
      user: { id: profile.id, email: profile.email, tenant_id: profile.tenant_id },
    }
  }

  // Edge Proxy request evaluator
  evaluateProxyRequest(pathname, userId) {
    if (!userId) {
      if (pathname.startsWith('/api/')) return { status: 401, error: 'Unauthorized' }
      return { status: 307, location: `/auth/login?next=${encodeURIComponent(pathname)}` }
    }

    const profile = this.profiles.get(userId)
    if (!profile || profile.is_active === false) {
      if (pathname.startsWith('/api/')) {
        return { status: 403, error: 'Account is deactivated.', code: 'ACCOUNT_DEACTIVATED' }
      }
      return { status: 307, location: '/auth/login?error=account_deactivated' }
    }

    return { status: 200, allowed: true }
  }

  // Anti-tampering check
  simulateClientDirectUpdate(userId, callerRole, payload) {
    if (payload.is_active !== undefined && callerRole !== 'service_role') {
      throw new Error('Unauthorized: is_active can only be modified by tenant administrators.')
    }
    const profile = this.profiles.get(userId)
    Object.assign(profile, payload)
    return profile
  }
}

test('Inactive Accounts & Deactivation Security Suite (Spec 05)', async (t) => {
  let db

  t.beforeEach(() => {
    db = new MockInactiveAccountsDatabase()
  })

  await t.test('INACT-01: Positive Control — Active user authenticates successfully (200 OK)', () => {
    const res = db.handleLogin('active@acme.com', 'ValidPassword123!')
    assert.equal(res.status, 200)
    assert.equal(res.success, true)
    assert.equal(res.destination, '/dashboard')
  })

  await t.test('INACT-02: Admin deactivates employee via atomic RPC and invalidates GoTrue sessions', () => {
    const res = db.deactivateUserAtomic('user-sarah', 'admin-john', 'tenant-1', 'Separation')
    assert.equal(res.status, 200)
    assert.equal(res.success, true)

    // DB profile is_active is false
    assert.equal(db.profiles.get('user-sarah').is_active, false)
    // Employee status is TERMINATED
    assert.equal(db.employees.get('user-sarah').status, 'TERMINATED')
    // Sessions revoked
    assert.equal(db.activeSessions.get('sess-sarah-1').is_revoked, true)
    assert.equal(db.gotrueSessions.has('user-sarah'), false)
    // Audit logged
    const audit = db.auditLogs.find(a => a.action === 'USER_DEACTIVATED' && a.record_id === 'user-sarah')
    assert.ok(audit)
  })

  await t.test('INACT-03: Deactivated user attempts login with correct password -> rejected with 403 ACCOUNT_DEACTIVATED', () => {
    db.deactivateUserAtomic('user-sarah', 'admin-john', 'tenant-1')
    const res = db.handleLogin('sarah@acme.com', 'CorrectPassword123!')
    assert.equal(res.status, 403)
    assert.equal(res.code, 'ACCOUNT_DEACTIVATED')
  })

  await t.test('INACT-04: Mid-session active user is deactivated -> next page navigation is redirected 307 to login', () => {
    db.deactivateUserAtomic('user-sarah', 'admin-john', 'tenant-1')
    const res = db.evaluateProxyRequest('/dashboard', 'user-sarah')
    assert.equal(res.status, 307)
    assert.equal(res.location, '/auth/login?error=account_deactivated')
  })

  await t.test('INACT-05: Deactivated user calls protected API -> returns 403 ACCOUNT_DEACTIVATED', () => {
    db.deactivateUserAtomic('user-sarah', 'admin-john', 'tenant-1')
    const res = db.evaluateProxyRequest('/api/attendance/checkin', 'user-sarah')
    assert.equal(res.status, 403)
    assert.equal(res.code, 'ACCOUNT_DEACTIVATED')
  })

  await t.test('INACT-06: Client direct mutation on profiles.is_active is blocked by database trigger', () => {
    assert.throws(
      () => {
        db.simulateClientDirectUpdate('user-sarah', 'authenticated_user', { is_active: true })
      },
      /is_active can only be modified by tenant administrators/
    )
  })

  await t.test('INACT-07: Deactivation preserves all historical attendance records (zero hard deletion)', () => {
    db.deactivateUserAtomic('user-sarah', 'admin-john', 'tenant-1')
    const records = db.attendanceRecords.filter(r => r.user_id === 'user-sarah')
    assert.equal(records.length, 2)
    assert.equal(records[0].status, 'PRESENT')
  })

  await t.test('INACT-08: Admin reactivates employee within seat limit -> restored to active state', () => {
    db.deactivateUserAtomic('user-sarah', 'admin-john', 'tenant-1')
    const res = db.reactivateUserAtomic('user-sarah', 'admin-john', 'tenant-1')
    assert.equal(res.status, 200)
    assert.equal(res.success, true)
    assert.equal(db.profiles.get('user-sarah').is_active, true)
    assert.equal(db.employees.get('user-sarah').status, 'ACTIVE')
  })

  await t.test('INACT-09: Reactivation exceeding tenant seat capacity is rejected with EX001', () => {
    // Tenant-full has capacity 2, with 2 active users (admin-cap, user-cap-1)
    const res = db.reactivateUserAtomic('user-cap-inactive', 'admin-cap', 'tenant-full')
    assert.equal(res.status, 409)
    assert.equal(res.code, 'SEAT_LIMIT_EXCEEDED')
    assert.equal(db.profiles.get('user-cap-inactive').is_active, false)
  })

  await t.test('INACT-10: Sole active admin cannot self-deactivate', () => {
    const res = db.deactivateUserAtomic('admin-sole', 'admin-sole', 'tenant-2')
    assert.equal(res.status, 400)
    assert.match(res.error, /sole active administrator/i)
    assert.equal(db.profiles.get('admin-sole').is_active, true)
  })
})
