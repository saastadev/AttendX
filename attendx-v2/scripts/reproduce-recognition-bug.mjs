import puppeteer from 'puppeteer-core'
import fs from 'fs'

async function run() {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox', '--window-size=1280,900']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900 })

  // Log console and errors
  page.on('console', msg => console.log('[BROWSER CONSOLE]', msg.type(), msg.text()))
  page.on('pageerror', err => console.log('[BROWSER PAGEERROR]', err.message))

  // Track all network requests
  const apiRequests = []
  page.on('request', req => {
    if (req.url().includes('/api/recognition')) {
      apiRequests.push({ time: Date.now(), method: req.method(), url: req.url() })
      console.log('--> [REQ]', req.method(), req.url())
    }
  })
  page.on('response', async res => {
    if (res.url().includes('/api/recognition') && res.request().method() === 'GET') {
      try {
        const json = await res.json()
        console.log('<-- [RES /api/recognition GET]', {
          status: res.status(),
          categoriesCount: json.categories?.length,
          colleaguesCount: json.colleagues?.length,
          categories: json.categories?.map(c => ({ id: c.id, name: c.name, points: c.points })),
          colleagues: json.colleagues?.map(c => ({ id: c.id, name: c.full_name, email: c.email }))
        })
      } catch (err) {
        console.log('<-- [RES /api/recognition error parsing json]', err.message)
      }
    }
  })

  // Login
  console.log('1. Logging in as employee@acme-tech.com...')
  await page.goto('http://localhost:3000/auth/login', { waitUntil: 'networkidle2' })
  await page.type('input[type="email"]', 'employee@acme-tech.com')
  await page.type('input[type="password"]', 'Password123!')
  await page.click('button[type="submit"]')
  await page.waitForNavigation({ waitUntil: 'networkidle2' })
  console.log('   Logged in URL:', page.url())

  // Go to recognition
  console.log('2. Navigating to /recognition...')
  await page.goto('http://localhost:3000/recognition', { waitUntil: 'networkidle2' })
  console.log('   Waiting 2500ms for React hydration...')
  await new Promise(r => setTimeout(r, 2500))

  // Open modal
  console.log('3. Opening Give Recognition Modal...')
  await page.evaluate(() => {
    const btn = document.getElementById('btn-give-recognition')
    if (btn) btn.click()
  })

  await page.waitForSelector('.modal', { visible: true, timeout: 5000 })
  console.log('   Modal opened!')
  await new Promise(r => setTimeout(r, 1000))

  // STATE 1: Before colleague selection
  console.log('\n--- EVALUATING STATE 1 (Before Colleague Selection) ---')
  await page.screenshot({ path: 'investigation_state1.png' })
  console.log('   Screenshot saved: investigation_state1.png')

  const state1Info = await page.evaluate(() => {
    const select = document.getElementById('badge-category-select')
    const grid = document.getElementById('badge-category-grid')
    const noCats = document.getElementById('no-categories-message')
    const options = Array.from(document.querySelectorAll('.badge-category-option'))
    const colleagues = Array.from(document.querySelectorAll('.colleague-pick-item'))
    const selectedBadge = document.getElementById('selected-badge-preview')

    return {
      selectExists: !!select,
      selectVisible: select ? (select.offsetWidth > 0 && select.offsetHeight > 0) : false,
      selectOptionsCount: select ? select.options.length : 0,
      gridExists: !!grid,
      gridVisible: grid ? (grid.offsetWidth > 0 && grid.offsetHeight > 0) : false,
      badgeOptionsCount: options.length,
      badgeOptionsText: options.map(o => o.innerText.replace(/\n/g, ' ')),
      noCatsMessageExists: !!noCats,
      selectedBadgePreviewExists: !!selectedBadge,
      colleaguesCount: colleagues.length,
      colleaguesList: colleagues.map(c => c.innerText.replace(/\n/g, ' '))
    }
  })
  console.log('   State 1 Info:', JSON.stringify(state1Info, null, 2))

  // STATE 2: Select colleague
  console.log('\n--- PERFORMING ACTION: Select Colleague ---')
  const reqCountBefore = apiRequests.length
  console.log('   API requests made so far:', reqCountBefore)

  const colleagueSelectedText = await page.evaluate(() => {
    const colleagues = document.querySelectorAll('.colleague-pick-item')
    if (colleagues.length > 0) {
      const first = colleagues[0]
      const text = first.innerText.replace(/\n/g, ' ')
      first.click()
      return text
    }
    return null
  })
  console.log('   Clicked colleague item:', colleagueSelectedText)

  await new Promise(r => setTimeout(r, 1000))

  const reqCountAfter = apiRequests.length
  console.log('   API requests after colleague click:', reqCountAfter, '(New requests:', reqCountAfter - reqCountBefore, ')')

  console.log('\n--- EVALUATING STATE 2 (After Colleague Selection) ---')
  await page.screenshot({ path: 'investigation_state2.png' })
  console.log('   Screenshot saved: investigation_state2.png')

  const state2Info = await page.evaluate(() => {
    const select = document.getElementById('badge-category-select')
    const grid = document.getElementById('badge-category-grid')
    const noCats = document.getElementById('no-categories-message')
    const options = Array.from(document.querySelectorAll('.badge-category-option'))
    const selectedBadge = document.getElementById('selected-badge-preview')
    const modal = document.querySelector('.modal')
    const modalBody = modal ? modal.innerText : ''

    // Let's also check the exact HTML inside input-group for category
    const categoryGroup = select ? select.closest('.input-group') : null
    const categoryGroupHtml = categoryGroup ? categoryGroup.outerHTML : ''

    return {
      selectExists: !!select,
      selectVisible: select ? (select.offsetWidth > 0 && select.offsetHeight > 0) : false,
      selectOptionsCount: select ? select.options.length : 0,
      gridExists: !!grid,
      gridVisible: grid ? (grid.offsetWidth > 0 && grid.offsetHeight > 0) : false,
      gridDisplay: grid ? window.getComputedStyle(grid).display : null,
      gridHeight: grid ? grid.clientHeight : null,
      gridScrollHeight: grid ? grid.scrollHeight : null,
      badgeOptionsCount: options.length,
      badgeOptionsText: options.map(o => o.innerText.replace(/\n/g, ' ')),
      noCatsMessageExists: !!noCats,
      selectedBadgePreviewExists: !!selectedBadge,
      categoryGroupHtml,
      modalText: modalBody
    }
  })
  console.log('   State 2 Info:', JSON.stringify(state2Info, null, 2))

  await browser.close()
}

run().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
