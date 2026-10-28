// ============================================================
// AttendX v2 — Browser Automation & CDP Screenshot Verification
// Captures authentic visual proof for:
// 1. Outreach Campaigns Tab (/hiring/outreach)
// 2. New Campaign Creation Modal
// 3. Templates Tab with Handlebars Live Preview
// 4. Dispatch Outreach Message Modal
// 5. Delivery & Responses Tab with Authoritative Records
// ============================================================

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_URL = 'http://localhost:3000';
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ARTIFACT_DIR = '/Users/nanthithavenkatachapathy/.gemini/antigravity-cli/brain/f8b9dc2a-6f15-4f5c-b80b-3e2642b7b9f9';

const CAMPAIGNS_SCREENSHOT = path.join(ARTIFACT_DIR, 'MODULE_4_OUTREACH_CAMPAIGNS.png');
const CAMPAIGN_MODAL_SCREENSHOT = path.join(ARTIFACT_DIR, 'MODULE_4_OUTREACH_CAMPAIGN_MODAL.png');
const TEMPLATES_PREVIEW_SCREENSHOT = path.join(ARTIFACT_DIR, 'MODULE_4_OUTREACH_TEMPLATES_PREVIEW.png');
const DISPATCH_MODAL_SCREENSHOT = path.join(ARTIFACT_DIR, 'MODULE_4_OUTREACH_DISPATCH_MODAL.png');
const DELIVERY_RESPONSES_SCREENSHOT = path.join(ARTIFACT_DIR, 'MODULE_4_OUTREACH_DELIVERY_RESPONSES.png');

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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-outreach-'));
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9227',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${tmpDir}`,
    '--window-size=1600,1050',
    'about:blank',
  ], { stdio: 'ignore' });

  try {
    let wsUrl = null;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch('http://127.0.0.1:9227/json/version');
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

    if (!wsUrl) throw new Error('Could not connect to Chrome debugging port 9227');

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
      height: 1050,
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

    // 2. Navigate to /hiring/outreach (Campaigns Tab by default)
    console.log('2. Navigating to /hiring/outreach...');
    await page.send('Page.navigate', { url: `${APP_URL}/hiring/outreach` });
    await new Promise(r => setTimeout(r, 3500));

    // Capture Campaigns tab
    console.log('Capturing Campaigns Tab screenshot...');
    const { data: campB64 } = await page.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(CAMPAIGNS_SCREENSHOT, Buffer.from(campB64, 'base64'));
    console.log(`Saved Campaigns screenshot: ${CAMPAIGNS_SCREENSHOT}`);

    // 3. Open New Campaign Modal
    console.log('3. Opening New Campaign modal...');
    await page.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const newCampBtn = btns.find(b => b.textContent.includes('New Campaign'));
        if (newCampBtn) newCampBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 1200));

    console.log('Capturing New Campaign Modal screenshot...');
    const { data: campModalB64 } = await page.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(CAMPAIGN_MODAL_SCREENSHOT, Buffer.from(campModalB64, 'base64'));
    console.log(`Saved Campaign Modal screenshot: ${CAMPAIGN_MODAL_SCREENSHOT}`);

    // Close modal (hit Cancel)
    await page.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const cancelBtn = btns.find(b => b.textContent.trim() === 'Cancel');
        if (cancelBtn) cancelBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 800));

    // 4. Switch to Templates Tab
    console.log('4. Switching to Templates tab...');
    await page.eval(`
      (() => {
        const tabs = Array.from(document.querySelectorAll('button'));
        const tplTab = tabs.find(b => b.textContent.includes('Templates'));
        if (tplTab) tplTab.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 2000));

    console.log('Capturing Templates Tab Live Preview screenshot...');
    const { data: tplB64 } = await page.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(TEMPLATES_PREVIEW_SCREENSHOT, Buffer.from(tplB64, 'base64'));
    console.log(`Saved Templates Preview screenshot: ${TEMPLATES_PREVIEW_SCREENSHOT}`);

    // 5. Open Dispatch Message Modal
    console.log('5. Opening Dispatch Message modal...');
    await page.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const sendBtn = btns.find(b => b.textContent.includes('Dispatch Message') || b.textContent.includes('Send Message'));
        if (sendBtn) sendBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 1200));

    console.log('Capturing Dispatch Outreach Message Modal screenshot...');
    const { data: dispatchModalB64 } = await page.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(DISPATCH_MODAL_SCREENSHOT, Buffer.from(dispatchModalB64, 'base64'));
    console.log(`Saved Dispatch Modal screenshot: ${DISPATCH_MODAL_SCREENSHOT}`);

    // Close modal
    await page.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const cancelBtn = btns.find(b => b.textContent.trim() === 'Cancel');
        if (cancelBtn) cancelBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 800));

    // 6. Switch to Delivery & Responses Tab
    console.log('6. Switching to Delivery & Responses tab...');
    await page.eval(`
      (() => {
        const tabs = Array.from(document.querySelectorAll('button'));
        const delTab = tabs.find(b => b.textContent.includes('Delivery & Responses'));
        if (delTab) delTab.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 2000));

    console.log('Capturing Delivery & Responses screenshot...');
    const { data: delB64 } = await page.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(DELIVERY_RESPONSES_SCREENSHOT, Buffer.from(delB64, 'base64'));
    console.log(`Saved Delivery & Responses screenshot: ${DELIVERY_RESPONSES_SCREENSHOT}`);

    console.log('All 5 screenshots captured successfully!');
  } finally {
    try {
      chrome.kill('SIGKILL');
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Cleanup
    }
  }
}

run().catch((err) => {
  console.error('Fatal screenshot runner error:', err);
  process.exit(1);
});
