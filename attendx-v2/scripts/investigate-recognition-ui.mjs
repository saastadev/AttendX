import fs from 'fs'
import path from 'path'
import puppeteer from 'puppeteer-core'

const BASE_URL = 'http://localhost:3000'
const ARTIFACT_DIR = '/Users/nanthithavenkatachapathy/.gemini/antigravity-ide/brain/c85c8cc5-58ec-40e9-945c-7ec97efbbce2'

async function run() {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900 })

  const reqLogs = []
  page.on('request', req => {
    if (req.url().includes('/api/recognition')) {
      reqLogs.push({ step: 'REQ', method: req.method(), url: req.url() })
    }
  })
  page.on('response', async res => {
    if (res.url().includes('/api/recognition')) {
      let body = null
      try { body = await res.json() } catch { body = null }
      reqLogs.push({ step: 'RES', method: res.request().method(), status: res.status(), body })
    }
  })

  console.log('1. Logging in...')
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' })
  await page.waitForSelector('input[type="email"]')
  await page.type('input[type="email"]', 'employee@acme-tech.com')
  await page.type('input[type="password"]', 'Password123!')
  await page.click('button[type="submit"]')
  await page.waitForNavigation({ waitUntil: 'networkidle2' })

  console.log('2. Going to /recognition...')
  await page.goto(`${BASE_URL}/recognition`, { waitUntil: 'networkidle2' })
  await new Promise(r => setTimeout(r, 2000))

  console.log('3. Clicking Give Kudos button...')
  await page.waitForSelector('#btn-give-recognition', { timeout: 10000 })
  await page.evaluate(() => {
    document.getElementById('btn-give-recognition').click()
  })
  await new Promise(r => setTimeout(r, 1000))

  console.log('4. Capturing STATE 1 (Modal open, no colleague selected)...')
  const state1Screenshot = path.join(ARTIFACT_DIR, 'state1_modal_open.png')
  await page.screenshot({ path: state1Screenshot })

  const state1Data = await page.evaluate(() => {
    const modal = document.querySelector('.modal')
    const select = document.querySelector('#badge-category-select')
    const options = select ? Array.from(select.querySelectorAll('option')).map(o => ({ value: o.value, text: o.text })) : []
    const gridButtons = Array.from(document.querySelectorAll('.badge-category-option, [data-category-id]')).map(b => ({
      id: b.getAttribute('data-category-id'),
      text: b.innerText.trim(),
    }))
    const colleagueSelected = !!document.querySelector('.modal .btn-xs')
    return {
      modalFound: !!modal,
      colleagueSelected,
      selectFound: !!select,
      optionsCount: options.length,
      options,
      gridButtonsCount: gridButtons.length,
      gridButtons,
      modalText: modal?.innerText || '',
    }
  })
  console.log('State 1 Data:', JSON.stringify(state1Data, null, 2))

  console.log('\n5. Searching and selecting colleague "David Manager"...')
  await page.type('.modal input[type="text"]', 'David')
  await new Promise(r => setTimeout(r, 500))

  const colleaguesFound = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.colleague-pick-item')).map(c => c.innerText.replace(/\n+/g, ' '))
  })
  console.log('Colleagues in search list:', colleaguesFound)

  await page.evaluate(() => {
    const item = document.querySelector('.colleague-pick-item')
    if (item) item.click()
  })
  await new Promise(r => setTimeout(r, 1000))

  console.log('6. Capturing STATE 2 (Colleague selected)...')
  const state2Screenshot = path.join(ARTIFACT_DIR, 'state2_colleague_selected.png')
  await page.screenshot({ path: state2Screenshot })

  const state2Data = await page.evaluate(() => {
    const modal = document.querySelector('.modal')
    const select = document.querySelector('#badge-category-select')
    const options = select ? Array.from(select.querySelectorAll('option')).map(o => ({ value: o.value, text: o.text })) : []
    const gridButtons = Array.from(document.querySelectorAll('.badge-category-option, [data-category-id]')).map(b => ({
      id: b.getAttribute('data-category-id'),
      text: b.innerText.trim(),
    }))
    const colleagueSelected = !!document.querySelector('.modal .btn-xs')
    return {
      modalFound: !!modal,
      colleagueSelected,
      selectFound: !!select,
      optionsCount: options.length,
      options,
      gridButtonsCount: gridButtons.length,
      gridButtons,
      modalText: modal?.innerText || '',
    }
  })
  console.log('State 2 Data:', JSON.stringify(state2Data, null, 2))

  console.log('\nAll Recognition Network Requests during flow:')
  console.log(JSON.stringify(reqLogs.map(r => ({ step: r.step, method: r.method, status: r.status, categoriesInRes: r.body?.categories?.length })), null, 2))

  await browser.close()
}

run().catch(err => {
  console.error('Test run failed:', err)
  process.exit(1)
})
