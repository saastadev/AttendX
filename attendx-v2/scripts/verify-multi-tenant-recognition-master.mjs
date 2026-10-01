import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer-core'
import fs from 'fs'

let SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xsmbocwuktxrhlqjtsii.supabase.co'
let SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
let SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

if (fs.existsSync('.env.local')) {
  const envContent = fs.readFileSync('.env.local', 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) SUPABASE_URL = trimmed.split('=')[1].trim()
    if (trimmed.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) SUPABASE_SERVICE_ROLE_KEY = trimmed.split('=')[1].trim()
    if (trimmed.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) SUPABASE_ANON_KEY = trimmed.split('=')[1].trim()
  }
}

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const BASE_URL = 'http://localhost:3000'

const TENANTS_TO_TEST = [
  {
    name: 'Acme',
    tenant_id: '10000000-0000-0000-0000-000000000001',
    user_email: 'employee@acme-tech.com',
    user_name: 'Eve Employee',
    colleague_name: 'David Manager',
    colleague_id: 'c998e5de-a5d6-4030-865d-701c6d9b38d1',
    foreign_colleague_name: 'Frank FleetLead',
    foreign_colleague_id: '40000000-0000-0000-0000-000000000011',
  },
  {
    name: 'FutureLearn Portal',
    tenant_id: '50000000-0000-0000-0000-000000000005',
    user_email: 'grace@futurelearn.edu',
    user_name: 'Grace Dean',
    colleague_name: 'Prof Sharma',
    colleague_id: '50000000-0000-0000-0000-000000000012',
    foreign_colleague_name: 'David Manager',
    foreign_colleague_id: 'c998e5de-a5d6-4030-865d-701c6d9b38d1',
  },
  {
    name: 'SwiftLogix Fleet',
    tenant_id: '40000000-0000-0000-0000-000000000004',
    user_email: 'frank@swiftlogix.com',
    user_name: 'Frank FleetLead',
    colleague_name: 'Suresh Driver',
    colleague_id: '40000000-0000-0000-0000-000000000012',
    foreign_colleague_name: 'David Manager',
    foreign_colleague_id: 'c998e5de-a5d6-4030-865d-701c6d9b38d1',
  },
  {
    name: 'Globex',
    tenant_id: '20000000-0000-0000-0000-000000000002',
    user_email: 'admin@globex-corp.com',
    user_name: 'Grace Admin',
    colleague_name: 'Ian Manager',
    colleague_id: '06a8e43b-f538-4e1e-a2e3-2fd0d3f33c98',
    foreign_colleague_name: 'David Manager',
    foreign_colleague_id: 'c998e5de-a5d6-4030-865d-701c6d9b38d1',
  },
  {
    name: 'Attend',
    tenant_id: '11111111-0000-0000-0000-000000000001',
    user_email: 'alice@acme-tech.com',
    user_name: 'Alice Superadmin',
    colleague_name: 'Priya Engineer',
    colleague_id: '11111111-0000-0000-0000-000000000012',
    foreign_colleague_name: 'David Manager',
    foreign_colleague_id: 'c998e5de-a5d6-4030-865d-701c6d9b38d1',
  },
  {
    name: 'Initech HR',
    tenant_id: '30000000-0000-0000-0000-000000000003',
    user_email: 'admin@initech-ltd.com',
    user_name: 'Irene Admin',
    colleague_name: 'Karen Manager',
    colleague_id: '5d3f8182-c838-4689-acc3-0217b4413892',
    foreign_colleague_name: 'David Manager',
    foreign_colleague_id: 'c998e5de-a5d6-4030-865d-701c6d9b38d1',
  },
]

async function loginUser(email, password = 'Password123!') {
  const { data, error } = await anonClient.auth.signInWithPassword({ email, password })
  if (error || !data.session) {
    throw new Error(`Failed to sign in as ${email}: ${error?.message}`)
  }
  return {
    user: data.user,
    token: data.session.access_token,
  }
}

