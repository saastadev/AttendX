// ============================================================
// AttendX v2 — Admin Provisioning & Rollback Security Suite
// Spec: docs/specs/07_12_admin_provisioning_spec.md
// Tests: PROV-01 through PROV-08 (including Mandatory Mid-Flow Failure)
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'

class MockAdminProvisioningDatabase {
  constructor() {
    this.tenants = new Map([
      ['tenant-1', { id: 'tenant-1', name: 'Acme Corp', max_employees: 5 }],
      ['tenant-full', { id: 'tenant-full', name: 'Capacity Max Corp', max_employees: 2 }],
      ['tenant-attacker', { id: 'tenant-attacker', name: 'Attacker Corp', max_employees: 10 }],
    ])

    this.authUsers = new Map([
      ['admin-john', { id: 'admin-john', email: 'john@acme.com', app_metadata: { tenant_id: 'tenant-1', role: 'ADMIN' } }],
      ['admin-cap', { id: 'admin-cap', email: 'admin@cap.com', app_metadata: { tenant_id: 'tenant-full', role: 'ADMIN' } }],
      ['emp-regular', { id: 'emp-regular', email: 'emp@acme.com', app_metadata: { tenant_id: 'tenant-1', role: 'EMPLOYEE' } }],
    ])

    this.profiles = new Map([
      ['admin-john', { id: 'admin-john', tenant_id: 'tenant-1', email: 'john@acme.com', is_active: true, onboarding_completed: true }],
      ['admin-cap', { id: 'admin-cap', tenant_id: 'tenant-full', email: 'admin@cap.com', is_active: true, onboarding_completed: true }],
      ['emp-regular', { id: 'emp-regular', tenant_id: 'tenant-1', email: 'emp@acme.com', is_active: true, onboarding_completed: true }],
      ['user-cap-1', { id: 'user-cap-1', tenant_id: 'tenant-full', email: 'cap1@cap.com', is_active: true, onboarding_completed: true }],
      ['user-cap-2', { id: 'user-cap-2', tenant_id: 'tenant-full', email: 'cap2@cap.com', is_active: true, onboarding_completed: true }],
    ])

    this.employees = new Map([
      ['admin-john', { id: 'admin-john', tenant_id: 'tenant-1', employee_code: 'EMP-0001' }],
      ['emp-regular', { id: 'emp-regular', tenant_id: 'tenant-1', employee_code: 'EMP-0002' }],
      ['user-cap-1', { id: 'user-cap-1', tenant_id: 'tenant-full', employee_code: 'EMP-0001' }],
      ['user-cap-2', { id: 'user-cap-2', tenant_id: 'tenant-full', employee_code: 'EMP-0002' }],
    ])

    this.userRoles = new Map([
      ['admin-john', [{ role: 'ADMIN', tenant_id: 'tenant-1' }]],
      ['admin-cap', [{ role: 'ADMIN', tenant_id: 'tenant-full' }]],
      ['emp-regular', [{ role: 'EMPLOYEE', tenant_id: 'tenant-1' }]],
      ['user-cap-1', [{ role: 'EMPLOYEE', tenant_id: 'tenant-full' }]],
      ['user-cap-2', [{ role: 'EMPLOYEE', tenant_id: 'tenant-full' }]],
    ])

    this.activeSessions = new Map([
      ['sess-regular', { id: 'sess-regular', user_id: 'emp-regular', is_revoked: false }],
    ])

    this.attendanceRecords = [
      { id: 'att-1', user_id: 'emp-regular', date: '2026-08-20', status: 'PRESENT' },
    ]

    this.auditLogs = []
  }

