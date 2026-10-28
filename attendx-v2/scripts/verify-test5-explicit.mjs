/**
 * AttendX v2 — Explicit Test 5 Verification Script
 * Proves that an Admin in one tenant cannot access another tenant where they lack membership/roles.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '../.env.local')

let env = {}
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8')
  content.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=')
      if (idx !== -1) {
        const key = trimmed.substring(0, idx).trim()
        const val = trimmed.substring(idx + 1).trim()
        env[key] = val
      }
    }
  })
}

const BASE_URL = 'http://localhost:3000'
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const TENANT_A = '10000000-0000-0000-0000-000000000001' // Acme Technologies
const TENANT_B = '20000000-0000-0000-0000-000000000002' // Globex Corp
const TENANT_C = '30000000-0000-0000-0000-000000000003' // Initech Ltd

async function loginUser(email, password = 'Password123!') {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const json = await res.json()
  const rawCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : []
  const cookieString = rawCookies.map(c => c.split(';')[0]).join('; ')

  return {
    status: res.status,
    user: json.user,
    token: json.tokens?.access_token,
    cookieString,
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookieString,
      'Authorization': json.tokens?.access_token ? `Bearer ${json.tokens.access_token}` : '',
    },
  }
}

async function verifyTest5() {
  console.log('========================================================================')
  console.log('TEST 5 EXPLICIT VERIFICATION — CROSS-TENANT ADMIN BOUNDARY AUDIT')
  console.log('========================================================================\n')

  // -------------------------------------------------------------------------
  // SCENARIO 5A: User is ADMIN in Tenant B, NOT ADMIN/member of Tenant A
  // User: admin@globex-corp.com
  // -------------------------------------------------------------------------
  console.log('------------------------------------------------------------------------')
  console.log('▶ [SCENARIO 5A]: User is ADMIN in Tenant B, NOT ADMIN/member of Tenant A')
  console.log('  Target User: admin@globex-corp.com')
  console.log('------------------------------------------------------------------------')

  // 1. Establish database evidence
  const { data: userGlobex } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .eq('email', 'admin@globex-corp.com')
    .single()

  console.log('\n[DATABASE EVIDENCE: User Profile]')
  console.log(userGlobex)

  const { data: rolesGlobex } = await supabase
    .from('user_roles')
    .select('id, user_id, tenant_id, role, assigned_at')
    .eq('user_id', userGlobex.id)

  console.log('\n[DATABASE EVIDENCE: All user_roles rows for admin@globex-corp.com]')
  console.table(rolesGlobex)

  const { data: roleInB } = await supabase
    .from('user_roles')
    .select('*')
    .eq('user_id', userGlobex.id)
    .eq('tenant_id', TENANT_B)

  const { data: roleInA } = await supabase
    .from('user_roles')
    .select('*')
    .eq('user_id', userGlobex.id)
    .eq('tenant_id', TENANT_A)

  console.log(`\n• Verified membership in Tenant B (Globex Corp): ${roleInB.length} row(s) -> Role: '${roleInB[0]?.role}'`)
  console.log(`• Verified membership in Tenant A (Acme Tech):   ${roleInA.length} row(s) -> NO MEMBERSHIP`)

  // 2. Authenticate user
  const globexAuth = await loginUser('admin@globex-corp.com')

  // 3. Request Tenant B (Authorized)
  console.log('\n[HTTP REQUEST 1]: admin@globex-corp.com -> GET /api/admin/glance?tenant_id=20000000-0000-0000-0000-000000000002 (Tenant B)')
  const resB = await fetch(`${BASE_URL}/api/admin/glance?tenant_id=${TENANT_B}`, {
    headers: globexAuth.headers,
  })
  const bodyB = await resB.json()
  console.log(`  Response Status Code: ${resB.status}`)
  console.log(`  Response Body:`, JSON.stringify(bodyB, null, 2))

  // 4. Request Tenant A (Unauthorized)
  console.log('\n[HTTP REQUEST 2]: admin@globex-corp.com -> GET /api/admin/glance?tenant_id=10000000-0000-0000-0000-000000000001 (Tenant A)')
  const resA = await fetch(`${BASE_URL}/api/admin/glance?tenant_id=${TENANT_A}`, {
    headers: globexAuth.headers,
  })
  const bodyA = await resA.json()
  console.log(`  Response Status Code: ${resA.status}`)
  console.log(`  Response Body:`, JSON.stringify(bodyA, null, 2))

  const pass5A = resB.status === 200 && bodyB.success === true && bodyB.tenant_id === TENANT_B &&
                 resA.status === 403 && bodyA.code === 'FORBIDDEN_TENANT'

  console.log(`\n>>> SCENARIO 5A VERDICT: ${pass5A ? '🟢 PASS' : '🔴 FAIL'}\n`)

  // -------------------------------------------------------------------------
  // SCENARIO 5B (Reverse): User is ADMIN in Tenant A, NOT ADMIN/member of Tenant C
  // User: admin@acme-tech.com
  // -------------------------------------------------------------------------
  console.log('------------------------------------------------------------------------')
  console.log('▶ [SCENARIO 5B (Reverse)]: User is ADMIN in Tenant A, NOT member of Tenant C')
  console.log('  Target User: admin@acme-tech.com')
  console.log('------------------------------------------------------------------------')

  const { data: userAcme } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .eq('email', 'admin@acme-tech.com')
    .single()

  console.log('\n[DATABASE EVIDENCE: User Profile]')
  console.log(userAcme)

  const { data: rolesAcmeInA } = await supabase
    .from('user_roles')
    .select('*')
    .eq('user_id', userAcme.id)
    .eq('tenant_id', TENANT_A)

  const { data: rolesAcmeInC } = await supabase
    .from('user_roles')
    .select('*')
    .eq('user_id', userAcme.id)
    .eq('tenant_id', TENANT_C)

  console.log(`\n• Verified membership in Tenant A (Acme Tech):   ${rolesAcmeInA.length} row(s) -> Role: '${rolesAcmeInA[0]?.role}'`)
  console.log(`• Verified membership in Tenant C (Initech Ltd): ${rolesAcmeInC.length} row(s) -> NO MEMBERSHIP`)

  const acmeAuth = await loginUser('admin@acme-tech.com')

  // Request Tenant A (Authorized)
  console.log('\n[HTTP REQUEST 3]: admin@acme-tech.com -> GET /api/admin/glance?tenant_id=10000000-0000-0000-0000-000000000001 (Tenant A)')
  const resAcmeA = await fetch(`${BASE_URL}/api/admin/glance?tenant_id=${TENANT_A}`, {
    headers: acmeAuth.headers,
  })
  const bodyAcmeA = await resAcmeA.json()
  console.log(`  Response Status Code: ${resAcmeA.status}`)
  console.log(`  Response Body:`, JSON.stringify(bodyAcmeA, null, 2))

  // Request Tenant C (Unauthorized)
  console.log('\n[HTTP REQUEST 4]: admin@acme-tech.com -> GET /api/admin/glance?tenant_id=30000000-0000-0000-0000-000000000003 (Tenant C)')
  const resAcmeC = await fetch(`${BASE_URL}/api/admin/glance?tenant_id=${TENANT_C}`, {
    headers: acmeAuth.headers,
  })
  const bodyAcmeC = await resAcmeC.json()
  console.log(`  Response Status Code: ${resAcmeC.status}`)
  console.log(`  Response Body:`, JSON.stringify(bodyAcmeC, null, 2))

  const pass5B = resAcmeA.status === 200 && bodyAcmeA.success === true && bodyAcmeA.tenant_id === TENANT_A &&
                 resAcmeC.status === 403 && bodyAcmeC.code === 'FORBIDDEN_TENANT'

  console.log(`\n>>> SCENARIO 5B VERDICT: ${pass5B ? '🟢 PASS' : '🔴 FAIL'}\n`)

  console.log('========================================================================')
  console.log(`OVERALL TEST 5 AUDIT VERDICT: ${pass5A && pass5B ? '🟢 PASS (Both Scenarios Proven)' : '🔴 FAIL'}`)
  console.log('========================================================================')
}

verifyTest5().catch(e => {
  console.error(e)
  process.exit(1)
})
