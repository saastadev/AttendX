// ============================================================
// AttendX v2 — Security Test Fixture & Seed Helpers (Scope E.33)
// Spec: docs/specs/32_33_security_regression_matrix_spec.md
// ============================================================

export interface TestUserEntity {
  id: string
  email: string
  fullName: string
  role: 'SUPERADMIN' | 'ADMIN' | 'HR' | 'MANAGER' | 'EMPLOYEE'
  tenantId: string
  token: string
}

export interface SeededSecurityEnvironment {
  tenantA: {
    id: string
    name: string
    maxEmployees: number
    admin: TestUserEntity
    employee1: TestUserEntity
    employee2: TestUserEntity
    attendanceRecords: Array<{ id: string; employeeId: string; date: string; status: string }>
  }
  tenantB: {
    id: string
    name: string
    maxEmployees: number
    admin: TestUserEntity
    employee1: TestUserEntity
    attendanceRecords: Array<{ id: string; employeeId: string; date: string; status: string }>
  }
  deactivatedUser: TestUserEntity
}

/**
 * Creates deterministic multi-tenant security test fixture state
 * guaranteeing N > 0 real records across all tables to enforce non-vacuous assertions (§33).
 */
export function seedSecurityTestEnvironment(): SeededSecurityEnvironment {
  const tenantAId = '8a31e84d-2a1f-4c12-9c1a-6d1a2b3c4d5e'
  const tenantBId = '1b92c47e-5f3a-4a2b-8d3e-9f0a1b2c3d4e'

  const adminA: TestUserEntity = {
    id: 'e7c2f0d9-952b-436d-9781-645367b6da21',
    email: 'admin.a@acme.com',
    fullName: 'Admin Tenant A',
    role: 'ADMIN',
    tenantId: tenantAId,
    token: 'jwt_mock_token_admin_a',
  }

  const empA1: TestUserEntity = {
    id: 'a1111111-1111-4111-a111-111111111111',
    email: 'emp1.a@acme.com',
    fullName: 'Employee 1 Tenant A',
    role: 'EMPLOYEE',
    tenantId: tenantAId,
    token: 'jwt_mock_token_emp_a1',
  }

  const empA2: TestUserEntity = {
    id: 'a2222222-2222-4222-a222-222222222222',
    email: 'emp2.a@acme.com',
    fullName: 'Employee 2 Tenant A',
    role: 'EMPLOYEE',
    tenantId: tenantAId,
    token: 'jwt_mock_token_emp_a2',
  }

  const adminB: TestUserEntity = {
    id: 'b1111111-1111-4111-b111-111111111111',
    email: 'admin.b@betalabs.com',
    fullName: 'Admin Tenant B',
    role: 'ADMIN',
    tenantId: tenantBId,
    token: 'jwt_mock_token_admin_b',
  }

  const empB1: TestUserEntity = {
    id: 'b2222222-2222-4222-b222-222222222222',
    email: 'emp1.b@betalabs.com',
    fullName: 'Employee 1 Tenant B',
    role: 'EMPLOYEE',
    tenantId: tenantBId,
    token: 'jwt_mock_token_emp_b1',
  }

  const deactUser: TestUserEntity = {
    id: 'd9999999-9999-4999-d999-999999999999',
    email: 'deactivated@acme.com',
    fullName: 'Deactivated User',
    role: 'EMPLOYEE',
    tenantId: tenantAId,
    token: 'jwt_mock_token_deactivated',
  }

  return {
    tenantA: {
      id: tenantAId,
      name: 'Acme Corporation',
      maxEmployees: 2, // At capacity when empA1 + empA2 exist
      admin: adminA,
      employee1: empA1,
      employee2: empA2,
      attendanceRecords: [
        { id: 'att-a1-1', employeeId: empA1.id, date: '2026-08-21', status: 'PRESENT' },
        { id: 'att-a1-2', employeeId: empA1.id, date: '2026-08-20', status: 'PRESENT' },
        { id: 'att-a2-1', employeeId: empA2.id, date: '2026-08-21', status: 'ON_LEAVE' },
      ],
    },
    tenantB: {
      id: tenantBId,
      name: 'Beta Labs',
      maxEmployees: 10,
      admin: adminB,
      employee1: empB1,
      attendanceRecords: [
        { id: 'att-b1-1', employeeId: empB1.id, date: '2026-08-21', status: 'PRESENT' },
      ],
    },
    deactivatedUser: deactUser,
  }
}
