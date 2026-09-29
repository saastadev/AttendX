// ==============================================================================
// AttendX MVP — Proof-Based Runtime Verification Script
// Executes all tests against live server and live database, capturing raw proof
// ==============================================================================

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

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const serviceClient = createClient(supabaseUrl, serviceRoleKey)
const authClient = createClient(supabaseUrl, anonKey)

const BASE_URL = 'http://localhost:3002'

async function loginUser(email, password = 'Password123!') {
  const { data, error } = await authClient.auth.signInWithPassword({
    email,
    password,
  })
  if (error || !data.session) {
    throw new Error(`Failed to log in as ${email}: ${error?.message}`)
  }
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
  console.log('=== STARTING PROOF-BASED VERIFICATION ===\n')

  const acmeEmp = await loginUser('employee@acme-tech.com')
  const acmeAdmin = await loginUser('admin@acme-tech.com')
  const globexEmp = await loginUser('employee@globex-corp.com')
  const globexAdmin = await loginUser('admin@globex-corp.com')

  const TENANT_A = '10000000-0000-0000-0000-000000000001' // Acme
  const TENANT_B = '20000000-0000-0000-0000-000000000002' // Globex

  const proof = {}

  // --------------------------------------------------------------------------
  // TC_ATT_009: SHIFT ASSIGNMENT
  // --------------------------------------------------------------------------
  console.log('--- EXECUTING TC_ATT_009 ---')
  {
    // 1. Shift lookup in DB
    const { data: dbShifts } = await serviceClient.from('shifts').select('*').eq('tenant_id', TENANT_A)
    const { data: dbEmp } = await serviceClient.from('employees').select('id, shift_id').eq('id', acmeEmp.user.id).single()
    const expectedShift = dbShifts.find((s) => s.id === dbEmp.shift_id) || dbShifts.find((s) => s.is_default)

    // 2. Call GET /api/shifts
    const shiftsRes = await fetch(`${BASE_URL}/api/shifts`, { headers: acmeEmp.headers })
    const shiftsJson = await shiftsRes.json()

    // 3. Clock-in
    const punchDate = '2026-10-10'
    const clockInPayload = {
      type: 'clock_in',
      payload: {
        date: punchDate,
        clock_in_at: '2026-10-10T04:00:00.000Z',
        clock_in_lat: 12.9716,
        clock_in_lng: 77.5946,
        method: 'SELFIE_GPS',
      },
    }
    const clockInRes = await fetch(`${BASE_URL}/api/attendance/checkin`, {
      method: 'POST',
      headers: acmeEmp.headers,
      body: JSON.stringify(clockInPayload),
    })
    const clockInJson = await clockInRes.json()

    // 4. Query DB for the attendance record
    const { data: dbAttendance } = await serviceClient
      .from('attendance_records')
      .select('*')
      .eq('tenant_id', TENANT_A)
      .eq('employee_id', acmeEmp.user.id)
      .eq('date', punchDate)
      .single()

    const notesObj = JSON.parse(dbAttendance.notes || '{}')

    proof.ATT_009 = {
      method: 'POST',
      endpoint: '/api/attendance/checkin',
      authContext: `User: employee@acme-tech.com (${acmeEmp.user.id}), Tenant: AcmeTech (${TENANT_A})`,
      requestPayload: clockInPayload,
      apiStatus: clockInRes.status,
      apiResponse: clockInJson,
      dbRecord: dbAttendance,
      expectedShift: {
        id: expectedShift.id,
        name: expectedShift.name,
        start_time: expectedShift.start_time,
        end_time: expectedShift.end_time,
        break_minutes: expectedShift.break_minutes,
      },
      matchedShiftId: clockInJson.record?.shift_id,
      dbStoredShiftId: notesObj.shift_id,
      isMatch: notesObj.shift_id === expectedShift.id && clockInJson.record?.shift_id === expectedShift.id,
    }
  }

  // --------------------------------------------------------------------------
  // TC_ATT_010: LATE CALCULATION
  // --------------------------------------------------------------------------
  console.log('--- EXECUTING TC_ATT_010 ---')
  {
    // Acme Tech Shift: Standard Core Tech -> start_time = 09:30:00 IST (UTC+5:30)
    // 15 min grace period -> boundary is 09:45:00 IST
    // IST = UTC + 5:30.
    // 09:15:00 IST = 03:45:00 UTC
    // 09:30:00 IST = 04:00:00 UTC
    // 09:40:00 IST = 04:10:00 UTC
    // 09:46:00 IST = 04:16:00 UTC
    // 10:30:00 IST = 05:00:00 UTC

    const lateTests = [
      {
        test: 'TEST 1: Before shift start',
        date: '2026-10-11',
        timeUtc: '2026-10-11T03:45:00.000Z',
        localTimeIST: '09:15:00',
        delta: '-15m',
        expectedStatus: 'PRESENT',
      },
      {
        test: 'TEST 2: Exactly at shift start',
        date: '2026-10-12',
        timeUtc: '2026-10-12T04:00:00.000Z',
        localTimeIST: '09:30:00',
        delta: '0m',
        expectedStatus: 'PRESENT',
      },
      {
        test: 'TEST 3: Inside grace period (09:40 <= 09:45)',
        date: '2026-10-13',
        timeUtc: '2026-10-13T04:10:00.000Z',
        localTimeIST: '09:40:00',
        delta: '+10m',
        expectedStatus: 'PRESENT',
      },
      {
        test: 'TEST 4: Immediately after grace period (09:46 > 09:45)',
        date: '2026-10-14',
        timeUtc: '2026-10-14T04:16:00.000Z',
        localTimeIST: '09:46:00',
        delta: '+16m',
        expectedStatus: 'LATE',
      },
      {
        test: 'TEST 5: Clearly late (10:30 > 09:45)',
        date: '2026-10-15',
        timeUtc: '2026-10-15T05:00:00.000Z',
        localTimeIST: '10:30:00',
        delta: '+60m',
        expectedStatus: 'LATE',
      },
    ]

    proof.ATT_010 = []

    for (const t of lateTests) {
      const payload = {
        type: 'clock_in',
        payload: {
          date: t.date,
          clock_in_at: t.timeUtc,
          clock_in_lat: 12.9716,
          clock_in_lng: 77.5946,
          method: 'SELFIE_GPS',
        },
      }
      const res = await fetch(`${BASE_URL}/api/attendance/checkin`, {
        method: 'POST',
        headers: acmeEmp.headers,
        body: JSON.stringify(payload),
      })
      const resJson = await res.json()

      const { data: dbRec } = await serviceClient
        .from('attendance_records')
        .select('*')
        .eq('tenant_id', TENANT_A)
        .eq('employee_id', acmeEmp.user.id)
        .eq('date', t.date)
        .single()

      proof.ATT_010.push({
        testCase: t.test,
        date: t.date,
        punchUtc: t.timeUtc,
        localPunchIST: t.localTimeIST,
        shiftStart: '09:30:00',
        gracePeriod: '15m (cutoff 09:45:00)',
        delta: t.delta,
        expectedStatus: t.expectedStatus,
        apiStatus: res.status,
        apiReportedStatus: resJson.record?.status,
        dbStatus: dbRec.status,
        pass: resJson.record?.status === t.expectedStatus && dbRec.status === t.expectedStatus,
      })
    }
  }

  // --------------------------------------------------------------------------
  // TC_ATT_011: OVERTIME
  // --------------------------------------------------------------------------
  console.log('--- EXECUTING TC_ATT_011 ---')
  {
    // Shift end: 18:30:00 IST (13:00:00 UTC)
    // TEST 1: Checkout before shift end: 17:30 IST (12:00:00 UTC) -> 0 OT
    // TEST 2: Checkout exactly at shift end: 18:30 IST (13:00:00 UTC) -> 0 OT
    // TEST 3: Checkout 30 min after shift: 19:00 IST (13:30:00 UTC) -> 30 OT
    // TEST 4: Checkout 1+ hour after shift: 20:30 IST (15:00:00 UTC) -> 120 OT

    const otTests = [
      {
        test: 'TEST 1: Checkout before shift end (17:30)',
        date: '2026-10-16',
        inUtc: '2026-10-16T04:00:00.000Z', // 09:30 IST
        outUtc: '2026-10-16T12:00:00.000Z', // 17:30 IST
        checkoutIST: '17:30:00',
        expectedOT: 0,
      },
      {
        test: 'TEST 2: Checkout exactly at shift end (18:30)',
        date: '2026-10-17',
        inUtc: '2026-10-17T04:00:00.000Z',
        outUtc: '2026-10-17T13:00:00.000Z',
        checkoutIST: '18:30:00',
        expectedOT: 0,
      },
      {
        test: 'TEST 3: Checkout 30 min after shift end (19:00)',
        date: '2026-10-18',
        inUtc: '2026-10-18T04:00:00.000Z',
        outUtc: '2026-10-18T13:30:00.000Z',
        checkoutIST: '19:00:00',
        expectedOT: 30,
      },
      {
        test: 'TEST 4: Checkout 2 hours after shift end (20:30)',
        date: '2026-10-19',
        inUtc: '2026-10-19T04:00:00.000Z',
        outUtc: '2026-10-19T15:00:00.000Z',
        checkoutIST: '20:30:00',
        expectedOT: 120,
      },
    ]

    proof.ATT_011 = []

    for (const t of otTests) {
      // 1. Clock in
      await fetch(`${BASE_URL}/api/attendance/checkin`, {
        method: 'POST',
        headers: acmeEmp.headers,
        body: JSON.stringify({
          type: 'clock_in',
          payload: {
            date: t.date,
            clock_in_at: t.inUtc,
            clock_in_lat: 12.9716,
            clock_in_lng: 77.5946,
          },
        }),
      })

      // 2. Clock out
      const outRes = await fetch(`${BASE_URL}/api/attendance/checkin`, {
        method: 'POST',
        headers: acmeEmp.headers,
        body: JSON.stringify({
          type: 'clock_out',
          payload: {
            date: t.date,
            clock_out_at: t.outUtc,
            clock_out_lat: 12.9716,
            clock_out_lng: 77.5946,
          },
        }),
      })
      const outJson = await outRes.json()

      // 3. Query DB
      const { data: dbRec } = await serviceClient
        .from('attendance_records')
        .select('*')
        .eq('tenant_id', TENANT_A)
        .eq('employee_id', acmeEmp.user.id)
        .eq('date', t.date)
        .single()

      const notes = JSON.parse(dbRec.notes || '{}')
      const dbOT = notes.overtime_minutes ?? 0

      proof.ATT_011.push({
        testCase: t.test,
        date: t.date,
        shiftEnd: '18:30:00',
        checkoutIST: t.checkoutIST,
        expectedOT: t.expectedOT,
        apiReportedOT: outJson.record?.overtime_minutes,
        dbStoredOT: dbOT,
        pass: outJson.record?.overtime_minutes === t.expectedOT && dbOT === t.expectedOT,
      })
    }
  }

  // --------------------------------------------------------------------------
  // TC_ATT_012: MISSING OUT
  // --------------------------------------------------------------------------
  console.log('--- EXECUTING TC_ATT_012 ---')
  {
    const missingDate = '2026-06-15'
    // 1. Insert unclosed record
    await serviceClient.from('attendance_records').upsert({
      tenant_id: TENANT_A,
      employee_id: acmeEmp.user.id,
      date: missingDate,
      clock_in_at: '2026-06-15T04:00:00.000Z',
      clock_out_at: null,
      status: 'PRESENT',
      method: 'SELFIE_GPS',
      notes: null,
    })

    // 2. Verify DB state before job
    const { data: beforeDb } = await serviceClient
      .from('attendance_records')
      .select('*')
      .eq('tenant_id', TENANT_A)
      .eq('employee_id', acmeEmp.user.id)
      .eq('date', missingDate)
      .single()

    // 3. Run job Run 1
    const run1Res = await fetch(`${BASE_URL}/api/attendance/auto-checkout`, {
      method: 'POST',
      headers: acmeAdmin.headers,
      body: JSON.stringify({ beforeDate: '2026-07-01' }),
    })
    const run1Json = await run1Res.json()

    // 4. Query DB after Run 1
    const { data: afterRun1Db } = await serviceClient
      .from('attendance_records')
      .select('*')
      .eq('tenant_id', TENANT_A)
      .eq('employee_id', acmeEmp.user.id)
      .eq('date', missingDate)
      .single()

    // 5. Run job Run 2 (idempotency verification)
    const run2Res = await fetch(`${BASE_URL}/api/attendance/auto-checkout`, {
      method: 'POST',
      headers: acmeAdmin.headers,
      body: JSON.stringify({ beforeDate: '2026-07-01' }),
    })
    const run2Json = await run2Res.json()

    // 6. Query DB after Run 2
    const { data: afterRun2Db } = await serviceClient
      .from('attendance_records')
      .select('*')
      .eq('tenant_id', TENANT_A)
      .eq('employee_id', acmeEmp.user.id)
      .eq('date', missingDate)

    proof.ATT_012 = {
      testDate: missingDate,
      before: {
        clock_in_at: beforeDb.clock_in_at,
        clock_out_at: beforeDb.clock_out_at,
        status: beforeDb.status,
        notes: beforeDb.notes,
      },
      run1: {
        httpStatus: run1Res.status,
        response: run1Json,
        dbRecordAfter: {
          id: afterRun1Db.id,
          status: afterRun1Db.status,
          clock_out_at: afterRun1Db.clock_out_at,
          notes: afterRun1Db.notes,
        },
      },
      run2Idempotency: {
        httpStatus: run2Res.status,
        response: run2Json,
        recordCountInDb: afterRun2Db.length,
        notesAfterRun2: afterRun2Db[0]?.notes,
      },
      pass:
        beforeDb.clock_out_at === null &&
        afterRun1Db.notes.includes('Missing Out') &&
        afterRun2Db.length === 1 &&
        afterRun2Db[0].notes.includes('Missing Out'),
    }
  }

  // --------------------------------------------------------------------------
  // TC_LOC_006: MISSING GPS
  // --------------------------------------------------------------------------
  console.log('--- EXECUTING TC_LOC_006 ---')
  {
    // DB count before
    const { count: countBefore } = await serviceClient
      .from('attendance_records')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', TENANT_A)

    const subtests = [
      { name: 'both null', payload: { clock_in_lat: null, clock_in_lng: null } },
      { name: 'missing latitude', payload: { clock_in_lng: 77.5946 } },
      { name: 'missing longitude', payload: { clock_in_lat: 12.9716 } },
      { name: 'empty strings', payload: { clock_in_lat: '', clock_in_lng: '' } },
      { name: 'invalid latitude (>90)', payload: { clock_in_lat: 105.0, clock_in_lng: 77.5946 } },
      { name: 'invalid longitude (>180)', payload: { clock_in_lat: 12.9716, clock_in_lng: 250.0 } },
      { name: 'non-numeric string', payload: { clock_in_lat: 'bad_lat', clock_in_lng: 77.5946 } },
    ]

    const subtestResults = []
    for (const st of subtests) {
      const res = await fetch(`${BASE_URL}/api/attendance/checkin`, {
        method: 'POST',
        headers: acmeEmp.headers,
        body: JSON.stringify({ type: 'clock_in', payload: st.payload }),
      })
      const json = await res.json()
      subtestResults.push({
        subtest: st.name,
        payload: st.payload,
        status: res.status,
        error: json.error,
        expectedStatus: 400,
        pass: res.status === 400,
      })
    }

    const { count: countAfter } = await serviceClient
      .from('attendance_records')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', TENANT_A)

    proof.LOC_006 = {
      countBefore,
      countAfter,
      subtestResults,
      zeroRecordsCreated: countBefore === countAfter,
      pass: subtestResults.every((r) => r.pass) && countBefore === countAfter,
    }
  }

  // --------------------------------------------------------------------------
  // TC_LOC_007: STALE GPS
  // --------------------------------------------------------------------------
  console.log('--- EXECUTING TC_LOC_007 ---')
  {
    const nowMs = Date.now()
    const serverTime = new Date(nowMs).toISOString()

    const staleCases = [
      {
        name: 'Stale (120 seconds old)',
        ts: new Date(nowMs - 120000).toISOString(),
        ageMs: 120000,
        expectedStatus: 400,
      },
      {
        name: 'Stale (65 seconds old)',
        ts: new Date(nowMs - 65000).toISOString(),
        ageMs: 65000,
        expectedStatus: 400,
      },
      {
        name: 'Boundary (exactly 60,001 ms old)',
        ts: new Date(nowMs - 60001).toISOString(),
        ageMs: 60001,
        expectedStatus: 400,
      },
      {
        name: 'Fresh (10 seconds old)',
        ts: new Date(nowMs - 10000).toISOString(),
        ageMs: 10000,
        expectedStatus: 200,
      },
    ]

    const subResults = []
    for (const c of staleCases) {
      const res = await fetch(`${BASE_URL}/api/attendance/checkin`, {
        method: 'POST',
        headers: acmeEmp.headers,
        body: JSON.stringify({
          type: 'clock_in',
          payload: {
            date: '2026-10-20',
            clock_in_lat: 12.9716,
            clock_in_lng: 77.5946,
            location_timestamp: c.ts,
          },
        }),
      })
      const json = await res.json()
      subResults.push({
        case: c.name,
        serverTime,
        locationTimestamp: c.ts,
        calculatedAgeSec: Math.round(c.ageMs / 1000),
        expectedStatus: c.expectedStatus,
        actualStatus: res.status,
        response: json,
        pass: res.status === c.expectedStatus,
      })
    }

    proof.LOC_007 = {
      serverTime,
      subResults,
      pass: subResults.every((r) => r.pass),
    }
  }

  // --------------------------------------------------------------------------
  // TC_LOC_008: MOCK GPS
  // --------------------------------------------------------------------------
  console.log('--- EXECUTING TC_LOC_008 ---')
  {
    // Test 1: Mock location true
    const mockPayload = {
      type: 'clock_in',
      payload: {
        date: '2026-10-21',
        clock_in_lat: 12.9716,
        clock_in_lng: 77.5946,
        isMockLocation: true,
      },
    }
    const mockRes = await fetch(`${BASE_URL}/api/attendance/checkin`, {
      method: 'POST',
      headers: acmeEmp.headers,
      body: JSON.stringify(mockPayload),
    })
    const mockJson = await mockRes.json()

    // Check audit_log
    const { data: auditLog } = await serviceClient
      .from('audit_log')
      .select('*')
      .eq('tenant_id', TENANT_A)
      .eq('action', 'SECURITY_ALERT_MOCK_LOCATION')
      .order('created_at', { ascending: false })
      .limit(1)

    // Test 2: Legitimate GPS (isMockLocation: false)
    const legitPayload = {
      type: 'clock_in',
      payload: {
        date: '2026-10-21',
        clock_in_lat: 12.9716,
        clock_in_lng: 77.5946,
        isMockLocation: false,
      },
    }
    const legitRes = await fetch(`${BASE_URL}/api/attendance/checkin`, {
      method: 'POST',
      headers: acmeEmp.headers,
      body: JSON.stringify(legitPayload),
    })
    const legitJson = await legitRes.json()

    proof.LOC_008 = {
      mockTest: {
        request: mockPayload,
        expectedStatus: 403,
        actualStatus: mockRes.status,
        response: mockJson,
        auditLogRecord: auditLog?.[0],
      },
      legitTest: {
        request: legitPayload,
        expectedStatus: 200,
        actualStatus: legitRes.status,
        recordCreated: !!legitJson.record,
      },
      pass: mockRes.status === 403 && auditLog?.length > 0 && legitRes.status === 200,
    }
  }

  // --------------------------------------------------------------------------
  // TC_LOC_010: BREADCRUMB TRACKING
  // --------------------------------------------------------------------------
  console.log('--- EXECUTING TC_LOC_010 ---')
  {
    const baseTs = Date.now()
    const wp1Ts = new Date(baseTs - 10000).toISOString()
    const wp2Ts = new Date(baseTs - 5000).toISOString()
    const wp3Ts = new Date(baseTs).toISOString()

    const waypointsToSend = [
      { lat: 12.9716, lng: 77.5946, accuracy: 4.2, timestamp: wp1Ts },
      { lat: 12.9720, lng: 77.5950, accuracy: 4.5, timestamp: wp2Ts },
      { lat: 12.9725, lng: 77.5955, accuracy: 4.8, timestamp: wp3Ts },
    ]

    const sentResponses = []
    for (const wp of waypointsToSend) {
      const res = await fetch(`${BASE_URL}/api/location/track`, {
        method: 'POST',
        headers: acmeEmp.headers,
        body: JSON.stringify(wp),
      })
      const json = await res.json()
      sentResponses.push({ status: res.status, json })
    }

    // Query DB
    const { data: dbBreadcrumbs } = await serviceClient
      .from('offline_sync_log')
      .select('*')
      .eq('tenant_id', TENANT_A)
      .eq('user_id', acmeEmp.user.id)
      .eq('entity_type', 'location_breadcrumb')
      .order('created_at', { ascending: true })

    // Call GET /api/location/track
    const getRes = await fetch(`${BASE_URL}/api/location/track`, { headers: acmeEmp.headers })
    const getJson = await getRes.json()

    const retrievedPayloads = getJson.waypoints || []

    const timestampsAscending =
      new Date(waypointsToSend[0].timestamp).getTime() <
      new Date(waypointsToSend[1].timestamp).getTime() &&
      new Date(waypointsToSend[1].timestamp).getTime() <
      new Date(waypointsToSend[2].timestamp).getTime()

    proof.LOC_010 = {
      waypointsSent: waypointsToSend,
      postResponses: sentResponses,
      dbRecordsCount: dbBreadcrumbs.length,
      dbSample: dbBreadcrumbs.slice(-3).map((b) => ({
        tenant_id: b.tenant_id,
        user_id: b.user_id,
        payload: b.payload,
      })),
      retrievalStatus: getRes.status,
      retrievalCount: getJson.count,
      timestampsAscending,
      pass:
        sentResponses.every((r) => r.status === 201) &&
        dbBreadcrumbs.length >= 3 &&
        getRes.status === 200 &&
        timestampsAscending,
    }
  }

  // --------------------------------------------------------------------------
  // TC_ANL_001 TO 005: ANALYTICS + INDEPENDENT RAW DB CALCULATIONS
  // --------------------------------------------------------------------------
  console.log('--- EXECUTING ANALYTICS (ANL_001 - ANL_005) ---')
  {
    // Raw query for Tenant A
    const { data: rawRecords } = await serviceClient
      .from('attendance_records')
      .select('*')
      .eq('tenant_id', TENANT_A)

    // Raw query for Tenant A shifts
    const { data: rawShifts } = await serviceClient
      .from('shifts')
      .select('*')
      .eq('tenant_id', TENANT_A)

    // ANL_001: Independent calculation for trends
    const dateBuckets = {}
    let indepPresent = 0
    let indepLate = 0
    let indepAbsent = 0
    let indepHalfDay = 0

    for (const r of rawRecords) {
      if (!dateBuckets[r.date]) {
        dateBuckets[r.date] = { present: 0, late: 0, absent: 0, half_day: 0, total: 0 }
      }
      dateBuckets[r.date].total += 1
      const st = (r.status || '').toUpperCase()
      if (st === 'PRESENT') {
        dateBuckets[r.date].present += 1
        indepPresent += 1
      } else if (st === 'LATE') {
        dateBuckets[r.date].late += 1
        indepLate += 1
      } else if (st === 'ABSENT') {
        dateBuckets[r.date].absent += 1
        indepAbsent += 1
      } else if (st === 'HALF_DAY') {
        dateBuckets[r.date].half_day += 1
        indepHalfDay += 1
      }
    }

    const trendsRes = await fetch(`${BASE_URL}/api/analytics/trends`, { headers: acmeAdmin.headers })
    const trendsJson = await trendsRes.json()

    proof.ANL_001 = {
      rawDbCalculation: {
        totalRecords: rawRecords.length,
        present: indepPresent,
        late: indepLate,
        absent: indepAbsent,
        halfDay: indepHalfDay,
        datesCount: Object.keys(dateBuckets).length,
      },
      apiResult: trendsJson.summary,
      difference: {
        totalRecordsDiff: rawRecords.length - (trendsJson.summary?.totalRecords ?? 0),
        presentDiff: indepPresent - (trendsJson.summary?.totalPresent ?? 0),
        lateDiff: indepLate - (trendsJson.summary?.totalLate ?? 0),
      },
      pass:
        trendsRes.status === 200 &&
        rawRecords.length === trendsJson.summary?.totalRecords &&
        indepPresent === trendsJson.summary?.totalPresent &&
        indepLate === trendsJson.summary?.totalLate,
    }

    // ANL_002: Late arrivals
    const rawLateRecords = rawRecords.filter((r) => (r.status || '').toUpperCase() === 'LATE')
    const lateRes = await fetch(`${BASE_URL}/api/analytics/late-arrivals`, { headers: acmeAdmin.headers })
    const lateJson = await lateRes.json()

    proof.ANL_002 = {
      rawDbLateCount: rawLateRecords.length,
      rawDbLateIds: rawLateRecords.map((r) => ({ id: r.id, employee_id: r.employee_id, date: r.date })),
      apiLateCount: lateJson.count,
      apiLateIds: lateJson.lateArrivals?.map((r) => ({ id: r.id, employee_id: r.employee_id, date: r.date })),
      difference: rawLateRecords.length - (lateJson.count ?? 0),
      pass: lateRes.status === 200 && rawLateRecords.length === lateJson.count,
    }

    // ANL_003: Absenteeism
    const totalWorkingRecords = rawRecords.length
    const absentCount = indepAbsent
    const indepAbsenteeismRate = totalWorkingRecords > 0
      ? Math.round((absentCount / totalWorkingRecords) * 10000) / 100
      : 0

    const absRes = await fetch(`${BASE_URL}/api/analytics/absenteeism`, { headers: acmeAdmin.headers })
    const absJson = await absRes.json()

    proof.ANL_003 = {
      absentDays: absentCount,
      totalWorkingDays: totalWorkingRecords,
      independentCalculation: indepAbsenteeismRate,
      apiCalculation: absJson.absenteeismRate,
      difference: indepAbsenteeismRate - (absJson.absenteeismRate ?? 0),
      pass: absRes.status === 200 && indepAbsenteeismRate === absJson.absenteeismRate,
    }

    // ANL_004: Overtime
    let indepOTMinutes = 0
    let indepOTRecords = 0
    for (const r of rawRecords) {
      let ot = 0
      if (r.notes) {
        try {
          const parsed = JSON.parse(r.notes)
          if (typeof parsed.overtime_minutes === 'number') ot = parsed.overtime_minutes
        } catch (_err) {
          // ignore non-json notes
        }
      }
      if (ot === 0 && r.work_minutes && r.work_minutes > 480) {
        ot = r.work_minutes - 480
      }
      if (ot > 0) {
        indepOTMinutes += ot
        indepOTRecords += 1
      }
    }
    const indepOTHours = Math.round((indepOTMinutes / 60) * 100) / 100

    const otRes = await fetch(`${BASE_URL}/api/analytics/overtime`, { headers: acmeAdmin.headers })
    const otJson = await otRes.json()

    proof.ANL_004 = {
      independentCalculation: {
        totalMinutes: indepOTMinutes,
        totalHours: indepOTHours,
        recordsCount: indepOTRecords,
      },
      apiResult: {
        totalMinutes: otJson.totalOvertimeMinutes,
        totalHours: otJson.totalOvertimeHours,
        recordsCount: otJson.overtimeRecordsCount,
      },
      difference: indepOTMinutes - (otJson.totalOvertimeMinutes ?? 0),
      pass: otRes.status === 200 && indepOTMinutes === otJson.totalOvertimeMinutes,
    }

    // ANL_005: Utilization
    const defaultShift = rawShifts.find((s) => s.is_default) || rawShifts[0]
    let totalScheduledAll = 0
    let totalWorkedAll = 0

    for (const r of rawRecords) {
      if (typeof r.work_minutes === 'number') {
        totalWorkedAll += r.work_minutes
        // scheduled minutes for standard core tech: 09:30 to 18:30 (9h = 540m - 60m break = 480m)
        totalScheduledAll += 480
      }
    }

    const indepUtilization = totalScheduledAll > 0
      ? Math.round((totalWorkedAll / totalScheduledAll) * 10000) / 100
      : 100

    const utilRes = await fetch(`${BASE_URL}/api/analytics/utilization`, { headers: acmeAdmin.headers })
    const utilJson = await utilRes.json()

    proof.ANL_005 = {
      independentCalculation: {
        totalWorkedMinutes: totalWorkedAll,
        totalScheduledMinutes: totalScheduledAll,
        utilizationRate: Math.min(100, Math.max(0, indepUtilization)),
      },
      apiResult: {
        overallUtilization: utilJson.overallUtilization,
        shiftsCount: utilJson.shifts?.length,
        totalRecordsAnalyzed: utilJson.totalRecordsAnalyzed,
      },
      pass: utilRes.status === 200 && typeof utilJson.overallUtilization === 'number',
    }
  }

  // --------------------------------------------------------------------------
  // TENANT ISOLATION CHECK
  // --------------------------------------------------------------------------
  console.log('--- EXECUTING TENANT ISOLATION CHECK ---')
  {
    // Tenant A (Acme) Admin calls analytics
    const aTrends = await (await fetch(`${BASE_URL}/api/analytics/trends`, { headers: acmeAdmin.headers })).json()
    const aLate = await (await fetch(`${BASE_URL}/api/analytics/late-arrivals`, { headers: acmeAdmin.headers })).json()

    // Tenant B (Globex) Admin calls analytics
    const bTrends = await (await fetch(`${BASE_URL}/api/analytics/trends`, { headers: globexAdmin.headers })).json()
    const bLate = await (await fetch(`${BASE_URL}/api/analytics/late-arrivals`, { headers: globexAdmin.headers })).json()

    // Check if Tenant A employee IDs appear in Tenant B late list
    const bLateEmployeeIds = (bLate.lateArrivals || []).map((r) => r.employee_id)
    const leakAtoB = bLateEmployeeIds.includes(acmeEmp.user.id)

    // Check if Tenant B employee IDs appear in Tenant A late list
    const aLateEmployeeIds = (aLate.lateArrivals || []).map((r) => r.employee_id)
    const leakBtoA = aLateEmployeeIds.includes(globexEmp.user.id)

    proof.TENANT_ISOLATION = {
      tenantA: {
        id: TENANT_A,
        name: 'AcmeTech Solutions',
        recordsCount: aTrends.summary?.totalRecords,
        lateCount: aLate.count,
      },
      tenantB: {
        id: TENANT_B,
        name: 'Globex Corp',
        recordsCount: bTrends.summary?.totalRecords,
        lateCount: bLate.count,
      },
      leakAtoB,
      leakBtoA,
      pass: !leakAtoB && !leakBtoA,
    }
  }

  // --------------------------------------------------------------------------
  // REGRESSION VERIFICATION (TC_ATT_001, 002, TC_LOC_001, 002, 005, 009, 012)
  // --------------------------------------------------------------------------
  console.log('--- EXECUTING REGRESSION TESTS ---')
  {
    proof.REGRESSION = {}

    // TC_ATT_001: Standard Clock-In
    const att001Res = await fetch(`${BASE_URL}/api/attendance/checkin`, {
      method: 'POST',
      headers: acmeEmp.headers,
      body: JSON.stringify({
        type: 'clock_in',
        payload: {
          date: '2026-10-25',
          clock_in_at: '2026-10-25T04:00:00.000Z',
          clock_in_lat: 12.9716,
          clock_in_lng: 77.5946,
        },
      }),
    })
    const att001Json = await att001Res.json()
    proof.REGRESSION.ATT_001 = { status: att001Res.status, record: att001Json.record, pass: att001Res.status === 200 }

    // TC_ATT_002: Standard Clock-Out
    const att002Res = await fetch(`${BASE_URL}/api/attendance/checkin`, {
      method: 'POST',
      headers: acmeEmp.headers,
      body: JSON.stringify({
        type: 'clock_out',
        payload: {
          date: '2026-10-25',
          clock_out_at: '2026-10-25T12:00:00.000Z',
          clock_out_lat: 12.9716,
          clock_out_lng: 77.5946,
        },
      }),
    })
    const att002Json = await att002Res.json()
    proof.REGRESSION.ATT_002 = { status: att002Res.status, record: att002Json.record, pass: att002Res.status === 200 }

    // TC_LOC_001: Inside Geofence
    const loc001Res = await fetch(`${BASE_URL}/api/attendance/checkin`, {
      method: 'POST',
      headers: acmeEmp.headers,
      body: JSON.stringify({
        type: 'clock_in',
        payload: {
          date: '2026-10-26',
          clock_in_lat: 12.9716,
          clock_in_lng: 77.5946,
        },
      }),
    })
    const loc001Json = await loc001Res.json()
    proof.REGRESSION.LOC_001 = { status: loc001Res.status, valid: loc001Json.record?.geofence_valid, pass: loc001Res.status === 200 && loc001Json.record?.geofence_valid === true }

    // TC_LOC_002: Outside Geofence
    const loc002Res = await fetch(`${BASE_URL}/api/attendance/checkin`, {
      method: 'POST',
      headers: acmeEmp.headers,
      body: JSON.stringify({
        type: 'clock_in',
        payload: {
          date: '2026-10-26',
          clock_in_lat: 28.6139,
          clock_in_lng: 77.2090,
        },
      }),
    })
    const loc002Json = await loc002Res.json()
    proof.REGRESSION.LOC_002 = { status: loc002Res.status, error: loc002Json.error, pass: loc002Res.status === 403 && loc002Json.error?.includes('OUTSIDE_GEOFENCE') }

    // TC_LOC_005: Radius Precision (~111m vs ~378m)
    const loc005In = await fetch(`${BASE_URL}/api/attendance/checkin`, {
      method: 'POST',
      headers: acmeEmp.headers,
      body: JSON.stringify({
        type: 'clock_in',
        payload: { date: '2026-10-27', clock_in_lat: 12.9726, clock_in_lng: 77.5946 },
      }),
    })
    const loc005Out = await fetch(`${BASE_URL}/api/attendance/checkin`, {
      method: 'POST',
      headers: acmeEmp.headers,
      body: JSON.stringify({
        type: 'clock_in',
        payload: { date: '2026-10-27', clock_in_lat: 12.9750, clock_in_lng: 77.5946 },
      }),
    })
    proof.REGRESSION.LOC_005 = { insideStatus: loc005In.status, outsideStatus: loc005Out.status, pass: loc005In.status === 200 && loc005Out.status === 403 }

    // TC_LOC_009: Multiple Geofences (Globex Chennai & Bangalore)
    const loc009Site1 = await fetch(`${BASE_URL}/api/attendance/checkin`, {
      method: 'POST',
      headers: globexEmp.headers,
      body: JSON.stringify({
        type: 'clock_in',
        payload: { date: '2026-10-28', clock_in_lat: 13.0827, clock_in_lng: 80.2707 },
      }),
    })
    const loc009Site2 = await fetch(`${BASE_URL}/api/attendance/checkin`, {
      method: 'POST',
      headers: globexEmp.headers,
      body: JSON.stringify({
        type: 'clock_in',
        payload: { date: '2026-10-29', clock_in_lat: 12.9352, clock_in_lng: 77.6245 },
      }),
    })
    proof.REGRESSION.LOC_009 = { site1Status: loc009Site1.status, site2Status: loc009Site2.status, pass: loc009Site1.status === 200 && loc009Site2.status === 200 }

    // TC_LOC_012: Tampered GPS
    const loc012Res = await fetch(`${BASE_URL}/api/attendance/checkin`, {
      method: 'POST',
      headers: acmeEmp.headers,
      body: JSON.stringify({
        type: 'clock_in',
        payload: { clock_in_lat: 'corrupted', clock_in_lng: NaN },
      }),
    })
    proof.REGRESSION.LOC_012 = { status: loc012Res.status, pass: loc012Res.status === 400 }
  }

  // Save all raw proofs to disk
  fs.writeFileSync('proof-output.json', JSON.stringify(proof, null, 2))
  console.log('\n✔ All proof data written to proof-output.json')

  // Clean up all temporary dates used
  await serviceClient.from('attendance_records').delete().in('date', [
    '2026-06-15',
    '2026-10-10',
    '2026-10-11',
    '2026-10-12',
    '2026-10-13',
    '2026-10-14',
    '2026-10-15',
    '2026-10-16',
    '2026-10-17',
    '2026-10-18',
    '2026-10-19',
    '2026-10-20',
    '2026-10-21',
    '2026-10-25',
    '2026-10-26',
    '2026-10-27',
    '2026-10-28',
    '2026-10-29',
  ])
  console.log('✔ Cleaned up temporary test records')
}

run().catch((err) => {
  console.error('Fatal execution error:', err)
  process.exit(1)
})
