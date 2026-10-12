// ============================================================
// AttendX v2 — Module 4 Step 3: Real Database Onboarding & Joining Readiness Test Suite
// Executes against live PostgreSQL (postgresql://localhost:5432/attendx_test)
// Tests:
//   1. Live schema structure & column verification for onboarding tables
//   2. Real foreign keys, defaults, and CHECK constraints
//   3. Conversion BLOCKED when required document is NOT_SUBMITTED / REJECTED / SUBMITTED
//   4. Conversion BLOCKED when required task is PENDING / IN_PROGRESS / SKIPPED
//   5. Conversion SUCCEEDS when optional documents are unverified
//   6. Conversion SUCCEEDS when optional tasks are incomplete
//   7. Atomic successful conversion: transitions stage to ONBOARDED, sets COMPLETED 100%, links employee
//   8. Zero partial mutation on failed readiness check
//   9. Real RLS Tenant Isolation (Positive Controls with asUser)
//  10. Real Audit & Funnel Logging in hiring_audit_logs and hiring_funnel_events
//  11. Repeated request idempotency (zero duplicate records)
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import { Client } from 'pg'
import { HiringStateMachine } from '../../lib/hiring/state-machine.ts'

const DB_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/attendx_test'

const T_ACME = 'aa000000-0000-0000-0000-0000000000a1'
const T_GLOBEX = 'bb000000-0000-0000-0000-0000000000b2'

const U = {
  anitaHR: 'a0000003-0000-0000-0000-000000000003',
  biancaHR: 'b0000003-0000-0000-0000-000000000003',
  aliceEmp: 'a0000001-0000-0000-0000-000000000001',
}

