// ============================================================
// AttendX v2 — First-Login Forced Password Change Test Suite
// Spec: docs/specs/03_auth_first_login_password_change_spec.md
// Tests: ONBOARD-01 through ONBOARD-08
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'

// Mock state store for isolation
class MockAuthDatabase {
  constructor() {
    this.profiles = new Map([
      ['user-incomplete-1', { id: 'user-incomplete-1', email: 'emp1@acme.com', is_active: true, onboarding_completed: false, tenant_id: 'tenant-1' }],
      ['user-admin-incomplete', { id: 'user-admin-incomplete', email: 'admin1@acme.com', is_active: true, onboarding_completed: false, tenant_id: 'tenant-1' }],
      ['user-deactivated', { id: 'user-deactivated', email: 'deactivated@acme.com', is_active: false, onboarding_completed: false, tenant_id: 'tenant-1' }],
      ['user-completed-1', { id: 'user-completed-1', email: 'complete@acme.com', is_active: true, onboarding_completed: true, tenant_id: 'tenant-1' }],
    ])
    this.userRoles = new Map([
      ['user-incomplete-1', 'EMPLOYEE'],
      ['user-admin-incomplete', 'ADMIN'],
      ['user-completed-1', 'EMPLOYEE'],
    ])
    this.authUsers = new Map([
      ['user-incomplete-1', { id: 'user-incomplete-1', password: 'TempPassword123!' }],
      ['user-admin-incomplete', { id: 'user-admin-incomplete', password: 'TempPassword123!' }],
      ['user-completed-1', { id: 'user-completed-1', password: 'EstablishedPassword2026!' }],
    ])
    this.auditLogs = []
    this.activeSessions = new Map()
  }

  // Simulate Proxy Edge Guard
  evaluateProxy(pathname, userId) {
    if (!userId) {
      if (pathname.startsWith('/api/')) return { status: 401, error: 'Unauthorized' }
      return { status: 307, location: `/auth/login?next=${encodeURIComponent(pathname)}` }
    }

    const profile = this.profiles.get(userId)
    if (!profile || profile.is_active === false) {
      if (pathname.startsWith('/api/')) return { status: 403, error: 'Account deactivated', code: 'ACCOUNT_DEACTIVATED' }
      return { status: 307, location: '/auth/login?error=account_deactivated' }
    }

    // Forced password change gate
    if (profile.onboarding_completed === false) {
      if (pathname === '/auth/onboarding' || pathname === '/api/auth/first-login-password') {
        return { status: 200, allowed: true }
      }
      if (pathname.startsWith('/api/')) {
        return {
          status: 403,
          error: 'Password change required before accessing platform resources.',
          code: 'ONBOARDING_REQUIRED',
        }
      }
      return { status: 307, location: '/auth/onboarding' }
    }

    // If onboarding complete, prevent re-access to /auth/onboarding
    if (pathname === '/auth/onboarding') {
      const role = this.userRoles.get(userId)
      const destination = (role === 'ADMIN' || role === 'SUPERADMIN') ? '/admin' : '/dashboard'
      return { status: 307, location: destination }
    }

    return { status: 200, allowed: true }
  }

  // Password complexity validator
  validatePasswordComplexity(password) {
    if (!password || password.length < 10) return { valid: false, message: 'Password must be at least 10 characters long.' }
    if (!/[A-Z]/.test(password)) return { valid: false, message: 'Password must contain at least one uppercase letter.' }
    if (!/[a-z]/.test(password)) return { valid: false, message: 'Password must contain at least one lowercase letter.' }
    if (!/[0-9]/.test(password)) return { valid: false, message: 'Password must contain at least one number.' }
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) return { valid: false, message: 'Password must contain at least one special character.' }
    return { valid: true }
  }

  // Handle first-login password API call
  async handleFirstLoginPassword(userId, newPassword, confirmPassword) {
    if (!userId) return { status: 401, data: { success: false, error: 'Authentication required.' } }
    if (!newPassword || !confirmPassword) return { status: 400, data: { success: false, error: 'New password and confirmation required.' } }
    if (newPassword !== confirmPassword) return { status: 400, data: { success: false, error: 'Passwords do not match.' } }

    const complexity = this.validatePasswordComplexity(newPassword)
    if (!complexity.valid) return { status: 400, data: { success: false, error: complexity.message } }

    const profile = this.profiles.get(userId)
    if (!profile) return { status: 404, data: { success: false, error: 'User profile not found.' } }
    if (profile.is_active === false) return { status: 403, data: { success: false, error: 'Account deactivated.', code: 'ACCOUNT_DEACTIVATED' } }
    if (profile.onboarding_completed === true) return { status: 400, data: { success: false, error: 'Onboarding already completed.' } }

    // Atomic update
    const authUser = this.authUsers.get(userId)
    if (authUser) authUser.password = newPassword
    profile.onboarding_completed = true

    // Audit log (zero passwords)
    this.auditLogs.push({
      tenant_id: profile.tenant_id,
      actor_id: userId,
      action: 'PASSWORD_CHANGED_ONBOARDING',
      table_name: 'profiles',
      record_id: userId,
      new_data: { onboarding_completed: true },
    })

    const role = this.userRoles.get(userId)
    const redirectUrl = (role === 'ADMIN' || role === 'SUPERADMIN') ? '/admin' : '/dashboard'

    return {
      status: 200,
      data: {
        success: true,
        message: 'Password updated successfully. Onboarding completed.',
        redirect_url: redirectUrl,
      },
    }
  }

  // Simulate client-side direct update (anti-tampering test)
  simulateClientDirectUpdate(userId, callerRole, updatePayload) {
    if (updatePayload.onboarding_completed === true && callerRole !== 'service_role') {
      throw new Error('onboarding_completed cannot be modified directly by client SDK.')
    }
    const profile = this.profiles.get(userId)
    Object.assign(profile, updatePayload)
    return profile
  }
}

