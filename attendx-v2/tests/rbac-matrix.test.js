// ============================================================
// AttendX v2 — RBAC Defense-in-Depth Matrix Test Suite
// Spec: docs/specs/14_scope_d_rbac_matrix_spec.md
// Tests: RBAC-01 through RBAC-10 (Dual Security Boundaries: Proxy + RLS)
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import { RbacGuard, ROLE_HIERARCHY } from '../lib/auth/rbac-guard.ts'

class MockRbacSecurityDatabase {
  constructor() {
    this.tenants = new Map([
      ['tenant-a', { id: 'tenant-a', name: 'Acme Corp' }],
      ['tenant-b', { id: 'tenant-b', name: 'Beta Labs' }],
    ])

    this.profiles = new Map([
      ['emp-alice', { id: 'emp-alice', tenant_id: 'tenant-a', email: 'alice@acme.com', is_active: true }],
      ['hr-bob', { id: 'hr-bob', tenant_id: 'tenant-a', email: 'bob@acme.com', is_active: true }],
      ['mgr-charlie', { id: 'mgr-charlie', tenant_id: 'tenant-a', email: 'charlie@acme.com', is_active: true }],
      ['admin-diana', { id: 'admin-diana', tenant_id: 'tenant-a', email: 'diana@acme.com', is_active: true }],
      ['admin-beta', { id: 'admin-beta', tenant_id: 'tenant-b', email: 'admin@beta.com', is_active: true }],
      ['emp-dan', { id: 'emp-dan', tenant_id: 'tenant-a', email: 'dan@acme.com', is_active: true }],
    ])

    this.employees = new Map([
      ['emp-alice', { id: 'emp-alice', tenant_id: 'tenant-a', manager_id: 'mgr-charlie', department: 'Engineering' }],
      ['emp-dan', { id: 'emp-dan', tenant_id: 'tenant-a', manager_id: 'mgr-other', department: 'Marketing' }],
      ['mgr-charlie', { id: 'mgr-charlie', tenant_id: 'tenant-a', manager_id: 'admin-diana', department: 'Engineering' }],
      ['hr-bob', { id: 'hr-bob', tenant_id: 'tenant-a', manager_id: 'admin-diana', department: 'HR' }],
      ['admin-diana', { id: 'admin-diana', tenant_id: 'tenant-a', manager_id: null, department: 'Executive' }],
    ])

    this.userRoles = new Map([
      ['emp-alice', [{ tenant_id: 'tenant-a', role: 'EMPLOYEE' }]],
      ['hr-bob', [{ tenant_id: 'tenant-a', role: 'HR' }]],
      ['mgr-charlie', [{ tenant_id: 'tenant-a', role: 'MANAGER' }]],
      ['admin-diana', [{ tenant_id: 'tenant-a', role: 'ADMIN' }]],
      ['admin-beta', [{ tenant_id: 'tenant-b', role: 'ADMIN' }]],
    ])

    this.auditLogs = [
      { id: 'log-a1', tenant_id: 'tenant-a', action: 'LOGIN', actor_id: 'admin-diana' },
      { id: 'log-a2', tenant_id: 'tenant-a', action: 'EMPLOYEE_PROVISIONED', actor_id: 'admin-diana' },
      { id: 'log-b1', tenant_id: 'tenant-b', action: 'TENANT_CREATED', actor_id: 'admin-beta' },
    ]

    this.attendanceRecords = [
      { id: 'att-alice', tenant_id: 'tenant-a', employee_id: 'emp-alice', date: '2026-08-20' },
      { id: 'att-dan', tenant_id: 'tenant-a', employee_id: 'emp-dan', date: '2026-08-20' },
    ]
  }

  // Boundary 1: Edge Proxy Simulation
  evaluateProxyRoute(userId, targetPath) {
    const roles = (this.userRoles.get(userId) || []).map(r => r.role)
    if (roles.length === 0) {
      return { status: 307, redirect: '/auth/login' }
    }

    const ROLE_ROUTES = {
      '/admin': ['SUPERADMIN', 'ADMIN'],
      '/hr': ['SUPERADMIN', 'ADMIN', 'HR'],
      '/manager': ['SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'],
    }

    const matched = Object.entries(ROLE_ROUTES).find(([prefix]) => targetPath.startsWith(prefix))
    if (matched) {
      const [, allowed] = matched
      if (!RbacGuard.isAuthorizedForRoute(roles, allowed)) {
        return { status: 307, redirect: '/unauthorized' }
      }
    }

    return { status: 200, render: targetPath }
  }

