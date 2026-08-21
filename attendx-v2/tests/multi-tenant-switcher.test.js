// ============================================================
// AttendX v2 — Multi-Tenant Switcher & Context Isolation Suite
// Spec: docs/specs/13_14_auth_multi_tenant_switcher_spec.md
// Tests: TENANT-01 through TENANT-09 (including Positive Isolation Controls)
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'

class MockMultiTenantDatabase {
  constructor() {
    this.tenants = new Map([
      ['tenant-a', { id: 'tenant-a', name: 'Acme Corporation', slug: 'acme' }],
      ['tenant-b', { id: 'tenant-b', name: 'Beta Technologies', slug: 'beta' }],
      ['tenant-c', { id: 'tenant-c', name: 'Gamma Enterprises', slug: 'gamma' }],
    ])

    this.profiles = new Map([
      ['user-single', { id: 'user-single', tenant_id: 'tenant-a', email: 'single@acme.com', is_active: true, onboarding_completed: true }],
      ['user-multi', { id: 'user-multi', tenant_id: 'tenant-a', email: 'multi@attendx.com', is_active: true, onboarding_completed: true }],
      ['user-multi-b', { id: 'user-multi', tenant_id: 'tenant-b', email: 'multi@attendx.com', is_active: true, onboarding_completed: true }],
      ['user-deact-b', { id: 'user-multi-deact', tenant_id: 'tenant-b', email: 'deact@attendx.com', is_active: false, onboarding_completed: true }],
    ])

    this.userRoles = new Map([
      ['user-single', [{ tenant_id: 'tenant-a', role: 'EMPLOYEE' }]],
      ['user-multi', [
        { tenant_id: 'tenant-a', role: 'EMPLOYEE' },
        { tenant_id: 'tenant-b', role: 'ADMIN' },
      ]],
      ['user-multi-deact', [
        { tenant_id: 'tenant-a', role: 'EMPLOYEE' },
        { tenant_id: 'tenant-b', role: 'EMPLOYEE' },
      ]],
    ])

    this.employees = [
      { id: 'emp-a1', tenant_id: 'tenant-a', name: 'Alice Acme' },
      { id: 'emp-a2', tenant_id: 'tenant-a', name: 'Bob Acme' },
      { id: 'emp-b1', tenant_id: 'tenant-b', name: 'Charlie Beta' },
      { id: 'emp-b2', tenant_id: 'tenant-b', name: 'Diana Beta' },
      { id: 'emp-b3', tenant_id: 'tenant-b', name: 'Eve Beta' },
      { id: 'emp-c1', tenant_id: 'tenant-c', name: 'Frank Gamma' },
    ]

    this.auditLogs = []
  }

  // Implementation of PostgreSQL get_my_tenant_id() (003_rls_hardening.sql)
  getMyTenantId(userId, appMetadataTenantId) {
    if (!userId) return null

    const roles = this.userRoles.get(userId) || []
    if (roles.length === 0) return null

    // 1. Explicit claim evaluation first
    if (appMetadataTenantId) {
      const match = roles.find(r => r.tenant_id === appMetadataTenantId)
      if (match) {
        const profile = Array.from(this.profiles.values()).find(
          p => p.id === userId && p.tenant_id === appMetadataTenantId
        )
        if (profile && profile.is_active) {
          return appMetadataTenantId
        }
      }
      // Explicit claim was provided but is invalid or stale -> fail closed
      return null
    }

    // 2. No explicit claim: single-tenant auto-resolves
    if (roles.length === 1) {
      return roles[0].tenant_id
    }

    // Multi-tenant with no claim -> fail closed (NULL)
    return null
  }