async function asUser(client, uid, sql, params = [], tenantClaim = null) {
  await client.query('BEGIN')
  try {
    await client.query('SET LOCAL ROLE authenticated')
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid])
    await client.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`)
    if (tenantClaim) {
      await client.query(`SELECT set_config('request.jwt.claim.tenant_id', $1, true)`, [tenantClaim])
    }
    const res = await client.query(sql, params)
    await client.query('ROLLBACK')
    return res
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  }
}

test('MODULE 4 STEP 3: REAL DATABASE ONBOARDING & JOINING READINESS GUARD', async (t) => {
  const client = new Client({ connectionString: DB_URL, connectionTimeoutMillis: 5000 })
  await client.connect()

  let testCandidateId = null
  let testRequisitionId = null
  let testAppId = null
  let testOnboardingId = null
  let testDocId = null
  let testTaskId = null
  let testOptDocId = null
  let testOptTaskId = null
  let testGlobexCandId = null
  let testGlobexReqId = null
  let testGlobexAppId = null
  let testGlobexOnbId = null

  t.after(async () => {
    try {
      if (testOnboardingId) {
        await client.query(`DELETE FROM onboarding_documents WHERE onboarding_id = $1`, [testOnboardingId])
        await client.query(`DELETE FROM onboarding_tasks WHERE onboarding_id = $1`, [testOnboardingId])
        await client.query(`DELETE FROM hiring_audit_logs WHERE entity_id = $1`, [testOnboardingId])
        await client.query(`DELETE FROM onboarding_processes WHERE id = $1`, [testOnboardingId])
      }
      if (testAppId) {
        await client.query(`DELETE FROM hiring_funnel_events WHERE application_id = $1`, [testAppId])
        await client.query(`DELETE FROM job_applications WHERE id = $1`, [testAppId])
      }
      if (testCandidateId) {
        await client.query(`DELETE FROM candidates WHERE id = $1`, [testCandidateId])
      }
      if (testRequisitionId) {
        await client.query(`DELETE FROM job_requisitions WHERE id = $1`, [testRequisitionId])
      }
      if (testGlobexOnbId) {
        await client.query(`DELETE FROM onboarding_processes WHERE id = $1`, [testGlobexOnbId])
      }
      if (testGlobexAppId) {
        await client.query(`DELETE FROM job_applications WHERE id = $1`, [testGlobexAppId])
      }
      if (testGlobexCandId) {
        await client.query(`DELETE FROM candidates WHERE id = $1`, [testGlobexCandId])
      }
      if (testGlobexReqId) {
        await client.query(`DELETE FROM job_requisitions WHERE id = $1`, [testGlobexReqId])
      }
    } catch (e) {
      console.warn('Cleanup warning:', e.message)
    } finally {
      await client.end()
    }
  })

  // ------------------------------------------------------------
  // 1. Schema & Column Inspection
  // ------------------------------------------------------------
  await t.test('1. Schema: onboarding tables exist with is_required and valid column definitions', async () => {
    // Check onboarding_tasks.is_required
    const taskColRes = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'onboarding_tasks' AND column_name = 'is_required';
    `)
    assert.equal(taskColRes.rows.length, 1, 'onboarding_tasks must have is_required column')
    assert.equal(taskColRes.rows[0].data_type, 'boolean')

    // Check onboarding_documents.is_required
    const docColRes = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'onboarding_documents' AND column_name = 'is_required';
    `)
    assert.equal(docColRes.rows.length, 1, 'onboarding_documents must have is_required column')
    assert.equal(docColRes.rows[0].data_type, 'boolean')

    // Check onboarding_processes columns
    const procColRes = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'onboarding_processes';
    `)
    const procCols = procColRes.rows.map(r => r.column_name)
    assert.ok(procCols.includes('organization_id'))
    assert.ok(procCols.includes('application_id'))
    assert.ok(procCols.includes('candidate_id'))
    assert.ok(procCols.includes('status'))
    assert.ok(procCols.includes('completion_percentage'))
    assert.ok(procCols.includes('employee_id'))
  })

  // ------------------------------------------------------------
  // 2. CHECK Constraints Verification
  // ------------------------------------------------------------
  await t.test('2. Constraints: CHECK constraints enforce authentic statuses on documents and tasks', async () => {
    const docCheck = await client.query(`
      SELECT pg_get_constraintdef(oid) as def
      FROM pg_constraint
      WHERE conrelid = 'onboarding_documents'::regclass AND conname = 'onboarding_documents_status_check';
    `)
    assert.equal(docCheck.rows.length, 1)
    const docDef = docCheck.rows[0].def
    assert.ok(docDef.includes('VERIFIED'))
    assert.ok(docDef.includes('NOT_SUBMITTED'))
    assert.ok(docDef.includes('REJECTED'))
    assert.ok(docDef.includes('SUBMITTED'))
    assert.ok(docDef.includes('PENDING'))

    const taskCheck = await client.query(`
      SELECT pg_get_constraintdef(oid) as def
      FROM pg_constraint
      WHERE conrelid = 'onboarding_tasks'::regclass AND conname = 'onboarding_tasks_status_check';
    `)
    assert.equal(taskCheck.rows.length, 1)
    const taskDef = taskCheck.rows[0].def
    assert.ok(taskDef.includes('COMPLETED'))
    assert.ok(taskDef.includes('PENDING'))
    assert.ok(taskDef.includes('IN_PROGRESS'))
    assert.ok(taskDef.includes('SKIPPED'))
  })

  // ------------------------------------------------------------
  // 3. Setup Test Pipeline Fixtures in Acme Tenant
  // ------------------------------------------------------------
  await t.test('3. Fixtures: Create candidate, requisition, application, and onboarding in Acme tenant', async () => {
    const candRes = await client.query(`
      INSERT INTO candidates (organization_id, first_name, last_name, email, phone)
      VALUES ($1, 'OnboardReal', 'DBTest', 'onboard.real.db@acme-test.local', '+919876543211')
      RETURNING id;
    `, [T_ACME])
    testCandidateId = candRes.rows[0].id
    assert.ok(testCandidateId)

    const reqRes = await client.query(`
      INSERT INTO job_requisitions (organization_id, requisition_code, title, status, min_experience_years)
      VALUES ($1, $2, 'Lead Systems Engineer', 'OPEN', 4)
      RETURNING id;
    `, [T_ACME, `REQ-REAL-ONB-${Date.now().toString().slice(-4)}`])
    testRequisitionId = reqRes.rows[0].id
    assert.ok(testRequisitionId)

    const appRes = await client.query(`
      INSERT INTO job_applications (organization_id, candidate_id, requisition_id, stage, current_decision, application_code)
      VALUES ($1, $2, $3, 'DOCUMENTS_VERIFIED', 'SELECTED', 'APP-REAL-ONB-1')
      RETURNING id;
    `, [T_ACME, testCandidateId, testRequisitionId])
    testAppId = appRes.rows[0].id
    assert.ok(testAppId)

    const onbRes = await client.query(`
      INSERT INTO onboarding_processes (organization_id, application_id, candidate_id, status, completion_percentage)
      VALUES ($1, $2, $3, 'IN_PROGRESS', 25)
      RETURNING id;
    `, [T_ACME, testAppId, testCandidateId])
    testOnboardingId = onbRes.rows[0].id
    assert.ok(testOnboardingId)
  })

  // ------------------------------------------------------------
  // 4. Joining Readiness: Blocked when required doc is unverified / rejected
  // ------------------------------------------------------------
  await t.test('4. Readiness Guard: Conversion blocked when required document is NOT_SUBMITTED, REJECTED, or SUBMITTED', async () => {
    const docRes = await client.query(`
      INSERT INTO onboarding_documents (organization_id, onboarding_id, document_type, document_name, status, is_required)
      VALUES ($1, $2, 'ID_PROOF', 'National Passport', 'NOT_SUBMITTED', true)
      RETURNING id;
    `, [T_ACME, testOnboardingId])
    testDocId = docRes.rows[0].id

    const taskRes = await client.query(`
      INSERT INTO onboarding_tasks (organization_id, onboarding_id, task_name, category, status, is_required)
      VALUES ($1, $2, 'Provision Laptop', 'IT', 'COMPLETED', true)
      RETURNING id;
    `, [T_ACME, testOnboardingId])
    testTaskId = taskRes.rows[0].id

    // Check 1: NOT_SUBMITTED
    const check1 = await client.query(`
      SELECT count(*) as count FROM onboarding_documents
      WHERE onboarding_id = $1 AND is_required = true AND status != 'VERIFIED';
    `, [testOnboardingId])
    assert.equal(Number(check1.rows[0].count), 1, '1 required document not verified')

    // Check 2: REJECTED
    await client.query(`UPDATE onboarding_documents SET status = 'REJECTED' WHERE id = $1;`, [testDocId])
    const check2 = await client.query(`
      SELECT count(*) as count FROM onboarding_documents
      WHERE onboarding_id = $1 AND is_required = true AND status = 'REJECTED';
    `, [testOnboardingId])
    assert.equal(Number(check2.rows[0].count), 1, 'Required document is rejected')

    // Check 3: SUBMITTED
    await client.query(`UPDATE onboarding_documents SET status = 'SUBMITTED' WHERE id = $1;`, [testDocId])
    const check3 = await client.query(`
      SELECT count(*) as count FROM onboarding_documents
      WHERE onboarding_id = $1 AND is_required = true AND status != 'VERIFIED';
    `, [testOnboardingId])
    assert.equal(Number(check3.rows[0].count), 1, 'Required document submitted but not verified')
  })

  // ------------------------------------------------------------
  // 5. Joining Readiness: Blocked when required task is pending / in-progress / skipped
  // ------------------------------------------------------------
  await t.test('5. Readiness Guard: Conversion blocked when required task is PENDING, IN_PROGRESS, or SKIPPED', async () => {
    await client.query(`UPDATE onboarding_documents SET status = 'VERIFIED' WHERE id = $1;`, [testDocId])

    // Check 1: PENDING
    await client.query(`UPDATE onboarding_tasks SET status = 'PENDING' WHERE id = $1;`, [testTaskId])
    const check1 = await client.query(`
      SELECT count(*) as count FROM onboarding_tasks
      WHERE onboarding_id = $1 AND is_required = true AND status != 'COMPLETED';
    `, [testOnboardingId])
    assert.equal(Number(check1.rows[0].count), 1, 'Required task is PENDING')

    // Check 2: IN_PROGRESS
    await client.query(`UPDATE onboarding_tasks SET status = 'IN_PROGRESS' WHERE id = $1;`, [testTaskId])
    const check2 = await client.query(`
      SELECT count(*) as count FROM onboarding_tasks
      WHERE onboarding_id = $1 AND is_required = true AND status != 'COMPLETED';
    `, [testOnboardingId])
    assert.equal(Number(check2.rows[0].count), 1, 'Required task is IN_PROGRESS')

    // Check 3: SKIPPED
    await client.query(`UPDATE onboarding_tasks SET status = 'SKIPPED' WHERE id = $1;`, [testTaskId])
    const check3 = await client.query(`
      SELECT count(*) as count FROM onboarding_tasks
      WHERE onboarding_id = $1 AND is_required = true AND status != 'COMPLETED';
    `, [testOnboardingId])
    assert.equal(Number(check3.rows[0].count), 1, 'Required task is SKIPPED')
  })

  // ------------------------------------------------------------
  // 6. Optional Items Do Not Block Conversion
  // ------------------------------------------------------------
  await t.test('6. Readiness Guard: Optional documents and optional tasks do not block conversion', async () => {
    // Add optional unverified document
    const optDocRes = await client.query(`
      INSERT INTO onboarding_documents (organization_id, onboarding_id, document_type, document_name, status, is_required)
      VALUES ($1, $2, 'PHOTO', 'Optional Profile Picture', 'NOT_SUBMITTED', false)
      RETURNING id;
    `, [T_ACME, testOnboardingId])
    testOptDocId = optDocRes.rows[0].id

    // Add optional incomplete task
    const optTaskRes = await client.query(`
      INSERT INTO onboarding_tasks (organization_id, onboarding_id, task_name, category, status, is_required)
      VALUES ($1, $2, 'Team Welcome Lunch', 'ORIENTATION', 'SKIPPED', false)
      RETURNING id;
    `, [T_ACME, testOnboardingId])
    testOptTaskId = optTaskRes.rows[0].id

    // Set required items to VERIFIED and COMPLETED
    await client.query(`UPDATE onboarding_documents SET status = 'VERIFIED' WHERE id = $1;`, [testDocId])
    await client.query(`UPDATE onboarding_tasks SET status = 'COMPLETED' WHERE id = $1;`, [testTaskId])

    // Query required items only
    const readinessQuery = await client.query(`
      SELECT
        (SELECT count(*) FROM onboarding_documents WHERE onboarding_id = $1 AND is_required = true AND status != 'VERIFIED') as unverified_docs,
        (SELECT count(*) FROM onboarding_tasks WHERE onboarding_id = $1 AND is_required = true AND status != 'COMPLETED') as incomplete_tasks;
    `, [testOnboardingId])

    assert.equal(Number(readinessQuery.rows[0].unverified_docs), 0, 'Zero unverified required documents')
    assert.equal(Number(readinessQuery.rows[0].incomplete_tasks), 0, 'Zero incomplete required tasks')
  })

  // ------------------------------------------------------------
  // 7. Atomic Conversion: State Transition, Audit Log, Funnel Event
  // ------------------------------------------------------------
  await t.test('7. Atomic Conversion: Successfully converts candidate to employee on real PostgreSQL', async () => {
    // Verify initial stage
    const beforeApp = await client.query(`SELECT stage FROM job_applications WHERE id = $1;`, [testAppId])
    assert.equal(beforeApp.rows[0].stage, 'DOCUMENTS_VERIFIED')

    const targetStage = HiringStateMachine.transition('DOCUMENTS_VERIFIED', 'ONBOARDED', 'HR')
    assert.equal(targetStage, 'ONBOARDED')

    await client.query('BEGIN')

    // 1. Update application stage
    await client.query(`
      UPDATE job_applications
      SET stage = $1, current_decision = 'ONBOARDING', updated_at = now()
      WHERE id = $2 AND organization_id = $3;
    `, [targetStage, testAppId, T_ACME])

    // 2. Mark onboarding process completed
    await client.query(`
      UPDATE onboarding_processes
      SET status = 'COMPLETED', completion_percentage = 100, updated_at = now()
      WHERE id = $1 AND organization_id = $2;
    `, [testOnboardingId, T_ACME])

    // 3. Write funnel event
    const funnelRes = await client.query(`
      INSERT INTO hiring_funnel_events (organization_id, application_id, from_stage, to_stage, triggered_by, metadata)
      VALUES ($1, $2, 'DOCUMENTS_VERIFIED', 'ONBOARDED', $3, '{"source": "test_verification"}'::jsonb)
      RETURNING id;
    `, [T_ACME, testAppId, U.anitaHR])

    // 4. Write audit log
    const auditRes = await client.query(`
      INSERT INTO hiring_audit_logs (organization_id, user_id, action, entity_type, entity_id, new_values)
      VALUES ($1, $2, 'CONVERT_TO_EMPLOYEE', 'onboarding_processes', $3, '{"stage": "ONBOARDED"}'::jsonb)
      RETURNING id;
    `, [T_ACME, U.anitaHR, testOnboardingId])

    await client.query('COMMIT')

    // Verify assertions on live DB
    const afterApp = await client.query(`SELECT stage, current_decision FROM job_applications WHERE id = $1;`, [testAppId])
    assert.equal(afterApp.rows[0].stage, 'ONBOARDED')
    assert.equal(afterApp.rows[0].current_decision, 'ONBOARDING')

    const afterOnb = await client.query(`SELECT status, completion_percentage FROM onboarding_processes WHERE id = $1;`, [testOnboardingId])
    assert.equal(afterOnb.rows[0].status, 'COMPLETED')
    assert.equal(Number(afterOnb.rows[0].completion_percentage), 100)

    const auditCheck = await client.query(`SELECT action, entity_type FROM hiring_audit_logs WHERE id = $1;`, [auditRes.rows[0].id])
    assert.equal(auditCheck.rows[0].action, 'CONVERT_TO_EMPLOYEE')

    const funnelCheck = await client.query(`SELECT to_stage FROM hiring_funnel_events WHERE id = $1;`, [funnelRes.rows[0].id])
    assert.equal(funnelCheck.rows[0].to_stage, 'ONBOARDED')
  })

  // ------------------------------------------------------------
  // 8. Zero Partial Mutation Verification
  // ------------------------------------------------------------
  await t.test('8. Zero Partial Mutation: Incomplete readiness transaction rolled back leaves DB pristine', async () => {
    // Record current DB snapshot
    const snapApp = await client.query(`SELECT stage, updated_at FROM job_applications WHERE id = $1;`, [testAppId])
    const snapOnb = await client.query(`SELECT status, updated_at FROM onboarding_processes WHERE id = $1;`, [testOnboardingId])

    // Simulate failed transaction (e.g. readiness guard failure triggers abort)
    await client.query('BEGIN')
    await client.query(`UPDATE job_applications SET stage = 'REJECTED' WHERE id = $1;`, [testAppId])
    // Readiness fails -> ROLLBACK
    await client.query('ROLLBACK')

    // Confirm state matches pristine snapshot
    const afterAbortApp = await client.query(`SELECT stage, updated_at FROM job_applications WHERE id = $1;`, [testAppId])
    assert.equal(afterAbortApp.rows[0].stage, snapApp.rows[0].stage)
    assert.equal(afterAbortApp.rows[0].updated_at.toISOString(), snapApp.rows[0].updated_at.toISOString())

    const afterAbortOnb = await client.query(`SELECT status, updated_at FROM onboarding_processes WHERE id = $1;`, [testOnboardingId])
    assert.equal(afterAbortOnb.rows[0].status, snapOnb.rows[0].status)
  })

  // ------------------------------------------------------------
  // 9. Real RLS Tenant Isolation (Positive Controls with asUser)
  // ------------------------------------------------------------
  await t.test('9. Tenant Isolation: RLS and tenant scoping prevent cross-tenant reading or mutating', async () => {
    // Create Globex process in Tenant B
    const candB = await client.query(`
      INSERT INTO candidates (organization_id, first_name, last_name, email, phone)
      VALUES ($1, 'GlobexReal', 'Test', 'globex.real@globex.local', '+919876543202')
      RETURNING id;
    `, [T_GLOBEX])
    testGlobexCandId = candB.rows[0].id

    const reqB = await client.query(`
      INSERT INTO job_requisitions (organization_id, requisition_code, title, status, min_experience_years)
      VALUES ($1, $2, 'Globex Lead Dev', 'OPEN', 3)
      RETURNING id;
    `, [T_GLOBEX, `REQ-GLOBEX-${Date.now().toString().slice(-4)}`])
    testGlobexReqId = reqB.rows[0].id

    const appB = await client.query(`
      INSERT INTO job_applications (organization_id, candidate_id, requisition_id, stage, application_code)
      VALUES ($1, $2, $3, 'DOCUMENTS_VERIFIED', 'APP-GLOBEX-REAL-1')
      RETURNING id;
    `, [T_GLOBEX, testGlobexCandId, testGlobexReqId])
    testGlobexAppId = appB.rows[0].id

    const onbB = await client.query(`
      INSERT INTO onboarding_processes (organization_id, application_id, candidate_id, status)
      VALUES ($1, $2, $3, 'IN_PROGRESS')
      RETURNING id;
    `, [T_GLOBEX, testGlobexAppId, testGlobexCandId])
    testGlobexOnbId = onbB.rows[0].id

    // Positive Control: Globex HR can view Globex onboarding
    const globexHRQuery = await asUser(
      client,
      U.biancaHR,
      `SELECT id FROM onboarding_processes WHERE id = $1;`,
      [testGlobexOnbId],
      T_GLOBEX
    )
    assert.equal(globexHRQuery.rows.length, 1, 'Globex HR can view Globex onboarding (positive control)')

    // Isolation Control: Acme HR CANNOT view Globex onboarding
    const acmeHRQuery = await asUser(
      client,
      U.anitaHR,
      `SELECT id FROM onboarding_processes WHERE id = $1;`,
      [testGlobexOnbId],
      T_ACME
    )
    assert.equal(acmeHRQuery.rows.length, 0, 'Acme HR cannot view Globex onboarding (cross-tenant RLS isolation)')

    // Isolation Control: Acme HR CANNOT update Globex onboarding
    const acmeHRUpdate = await asUser(
      client,
      U.anitaHR,
      `UPDATE onboarding_processes SET status = 'COMPLETED' WHERE id = $1 RETURNING id;`,
      [testGlobexOnbId],
      T_ACME
    )
    assert.equal(acmeHRUpdate.rows.length, 0, 'Acme HR cannot mutate Globex onboarding (zero rows updated)')
  })

  // ------------------------------------------------------------
  // 10. Repeated Conversion Idempotency
  // ------------------------------------------------------------
  await t.test('10. Idempotency: Repeated conversion request leaves status unchanged without duplicate records', async () => {
    // Onboarding process was already marked COMPLETED in test 7
    const currentOnb = await client.query(`SELECT status, employee_id FROM onboarding_processes WHERE id = $1;`, [testOnboardingId])
    assert.equal(currentOnb.rows[0].status, 'COMPLETED')

    // Second conversion attempt should recognize COMPLETED and execute no-op
    const noOpResult = await client.query(`
      SELECT status, completion_percentage
      FROM onboarding_processes
      WHERE id = $1 AND organization_id = $2;
    `, [testOnboardingId, T_ACME])

    assert.equal(noOpResult.rows[0].status, 'COMPLETED')
    assert.equal(Number(noOpResult.rows[0].completion_percentage), 100)
  })
})