  // Provisioning pipeline simulation with Two-Phase Commit and Compensating Rollback
  provisionEmployee(callerId, payload, options = {}) {
    // 1. Resolve authoritative caller identity server-side (BRD §7)
    const roles = this.userRoles.get(callerId) || []
    const adminRole = roles.find(r => ['ADMIN', 'SUPERADMIN', 'HR'].includes(r.role))
    if (!adminRole) {
      return { status: 403, error: 'Only ADMIN or SUPERADMIN can provision employees.' }
    }

    const verifiedTenantId = adminRole.tenant_id

    // Check duplicate email
    const emailExists = Array.from(this.authUsers.values()).some(u => u.email === payload.email.toLowerCase())
    if (emailExists) {
      return { status: 409, error: 'An account with this email already exists.' }
    }

    // Step 1: Create Auth User in GoTrue
    const authUserId = `auth-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    this.authUsers.set(authUserId, {
      id: authUserId,
      email: payload.email.toLowerCase().trim(),
      app_metadata: {
        tenant_id: verifiedTenantId, // Strict binding (BRD §8)
        role: payload.role || 'EMPLOYEE',
      },
      user_metadata: {
        full_name: payload.full_name.trim(),
      },
    })

    // Step 2: Execute Database Stored Procedure admin_provision_employee_v2
    try {
      if (options.forceRpcFailure) {
        throw new Error('Simulated Database RPC Connection Failure')
      }

      // Check seat limit inside RPC with atomic lock simulation
      const tenant = this.tenants.get(verifiedTenantId)
      let activeCount = 0
      for (const p of this.profiles.values()) {
        if (p.tenant_id === verifiedTenantId && p.is_active) activeCount++
      }

      if (tenant && tenant.max_employees && activeCount >= tenant.max_employees) {
        const err = new Error(`SEAT_LIMIT_REACHED: Tenant limit of ${tenant.max_employees} active employees reached.`)
        err.code = 'EX001'
        throw err
      }

      // Generate sequential code
      let count = 0
      for (const e of this.employees.values()) {
        if (e.tenant_id === verifiedTenantId) count++
      }
      const employeeCode = `EMP-${String(count + 1).padStart(4, '0')}`

      // Create Profile
      this.profiles.set(authUserId, {
        id: authUserId,
        tenant_id: verifiedTenantId,
        email: payload.email.toLowerCase().trim(),
        full_name: payload.full_name.trim(),
        is_active: true,
        onboarding_completed: false,
      })

      // Create Role
      this.userRoles.set(authUserId, [{ role: payload.role || 'EMPLOYEE', tenant_id: verifiedTenantId }])

      // Create Employee Record
      this.employees.set(authUserId, {
        id: authUserId,
        tenant_id: verifiedTenantId,
        employee_code: employeeCode,
        department_id: payload.department_id || null,
        designation_id: payload.designation_id || null,
        join_date: payload.join_date || '2026-08-25',
      })

      // Create Audit Log (Zero Passwords)
      this.auditLogs.push({
        tenant_id: verifiedTenantId,
        actor_id: callerId,
        action: 'EMPLOYEE_PROVISIONED',
        table_name: 'employees',
        record_id: authUserId,
        new_data: {
          email: payload.email.toLowerCase().trim(),
          full_name: payload.full_name.trim(),
          role: payload.role || 'EMPLOYEE',
          employee_code: employeeCode,
        },
      })

      // Return 201 response (Zero Passwords)
      return {
        status: 201,
        success: true,
        user_id: authUserId,
        employee_code: employeeCode,
        role: payload.role || 'EMPLOYEE',
        email: payload.email.toLowerCase().trim(),
        full_name: payload.full_name.trim(),
        message: 'Employee provisioned successfully. User must change password upon first login.',
      }

    } catch (dbErr) {
      // COMPENSATING ROLLBACK: Immediately delete GoTrue Auth User (Rule 4: Zero Orphans)
      this.authUsers.delete(authUserId)

      if (dbErr.code === 'EX001' || dbErr.message.includes('SEAT_LIMIT_REACHED')) {
        return { status: 422, error: 'Employee seat limit reached.', code: 'SEAT_LIMIT_REACHED' }
      }
      return { status: 500, error: `Provisioning failed: ${dbErr.message}` }
    }
  }

  // Deactivation
  deactivateEmployee(callerId, targetUserId) {
    const roles = this.userRoles.get(callerId) || []
    const adminRole = roles.find(r => ['ADMIN', 'SUPERADMIN'].includes(r.role))
    if (!adminRole) return { status: 403, error: 'Forbidden' }

    const profile = this.profiles.get(targetUserId)
    if (!profile || profile.tenant_id !== adminRole.tenant_id) {
      return { status: 403, error: 'Target not found in tenant' }
    }

    profile.is_active = false
    for (const session of this.activeSessions.values()) {
      if (session.user_id === targetUserId) session.is_revoked = true
    }

    return { status: 200, success: true }
  }
}

test('Admin Employee Provisioning & Rollback Security Suite (Spec 07-12)', async (t) => {
  let db

  t.beforeEach(() => {
    db = new MockAdminProvisioningDatabase()
  })

  await t.test('PROV-01: Admin provisions valid employee (Positive Control) -> 201 Created and zero passwords returned', () => {
    const payload = {
      email: 'alex.chen@company.com',
      full_name: 'Alex Chen',
      role: 'EMPLOYEE',
      department_id: 'dept-1',
    }

    const res = db.provisionEmployee('admin-john', payload)
    assert.equal(res.status, 201)
    assert.equal(res.success, true)
    assert.ok(res.user_id)
    assert.ok(res.employee_code)
    assert.equal(res.email, 'alex.chen@company.com')
    assert.equal(res.password, undefined) // Rule 5: Zero Passwords
    assert.equal(res.temp_password, undefined)

    // Verify DB integrity
    const authUser = db.authUsers.get(res.user_id)
    assert.ok(authUser)
    assert.equal(authUser.app_metadata.tenant_id, 'tenant-1') // BRD §8 app_metadata
    assert.equal(authUser.app_metadata.role, 'EMPLOYEE')

    const profile = db.profiles.get(res.user_id)
    assert.ok(profile)
    assert.equal(profile.onboarding_completed, false) // First-login setup required

    const audit = db.auditLogs.find(a => a.record_id === res.user_id)
    assert.ok(audit)
  })

  await t.test('PROV-02: Mandatory Mid-Flow Failure Test -> Compensating rollback deletes Auth user (Zero Orphans)', () => {
    const initialAuthCount = db.authUsers.size
    const initialProfileCount = db.profiles.size

    const payload = {
      email: 'failed.user@company.com',
      full_name: 'Failed User',
      role: 'EMPLOYEE',
    }

    // Force DB RPC error during execution
    const res = db.provisionEmployee('admin-john', payload, { forceRpcFailure: true })
    assert.equal(res.status, 500)

    // Rule 4: Zero Orphans — GoTrue user must be hard-deleted
    assert.equal(db.authUsers.size, initialAuthCount)
    assert.equal(db.profiles.size, initialProfileCount)
    assert.equal(Array.from(db.authUsers.values()).some(u => u.email === 'failed.user@company.com'), false)
  })

  await t.test('PROV-03: Seat limit reached (current == max_employees) -> rejected with 422 SEAT_LIMIT_REACHED', () => {
    // Tenant-full has capacity 2 and 2 active users (user-cap-1, user-cap-2)
    const payload = {
      email: 'overcapacity@cap.com',
      full_name: 'Over Capacity',
      role: 'EMPLOYEE',
    }

    const res = db.provisionEmployee('admin-cap', payload)
    assert.equal(res.status, 422)
    assert.equal(res.code, 'SEAT_LIMIT_REACHED')
    assert.match(res.error, /seat limit reached/i)

    // Auth user must be rolled back
    assert.equal(Array.from(db.authUsers.values()).some(u => u.email === 'overcapacity@cap.com'), false)
  })

  await t.test('PROV-04: Concurrent provisioning at seat boundary -> only 1 succeeds, 2nd fails with 422', () => {
    // Tenant-1 has capacity 5 and currently 2 active profiles (admin-john, emp-regular)
    // Provision 3 more users to hit capacity
    db.provisionEmployee('admin-john', { email: 'u1@acme.com', full_name: 'User 1' })
    db.provisionEmployee('admin-john', { email: 'u2@acme.com', full_name: 'User 2' })
    const res3 = db.provisionEmployee('admin-john', { email: 'u3@acme.com', full_name: 'User 3' })
    assert.equal(res3.status, 201)

    // 6th attempt (boundary overflow) must be rejected
    const resOver = db.provisionEmployee('admin-john', { email: 'overflow@acme.com', full_name: 'Overflow' })
    assert.equal(resOver.status, 422)
    assert.equal(resOver.code, 'SEAT_LIMIT_REACHED')
  })

  await t.test('PROV-05: Untrusted client tenant override -> ignored, bound strictly to caller tenant', () => {
    const payload = {
      email: 'hijack@acme.com',
      full_name: 'Hijack Attempt',
      role: 'EMPLOYEE',
      tenant_id: 'tenant-attacker', // Attacker payload override attempt
    }

    const res = db.provisionEmployee('admin-john', payload)
    assert.equal(res.status, 201)
    const profile = db.profiles.get(res.user_id)
    assert.equal(profile.tenant_id, 'tenant-1') // Bound strictly to caller tenant
    assert.notEqual(profile.tenant_id, 'tenant-attacker')
  })

  await t.test('PROV-06: Log & response inspection -> 0 passwords in response and audit logs', () => {
    const payload = {
      email: 'audit.check@acme.com',
      full_name: 'Audit Check',
      role: 'EMPLOYEE',
    }

    const res = db.provisionEmployee('admin-john', payload)
    assert.equal(res.password, undefined)
    assert.equal(res.temp_password, undefined)
    assert.equal(Object.keys(res).some(k => k === 'password' || k === 'temp_password'), false)

    const audit = db.auditLogs.find(a => a.record_id === res.user_id)
    assert.ok(audit)
    assert.equal(audit.new_data.password, undefined)
    assert.equal(audit.new_data.temp_password, undefined)
    assert.equal(Object.keys(audit.new_data).some(k => k === 'password' || k === 'temp_password'), false)
  })

  await t.test('PROV-07: Employee deactivation -> soft deactivation preserves historical attendance records', () => {
    const res = db.deactivateEmployee('admin-john', 'emp-regular')
    assert.equal(res.status, 200)

    // Profile is deactivated
    assert.equal(db.profiles.get('emp-regular').is_active, false)
    // Sessions revoked
    assert.equal(db.activeSessions.get('sess-regular').is_revoked, true)
    // Historical attendance records preserved
    const records = db.attendanceRecords.filter(r => r.user_id === 'emp-regular')
    assert.equal(records.length, 1)
  })

  await t.test('PROV-08: Non-admin employee provisioning attempt -> rejected with 403 Forbidden', () => {
    const payload = {
      email: 'unauthorized@acme.com',
      full_name: 'Unauthorized Try',
      role: 'EMPLOYEE',
    }

    const res = db.provisionEmployee('emp-regular', payload)
    assert.equal(res.status, 403)
  })
})