  // Implementation of RPC get_my_available_tenants
  getMyAvailableTenants(userId, currentClaimTenantId) {
    const roles = this.userRoles.get(userId) || []
    const available = []

    for (const r of roles) {
      const profile = Array.from(this.profiles.values()).find(
        p => p.id === userId && p.tenant_id === r.tenant_id
      )
      if (profile && profile.is_active) {
        const tenant = this.tenants.get(r.tenant_id)
        if (tenant) {
          available.push({
            tenant_id: tenant.id,
            tenant_name: tenant.name,
            tenant_slug: tenant.slug,
            role: r.role,
            is_current: currentClaimTenantId ? tenant.id === currentClaimTenantId : false,
          })
        }
      }
    }

    return available
  }

  // Implementation of RPC validate_tenant_membership
  validateTenantMembership(userId, targetTenantId) {
    const roles = this.userRoles.get(userId) || []
    const roleMatch = roles.find(r => r.tenant_id === targetTenantId)
    if (!roleMatch) {
      return { is_valid: false }
    }

    const profile = Array.from(this.profiles.values()).find(
      p => p.id === userId && p.tenant_id === targetTenantId
    )
    if (!profile || !profile.is_active) {
      return { is_valid: false }
    }

    const tenant = this.tenants.get(targetTenantId)
    return {
      is_valid: true,
      resolved_role: roleMatch.role,
      tenant_name: tenant?.name || 'Organization',
    }
  }

  // Switch tenant endpoint
  switchTenant(userId, currentAuth, targetTenantId) {
    const validation = this.validateTenantMembership(userId, targetTenantId)
    if (!validation.is_valid) {
      return { status: 403, error: 'Forbidden: You do not have active membership in this tenant.' }
    }

    // Update app_metadata server-side
    currentAuth.app_metadata = {
      tenant_id: targetTenantId,
      role: validation.resolved_role,
    }

    // Write audit log
    this.auditLogs.push({
      tenant_id: targetTenantId,
      actor_id: userId,
      action: 'TENANT_SWITCHED',
      table_name: 'tenants',
      record_id: targetTenantId,
      new_data: { target_tenant_name: validation.tenant_name, resolved_role: validation.resolved_role },
    })

    const redirectUrl = ['ADMIN', 'SUPERADMIN'].includes(validation.resolved_role)
      ? '/admin'
      : '/dashboard'

    return {
      status: 200,
      success: true,
      active_tenant_id: targetTenantId,
      role: validation.resolved_role,
      redirect_url: redirectUrl,
    }
  }

  // Query database with RLS enforcement
  queryEmployeesRLS(userId, appMetadataTenantId, clientSuppliedQueryTenantId) {
    // RLS resolves authoritative tenant via get_my_tenant_id()
    const resolvedTenantId = this.getMyTenantId(userId, appMetadataTenantId)
    if (!resolvedTenantId) {
      return [] // Fail closed
    }

    // Strict isolation: client query parameter cannot override resolved tenant
    return this.employees.filter(e => e.tenant_id === resolvedTenantId)
  }
}

