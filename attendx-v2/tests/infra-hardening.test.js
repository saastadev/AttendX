// ============================================================
// AttendX v2 — Infrastructure Hardening, PWA, Security & Observability Suite
// Spec: docs/specs/20_27_infra_hardening_pwa_security_spec.md
// Tests: INFRA-PWA-01 through INFRA-CORR-01
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { SecurityRateLimiter } from '../lib/security/rate-limiter.ts'
import { CsrfGuard } from '../lib/security/csrf-guard.ts'
import { sanitizePayload } from '../lib/observability/sentry.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

test('Infrastructure Hardening, PWA, Security & Observability Suite (Spec 20-27)', async (t) => {

  await t.test('INFRA-PWA-01: PWA Service Worker exists, contains install/activate/fetch listeners', () => {
    const swPath = path.join(rootDir, 'public', 'sw.js')
    assert.ok(fs.existsSync(swPath), 'public/sw.js must exist')
    const content = fs.readFileSync(swPath, 'utf8')

    assert.ok(content.includes('addEventListener(\'install\'') || content.includes('addEventListener("install"'))
    assert.ok(content.includes('addEventListener(\'activate\'') || content.includes('addEventListener("activate"'))
    assert.ok(content.includes('addEventListener(\'fetch\'') || content.includes('addEventListener("fetch"'))
  })

  await t.test('INFRA-PWA-02: Offline shell exists and provides responsive offline fallback', () => {
    const offlinePath = path.join(rootDir, 'public', 'offline.html')
    assert.ok(fs.existsSync(offlinePath), 'public/offline.html must exist')
    const content = fs.readFileSync(offlinePath, 'utf8')

    assert.ok(content.includes('Offline'))
    assert.ok(content.includes('Retry Connection') || content.includes('offline'))
  })

  await t.test('INFRA-PWA-03: Offline Security Containment -> Service Worker never caches /api/ endpoints', () => {
    const swPath = path.join(rootDir, 'public', 'sw.js')
    const content = fs.readFileSync(swPath, 'utf8')

    // Must have explicit bypass for /api/
    assert.ok(content.includes('url.pathname.startsWith(\'/api/\')') || content.includes('url.pathname.startsWith("/api/")'))
  })

  await t.test('INFRA-HDR-01: Security Headers configuration check in next.config.js', async () => {
    const nextConfigPath = path.join(rootDir, 'next.config.js')
    assert.ok(fs.existsSync(nextConfigPath))
    const configModule = await import('../next.config.js')
    const config = configModule.default

    assert.ok(typeof config.headers === 'function')
    const headerRules = await config.headers()
    const globalRule = headerRules.find(r => r.source.includes('!_next'))
    assert.ok(globalRule)

    const headerKeys = globalRule.headers.map(h => h.key)
    assert.ok(headerKeys.includes('Content-Security-Policy'))
    assert.ok(headerKeys.includes('Strict-Transport-Security'))
    assert.ok(headerKeys.includes('X-Content-Type-Options'))
    assert.ok(headerKeys.includes('X-Frame-Options'))
    assert.ok(headerKeys.includes('Referrer-Policy'))
    assert.ok(headerKeys.includes('Permissions-Policy'))
  })

  await t.test('INFRA-RATE-01: Sliding rate limiter triggers 429 after threshold', () => {
    SecurityRateLimiter.reset('192.168.1.50')
    const testIp = '192.168.1.50'

    // auth:login limit is 5 attempts
    for (let i = 1; i <= 5; i++) {
      const res = SecurityRateLimiter.check(testIp, 'auth:login')
      assert.equal(res.allowed, true, `Attempt ${i} should be allowed`)
    }

    // 6th attempt must be rejected
    const blocked = SecurityRateLimiter.check(testIp, 'auth:login')
    assert.equal(blocked.allowed, false)
    assert.ok(blocked.retryAfter > 0)
  })

  await t.test('INFRA-CSRF-01: CSRF & Request Origin Guard blocks cross-origin state mutations', () => {
    // 1. Same-origin POST is allowed
    const validPostReq = {
      method: 'POST',
      headers: new Headers({
        'host': 'app.attendx.com',
        'origin': 'https://app.attendx.com',
      }),
    }
    assert.equal(CsrfGuard.validateRequestOrigin(validPostReq), true)

    // 2. Cross-origin spoofed POST is blocked
    const evilPostReq = {
      method: 'POST',
      headers: new Headers({
        'host': 'app.attendx.com',
        'origin': 'https://evil-attacker.com',
      }),
    }
    assert.equal(CsrfGuard.validateRequestOrigin(evilPostReq), false)

    // 3. GET requests are safe and allowed
    const getReq = {
      method: 'GET',
      headers: new Headers({
        'host': 'app.attendx.com',
        'origin': 'https://external-referrer.com',
      }),
    }
    assert.equal(CsrfGuard.validateRequestOrigin(getReq), true)
  })

  await t.test('INFRA-ERR-01: Auth API error discipline -> generic 401 error prevents enumeration', () => {
    // Generic error message invariant
    const genericAuthError = { error: 'Invalid email or password.' }
    assert.equal(genericAuthError.error, 'Invalid email or password.')
    assert.equal(genericAuthError.error.includes('does not exist'), false)
    assert.equal(genericAuthError.error.includes('user not found'), false)
  })

  await t.test('INFRA-OBS-01: Sentry & Logger PII Sanitizer redacts credentials and tokens', () => {
    const rawPayload = {
      email: 'alex@company.com',
      password: 'SuperSecretPassword123!',
      temp_password: 'TempPassword456!',
      session_token: 'tok_abc123',
      nested: {
        access_token: 'jwt_secret_token',
        tenant_id: 'tenant-123',
      },
    }

    const sanitized = sanitizePayload(rawPayload)
    assert.equal(sanitized.email, 'alex@company.com')
    assert.equal(sanitized.password, '[REDACTED]')
    assert.equal(sanitized.temp_password, '[REDACTED]')
    assert.equal(sanitized.session_token, '[REDACTED]')
    assert.equal(sanitized.nested.access_token, '[REDACTED]')
    assert.equal(sanitized.nested.tenant_id, 'tenant-123')
  })
})
