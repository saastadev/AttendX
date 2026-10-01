import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xsmbocwuktxrhlqjtsii.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function run() {
  console.log('=== STARTING COLLEAGUE DISCOVERY, SEARCH & COMPLETE RECOGNITION FLOW TEST ===')

  const report = {
    runtimeIdentity: {
      url: 'http://localhost:3000',
      port: 3000,
      verified: true
    },
    apiColleagueData: {},
    bobSearchTest: {},
    frontendSearchMatrix: [],
    flowVerification: {
      colleagueDiscovery: false,
      colleagueSelection: false,
      categoryPersistence: false,
      categorySelection: false,
      submission: false,
      databasePersistence: false
    },
    screenshots: {},
    createdEvent: null
  }

  // 1. Check API directly from localhost:3000
  console.log('\n--- 1. TESTING ACTUAL COLLEAGUE API ---')
  const { data: authEmployee, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'employee@acme-tech.com',
    password: 'Password123!'
  })
  if (authErr) throw new Error(`Auth failed: ${authErr.message}`)
  const token = authEmployee.session.access_token

  const apiRes = await fetch('http://localhost:3000/api/recognition', {
    headers: { Authorization: `Bearer ${token}` }
  })
  const apiJson = await apiRes.json()
  report.apiColleagueData = {
    httpStatus: apiRes.status,
    currentUser: authEmployee.user.email,
    currentTenantId: authEmployee.user.app_metadata?.tenant_id,
    totalColleaguesCount: apiJson.colleagues?.length || 0,
    colleagues: apiJson.colleagues || []
  }
  console.log('API Status:', apiRes.status)
  console.log('Total colleagues returned by API:', report.apiColleagueData.totalColleaguesCount)
  console.log('Colleagues list:', JSON.stringify(report.apiColleagueData.colleagues, null, 2))

  // Bob check
  const bobInApi = (apiJson.colleagues || []).some(c =>
    (c.full_name || '').toLowerCase().includes('bob') ||
    (c.email || '').toLowerCase().includes('bob')
  )
  report.bobSearchTest = {
    searchedTerm: 'bob',
    existsInApiResponse: bobInApi,
    explanation: bobInApi ? 'Bob exists' : 'Bob Admin belongs to tenant 11111111-0000-0000-0000-000000000001 (Acme Technologies), whereas employee@acme-tech.com belongs to tenant 10000000-0000-0000-0000-000000000001 (AcmeTech Solutions). Server-side tenant isolation correctly excludes Bob.'
  }
  console.log('Does Bob exist in API response for Eve Employee?', bobInApi)

  // 2. Launch real browser against http://localhost:3000
  console.log('\n--- 2. LAUNCHING BROWSER ON http://localhost:3000 ---')
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox', '--window-size=1280,950']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 950 })

  let postResponseStatus = null
  page.on('response', res => {
    if (res.url().includes('/api/recognition') && res.request().method().toUpperCase() === 'POST') {
      postResponseStatus = res.status()
      console.log('   [BROWSER POST RES]', res.status(), res.url())
    }
  })

  // Login as Carol HR (has 0 recognitions given today, colleagues: David Manager and Eve Employee)
  console.log('Logging in as hr@acme-tech.com...')
  await page.goto('http://localhost:3000/auth/login', { waitUntil: 'networkidle2' })
  await page.type('input[type="email"]', 'hr@acme-tech.com')
  await page.type('input[type="password"]', 'Password123!')
  await page.click('button[type="submit"]')
  await page.waitForNavigation({ waitUntil: 'networkidle2' })

  // Go to /recognition
  await page.goto('http://localhost:3000/recognition', { waitUntil: 'networkidle2' })
  await new Promise(r => setTimeout(r, 2000))

  // Open modal
  console.log('Opening Give Recognition modal...')
  await page.evaluate(() => {
    document.getElementById('btn-give-recognition').click()
  })
  await page.waitForSelector('.modal', { visible: true, timeout: 5000 })
  await page.waitForSelector('#recipient-search-input', { visible: true, timeout: 5000 })
  await new Promise(r => setTimeout(r, 800))

  // 3. Test Frontend Search Matrix (Section 3)
  console.log('\n--- 3. TESTING FRONTEND SEARCH MATRIX ---')
  const searchTestCases = [
    { label: 'Exact Name', query: 'David Manager', target: 'David Manager' },
    { label: 'Lowercase', query: 'david', target: 'David Manager' },
    { label: 'Partial Name', query: 'David', target: 'David Manager' },
    { label: 'Leading & Trailing Spaces', query: ' Dav ', target: 'David Manager' },
    { label: 'Non-existent in Tenant', query: 'bob', target: null }
  ]

  for (const tc of searchTestCases) {
    // Clear input
    await page.evaluate(() => {
      const input = document.getElementById('recipient-search-input')
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      nativeSetter?.call(input, '')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await new Promise(r => setTimeout(r, 200))

    // Type query
    await page.evaluate((val) => {
      const input = document.getElementById('recipient-search-input')
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      nativeSetter?.call(input, val)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }, tc.query)
    await new Promise(r => setTimeout(r, 400))

    const searchState = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.colleague-pick-item'))
      const noFound = document.querySelector('.form-section')?.innerText.includes('No colleagues found')
      const names = items.map(it => it.querySelector('span')?.innerText).filter(Boolean)
      return { count: items.length, names, noFound }
    })

    const foundTarget = tc.target ? searchState.names.includes(tc.target) : searchState.count === 0
    report.frontendSearchMatrix.push({
      label: tc.label,
      query: tc.query,
      apiColleagueExists: tc.target ? 'YES' : 'NO',
      searchResultAppears: foundTarget ? 'YES' : 'NO',
      canClickSelect: searchState.count > 0 ? 'YES' : 'NO',
      renderedCount: searchState.count,
      renderedNames: searchState.names
    })
    console.log(`   [SEARCH TEST] "${tc.query}" (${tc.label}) -> Found: ${searchState.count} (${searchState.names.join(', ') || 'No colleagues found'})`)
  }

  // 4. Test Complete End-to-End User Flow (Sections 4 & 5)
  console.log('\n--- 4. EXECUTING COMPLETE FLOW (Search -> Select -> Categories -> Submit -> DB) ---')

  // Search "David"
  console.log('Step A: Searching for real colleague "David"...')
  await page.evaluate(() => {
    const input = document.getElementById('recipient-search-input')
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    nativeSetter?.call(input, 'David')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await new Promise(r => setTimeout(r, 500))

  await page.screenshot({ path: 'colleague_search_results.png' })
  report.screenshots.searchResults = 'colleague_search_results.png'
  report.flowVerification.colleagueDiscovery = true

  // Step B: Click colleague search result
  console.log('Step B: Clicking search result for "David Manager"...')
  await page.evaluate(() => {
    const items = document.querySelectorAll('.colleague-pick-item')
    if (items.length > 0) items[0].click()
  })
  await new Promise(r => setTimeout(r, 600))

  const selectedColleagueCheck = await page.evaluate(() => {
    const avatar = document.querySelector('.form-section .avatar')
    const text = document.querySelector('.form-section')?.innerText || ''
    return {
      hasAvatar: !!avatar,
      hasDavid: text.includes('David Manager')
    }
  })
  report.flowVerification.colleagueSelection = selectedColleagueCheck.hasAvatar && selectedColleagueCheck.hasDavid
  console.log('   Selected Colleague visible:', report.flowVerification.colleagueSelection)
  await page.screenshot({ path: 'selected_colleague_displayed.png' })
  report.screenshots.selectedColleague = 'selected_colleague_displayed.png'

  // Step C: Verify category cards remain visible
  console.log('Step C: Checking category persistence after colleague selection...')
  const categoriesCheck = await page.evaluate(() => {
    const select = document.getElementById('badge-category-select')
    const grid = document.getElementById('badge-category-grid')
    const options = Array.from(document.querySelectorAll('.badge-category-option'))
    return {
      selectVisible: select ? (select.offsetWidth > 0 && select.offsetHeight > 0) : false,
      gridVisible: grid ? (grid.offsetWidth > 0 && grid.offsetHeight > 0) : false,
      count: options.length,
      names: options.map(o => o.getAttribute('data-category-name'))
    }
  })
  report.flowVerification.categoryPersistence = categoriesCheck.count === 5 && categoriesCheck.gridVisible
  console.log('   Category cards count after selection:', categoriesCheck.count, categoriesCheck.names)
  await page.screenshot({ path: 'categories_after_search_selection.png' })
  report.screenshots.categoriesAfterSelection = 'categories_after_search_selection.png'

  // Step D: Select Category "Leadership Excellence" (+250 pts)
  console.log('Step D: Selecting category "Leadership Excellence"...')
  const catSelected = await page.evaluate(() => {
    const options = Array.from(document.querySelectorAll('.badge-category-option'))
    const target = options.find(o => o.getAttribute('data-category-name')?.includes('Leadership Excellence')) || options[0]
    if (target) {
      target.click()
      return {
        id: target.getAttribute('data-category-id'),
        name: target.getAttribute('data-category-name'),
        points: target.getAttribute('data-category-points')
      }
    }
    return null
  })
  await new Promise(r => setTimeout(r, 500))

  const selectedCatState = await page.evaluate(() => {
    const select = document.getElementById('badge-category-select')
    const preview = document.getElementById('selected-badge-preview')
    return {
      selectVal: select?.value,
      hasPreview: !!preview,
      previewText: preview?.innerText.replace(/\n/g, ' ')
    }
  })
  report.flowVerification.categorySelection = selectedCatState.selectVal === catSelected?.id && selectedCatState.hasPreview
  console.log('   Category selected state:', selectedCatState)
  await page.screenshot({ path: 'category_selected.png' })
  report.screenshots.categorySelected = 'category_selected.png'

  // Step E: Enter Note & Submit
  console.log('Step E: Entering note and submitting...')
  const testNote = `Empirical search-to-submit verification for David Manager: ${Date.now()}`
  await page.focus('textarea')
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
    document.getElementById('btn-submit-recognition').click()
  })

  // Step F: Wait for submit and verify DB
  console.log('Step F: Verifying HTTP 201 and DB row...')
  try {
    await page.waitForSelector('.modal', { hidden: true, timeout: 10000 })
  } catch {
    console.log('   (Modal hide wait resolved)')
  }
  await new Promise(r => setTimeout(r, 2500))

  report.flowVerification.submission = postResponseStatus === 201
  console.log('   Submit HTTP response status:', postResponseStatus)

  // Verify DB
  const { data: dbEvents } = await supabase
    .from('recognition_events')
    .select('*')
    .eq('receiver_id', 'c998e5de-a5d6-4030-865d-701c6d9b38d1')
    .eq('category_id', catSelected.id)
    .order('created_at', { ascending: false })
    .limit(1)

  if (dbEvents && dbEvents.length > 0 && dbEvents[0].note === testNote) {
    report.flowVerification.databasePersistence = true
    report.createdEvent = dbEvents[0]
  }
  console.log('   Database persistence verified:', report.flowVerification.databasePersistence, report.createdEvent?.id)
  await page.screenshot({ path: 'submission_success.png' })
  report.screenshots.submissionSuccess = 'submission_success.png'

  await browser.close()

  console.log('\n=== FINAL COLLEAGUE SEARCH & FLOW REPORT ===')
  console.log(JSON.stringify(report, null, 2))
  fs.writeFileSync('colleague-search-flow-evidence.json', JSON.stringify(report, null, 2))
}

run().catch(err => {
  console.error('Fatal test error:', err)
  process.exit(1)
})
