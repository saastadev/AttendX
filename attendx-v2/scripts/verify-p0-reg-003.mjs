// ==============================================================================
// AttendX v2 — P0_REG_003: Controlled Verification Test Matrix
// Tests A through G against live server and live database
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

const BASE_URL = 'http://localhost:3002'
const serviceClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const authClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

async function loginUser(email, password = 'Password123!') {
  const { data, error } = await authClient.auth.signInWithPassword({ email, password })
  if (error || !data.session) {
    throw new Error(`Login failed for ${email}: ${error?.message}`)
  }
  return {
    user: data.user,
    token: data.session.access_token,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session.access_token}`,
    },
  }
}

async function getProfileState(userId) {
  const { data, error } = await serviceClient
    .from('profiles')
    .select('id, full_name, email, tenant_id, is_active')
    .eq('id', userId)
    .single()
  if (error) throw new Error(`Failed to fetch profile ${userId}: ${error.message}`)
  return data
}

const testResults = []

function recordTest(testId, name, passed, details) {
  testResults.push({ testId, name, passed, details })
  const icon = passed ? '✅ PASS' : '❌ FAIL'
  console.log(`\n[${icon}] ${testId}: ${name}`)
  console.log('Details:', JSON.stringify(details, null, 2))
}

async function run() {
  console.log('==============================================================================')
  console.log('ATTENDX VERIFICATION: P0_REG_003 CONTROLLED TEST MATRIX')
  console.log('Target Server:', BASE_URL)
  console.log('Supabase DB:  ', env.NEXT_PUBLIC_SUPABASE_URL)
  console.log('==============================================================================')

  // Logins
  console.log('\nLogging in test personas...')
  const acmeAdmin = await loginUser('admin@acme-tech.com')
  const acmeEmp = await loginUser('employee@acme-tech.com')
  const globexAdmin = await loginUser('admin@globex-corp.com')
  const globexEmp = await loginUser('employee@globex-corp.com')

  // Target User in Tenant A (Eve Employee)
  const targetUserA = '02e197e8-f0f3-4d98-9745-4d750c783f47'
  // Target User in Tenant B (Globex Employee)
  const targetUserB = globexEmp.user.id

  // --------------------------------------------------------------------------
  // TEST A: Authorized Tenant Admin deactivates Tenant User
  // --------------------------------------------------------------------------
  {
    console.log('\n--- Running Test A: Authorized Tenant Admin deactivates Tenant User ---')
    // Ensure initial state is active
    await serviceClient.from('profiles').update({ is_active: true }).eq('id', targetUserA)
    const beforeState = await getProfileState(targetUserA)

    const res = await fetch(`${BASE_URL}/api/admin/users/${targetUserA}/deactivate`, {
      method: 'POST',
      headers: acmeAdmin.headers,
      body: JSON.stringify({ reason: 'Controlled Audit Test A' }),
    })

    const body = await res.json().catch(() => ({}))
    const afterState = await getProfileState(targetUserA)

    const passed = res.status === 200 && afterState.is_active === false && beforeState.is_active === true
    recordTest('Test A', 'Authorized Tenant Admin deactivates Tenant User', passed, {
      httpStatus: res.status,
      responseBody: body,
      dbIsActiveBefore: beforeState.is_active,
      dbIsActiveAfter: afterState.is_active,
    })
  }

  // --------------------------------------------------------------------------
  // TEST B: Authorized Tenant Admin reactivates Tenant User
  // --------------------------------------------------------------------------
  {
    console.log('\n--- Running Test B: Authorized Tenant Admin reactivates Tenant User ---')
    const beforeState = await getProfileState(targetUserA)

    const res = await fetch(`${BASE_URL}/api/admin/users/${targetUserA}/reactivate`, {
      method: 'POST',
      headers: acmeAdmin.headers,
    })

    const body = await res.json().catch(() => ({}))
    const afterState = await getProfileState(targetUserA)

    const passed = res.status === 200 && afterState.is_active === true && beforeState.is_active === false
    recordTest('Test B', 'Authorized Tenant Admin reactivates Tenant User', passed, {
      httpStatus: res.status,
      responseBody: body,
      dbIsActiveBefore: beforeState.is_active,
      dbIsActiveAfter: afterState.is_active,
    })
  }

  // --------------------------------------------------------------------------
  // TEST C: Regular Employee attempts deactivation
  // --------------------------------------------------------------------------
  {
    console.log('\n--- Running Test C: Regular Employee attempts deactivation ---')
    const beforeState = await getProfileState(targetUserA)

    const res = await fetch(`${BASE_URL}/api/admin/users/${targetUserA}/deactivate`, {
      method: 'POST',
      headers: acmeEmp.headers,
      body: JSON.stringify({ reason: 'Unauthorized Employee Attempt' }),
    })

    const body = await res.json().catch(() => ({}))
    const afterState = await getProfileState(targetUserA)

    const passed = res.status === 403 && afterState.is_active === beforeState.is_active
    recordTest('Test C', 'Regular Employee attempts deactivation', passed, {
      httpStatus: res.status,
      responseBody: body,
      dbIsActiveBefore: beforeState.is_active,
      dbIsActiveAfter: afterState.is_active,
      expected: 'HTTP 403 and db unchanged',
    })
  }

  // --------------------------------------------------------------------------
  // TEST D: Admin from Tenant A attempts to deactivate user in Tenant B
  // --------------------------------------------------------------------------
  {
    console.log('\n--- Running Test D: Admin from Tenant A attempts to deactivate user in Tenant B ---')
    const beforeState = await getProfileState(targetUserB)

    const res = await fetch(`${BASE_URL}/api/admin/users/${targetUserB}/deactivate`, {
      method: 'POST',
      headers: acmeAdmin.headers, // Acme Admin calling on Globex user
      body: JSON.stringify({ reason: 'Cross-Tenant Deactivation Attack' }),
    })

    const body = await res.json().catch(() => ({}))
    const afterState = await getProfileState(targetUserB)

    const passed = res.status === 403 && afterState.is_active === beforeState.is_active
    recordTest('Test D', 'Admin from Tenant A attempts to deactivate user in Tenant B', passed, {
      httpStatus: res.status,
      responseBody: body,
      dbIsActiveBefore: beforeState.is_active,
      dbIsActiveAfter: afterState.is_active,
      expected: 'HTTP 403 and db unchanged',
    })
  }

  // --------------------------------------------------------------------------
  // TEST E: User with NO role attempts deactivation
  // --------------------------------------------------------------------------
  {
    console.log('\n--- Running Test E: User with NO role attempts deactivation ---')
    // Create temporary no-role user in GoTrue
    const testNoRoleEmail = `norole-${Date.now()}@example.com`
    const { data: createData, error: createErr } = await serviceClient.auth.admin.createUser({
      email: testNoRoleEmail,
      password: 'Password123!',
      email_confirm: true,
      user_metadata: { full_name: 'No Role User' },
    })

    if (createErr || !createData.user) {
      throw new Error(`Failed to create no-role test user: ${createErr?.message}`)
    }

    const noRoleUserId = createData.user.id
    // Explicitly delete any user_roles row for this user
    await serviceClient.from('user_roles').delete().eq('user_id', noRoleUserId)

    // Sign in as no-role user
    const noRoleUser = await loginUser(testNoRoleEmail)

    const beforeState = await getProfileState(targetUserA)

    const res = await fetch(`${BASE_URL}/api/admin/users/${targetUserA}/deactivate`, {
      method: 'POST',
      headers: noRoleUser.headers,
      body: JSON.stringify({ reason: 'No-Role Deactivation Attempt' }),
    })

    const body = await res.json().catch(() => ({}))
    const afterState = await getProfileState(targetUserA)

    // Clean up temporary user
    try {
      await serviceClient.auth.admin.deleteUser(noRoleUserId)
    } catch {
      // Best-effort cleanup
    }
    try {
      await serviceClient.from('profiles').delete().eq('id', noRoleUserId)
    } catch {
      // Best-effort cleanup
    }

    const passed = res.status === 403 && afterState.is_active === beforeState.is_active
    recordTest('Test E', 'User with NO role attempts deactivation', passed, {
      httpStatus: res.status,
      responseBody: body,
      dbIsActiveBefore: beforeState.is_active,
      dbIsActiveAfter: afterState.is_active,
      expected: 'HTTP 403 and db unchanged',
    })
  }

  // --------------------------------------------------------------------------
  // TEST F: Unauthenticated request attempts deactivation
  // --------------------------------------------------------------------------
  {
    console.log('\n--- Running Test F: Unauthenticated request attempts deactivation ---')
    const beforeState = await getProfileState(targetUserA)

    const res = await fetch(`${BASE_URL}/api/admin/users/${targetUserA}/deactivate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: 'Unauthenticated Deactivation Attempt' }),
    })

    const body = await res.json().catch(() => ({}))
    const afterState = await getProfileState(targetUserA)

    const passed = res.status === 401 && afterState.is_active === beforeState.is_active
    recordTest('Test F', 'Unauthenticated request attempts deactivation', passed, {
      httpStatus: res.status,
      responseBody: body,
      dbIsActiveBefore: beforeState.is_active,
      dbIsActiveAfter: afterState.is_active,
      expected: 'HTTP 401 and db unchanged',
    })
  }

  // --------------------------------------------------------------------------
  // TEST G: Reactivation authorization matrix
  // (Employee 403, Cross-Tenant Admin 403, Unauthenticated 401)
  // --------------------------------------------------------------------------
  {
    console.log('\n--- Running Test G: Reactivation authorization matrix ---')
    // G.1: Regular Employee attempts reactivation
    const beforeG1 = await getProfileState(targetUserA)
    const resG1 = await fetch(`${BASE_URL}/api/admin/users/${targetUserA}/reactivate`, {
      method: 'POST',
      headers: acmeEmp.headers,
    })
    const bodyG1 = await resG1.json().catch(() => ({}))
    const afterG1 = await getProfileState(targetUserA)
    const passG1 = resG1.status === 403 && afterG1.is_active === beforeG1.is_active

    // G.2: Cross-Tenant Admin attempts reactivation
    const beforeG2 = await getProfileState(targetUserB)
    const resG2 = await fetch(`${BASE_URL}/api/admin/users/${targetUserB}/reactivate`, {
      method: 'POST',
      headers: acmeAdmin.headers, // Acme Admin calling on Globex User
    })
    const bodyG2 = await resG2.json().catch(() => ({}))
    const afterG2 = await getProfileState(targetUserB)
    const passG2 = resG2.status === 403 && afterG2.is_active === beforeG2.is_active

    // G.3: Unauthenticated request attempts reactivation
    const beforeG3 = await getProfileState(targetUserA)
    const resG3 = await fetch(`${BASE_URL}/api/admin/users/${targetUserA}/reactivate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const bodyG3 = await resG3.json().catch(() => ({}))
    const afterG3 = await getProfileState(targetUserA)
    const passG3 = resG3.status === 401 && afterG3.is_active === beforeG3.is_active

    const passed = passG1 && passG2 && passG3
    recordTest('Test G', 'Reactivation authorization matrix (Employee 403, Cross-Tenant 403, Unauth 401)', passed, {
      subtest_G1_Employee: {
        httpStatus: resG1.status,
        responseBody: bodyG1,
        expectedStatus: 403,
        passed: passG1,
      },
      subtest_G2_CrossTenantAdmin: {
        httpStatus: resG2.status,
        responseBody: bodyG2,
        expectedStatus: 403,
        passed: passG2,
      },
      subtest_G3_Unauthenticated: {
        httpStatus: resG3.status,
        responseBody: bodyG3,
        expectedStatus: 401,
        passed: passG3,
      },
    })
  }

  // Final Summary
  console.log('\n==============================================================================')
  console.log('TEST SUMMARY FOR P0_REG_003')
  console.log('==============================================================================')
  const total = testResults.length
  const passedCount = testResults.filter((t) => t.passed).length
  console.log(`Total Tests Executed: ${total}`)
  console.log(`Passed:              ${passedCount}`)
  console.log(`Failed:              ${total - passedCount}`)

  if (passedCount === total) {
    console.log('\n🎯 ALL 7 TESTS IN MATRIX A THROUGH G PASSED WITH FULL EVIDENCE!')
  } else {
    console.error('\n❌ SOME TESTS FAILED IN THE TEST MATRIX!')
    process.exit(1)
  }
}

run().catch((err) => {
  console.error('Fatal error during test run:', err)
  process.exit(1)
})