  // Boundary 2: Direct PostgreSQL RLS Simulation
  queryAuditLogRLS(userId, callerTenantId) {
    const userRoleObjs = this.userRoles.get(userId) || []
    const match = userRoleObjs.find(r => r.tenant_id === callerTenantId)
    if (!match) return [] // Fail closed

    // RLS Policy: audit_log_admin_read USING (tenant_id = get_my_tenant_id() AND has_role('ADMIN', 'SUPERADMIN'))
    if (!['ADMIN', 'SUPERADMIN'].includes(match.role)) {
      return [] // Exactly 0 rows for non-admin
    }

    return this.auditLogs.filter(l => l.tenant_id === callerTenantId)
  }

  // Attendance Manager RLS
  queryManagerAttendanceRLS(userId, callerTenantId) {
    const userRoleObjs = this.userRoles.get(userId) || []
    const match = userRoleObjs.find(r => r.tenant_id === callerTenantId)
    if (!match) return []

    // HR / Admin see all in tenant
    if (['HR', 'ADMIN', 'SUPERADMIN'].includes(match.role)) {
      return this.attendanceRecords.filter(a => a.tenant_id === callerTenantId)
    }

    // Manager sees only direct reports
    if (match.role === 'MANAGER') {
      const directReports = Array.from(this.employees.values())
        .filter(e => e.tenant_id === callerTenantId && e.manager_id === userId)
        .map(e => e.id)

      return this.attendanceRecords.filter(
        a => a.tenant_id === callerTenantId && directReports.includes(a.employee_id)
      )
    }

    // Self only
    return this.attendanceRecords.filter(
      a => a.tenant_id === callerTenantId && a.employee_id === userId
    )
  }

  // API Call simulation with server-side authorization check
  executeApi(userId, targetTenantId, endpoint, method, payload = {}) {
    const userRoleObjs = this.userRoles.get(userId) || []
    const match = userRoleObjs.find(r => r.tenant_id === targetTenantId)
    if (!match) {
      return { status: 403, error: 'Forbidden' }
    }

    const callerRole = match.role

    if (endpoint.startsWith('/api/admin/employees')) {
      if (method === 'PATCH') {
        // Admin only for role changes; HR cannot escalate to Admin
        if (payload.new_role === 'ADMIN' && callerRole !== 'ADMIN' && callerRole !== 'SUPERADMIN') {
          return { status: 403, error: 'Only ADMIN can assign ADMIN role' }
        }
        if (!['ADMIN', 'SUPERADMIN'].includes(callerRole)) {
          return { status: 403, error: 'Forbidden' }
        }
        return { status: 200, success: true }
      }
      if (method === 'GET') {
        if (!['ADMIN', 'SUPERADMIN', 'HR'].includes(callerRole)) {
          return { status: 403, error: 'Forbidden' }
        }
        return { status: 200, data: Array.from(this.profiles.values()).filter(p => p.tenant_id === targetTenantId) }
      }
    }

    if (endpoint.startsWith('/api/admin/attendance/records') && method === 'DELETE') {
      if (!['ADMIN', 'SUPERADMIN'].includes(callerRole)) {
        return { status: 403, error: 'Forbidden: Admin privilege required' }
      }
      return { status: 200, success: true }
    }

    return { status: 404, error: 'Not found' }
  }
}

