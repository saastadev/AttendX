// ============================================================
// AttendX Module 4 — Responsive Hiring Visibility Measurement
// Tests Viewports: 1600x900, 1366x768, 1280x720
// Measures Bounding Rects, Scroll Containers, Parent Clipping, Click Navigation
// ============================================================

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_URL = 'http://localhost:3000';
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

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

async function testSingleViewport(width, height, labelSuffix = '') {
  console.log(`\n======================================================================`);
  console.log(`TESTING VIEWPORT: ${width} × ${height} (${labelSuffix || 'Baseline'})`);
  console.log(`======================================================================`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `attendx-vp-${width}x${height}-`));
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--remote-allow-origins=*',
    `--user-data-dir=${tmpDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--window-size=${width},${height}`,
    'about:blank',
  ], { stdio: 'ignore' });

  let ws = null;
  try {
    let ver = null;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch('http://127.0.0.1:9222/json/version');
        ver = await res.json();
        if (ver && ver.webSocketDebuggerUrl) break;
      } catch {
        await new Promise(r => setTimeout(r, 200));
      }
    }
    if (!ver) throw new Error('Chrome remote debugging did not respond');

    ws = new WebSocket(ver.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });

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

    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Network.enable');

    await page.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });

    // 1. Authenticate as HR
    await page.send('Page.navigate', { url: `${APP_URL}/auth/login` });
    await new Promise(r => setTimeout(r, 2000));

    await page.eval(`
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

    // 2. Navigate to Dashboard
    await page.send('Page.navigate', { url: `${APP_URL}/dashboard` });
    await new Promise(r => setTimeout(r, 3000));

    // 3. Perform detailed measurements
    const measurement = await page.eval(`
      (() => {
        const vp = {
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
        };

        const sidebar = document.querySelector('.neu-sidebar');
        const sidebarInfo = sidebar ? {
          found: true,
          tagName: sidebar.tagName,
          clientHeight: sidebar.clientHeight,
          scrollHeight: sidebar.scrollHeight,
          scrollTop: sidebar.scrollTop,
          overflowY: window.getComputedStyle(sidebar).overflowY,
          hasScrollContainer: window.getComputedStyle(sidebar).overflowY === 'auto' || window.getComputedStyle(sidebar).overflowY === 'scroll',
          isActuallyScrollable: sidebar.scrollHeight > sidebar.clientHeight,
          rect: {
            top: sidebar.getBoundingClientRect().top,
            bottom: sidebar.getBoundingClientRect().bottom,
            height: sidebar.getBoundingClientRect().height,
          }
        } : { found: false };

        const hiringLink = document.querySelector('a[href="/hiring"]');
        if (!hiringLink) {
          return { vp, sidebarInfo, hiringFound: false };
        }

        const rect = hiringLink.getBoundingClientRect();
        const parentGroup = hiringLink.closest('div[role="group"]');
        const sectionLabel = parentGroup ? parentGroup.getAttribute('aria-label') : null;

        // Parent clipping inspection: check all ancestors up to document.body
        const clippingAncestors = [];
        let curr = hiringLink.parentElement;
        let isClipped = false;

        while (curr && curr !== document.body) {
          const style = window.getComputedStyle(curr);
          const oX = style.overflowX;
          const oY = style.overflowY;
          if (oX !== 'visible' || oY !== 'visible') {
            const pRect = curr.getBoundingClientRect();
            const clippedTop = rect.top < pRect.top;
            const clippedBottom = rect.bottom > pRect.bottom;
            const clippedLeft = rect.left < pRect.left;
            const clippedRight = rect.right > pRect.right;
            const clipped = clippedTop || clippedBottom || clippedLeft || clippedRight;
            if (clipped) isClipped = true;
            clippingAncestors.push({
              tag: curr.tagName.toLowerCase(),
              className: curr.className,
              overflowX: oX,
              overflowY: oY,
              pRect: { top: pRect.top, bottom: pRect.bottom, height: pRect.height },
              clipped,
              clippedTop,
              clippedBottom
            });
          }
          curr = curr.parentElement;
        }

        // Visible without scrolling calculation:
        // Link must be inside window bounds (0 <= top && bottom <= innerHeight)
        // AND not clipped by any scrolling parent container at current scrollTop
        const withinWindowViewport = rect.top >= 0 && rect.bottom <= vp.innerHeight;
        const visibleWithoutScroll = withinWindowViewport && !isClipped;

        return {
          vp,
          sidebarInfo,
          hiringFound: true,
          label: hiringLink.textContent.trim(),
          section: sectionLabel,
          rect: {
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
            width: rect.width,
            height: rect.height,
          },
          withinWindowViewport,
          isClipped,
          visibleWithoutScroll,
          clippingAncestors,
        };
      })()
    `);

    console.log('Measurements:');
    console.log(`  Window: ${measurement.vp.innerWidth} × ${measurement.vp.innerHeight}`);
    console.log(`  Sidebar Container:`, measurement.sidebarInfo);
    console.log(`  Hiring Link Found: ${measurement.hiringFound}`);
    if (measurement.hiringFound) {
      console.log(`  Section: "${measurement.section}", Label: "${measurement.label}"`);
      console.log(`  Bounding Rect:`, measurement.rect);
      console.log(`  Within Window Viewport (0..${height}): ${measurement.withinWindowViewport}`);
      console.log(`  Is Clipped by Ancestor: ${measurement.isClipped}`);
      console.log(`  Visible Without Scrolling: ${measurement.visibleWithoutScroll}`);
      if (measurement.clippingAncestors.length > 0) {
        console.log(`  Clipping Ancestors:`, JSON.stringify(measurement.clippingAncestors, null, 2));
      }
    }

    // 4. Test Click Navigation to /hiring
    console.log('\nTesting click navigation to /hiring...');
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
    await new Promise(r => setTimeout(r, 3500));

    const navigatedRoute = await page.eval('window.location.pathname');
    const pageHeader = await page.eval('document.querySelector("h1") ? document.querySelector("h1").textContent.trim() : ""');
    console.log(`  Navigated Route: ${navigatedRoute} (Expected: /hiring)`);
    console.log(`  Page Header: "${pageHeader}"`);

    // 5. Save Screenshot
    const screenshotName = `attendx-hiring-hr-${width}x${height}${labelSuffix ? '-' + labelSuffix : ''}.png`;
    const screenshotPath = path.resolve(screenshotName);
    const screenshot = await page.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
    console.log(`  Screenshot saved to: ${screenshotPath}`);

    return {
      width,
      height,
      measurement,
      navigatedRoute,
      pageHeader,
      screenshotPath,
      success: measurement.hiringFound && navigatedRoute === '/hiring' && measurement.visibleWithoutScroll,
    };
  } finally {
    if (ws) ws.close();
    chromeProc.kill('SIGKILL');
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_err) {
      // Ignore temporary directory cleanup error
    }
  }
}

async function main() {
  const viewports = [
    { width: 1600, height: 900 },
    { width: 1366, height: 768 },
    { width: 1280, height: 720 },
  ];

  const results = [];
  for (const vp of viewports) {
    try {
      const res = await testSingleViewport(vp.width, vp.height, 'initial');
      results.push(res);
    } catch (err) {
      console.error(`Error testing ${vp.width}x${vp.height}:`, err);
      results.push({ width: vp.width, height: vp.height, error: err.message, success: false });
    }
  }

  console.log('\n======================================================================');
  console.log('INITIAL SUMMARY:');
  console.log('======================================================================');
  for (const r of results) {
    if (r.error) {
      console.log(`❌ ${r.width}x${r.height}: ERROR - ${r.error}`);
    } else {
      console.log(`${r.measurement.visibleWithoutScroll ? '✔' : '❌'} ${r.width}x${r.height}: Top=${r.measurement.rect?.top}px, Bottom=${r.measurement.rect?.bottom}px, Visible=${r.measurement.visibleWithoutScroll}, Navigated=${r.navigatedRoute}`);
    }
  }

  fs.writeFileSync(path.resolve('initial-measurements.json'), JSON.stringify(results, null, 2));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