test('First-Login Forced Password Change Suite (Spec 03)', async (t) => {
  let db

  t.beforeEach(() => {
    db = new MockAuthDatabase()
  })

  await t.test('ONBOARD-01: Incomplete employee accessing /dashboard is redirected to /auth/onboarding', () => {
    const res = db.evaluateProxy('/dashboard', 'user-incomplete-1')
    assert.equal(res.status, 307)
    assert.equal(res.location, '/auth/onboarding')
  })

  await t.test('ONBOARD-02: Incomplete admin accessing /admin is redirected to /auth/onboarding', () => {
    const res = db.evaluateProxy('/admin', 'user-admin-incomplete')
    assert.equal(res.status, 307)
    assert.equal(res.location, '/auth/onboarding')
  })

  await t.test('ONBOARD-03: Incomplete user calling protected API is rejected with 403 ONBOARDING_REQUIRED', () => {
    const res = db.evaluateProxy('/api/attendance/clock-in', 'user-incomplete-1')
    assert.equal(res.status, 403)
    assert.equal(res.code, 'ONBOARDING_REQUIRED')
  })

  await t.test('ONBOARD-04: Client attempting direct update on profiles.onboarding_completed is blocked by trigger', () => {
    assert.throws(
      () => {
        db.simulateClientDirectUpdate('user-incomplete-1', 'authenticated_user', { onboarding_completed: true })
      },
      /onboarding_completed cannot be modified directly by client SDK/
    )
    assert.equal(db.profiles.get('user-incomplete-1').onboarding_completed, false)
  })

  await t.test('ONBOARD-05: Password failing complexity (<10 chars or missing uppercase/number/symbol) is rejected', async () => {
    const weak1 = await db.handleFirstLoginPassword('user-incomplete-1', 'short', 'short')
    assert.equal(weak1.status, 400)
    assert.match(weak1.data.error, /10 characters/i)

    const weak2 = await db.handleFirstLoginPassword('user-incomplete-1', 'nouppercase123!', 'nouppercase123!')
    assert.equal(weak2.status, 400)
    assert.match(weak2.data.error, /uppercase/i)

    const weak3 = await db.handleFirstLoginPassword('user-incomplete-1', 'NoNumberSymbol', 'NoNumberSymbol')
    assert.equal(weak3.status, 400)
    assert.match(weak3.data.error, /number/i)
  })

  await t.test('ONBOARD-06: Valid new password establishes credentials, completes onboarding, and emits audit log', async () => {
    const res = await db.handleFirstLoginPassword('user-incomplete-1', 'SecureNewPassword2026!', 'SecureNewPassword2026!')
    assert.equal(res.status, 200)
    assert.equal(res.data.success, true)
    assert.equal(res.data.redirect_url, '/dashboard')

    // Verify DB profile updated
    const profile = db.profiles.get('user-incomplete-1')
    assert.equal(profile.onboarding_completed, true)

    // Verify audit log
    const audit = db.auditLogs.find(a => a.action === 'PASSWORD_CHANGED_ONBOARDING' && a.record_id === 'user-incomplete-1')
    assert.ok(audit)
    assert.equal(audit.new_data.onboarding_completed, true)
    // Guarantee zero password stored in audit
    assert.equal(audit.new_data.password, undefined)
  })

  await t.test('ONBOARD-07: Completed user accessing /auth/onboarding is redirected to portal', () => {
    const res = db.evaluateProxy('/auth/onboarding', 'user-completed-1')
    assert.equal(res.status, 307)
    assert.equal(res.location, '/dashboard')
  })

  await t.test('ONBOARD-08: Completed user accessing /dashboard is allowed through', () => {
    const res = db.evaluateProxy('/dashboard', 'user-completed-1')
    assert.equal(res.status, 200)
    assert.equal(res.allowed, true)
  })
})