test('RBAC Defense-in-Depth Matrix Suite (Spec 14 / Scope D)', async (t) => {
  let db

  t.beforeEach(() => {
    db = new MockRbacSecurityDatabase()
  })

  await t.test('RBAC-01: Employee visits /dashboard -> Positive Control (200 OK)', () => {
    const res = db.evaluateProxyRoute('emp-alice', '/dashboard')
    assert.equal(res.status, 200)
    assert.equal(res.render, '/dashboard')
  })

  await t.test('RBAC-02: Employee attempts /admin -> Boundary 1 Test (307 Redirect /unauthorized)', () => {
    const res = db.evaluateProxyRoute('emp-alice', '/admin/users')
    assert.equal(res.status, 307)
    assert.equal(res.redirect, '/unauthorized')
  })

  await t.test('RBAC-03: Employee bypasses proxy to query Admin DB directly -> Boundary 2 Test (RLS returns 0 rows)', () => {
    // Direct SQL client query on audit_log
    const rows = db.queryAuditLogRLS('emp-alice', 'tenant-a')
    assert.equal(rows.length, 0) // Boundary 2 independently guarantees 0 leaked rows
  })

  await t.test('RBAC-04: Employee attempts to delete attendance record -> 403 Forbidden', () => {
    const res = db.executeApi('emp-alice', 'tenant-a', '/api/admin/attendance/records', 'DELETE')
    assert.equal(res.status, 403)
  })

  await t.test('RBAC-05: HR accesses workforce employee list -> Positive Control (200 OK with N rows)', () => {
    const res = db.executeApi('hr-bob', 'tenant-a', '/api/admin/employees', 'GET')
    assert.equal(res.status, 200)
    assert.ok(res.data.length > 0)
    assert.ok(res.data.every(p => p.tenant_id === 'tenant-a'))
  })

  await t.test('RBAC-06: HR attempts to change Admin role -> 403 Forbidden (Escalation Guard)', () => {
    const res = db.executeApi('hr-bob', 'tenant-a', '/api/admin/employees/emp-alice', 'PATCH', { new_role: 'ADMIN' })
    assert.equal(res.status, 403)
  })

  await t.test('RBAC-07: Manager accesses direct reports -> Returns direct report roster only', () => {
    // Manager Charlie only manages Alice (not Dan)
    const records = db.queryManagerAttendanceRLS('mgr-charlie', 'tenant-a')
    assert.equal(records.length, 1)
    assert.equal(records[0].employee_id, 'emp-alice')
  })

  await t.test('RBAC-08: Admin accesses full tenant audit log -> Positive Control (Returns N rows for caller tenant)', () => {
    const rows = db.queryAuditLogRLS('admin-diana', 'tenant-a')
    assert.equal(rows.length, 2)
    assert.ok(rows.every(r => r.tenant_id === 'tenant-a'))
  })

  await t.test('RBAC-09: Cross-Tenant Admin Access Attempt -> Admin of Tenant A querying Tenant B returns 0 rows', () => {
    // Admin Diana has role in Tenant A only, attempts to query Tenant B audit log
    const rows = db.queryAuditLogRLS('admin-diana', 'tenant-b')
    assert.equal(rows.length, 0)
  })

  await t.test('RBAC-10: Role Revocation Mid-Session -> DB downgrade immediately rejects privileged API call with 403', () => {
    // 1. Initial State: Diana is Admin
    const preRevoke = db.executeApi('admin-diana', 'tenant-a', '/api/admin/attendance/records', 'DELETE')
    assert.equal(preRevoke.status, 200)

    // 2. Role downgraded in Database
    db.userRoles.set('admin-diana', [{ tenant_id: 'tenant-a', role: 'EMPLOYEE' }])

    // 3. Next API call evaluates against live DB state
    const postRevoke = db.executeApi('admin-diana', 'tenant-a', '/api/admin/attendance/records', 'DELETE')
    assert.equal(postRevoke.status, 403)
  })

  await t.test('RBAC-ENGINE: Multi-role hierarchy deterministic resolution', () => {
    assert.equal(RbacGuard.resolvePrimaryRole(['EMPLOYEE', 'MANAGER']), 'MANAGER')
    assert.equal(RbacGuard.resolvePrimaryRole(['MANAGER', 'HR']), 'HR')
    assert.equal(RbacGuard.resolvePrimaryRole(['HR', 'ADMIN']), 'ADMIN')
    assert.equal(RbacGuard.resolvePrimaryRole(['ADMIN', 'SUPERADMIN']), 'SUPERADMIN')
    assert.equal(RbacGuard.hasPrivilege('ADMIN', 'HR'), true)
    assert.equal(RbacGuard.hasPrivilege('HR', 'ADMIN'), false)
  })
})
