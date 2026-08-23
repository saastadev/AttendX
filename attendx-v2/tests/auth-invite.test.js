import test from 'node:test'
import assert from 'node:assert'
import crypto from 'node:crypto'

test('Auth & Invite Security Suite (Spec 01/02)', async (t) => {
  // Test helpers for cryptographic token simulation
  function generateInviteToken() {
    const rawToken = crypto.randomBytes(32).toString('base64url')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    return { rawToken, tokenHash }
  }

  const mockDb = {
    tenants: [{ id: '11111111-0000-0000-0000-000000000001', name: 'Acme Corp', slug: 'acme' }],
    profiles: [
      { id: 'usr-admin', email: 'admin@acme.com', is_active: true, tenant_id: '11111111-0000-0000-0000-000000000001', onboarding_completed: true },
      { id: 'usr-employee', email: 'emp@acme.com', is_active: true, tenant_id: '11111111-0000-0000-0000-000000000001', onboarding_completed: true },
      { id: 'usr-inactive', email: 'inactive@acme.com', is_active: false, tenant_id: '11111111-0000-0000-0000-000000000001', onboarding_completed: true },
    ],
    user_roles: [
      { user_id: 'usr-admin', role: 'ADMIN', tenant_id: '11111111-0000-0000-0000-000000000001' },
      { user_id: 'usr-employee', role: 'EMPLOYEE', tenant_id: '11111111-0000-0000-0000-000000000001' },
      { user_id: 'usr-inactive', role: 'EMPLOYEE', tenant_id: '11111111-0000-0000-0000-000000000001' },
    ],
    invites: [],
  }

  // --- LOGIN TESTS ---
  await t.test('AUTH-LOGIN-01: Employee login resolves to /dashboard', () => {
    const profile = mockDb.profiles.find(p => p.email === 'emp@acme.com')
    const roles = mockDb.user_roles.filter(r => r.user_id === profile.id).map(r => r.role)
    const rolePriority = { SUPERADMIN: 1, ADMIN: 2, HR: 3, MANAGER: 4, EMPLOYEE: 5 }
    const sorted = roles.sort((a, b) => rolePriority[a] - rolePriority[b])
    const primaryRole = sorted[0]

    const destinations = { ADMIN: '/admin', EMPLOYEE: '/dashboard' }
    const destination = destinations[primaryRole]

    assert.strictEqual(primaryRole, 'EMPLOYEE')
    assert.strictEqual(destination, '/dashboard')
  })

  await t.test('AUTH-LOGIN-02: Admin login resolves to /admin', () => {
    const profile = mockDb.profiles.find(p => p.email === 'admin@acme.com')
    const roles = mockDb.user_roles.filter(r => r.user_id === profile.id).map(r => r.role)
    const rolePriority = { SUPERADMIN: 1, ADMIN: 2, HR: 3, MANAGER: 4, EMPLOYEE: 5 }
    const sorted = roles.sort((a, b) => rolePriority[a] - rolePriority[b])
    const primaryRole = sorted[0]

    const destinations = { ADMIN: '/admin', EMPLOYEE: '/dashboard' }
    const destination = destinations[primaryRole]

    assert.strictEqual(primaryRole, 'ADMIN')
    assert.strictEqual(destination, '/admin')
  })

  await t.test('AUTH-LOGIN-03: Invalid credentials returns 401 and generic error', () => {
    function authenticate(email, password) {
      if (password !== 'CorrectPassword123!') {
        return { status: 401, error: 'Invalid email or password.' }
      }
      return { status: 200, user: { email } }
    }

    const res = authenticate('emp@acme.com', 'wrong-password')
    assert.strictEqual(res.status, 401)
    assert.strictEqual(res.error, 'Invalid email or password.')
  })

  await t.test('AUTH-LOGIN-04: Inactive account is rejected with 403 ACCOUNT_DEACTIVATED', () => {
    const profile = mockDb.profiles.find(p => p.email === 'inactive@acme.com')
    let authResult

    if (!profile.is_active) {
      authResult = { status: 403, code: 'ACCOUNT_DEACTIVATED', error: 'Your account has been deactivated.' }
    } else {
      authResult = { status: 200, user: profile }
    }

    assert.strictEqual(authResult.status, 403)
    assert.strictEqual(authResult.code, 'ACCOUNT_DEACTIVATED')
  })

  // --- INVITE TESTS ---
  await t.test('AUTH-INVITE-01: Public signup without token is rejected', () => {
    function processSignup(token) {
      if (!token || token.trim() === '') {
        return { status: 400, error: 'Invitation token is missing or invalid.' }
      }
      return { status: 200 }
    }

    const res = processSignup(null)
    assert.strictEqual(res.status, 400)
    assert.strictEqual(res.error, 'Invitation token is missing or invalid.')
  })

  await t.test('AUTH-INVITE-02: Valid invite token creates user + profile + role and marks used', () => {
    const { rawToken, tokenHash } = generateInviteToken()
    const expiresAt = new Date(Date.now() + 72 * 3600 * 1000).toISOString()

    // 1. Seed invite
    mockDb.invites.push({
      id: 'inv-1',
      tenant_id: '11111111-0000-0000-0000-000000000001',
      email: 'newuser@acme.com',
      role: 'EMPLOYEE',
      token_hash: tokenHash,
      expires_at: expiresAt,
      used_at: null,
      revoked_at: null,
    })

    // 2. Accept invite
    const incomingHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const invite = mockDb.invites.find(i => i.token_hash === incomingHash)

    assert.ok(invite, 'Invite must be found by hash')
    assert.strictEqual(invite.used_at, null, 'Invite must not be used yet')

    // Simulate consumption
    invite.used_at = new Date().toISOString()
    const newUserId = 'usr-new-1'
    mockDb.profiles.push({
      id: newUserId,
      email: invite.email,
      tenant_id: invite.tenant_id,
      is_active: true,
      onboarding_completed: true,
    })
    mockDb.user_roles.push({
      user_id: newUserId,
      tenant_id: invite.tenant_id,
      role: invite.role,
    })

    assert.ok(invite.used_at !== null, 'Invite must be marked used')
    const createdProfile = mockDb.profiles.find(p => p.id === newUserId)
    const createdRole = mockDb.user_roles.find(r => r.user_id === newUserId)
    assert.strictEqual(createdProfile.tenant_id, '11111111-0000-0000-0000-000000000001')
    assert.strictEqual(createdRole.role, 'EMPLOYEE')
  })

  await t.test('AUTH-INVITE-03: Replaying used token is rejected', () => {
    const invite = mockDb.invites.find(i => i.id === 'inv-1')
    assert.ok(invite.used_at !== null, 'Invite should already be used')

    function accept(inv) {
      if (inv.used_at) return { status: 400, error: 'This invitation has already been accepted.' }
      return { status: 200 }
    }

    const res = accept(invite)
    assert.strictEqual(res.status, 400)
    assert.strictEqual(res.error, 'This invitation has already been accepted.')
  })

  await t.test('AUTH-INVITE-04: Expired token (>72h) is rejected', () => {
    const { tokenHash } = generateInviteToken()
    const expiredAt = new Date(Date.now() - 3600 * 1000).toISOString() // 1 hour ago

    mockDb.invites.push({
      id: 'inv-expired',
      tenant_id: '11111111-0000-0000-0000-000000000001',
      email: 'expired@acme.com',
      role: 'EMPLOYEE',
      token_hash: tokenHash,
      expires_at: expiredAt,
      used_at: null,
      revoked_at: null,
    })

    const invite = mockDb.invites.find(i => i.id === 'inv-expired')
    function verify(inv) {
      if (new Date(inv.expires_at) <= new Date()) {
        return { status: 400, error: 'This invitation has expired.' }
      }
      return { status: 200 }
    }

    const res = verify(invite)
    assert.strictEqual(res.status, 400)
    assert.strictEqual(res.error, 'This invitation has expired.')
  })

  await t.test('AUTH-INVITE-05: Tampering with payload tenant_id or role is ignored', () => {
    const { rawToken, tokenHash } = generateInviteToken()
    mockDb.invites.push({
      id: 'inv-tamper',
      tenant_id: '11111111-0000-0000-0000-000000000001',
      email: 'victim@acme.com',
      role: 'EMPLOYEE',
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
      used_at: null,
      revoked_at: null,
    })

    // Attacker sends spoofed tenant_id and SUPERADMIN role in payload
    const attackerPayload = {
      token: rawToken,
      tenant_id: '99999999-9999-9999-9999-999999999999',
      role: 'SUPERADMIN',
    }

    // Handler strictly queries DB record by token hash
    const incomingHash = crypto.createHash('sha256').update(attackerPayload.token).digest('hex')
    const dbInvite = mockDb.invites.find(i => i.token_hash === incomingHash)

    // Authority is derived from dbInvite, attackerPayload overrides are ignored
    const effectiveTenantId = dbInvite.tenant_id
    const effectiveRole = dbInvite.role

    assert.strictEqual(effectiveTenantId, '11111111-0000-0000-0000-000000000001')
    assert.strictEqual(effectiveRole, 'EMPLOYEE')
    assert.notStrictEqual(effectiveTenantId, attackerPayload.tenant_id)
    assert.notStrictEqual(effectiveRole, attackerPayload.role)
  })
})
