import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const serviceClient = createClient(supabaseUrl, serviceRoleKey);

async function runTests() {
  console.log('=== ATTENDANCE CLOCK-IN/CLOCK-OUT WORKFLOW VERIFICATION ===\n');

  const testTenantId = '10000000-0000-0000-0000-000000000001';
  // Bob Admin
  const testUserId = '7aec3932-b823-4dfd-9d5b-693a437482eb';
  const testDate = '2099-12-31'; // Future date to avoid collision with real punches

  try {
    // Clean any pre-existing test record
    await serviceClient
      .from('attendance_records')
      .delete()
      .eq('tenant_id', testTenantId)
      .eq('employee_id', testUserId)
      .eq('date', testDate);

    // TEST 1: Initial Clock-In
    console.log('--- TEST 1: Initial Clock-In ---');
    const clockInPayload = {
      tenant_id: testTenantId,
      employee_id: testUserId,
      date: testDate,
      clock_in_at: new Date('2099-12-31T09:00:00.000Z').toISOString(),
      clock_out_at: null,
      work_minutes: null,
      clock_out_selfie_url: null,
      clock_out_lat: null,
      clock_out_lng: null,
      status: 'PRESENT',
      method: 'SELFIE_GPS',
    };

    const { data: rec1, error: err1 } = await serviceClient
      .from('attendance_records')
      .upsert(clockInPayload, { onConflict: 'tenant_id,employee_id,date' })
      .select()
      .single();

    if (err1) throw err1;
    console.log('✔ Initial clock-in successful:');
    console.log('  clock_in_at:', rec1.clock_in_at);
    console.log('  clock_out_at:', rec1.clock_out_at, '(MUST BE NULL)');
    console.log('  work_minutes:', rec1.work_minutes, '(MUST BE NULL)');

    if (rec1.clock_out_at !== null) {
      throw new Error('FAIL: clock_out_at should be null after initial clock-in');
    }

    // TEST 2: Clock-Out
    console.log('\n--- TEST 2: Clock-Out ---');
    const clockOutAt = new Date('2099-12-31T17:30:00.000Z').toISOString();
    const workMinutes = Math.round(
      (new Date(clockOutAt).getTime() - new Date(rec1.clock_in_at).getTime()) / (1000 * 60)
    );

    const { data: rec2, error: err2 } = await serviceClient
      .from('attendance_records')
      .update({
        clock_out_at: clockOutAt,
        work_minutes: workMinutes,
        status: workMinutes >= 240 ? 'PRESENT' : 'HALF_DAY',
      })
      .eq('id', rec1.id)
      .select()
      .single();

    if (err2) throw err2;
    console.log('✔ Clock-out successful:');
    console.log('  clock_in_at:', rec2.clock_in_at);
    console.log('  clock_out_at:', rec2.clock_out_at);
    console.log('  work_minutes:', rec2.work_minutes);
    console.log('  status:', rec2.status);

    if (rec2.clock_out_at === null || rec2.work_minutes !== 510) {
      throw new Error('FAIL: clock_out_at or work_minutes incorrect after clock-out');
    }

    // TEST 3: Re-Clock-In On Same Day (Exact Bug Scenario)
    console.log('\n--- TEST 3: Re-Clock-In On Same Day (Clearing Prior Clock-Out) ---');
    const reClockInTime = new Date('2099-12-31T18:00:00.000Z').toISOString();
    const reClockInPayload = {
      tenant_id: testTenantId,
      employee_id: testUserId,
      date: testDate,
      clock_in_at: reClockInTime,
      clock_out_at: null,
      work_minutes: null,
      clock_out_selfie_url: null,
      clock_out_lat: null,
      clock_out_lng: null,
      status: 'PRESENT',
      method: 'SELFIE_GPS',
    };

    const { data: rec3, error: err3 } = await serviceClient
      .from('attendance_records')
      .upsert(reClockInPayload, { onConflict: 'tenant_id,employee_id,date' })
      .select()
      .single();

    if (err3) throw err3;
    console.log('✔ Re-clock-in successful:');
    console.log('  clock_in_at:', rec3.clock_in_at);
    console.log('  clock_out_at:', rec3.clock_out_at, '(MUST BE NULL - NOT RETAINED FROM EARLIER CLOCK-OUT!)');
    console.log('  work_minutes:', rec3.work_minutes, '(MUST BE NULL)');

    if (rec3.clock_out_at !== null) {
      throw new Error('FAIL: clock_out_at was NOT cleared after re-clock-in! Bug reproduced!');
    }
    if (rec3.work_minutes !== null) {
      throw new Error('FAIL: work_minutes was NOT cleared after re-clock-in!');
    }

    console.log('\n🎉 ALL WORKFLOW DATABASE TESTS PASSED CLEANLY!');

  } finally {
    // Cleanup
    await serviceClient
      .from('attendance_records')
      .delete()
      .eq('tenant_id', testTenantId)
      .eq('employee_id', testUserId)
      .eq('date', testDate);
    console.log('\n✔ Test records cleaned up.');
  }
}

runTests().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
