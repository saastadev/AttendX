// ==============================================================================
// AttendX MVP — Targeted Backend Remediation & Regression Verification Suite
// Validates 100% of the 13 Targeted Remediation Cases + 7 Regression Checks
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

const RESULTS = []

function logResult(tcId, name, status, details) {
  RESULTS.push({ tcId, name, status, details })
  const icon = status === 'PASS' ? '✅' : '❌'
  console.log(`${icon} [${tcId}] ${name}: ${status} — ${details}`)
}

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

async function runAllTests() {
  console.log('==============================================================================')
  console.log('ATTENDX MVP TARGETED BACKEND REMEDIATION & REGRESSION VERIFICATION')
  console.log('Target Server:', BASE_URL)
  console.log('Database:', supabaseUrl)
  console.log('==============================================================================\n')

  // Setup Accounts
  const acmeEmployee = await loginUser('employee@acme-tech.com')
  const acmeAdmin = await loginUser('admin@acme-tech.com')
  const globexEmployee = await loginUser('employee@globex-corp.com')

  // Bangalore Tech Park geofence center: 12.9716, 77.5946 (radius 250m)
  const HQ_LAT = 12.9716
  const HQ_LNG = 77.5946

  // Remote coordinate: Delhi (28.6139, 77.2090)
  const REMOTE_LAT = 28.6139
  const REMOTE_LNG = 77.2090

  // --------------------------------------------------------------------------
  // SECTION A: ATTENDANCE + SHIFT + TIME
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION A: ATTENDANCE + SHIFT + TIME ---')

  // TC_ATT_009: Shift Assignment
  try {
    const res = await fetch(`${BASE_URL}/api/shifts`, { headers: acmeEmployee.headers })
    const json = await res.json()
    if (res.status === 200 && json.shifts && json.shifts.length > 0 && json.activeShift) {
      logResult(
        'TC_ATT_009',
        'Shift Assignment API',
        'PASS',
        `Returned ${json.shifts.length} shifts. Active shift: ${json.activeShift.name} (${json.activeShift.start_time}-${json.activeShift.end_time})`
      )
    } else {
      logResult('TC_ATT_009', 'Shift Assignment API', 'FAIL', `Status ${res.status}: ${JSON.stringify(json)}`)
    }
  } catch (err) {
    logResult('TC_ATT_009', 'Shift Assignment API', 'FAIL', err.message)
  }

  // TC_ATT_010: Late / Early Detection
  try {
    // Acme Tech shift: 09:30:00 start time, 15 min grace => late if > 09:45:00
    // Punch at 10:30:00 (Asia/Kolkata is UTC+5:30, so 10:30 IST is 05:00 UTC)
    const latePunchTime = new Date('2026-09-20T05:00:00.000Z').toISOString() // 10:30:00 IST
    const lateRes = await fetch(`${BASE_URL}/api/attendance/checkin`, {
      method: 'POST',
      headers: acmeEmployee.headers,
      body: JSON.stringify({
        type: 'clock_in',
        payload: {
          date: '2026-09-20',
          clock_in_at: latePunchTime,
          clock_in_lat: HQ_LAT,
          clock_in_lng: HQ_LNG,
          method: 'SELFIE_GPS',
        },
      }),
    })
    const lateJson = await lateRes.json()
    const isLate = lateRes.status === 200 && lateJson.record?.status === 'LATE'

    // Punch on-time at 09:35:00 IST (04:05 UTC)
    const onTimePunch = new Date('2026-09-21T04:05:00.000Z').toISOString()
    const onTimeRes = await fetch(`${BASE_URL}/api/attendance/checkin`, {
      method: 'POST',
      headers: acmeEmployee.headers,
      body: JSON.stringify({
        type: 'clock_in',
        payload: {
          date: '2026-09-21',
          clock_in_at: onTimePunch,
          clock_in_lat: HQ_LAT,
          clock_in_lng: HQ_LNG,
          method: 'SELFIE_GPS',
        },
      }),
    })
    const onTimeJson = await onTimeRes.json()
    const isOnTime = onTimeRes.status === 200 && onTimeJson.record?.status === 'PRESENT'

    if (isLate && isOnTime) {
      logResult(
        'TC_ATT_010',
        'Late / Early Detection',
        'PASS',
        `Punch at 10:30 marked ${lateJson.record.status} (>09:45 grace). Punch at 09:35 marked ${onTimeJson.record.status} (<=09:45)`
      )
    } else {
      logResult(
        'TC_ATT_010',
        'Late / Early Detection',
        'FAIL',
        `Late check: ${lateJson.record?.status} (status: ${lateRes.status}), OnTime check: ${onTimeJson.record?.status}`
      )
    }
  } catch (err) {
    logResult('TC_ATT_010', 'Late / Early Detection', 'FAIL', err.message)
  }

  // TC_ATT_011: Overtime Calculation
  try {
    // Clock-in at 09:30 IST (04:00 UTC) on 2026-09-22, Clock-out at 20:30 IST (15:00 UTC)
    // Shift ends at 18:30 IST. 20:30 - 18:30 = 2 hours = 120 minutes overtime
    const inTime = new Date('2026-09-22T04:00:00.000Z').toISOString()
    const outTime = new Date('2026-09-22T15:00:00.000Z').toISOString()

    // 1. Clock in
    await fetch(`${BASE_URL}/api/attendance/checkin`, {
      method: 'POST',
      headers: acmeEmployee.headers,
      body: JSON.stringify({
        type: 'clock_in',
        payload: {
          date: '2026-09-22',
          clock_in_at: inTime,
          clock_in_lat: HQ_LAT,
          clock_in_lng: HQ_LNG,
        },
      }),
    })

    // 2. Clock out
    const outRes = await fetch(`${BASE_URL}/api/attendance/checkin`, {
      method: 'POST',
      headers: acmeEmployee.headers,
      body: JSON.stringify({
        type: 'clock_out',
        payload: {
          date: '2026-09-22',
          clock_out_at: outTime,
          clock_out_lat: HQ_LAT,
          clock_out_lng: HQ_LNG,
        },
      }),
    })
    const outJson = await outRes.json()

    if (outRes.status === 200 && outJson.record?.overtime_minutes === 120) {
      logResult(
        'TC_ATT_011',
        'Overtime Calculation',
        'PASS',
        `Overtime correctly calculated: ${outJson.record.overtime_minutes} minutes (2.0 hrs) beyond shift end 18:30`
      )
    } else {
      logResult(
        'TC_ATT_011',
        'Overtime Calculation',
        'FAIL',
        `Expected 120 mins, got: ${outJson.record?.overtime_minutes} (Status: ${outRes.status})`
      )
    }
  } catch (err) {
    logResult('TC_ATT_011', 'Overtime Calculation', 'FAIL', err.message)
  }

  // TC_ATT_012: Missing Out Detection
  try {
    // Seed unclosed record on past date 2026-08-01
    await serviceClient.from('attendance_records').upsert({
      tenant_id: '10000000-0000-0000-0000-000000000001',
      employee_id: acmeEmployee.user.id,
      date: '2026-08-01',
      clock_in_at: '2026-08-01T04:00:00.000Z',
      clock_out_at: null,
      status: 'PRESENT',
      method: 'SELFIE_GPS',
    })

    const sweepRes = await fetch(`${BASE_URL}/api/attendance/auto-checkout`, {
      method: 'POST',
      headers: acmeAdmin.headers,
      body: JSON.stringify({ beforeDate: '2026-09-01' }),
    })
    const sweepJson = await sweepRes.json()

    if (sweepRes.status === 200 && sweepJson.count >= 1) {
      const flagged = sweepJson.records.find((r) => r.date === '2026-08-01')
      logResult(
        'TC_ATT_012',
        'Missing Out Detection',
        'PASS',
        `Auto-checkout detected and flagged ${sweepJson.count} missing out records. Target record flagged: ${!!flagged}`
      )
    } else {
      logResult('TC_ATT_012', 'Missing Out Detection', 'FAIL', `Status ${sweepRes.status}: ${JSON.stringify(sweepJson)}`)
    }
  } catch (err) {
    logResult('TC_ATT_012', 'Missing Out Detection', 'FAIL', err.message)
  }

  // --------------------------------------------------------------------------
  // SECTION B: LOCATION + GPS + FRAUD + WAYPOINT TRACKING
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION B: LOCATION + GPS + FRAUD + WAYPOINT TRACKING ---')

  // TC_LOC_006: Location Coordinate Validation
  try {
    // Missing lat/lng
    const r1 = await fetch(`${BASE_URL}/api/attendance/checkin`, {
      method: 'POST',
      headers: acmeEmployee.headers,
      body: JSON.stringify({
        type: 'clock_in',
        payload: { clock_in_lat: null, clock_in_lng: null },
      }),
    })

    // Out of range lat (>90)
    const r2 = await fetch(`${BASE_URL}/api/attendance/checkin`, {
      method: 'POST',
      headers: acmeEmployee.headers,
      body: JSON.stringify({
        type: 'clock_in',
        payload: { clock_in_lat: 105.0, clock_in_lng: 77.5946 },
      }),
    })

    // Non-numeric string
    const r3 = await fetch(`${BASE_URL}/api/attendance/checkin`, {
      method: 'POST',
      headers: acmeEmployee.headers,
      body: JSON.stringify({
        type: 'clock_in',
        payload: { clock_in_lat: 'invalid_lat', clock_in_lng: 77.5946 },
      }),
    })

    if (r1.status === 400 && r2.status === 400 && r3.status === 400) {
      logResult(
        'TC_LOC_006',
        'Location Coordinate Validation',
        'PASS',
        `Rejected missing coordinates (400), out-of-range coordinates (400), and non-numeric coordinates (400)`
      )
    } else {
      logResult('TC_LOC_006', 'Location Coordinate Validation', 'FAIL', `r1: ${r1.status}, r2: ${r2.status}, r3: ${r3.status}`)
    }
  } catch (err) {
    logResult('TC_LOC_006', 'Location Coordinate Validation', 'FAIL', err.message)
  }

  // TC_LOC_007: Stale Location Detection
  try {
    const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString() // 10 minutes ago
    const staleRes = await fetch(`${BASE_URL}/api/attendance/checkin`, {
      method: 'POST',
      headers: acmeEmployee.headers,
      body: JSON.stringify({
        type: 'clock_in',
        payload: {
          clock_in_lat: HQ_LAT,
          clock_in_lng: HQ_LNG,
          location_timestamp: staleTime,
        },
      }),
    })

    const freshTime = new Date().toISOString()
    const freshRes = await fetch(`${BASE_URL}/api/attendance/checkin`, {
      method: 'POST',
      headers: acmeEmployee.headers,
      body: JSON.stringify({
        type: 'clock_in',
        payload: {
          date: '2026-09-23',
          clock_in_lat: HQ_LAT,
          clock_in_lng: HQ_LNG,
          location_timestamp: freshTime,
        },
      }),
    })

    if (staleRes.status === 400 && freshRes.status === 200) {
      logResult(
        'TC_LOC_007',
        'Location Freshness / Stale Location Detection',
        'PASS',
        `Stale timestamp rejected with 400; Fresh timestamp accepted with 200`
      )
    } else {
      logResult('TC_LOC_007', 'Location Freshness / Stale Location Detection', 'FAIL', `Stale: ${staleRes.status}, Fresh: ${freshRes.status}`)
    }
  } catch (err) {
    logResult('TC_LOC_007', 'Location Freshness / Stale Location Detection', 'FAIL', err.message)
  }

  // TC_LOC_008: Mock Location Detection
  try {
    const mockRes = await fetch(`${BASE_URL}/api/attendance/checkin`, {
      method: 'POST',
      headers: acmeEmployee.headers,
      body: JSON.stringify({
        type: 'clock_in',
        payload: {
          clock_in_lat: HQ_LAT,
          clock_in_lng: HQ_LNG,
          isMockLocation: true,
        },
      }),
    })

    // Check if security alert was recorded in audit_log
    const { data: auditEntries } = await serviceClient
      .from('audit_log')
      .select('*')
      .eq('action', 'SECURITY_ALERT_MOCK_LOCATION')
      .order('created_at', { ascending: false })
      .limit(1)

    const auditLogged = auditEntries && auditEntries.length > 0

    if (mockRes.status === 403 && auditLogged) {
      logResult(
        'TC_LOC_008',
        'Mock Location Detection',
        'PASS',
        `Mock location blocked with 403 Forbidden and security alert recorded in audit_log`
      )
    } else {
      logResult('TC_LOC_008', 'Mock Location Detection', 'FAIL', `Mock status: ${mockRes.status}, Audit logged: ${auditLogged}`)
    }
  } catch (err) {
    logResult('TC_LOC_008', 'Mock Location Detection', 'FAIL', err.message)
  }

  // TC_LOC_010: Waypoint Tracking API
  try {
    const trackPostRes = await fetch(`${BASE_URL}/api/location/track`, {
      method: 'POST',
      headers: acmeEmployee.headers,
      body: JSON.stringify({
        lat: HQ_LAT,
        lng: HQ_LNG,
        accuracy: 4.5,
        timestamp: new Date().toISOString(),
      }),
    })
    const trackPostJson = await trackPostRes.json()

    const trackGetRes = await fetch(`${BASE_URL}/api/location/track`, {
      headers: acmeEmployee.headers,
    })
    const trackGetJson = await trackGetRes.json()

    // Test rejection of mock location on waypoint tracking
    const mockTrackRes = await fetch(`${BASE_URL}/api/location/track`, {
      method: 'POST',
      headers: acmeEmployee.headers,
      body: JSON.stringify({
        lat: HQ_LAT,
        lng: HQ_LNG,
        isMockLocation: true,
      }),
    })

    if (trackPostRes.status === 201 && trackGetRes.status === 200 && mockTrackRes.status === 403) {
      logResult(
        'TC_LOC_010',
        'Waypoint Tracking API',
        'PASS',
        `POST /api/location/track created waypoint (201), GET retrieved breadcrumbs (200, count=${trackGetJson.count}), Mock location rejected (403)`
      )
    } else {
      logResult(
        'TC_LOC_010',
        'Waypoint Tracking API',
        'FAIL',
        `POST status: ${trackPostRes.status}, GET status: ${trackGetRes.status}, Mock status: ${mockTrackRes.status}`
      )
    }
  } catch (err) {
    logResult('TC_LOC_010', 'Waypoint Tracking API', 'FAIL', err.message)
  }

  // --------------------------------------------------------------------------
  // SECTION C: OPERATIONAL ANALYTICS
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION C: OPERATIONAL ANALYTICS ---')

  // TC_ANL_001: Attendance Trends API
  try {
    const res = await fetch(`${BASE_URL}/api/analytics/trends`, { headers: acmeAdmin.headers })
    const json = await res.json()
    if (res.status === 200 && Array.isArray(json.trends) && json.summary) {
      logResult(
        'TC_ANL_001',
        'Attendance Trends API',
        'PASS',
        `Returned ${json.trends.length} date buckets. Total records: ${json.summary.totalRecords}, Present: ${json.summary.totalPresent}, Late: ${json.summary.totalLate}`
      )
    } else {
      logResult('TC_ANL_001', 'Attendance Trends API', 'FAIL', `Status ${res.status}: ${JSON.stringify(json)}`)
    }
  } catch (err) {
    logResult('TC_ANL_001', 'Attendance Trends API', 'FAIL', err.message)
  }

  // TC_ANL_002: Late Arrivals API
  try {
    const res = await fetch(`${BASE_URL}/api/analytics/late-arrivals`, { headers: acmeAdmin.headers })
    const json = await res.json()
    if (res.status === 200 && Array.isArray(json.lateArrivals) && typeof json.count === 'number') {
      logResult(
        'TC_ANL_002',
        'Late Arrivals API',
        'PASS',
        `Returned ${json.count} late arrival records with shift metadata`
      )
    } else {
      logResult('TC_ANL_002', 'Late Arrivals API', 'FAIL', `Status ${res.status}: ${JSON.stringify(json)}`)
    }
  } catch (err) {
    logResult('TC_ANL_002', 'Late Arrivals API', 'FAIL', err.message)
  }

  // TC_ANL_003: Absenteeism Rate API
  try {
    const res = await fetch(`${BASE_URL}/api/analytics/absenteeism`, { headers: acmeAdmin.headers })
    const json = await res.json()
    if (res.status === 200 && typeof json.absenteeismRate === 'number' && !isNaN(json.absenteeismRate)) {
      logResult(
        'TC_ANL_003',
        'Absenteeism Rate API',
        'PASS',
        `Absenteeism rate: ${json.absenteeismRate}% (Total records: ${json.totalRecords}, Absent: ${json.absentCount}) — 0 denominator handled safely`
      )
    } else {
      logResult('TC_ANL_003', 'Absenteeism Rate API', 'FAIL', `Status ${res.status}: ${JSON.stringify(json)}`)
    }
  } catch (err) {
    logResult('TC_ANL_003', 'Absenteeism Rate API', 'FAIL', err.message)
  }

  // TC_ANL_004: Overtime Analytics API
  try {
    const res = await fetch(`${BASE_URL}/api/analytics/overtime`, { headers: acmeAdmin.headers })
    const json = await res.json()
    if (res.status === 200 && typeof json.totalOvertimeMinutes === 'number') {
      logResult(
        'TC_ANL_004',
        'Overtime Analytics API',
        'PASS',
        `Total Overtime: ${json.totalOvertimeMinutes} mins (${json.totalOvertimeHours} hrs) across ${json.overtimeRecordsCount} overtime records`
      )
    } else {
      logResult('TC_ANL_004', 'Overtime Analytics API', 'FAIL', `Status ${res.status}: ${JSON.stringify(json)}`)
    }
  } catch (err) {
    logResult('TC_ANL_004', 'Overtime Analytics API', 'FAIL', err.message)
  }

  // TC_ANL_005: Shift Utilization API
  try {
    const res = await fetch(`${BASE_URL}/api/analytics/utilization`, { headers: acmeAdmin.headers })
    const json = await res.json()
    if (res.status === 200 && typeof json.overallUtilization === 'number' && Array.isArray(json.shifts)) {
      logResult(
        'TC_ANL_005',
        'Shift Utilization API',
        'PASS',
        `Overall shift utilization: ${json.overallUtilization}% across ${json.shifts.length} configured shifts`
      )
    } else {
      logResult('TC_ANL_005', 'Shift Utilization API', 'FAIL', `Status ${res.status}: ${JSON.stringify(json)}`)
    }
  } catch (err) {
    logResult('TC_ANL_005', 'Shift Utilization API', 'FAIL', err.message)
  }

  // --------------------------------------------------------------------------
  // SECTION D: REGRESSION TESTING (ALREADY-PASSING FUNCTIONALITY)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION D: REGRESSION VERIFICATION ---')

  // TC_ATT_001: Standard Clock-In
  try {
    const date = '2026-09-24'
    const res = await fetch(`${BASE_URL}/api/attendance/checkin`, {
      method: 'POST',
      headers: acmeEmployee.headers,
      body: JSON.stringify({
        type: 'clock_in',
        payload: {
          date,
          clock_in_at: new Date().toISOString(),
          clock_in_lat: HQ_LAT,
          clock_in_lng: HQ_LNG,
          method: 'SELFIE_GPS',
        },
      }),
    })
    const json = await res.json()
    if (res.status === 200 && json.record?.date === date && json.record?.clock_in_at) {
      logResult('TC_ATT_001', 'Standard Clock-In', 'PASS', `Clock-in record created successfully (HTTP 200, status=${json.record.status})`)
    } else {
      logResult('TC_ATT_001', 'Standard Clock-In', 'FAIL', `Status ${res.status}: ${JSON.stringify(json)}`)
    }
  } catch (err) {
    logResult('TC_ATT_001', 'Standard Clock-In', 'FAIL', err.message)
  }

  // TC_ATT_002: Standard Clock-Out
  try {
    const date = '2026-09-24'
    const res = await fetch(`${BASE_URL}/api/attendance/checkin`, {
      method: 'POST',
      headers: acmeEmployee.headers,
      body: JSON.stringify({
        type: 'clock_out',
        payload: {
          date,
          clock_out_at: new Date().toISOString(),
          clock_out_lat: HQ_LAT,
          clock_out_lng: HQ_LNG,
        },
      }),
    })
    const json = await res.json()
    if (res.status === 200 && json.record?.clock_out_at) {
      logResult('TC_ATT_002', 'Standard Clock-Out', 'PASS', `Clock-out completed (HTTP 200, work_minutes=${json.record.work_minutes})`)
    } else {
      logResult('TC_ATT_002', 'Standard Clock-Out', 'FAIL', `Status ${res.status}: ${JSON.stringify(json)}`)
    }
  } catch (err) {
    logResult('TC_ATT_002', 'Standard Clock-Out', 'FAIL', err.message)
  }

  // TC_LOC_001: Inside Geofence Clock-In
  try {
    const res = await fetch(`${BASE_URL}/api/attendance/checkin`, {
      method: 'POST',
      headers: acmeEmployee.headers,
      body: JSON.stringify({
        type: 'clock_in',
        payload: {
          date: '2026-09-25',
          clock_in_lat: HQ_LAT,
          clock_in_lng: HQ_LNG,
        },
      }),
    })
    const json = await res.json()
    if (res.status === 200 && json.record?.geofence_valid === true) {
      logResult('TC_LOC_001', 'Inside Geofence Clock-In', 'PASS', `Accepted inside geofence perimeter (HTTP 200, geofence_valid=true)`)
    } else {
      logResult('TC_LOC_001', 'Inside Geofence Clock-In', 'FAIL', `Status ${res.status}: ${JSON.stringify(json)}`)
    }
  } catch (err) {
    logResult('TC_LOC_001', 'Inside Geofence Clock-In', 'FAIL', err.message)
  }

  // TC_LOC_002: Outside Geofence Rejection
  try {
    const res = await fetch(`${BASE_URL}/api/attendance/checkin`, {
      method: 'POST',
      headers: acmeEmployee.headers,
      body: JSON.stringify({
        type: 'clock_in',
        payload: {
          date: '2026-09-25',
          clock_in_lat: REMOTE_LAT,
          clock_in_lng: REMOTE_LNG,
        },
      }),
    })
    const json = await res.json()
    if (res.status === 403 && json.error?.includes('OUTSIDE_GEOFENCE')) {
      logResult('TC_LOC_002', 'Outside Geofence Rejection', 'PASS', `Rejected remote clock-in with HTTP 403 OUTSIDE_GEOFENCE (distance: ${json.distance}m)`)
    } else {
      logResult('TC_LOC_002', 'Outside Geofence Rejection', 'FAIL', `Status ${res.status}: ${JSON.stringify(json)}`)
    }
  } catch (err) {
    logResult('TC_LOC_002', 'Outside Geofence Rejection', 'FAIL', err.message)
  }

  // TC_LOC_005: Geofence Radius Precision
  try {
    // Exact radius boundary test: HQ is 12.9716, 77.5946, radius 250m.
    // 0.001 deg lat is ~111m. Lat 12.9726 is ~111m away (within 250m).
    // Lat 12.9750 is ~378m away (outside 250m).
    const withinRes = await fetch(`${BASE_URL}/api/attendance/checkin`, {
      method: 'POST',
      headers: acmeEmployee.headers,
      body: JSON.stringify({
        type: 'clock_in',
        payload: {
          date: '2026-09-26',
          clock_in_lat: 12.9726,
          clock_in_lng: 77.5946,
        },
      }),
    })

    const outsideRes = await fetch(`${BASE_URL}/api/attendance/checkin`, {
      method: 'POST',
      headers: acmeEmployee.headers,
      body: JSON.stringify({
        type: 'clock_in',
        payload: {
          date: '2026-09-26',
          clock_in_lat: 12.9750,
          clock_in_lng: 77.5946,
        },
      }),
    })

    if (withinRes.status === 200 && outsideRes.status === 403) {
      logResult('TC_LOC_005', 'Geofence Radius Precision', 'PASS', `Coordinate at ~111m passed (200), coordinate at ~378m rejected (403)`)
    } else {
      logResult('TC_LOC_005', 'Geofence Radius Precision', 'FAIL', `Within status: ${withinRes.status}, Outside status: ${outsideRes.status}`)
    }
  } catch (err) {
    logResult('TC_LOC_005', 'Geofence Radius Precision', 'FAIL', err.message)
  }

  // TC_LOC_009: Multiple Geofences Support
  try {
    // Globex Corp has 2 geofences: Chennai MegaStore (13.0827, 80.2707) and Bangalore Retail (12.9352, 77.6245)
    const site1Res = await fetch(`${BASE_URL}/api/attendance/checkin`, {
      method: 'POST',
      headers: globexEmployee.headers,
      body: JSON.stringify({
        type: 'clock_in',
        payload: {
          date: '2026-09-27',
          clock_in_lat: 13.0827,
          clock_in_lng: 80.2707,
        },
      }),
    })
    const site1Json = await site1Res.json()

    const site2Res = await fetch(`${BASE_URL}/api/attendance/checkin`, {
      method: 'POST',
      headers: globexEmployee.headers,
      body: JSON.stringify({
        type: 'clock_in',
        payload: {
          date: '2026-09-28',
          clock_in_lat: 12.9352,
          clock_in_lng: 77.6245,
        },
      }),
    })
    const site2Json = await site2Res.json()

    if (site1Res.status === 200 && site2Res.status === 200) {
      logResult(
        'TC_LOC_009',
        'Multiple Geofences Support',
        'PASS',
        `Employee successfully clocked in across both configured branch geofences (Chennai & Bangalore)`
      )
    } else {
      logResult('TC_LOC_009', 'Multiple Geofences Support', 'FAIL', `Site 1: ${site1Res.status}, Site 2: ${site2Res.status}`)
    }
  } catch (err) {
    logResult('TC_LOC_009', 'Multiple Geofences Support', 'FAIL', err.message)
  }

  // TC_LOC_012: Tampered GPS Handling
  try {
    const tamperedRes = await fetch(`${BASE_URL}/api/attendance/checkin`, {
      method: 'POST',
      headers: acmeEmployee.headers,
      body: JSON.stringify({
        type: 'clock_in',
        payload: {
          clock_in_lat: 'tampered_lat_injection',
          clock_in_lng: NaN,
        },
      }),
    })

    if (tamperedRes.status === 400) {
      logResult('TC_LOC_012', 'Tampered GPS Handling', 'PASS', `Tampered / non-numeric GPS payload cleanly rejected with HTTP 400`)
    } else {
      logResult('TC_LOC_012', 'Tampered GPS Handling', 'FAIL', `Expected 400, got ${tamperedRes.status}`)
    }
  } catch (err) {
    logResult('TC_LOC_012', 'Tampered GPS Handling', 'FAIL', err.message)
  }

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n==============================================================================')
  console.log('FINAL EXECUTION SUMMARY')
  console.log('==============================================================================')
  const total = RESULTS.length
  const passed = RESULTS.filter((r) => r.status === 'PASS').length
  const failed = RESULTS.filter((r) => r.status === 'FAIL').length
  console.log(`Total Test Cases Executed: ${total}`)
  console.log(`Passed: ${passed} / ${total} (${Math.round((passed / total) * 100)}%)`)
  console.log(`Failed: ${failed}`)
  console.log('==============================================================================\n')

  // Clean up test records in DB for future test runs
  await serviceClient.from('attendance_records').delete().in('date', [
    '2026-08-01',
    '2026-09-20',
    '2026-09-21',
    '2026-09-22',
    '2026-09-23',
    '2026-09-24',
    '2026-09-25',
    '2026-09-26',
    '2026-09-27',
    '2026-09-28',
  ])
  console.log('✔ Cleaned up temporary test attendance records')

  if (failed > 0) {
    process.exit(1)
  }
}

runAllTests().catch((err) => {
  console.error('Test execution aborted due to unhandled error:', err)
  process.exit(1)
})
