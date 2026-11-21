import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveLoginRoles, resolveLoginDestination } from '../lib/auth/login-roles.ts'

test('login never inherits an administrator role from another workspace', () => {
  assert.deepEqual(resolveLoginRoles([
    { tenant_id: 'other', role: 'ADMIN' },
    { tenant_id: 'active', role: 'EMPLOYEE' },
  ], 'active'), ['EMPLOYEE'])
})

test('missing, invalid, and revoked assignments grant no role', () => {
  assert.deepEqual(resolveLoginRoles([], 'active'), [])
  assert.deepEqual(resolveLoginRoles([{ tenant_id: 'active', role: 'OWNER' }], 'active'), [])
  assert.deepEqual(resolveLoginRoles([{ tenant_id: 'other', role: 'ADMIN' }], 'active'), [])
  assert.deepEqual(resolveLoginRoles([{ tenant_id: '', role: 'ADMIN' }], ''), [])
})

test('all five supported roles resolve with deterministic workspace precedence', () => {
  for (const role of ['EMPLOYEE', 'MANAGER', 'HR', 'ADMIN', 'SUPERADMIN']) {
    assert.deepEqual(resolveLoginRoles([{ tenant_id: 'active', role }], 'active'), [role])
  }
  assert.deepEqual(resolveLoginRoles([
    { tenant_id: 'active', role: 'EMPLOYEE' },
    { tenant_id: 'active', role: 'HR' },
    { tenant_id: 'active', role: 'HR' },
  ], 'active'), ['HR', 'EMPLOYEE'])
})

test('login redirects match role permissions and preserve valid deep links', () => {
  assert.equal(resolveLoginDestination('HR', '/hiring/applications?stage=APPLIED'), '/hiring/applications?stage=APPLIED')
  for (const role of ['ADMIN', 'SUPERADMIN', 'MANAGER', 'EMPLOYEE']) {
    assert.notEqual(resolveLoginDestination(role, '/hiring'), '/hiring')
  }
  assert.equal(resolveLoginDestination('MANAGER', '/manager/approvals'), '/manager/approvals')
  assert.equal(resolveLoginDestination('EMPLOYEE', '/admin/users'), '/dashboard')
  assert.equal(resolveLoginDestination('EMPLOYEE', '/employee-360'), '/employee-360')
})

test('redirects reject external URLs, prefix lookalikes and auth loops', () => {
  for (const next of ['https://evil.example', '//evil.example', '/\\evil.example', '/dashboard-evil', '/auth/login', '/dashboard/../../admin']) {
    assert.equal(resolveLoginDestination('EMPLOYEE', next), '/dashboard')
  }
  assert.equal(resolveLoginDestination('UNKNOWN', '/dashboard'), '/auth/login')
})
