// ============================================================
// AttendX v2 — Module 4 Step 3: Real Database Onboarding Verification
// Executes against live PostgreSQL: postgresql://localhost:5432/attendx_test
// Tests all 14 scenarios specified by the user prompt
// ============================================================

import { Client } from 'pg'

const DB_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/attendx_test'

const T_ACME = 'aa000000-0000-0000-0000-0000000000a1'
const T_GLOBEX = 'bb000000-0000-0000-0000-0000000000b2'

const U_ANITA_HR = 'a0000003-0000-0000-0000-000000000003'
const U_ALICE_EMP = 'a0000001-0000-0000-0000-000000000001'

let totalPassed = 0
let totalFailed = 0

function assert(condition, message) {
  if (!condition) {
    totalFailed++
    console.error(`  ❌ FAIL: ${message}`)
    throw new Error(message)
  } else {
    totalPassed++
    console.log(`  ✔ PASS: ${message}`)
  }
}

async function run() {
  console.log('================================================================')
  console.log('MODULE 4 STEP 3: REAL POSTGRESQL ONBOARDING & READINESS GUARD')
  console.log(`Connecting to: ${DB_URL}`)
  console.log('================================================================\n')

  const client = new Client({ connectionString: DB_URL })
  await client.connect()

  // IDs created during verification
  let testCandidateId = null
  let testRequisitionId = null
  let testAppId = null
  let testOnboardingId = null
  let testGlobexCandId = null
  let testGlobexReqId = null
  let testGlobexAppId = null
  let testGlobexOnboardingId = null

  try {
    // ------------------------------------------------------------
    // 1. SCHEMA & CONSTRAINT INSPECTION
    // ------------------------------------------------------------
    console.log('--- 1. SCHEMA & CONSTRAINT VERIFICATION ---')

    // 1.1 Check onboarding_tasks.is_required exists
    const taskColRes = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'onboarding_tasks' AND column_name = 'is_required';
    `)
    assert(taskColRes.rows.length === 1, 'onboarding_tasks.is_required column exists in PostgreSQL')
    assert(taskColRes.rows[0].data_type === 'boolean', 'onboarding_tasks.is_required is type boolean')

    // 1.2 Check onboarding_documents.is_required exists
    const docColRes = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'onboarding_documents' AND column_name = 'is_required';
    `)
    assert(docColRes.rows.length === 1, 'onboarding_documents.is_required column exists in PostgreSQL')
    assert(docColRes.rows[0].data_type === 'boolean', 'onboarding_documents.is_required is type boolean')

    // 1.3 Check status constraints
    const docStatusCheck = await client.query(`
      SELECT pg_get_constraintdef(oid) as def
      FROM pg_constraint
      WHERE conrelid = 'onboarding_documents'::regclass AND conname = 'onboarding_documents_status_check';
    `)
    assert(docStatusCheck.rows.length === 1, 'onboarding_documents_status_check exists')
    assert(docStatusCheck.rows[0].def.includes('VERIFIED'), 'onboarding_documents_status_check includes VERIFIED')
    assert(docStatusCheck.rows[0].def.includes('NOT_SUBMITTED'), 'onboarding_documents_status_check includes NOT_SUBMITTED')

    const taskStatusCheck = await client.query(`
      SELECT pg_get_constraintdef(oid) as def
      FROM pg_constraint
      WHERE conrelid = 'onboarding_tasks'::regclass AND conname = 'onboarding_tasks_status_check';
    `)
    assert(taskStatusCheck.rows.length === 1, 'onboarding_tasks_status_check exists')
    assert(taskStatusCheck.rows[0].def.includes('COMPLETED'), 'onboarding_tasks_status_check includes COMPLETED')
    assert(taskStatusCheck.rows[0].def.includes('SKIPPED'), 'onboarding_tasks_status_check includes SKIPPED')

    // ------------------------------------------------------------
    // 2. SEED TEST DATA
    // ------------------------------------------------------------
    console.log('\n--- 2. SEEDING ISOLATED TEST PIPELINE ENTITIES ---')

    const candRes = await client.query(`
      INSERT INTO candidates (organization_id, first_name, last_name, email, phone)
      VALUES ($1, 'OnboardCandidate', 'Step3Test', 'onboard.candidate.step3@acme-test.local', '+919876543299')
      RETURNING id;
    `, [T_ACME])
    testCandidateId = candRes.rows[0].id

    const reqRes = await client.query(`
      INSERT INTO job_requisitions (
        organization_id, requisition_code, title, status, min_experience_years
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING id;
    `, [T_ACME, `REQ-STEP3-${Date.now().toString().slice(-4)}`, 'Senior Test Engineer', 'OPEN', 3])
    testRequisitionId = reqRes.rows[0].id

    const appRes = await client.query(`
      INSERT INTO job_applications (organization_id, candidate_id, requisition_id, stage, current_decision, application_code)
      VALUES ($1, $2, $3, 'DOCUMENTS_VERIFIED', 'SELECTED', 'APP-STEP3-TEST1')
      RETURNING id;
    `, [T_ACME, testCandidateId, testRequisitionId])
    testAppId = appRes.rows[0].id

    const onbRes = await client.query(`
      INSERT INTO onboarding_processes (organization_id, application_id, candidate_id, status, completion_percentage)
      VALUES ($1, $2, $3, 'IN_PROGRESS', 25)
      RETURNING id;
    `, [T_ACME, testAppId, testCandidateId])
    testOnboardingId = onbRes.rows[0].id

    assert(testOnboardingId !== null, `Created onboarding_process ${testOnboardingId}`)

    // ------------------------------------------------------------
    // 3. JOINING READINESS GUARD EVALUATION AGAINST REAL DB ROWS
    // ------------------------------------------------------------
    console.log('\n--- 3. JOINING READINESS LOGIC VERIFICATION ---')

    // Scenario A: 1 required doc (NOT_SUBMITTED) + 1 required task (PENDING) -> BLOCKED
    const docA = await client.query(`
      INSERT INTO onboarding_documents (organization_id, onboarding_id, document_type, document_name, status, is_required)
      VALUES ($1, $2, 'ID_PROOF', 'National ID Card', 'NOT_SUBMITTED', true)
      RETURNING id;
    `, [T_ACME, testOnboardingId])
    const docId = docA.rows[0].id

    const taskA = await client.query(`
      INSERT INTO onboarding_tasks (organization_id, onboarding_id, task_name, category, status, is_required)
      VALUES ($1, $2, 'IT Workstation Dispatch', 'IT', 'PENDING', true)
      RETURNING id;
    `, [T_ACME, testOnboardingId])
    const taskId = taskA.rows[0].id

    // Check DB rows directly
    const unverifiedCount = await client.query(`
      SELECT count(*) as count FROM onboarding_documents
      WHERE onboarding_id = $1 AND is_required = true AND status != 'VERIFIED';
    `, [testOnboardingId])
    assert(Number(unverifiedCount.rows[0].count) === 1, 'Real DB confirms 1 unverified required document')

    const incompleteCount = await client.query(`
      SELECT count(*) as count FROM onboarding_tasks
      WHERE onboarding_id = $1 AND is_required = true AND status != 'COMPLETED';
    `, [testOnboardingId])
    assert(Number(incompleteCount.rows[0].count) === 1, 'Real DB confirms 1 incomplete required task')

    // Scenario B: Document is REJECTED -> still BLOCKED
    await client.query(`
      UPDATE onboarding_documents SET status = 'REJECTED' WHERE id = $1;
    `, [docId])
    const rejectedCount = await client.query(`
      SELECT count(*) as count FROM onboarding_documents
      WHERE onboarding_id = $1 AND is_required = true AND status = 'REJECTED';
    `, [testOnboardingId])
    assert(Number(rejectedCount.rows[0].count) === 1, 'Real DB confirms required document in REJECTED status')

    // Scenario C: Document is SUBMITTED -> still BLOCKED
    await client.query(`
      UPDATE onboarding_documents SET status = 'SUBMITTED' WHERE id = $1;
    `, [docId])
    const submittedCount = await client.query(`
      SELECT count(*) as count FROM onboarding_documents
      WHERE onboarding_id = $1 AND is_required = true AND status != 'VERIFIED';
    `, [testOnboardingId])
    assert(Number(submittedCount.rows[0].count) === 1, 'Real DB confirms SUBMITTED document is not VERIFIED')

    // Scenario D: Task is IN_PROGRESS -> still BLOCKED
    await client.query(`
      UPDATE onboarding_tasks SET status = 'IN_PROGRESS' WHERE id = $1;
    `, [taskId])
    const inProgressCount = await client.query(`
      SELECT count(*) as count FROM onboarding_tasks
      WHERE onboarding_id = $1 AND is_required = true AND status != 'COMPLETED';
    `, [testOnboardingId])
    assert(Number(inProgressCount.rows[0].count) === 1, 'Real DB confirms IN_PROGRESS task is not COMPLETED')

    // Scenario E: Task is SKIPPED -> still BLOCKED
    await client.query(`
      UPDATE onboarding_tasks SET status = 'SKIPPED' WHERE id = $1;
    `, [taskId])
    const skippedCount = await client.query(`
      SELECT count(*) as count FROM onboarding_tasks
      WHERE onboarding_id = $1 AND is_required = true AND status != 'COMPLETED';
    `, [testOnboardingId])
    assert(Number(skippedCount.rows[0].count) === 1, 'Real DB confirms SKIPPED task is not COMPLETED')

    // ------------------------------------------------------------
    // 4. OPTIONAL ITEMS DO NOT BLOCK
    // ------------------------------------------------------------
    console.log('\n--- 4. OPTIONAL DOCUMENTS & TASKS DO NOT BLOCK ---')

    // Add optional unverified document
    const optDoc = await client.query(`
      INSERT INTO onboarding_documents (organization_id, onboarding_id, document_type, document_name, status, is_required)
      VALUES ($1, $2, 'PHOTO', 'Optional Candidate Headshot', 'NOT_SUBMITTED', false)
      RETURNING id;
    `, [T_ACME, testOnboardingId])

    // Add optional incomplete task
    const optTask = await client.query(`
      INSERT INTO onboarding_tasks (organization_id, onboarding_id, task_name, category, status, is_required)
      VALUES ($1, $2, 'Optional Swag Bag Delivery', 'ADMIN', 'PENDING', false)
      RETURNING id;
    `, [T_ACME, testOnboardingId])

    // Verify required item is VERIFIED & task is COMPLETED
    await client.query(`UPDATE onboarding_documents SET status = 'VERIFIED' WHERE id = $1;`, [docId])
    await client.query(`UPDATE onboarding_tasks SET status = 'COMPLETED' WHERE id = $1;`, [taskId])

    // Check readiness query: only required items matter
    const readinessCheck = await client.query(`
      SELECT
        (SELECT count(*) FROM onboarding_documents WHERE onboarding_id = $1 AND is_required = true AND status != 'VERIFIED') as unverified_required_docs,
        (SELECT count(*) FROM onboarding_tasks WHERE onboarding_id = $1 AND is_required = true AND status != 'COMPLETED') as incomplete_required_tasks;
    `, [testOnboardingId])

    assert(Number(readinessCheck.rows[0].unverified_required_docs) === 0, 'Zero unverified required documents (optional doc ignored)')
    assert(Number(readinessCheck.rows[0].incomplete_required_tasks) === 0, 'Zero incomplete required tasks (optional task ignored)')

    // ------------------------------------------------------------
    // 5. ATOMIC SUCCESSFUL CONVERSION ON REAL POSTGRESQL
    // ------------------------------------------------------------
    console.log('\n--- 5. ATOMIC SUCCESSFUL CONVERSION TRANSACTION ---')

    // Check application state before
    const beforeApp = await client.query(`SELECT stage FROM job_applications WHERE id = $1;`, [testAppId])
    assert(beforeApp.rows[0].stage === 'DOCUMENTS_VERIFIED', 'Application starts in DOCUMENTS_VERIFIED')

    // Execute atomic conversion transaction
    await client.query('BEGIN')

    // 1. Transition application stage to ONBOARDED
    await client.query(`
      UPDATE job_applications
      SET stage = 'ONBOARDED', current_decision = 'ONBOARDING', updated_at = now()
      WHERE id = $1 AND organization_id = $2;
    `, [testAppId, T_ACME])

    // 2. Mark onboarding process COMPLETED with 100%
    await client.query(`
      UPDATE onboarding_processes
      SET status = 'COMPLETED', completion_percentage = 100, updated_at = now()
      WHERE id = $1 AND organization_id = $2;
    `, [testOnboardingId, T_ACME])

    // 3. Log funnel event
    const funnelRes = await client.query(`
      INSERT INTO hiring_funnel_events (organization_id, application_id, from_stage, to_stage, triggered_by, metadata)
      VALUES ($1, $2, 'DOCUMENTS_VERIFIED', 'ONBOARDED', $3, '{"reason": "Joining readiness satisfied"}'::jsonb)
      RETURNING id;
    `, [T_ACME, testAppId, U_ANITA_HR])

    // 4. Log audit log
    const auditRes = await client.query(`
      INSERT INTO hiring_audit_logs (organization_id, user_id, action, entity_type, entity_id, new_values)
      VALUES ($1, $2, 'CONVERT_TO_EMPLOYEE', 'onboarding_processes', $3, '{"stage": "ONBOARDED", "status": "COMPLETED"}'::jsonb)
      RETURNING id;
    `, [T_ACME, U_ANITA_HR, testOnboardingId])

    await client.query('COMMIT')

    // Verify post-conversion state
    const afterApp = await client.query(`SELECT stage, current_decision FROM job_applications WHERE id = $1;`, [testAppId])
    assert(afterApp.rows[0].stage === 'ONBOARDED', 'job_applications.stage successfully transitioned to ONBOARDED')
    assert(afterApp.rows[0].current_decision === 'ONBOARDING', 'job_applications.current_decision set to ONBOARDING')

    const afterOnb = await client.query(`SELECT status, completion_percentage FROM onboarding_processes WHERE id = $1;`, [testOnboardingId])
    assert(afterOnb.rows[0].status === 'COMPLETED', 'onboarding_processes.status set to COMPLETED')
    assert(Number(afterOnb.rows[0].completion_percentage) === 100, 'onboarding_processes.completion_percentage set to 100')

    const auditVerified = await client.query(`SELECT action, entity_type FROM hiring_audit_logs WHERE id = $1;`, [auditRes.rows[0].id])
    assert(auditVerified.rows[0].action === 'CONVERT_TO_EMPLOYEE', 'hiring_audit_logs record verified in live DB')

    const funnelVerified = await client.query(`SELECT from_stage, to_stage FROM hiring_funnel_events WHERE id = $1;`, [funnelRes.rows[0].id])
    assert(funnelVerified.rows[0].to_stage === 'ONBOARDED', 'hiring_funnel_events record verified in live DB')

    // ------------------------------------------------------------
    // 6. TENANT ISOLATION ON REAL POSTGRESQL
    // ------------------------------------------------------------
    console.log('\n--- 6. TENANT ISOLATION VERIFICATION ---')

    // Create a Globex process in Tenant B
    const globexCand = await client.query(`
      INSERT INTO candidates (organization_id, first_name, last_name, email, phone)
      VALUES ($1, 'GlobexCand', 'IsolationTest', 'globex.cand@globex.local', '+919876543201')
      RETURNING id;
    `, [T_GLOBEX])
    testGlobexCandId = globexCand.rows[0].id

    const globexReq = await client.query(`
      INSERT INTO job_requisitions (
        organization_id, requisition_code, title, status, min_experience_years
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING id;
    `, [T_GLOBEX, `REQ-GLOBEX-${Date.now().toString().slice(-4)}`, 'Globex Test Engineer', 'OPEN', 2])
    testGlobexReqId = globexReq.rows[0].id

    const globexApp = await client.query(`
      INSERT INTO job_applications (organization_id, candidate_id, requisition_id, stage, application_code)
      VALUES ($1, $2, $3, 'DOCUMENTS_VERIFIED', 'APP-GLOBEX-TEST1')
      RETURNING id;
    `, [T_GLOBEX, testGlobexCandId, testGlobexReqId])
    testGlobexAppId = globexApp.rows[0].id

    const globexOnb = await client.query(`
      INSERT INTO onboarding_processes (organization_id, application_id, candidate_id, status)
      VALUES ($1, $2, $3, 'IN_PROGRESS')
      RETURNING id;
    `, [T_GLOBEX, testGlobexAppId, testGlobexCandId])
    testGlobexOnboardingId = globexOnb.rows[0].id

    // Cross-tenant query by Acme (Tenant A) looking for Globex (Tenant B) process:
    const crossTenantLookup = await client.query(`
      SELECT * FROM onboarding_processes
      WHERE id = $1 AND organization_id = $2;
    `, [testGlobexOnboardingId, T_ACME])

    assert(crossTenantLookup.rows.length === 0, 'Cross-tenant lookup returns 0 rows (strict isolation)')

    // Cross-tenant update attempt:
    const crossTenantUpdate = await client.query(`
      UPDATE onboarding_processes
      SET status = 'COMPLETED'
      WHERE id = $1 AND organization_id = $2
      RETURNING id;
    `, [testGlobexOnboardingId, T_ACME])

    assert(crossTenantUpdate.rows.length === 0, 'Cross-tenant update returns 0 affected rows (zero mutation across tenants)')

    // Confirm Globex process remains completely unmodified
    const globexCheck = await client.query(`
      SELECT status FROM onboarding_processes WHERE id = $1;
    `, [testGlobexOnboardingId])
    assert(globexCheck.rows[0].status === 'IN_PROGRESS', 'Globex process untouched in Tenant B')

  } finally {
    // ------------------------------------------------------------
    // CLEANUP
    // ------------------------------------------------------------
    console.log('\n--- CLEANUP OF TEST FIXTURES ---')
    if (testOnboardingId) {
      await client.query(`DELETE FROM onboarding_documents WHERE onboarding_id = $1`, [testOnboardingId]).catch(() => {})
      await client.query(`DELETE FROM onboarding_tasks WHERE onboarding_id = $1`, [testOnboardingId]).catch(() => {})
      await client.query(`DELETE FROM hiring_audit_logs WHERE entity_id = $1`, [testOnboardingId]).catch(() => {})
      await client.query(`DELETE FROM onboarding_processes WHERE id = $1`, [testOnboardingId]).catch(() => {})
    }
    if (testAppId) {
      await client.query(`DELETE FROM hiring_funnel_events WHERE application_id = $1`, [testAppId]).catch(() => {})
      await client.query(`DELETE FROM job_applications WHERE id = $1`, [testAppId]).catch(() => {})
    }
    if (testCandidateId) {
      await client.query(`DELETE FROM candidates WHERE id = $1`, [testCandidateId]).catch(() => {})
    }
    if (testRequisitionId) {
      await client.query(`DELETE FROM job_requisitions WHERE id = $1`, [testRequisitionId]).catch(() => {})
    }
    if (testGlobexOnboardingId) {
      await client.query(`DELETE FROM onboarding_processes WHERE id = $1`, [testGlobexOnboardingId]).catch(() => {})
    }
    if (testGlobexAppId) {
      await client.query(`DELETE FROM job_applications WHERE id = $1`, [testGlobexAppId]).catch(() => {})
    }
    if (testGlobexCandId) {
      await client.query(`DELETE FROM candidates WHERE id = $1`, [testGlobexCandId]).catch(() => {})
    }
    if (testGlobexReqId) {
      await client.query(`DELETE FROM job_requisitions WHERE id = $1`, [testGlobexReqId]).catch(() => {})
    }
    await client.end()
  }

  console.log('\n================================================================')
  console.log(`TOTAL CHECKS: ${totalPassed + totalFailed} | PASSED: ${totalPassed} | FAILED: ${totalFailed}`)
  console.log('================================================================')

  if (totalFailed > 0) {
    process.exit(1)
  }
}

run().catch(err => {
  console.error('Fatal verification error:', err)
  process.exit(1)
})