test('Multi-Tenant Switcher & Context Isolation Suite (Spec 13-14)', async (t) => {
  let db

  t.beforeEach(() => {
    db = new MockMultiTenantDatabase()
  })

  await t.test('TENANT-01: Single-tenant user login -> automatically resolves tenant and grants access', () => {
    const tenantId = db.getMyTenantId('user-single', null)
    assert.equal(tenantId, 'tenant-a')
  })

  await t.test('TENANT-02: Multi-tenant user with no active claim -> fails closed and returns NULL', () => {
    const tenantId = db.getMyTenantId('user-multi', null)
    assert.equal(tenantId, null) // Must fail closed (§13)
  })

  await t.test('TENANT-03: Valid tenant switch (Tenant A -> Tenant B) -> updates app_metadata and resolves new context', () => {
    const authSession = { app_metadata: { tenant_id: 'tenant-a', role: 'EMPLOYEE' } }

    const res = db.switchTenant('user-multi', authSession, 'tenant-b')
    assert.equal(res.status, 200)
    assert.equal(res.success, true)
    assert.equal(res.active_tenant_id, 'tenant-b')
    assert.equal(res.role, 'ADMIN')
    assert.equal(res.redirect_url, '/admin')

    // Verify session updated
    assert.equal(authSession.app_metadata.tenant_id, 'tenant-b')
    assert.equal(authSession.app_metadata.role, 'ADMIN')

    // RLS query now resolves to tenant-b
    const rlsTenant = db.getMyTenantId('user-multi', authSession.app_metadata.tenant_id)
    assert.equal(rlsTenant, 'tenant-b')
  })

  await t.test('TENANT-04: Unauthorized tenant switch attempt -> rejected with 403 Forbidden', () => {
    const authSession = { app_metadata: { tenant_id: 'tenant-a', role: 'EMPLOYEE' } }

    // User is in Tenant A & B, but attempts to switch to Tenant C
    const res = db.switchTenant('user-multi', authSession, 'tenant-c')
    assert.equal(res.status, 403)
    assert.equal(authSession.app_metadata.tenant_id, 'tenant-a') // Context untouched
  })

  await t.test('TENANT-05: Forged tenant UUID injection -> rejected with 403 Forbidden', () => {
    const authSession = { app_metadata: { tenant_id: 'tenant-a', role: 'EMPLOYEE' } }

    const res = db.switchTenant('user-multi', authSession, '00000000-0000-0000-0000-000000000000')
    assert.equal(res.status, 403)
  })

  await t.test('TENANT-06: Cross-tenant URL manipulation (?tenant_id=tenant-b while active in tenant-a) -> returns 0 tenant-b rows', () => {
    // User has active claim for tenant-a, attempts to pass client query for tenant-b
    const rows = db.queryEmployeesRLS('user-multi', 'tenant-a', 'tenant-b')
    // Should ONLY return tenant-a rows (Alice, Bob)
    assert.equal(rows.length, 2)
    assert.ok(rows.every(r => r.tenant_id === 'tenant-a'))
    assert.equal(rows.some(r => r.tenant_id === 'tenant-b'), false)
  })

  await t.test('TENANT-07: Stale tenant claim handling -> membership revoked in DB causes get_my_tenant_id to fail closed', () => {
    // User previously had tenant-b claim, but membership was deleted from userRoles
    db.userRoles.set('user-multi', [{ tenant_id: 'tenant-a', role: 'EMPLOYEE' }])

    const resolved = db.getMyTenantId('user-multi', 'tenant-b')
    assert.equal(resolved, null) // Fails closed
  })

  await t.test('TENANT-08: Deactivated membership in target tenant -> switch rejected with 403 Forbidden', () => {
    const authSession = { app_metadata: { tenant_id: 'tenant-a', role: 'EMPLOYEE' } }

    // user-multi-deact has is_active = false in tenant-b
    const res = db.switchTenant('user-multi-deact', authSession, 'tenant-b')
    assert.equal(res.status, 403)
  })

  await t.test('TENANT-09: Positive Multi-Tenant Isolation Control (§33) -> N_A > 0, N_B > 0, 0 cross-tenant leaks', () => {
    // 1. Positive Control in Tenant A
    const rowsA = db.queryEmployeesRLS('user-multi', 'tenant-a', null)
    assert.equal(rowsA.length, 2) // Alice, Bob
    assert.ok(rowsA.every(r => r.tenant_id === 'tenant-a'))

    // 2. Switch to Tenant B
    const authSession = { app_metadata: { tenant_id: 'tenant-a', role: 'EMPLOYEE' } }
    db.switchTenant('user-multi', authSession, 'tenant-b')

    // 3. Positive Control in Tenant B
    const rowsB = db.queryEmployeesRLS('user-multi', authSession.app_metadata.tenant_id, null)
    assert.equal(rowsB.length, 3) // Charlie, Diana, Eve
    assert.ok(rowsB.every(r => r.tenant_id === 'tenant-b'))

    // 4. Mathematical Zero Leakage Proof
    const aIds = new Set(rowsA.map(r => r.id))
    const bIds = new Set(rowsB.map(r => r.id))
    const intersection = [...aIds].filter(id => bIds.has(id))
    assert.equal(intersection.length, 0)
  })
})
