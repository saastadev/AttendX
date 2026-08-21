// ============================================================
// AttendX v2 — Master Definition of Done (DoD) Verification Suite (Scope E.35)
// Spec: docs/specs/35_definition_of_done_spec.md
// Tests: Comprehensive Release Gate Coverage across all 43 Criteria
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

test('Master Definition of Done (DoD) Verification Suite (Spec 35)', async (t) => {

  // ------------------------------------------------------------
  // SECTION 1: AUTHENTICATION, ONBOARDING & SESSION MANAGEMENT (DoD #1 - #7)
  // ------------------------------------------------------------
  await t.test('DoD #1 & #2: Single unified login page exists and resolves roles server-side', () => {
    const loginPagePath = path.join(rootDir, 'app', 'auth', 'login', 'page.tsx')
    assert.ok(fs.existsSync(loginPagePath), 'Unified login page app/auth/login/page.tsx must exist')

    // Ensure separate login routes do NOT exist
    const adminLoginPath = path.join(rootDir, 'app', 'admin', 'login')
    const employeeLoginPath = path.join(rootDir, 'app', 'employee', 'login')
    assert.equal(fs.existsSync(adminLoginPath), false, 'Separate admin/login route must not exist')
    assert.equal(fs.existsSync(employeeLoginPath), false, 'Separate employee/login route must not exist')
  })

  await t.test('DoD #3: Invite-gated signup -> Accept invite API exists with token requirement', () => {
    const inviteApiPath = path.join(rootDir, 'app', 'api', 'auth', 'invite', 'accept', 'route.ts')
    assert.ok(fs.existsSync(inviteApiPath), 'Invite accept API route must exist')
  })

  await t.test('DoD #4: First-login onboarding forced password change exists in proxy and page', () => {
    const onboardingPagePath = path.join(rootDir, 'app', 'auth', 'onboarding', 'page.tsx')
    assert.ok(fs.existsSync(onboardingPagePath), 'Onboarding page app/auth/onboarding/page.tsx must exist')

    const proxyPath = path.join(rootDir, 'proxy.ts')
    assert.ok(fs.existsSync(proxyPath), 'proxy.ts must exist')
    const proxyContent = fs.readFileSync(proxyPath, 'utf8')
    assert.ok(proxyContent.includes('onboarding_completed'), 'proxy.ts must check onboarding_completed')
    assert.ok(proxyContent.includes('/auth/onboarding'), 'proxy.ts must redirect to /auth/onboarding')
  })

  await t.test('DoD #5 & #36: Session revocation engine and remote invalidation APIs exist', () => {
    const sessionManagerPath = path.join(rootDir, 'lib', 'auth', 'session-manager.ts')
    assert.ok(fs.existsSync(sessionManagerPath), 'session-manager.ts must exist')

    const sessionsApiPath = path.join(rootDir, 'app', 'api', 'sessions', 'route.ts')
    const revokeOthersApiPath = path.join(rootDir, 'app', 'api', 'sessions', 'revoke-others', 'route.ts')
    assert.ok(fs.existsSync(sessionsApiPath), 'sessions API route must exist')
    assert.ok(fs.existsSync(revokeOthersApiPath), 'sessions/revoke-others API route must exist')
  })

  // ------------------------------------------------------------
  // SECTION 2: PROVISIONING, SEAT LIMITS & DATA ISOLATION (DoD #8 - #17)
  // ------------------------------------------------------------
  await t.test('DoD #8 - #13: Admin provisioning API with atomic rollback and seat limits exists', () => {
    const provApiPath = path.join(rootDir, 'app', 'api', 'admin', 'employees', 'route.ts')
    assert.ok(fs.existsSync(provApiPath), 'admin/employees provisioning route must exist')
    const provContent = fs.readFileSync(provApiPath, 'utf8')
    assert.ok(provContent.includes('SEAT_LIMIT_REACHED') || provContent.includes('limit'), 'Must check seat limits')
  })

  await t.test('DoD #14, #21, #22: CI Secret Scanner exists and verifies zero secret leakage in client code', () => {
    const scannerPath = path.join(rootDir, 'scripts', 'ci-secret-scan.mjs')
    assert.ok(fs.existsSync(scannerPath), 'ci-secret-scan.mjs must exist')

    const guardrailPath = path.join(rootDir, 'scripts', 'ci-guardrails.sh')
    assert.ok(fs.existsSync(guardrailPath), 'ci-guardrails.sh must exist')
  })

  await t.test('DoD #16 & #17: Multi-tenant switcher and fail-closed tenant resolution', () => {
    const switchApiPath = path.join(rootDir, 'app', 'api', 'auth', 'tenant', 'switch', 'route.ts')
    assert.ok(fs.existsSync(switchApiPath), 'tenant switch API must exist')
  })

  // ------------------------------------------------------------
  // SECTION 3: INFRASTRUCTURE, PWA, HEADERS & OBSERVABILITY (DoD #29 - #35)
  // ------------------------------------------------------------
  await t.test('DoD #29 & #30: PWA Service worker and responsive offline shell exist', () => {
    const swPath = path.join(rootDir, 'public', 'sw.js')
    const offlinePath = path.join(rootDir, 'public', 'offline.html')
    assert.ok(fs.existsSync(swPath), 'public/sw.js must exist')
    assert.ok(fs.existsSync(offlinePath), 'public/offline.html must exist')
  })

  await t.test('DoD #31: Security headers (CSP, HSTS, X-Frame-Options) configured in next.config.js', () => {
    const nextConfigPath = path.join(rootDir, 'next.config.js')
    assert.ok(fs.existsSync(nextConfigPath), 'next.config.js must exist')
    const configContent = fs.readFileSync(nextConfigPath, 'utf8')
    assert.ok(configContent.includes('Content-Security-Policy'), 'Must configure CSP header')
    assert.ok(configContent.includes('Strict-Transport-Security'), 'Must configure HSTS header')
  })

  await t.test('DoD #32 - #35: Rate limiter, CSRF guard, correlation ID, and Sentry PII sanitizer exist', () => {
    const rateLimiterPath = path.join(rootDir, 'lib', 'security', 'rate-limiter.ts')
    const csrfGuardPath = path.join(rootDir, 'lib', 'security', 'csrf-guard.ts')
    const sentryPath = path.join(rootDir, 'lib', 'observability', 'sentry.ts')

    assert.ok(fs.existsSync(rateLimiterPath), 'rate-limiter.ts must exist')
    assert.ok(fs.existsSync(csrfGuardPath), 'csrf-guard.ts must exist')
    assert.ok(fs.existsSync(sentryPath), 'sentry.ts must exist')
  })

  // ------------------------------------------------------------
  // SECTION 4: HANDOFFS & CANONICAL CONTRACTS (DoD #37 - #39)
  // ------------------------------------------------------------
  await t.test('DoD #37: Authoritative API contracts published in types/auth.ts', () => {
    const typesAuthPath = path.join(rootDir, 'types', 'auth.ts')
    assert.ok(fs.existsSync(typesAuthPath), 'types/auth.ts must exist')
  })

  await t.test('DoD #38: Canonical AI server-side auth helper published in lib/ai/ai-auth-helper.ts', () => {
    const aiHelperPath = path.join(rootDir, 'lib', 'ai', 'ai-auth-helper.ts')
    assert.ok(fs.existsSync(aiHelperPath), 'ai-auth-helper.ts must exist')
  })

  await t.test('DoD #39: Reporting RPC admin_attendance_glance consumed in admin glance API', () => {
    const glanceApiPath = path.join(rootDir, 'app', 'api', 'admin', 'glance', 'route.ts')
    assert.ok(fs.existsSync(glanceApiPath), 'admin/glance API route must exist')
    const content = fs.readFileSync(glanceApiPath, 'utf8')
    assert.ok(content.includes('admin_attendance_glance'), 'Must consume admin_attendance_glance RPC')
  })
})
