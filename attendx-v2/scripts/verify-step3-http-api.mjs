// ============================================================
// AttendX v2 — Module 4 Step 3: End-to-End HTTP API Readiness Guard Verification
// Verifies HTTP API endpoint /api/hiring/onboarding/convert-employee
// Against live dev server (http://localhost:3000) and live DB (attendx_test)
// ============================================================

import { Client } from 'pg'

const BASE_URL = 'http://localhost:3000'
const DB_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/attendx_test'

const T_ACME = 'aa000000-0000-0000-0000-0000000000a1'
const T_GLOBEX = 'bb000000-0000-0000-0000-0000000000b2'

// Demo session cookies for ServerIdentity
function createDemoCookie(user) {
  const payload = Buffer.from(JSON.stringify(user)).toString('base64')
  return `attendx-demo-session=${encodeURIComponent(payload)}`
}

const HR_COOKIE = createDemoCookie({
  id: 'a0000003-0000-0000-0000-000000000003',
  tenant_id: T_ACME,
  role: 'HR',
  email: 'anita.hr@acme.com',
})

const EMPLOYEE_COOKIE = createDemoCookie({
  id: 'a0000001-0000-0000-0000-000000000001',
  tenant_id: T_ACME,
  role: 'EMPLOYEE',
  email: 'alice.emp@acme.com',
})

const GLOBEX_HR_COOKIE = createDemoCookie({
  id: 'b0000003-0000-0000-0000-000000000003',
  tenant_id: T_GLOBEX,
  role: 'HR',
  email: 'bianca.hr@globex.com',
})

let passed = 0
let failed = 0

function assert(condition, message) {
  if (!condition) {
    failed++
    console.error(`  ❌ FAIL: ${message}`)
    throw new Error(message)
  } else {
    passed++
    console.log(`  ✔ PASS: ${message}`)
  }
}

