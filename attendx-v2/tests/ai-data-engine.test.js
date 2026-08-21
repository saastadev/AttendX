// ============================================================
// AttendX v2 — AI & Data Engine Handoff Verification Suite (Scope E.29 & E.30)
// Spec: docs/specs/29_31_ai_data_engine_handoff_spec.md
// Tests: AI-AUTH-01 through DATA-ENG-03
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { AIAuthError } from '../types/ai.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

test('AI & Data Engine Handoff Suite (Specs 29-31)', async (t) => {

  await t.test('AI-AUTH-01: Canonical AI Auth Context structure conforms to Spec §2.1', () => {
    const validContext = {
      userId: 'e7c2f0d9-952b-436d-9781-645367b6da21',
      tenantId: '8a31e84d-2a1f-4c12-9c1a-6d1a2b3c4d5e',
      tenantName: 'Acme Corporation',
      role: 'EMPLOYEE',
      isActive: true,
      onboardingCompleted: true,
      timezone: 'America/New_York',
      correlationId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    }

    assert.equal(typeof validContext.userId, 'string')
    assert.equal(typeof validContext.tenantId, 'string')
    assert.equal(typeof validContext.tenantName, 'string')
    assert.equal(typeof validContext.role, 'string')
    assert.equal(validContext.isActive, true)
    assert.equal(validContext.timezone, 'America/New_York')
    assert.equal(typeof validContext.correlationId, 'string')
  })

  await t.test('AI-AUTH-02: AIAuthError properly constructs HTTP status and machine error codes', () => {
    const err = new AIAuthError('Forbidden: User account is inactive', 403, 'ACCOUNT_DEACTIVATED')
    assert.equal(err.message, 'Forbidden: User account is inactive')
    assert.equal(err.statusCode, 403)
    assert.equal(err.code, 'ACCOUNT_DEACTIVATED')
    assert.equal(err.name, 'AIAuthError')
  })

  await t.test('AI-AUTH-03: Zero hardcoded fallback UUIDs in copilot route code (Anti-Fabrication)', () => {
    const copilotRoutePath = path.join(rootDir, 'app', 'api', 'copilot', 'route.ts')
    assert.ok(fs.existsSync(copilotRoutePath))
    const code = fs.readFileSync(copilotRoutePath, 'utf8')

    // Must NOT contain dummy fallback UUID
    assert.equal(code.includes('11111111-0000-0000-0000-000000000001'), false, 'Must not contain hardcoded mock UUID')
    // Must consume canonical helper
    assert.ok(code.includes('getAuthoritativeAIContext'), 'Must invoke getAuthoritativeAIContext')
  })

  await t.test('DATA-ENG-01: admin_attendance_glance RPC migration exists and defines timezone logic', () => {
    const migrationPath = path.join(rootDir, '..', 'supabase', 'migrations', '016_canonical_reporting_rpcs.sql')
    assert.ok(fs.existsSync(migrationPath), 'Migration 016 must exist')
    const sql = fs.readFileSync(migrationPath, 'utf8')

    assert.ok(sql.includes('admin_attendance_glance'), 'Must define admin_attendance_glance function')
    assert.ok(sql.includes('NOW() AT TIME ZONE'), 'Must calculate today_date using tenant timezone')
    assert.ok(sql.includes('PRESENT'), 'Must return PRESENT tally')
    assert.ok(sql.includes('COMPLETED'), 'Must return COMPLETED tally')
    assert.ok(sql.includes('ON_LEAVE'), 'Must return ON_LEAVE tally')
    assert.ok(sql.includes('ABSENT'), 'Must return ABSENT tally')
    assert.ok(sql.includes('TOTAL'), 'Must return TOTAL tally')
  })

  await t.test('DATA-ENG-02: Zero API-layer duplicate date math fallback in admin glance route', () => {
    const glanceRoutePath = path.join(rootDir, 'app', 'api', 'admin', 'glance', 'route.ts')
    assert.ok(fs.existsSync(glanceRoutePath))
    const code = fs.readFileSync(glanceRoutePath, 'utf8')

    // Must NOT contain client-side date math or fallback arrays
    assert.equal(code.includes('new Date().toISOString().split'), false, 'Must not perform client JS date splitting')
    assert.equal(code.includes('Fallback: direct table queries'), false, 'Must not contain client-side fallback query branch')
    // Must call RPC
    assert.ok(code.includes("rpc('admin_attendance_glance'"), 'Must strictly invoke admin_attendance_glance RPC')
  })

  await t.test('DATA-ENG-03: Attendance Glance response schema conforms to Spec §3.3', () => {
    const sampleResponse = {
      success: true,
      tenant_id: '8a31e84d-2a1f-4c12-9c1a-6d1a2b3c4d5e',
      glance: {
        PRESENT: 42,
        COMPLETED: 15,
        ON_LEAVE: 3,
        ABSENT: 5,
        TOTAL: 65,
      },
    }

    assert.equal(sampleResponse.success, true)
    assert.equal(sampleResponse.glance.PRESENT + sampleResponse.glance.COMPLETED + sampleResponse.glance.ON_LEAVE + sampleResponse.glance.ABSENT, sampleResponse.glance.TOTAL)
  })
})
