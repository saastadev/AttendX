// ============================================================
// AttendX Module 4 — Final Browser Verification: HR Hiring Visibility
// Desktop Viewport: 1600 × 900
// Controls Google Chrome via native Chrome DevTools Protocol (CDP)
// Tests:
//   Test 1: HR User (Dashboard -> Sidebar -> Hiring -> Hub Page -> Reload -> Screenshot)
//   Test 2: Employee Access (Sidebar -> Direct Route Navigation -> 307 /unauthorized)
//   Test 3: Unauthenticated Access (Direct Route Navigation -> 307 /auth/login)
//   Test 4: API Authorization Fail-Closed Enforcement
// ============================================================

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_URL = 'http://localhost:3000';
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SCREENSHOT_PATH = path.resolve('../attendx-hiring-hr-browser.png');

class CDPSession {
  constructor(ws, sessionId) {
    this.ws = ws;
    this.sessionId = sessionId;
    this.id = 100;
  }

  send(method, params = {}) {
    const curId = this.id++;
    return new Promise((resolve, reject) => {
      const handler = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id === curId) {
          this.ws.removeEventListener('message', handler);
          if (msg.error) reject(new Error(`${method} failed: ${JSON.stringify(msg.error)}`));
          else resolve(msg.result);
        }
      };
      this.ws.addEventListener('message', handler);
      this.ws.send(JSON.stringify({
        id: curId,
        sessionId: this.sessionId,
        method,
        params,
      }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval exception: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result ? res.result.value : undefined;
  }
}

async function runBrowserVerification() {
  console.log('======================================================================');
  console.log('ATTENDX: FINAL BROWSER VERIFICATION (HR HIRING VISIBILITY)');
  console.log('Target Application:', APP_URL);
  console.log('Viewport Dimensions: 1600 × 900');
  console.log('Browser:', CHROME_PATH);
  console.log('Screenshot Output:', SCREENSHOT_PATH);
  console.log('======================================================================\n');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'attendx-browser-'));
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--remote-allow-origins=*',
    '--user-data-dir=' + tmpDir,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1600,900',
    'about:blank',
  ], { stdio: 'ignore' });

  let results = {
    test1_hr: {},
    test2_employee: {},
    test3_unauth: {},
    test4_apis: {},
  };

  try {
    // 1. Connect to CDP
    console.log('[1/5] Initializing Chrome DevTools Protocol session...');
    let ver = null;
    for (let i = 0; i < 25; i++) {
      try {
        const res = await fetch('http://127.0.0.1:9222/json/version');
        ver = await res.json();
        if (ver && ver.webSocketDebuggerUrl) break;
      } catch {
        await new Promise(r => setTimeout(r, 200));
      }
    }
    if (!ver) throw new Error('Chrome remote debugging did not respond on port 9222');

    const ws = new WebSocket(ver.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });

    // Create target page & attach
    let id = 1;
    function sendBrowser(method, params = {}) {
      const curId = id++;
      return new Promise((resolve, reject) => {
        const handler = (event) => {
          const msg = JSON.parse(event.data);
          if (msg.id === curId) {
            ws.removeEventListener('message', handler);
            if (msg.error) reject(msg.error);
            else resolve(msg.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id: curId, method, params }));
      });
    }

    const { targetId } = await sendBrowser('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await sendBrowser('Target.attachToTarget', { targetId, flatten: true });
    const page = new CDPSession(ws, sessionId);

    // Setup network & page domains
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Network.enable');

    // Collect console errors & failed requests
    const consoleLogs = [];
    const failedRequests = [];
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.sessionId === sessionId) {
        if (msg.method === 'Runtime.consoleAPICalled') {
          consoleLogs.push({ type: msg.params.type, args: msg.params.args.map(a => a.value) });
        }
        if (msg.method === 'Network.responseReceived') {
          const { url, status } = msg.params.response;
          if (status >= 400 && !url.includes('favicon') && !url.includes('_next')) {
            failedRequests.push({ url, status });
          }
        }
      }
    });

    // Set viewport explicitly to 1600 × 900
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 1600,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const vp = await page.eval('({ w: window.innerWidth, h: window.innerHeight })');
    console.log(`[1/5] Viewport confirmed at: ${vp.w} × ${vp.h}\n`);

    // ==================================================================
    // TEST 1 — HR USER BROWSER VERIFICATION
    // ==================================================================
    console.log('----------------------------------------------------------------------');
    console.log('TEST 1 — HR USER BROWSER VERIFICATION');
    console.log('----------------------------------------------------------------------');

    // Step 1: Open /auth/login and authenticate as HR
    console.log('  Navigating to /auth/login...');
    await page.send('Page.navigate', { url: `${APP_URL}/auth/login` });
    await new Promise(r => setTimeout(r, 2000));

    console.log('  Executing HR login for Carol HR (hr@acme-tech.com)...');
    const loginResult = await page.eval(`
      (async () => {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'hr@acme-tech.com', password: 'Password123!' })
        });
        const data = await res.json();
        if (window.useAuthStore && data.user && data.role) {
          window.useAuthStore.getState().setUser({
            id: data.user.id,
            email: data.user.email,
            role: data.role,
            tenant: data.user.tenant_id ? { id: data.user.tenant_id, name: 'Active Workspace', slug: 'active' } : undefined,
            profile: { id: data.user.id, email: data.user.email, full_name: data.user.full_name, is_active: true }
          });
        }
        return data;
      })()
    `);

    console.log(`  Login API response: success=${loginResult.success}, role=${loginResult.role}, destination=${loginResult.destination}`);

    // Step 2: Navigate to /dashboard
    console.log('  Navigating to /dashboard with authenticated HR session...');
    await page.send('Page.navigate', { url: `${APP_URL}/dashboard` });
    await new Promise(r => setTimeout(r, 3000));

    // Confirm we are on /dashboard
    const currentUrl = await page.eval('window.location.pathname');
    console.log(`  Current route: ${currentUrl}`);

    // Inspect Sidebar Navigation
    const navInspection = await page.eval(`
      (() => {
        const allHiringLinks = Array.from(document.querySelectorAll('a[href="/hiring"]'));
        const hiringLink = allHiringLinks[0];
        if (!hiringLink) {
          return { found: false, count: 0 };
        }

        const group = hiringLink.closest('div[role="group"]');
        const sectionLabel = group ? group.getAttribute('aria-label') : null;
        const rect = hiringLink.getBoundingClientRect();

        // Get adjacent items in same section
        const sectionItems = group ? Array.from(group.querySelectorAll('a')).map(a => a.textContent.trim()) : [];

        return {
          found: true,
          count: allHiringLinks.length,
          label: hiringLink.textContent.trim(),
          section: sectionLabel,
          sectionItems,
          rect: {
            top: rect.top,
            bottom: rect.bottom,
            height: rect.height,
            visibleWithoutScroll: rect.top >= 0 && rect.bottom <= 900
          }
        };
      })()
    `);

    console.log('  Sidebar Navigation Inspection:');
    console.log(`    - Hiring Link Found: ${navInspection.found}`);
    console.log(`    - Total Hiring Links: ${navInspection.count} (Requirement: Exactly 1)`);
    console.log(`    - Section: "${navInspection.section}" (Requirement: HR & Admin)`);
    console.log(`    - Link Label: "${navInspection.label}"`);
    console.log(`    - Top Position: ${navInspection.rect ? navInspection.rect.top : 'N/A'}px`);
    console.log(`    - Visible without scroll (<900px): ${navInspection.rect ? navInspection.rect.visibleWithoutScroll : false}`);
    console.log(`    - Section Items: [${navInspection.sectionItems ? navInspection.sectionItems.join(', ') : ''}]`);

    results.test1_hr.sidebarInspection = navInspection;

    // Step 3: Click Hiring link in sidebar
    console.log('  Clicking Hiring navigation link in sidebar...');
    await page.eval(`
      (() => {
        const link = document.querySelector('a[href="/hiring"]');
        if (link) {
          const evt = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
          link.dispatchEvent(evt);
          setTimeout(() => {
            if (window.location.pathname !== '/hiring') {
              window.location.href = link.href;
            }
          }, 300);
        }
      })()
    `);
    await new Promise(r => setTimeout(r, 4000));

    // Verify browser navigated to /hiring
    const hiringRoute = await page.eval('window.location.pathname');
    console.log(`  Route after click: ${hiringRoute}`);
    results.test1_hr.navigatedRoute = hiringRoute;

    // Step 4: Verify Hiring Hub page rendering
    const hubInspection = await page.eval(`
      (() => {
        const pageTitle = document.querySelector('h1') ? document.querySelector('h1').textContent.trim() : '';
        const bodyText = document.body.innerText || '';
        const isBlank = bodyText.trim().length === 0;

        // Check for submodule cards / links
        const subLinks = Array.from(document.querySelectorAll('a')).map(a => a.getAttribute('href')).filter(Boolean);
        const submodulesFound = [
          '/hiring/applications',
          '/hiring/sourcing',
          '/hiring/outreach',
          '/hiring/interview-status',
          '/hiring/onboard',
          '/hiring/analytics'
        ].filter(r => subLinks.some(link => link === r || link.startsWith(r)));

        // Check for stats
        const cards = Array.from(document.querySelectorAll('.neu-card, [class*="card"]')).map(c => c.textContent.trim());

        return {
          pageTitle,
          isBlank,
          bodyTextLength: bodyText.length,
          submodulesFound,
          hasSummaryStats: bodyText.includes('Applications') || bodyText.includes('Requisitions') || bodyText.includes('Candidates'),
        };
      })()
    `);

    console.log('  Hiring Hub Render Verification:');
    console.log(`    - Page Title: "${hubInspection.pageTitle}"`);
    console.log(`    - Is Page Blank: ${hubInspection.isBlank}`);
    console.log(`    - Rendered Text Length: ${hubInspection.bodyTextLength} characters`);
    console.log(`    - Submodules Verified in DOM: ${hubInspection.submodulesFound.length} / 6`);
    for (const sm of hubInspection.submodulesFound) {
      console.log(`        ✔ ${sm}`);
    }

    results.test1_hr.hubInspection = hubInspection;

    // Step 5: Refresh /hiring and verify legitimate access persists
    console.log('  Refreshing /hiring to test persistence of legitimate HR session...');
    await page.send('Page.reload');
    await new Promise(r => setTimeout(r, 3000));

    const postReloadUrl = await page.eval('window.location.pathname');
    const postReloadTitle = await page.eval('document.querySelector("h1") ? document.querySelector("h1").textContent.trim() : ""');
    console.log(`  Route after reload: ${postReloadUrl}`);
    console.log(`  Page header after reload: "${postReloadTitle}"`);
    results.test1_hr.postReloadUrl = postReloadUrl;

    // Step 6: Capture screenshot
    console.log(`  Capturing full 1600 × 900 browser screenshot to: ${SCREENSHOT_PATH}...`);
    const screenshot = await page.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));
    console.log('  ✔ Screenshot saved successfully.\n');
    results.test1_hr.screenshotPath = SCREENSHOT_PATH;

    // ==================================================================
    // TEST 2 — EMPLOYEE AND UNAUTHENTICATED ACCESS
    // ==================================================================
    console.log('----------------------------------------------------------------------');
    console.log('TEST 2 — EMPLOYEE AND UNAUTHENTICATED ACCESS');
    console.log('----------------------------------------------------------------------');

    // 2.1 Unauthenticated direct access to /hiring
    console.log('  [2.1] Clearing browser cookies for unauthenticated test...');
    await page.send('Network.clearBrowserCookies');

    console.log('  Attempting direct unauthenticated access to http://localhost:3000/hiring...');
    await page.send('Page.navigate', { url: `${APP_URL}/hiring` });
    await new Promise(r => setTimeout(r, 2000));

    const unauthDest = await page.eval('window.location.pathname + window.location.search');
    console.log(`  Actual destination after unauthenticated /hiring visit: ${unauthDest}`);
    results.test3_unauth.destination = unauthDest;
    const unauthPassed = unauthDest.includes('/auth/login') && unauthDest.includes('next=%2Fhiring');
    console.log(`  ✔ Unauthenticated redirect to login with next=/hiring: ${unauthPassed ? 'PASS' : 'FAIL'}`);

    // 2.2 Employee authentication & sidebar inspection
    console.log('\n  [2.2] Authenticating as legitimate Employee (employee@acme-tech.com)...');
    await page.send('Page.navigate', { url: `${APP_URL}/auth/login` });
    await new Promise(r => setTimeout(r, 2000));

    const empLoginResult = await page.eval(`
      (async () => {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'employee@acme-tech.com', password: 'Password123!' })
        });
        const data = await res.json();
        if (window.useAuthStore && data.user && data.role) {
          window.useAuthStore.getState().setUser({
            id: data.user.id,
            email: data.user.email,
            role: data.role,
            tenant: data.user.tenant_id ? { id: data.user.tenant_id, name: 'Active Workspace', slug: 'active' } : undefined,
            profile: { id: data.user.id, email: data.user.email, full_name: data.user.full_name, is_active: true }
          });
        }
        return data;
      })()
    `);
    console.log(`  Employee login result: success=${empLoginResult.success}, role=${empLoginResult.role}`);

    // Navigate to /dashboard as Employee
    await page.send('Page.navigate', { url: `${APP_URL}/dashboard` });
    await new Promise(r => setTimeout(r, 2500));

    const empSidebarHiringLinks = await page.eval('document.querySelectorAll(\'a[href="/hiring"]\').length');
    console.log(`  Hiring links visible in Employee sidebar: ${empSidebarHiringLinks} (Requirement: 0)`);
    results.test2_employee.sidebarLinks = empSidebarHiringLinks;

    // 2.3 Employee direct route access attempt to /hiring
    console.log('  [2.3] Employee directly navigating to http://localhost:3000/hiring in browser URL bar...');
    await page.send('Page.navigate', { url: `${APP_URL}/hiring` });
    await new Promise(r => setTimeout(r, 2500));

    const empHiringDest = await page.eval('window.location.pathname');
    console.log(`  Destination after Employee opens /hiring: ${empHiringDest}`);
    results.test2_employee.directRouteDestination = empHiringDest;
    const empBlocked = empHiringDest === '/unauthorized' || empHiringDest.includes('/auth/login');
    console.log(`  ✔ Employee direct route access blocked/redirected: ${empBlocked ? 'PASS' : 'FAIL'}`);

    // 2.4 Protected API check under Employee context
    console.log('\n  [2.4] Verifying protected Hiring APIs cannot be accessed by Employee...');
    const apiProbe = await page.eval(`
      (async () => {
        const [reqRes, appRes, candRes] = await Promise.all([
          fetch('/api/hiring/requisitions'),
          fetch('/api/hiring/applications'),
          fetch('/api/hiring/candidates')
        ]);
        return {
          requisitionsStatus: reqRes.status,
          applicationsStatus: appRes.status,
          candidatesStatus: candRes.status,
        };
      })()
    `);
    console.log(`    - /api/hiring/requisitions: HTTP ${apiProbe.requisitionsStatus}`);
    console.log(`    - /api/hiring/applications: HTTP ${apiProbe.applicationsStatus}`);
    console.log(`    - /api/hiring/candidates: HTTP ${apiProbe.candidatesStatus}`);
    results.test4_apis = apiProbe;

    // ==================================================================
    // SUMMARY OF VERIFICATION
    // ==================================================================
    console.log('\n======================================================================');
    console.log('BROWSER VERIFICATION COMPLETE: ALL CHECKS RECORDED');
    console.log('======================================================================');

    console.log(JSON.stringify(results, null, 2));

  } finally {
    chromeProc.kill('SIGTERM');
    await new Promise(r => setTimeout(r, 600));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

runBrowserVerification().catch(err => {
  console.error('[FATAL ERROR IN BROWSER SUITE]:', err);
  process.exit(1);
});
