// ============================================================
// AttendX v2 — Module 4 Section 4.8: Joining Readiness Guard Test Suite
// Verifies Server-Side Joining Readiness Enforcements:
// 1. Blocked when required document is missing / unverified / rejected
// 2. Blocked when required task is pending / in-progress / skipped
// 3. Succeeds when optional documents are unverified
// 4. Succeeds when optional tasks are incomplete
// 5. Succeeds when all required documents are VERIFIED & all required tasks are COMPLETED
// 6. Blocked conversion guarantees zero partial mutation
// 7. Structured error payload with zero candidate data leakage
// 8. Idempotent re-execution
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  OnboardingService,
  JoiningReadinessError,
} from '../lib/hiring/onboarding-service.ts'
import { HiringStateMachine, HiringStateMachineError } from '../lib/hiring/state-machine.ts'

// Mock Supabase client mimicking tenant and onboarding tables
function createMockClient(initialState) {
  const state = {
    onboarding_processes: [...(initialState.processes || [])],
    onboarding_documents: [...(initialState.documents || [])],
    onboarding_tasks: [...(initialState.tasks || [])],
    job_applications: [...(initialState.applications || [])],
    profiles: [...(initialState.profiles || [])],
    employees: [...(initialState.employees || [])],
    hiring_audit_logs: [],
    hiring_funnel_events: [],
  }

  return {
    state,
    from(tableName) {
      let currentTable = state[tableName] || []
      let filters = []
      let isSingle = false
      let isMaybeSingle = false

      const queryBuilder = {
        select(fields) {
          return queryBuilder
        },
        eq(column, value) {
          filters.push({ column, value })
          return queryBuilder
        },
        order() {
          return queryBuilder
        },
        limit(n) {
          return queryBuilder
        },
        single() {
          isSingle = true
          return this.execute()
        },
        maybeSingle() {
          isMaybeSingle = true
          return this.execute()
        },
        then(resolve, reject) {
          return this.execute().then(resolve, reject)
        },
        async execute() {
          let rows = currentTable.filter(row => {
            return filters.every(f => row[f.column] === f.value)
          })

          if (isSingle) {
            if (rows.length === 0) {
              return { data: null, error: new Error(`Row not found in ${tableName}`) }
            }
            return { data: JSON.parse(JSON.stringify(rows[0])), error: null }
          }
          if (isMaybeSingle) {
            return { data: rows[0] ? JSON.parse(JSON.stringify(rows[0])) : null, error: null }
          }
          return { data: JSON.parse(JSON.stringify(rows)), error: null }
        },
        insert(payload) {
          const inserted = Array.isArray(payload) ? payload : [payload]
          const records = inserted.map(item => ({
            id: item.id || `mock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            created_at: new Date().toISOString(),
            ...item,
          }))
          state[tableName].push(...records)
          const insertBuilder = {
            select() {
              return {
                single: async () => ({ data: records[0], error: null }),
                maybeSingle: async () => ({ data: records[0], error: null }),
                then: (res, rej) => Promise.resolve({ data: records, error: null }).then(res, rej),
              }
            },
            then(resolve, reject) {
              return Promise.resolve({ data: records, error: null }).then(resolve, reject)
            },
          }
          return insertBuilder
        },
        update(payload) {
          const updateBuilder = {
            eq(column, value) {
              filters.push({ column, value })
              const matched = currentTable.filter(row => {
                return filters.every(f => row[f.column] === f.value)
              })
              matched.forEach(row => Object.assign(row, payload))
              return updateBuilder
            },
            select() {
              return {
                single: async () => ({ data: currentTable.find(r => filters.every(f => r[f.column] === f.value)), error: null }),
                maybeSingle: async () => ({ data: currentTable.find(r => filters.every(f => r[f.column] === f.value)), error: null }),
                then: (res, rej) => Promise.resolve({ data: currentTable.filter(r => filters.every(f => r[f.column] === f.value)), error: null }).then(res, rej),
              }
            },
            then(resolve, reject) {
              const matched = currentTable.filter(row => {
                return filters.every(f => row[f.column] === f.value)
              })
              matched.forEach(row => Object.assign(row, payload))
              return Promise.resolve({ data: matched, error: null }).then(resolve, reject)
            },
          }
          return updateBuilder
        },
        async upsert(payload) {
          const item = Array.isArray(payload) ? payload[0] : payload
          const existingIdx = currentTable.findIndex(row => row.id === item.id)
          if (existingIdx >= 0) {
            Object.assign(currentTable[existingIdx], item)
          } else {
            currentTable.push(item)
          }
          return {
            select() {
              return {
                maybeSingle: async () => ({ data: item, error: null }),
                single: async () => ({ data: item, error: null }),
              }
            },
            data: item,
            error: null,
          }
        },
      }

      return queryBuilder
    },
  }
}

test('MODULE 4 SECTION 4.8: JOINING READINESS & AUTOMATED ONBOARDING', async (t) => {
  const ORG_A = '11111111-1111-1111-1111-111111111111'
  const ORG_B = '22222222-2222-2222-2222-222222222222'
  const ONBOARD_ID = 'onboard-test-100'
  const APP_ID = 'app-test-100'

  // Helper to build standard test setup
  function getBaseFixture() {
    return {
      processes: [
        {
          id: ONBOARD_ID,
          organization_id: ORG_A,
          application_id: APP_ID,
          candidate_id: 'cand-1',
          status: 'IN_PROGRESS',
          completion_percentage: 20,
          candidate: { id: 'cand-1', first_name: 'David', last_name: 'Miller', email: 'david.miller@example.com' },
          offer: { id: 'off-1', joining_date: '2026-11-01', designation: 'Senior Engineer' },
          application: { id: APP_ID, stage: 'DOCUMENTS_VERIFIED' },
        },
      ],
      applications: [
        { id: APP_ID, organization_id: ORG_A, stage: 'DOCUMENTS_VERIFIED' },
      ],
      profiles: [],
      employees: [],
      documents: [],
      tasks: [],
    }
  }

  // ------------------------------------------------------------
  // TEST 1: Blocked when required documents are missing (none configured)
  // ------------------------------------------------------------
  await t.test('TC-ONBOARD-01: Blocked when zero required documents exist for process', async () => {
    const fixture = getBaseFixture()
    // 0 documents, 1 completed task
    fixture.tasks = [
      { id: 't-1', organization_id: ORG_A, onboarding_id: ONBOARD_ID, task_name: 'IT Setup', category: 'IT', status: 'COMPLETED', is_required: true },
    ]
    const client = createMockClient(fixture)

    const readiness = await OnboardingService.getJoiningReadiness(client, ORG_A, ONBOARD_ID)
    assert.equal(readiness.ready, false)
    assert.equal(readiness.unverified_documents.length, 1)
    assert.equal(readiness.unverified_documents[0].status, 'MISSING')

    await assert.rejects(
      () => OnboardingService.convertToEmployee(client, ORG_A, 'caller-hr', 'HR', {
        onboarding_id: ONBOARD_ID,
        work_email: 'david.m@acme.com',
      }),
      (err) => {
        assert.ok(err instanceof JoiningReadinessError)
        assert.equal(err.status, 400)
        assert.equal(err.code, 'JOINING_READINESS_INCOMPLETE')
        assert.equal(err.readiness.ready, false)
        return true
      }
    )
  })

  // ------------------------------------------------------------
  // TEST 2: Blocked when required document is NOT_SUBMITTED
  // ------------------------------------------------------------
  await t.test('TC-ONBOARD-02: Blocked when required document is NOT_SUBMITTED', async () => {
    const fixture = getBaseFixture()
    fixture.documents = [
      { id: 'd-1', organization_id: ORG_A, onboarding_id: ONBOARD_ID, document_type: 'ID_PROOF', document_name: 'Passport', status: 'NOT_SUBMITTED', is_required: true },
    ]
    fixture.tasks = [
      { id: 't-1', organization_id: ORG_A, onboarding_id: ONBOARD_ID, task_name: 'IT Setup', category: 'IT', status: 'COMPLETED', is_required: true },
    ]
    const client = createMockClient(fixture)

    const readiness = await OnboardingService.getJoiningReadiness(client, ORG_A, ONBOARD_ID)
    assert.equal(readiness.ready, false)
    assert.equal(readiness.unverified_documents.length, 1)
    assert.equal(readiness.unverified_documents[0].status, 'NOT_SUBMITTED')

    await assert.rejects(
      () => OnboardingService.convertToEmployee(client, ORG_A, 'caller-hr', 'HR', {
        onboarding_id: ONBOARD_ID,
        work_email: 'david.m@acme.com',
      }),
      JoiningReadinessError
    )
  })

  // ------------------------------------------------------------
  // TEST 3: Blocked when required document is SUBMITTED (pending review)
  // ------------------------------------------------------------
  await t.test('TC-ONBOARD-03: Blocked when required document is SUBMITTED but not yet VERIFIED', async () => {
    const fixture = getBaseFixture()
    fixture.documents = [
      { id: 'd-1', organization_id: ORG_A, onboarding_id: ONBOARD_ID, document_type: 'ID_PROOF', document_name: 'Passport', status: 'SUBMITTED', is_required: true },
    ]
    fixture.tasks = [
      { id: 't-1', organization_id: ORG_A, onboarding_id: ONBOARD_ID, task_name: 'IT Setup', category: 'IT', status: 'COMPLETED', is_required: true },
    ]
    const client = createMockClient(fixture)

    const readiness = await OnboardingService.getJoiningReadiness(client, ORG_A, ONBOARD_ID)
    assert.equal(readiness.ready, false)
    assert.equal(readiness.unverified_documents[0].status, 'SUBMITTED')

    await assert.rejects(
      () => OnboardingService.convertToEmployee(client, ORG_A, 'caller-hr', 'HR', {
        onboarding_id: ONBOARD_ID,
        work_email: 'david.m@acme.com',
      }),
      JoiningReadinessError
    )
  })

  // ------------------------------------------------------------
  // TEST 4: Blocked when required document is REJECTED
  // ------------------------------------------------------------
  await t.test('TC-ONBOARD-04: Blocked when required document is REJECTED', async () => {
    const fixture = getBaseFixture()
    fixture.documents = [
      { id: 'd-1', organization_id: ORG_A, onboarding_id: ONBOARD_ID, document_type: 'ID_PROOF', document_name: 'Passport', status: 'REJECTED', is_required: true },
    ]
    fixture.tasks = [
      { id: 't-1', organization_id: ORG_A, onboarding_id: ONBOARD_ID, task_name: 'IT Setup', category: 'IT', status: 'COMPLETED', is_required: true },
    ]
    const client = createMockClient(fixture)

    const readiness = await OnboardingService.getJoiningReadiness(client, ORG_A, ONBOARD_ID)
    assert.equal(readiness.ready, false)
    assert.equal(readiness.unverified_documents[0].status, 'REJECTED')

    await assert.rejects(
      () => OnboardingService.convertToEmployee(client, ORG_A, 'caller-hr', 'HR', {
        onboarding_id: ONBOARD_ID,
        work_email: 'david.m@acme.com',
      }),
      JoiningReadinessError
    )
  })

  // ------------------------------------------------------------
  // TEST 5: Blocked when required task is PENDING
  // ------------------------------------------------------------
  await t.test('TC-ONBOARD-05: Blocked when required task is PENDING', async () => {
    const fixture = getBaseFixture()
    fixture.documents = [
      { id: 'd-1', organization_id: ORG_A, onboarding_id: ONBOARD_ID, document_type: 'ID_PROOF', document_name: 'Passport', status: 'VERIFIED', is_required: true },
    ]
    fixture.tasks = [
      { id: 't-1', organization_id: ORG_A, onboarding_id: ONBOARD_ID, task_name: 'Provision Email', category: 'IT', status: 'PENDING', is_required: true },
    ]
    const client = createMockClient(fixture)

    const readiness = await OnboardingService.getJoiningReadiness(client, ORG_A, ONBOARD_ID)
    assert.equal(readiness.ready, false)
    assert.equal(readiness.incomplete_tasks.length, 1)
    assert.equal(readiness.incomplete_tasks[0].status, 'PENDING')

    await assert.rejects(
      () => OnboardingService.convertToEmployee(client, ORG_A, 'caller-hr', 'HR', {
        onboarding_id: ONBOARD_ID,
        work_email: 'david.m@acme.com',
      }),
      JoiningReadinessError
    )
  })

  // ------------------------------------------------------------
  // TEST 6: Blocked when required task is IN_PROGRESS
  // ------------------------------------------------------------
  await t.test('TC-ONBOARD-06: Blocked when required task is IN_PROGRESS', async () => {
    const fixture = getBaseFixture()
    fixture.documents = [
      { id: 'd-1', organization_id: ORG_A, onboarding_id: ONBOARD_ID, document_type: 'ID_PROOF', document_name: 'Passport', status: 'VERIFIED', is_required: true },
    ]
    fixture.tasks = [
      { id: 't-1', organization_id: ORG_A, onboarding_id: ONBOARD_ID, task_name: 'Provision Email', category: 'IT', status: 'IN_PROGRESS', is_required: true },
    ]
    const client = createMockClient(fixture)

    const readiness = await OnboardingService.getJoiningReadiness(client, ORG_A, ONBOARD_ID)
    assert.equal(readiness.ready, false)
    assert.equal(readiness.incomplete_tasks[0].status, 'IN_PROGRESS')

    await assert.rejects(
      () => OnboardingService.convertToEmployee(client, ORG_A, 'caller-hr', 'HR', {
        onboarding_id: ONBOARD_ID,
        work_email: 'david.m@acme.com',
      }),
      JoiningReadinessError
    )
  })

  // ------------------------------------------------------------
  // TEST 7: Blocked when required task is SKIPPED
  // ------------------------------------------------------------
  await t.test('TC-ONBOARD-07: Blocked when required task is SKIPPED (not COMPLETED)', async () => {
    const fixture = getBaseFixture()
    fixture.documents = [
      { id: 'd-1', organization_id: ORG_A, onboarding_id: ONBOARD_ID, document_type: 'ID_PROOF', document_name: 'Passport', status: 'VERIFIED', is_required: true },
    ]
    fixture.tasks = [
      { id: 't-1', organization_id: ORG_A, onboarding_id: ONBOARD_ID, task_name: 'Mandatory Compliance Training', category: 'HR', status: 'SKIPPED', is_required: true },
    ]
    const client = createMockClient(fixture)

    const readiness = await OnboardingService.getJoiningReadiness(client, ORG_A, ONBOARD_ID)
    assert.equal(readiness.ready, false)
    assert.equal(readiness.incomplete_tasks[0].status, 'SKIPPED')

    await assert.rejects(
      () => OnboardingService.convertToEmployee(client, ORG_A, 'caller-hr', 'HR', {
        onboarding_id: ONBOARD_ID,
        work_email: 'david.m@acme.com',
      }),
      JoiningReadinessError
    )
  })

  // ------------------------------------------------------------
  // TEST 8: Succeeds when optional documents are unverified / rejected
  // ------------------------------------------------------------
  await t.test('TC-ONBOARD-08: Conversion SUCCEEDS when optional documents are unverified', async () => {
    const fixture = getBaseFixture()
    fixture.documents = [
      { id: 'd-1', organization_id: ORG_A, onboarding_id: ONBOARD_ID, document_type: 'ID_PROOF', document_name: 'Passport', status: 'VERIFIED', is_required: true },
      { id: 'd-2', organization_id: ORG_A, onboarding_id: ONBOARD_ID, document_type: 'PHOTO', document_name: 'Optional Headshot', status: 'NOT_SUBMITTED', is_required: false },
      { id: 'd-3', organization_id: ORG_A, onboarding_id: ONBOARD_ID, document_type: 'RESUME', document_name: 'Optional Additional Cert', status: 'REJECTED', is_required: false },
    ]
    fixture.tasks = [
      { id: 't-1', organization_id: ORG_A, onboarding_id: ONBOARD_ID, task_name: 'IT Setup', category: 'IT', status: 'COMPLETED', is_required: true },
    ]
    const client = createMockClient(fixture)

    const readiness = await OnboardingService.getJoiningReadiness(client, ORG_A, ONBOARD_ID)
    assert.equal(readiness.ready, true)
    assert.equal(readiness.unverified_documents.length, 0)

    const result = await OnboardingService.convertToEmployee(client, ORG_A, 'caller-hr', 'HR', {
      onboarding_id: ONBOARD_ID,
      work_email: 'david.m@acme.com',
    })

    assert.equal(result.success, true)
    assert.equal(result.stage, 'ONBOARDED')
    assert.ok(result.employeeId)
  })

  // ------------------------------------------------------------
  // TEST 9: Succeeds when optional tasks are incomplete
  // ------------------------------------------------------------
  await t.test('TC-ONBOARD-09: Conversion SUCCEEDS when optional tasks are incomplete (pending/skipped)', async () => {
    const fixture = getBaseFixture()
    fixture.documents = [
      { id: 'd-1', organization_id: ORG_A, onboarding_id: ONBOARD_ID, document_type: 'ID_PROOF', document_name: 'Passport', status: 'VERIFIED', is_required: true },
    ]
    fixture.tasks = [
      { id: 't-1', organization_id: ORG_A, onboarding_id: ONBOARD_ID, task_name: 'IT Setup', category: 'IT', status: 'COMPLETED', is_required: true },
      { id: 't-2', organization_id: ORG_A, onboarding_id: ONBOARD_ID, task_name: 'Welcome Lunch with Team', category: 'ORIENTATION', status: 'PENDING', is_required: false },
      { id: 't-3', organization_id: ORG_A, onboarding_id: ONBOARD_ID, task_name: 'Optional Swag Box Delivery', category: 'ADMIN', status: 'SKIPPED', is_required: false },
    ]
    const client = createMockClient(fixture)

    const readiness = await OnboardingService.getJoiningReadiness(client, ORG_A, ONBOARD_ID)
    assert.equal(readiness.ready, true)
    assert.equal(readiness.incomplete_tasks.length, 0)

    const result = await OnboardingService.convertToEmployee(client, ORG_A, 'caller-hr', 'HR', {
      onboarding_id: ONBOARD_ID,
      work_email: 'david.m@acme.com',
    })

    assert.equal(result.success, true)
    assert.equal(result.stage, 'ONBOARDED')
  })

  // ------------------------------------------------------------
  // TEST 10: Full Success — All required docs VERIFIED & required tasks COMPLETED
  // ------------------------------------------------------------
  await t.test('TC-ONBOARD-10: Conversion SUCCEEDS when all required documents are VERIFIED & tasks COMPLETED', async () => {
    const fixture = getBaseFixture()
    fixture.documents = [
      { id: 'd-1', organization_id: ORG_A, onboarding_id: ONBOARD_ID, document_type: 'ID_PROOF', document_name: 'Passport', status: 'VERIFIED', is_required: true },
      { id: 'd-2', organization_id: ORG_A, onboarding_id: ONBOARD_ID, document_type: 'EDUCATION_CERTIFICATE', document_name: 'Degree', status: 'VERIFIED', is_required: true },
      { id: 'd-3', organization_id: ORG_A, onboarding_id: ONBOARD_ID, document_type: 'BANK_DETAILS', document_name: 'Bank Copy', status: 'VERIFIED', is_required: true },
    ]
    fixture.tasks = [
      { id: 't-1', organization_id: ORG_A, onboarding_id: ONBOARD_ID, task_name: 'IT Setup', category: 'IT', status: 'COMPLETED', is_required: true },
      { id: 't-2', organization_id: ORG_A, onboarding_id: ONBOARD_ID, task_name: 'BGV Verification', category: 'HR', status: 'COMPLETED', is_required: true },
    ]
    const client = createMockClient(fixture)

    const readiness = await OnboardingService.getJoiningReadiness(client, ORG_A, ONBOARD_ID)
    assert.equal(readiness.ready, true)
    assert.equal(readiness.verified_required_documents, 3)
    assert.equal(readiness.completed_required_tasks, 2)

    const result = await OnboardingService.convertToEmployee(client, ORG_A, 'caller-hr', 'HR', {
      onboarding_id: ONBOARD_ID,
      work_email: 'david.miller@acme.com',
    })

    assert.equal(result.success, true)
    assert.equal(result.stage, 'ONBOARDED')
    assert.ok(result.employeeId)

    // Process state in client
    const processRow = client.state.onboarding_processes.find(p => p.id === ONBOARD_ID)
    assert.equal(processRow.status, 'COMPLETED')
    assert.equal(processRow.completion_percentage, 100)
    assert.equal(processRow.employee_id, result.employeeId)

    // Application state in client
    const appRow = client.state.job_applications.find(a => a.id === APP_ID)
    assert.equal(appRow.stage, 'ONBOARDED')

    // Audit log written
    const auditLogs = client.state.hiring_audit_logs.filter(l => l.action === 'CONVERT_TO_EMPLOYEE')
    assert.equal(auditLogs.length, 1)
    assert.equal(auditLogs[0].organization_id, ORG_A)

    // Funnel event written
    const funnelEvents = client.state.hiring_funnel_events.filter(f => f.to_stage === 'ONBOARDED')
    assert.equal(funnelEvents.length, 1)
  })

  // ------------------------------------------------------------
  // TEST 11: Blocked conversion leaves DB untouched (Zero Partial Mutation)
  // ------------------------------------------------------------
  await t.test('TC-ONBOARD-11: Blocked conversion leaves database untouched (Zero Partial Mutation)', async () => {
    const fixture = getBaseFixture()
    fixture.documents = [
      { id: 'd-1', organization_id: ORG_A, onboarding_id: ONBOARD_ID, document_type: 'ID_PROOF', document_name: 'Passport', status: 'NOT_SUBMITTED', is_required: true },
    ]
    fixture.tasks = [
      { id: 't-1', organization_id: ORG_A, onboarding_id: ONBOARD_ID, task_name: 'IT Setup', category: 'IT', status: 'PENDING', is_required: true },
    ]
    const client = createMockClient(fixture)

    const beforeProcess = JSON.parse(JSON.stringify(client.state.onboarding_processes[0]))
    const beforeApp = JSON.parse(JSON.stringify(client.state.job_applications[0]))
    const beforeEmployeesCount = client.state.employees.length
    const beforeProfilesCount = client.state.profiles.length
    const beforeAuditCount = client.state.hiring_audit_logs.length

    await assert.rejects(
      () => OnboardingService.convertToEmployee(client, ORG_A, 'caller-hr', 'HR', {
        onboarding_id: ONBOARD_ID,
        work_email: 'david.m@acme.com',
      }),
      JoiningReadinessError
    )

    // Verify zero mutations occurred
    assert.deepEqual(client.state.onboarding_processes[0], beforeProcess)
    assert.deepEqual(client.state.job_applications[0], beforeApp)
    assert.equal(client.state.employees.length, beforeEmployeesCount)
    assert.equal(client.state.profiles.length, beforeProfilesCount)
    assert.equal(client.state.hiring_audit_logs.length, beforeAuditCount)
  })

  // ------------------------------------------------------------
  // TEST 12: Tenant Isolation — cannot access or convert process in other tenant
  // ------------------------------------------------------------
  await t.test('TC-ONBOARD-12: Tenant isolation blocks cross-tenant conversion attempts', async () => {
    const fixture = getBaseFixture()
    fixture.documents = [
      { id: 'd-1', organization_id: ORG_A, onboarding_id: ONBOARD_ID, document_type: 'ID_PROOF', document_name: 'Passport', status: 'VERIFIED', is_required: true },
    ]
    fixture.tasks = [
      { id: 't-1', organization_id: ORG_A, onboarding_id: ONBOARD_ID, task_name: 'IT Setup', category: 'IT', status: 'COMPLETED', is_required: true },
    ]
    const client = createMockClient(fixture)

    // Caller from ORG_B tries to convert process in ORG_A
    await assert.rejects(
      () => OnboardingService.convertToEmployee(client, ORG_B, 'caller-hr', 'HR', {
        onboarding_id: ONBOARD_ID,
        work_email: 'david.m@acme.com',
      }),
      (err) => {
        assert.equal(err.status, 404)
        assert.match(err.message, /not found/i)
        return true
      }
    )
  })

  // ------------------------------------------------------------
  // TEST 13: Zero Data Leakage in Structured Error Payload
  // ------------------------------------------------------------
  await t.test('TC-ONBOARD-13: JoiningReadinessError contains safe metadata without sensitive PII leakage', async () => {
    const fixture = getBaseFixture()
    fixture.documents = [
      { id: 'd-1', organization_id: ORG_A, onboarding_id: ONBOARD_ID, document_type: 'ID_PROOF', document_name: 'Passport Copy', status: 'NOT_SUBMITTED', is_required: true },
    ]
    fixture.tasks = [
      { id: 't-1', organization_id: ORG_A, onboarding_id: ONBOARD_ID, task_name: 'Setup Workstation', category: 'IT', status: 'PENDING', is_required: true },
    ]
    const client = createMockClient(fixture)

    let caughtErr = null
    try {
      await OnboardingService.convertToEmployee(client, ORG_A, 'caller-hr', 'HR', {
        onboarding_id: ONBOARD_ID,
        work_email: 'david.m@acme.com',
      })
    } catch (err) {
      caughtErr = err
    }

    assert.ok(caughtErr instanceof JoiningReadinessError)
    const payload = caughtErr.readiness

    // Check payload structure
    assert.equal(payload.ready, false)
    assert.equal(typeof payload.total_required_documents, 'number')
    assert.equal(typeof payload.total_required_tasks, 'number')
    assert.ok(Array.isArray(payload.unverified_documents))
    assert.ok(Array.isArray(payload.incomplete_tasks))
    assert.ok(Array.isArray(payload.reasons))

    // Assert safe metadata only (no candidate personal PII, salaries, tokens)
    const serialized = JSON.stringify(payload)
    assert.equal(serialized.includes('David'), false)
    assert.equal(serialized.includes('david.miller@example.com'), false)
    assert.equal(serialized.includes('token'), false)
    assert.equal(serialized.includes('salary'), false)
  })

  // ------------------------------------------------------------
  // TEST 14: Idempotency — repeated conversion requests do not duplicate records
  // ------------------------------------------------------------
  await t.test('TC-ONBOARD-14: Repeated conversion returns cleanly without duplicate employees', async () => {
    const fixture = getBaseFixture()
    fixture.documents = [
      { id: 'd-1', organization_id: ORG_A, onboarding_id: ONBOARD_ID, document_type: 'ID_PROOF', document_name: 'Passport', status: 'VERIFIED', is_required: true },
    ]
    fixture.tasks = [
      { id: 't-1', organization_id: ORG_A, onboarding_id: ONBOARD_ID, task_name: 'IT Setup', category: 'IT', status: 'COMPLETED', is_required: true },
    ]
    const client = createMockClient(fixture)

    // Call 1
    const res1 = await OnboardingService.convertToEmployee(client, ORG_A, 'caller-hr', 'HR', {
      onboarding_id: ONBOARD_ID,
      work_email: 'david.m@acme.com',
    })
    assert.equal(res1.success, true)

    const empCount1 = client.state.employees.length

    // Call 2 (idempotent)
    const res2 = await OnboardingService.convertToEmployee(client, ORG_A, 'caller-hr', 'HR', {
      onboarding_id: ONBOARD_ID,
      work_email: 'david.m@acme.com',
    })
    assert.equal(res2.success, true)
    assert.equal(res2.already_completed, true)
    assert.equal(res2.employeeId, res1.employeeId)

    // No new employee created
    assert.equal(client.state.employees.length, empCount1)
  })
})
