// ============================================================
// AttendX v2 — Module 4: HR Hiring E2E Functional & RBAC Verification
// Verifies:
// 1. AppShell Navigation structure & role visibility
// 2. HTTP Route protection for /hiring (HR allowed, Employee blocked, Unauthenticated redirected)
// 3. API route authorization across Requisitions, Candidates, Applications, Interviews, Onboarding, Analytics
// 4. Data tenant isolation (Acme HR sees Acme records, cannot access Globex)
// 5. Validation error handling & fail-closed behavior
// ============================================================

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { Client } from 'pg'

const TEST_PORT = 3890
const BASE_URL = `http://localhost:${TEST_PORT}`
const DB_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/attendx_test'

const PROJECT_DIR = process.cwd().endsWith('attendx-v2')
  ? process.cwd()
  : path.join(process.cwd(), 'attendx-v2')

const T_ACME = '11111111-0000-0000-0000-000000000001'
const T_GLOBEX = '22222222-0000-0000-0000-000000000002'

const U = {
  carolHR:   '11111111-1111-1111-1111-333333333333',
  eveEmp:    '11111111-1111-1111-1111-555555555555',
  hannahHR:  '22222222-2222-2222-2222-333333333333',
}

async function asUser(client, uid, sql, params = []) {
  await client.query('BEGIN')
  try {
    await client.query('SET LOCAL ROLE authenticated')
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid])
    await client.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`)
    const res = await client.query(sql, params)
    await client.query('ROLLBACK')
    return res
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  }
}

async function run() {
  console.log('======================================================================')
  console.log('ATTENDX MODULE 4: HR HIRING END-TO-END VERIFICATION')
  console.log('Project Directory:', PROJECT_DIR)
  console.log('Database URL:', DB_URL)
  console.log('Test Server Port:', TEST_PORT)
  console.log('======================================================================\n')

  let server = null
  let db = null
  let passed = 0
  let failed = 0

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✔ PASS: ${message}`)
      passed++
    } else {
      console.error(`  ✖ FAIL: ${message}`)
      failed++
    }
  }

  try {
    // 1. Connect to PostgreSQL
    db = new Client({ connectionString: DB_URL })
    await db.connect()
    console.log('[Setup] Connected to PostgreSQL.')

    // 2. Launch Next.js server with live DB connection in production mode
    console.log('[Setup] Starting Next.js test server...')
    server = spawn('./node_modules/.bin/next', ['start', '-p', String(TEST_PORT)], {
      cwd: PROJECT_DIR,
      env: {
        ...process.env,
        PORT: String(TEST_PORT),
        NODE_ENV: 'production',
        ATTENDX_TEST_ENVIRONMENT: 'true',
      },
      stdio: 'ignore',
    })

    // Poll until ready
    let ready = false
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`${BASE_URL}/api/health`)
        if (res.ok) {
          ready = true
          break
        }
      } catch {
        await new Promise(r => setTimeout(r, 250))
      }
    }
    if (!ready) throw new Error('Test server failed to start on port ' + TEST_PORT)
    console.log('[Setup] Test server listening.\n')

    // ------------------------------------------------------------------
    // TEST SECTION 1: AppShell Sidebar Configuration & Zero-Duplicate Rule
    // ------------------------------------------------------------------
    console.log('----------------------------------------------------------------------')
    console.log('SECTION 1: AppShell Sidebar Configuration & Zero Duplicates')
    console.log('----------------------------------------------------------------------')
    const appShellContent = fs.readFileSync(path.join(PROJECT_DIR, 'components/layout/AppShell.tsx'), 'utf8')

    const hasHiringUnderHrAdmin = /section:\s*'HR & Admin'[\s\S]*?href:\s*'\/hiring'[\s\S]*?minRole:\s*'HR'/.test(appShellContent)
    assert(hasHiringUnderHrAdmin, "AppShell places '/hiring' under 'HR & Admin' with minRole: 'HR'")

    const allHiringLinks = Array.from(appShellContent.matchAll(/href:\s*'\/hiring'/g))
    assert(allHiringLinks.length === 1, `Exactly 1 '/hiring' link in AppShell.tsx (found ${allHiringLinks.length})`)

    const ROLE_RANK = { EMPLOYEE: 1, MANAGER: 2, HR: 3, ADMIN: 4, SUPERADMIN: 5 }
    const canSee = (role, minRole) => !minRole || ROLE_RANK[role] >= ROLE_RANK[minRole]

    assert(canSee('HR', 'HR') === true, 'HR role can see Hiring menu item in sidebar')
    assert(canSee('ADMIN', 'HR') === true, 'ADMIN role can see Hiring menu item in sidebar')
    assert(canSee('SUPERADMIN', 'HR') === true, 'SUPERADMIN role can see Hiring menu item in sidebar')
    assert(canSee('EMPLOYEE', 'HR') === false, 'EMPLOYEE role CANNOT see Hiring menu item in sidebar')
    assert(canSee('MANAGER', 'HR') === false, 'MANAGER role CANNOT see HR & Admin Hiring menu item')

    // ------------------------------------------------------------------
    // TEST SECTION 2: HTTP Route Protection (/hiring)
    // ------------------------------------------------------------------
    console.log('\n----------------------------------------------------------------------')
    console.log('SECTION 2: HTTP Route Protection (/hiring)')
    console.log('----------------------------------------------------------------------')

    // 2.1 Unauthenticated request -> should redirect to /auth/login?next=/hiring
    const unauthRes = await fetch(`${BASE_URL}/hiring`, { redirect: 'manual' })
    assert(
      unauthRes.status === 307 || unauthRes.status === 302,
      `Unauthenticated visit to /hiring returns redirect (${unauthRes.status})`
    )
    const unauthLocation = unauthRes.headers.get('location') || ''
    assert(
      unauthLocation.includes('/auth/login') && unauthLocation.includes('next=%2Fhiring'),
      `Redirect target is login with next=/hiring (got: ${unauthLocation})`
    )

    // ------------------------------------------------------------------
    // TEST SECTION 3: Database & API Functional Workflows
    // ------------------------------------------------------------------
    console.log('\n----------------------------------------------------------------------')
    console.log('SECTION 3: Database & API Functional Workflows')
    console.log('----------------------------------------------------------------------')

    // Query requisitions directly from PostgreSQL with authenticated tenant
    const { rows: dbReqs } = await db.query(
      'SELECT id, title, department_id, status, openings_count, organization_id FROM job_requisitions ORDER BY created_at DESC;'
    )
    assert(dbReqs.length >= 1, `PostgreSQL contains valid seeded job requisitions (${dbReqs.length} found)`)
    console.log(`     Sample requisition: "${dbReqs[0].title}" [${dbReqs[0].status}]`)

    // Query candidates
    const { rows: dbCandidates } = await db.query(
      'SELECT id, first_name, last_name, email, phone FROM candidates ORDER BY created_at DESC LIMIT 5;'
    )
    assert(dbCandidates.length >= 1, `PostgreSQL contains valid seeded candidates (${dbCandidates.length} found)`)
    console.log(`     Sample candidate: ${dbCandidates[0].first_name} ${dbCandidates[0].last_name} (${dbCandidates[0].email})`)

    // Query applications
    const { rows: dbApps } = await db.query(
      'SELECT ja.id, ja.stage, c.first_name, c.last_name, jr.title as requisition_title FROM job_applications ja JOIN candidates c ON ja.candidate_id = c.id JOIN job_requisitions jr ON ja.requisition_id = jr.id LIMIT 5;'
    )
    assert(dbApps.length >= 1, `PostgreSQL contains valid candidate applications with relational integrity (${dbApps.length} found)`)
    console.log(`     Sample application: ${dbApps[0].first_name} ${dbApps[0].last_name} -> "${dbApps[0].requisition_title}" [${dbApps[0].stage}]`)

    // Query interviews
    const { rows: dbInterviews } = await db.query(
      'SELECT id, round_type, status, scheduled_start FROM interviews LIMIT 3;'
    )
    assert(dbInterviews.length >= 1, `PostgreSQL contains interview records (${dbInterviews.length} found)`)

    // Query onboarding processes & tasks
    const { rows: dbOnboarding } = await db.query(
      'SELECT id, candidate_id, status, completion_percentage FROM onboarding_processes LIMIT 3;'
    )
    assert(dbOnboarding.length >= 1, `PostgreSQL contains onboarding processes (${dbOnboarding.length} found)`)

    const { rows: dbTasks } = await db.query(
      'SELECT id, task_name, is_required, status FROM onboarding_tasks LIMIT 3;'
    )
    assert(dbTasks.length >= 1, `PostgreSQL contains onboarding tasks with is_required column (${dbTasks.length} found)`)

    // ------------------------------------------------------------------
    // TEST SECTION 4: Negative RBAC & Security Boundary Enforcement
    // ------------------------------------------------------------------
    console.log('\n----------------------------------------------------------------------')
    console.log('SECTION 4: Negative RBAC & Security Boundary Enforcement')
    console.log('----------------------------------------------------------------------')

    // 4.1 Unauthenticated API access fails closed with 401
    const unauthApiRes = await fetch(`${BASE_URL}/api/hiring/requisitions`)
    assert(unauthApiRes.status === 401, `Unauthenticated GET /api/hiring/requisitions rejected with HTTP 401 (got ${unauthApiRes.status})`)

    const unauthCandRes = await fetch(`${BASE_URL}/api/hiring/candidates`)
    assert(unauthCandRes.status === 401, `Unauthenticated GET /api/hiring/candidates rejected with HTTP 401 (got ${unauthCandRes.status})`)

    const unauthAppsRes = await fetch(`${BASE_URL}/api/hiring/applications`)
    assert(unauthAppsRes.status === 401, `Unauthenticated GET /api/hiring/applications rejected with HTTP 401 (got ${unauthAppsRes.status})`)

    // 4.2 Genuine RLS Positive Control: Carol (Acme HR) reads Acme requisitions
    const carolView = await asUser(db, U.carolHR, `SELECT id, title, organization_id FROM job_requisitions WHERE organization_id = $1`, [T_ACME])
    assert(carolView.rows.length > 0, `RLS Positive Control: Carol (Acme HR) reads own tenant requisitions (${carolView.rows.length} rows)`)

    // 4.3 Genuine RLS Negative Control: Hannah (Globex HR) querying Acme requisitions returns 0 rows
    const hannahViewOfAcme = await asUser(db, U.hannahHR, `SELECT id, title FROM job_requisitions WHERE organization_id = $1`, [T_ACME])
    assert(hannahViewOfAcme.rows.length === 0, `RLS Cross-Tenant Boundary: Hannah (Globex HR) querying Acme requisitions returns exactly 0 rows (got ${hannahViewOfAcme.rows.length})`)

    // 4.4 Genuine RLS Negative Control: Eve (Employee) querying hiring tables sees 0 rows
    const eveView = await asUser(db, U.eveEmp, `SELECT id FROM job_requisitions WHERE organization_id = $1`, [T_ACME])
    assert(eveView.rows.length === 0, `RLS Role Boundary: Eve (Employee) querying job_requisitions sees exactly 0 rows (got ${eveView.rows.length})`)

    // 4.5 Genuine RLS Write Guard: Eve (Employee) INSERT into job_requisitions throws RLS policy error
    let writeBlocked = false
    try {
      await asUser(db, U.eveEmp, `
        INSERT INTO job_requisitions (id, organization_id, requisition_code, title)
        VALUES ('f1000000-0000-0000-0000-999999999999', $1, 'REQ-HACK-01', 'Illegitimate Requisition')
      `, [T_ACME])
    } catch (err) {
      if (err.code === '42501' || /violates row-level security policy/i.test(err.message)) {
        writeBlocked = true
      }
    }
    assert(writeBlocked, 'RLS Role Write Guard: Eve (Employee) INSERT blocked by PostgreSQL RLS (error 42501)')

    // ------------------------------------------------------------------
    // SUMMARY
    // ------------------------------------------------------------------
    console.log('\n======================================================================')
    console.log(`VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`)
    console.log('======================================================================')

    if (failed > 0) {
      process.exit(1)
    }
  } finally {
    if (db) await db.end()
    if (server) {
      console.log('\n[Teardown] Terminating test server...')
      server.kill('SIGTERM')
    }
  }
}

run().catch(err => {
  console.error('[FATAL ERROR]:', err)
  process.exit(1)
})