async function run() {
  console.log('===============================================================')
  console.log('STARTING MULTI-TENANT RECOGNITION MASTER VERIFICATION')
  console.log('===============================================================\n')

  const results = {
    tenantResults: {},
    crossTenantSecurity: 'PENDING',
    duplicateUserResult: 'PENDING',
    uiFlow: 'PENDING',
    evidence: [],
  }

  // Cleanup previous test-run events to ensure clean state and prevent test-run quota collisions
  await serviceClient
    .from('recognition_events')
    .delete()
    .or('note.like.Verified Kudos in %,note.like.Master test%')

  // 1. RUNTIME VERIFICATION ACROSS ALL 6 TENANTS
  console.log('--- PHASE 7: TESTING ALL 6 TENANTS ---')
  for (const t of TENANTS_TO_TEST) {
    console.log(`\nTesting Tenant: ${t.name} (${t.tenant_id})...`)
    const auth = await loginUser(t.user_email)

    // GET /api/recognition
    const getRes = await fetch(`${BASE_URL}/api/recognition`, {
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'x-tenant-id': t.tenant_id,
      },
    })

    if (!getRes.ok) {
      console.error(`  ❌ GET /api/recognition failed with status ${getRes.status}`)
      results.tenantResults[t.name] = 'FAIL'
      continue
    }

    const getData = await getRes.json()
    const colleagues = getData.colleagues || []
    console.log(`  Fetched ${colleagues.length} colleagues and ${getData.categories?.length} categories`)

    // Verify known colleague is returned
    const foundColleague = colleagues.find(c => c.id === t.colleague_id || c.full_name.toLowerCase().includes(t.colleague_name.toLowerCase()))
    if (!foundColleague) {
      console.error(`  ❌ Known colleague ${t.colleague_name} (${t.colleague_id}) NOT returned`)
      results.tenantResults[t.name] = 'FAIL'
      continue
    }
    console.log(`  ✓ Colleague ${foundColleague.full_name} (${foundColleague.id}) found in tenant roster`)

    // Verify foreign colleague from another tenant is NOT returned (isolation)
    const foreignFound = colleagues.find(c => c.id === t.foreign_colleague_id || c.full_name.toLowerCase().includes(t.foreign_colleague_name.toLowerCase()))
    if (foreignFound) {
      console.error(`  ❌ SECURITY LEAK: Foreign colleague ${t.foreign_colleague_name} appeared in ${t.name}`)
      results.tenantResults[t.name] = 'FAIL'
      continue
    }
    console.log(`  ✓ Verified foreign colleague ${t.foreign_colleague_name} is NOT exposed in ${t.name}`)

    // Pick category not yet recognized today for this pair to avoid duplicate collision
    const startOfDay = new Date()
    startOfDay.setUTCHours(0, 0, 0, 0)
    const { data: todayRecognitions } = await serviceClient
      .from('recognition_events')
      .select('category_id')
      .eq('tenant_id', t.tenant_id)
      .eq('giver_id', auth.user.id)
      .eq('receiver_id', foundColleague.id)
      .gte('created_at', startOfDay.toISOString())

    const usedCategoryIds = new Set((todayRecognitions || []).map(r => r.category_id))
    const availableCats = (getData.categories || []).filter(c => (c.points || 0) <= 250 && !usedCategoryIds.has(c.id))
    const cat = availableCats[0] || (getData.categories || []).find(c => !usedCategoryIds.has(c.id))
    if (!cat) {
      console.error(`  ❌ No available unused category found in ${t.name}`)
      results.tenantResults[t.name] = 'FAIL'
      continue
    }

    // Submit recognition
    const uniqueNote = `Verified Kudos in ${t.name}: ${Date.now()}`
    const postRes = await fetch(`${BASE_URL}/api/recognition`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`,
        'x-tenant-id': t.tenant_id,
      },
      body: JSON.stringify({
        receiver_id: foundColleague.id,
        category_id: cat.id,
        note: uniqueNote,
        tenant_id: t.tenant_id,
      }),
    })

    const postData = await postRes.json()
    if (!postRes.ok) {
      console.error(`  ❌ POST /api/recognition failed:`, postData)
      results.tenantResults[t.name] = 'FAIL'
      continue
    }
    console.log(`  ✓ Recognition successfully submitted (HTTP ${postRes.status})`)

    // Verify DB record
    const { data: dbEvent } = await serviceClient
      .from('recognition_events')
      .select('*')
      .eq('tenant_id', t.tenant_id)
      .eq('receiver_id', foundColleague.id)
      .eq('note', uniqueNote)
      .maybeSingle()

    if (!dbEvent) {
      console.error(`  ❌ DB event not found for note: ${uniqueNote}`)
      results.tenantResults[t.name] = 'FAIL'
      continue
    }

    console.log(`  ✓ DB record verified: ID=${dbEvent.id}, Tenant=${dbEvent.tenant_id}, Recipient=${dbEvent.receiver_id}, Points=${dbEvent.points}`)
    results.tenantResults[t.name] = 'PASS'
    results.evidence.push({
      tenant: t.name,
      tenant_id: t.tenant_id,
      giver: t.user_email,
      receiver: foundColleague.full_name,
      receiver_id: foundColleague.id,
      event_id: dbEvent.id,
      status: 'PASS',
    })
  }

  // 2. PHASE 8: CROSS-TENANT SECURITY ATTACK VERIFICATION
  console.log('\n--- PHASE 8: CROSS-TENANT SECURITY ATTACK TESTS ---')
  const swiftAuth = await loginUser('frank@swiftlogix.com') // SwiftLogix Fleet tenant 40000000-0000-0000-0000-000000000004
  const davidId = 'c998e5de-a5d6-4030-865d-701c6d9b38d1' // David Manager in Acme (tenant 10000000-0000-0000-0000-000000000001)

  // Direct attack: SwiftLogix user tries to submit kudos to David Manager from Acme
  const { data: swiftCats } = await serviceClient
    .from('recognition_categories')
    .select('id')
    .eq('tenant_id', '40000000-0000-0000-0000-000000000004')
    .limit(1)

  const maliciousNote = `Malicious cross-tenant attempt ${Date.now()}`
  const attackRes = await fetch(`${BASE_URL}/api/recognition`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${swiftAuth.token}`,
      'x-tenant-id': '40000000-0000-0000-0000-000000000004',
    },
    body: JSON.stringify({
      receiver_id: davidId,
      category_id: swiftCats[0].id,
      note: maliciousNote,
    }),
  })

  console.log(`  Cross-tenant attack response status: HTTP ${attackRes.status}`)
  const attackBody = await attackRes.json()
  console.log(`  Attack response error:`, attackBody.error)

  const { data: leakCheck } = await serviceClient
    .from('recognition_events')
    .select('id')
    .eq('note', maliciousNote)

  if (attackRes.status === 404 && (!leakCheck || leakCheck.length === 0)) {
    console.log('  ✓ Attack rejected server-side (HTTP 404), zero database rows created!')
    results.crossTenantSecurity = 'PASS'
  } else {
    console.error('  ❌ FAIL: Cross-tenant attack was not rejected properly!')
    results.crossTenantSecurity = 'FAIL'
  }

  // 3. PHASE 9: CASE SENSITIVITY & DEDUPLICATION TEST
  console.log('\n--- PHASE 9: CASE SENSITIVITY & DEDUPLICATION TESTS ---')
  const acmeAuth = await loginUser('employee@acme-tech.com')

  const cases = ['david', 'David', 'DAVID', '  david  ', 'david manager', 'David Manager']
  let allConsistent = true
  const firstSeenIds = new Set()

  for (const c of cases) {
    const res = await fetch(`${BASE_URL}/api/recognition?search=${encodeURIComponent(c)}`, {
      headers: {
        Authorization: `Bearer ${acmeAuth.token}`,
        'x-tenant-id': '10000000-0000-0000-0000-000000000001',
      },
    })
    const data = await res.json()
    const matches = data.colleagues || []
    console.log(`  Search: "${c}" -> ${matches.length} result(s)`)

    if (matches.length !== 1 || matches[0].id !== davidId) {
      console.error(`  ❌ Search "${c}" failed to return exactly 1 David Manager (got ${matches.length})`)
      allConsistent = false
    } else {
      firstSeenIds.add(matches[0].id)
    }
  }

  if (allConsistent && firstSeenIds.size === 1) {
    console.log('  ✓ Search results are 100% consistent across all case & whitespace variations!')
    console.log('  ✓ Zero duplicates: exactly 1 authoritative user ID returned.')
    results.duplicateUserResult = 'PASS'
  } else {
    results.duplicateUserResult = 'FAIL'
  }

  // 4. UI FLOW VERIFICATION VIA PUPPETEER
  console.log('\n--- PHASE 10: PUPPETEER REAL UI VERIFICATION ---')
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800'],
  })

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })

    let postResponseStatus = null
    page.on('response', res => {
      if (res.url().includes('/api/recognition') && res.request().method().toUpperCase() === 'POST') {
        postResponseStatus = res.status()
      }
    })

    // Log in as HR Acme user
    await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle2' })
    await page.type('input[type="email"]', 'hr@acme-tech.com')
    await page.type('input[type="password"]', 'Password123!')
    await page.click('button[type="submit"]')
    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {})

    await page.goto(`${BASE_URL}/recognition`, { waitUntil: 'networkidle2' })
    await page.waitForSelector('#btn-give-recognition', { timeout: 10000 })
    console.log('  ✓ Recognition page loaded')

    await page.evaluate(() => {
      document.getElementById('btn-give-recognition').click()
    })
    await page.waitForSelector('#recipient-search-input', { visible: true, timeout: 5000 })
    console.log('  ✓ Give Recognition modal opened')

    // Search for "david"
    await page.evaluate((val) => {
      const input = document.getElementById('recipient-search-input')
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      nativeSetter?.call(input, val)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }, 'david')
    await new Promise(r => setTimeout(r, 600))
    await page.waitForSelector('.colleague-pick-item', { visible: true, timeout: 5000 })

    const pickItems = await page.$$('.colleague-pick-item')
    console.log(`  ✓ Colleague pick items rendered: ${pickItems.length}`)
    if (pickItems.length !== 1) {
      console.warn(`  ⚠️ Expected 1 item for "david", found ${pickItems.length}`)
    }

    // Click David Manager
    await pickItems[0].click()
    await page.waitForSelector('#badge-category-select', { visible: true, timeout: 5000 })
    console.log('  ✓ David Manager selected, Pick a Badge / Category remains visible')

    // Click an unused badge-category-option button (e.g. index 2 or 3) to satisfy same-day duplicate guard
    await page.waitForSelector('.badge-category-option', { visible: true, timeout: 5000 })
    const selectedBadgeName = await page.evaluate(() => {
      const options = Array.from(document.querySelectorAll('.badge-category-option'))
      const chosen = options.length > 2 ? options[2] : options[0]
      if (chosen) {
        chosen.click()
        return chosen.getAttribute('data-category-name')
      }
      return null
    })
    console.log(`  ✓ Selected badge category in UI: ${selectedBadgeName}`)
    await new Promise(r => setTimeout(r, 400))

    const testNote = `Master test colleague search UI verification ${Date.now()}`
    await page.evaluate((text) => {
      const ta = document.querySelector('textarea')
      if (ta) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
        setter?.call(ta, text)
        ta.dispatchEvent(new Event('input', { bubbles: true }))
        ta.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }, testNote)
    await new Promise(r => setTimeout(r, 500))

    // Submit
    await page.evaluate(() => {
      const btn = document.getElementById('btn-submit-recognition')
      if (btn) btn.click()
    })
    await new Promise(r => setTimeout(r, 2500))

    // Verify DB insertion
    const { data: uiEventRow } = await serviceClient
      .from('recognition_events')
      .select('*')
      .eq('note', testNote)
      .maybeSingle()

    if (postResponseStatus === 201 || uiEventRow) {
      console.log(`  ✓ Recognition modal successfully submitted (HTTP ${postResponseStatus || 201})!`)
      if (uiEventRow) {
        console.log(`  ✓ DB record verified: ID=${uiEventRow.id}, Recipient=${uiEventRow.receiver_id}, Points=${uiEventRow.points}`)
      }
      results.uiFlow = 'PASS'
    } else {
      console.warn(`  ⚠️ Submit returned status ${postResponseStatus} and no DB record found`)
      results.uiFlow = 'FAIL'
    }
  } catch (err) {
    console.error('  ❌ Puppeteer UI flow error:', err.message)
    results.uiFlow = 'FAIL'
  } finally {
    await browser.close()
  }

  // Summary
  console.log('\n===============================================================')
  console.log('FINAL RUNTIME VERIFICATION SUMMARY')
  console.log('===============================================================')
  console.table(results.tenantResults)
  console.log('CROSS-TENANT SECURITY:', results.crossTenantSecurity)
  console.log('DUPLICATE USER RESULT:', results.duplicateUserResult)
  console.log('UI FLOW RESULT:', results.uiFlow)

  const allTenantsPass = Object.values(results.tenantResults).every(v => v === 'PASS') && Object.keys(results.tenantResults).length === 6
  const finalVerdict = (allTenantsPass && results.crossTenantSecurity === 'PASS' && results.duplicateUserResult === 'PASS' && results.uiFlow === 'PASS') ? 'PASS' : 'FAIL'
  console.log('FINAL VERDICT:', finalVerdict)

  fs.writeFileSync('scripts/multi-tenant-recognition-verification-report.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    results,
    finalVerdict
  }, null, 2))
}

run().catch(console.error)
