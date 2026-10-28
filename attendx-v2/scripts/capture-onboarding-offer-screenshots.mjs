// ============================================================
// AttendX v2 — Browser Automation & CDP Screenshot Verification
// Captures authentic visual proof for:
// 1. Onboarding & Digital Offers dashboard (/hiring/onboard)
// 2. Release Official Job Offer modal for Rohan Verma
// 3. Offer Released successfully with generated candidate portal link
// 4. Document preview: Aadhaar Card (doc-001)
// 5. Document preview: PAN Card (doc-002)
// 6. Document preview: Degree Certificate (doc-003)
// ============================================================

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_URL = 'http://localhost:3000';
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ARTIFACT_DIR = '/Users/nanthithavenkatachapathy/.gemini/antigravity-cli/brain/f8b9dc2a-6f15-4f5c-b80b-3e2642b7b9f9';

const DASHBOARD_SCREENSHOT = path.join(ARTIFACT_DIR, 'MODULE_4_ONBOARDING_DASHBOARD.png');
const MODAL_SCREENSHOT = path.join(ARTIFACT_DIR, 'MODULE_4_OFFER_RELEASE_MODAL.png');
const SUCCESS_SCREENSHOT = path.join(ARTIFACT_DIR, 'MODULE_4_OFFER_RELEASED_SUCCESS.png');
const AADHAAR_SCREENSHOT = path.join(ARTIFACT_DIR, 'MODULE_4_DOCUMENT_PREVIEW_AADHAAR.png');
const PAN_SCREENSHOT = path.join(ARTIFACT_DIR, 'MODULE_4_DOCUMENT_PREVIEW_PAN.png');
const DEGREE_SCREENSHOT = path.join(ARTIFACT_DIR, 'MODULE_4_DOCUMENT_PREVIEW_DEGREE.png');

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
          if (msg.error) reject(new Error(msg.error.message));
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
    return res.result?.value;
  }
}

async function run() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-onboard-'));
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9226',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${tmpDir}`,
    '--window-size=1600,1000',
    'about:blank',
  ], { stdio: 'ignore' });

  try {
    let wsUrl = null;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch('http://127.0.0.1:9226/json/version');
        if (res.ok) {
          const data = await res.json();
          wsUrl = data.webSocketDebuggerUrl;
          break;
        }
      } catch {
        // Retry
      }
      await new Promise(r => setTimeout(r, 200));
    }

    if (!wsUrl) throw new Error('Could not connect to Chrome debugging port 9226');

    const ws = new WebSocket(wsUrl);
    await new Promise(r => ws.onopen = r);

    let sendId = 1;
    function sendRoot(method, params = {}) {
      const curId = sendId++;
      return new Promise((resolve, reject) => {
        const handler = (event) => {
          const msg = JSON.parse(event.data);
          if (msg.id === curId) {
            ws.removeEventListener('message', handler);
            if (msg.error) reject(new Error(msg.error.message));
            else resolve(msg.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id: curId, method, params }));
      });
    }

    const { targetId } = await sendRoot('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await sendRoot('Target.attachToTarget', { targetId, flatten: true });
    const page = new CDPSession(ws, sessionId);

    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 1600,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });

    // 1. Authenticate via login
    console.log('1. Navigating to login...');
    await page.send('Page.navigate', { url: `${APP_URL}/auth/login` });
    await new Promise(r => setTimeout(r, 2000));

    console.log('Authenticating as HR user...');
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

    // 2. Navigate to /hiring/onboard
    console.log('2. Navigating to /hiring/onboard...');
    await page.send('Page.navigate', { url: `${APP_URL}/hiring/onboard` });
    await new Promise(r => setTimeout(r, 3500));

    // Capture initial onboarding dashboard
    console.log('Capturing Onboarding Dashboard screenshot...');
    const { data: dashB64 } = await page.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(DASHBOARD_SCREENSHOT, Buffer.from(dashB64, 'base64'));
    console.log(`Saved dashboard screenshot: ${DASHBOARD_SCREENSHOT}`);

    // 3. Open Release Offer Modal for Rohan Verma
    console.log('3. Opening Release Offer modal...');
    await page.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const releaseBtn = btns.find(b => b.textContent.includes('Release Offer'));
        if (releaseBtn) releaseBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 1500));

    // Capture modal screenshot
    console.log('Capturing Release Offer Modal screenshot...');
    const { data: modalB64 } = await page.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(MODAL_SCREENSHOT, Buffer.from(modalB64, 'base64'));
    console.log(`Saved modal screenshot: ${MODAL_SCREENSHOT}`);

    // 4. Click Extend Offer to submit mutation
    console.log('4. Extending official offer...');
    const clickResult = await page.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const extendBtn = btns.find(b => b.textContent.includes('Confirm & Release Offer') || b.textContent.includes('Release Official Job Offer') || b.textContent.includes('Extend'));
        if (extendBtn) {
          extendBtn.click();
          return 'clicked: ' + extendBtn.textContent.trim();
        }
        return 'not-found';
      })()
    `);
    console.log('Submit button click result:', clickResult);
    // Wait for the mutation to finish and the generated portal link to display
    await new Promise(r => setTimeout(r, 4000));

    // Capture success state screenshot (showing portal link)
    console.log('Capturing Offer Released Success screenshot...');
    const { data: successB64 } = await page.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(SUCCESS_SCREENSHOT, Buffer.from(successB64, 'base64'));
    console.log(`Saved success screenshot: ${SUCCESS_SCREENSHOT}`);

    // 5. Document Previews
    console.log('5. Capturing Aadhaar Document Preview...');
    await page.send('Page.navigate', { url: `${APP_URL}/api/hiring/onboarding/documents/doc-001/preview` });
    await new Promise(r => setTimeout(r, 1500));
    const { data: aadhaarB64 } = await page.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(AADHAAR_SCREENSHOT, Buffer.from(aadhaarB64, 'base64'));
    console.log(`Saved Aadhaar screenshot: ${AADHAAR_SCREENSHOT}`);

    console.log('6. Capturing PAN Document Preview...');
    await page.send('Page.navigate', { url: `${APP_URL}/api/hiring/onboarding/documents/doc-002/preview` });
    await new Promise(r => setTimeout(r, 1500));
    const { data: panB64 } = await page.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(PAN_SCREENSHOT, Buffer.from(panB64, 'base64'));
    console.log(`Saved PAN screenshot: ${PAN_SCREENSHOT}`);

    console.log('7. Capturing Degree Document Preview...');
    await page.send('Page.navigate', { url: `${APP_URL}/api/hiring/onboarding/documents/doc-003/preview` });
    await new Promise(r => setTimeout(r, 1500));
    const { data: degreeB64 } = await page.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(DEGREE_SCREENSHOT, Buffer.from(degreeB64, 'base64'));
    console.log(`Saved Degree screenshot: ${DEGREE_SCREENSHOT}`);

    ws.close();
    console.log('All browser verification screenshots captured successfully!');
  } finally {
    chrome.kill('SIGKILL');
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  }
}

run().catch(console.error);
