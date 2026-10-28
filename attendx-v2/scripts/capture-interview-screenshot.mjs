import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_URL = 'http://localhost:3000';
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ARTIFACT_DIR = '/Users/nanthithavenkatachapathy/.gemini/antigravity-cli/brain/f8b9dc2a-6f15-4f5c-b80b-3e2642b7b9f9';
const SCREENSHOT_PATH = path.join(ARTIFACT_DIR, 'interview-status-structured-scheduling.png');

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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-interview-status-'));
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9225',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${tmpDir}`,
    '--window-size=1600,1000',
    'about:blank',
  ], { stdio: 'ignore' });

  try {
    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch('http://127.0.0.1:9225/json/version');
        if (res.ok) {
          const data = await res.json();
          wsUrl = data.webSocketDebuggerUrl;
          break;
        }
      } catch {
        // Retry connection
      }
      await new Promise(r => setTimeout(r, 200));
    }

    if (!wsUrl) throw new Error('Could not connect to Chrome debugging port 9225');

    const ws = new WebSocket(wsUrl);
    await new Promise(r => ws.onopen = r);

    let sendId = 1;
    function sendRoot(method, params = {}) {
      const curId = sendId++;
      return new Promise((resolve) => {
        const handler = (event) => {
          const msg = JSON.parse(event.data);
          if (msg.id === curId) {
            ws.removeEventListener('message', handler);
            resolve(msg.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id: curId, method, params }));
      });
    }

    const { targetId } = await sendRoot('Target.createTarget', { url: `${APP_URL}/auth/login` });
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

    await page.send('Page.navigate', { url: `${APP_URL}/auth/login` });
    await new Promise(r => setTimeout(r, 2000));

    // Authenticate Carol HR
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

    // Navigate to /hiring/interview-status
    console.log('Navigating to /hiring/interview-status...');
    await page.send('Page.navigate', { url: `${APP_URL}/hiring/interview-status` });
    await new Promise(r => setTimeout(r, 3500));

    // Click Schedule Round 1 button
    console.log('Clicking Schedule Round 1...');
    await page.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const schedBtn = btns.find(b => b.textContent.includes('Schedule Round 1') || b.textContent.includes('Schedule Interview'));
        if (schedBtn) schedBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 800));

    // Fill Google Meet link and confirm schedule
    console.log('Filling Schedule Modal and submitting...');
    await page.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const confirmBtn = btns.find(b => b.textContent.includes('Confirm & Schedule'));
        if (confirmBtn) confirmBtn.click();
      })()
    `);
    // Capture modal screenshot
    const MODAL_SCREENSHOT = path.join(ARTIFACT_DIR, 'interview-schedule-modal.png');
    const { data: modalB64 } = await page.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(MODAL_SCREENSHOT, Buffer.from(modalB64, 'base64'));
    console.log(`Saved modal screenshot to ${MODAL_SCREENSHOT}`);

    // Close modal to see full scheduled page
    console.log('Closing schedule modal...');
    await page.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const cancelBtn = btns.find(b => b.textContent === 'Cancel');
        if (cancelBtn) cancelBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 1000));

    // Capture screenshot after closing modal
    const { data: b64 } = await page.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(b64, 'base64'));
    console.log(`Saved unobstructed screenshot to ${SCREENSHOT_PATH}`);

    ws.close();
  } finally {
    chrome.kill('SIGKILL');
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  }
}

run().catch(console.error);
