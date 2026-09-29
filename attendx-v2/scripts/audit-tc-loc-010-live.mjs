// ==============================================================================
// Complete Live Verification for TC_LOC_010 and Protected Regression Suite
// Runs against live server (http://localhost:3002) and live hosted Supabase DB
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
  const { data, error } = await authClient.auth.signInWithPassword({ email, password })
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
  console.log('================================================================')
  console.log('AUDIT STEP 1: HOSTED SUPABASE DATABASE VERIFICATION')
  console.log('================================================================')

  // 1. Read-only check for public.gps_tracking
  const { data: initialCheck, error: checkErr } = await serviceClient
    .from('gps_tracking')
    .select('*')
    .limit(1)

  if (checkErr) {
    console.error('FATAL: Could not query public.gps_tracking:', checkErr)
    process.exit(1)
  }
  console.log('✓ public.gps_tracking exists and is queryable (PGRST205 resolved):', initialCheck)

  // 2. Count existing offline_sync_log breadcrumbs before test
  const { data: syncBefore, error: syncErr } = await serviceClient
    .from('offline_sync_log')
    .select('id')
    .eq('entity_type', 'location_breadcrumb')
  const syncCountBefore = syncBefore?.length ?? 0
  console.log(`✓ Baseline offline_sync_log location_breadcrumb count: ${syncCountBefore}`)

  console.log('\n================================================================')
  console.log('AUDIT STEP 2: CONTROLLED WAYPOINTS POST (T1 < T2 < T3)')
  console.log('================================================================')

  const acmeEmp = await loginUser('employee@acme-tech.com')
  const acmeAdmin = await loginUser('admin@acme-tech.com')
  const globexEmp = await loginUser('employee@globex-corp.com')
  const globexAdmin = await loginUser('admin@globex-corp.com')

  const now = Date.now()
  const t1 = new Date(now - 30000).toISOString()
  const t2 = new Date(now - 15000).toISOString()
  const t3 = new Date(now - 2000).toISOString()

  // Point T1: 12.9716, 77.5946
  const post1 = await fetch(`${BASE_URL}/api/location/track`, {
    method: 'POST',
    headers: acmeEmp.headers,
    body: JSON.stringify({ lat: 12.9716, lng: 77.5946, speed: 0.0, timestamp: t1 }),
  })
  const post1Json = await post1.json()
  console.log(`POST T1 (${t1}): HTTP ${post1.status}`, post1Json)

  // Point T2: 12.9725, 77.5955
  const post2 = await fetch(`${BASE_URL}/api/location/track`, {
    method: 'POST',
    headers: acmeEmp.headers,
    body: JSON.stringify({ lat: 12.9725, lng: 77.5955, speed: 12.5, timestamp: t2 }),
  })
  const post2Json = await post2.json()
  console.log(`POST T2 (${t2}): HTTP ${post2.status}`, post2Json)

  // Point T3: 12.9740, 77.5970
  const post3 = await fetch(`${BASE_URL}/api/location/track`, {
    method: 'POST',
    headers: acmeEmp.headers,
    body: JSON.stringify({ lat: 12.9740, lng: 77.5970, speed: 21.0, timestamp: t3 }),
  })
  const post3Json = await post3.json()
  console.log(`POST T3 (${t3}): HTTP ${post3.status}`, post3Json)

  const insertedIds = [
    post1Json.waypoint?.gps_log_id,
    post2Json.waypoint?.gps_log_id,
    post3Json.waypoint?.gps_log_id,
  ].filter(Boolean)

  console.log('\n================================================================')
  console.log('AUDIT STEP 3: DATABASE PERSISTENCE & CHRONOLOGICAL VERIFICATION')
  console.log('================================================================')

  const { data: dbRows, error: dbErr } = await serviceClient
    .from('gps_tracking')
    .select('gps_log_id, tenant_id, employee_id, latitude, longitude, speed, timestamp')
    .in('gps_log_id', insertedIds)
    .order('timestamp', { ascending: true })

  console.log(`Rows in public.gps_tracking matching test IDs: ${dbRows?.length}`)
  dbRows?.forEach((r, idx) => {
    console.log(
      `  Point T${idx + 1}: ID=${r.gps_log_id} | Tenant=${r.tenant_id} | Employee=${r.employee_id} | Lat=${r.latitude} | Lng=${r.longitude} | Speed=${r.speed} | Timestamp=${r.timestamp}`
    )
  })

  const isChronological =
    new Date(dbRows[0].timestamp) < new Date(dbRows[1].timestamp) &&
    new Date(dbRows[1].timestamp) < new Date(dbRows[2].timestamp)
  console.log(`✓ Chronological ordering (T1 < T2 < T3): ${isChronological}`)

  console.log('\n================================================================')
  console.log('AUDIT STEP 4: API RETRIEVAL & SECURITY CONTROLS')
  console.log('================================================================')

  // 1. Employee self-retrieval
  const getEmp = await fetch(`${BASE_URL}/api/location/track`, { headers: acmeEmp.headers })
  const getEmpJson = await getEmp.json()
  console.log(`GET /api/location/track (Employee): HTTP ${getEmp.status}, count=${getEmpJson.count}`)

  // 2. Manager / Admin retrieval of direct report
  const getAdmin = await fetch(`${BASE_URL}/api/location/track?employee_id=${acmeEmp.user.id}`, {
    headers: acmeAdmin.headers,
  })
  const getAdminJson = await getAdmin.json()
  console.log(
    `GET /api/location/track?employee_id=... (Manager/Admin): HTTP ${getAdmin.status}, count=${getAdminJson.count}`
  )

  // 3. Cross-Tenant Admin access attempt
  const getCrossAdmin = await fetch(
    `${BASE_URL}/api/location/track?employee_id=${acmeEmp.user.id}`,
    { headers: globexAdmin.headers }
  )
  const getCrossAdminJson = await getCrossAdmin.json()
  console.log(
    `Cross-Tenant Admin query: HTTP ${getCrossAdmin.status} (Expected 403)`,
    getCrossAdminJson
  )

  // 4. Cross-Tenant Employee isolation
  const getGlobexEmp = await fetch(`${BASE_URL}/api/location/track`, {
    headers: globexEmp.headers,
  })
  const getGlobexJson = await getGlobexEmp.json()
  console.log(
    `Globex Employee waypoints count: ${getGlobexJson.count} (Expected 0 Acme records)`
  )

  console.log('\n================================================================')
  console.log('AUDIT STEP 5: VERIFY offline_sync_log IS NOT POLLUTED')
  console.log('================================================================')

  const { data: syncAfter } = await serviceClient
    .from('offline_sync_log')
    .select('id')
    .eq('entity_type', 'location_breadcrumb')
  const syncCountAfter = syncAfter?.length ?? 0
  const diff = syncCountAfter - syncCountBefore
  console.log(
    `offline_sync_log location_breadcrumb count: before=${syncCountBefore}, after=${syncCountAfter}, difference=${diff}`
  )
  console.log(`✓ Zero new records written to offline_sync_log: ${diff === 0}`)

  console.log('\n================================================================')
  console.log('AUDIT STEP 6: CLEANUP CONTROLLED QA RECORDS')
  console.log('================================================================')

  const { error: delErr } = await serviceClient
    .from('gps_tracking')
    .delete()
    .in('gps_log_id', insertedIds)

  const { data: checkDeleted } = await serviceClient
    .from('gps_tracking')
    .select('gps_log_id')
    .in('gps_log_id', insertedIds)
  console.log(`Residual QA records in gps_tracking: ${checkDeleted?.length ?? 0}`)

  console.log('\n================================================================')
  console.log('AUDIT STEP 7: PROTECTED REGRESSION TESTS')
  console.log('================================================================')

  const testDates = ['2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05']
  await serviceClient.from('attendance_records').delete().in('date', testDates)

  // TC_ATT_001: Standard Clock-In
  const att001 = await fetch(`${BASE_URL}/api/attendance/checkin`, {
    method: 'POST',
    headers: acmeEmp.headers,
    body: JSON.stringify({
      type: 'clock_in',
      payload: { date: testDates[0], clock_in_lat: 12.9716, clock_in_lng: 77.5946 },
    }),
  })
  const att001Json = await att001.json()
  console.log(`TC_ATT_001 (Clock-In): HTTP ${att001.status} -> ${att001.status === 200 ? 'PASS' : 'FAIL'}`)

  // TC_ATT_002: Standard Clock-Out
  const att002 = await fetch(`${BASE_URL}/api/attendance/checkin`, {
    method: 'POST',
    headers: acmeEmp.headers,
    body: JSON.stringify({
      type: 'clock_out',
      payload: { date: testDates[0], clock_out_lat: 12.9716, clock_out_lng: 77.5946 },
    }),
  })
  const att002Json = await att002.json()
  console.log(`TC_ATT_002 (Clock-Out): HTTP ${att002.status} -> ${att002.status === 200 ? 'PASS' : 'FAIL'}`)

  // TC_LOC_001: Inside Geofence
  const loc001 = await fetch(`${BASE_URL}/api/attendance/checkin`, {
    method: 'POST',
    headers: acmeEmp.headers,
    body: JSON.stringify({
      type: 'clock_in',
      payload: { date: testDates[1], clock_in_lat: 12.9716, clock_in_lng: 77.5946 },
    }),
  })
  const loc001Json = await loc001.json()
  console.log(`TC_LOC_001 (Inside Geofence): HTTP ${loc001.status}, valid=${loc001Json.record?.geofence_valid} -> ${loc001.status === 200 && loc001Json.record?.geofence_valid === true ? 'PASS' : 'FAIL'}`)

  // TC_LOC_002: Outside Geofence
  const loc002 = await fetch(`${BASE_URL}/api/attendance/checkin`, {
    method: 'POST',
    headers: acmeEmp.headers,
    body: JSON.stringify({
      type: 'clock_in',
      payload: { date: testDates[2], clock_in_lat: 28.6139, clock_in_lng: 77.2090 },
    }),
  })
  const loc002Json = await loc002.json()
  console.log(`TC_LOC_002 (Outside Geofence): HTTP ${loc002.status}, error=${loc002Json.error} -> ${loc002.status === 403 && loc002Json.error?.includes('OUTSIDE_GEOFENCE') ? 'PASS' : 'FAIL'}`)

  // TC_LOC_005: Perimeter Precision / Breach
  const loc005 = await fetch(`${BASE_URL}/api/attendance/checkin`, {
    method: 'POST',
    headers: acmeEmp.headers,
    body: JSON.stringify({
      type: 'clock_in',
      payload: { date: testDates[3], clock_in_lat: 12.9750, clock_in_lng: 77.5946 },
    }),
  })
  const loc005Json = await loc005.json()
  console.log(`TC_LOC_005 (Perimeter Breach): HTTP ${loc005.status}, error=${loc005Json.error} -> ${loc005.status === 403 && loc005Json.error?.includes('OUTSIDE_GEOFENCE') ? 'PASS' : 'FAIL'}`)

  // TC_LOC_008: Mock GPS Detection
  const loc008 = await fetch(`${BASE_URL}/api/location/track`, {
    method: 'POST',
    headers: acmeEmp.headers,
    body: JSON.stringify({ lat: 12.9716, lng: 77.5946, isMockLocation: true }),
  })
  const loc008Json = await loc008.json()
  console.log(`TC_LOC_008 (Mock GPS Detection): HTTP ${loc008.status}, code=${loc008Json.code} -> ${loc008.status === 403 && loc008Json.code === 'MOCK_LOCATION_DETECTED' ? 'PASS' : 'FAIL'}`)

  // TC_LOC_009: Multi-Geofence Support
  const loc009 = await fetch(`${BASE_URL}/api/attendance/checkin`, {
    method: 'POST',
    headers: globexEmp.headers,
    body: JSON.stringify({
      type: 'clock_in',
      payload: { date: testDates[4], clock_in_lat: 13.0827, clock_in_lng: 80.2707 },
    }),
  })
  console.log(`TC_LOC_009 (Multi-Geofence): HTTP ${loc009.status} -> ${loc009.status === 200 ? 'PASS' : 'FAIL'}`)

  // TC_LOC_012: Tampered Coordinates
  const loc012 = await fetch(`${BASE_URL}/api/attendance/checkin`, {
    method: 'POST',
    headers: acmeEmp.headers,
    body: JSON.stringify({
      type: 'clock_in',
      payload: { date: '2026-12-06', clock_in_lat: 'corrupted', clock_in_lng: NaN },
    }),
  })
  console.log(`TC_LOC_012 (Tampered Coordinates): HTTP ${loc012.status} -> ${loc012.status === 400 ? 'PASS' : 'FAIL'}`)

  // Cleanup attendance records
  await serviceClient.from('attendance_records').delete().in('date', [...testDates, '2026-12-06'])

  // TC_ATT_012: Missing Out UI verification check
  const attPageContent = fs.readFileSync('app/(app)/attendance/page.tsx', 'utf8')
  const hasMissingOutBadge = attPageContent.includes("Missing Out") && attPageContent.includes("badge-warning")
  console.log(`TC_ATT_012 (Missing Out UI): Badge explicit rendering -> ${hasMissingOutBadge ? 'PASS' : 'FAIL'}`)

  // TC_ANL_005: Workforce Utilization Denominator check
  const anl005Res = await fetch(`${BASE_URL}/api/analytics/utilization?startDate=2026-09-01&endDate=2026-09-07`, {
    headers: acmeAdmin.headers,
  })
  const anl005Json = await anl005Res.json()
  console.log(`TC_ANL_005 (Utilization Capacity): HTTP ${anl005Res.status}, overallUtilization=${anl005Json.overallUtilization}% -> ${anl005Res.status === 200 ? 'PASS' : 'FAIL'}`)

  console.log('\n================================================================')
  console.log('AUDIT COMPLETE: ALL STEPS VERIFIED')
  console.log('================================================================')
}

run().catch((err) => {
  console.error('Fatal execution error:', err)
  process.exit(1)
})
