import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = Object.fromEntries(
  fs
    .readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const idx = l.indexOf('=')
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
    })
)

const serviceClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const authClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const BASE_URL = 'http://localhost:3002'

async function loginUser(email, password = 'Password123!') {
  const { data, error } = await authClient.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw new Error(`Login failed for ${email}: ${error?.message}`)
  return {
    token: data.session.access_token,
    user: data.user,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session.access_token}`,
    },
  }
}

async function run() {
  console.log('======================================================================')
  console.log('TC_ANL_005 CONTROLLED ROSTER CAPACITY VERIFICATION')
  console.log('======================================================================\n')

  const acmeAdmin = await loginUser('admin@acme-tech.com')
  const tenant1Id = '10000000-0000-0000-0000-000000000001'
  const testDate = '2026-10-01'
  let insertedRecordIds = []

  try {
    // ------------------------------------------------------------------------
    // STEP 1: Inspect Raw Database Shifts & Assigned Workforce
    // ------------------------------------------------------------------------
    console.log('--- 1. RAW DATABASE SHIFTS & ASSIGNED ROSTER ---')
    const { data: rawShifts } = await serviceClient
      .from('shifts')
      .select('*')
      .eq('tenant_id', tenant1Id)

    const shiftMap = {}
    for (const s of rawShifts) {
      const [sH, sM] = s.start_time.split(':').map(Number)
      const [eH, eM] = s.end_time.split(':').map(Number)
      let dur = eH * 60 + eM - (sH * 60 + sM)
      if (dur < 0) dur += 1440
      const netMinutes = dur - (s.break_minutes || 0)
      shiftMap[s.id] = { ...s, netMinutes, netHours: netMinutes / 60 }
      console.log(`  Shift: "${s.name}" (${s.id})`)
      console.log(`    Schedule: ${s.start_time} - ${s.end_time} | Break: ${s.break_minutes}m`)
      console.log(`    Duration: ${netMinutes}m (${(netMinutes / 60).toFixed(1)}h) | Default: ${s.is_default}`)
    }

    const { data: rawEmployees } = await serviceClient
      .from('employees')
      .select('id, shift_id, employee_code')
      .eq('tenant_id', tenant1Id)

    console.log(`\n  Total Tenant Employees: ${rawEmployees.length}`)
    const defaultShift = rawShifts.find((s) => s.is_default) || rawShifts[0]
    let coreTechCount = 0
    let cloudOnCallCount = 0

    for (const emp of rawEmployees) {
      const sId = emp.shift_id || defaultShift.id
      if (sId === '13000000-0000-0000-0000-000000000001') coreTechCount++
      if (sId === '13000000-0000-0000-0000-000000000002') cloudOnCallCount++
    }
    console.log(`  Assigned to "Standard Core Tech": ${coreTechCount} employees`)
    console.log(`  Assigned to "US Cloud On-Call":   ${cloudOnCallCount} employees (UNSTAFFED TEMPLATE)`)

    // ------------------------------------------------------------------------
    // STEP 2: Create Controlled Scenario (5 Assigned, 2 Punches, 3 Absent)
    // ------------------------------------------------------------------------
    console.log('\n--- 2. CREATING CONTROLLED QA SCENARIO FOR DATE: ' + testDate + ' ---')
    console.log('  Scenario specifications:')
    console.log('    - Total assigned employees to Standard Core Tech: 5')
    console.log('    - Employee 1: Works full 8-hour shift (480 min)')
    console.log('    - Employee 2: Works half shift (240 min)')
    console.log('    - Employee 3, 4, 5: 0 attendance records (Absent)')
    console.log('    - Shift 2 (US Cloud On-Call): 0 assigned, 0 records (Unstaffed)')

    const punch1 = {
      tenant_id: tenant1Id,
      employee_id: rawEmployees[0].id,
      date: testDate,
      clock_in_at: `${testDate}T09:30:00Z`,
      clock_out_at: `${testDate}T17:30:00Z`,
      work_minutes: 480,
      status: 'PRESENT',
    }
    const punch2 = {
      tenant_id: tenant1Id,
      employee_id: rawEmployees[1].id,
      date: testDate,
      clock_in_at: `${testDate}T09:30:00Z`,
      clock_out_at: `${testDate}T13:30:00Z`,
      work_minutes: 240,
      status: 'HALF_DAY',
    }

    const { data: insertedPunches, error: insErr } = await serviceClient
      .from('attendance_records')
      .insert([punch1, punch2])
      .select()

    if (insErr) throw insErr
    insertedRecordIds = insertedPunches.map((r) => r.id)
    console.log(`  Inserted Punches in DB: ${insertedRecordIds.join(', ')}`)

    // ------------------------------------------------------------------------
    // STEP 3: Independent Calculation from Raw Database Data
    // ------------------------------------------------------------------------
    console.log('\n--- 3. INDEPENDENT MATHEMATICAL CALCULATION ---')
    const scheduledHoursPerDay = shiftMap['13000000-0000-0000-0000-000000000001'].netHours // 8.0h
    const scheduledMinutesPerDay = shiftMap['13000000-0000-0000-0000-000000000001'].netMinutes // 480m

    // Option A: ASSIGNED WORKFORCE CAPACITY (Expected)
    const expectedAssignedHeadcount = 5
    const expectedRecordCount = 2
    const expectedWorkedMinutes = 480 + 240 // 720m (12.0h)
    const expectedScheduledMinutes = expectedAssignedHeadcount * scheduledMinutesPerDay // 2400m (40.0h)
    const expectedUtilization = Math.round((expectedWorkedMinutes / expectedScheduledMinutes) * 10000) / 100 // 30.00%

    // Option B: ATTENDANCE RECORDS COUNT (Buggy)
    const buggyScheduledMinutes = expectedRecordCount * scheduledMinutesPerDay // 960m (16.0h)
    const buggyUtilization = Math.round((expectedWorkedMinutes / buggyScheduledMinutes) * 10000) / 100 // 75.00%

    console.log(`  Assigned Employee Count:   ${expectedAssignedHeadcount}`)
    console.log(`  Attendance Record Count:   ${expectedRecordCount}`)
    console.log(`  Total Worked Minutes:      ${expectedWorkedMinutes}m (${expectedWorkedMinutes / 60}h)`)
    console.log(`\n  Denominator Comparison:`)
    console.log(`    Option A (Assigned Roster):  ${expectedScheduledMinutes}m (${expectedScheduledMinutes / 60}h) -> Expected Rate: ${expectedUtilization}%`)
    console.log(`    Option B (Attendance Records): ${buggyScheduledMinutes}m (${buggyScheduledMinutes / 60}h) -> Buggy Rate:    ${buggyUtilization}%`)

    // ------------------------------------------------------------------------
    // STEP 4: Call Utilization API for Test Date
    // ------------------------------------------------------------------------
    console.log('\n--- 4. API CALL & PROOF INSPECTION ---')
    const apiUrl = `${BASE_URL}/api/analytics/utilization?startDate=${testDate}&endDate=${testDate}`
    console.log(`  Executing: GET ${apiUrl}`)
    const apiRes = await fetch(apiUrl, { headers: acmeAdmin.headers })
    const apiJson = await apiRes.json()

    console.log(`  API Response Status: HTTP ${apiRes.status}`)
    console.log(`  API overallUtilization: ${apiJson.overallUtilization}%`)
    console.log(`  API Shifts Breakdown:`)
    for (const s of apiJson.shifts || []) {
      console.log(`    - [${s.shiftName}]:`)
      console.log(`        assignedHeadcount:   ${s.assignedHeadcount}`)
      console.log(`        recordCount:         ${s.recordCount}`)
      console.log(`        totalScheduledHours: ${s.totalScheduledHours}h`)
      console.log(`        totalWorkedHours:    ${s.totalWorkedHours}h`)
      console.log(`        utilizationRate:     ${s.utilizationRate}%`)
    }

    // ------------------------------------------------------------------------
    // STEP 5: Proof Matrix & Denominator Attribution
    // ------------------------------------------------------------------------
    console.log('\n--- 5. PROOF MATRIX & DENOMINATOR ATTRIBUTION ---')
    const shift1Api = (apiJson.shifts || []).find((s) => s.shiftId === '13000000-0000-0000-0000-000000000001')
    const shift2Api = (apiJson.shifts || []).find((s) => s.shiftId === '13000000-0000-0000-0000-000000000002')

    const isBasedOnAssignedRoster =
      apiJson.overallUtilization === expectedUtilization &&
      shift1Api?.totalScheduledHours === expectedScheduledMinutes / 60 &&
      shift1Api?.assignedHeadcount === 5

    const isBasedOnRecordCount =
      apiJson.overallUtilization === buggyUtilization &&
      shift1Api?.totalScheduledHours === buggyScheduledMinutes / 60

    console.log(`  Assigned Employees Roster Count: ${expectedAssignedHeadcount}`)
    console.log(`  Attendance Records Count:        ${expectedRecordCount}`)
    console.log(`  Scheduled Hours in API:          ${shift1Api?.totalScheduledHours}h`)
    console.log(`  Worked Hours in API:             ${shift1Api?.totalWorkedHours}h`)
    console.log(`  API Reported Utilization:        ${apiJson.overallUtilization}%`)

    if (isBasedOnAssignedRoster) {
      console.log(`\n  >>> PROOF: Denominator is strictly based on A. ASSIGNED EMPLOYEES (40.0h).`)
    } else if (isBasedOnRecordCount) {
      console.log(`\n  >>> PROOF: Denominator is based on B. ATTENDANCE RECORDS (16.0h). [DEFECT]`)
    } else {
      console.log(`\n  >>> PROOF: Denominator is ambiguous or divergent.`)
    }

    // Requirement 8 check: Unstaffed shift template
    const unstaffedShiftIsZero =
      shift2Api?.assignedHeadcount === 0 &&
      shift2Api?.recordCount === 0 &&
      shift2Api?.totalScheduledHours === 0 &&
      shift2Api?.totalWorkedHours === 0 &&
      shift2Api?.utilizationRate === 0

    console.log(`\n  Requirement 8 (Unstaffed Shift Template contributes 0 scheduled hours): ${unstaffedShiftIsZero ? 'PASS (0h)' : 'FAIL'}`)

    // ------------------------------------------------------------------------
    // STEP 6: Tenant Isolation Verification (Requirement 9)
    // ------------------------------------------------------------------------
    console.log('\n--- 6. TENANT ISOLATION CHECK (Requirement 9) ---')
    const globexAdmin = await loginUser('admin@globex-corp.com')
    const tenant2Res = await fetch(`${BASE_URL}/api/analytics/utilization?startDate=${testDate}&endDate=${testDate}`, {
      headers: globexAdmin.headers,
    })
    const tenant2Json = await tenant2Res.json()
    console.log(`  RetailMart (Tenant 2) Records Analyzed on ${testDate}: ${tenant2Json.totalRecordsAnalyzed}`)
    console.log(`  RetailMart overallUtilization on ${testDate}: ${tenant2Json.overallUtilization}%`)
    const isolationPassed = tenant2Json.totalRecordsAnalyzed === 0 && tenant2Json.overallUtilization === 0
    console.log(`  Tenant Isolation Result: ${isolationPassed ? 'PASS (0 cross-tenant leaks)' : 'FAIL'}`)

    // ------------------------------------------------------------------------
    // FINAL VERDICT
    // ------------------------------------------------------------------------
    const finalPass = isBasedOnAssignedRoster && unstaffedShiftIsZero && isolationPassed
    console.log('\n======================================================================')
    console.log(`FINAL TC_ANL_005 VERDICT: ${finalPass ? '🟢 PASS' : '🔴 FAIL'}`)
    console.log('======================================================================\n')
  } finally {
    // ------------------------------------------------------------------------
    // STEP 7: Teardown Test Data (Requirement 15)
    // ------------------------------------------------------------------------
    if (insertedRecordIds.length > 0) {
      await serviceClient.from('attendance_records').delete().in('id', insertedRecordIds)
      console.log(`[Teardown] Successfully deleted ${insertedRecordIds.length} test attendance records. Database restored.\n`)
    }
  }
}

run().catch((err) => {
  console.error('Fatal execution error:', err)
  process.exit(1)
})
