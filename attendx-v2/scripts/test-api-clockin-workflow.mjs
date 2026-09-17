import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const serviceClient = createClient(supabaseUrl, serviceRoleKey);
const authClient = createClient(supabaseUrl, anonKey);

async function runHttpTests() {
  console.log('=== HTTP API ATTENDANCE CLOCK-IN/OUT VERIFICATION ===\n');

  // Sign in as Bob Admin
  const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
    email: 'admin@acme-tech.com',
    password: 'Password123!',
  });

  if (authError || !authData.session) {
    throw new Error('Failed to sign in as Bob Admin: ' + authError?.message);
  }

  const token = authData.session.access_token;
  const user = authData.user;
  console.log('✔ Authenticated as:', user.email, `(${user.id})`);

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  const baseUrl = 'http://localhost:3002';

  // Step 1: Query current attendance
  console.log('\n--- STEP 1: GET /api/attendance/checkin ---');
  const getRes1 = await fetch(`${baseUrl}/api/attendance/checkin`, { headers });
  const getJson1 = await getRes1.json();
  console.log('✔ Initial GET response:', {
    todayDate: getJson1.todayDate,
    hasTodayRecord: !!getJson1.today,
    clockInAt: getJson1.today?.clock_in_at,
    clockOutAt: getJson1.today?.clock_out_at,
  });

  const todayDate = getJson1.todayDate;

  // Step 2: Clock In
  console.log('\n--- STEP 2: POST /api/attendance/checkin (type: clock_in) ---');
  const now1 = new Date().toISOString();
  const clockInRes = await fetch(`${baseUrl}/api/attendance/checkin`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      type: 'clock_in',
      payload: {
        date: todayDate,
        clock_in_at: now1,
        status: 'PRESENT',
        method: 'SELFIE_GPS',
        clock_in_selfie_url: 'https://example.com/test-in.jpg',
      },
    }),
  });

  if (!clockInRes.ok) {
    throw new Error(`Clock in failed: ${clockInRes.status} ${await clockInRes.text()}`);
  }

  const clockInJson = await clockInRes.json();
  console.log('✔ Clock-In API Response Record:');
  console.log('  id:', clockInJson.record.id);
  console.log('  clock_in_at:', clockInJson.record.clock_in_at);
  console.log('  clock_out_at:', clockInJson.record.clock_out_at, '(MUST BE NULL)');
  console.log('  work_minutes:', clockInJson.record.work_minutes, '(MUST BE NULL)');

  if (clockInJson.record.clock_out_at !== null) {
    throw new Error('FAIL: clock_out_at is not null after clock-in!');
  }

  // Step 3: GET /api/attendance/checkin after clock-in
  console.log('\n--- STEP 3: Verify GET after clock-in ---');
  const getRes2 = await fetch(`${baseUrl}/api/attendance/checkin`, { headers });
  const getJson2 = await getRes2.json();
  console.log('✔ Verified active shift:');
  console.log('  clock_in_at:', getJson2.today?.clock_in_at);
  console.log('  clock_out_at:', getJson2.today?.clock_out_at, '(MUST BE NULL)');
  if (getJson2.today?.clock_out_at !== null) {
    throw new Error('FAIL: GET /api/attendance/checkin shows clock_out_at is not null!');
  }

  // Step 4: Clock Out
  console.log('\n--- STEP 4: POST /api/attendance/checkin (type: clock_out) ---');
  const now2 = new Date().toISOString();
  const clockOutRes = await fetch(`${baseUrl}/api/attendance/checkin`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      type: 'clock_out',
      recordId: clockInJson.record.id,
      payload: {
        clock_out_at: now2,
        clock_out_selfie_url: 'https://example.com/test-out.jpg',
      },
    }),
  });

  if (!clockOutRes.ok) {
    throw new Error(`Clock out failed: ${clockOutRes.status} ${await clockOutRes.text()}`);
  }

  const clockOutJson = await clockOutRes.json();
  console.log('✔ Clock-Out API Response Record:');
  console.log('  clock_in_at:', clockOutJson.record.clock_in_at);
  console.log('  clock_out_at:', clockOutJson.record.clock_out_at);
  console.log('  work_minutes:', clockOutJson.record.work_minutes);
  console.log('  status:', clockOutJson.record.status);

  if (!clockOutJson.record.clock_out_at) {
    throw new Error('FAIL: clock_out_at should be populated after clock-out!');
  }

  // Step 5: CRITICAL RETEST: Clock in again on the same day!
  console.log('\n--- STEP 5: CRITICAL RETEST: Clock-In again on same date ---');
  const now3 = new Date().toISOString();
  const reClockInRes = await fetch(`${baseUrl}/api/attendance/checkin`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      type: 'clock_in',
      payload: {
        date: todayDate,
        clock_in_at: now3,
        status: 'PRESENT',
        method: 'SELFIE_GPS',
        clock_in_selfie_url: 'https://example.com/test-in-2.jpg',
      },
    }),
  });

  if (!reClockInRes.ok) {
    throw new Error(`Re-clock in failed: ${reClockInRes.status} ${await reClockInRes.text()}`);
  }

  const reClockInJson = await reClockInRes.json();
  console.log('✔ Re-Clock-In API Response Record:');
  console.log('  clock_in_at:', reClockInJson.record.clock_in_at);
  console.log('  clock_out_at:', reClockInJson.record.clock_out_at, '(MUST BE NULL - PREVIOUS CLOCK OUT CLEARED!)');
  console.log('  work_minutes:', reClockInJson.record.work_minutes, '(MUST BE NULL)');

  if (reClockInJson.record.clock_out_at !== null) {
    throw new Error('FAIL: clock_out_at was NOT cleared! Bug still exists!');
  }

  // Step 6: Verify GET /api/attendance/checkin reflects active shift
  console.log('\n--- STEP 6: Final GET Verification ---');
  const getRes3 = await fetch(`${baseUrl}/api/attendance/checkin`, { headers });
  const getJson3 = await getRes3.json();
  console.log('✔ Final GET result:');
  console.log('  isClockedIn:', !!getJson3.today?.clock_in_at && !getJson3.today?.clock_out_at);
  console.log('  clock_in_at:', getJson3.today?.clock_in_at);
  console.log('  clock_out_at:', getJson3.today?.clock_out_at);

  if (getJson3.today?.clock_out_at !== null) {
    throw new Error('FAIL: User is still marked clocked out!');
  }

  // Step 7: Verify Manager Team Endpoint reflects Bob as Present
  console.log('\n--- STEP 7: Verify Manager Team Endpoint ---');
  const teamRes = await fetch(`${baseUrl}/api/manager/team?scope=all`, { headers });
  const teamJson = await teamRes.json();
  console.log('✔ Manager Team Endpoint metrics:');
  console.log('  myAttendance:', teamJson.myAttendance);
  console.log('  presentToday:', teamJson.metrics?.presentToday);

  if (!teamJson.myAttendance?.isClockedIn) {
    throw new Error('FAIL: Bob is not marked as isClockedIn on manager team endpoint!');
  }

  console.log('\n🎉 ALL 7 END-TO-END HTTP API TESTS PASSED WITH FLYING COLORS!');
}

runHttpTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