async function run() {
  console.log('================================================================')
  console.log('MODULE 4 STEP 3: HTTP API & LIVE DATABASE END-TO-END VERIFICATION')
  console.log(`Target: ${BASE_URL}/api/hiring/onboarding/convert-employee`)
  console.log('================================================================\n')

  const db = new Client({ connectionString: DB_URL })
  await db.connect()

  let candId = null
  let reqId = null
  let appId = null
  let onbId = null
  let docId = null
  let taskId = null
  let optDocId = null
  let optTaskId = null

  try {
    // ------------------------------------------------------------
    // 0. Seed test records in database
    // ------------------------------------------------------------
    console.log('--- SEEDING TEST FIXTURES ---')
    const cand = await db.query(`
      INSERT INTO candidates (organization_id, first_name, last_name, email, phone)
      VALUES ($1, 'HTTPCand', 'TestStep3', 'http.cand.step3@acme-test.local', '+919876543277')
      RETURNING id;
    `, [T_ACME])
    candId = cand.rows[0].id

    const req = await db.query(`
      INSERT INTO job_requisitions (organization_id, requisition_code, title, status, min_experience_years)
      VALUES ($1, $2, 'HTTP Test Requisition', 'OPEN', 4)
      RETURNING id;
    `, [T_ACME, `REQ-HTTP-${Date.now().toString().slice(-4)}`])
    reqId = req.rows[0].id

    const app = await db.query(`
      INSERT INTO job_applications (organization_id, candidate_id, requisition_id, stage, current_decision, application_code)
      VALUES ($1, $2, $3, 'DOCUMENTS_VERIFIED', 'SELECTED', 'APP-HTTP-TEST1')
      RETURNING id;
    `, [T_ACME, candId, reqId])
    appId = app.rows[0].id

    const onb = await db.query(`
      INSERT INTO onboarding_processes (organization_id, application_id, candidate_id, status, completion_percentage)
      VALUES ($1, $2, $3, 'IN_PROGRESS', 20)
      RETURNING id;
    `, [T_ACME, appId, candId])
    onbId = onb.rows[0].id

    // Seed 1 required doc (NOT_SUBMITTED)
    const doc = await db.query(`
      INSERT INTO onboarding_documents (organization_id, onboarding_id, document_type, document_name, status, is_required)
      VALUES ($1, $2, 'ID_PROOF', 'Govt ID Proof', 'NOT_SUBMITTED', true)
      RETURNING id;
    `, [T_ACME, onbId])
    docId = doc.rows[0].id

    // Seed 1 required task (PENDING)
    const task = await db.query(`
      INSERT INTO onboarding_tasks (organization_id, onboarding_id, task_name, category, status, is_required)
      VALUES ($1, $2, 'Hardware Setup', 'IT', 'PENDING', true)
      RETURNING id;
    `, [T_ACME, onbId])
    taskId = task.rows[0].id

    // Seed 1 optional doc & task
    const optDoc = await db.query(`
      INSERT INTO onboarding_documents (organization_id, onboarding_id, document_type, document_name, status, is_required)
      VALUES ($1, $2, 'PHOTO', 'Optional Photo', 'NOT_SUBMITTED', false)
      RETURNING id;
    `, [T_ACME, onbId])
    optDocId = optDoc.rows[0].id

    const optTask = await db.query(`
      INSERT INTO onboarding_tasks (organization_id, onboarding_id, task_name, category, status, is_required)
      VALUES ($1, $2, 'Welcome Gift Delivery', 'ADMIN', 'PENDING', false)
      RETURNING id;
    `, [T_ACME, onbId])
    optTaskId = optTask.rows[0].id

    console.log(`Created test onboarding process: ${onbId}\n`)

    // ------------------------------------------------------------
    // SCENARIO 1: Unauthenticated request -> 401
    // ------------------------------------------------------------
    console.log('--- SCENARIO 1: UNAUTHENTICATED REQUEST ---')
    const resNoAuth = await fetch(`${BASE_URL}/api/hiring/onboarding/convert-employee`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onboarding_id: onbId, work_email: 'emp@acme.com' }),
    })
    assert(resNoAuth.status === 401, `Unauthenticated request returned HTTP ${resNoAuth.status} (expected 401)`)

    // ------------------------------------------------------------
    // SCENARIO 2: Unauthorized role (EMPLOYEE) -> 403
    // ------------------------------------------------------------
    console.log('\n--- SCENARIO 2: UNAUTHORIZED ROLE (EMPLOYEE) ---')
    const resEmp = await fetch(`${BASE_URL}/api/hiring/onboarding/convert-employee`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': EMPLOYEE_COOKIE,
      },
      body: JSON.stringify({ onboarding_id: onbId, work_email: 'emp@acme.com' }),
    })
    assert(resEmp.status === 403, `Employee role request returned HTTP ${resEmp.status} (expected 403)`)
    const empErr = await resEmp.json()
    assert(empErr.error.includes('Forbidden') || empErr.error.includes('EMPLOYEE'), 'Error message states role forbidden')

    // ------------------------------------------------------------
    // SCENARIO 3: Blocked by unverified required document & pending task -> 400
    // ------------------------------------------------------------
    console.log('\n--- SCENARIO 3: BLOCKED BY UNVERIFIED REQUIRED DOC & PENDING TASK ---')
    const resBlocked = await fetch(`${BASE_URL}/api/hiring/onboarding/convert-employee`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': HR_COOKIE,
      },
      body: JSON.stringify({ onboarding_id: onbId, work_email: 'emp@acme.com' }),
    })
    assert(resBlocked.status === 400, `Blocked conversion returned HTTP ${resBlocked.status} (expected 400)`)
    const blockedData = await resBlocked.json()
    assert(blockedData.code === 'JOINING_READINESS_INCOMPLETE', `Error code is JOINING_READINESS_INCOMPLETE`)
    assert(blockedData.readiness !== undefined, `Response contains structured readiness payload`)
    assert(blockedData.readiness.ready === false, `readiness.ready is false`)
    assert(blockedData.readiness.unverified_documents.length === 1, `unverified_documents has 1 entry`)
    assert(blockedData.readiness.unverified_documents[0].status === 'NOT_SUBMITTED', `unverified_documents status is NOT_SUBMITTED`)
    assert(blockedData.readiness.incomplete_tasks.length === 1, `incomplete_tasks has 1 entry`)
    assert(blockedData.readiness.incomplete_tasks[0].status === 'PENDING', `incomplete_tasks status is PENDING`)

    // Zero Partial Mutation check on DB
    const appAfterBlock = await db.query(`SELECT stage FROM job_applications WHERE id = $1;`, [appId])
    assert(appAfterBlock.rows[0].stage === 'DOCUMENTS_VERIFIED', `Application stage untouched: ${appAfterBlock.rows[0].stage}`)
    const onbAfterBlock = await db.query(`SELECT status, completion_percentage FROM onboarding_processes WHERE id = $1;`, [onbId])
    assert(onbAfterBlock.rows[0].status === 'IN_PROGRESS', `Onboarding process status untouched: ${onbAfterBlock.rows[0].status}`)
    assert(Number(onbAfterBlock.rows[0].completion_percentage) === 20, `Completion percentage untouched: 20%`)

    // ------------------------------------------------------------
    // SCENARIO 4: Blocked when required doc is REJECTED -> 400
    // ------------------------------------------------------------
    console.log('\n--- SCENARIO 4: BLOCKED WHEN REQUIRED DOC IS REJECTED ---')
    await db.query(`UPDATE onboarding_documents SET status = 'REJECTED' WHERE id = $1;`, [docId])
    await db.query(`UPDATE onboarding_tasks SET status = 'COMPLETED' WHERE id = $1;`, [taskId])

    const resRejectBlocked = await fetch(`${BASE_URL}/api/hiring/onboarding/convert-employee`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': HR_COOKIE,
      },
      body: JSON.stringify({ onboarding_id: onbId, work_email: 'emp@acme.com' }),
    })
    assert(resRejectBlocked.status === 400, `Rejected doc conversion returned HTTP ${resRejectBlocked.status} (expected 400)`)
    const rejData = await resRejectBlocked.json()
    assert(rejData.readiness.unverified_documents[0].status === 'REJECTED', `unverified_documents lists status REJECTED`)
    assert(rejData.readiness.incomplete_tasks.length === 0, `incomplete_tasks is empty since task was completed`)

    // ------------------------------------------------------------
    // SCENARIO 5: Blocked when required task is SKIPPED -> 400
    // ------------------------------------------------------------
    console.log('\n--- SCENARIO 5: BLOCKED WHEN REQUIRED TASK IS SKIPPED ---')
    await db.query(`UPDATE onboarding_documents SET status = 'VERIFIED' WHERE id = $1;`, [docId])
    await db.query(`UPDATE onboarding_tasks SET status = 'SKIPPED' WHERE id = $1;`, [taskId])

    const resSkipBlocked = await fetch(`${BASE_URL}/api/hiring/onboarding/convert-employee`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': HR_COOKIE,
      },
      body: JSON.stringify({ onboarding_id: onbId, work_email: 'emp@acme.com' }),
    })
    assert(resSkipBlocked.status === 400, `Skipped task conversion returned HTTP ${resSkipBlocked.status} (expected 400)`)
    const skipData = await resSkipBlocked.json()
    assert(skipData.readiness.incomplete_tasks[0].status === 'SKIPPED', `incomplete_tasks lists status SKIPPED`)
    assert(skipData.readiness.unverified_documents.length === 0, `unverified_documents is empty`)

    // ------------------------------------------------------------
    // SCENARIO 6: Tenant Isolation -> 404 for cross-tenant access
    // ------------------------------------------------------------
    console.log('\n--- SCENARIO 6: TENANT ISOLATION (CROSS-TENANT BLOCKED) ---')
    const resCrossTenant = await fetch(`${BASE_URL}/api/hiring/onboarding/convert-employee`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': GLOBEX_HR_COOKIE, // Globex HR trying to convert Acme process
      },
      body: JSON.stringify({ onboarding_id: onbId, work_email: 'emp@globex.com' }),
    })
    assert(resCrossTenant.status === 404, `Cross-tenant attempt returned HTTP ${resCrossTenant.status} (expected 404 Not Found)`)

    // ------------------------------------------------------------
    // SCENARIO 7: Full Success — Optional doc & task incomplete, but required are VERIFIED & COMPLETED -> 200
    // ------------------------------------------------------------
    console.log('\n--- SCENARIO 7: SUCCESSFUL CONVERSION WITH OPTIONAL ITEMS INCOMPLETE ---')
    // Set required doc to VERIFIED and required task to COMPLETED
    await db.query(`UPDATE onboarding_documents SET status = 'VERIFIED' WHERE id = $1;`, [docId])
    await db.query(`UPDATE onboarding_tasks SET status = 'COMPLETED' WHERE id = $1;`, [taskId])
    // Note: optDoc is NOT_SUBMITTED and optTask is PENDING!

    const resSuccess = await fetch(`${BASE_URL}/api/hiring/onboarding/convert-employee`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': HR_COOKIE,
      },
      body: JSON.stringify({
        onboarding_id: onbId,
        work_email: 'http.cand.step3@acme-test.local',
        role: 'EMPLOYEE',
      }),
    })

    assert(resSuccess.status === 200, `Successful conversion returned HTTP ${resSuccess.status} (expected 200)`)
    const successData = await resSuccess.json()
    assert(successData.success === true, `successData.success is true`)
    assert(successData.stage === 'ONBOARDED', `Returned stage is ONBOARDED`)
    assert(successData.employeeId !== undefined && successData.employeeId !== null, `Returned employeeId is populated`)

    // Verify DB state
    const appAfterSuccess = await db.query(`SELECT stage, current_decision FROM job_applications WHERE id = $1;`, [appId])
    assert(appAfterSuccess.rows[0].stage === 'ONBOARDED', `job_applications.stage transitioned to ONBOARDED`)
    assert(appAfterSuccess.rows[0].current_decision === 'ONBOARDING', `job_applications.current_decision set to ONBOARDING`)

    const onbAfterSuccess = await db.query(`SELECT status, completion_percentage, employee_id FROM onboarding_processes WHERE id = $1;`, [onbId])
    assert(onbAfterSuccess.rows[0].status === 'COMPLETED', `onboarding_processes.status is COMPLETED`)
    assert(Number(onbAfterSuccess.rows[0].completion_percentage) === 100, `onboarding_processes.completion_percentage is 100`)
    assert(onbAfterSuccess.rows[0].employee_id === successData.employeeId, `onboarding_processes.employee_id matches response`)

    // Check audit logs
    const auditLogs = await db.query(`
      SELECT action, entity_type FROM hiring_audit_logs
      WHERE organization_id = $1 AND entity_id = $2;
    `, [T_ACME, onbId])
    assert(auditLogs.rows.length >= 1, `Audit log entry created in hiring_audit_logs`)
    assert(auditLogs.rows.some(l => l.action === 'CONVERT_TO_EMPLOYEE'), `Action CONVERT_TO_EMPLOYEE logged`)

    // Check funnel event
    const funnelEvents = await db.query(`
      SELECT to_stage FROM hiring_funnel_events
      WHERE organization_id = $1 AND application_id = $2;
    `, [T_ACME, appId])
    assert(funnelEvents.rows.length >= 1, `Funnel event created in hiring_funnel_events`)
    assert(funnelEvents.rows.some(f => f.to_stage === 'ONBOARDED'), `to_stage ONBOARDED logged`)

    // ------------------------------------------------------------
    // SCENARIO 8: Idempotent Re-execution -> 200 without duplicate creation
    // ------------------------------------------------------------
    console.log('\n--- SCENARIO 8: IDEMPOTENT RE-EXECUTION ---')
    const resIdempotent = await fetch(`${BASE_URL}/api/hiring/onboarding/convert-employee`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': HR_COOKIE,
      },
      body: JSON.stringify({
        onboarding_id: onbId,
        work_email: 'http.cand.step3@acme-test.local',
        role: 'EMPLOYEE',
      }),
    })
    assert(resIdempotent.status === 200, `Idempotent call returned HTTP ${resIdempotent.status} (expected 200)`)
    const idempData = await resIdempotent.json()
    assert(idempData.already_completed === true, `Response indicates already_completed: true`)
    assert(idempData.employeeId === successData.employeeId, `Same employeeId returned`)

  } finally {
    console.log('\n--- CLEANUP ---')
    if (onbId) {
      await db.query(`DELETE FROM onboarding_documents WHERE onboarding_id = $1`, [onbId]).catch(() => {})
      await db.query(`DELETE FROM onboarding_tasks WHERE onboarding_id = $1`, [onbId]).catch(() => {})
      await db.query(`DELETE FROM hiring_audit_logs WHERE entity_id = $1`, [onbId]).catch(() => {})
      await db.query(`DELETE FROM onboarding_processes WHERE id = $1`, [onbId]).catch(() => {})
    }
    if (appId) {
      await db.query(`DELETE FROM hiring_funnel_events WHERE application_id = $1`, [appId]).catch(() => {})
      await db.query(`DELETE FROM job_applications WHERE id = $1`, [appId]).catch(() => {})
    }
    if (candId) {
      await db.query(`DELETE FROM candidates WHERE id = $1`, [candId]).catch(() => {})
    }
    if (reqId) {
      await db.query(`DELETE FROM job_requisitions WHERE id = $1`, [reqId]).catch(() => {})
    }
    await db.end()
  }

  console.log('\n================================================================')
  console.log(`TOTAL HTTP & DB TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`)
  console.log('================================================================')

  if (failed > 0) process.exit(1)
}

run().catch(err => {
  console.error('Fatal test error:', err)
  process.exit(1)
})
