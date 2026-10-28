// ============================================================
// AttendX v2 — SEC-01: Demo Cookie Hardening & Authentication Boundary Regression Suite
// Verifies all 10 requirements from Module 4 Independent Security Audit:
// 1. Forged base64 demo cookie claiming SUPERADMIN is rejected in production mode.
// 2. Forged cookie claiming another tenant is rejected in staging mode.
// 3. Forged demo cookie cannot authorize a protected API request in production mode.
// 4. Direct request to an API route cannot bypass authentication checks.
// 5. Unauthenticated caller cannot read protected Hiring records.
// 6. Unauthenticated caller cannot create, update, or delete protected Hiring records.
// 7. Valid authenticated user cannot gain privileges by adding or modifying demo-cookie fields.
// 8. Legitimate development-mock functionality works ONLY when both gates are satisfied.
// 9. Missing, malformed, and manipulated demo-cookie payloads fail safely.
// 10. Existing legitimate authenticated workflows continue to work.
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import { ServerIdentity } from '../lib/auth/server-identity.ts'
import { allowDemoAuthentication, isDevMockSupabase, isPrivilegedSpyAllowed } from '../lib/supabase/config.ts'
import { RbacGuard } from '../lib/auth/rbac-guard.ts'

function createDemoCookie(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64')
}

const T_ACME = 'aa000000-0000-0000-0000-0000000000a1'
const T_GLOBEX = 'bb000000-0000-0000-0000-0000000000b2'

test('SEC-01: DEMO COOKIE AUTHENTICATION & AUTHORIZATION HARDENING', async (t) => {

  const originalEnv = {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    ATTENDX_OFFLINE_MODE: process.env.ATTENDX_OFFLINE_MODE,
    ATTENDX_MOCK_STORE: process.env.ATTENDX_MOCK_STORE,
    ATTENDX_TEST_PRIVILEGED_SPY: process.env.ATTENDX_TEST_PRIVILEGED_SPY,
    ATTENDX_TEST_ENVIRONMENT: process.env.ATTENDX_TEST_ENVIRONMENT,
    VERCEL_ENV: process.env.VERCEL_ENV,
    ATTENDX_ENV: process.env.ATTENDX_ENV,
    RENDER: process.env.RENDER,
    DATABASE_URL: process.env.DATABASE_URL,
  }

  function restoreEnv() {
    process.env.NODE_ENV = originalEnv.NODE_ENV
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnv.NEXT_PUBLIC_SUPABASE_URL
    process.env.ATTENDX_OFFLINE_MODE = originalEnv.ATTENDX_OFFLINE_MODE
    process.env.ATTENDX_MOCK_STORE = originalEnv.ATTENDX_MOCK_STORE
    process.env.ATTENDX_TEST_PRIVILEGED_SPY = originalEnv.ATTENDX_TEST_PRIVILEGED_SPY
    process.env.ATTENDX_TEST_ENVIRONMENT = originalEnv.ATTENDX_TEST_ENVIRONMENT
    process.env.VERCEL_ENV = originalEnv.VERCEL_ENV
    process.env.ATTENDX_ENV = originalEnv.ATTENDX_ENV
    process.env.RENDER = originalEnv.RENDER
    process.env.DATABASE_URL = originalEnv.DATABASE_URL
  }

  t.afterEach(() => {
    restoreEnv()
  })

  // ----------------------------------------------------------
  // Requirement 1: Forged base64 demo cookie claiming SUPERADMIN is rejected in production
  // ----------------------------------------------------------
  await t.test('1: Forged base64 demo cookie claiming SUPERADMIN is rejected in production mode', async () => {
    process.env.NODE_ENV = 'production'
    process.env.ATTENDX_MOCK_STORE = 'true'

    const forgedCookie = createDemoCookie({
      id: 'attacker-id-001',
      role: 'SUPERADMIN',
      tenant_id: T_ACME,
      email: 'attacker@evil.com',
    })

    const req = new Request('http://localhost:3000/api/hiring/requisitions', {
      headers: { cookie: `attendx-demo-session=${forgedCookie}` },
    })

    await assert.rejects(
      async () => {
        await ServerIdentity.getAuthoritativeCaller(['SUPERADMIN', 'ADMIN', 'HR'], req)
      },
      (err) => {
        assert.equal(err.status, 401, 'Must reject with HTTP 401 Unauthorized')
        assert.ok(!err.message.includes('SUPERADMIN'), 'Must not adopt SUPERADMIN identity')
        return true
      }
    )
  })

  // ----------------------------------------------------------
  // Requirement 2: Forged cookie claiming another tenant is rejected in staging mode
  // ----------------------------------------------------------
  await t.test('2: Forged cookie claiming another tenant is rejected in staging mode', async () => {
    process.env.NODE_ENV = 'staging'
    process.env.ATTENDX_MOCK_STORE = 'true'

    const forgedCookie = createDemoCookie({
      id: 'hr-user-002',
      role: 'HR',
      tenant_id: T_GLOBEX, // Attacker claiming foreign tenant
      email: 'hr@acme.com',
    })

    const req = new Request('http://localhost:3000/api/hiring/candidates', {
      headers: { cookie: `attendx-demo-session=${forgedCookie}` },
    })

    await assert.rejects(
      async () => {
        await ServerIdentity.getAuthoritativeCaller(['HR'], req)
      },
      (err) => {
        assert.equal(err.status, 401, 'Must reject with HTTP 401 Unauthorized in staging')
        return true
      }
    )
  })

  // ----------------------------------------------------------
  // Requirement 3: Forged demo cookie cannot authorize a protected API request in production
  // ----------------------------------------------------------
  await t.test('3: Forged demo cookie cannot authorize protected API route in production mode', async () => {
    process.env.NODE_ENV = 'production'
    process.env.ATTENDX_OFFLINE_MODE = 'true'

    const forgedCookie = createDemoCookie({
      id: 'spoofed-admin',
      role: 'ADMIN',
      tenant_id: T_ACME,
    })

    const endpointsToTest = [
      { path: '/api/hiring/requisitions', roles: ['SUPERADMIN', 'ADMIN', 'HR'] },
      { path: '/api/hiring/candidates', roles: ['SUPERADMIN', 'ADMIN', 'HR'] },
      { path: '/api/hiring/offers', roles: ['SUPERADMIN', 'ADMIN', 'HR'] },
      { path: '/api/hiring/onboarding/convert-employee', roles: ['SUPERADMIN', 'ADMIN', 'HR'] },
    ]

    for (const ep of endpointsToTest) {
      const req = new Request(`http://localhost:3000${ep.path}`, {
        headers: { cookie: `attendx-demo-session=${forgedCookie}` },
      })

      await assert.rejects(
        async () => {
          await ServerIdentity.getAuthoritativeCaller(ep.roles, req)
        },
        (err) => {
          assert.equal(err.status, 401, `Endpoint ${ep.path} must reject forged demo cookie with 401`)
          return true
        }
      )
    }
  })

  // ----------------------------------------------------------
  // Requirement 4: Direct request to API route cannot bypass authentication checks
  // ----------------------------------------------------------
  await t.test('4: Direct request to API route cannot bypass authentication checks', async () => {
    process.env.NODE_ENV = 'production'
    process.env.ATTENDX_MOCK_STORE = 'true'

    // Direct request without any headers or cookies (bypassing middleware)
    const directReq = new Request('http://localhost:3000/api/hiring/requisitions')

    await assert.rejects(
      async () => {
        await ServerIdentity.getAuthoritativeCaller(['SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'], directReq)
      },
      (err) => {
        assert.equal(err.status, 401, 'Direct API request without auth must fail closed with 401')
        return true
      }
    )
  })

  // ----------------------------------------------------------
  // Requirement 5 & 6: Unauthenticated caller cannot read or write protected Hiring records
  // ----------------------------------------------------------
  await t.test('5 & 6: Unauthenticated caller cannot read or mutate protected Hiring records', async () => {
    process.env.NODE_ENV = 'production'
    process.env.ATTENDX_MOCK_STORE = 'true'

    const readReq = new Request('http://localhost:3000/api/hiring/requisitions', { method: 'GET' })
    await assert.rejects(
      async () => {
        await ServerIdentity.getAuthoritativeCaller(['SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'], readReq)
      },
      (err) => {
        assert.equal(err.status, 401, 'Unauthenticated read must fail closed with 401')
        return true
      }
    )

    const writeReq = new Request('http://localhost:3000/api/hiring/requisitions', {
      method: 'POST',
      body: JSON.stringify({ title: 'Unauthorized Role' }),
    })
    await assert.rejects(
      async () => {
        await ServerIdentity.getAuthoritativeCaller(['SUPERADMIN', 'ADMIN', 'HR'], writeReq)
      },
      (err) => {
        assert.equal(err.status, 401, 'Unauthenticated write must fail closed with 401')
        return true
      }
    )
  })

  // ----------------------------------------------------------
  // Requirement 7: Authenticated user cannot gain privileges by adding/modifying demo cookie
  // ----------------------------------------------------------
  await t.test('7: Authenticated user cannot elevate privileges via demo cookie in non-dev mode', async () => {
    process.env.NODE_ENV = 'production'
    process.env.ATTENDX_MOCK_STORE = 'true'

    // An employee user attempting to elevate to SUPERADMIN by tacking on a demo cookie
    const forgedSuperadminCookie = createDemoCookie({
      id: 'emp-001',
      role: 'SUPERADMIN',
      tenant_id: T_GLOBEX,
    })

    const req = new Request('http://localhost:3000/api/hiring/requisitions', {
      headers: {
        cookie: `attendx-demo-session=${forgedSuperadminCookie}`,
      },
    })

    // In production, allowDemoAuthentication() is false, so demo cookie is ignored completely
    await assert.rejects(
      async () => {
        await ServerIdentity.getAuthoritativeCaller(['SUPERADMIN', 'ADMIN', 'HR'], req)
      },
      (err) => {
        assert.equal(err.status, 401, 'Forged demo cookie on request must be ignored and fail closed with 401')
        return true
      }
    )
  })

  // ----------------------------------------------------------
  // Requirement 8: Legitimate development-mock functionality works ONLY when BOTH gates pass
  // ----------------------------------------------------------
  await t.test('8.1: Legitimate dev-mock works when BOTH NODE_ENV=development AND mock Supabase are active', async () => {
    process.env.NODE_ENV = 'development'
    process.env.ATTENDX_MOCK_STORE = 'true'

    assert.equal(isDevMockSupabase(), true, 'isDevMockSupabase must be true')
    assert.equal(allowDemoAuthentication(), true, 'allowDemoAuthentication must be true')

    const validDevCookie = createDemoCookie({
      id: 'hr-001',
      role: 'HR',
      tenant_id: T_ACME,
      email: 'hr@acme.com',
    })

    const req = new Request('http://localhost:3000/api/hiring/requisitions', {
      headers: { cookie: `attendx-demo-session=${validDevCookie}` },
    })

    const caller = await ServerIdentity.getAuthoritativeCaller(['SUPERADMIN', 'ADMIN', 'HR'], req)
    assert.equal(caller.userId, 'hr-001')
    assert.equal(caller.role, 'HR')
    assert.equal(caller.tenantId, T_ACME)
  })

  await t.test('8.2: Dev-mock BLOCKED when NODE_ENV is production, even if mock store env is set', async () => {
    process.env.NODE_ENV = 'production'
    process.env.ATTENDX_MOCK_STORE = 'true'

    assert.equal(allowDemoAuthentication(), false, 'allowDemoAuthentication must be false in production')

    const devCookie = createDemoCookie({
      id: 'hr-001',
      role: 'HR',
      tenant_id: T_ACME,
    })

    const req = new Request('http://localhost:3000/api/hiring/requisitions', {
      headers: { cookie: `attendx-demo-session=${devCookie}` },
    })

    await assert.rejects(
      async () => {
        await ServerIdentity.getAuthoritativeCaller(['HR'], req)
      },
      (err) => {
        assert.equal(err.status, 401)
        return true
      }
    )
  })

  await t.test('8.3: Dev-mock BLOCKED when NODE_ENV is development, but mock store is NOT active (live DB)', async () => {
    process.env.NODE_ENV = 'development'
    delete process.env.ATTENDX_MOCK_STORE
    delete process.env.ATTENDX_OFFLINE_MODE
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://khaxowomjczuckfuraoh.supabase.co'

    assert.equal(isDevMockSupabase(), false, 'isDevMockSupabase must be false for live URL')
    assert.equal(allowDemoAuthentication(), false, 'allowDemoAuthentication must be false for live URL')
  })

  await t.test('8.4: Dev-mock BLOCKED when NODE_ENV is test', async () => {
    process.env.NODE_ENV = 'test'
    process.env.ATTENDX_MOCK_STORE = 'true'

    assert.equal(allowDemoAuthentication(), false, 'allowDemoAuthentication must be false in test mode')
  })

  // ----------------------------------------------------------
  // Requirement 9: Missing, malformed, and manipulated demo-cookie payloads fail safely
  // ----------------------------------------------------------
  await t.test('9.1: Missing demo-cookie in dev-mock mode fails closed with 401', async () => {
    process.env.NODE_ENV = 'development'
    process.env.ATTENDX_MOCK_STORE = 'true'

    const req = new Request('http://localhost:3000/api/hiring/requisitions')
    await assert.rejects(
      async () => {
        await ServerIdentity.getAuthoritativeCaller(['HR'], req)
      },
      (err) => {
        assert.equal(err.status, 401)
        return true
      }
    )
  })

  await t.test('9.2: Non-base64 garbage demo-cookie fails closed with 401 without crashing', async () => {
    process.env.NODE_ENV = 'development'
    process.env.ATTENDX_MOCK_STORE = 'true'

    const req = new Request('http://localhost:3000/api/hiring/requisitions', {
      headers: { cookie: 'attendx-demo-session=***NOT-BASE64-GARBAGE***' },
    })
    await assert.rejects(
      async () => {
        await ServerIdentity.getAuthoritativeCaller(['HR'], req)
      },
      (err) => {
        assert.equal(err.status, 401)
        return true
      }
    )
  })

  await t.test('9.3: Malformed JSON payload fails closed with 401 without crashing', async () => {
    process.env.NODE_ENV = 'development'
    process.env.ATTENDX_MOCK_STORE = 'true'

    const badJsonCookie = Buffer.from('{ bad: json, ').toString('base64')
    const req = new Request('http://localhost:3000/api/hiring/requisitions', {
      headers: { cookie: `attendx-demo-session=${badJsonCookie}` },
    })
    await assert.rejects(
      async () => {
        await ServerIdentity.getAuthoritativeCaller(['HR'], req)
      },
      (err) => {
        assert.equal(err.status, 401)
        return true
      }
    )
  })

  await t.test('9.4: Missing required fields (id, role, tenant_id) fails closed with 401', async () => {
    process.env.NODE_ENV = 'development'
    process.env.ATTENDX_MOCK_STORE = 'true'

    const incompleteCookie = Buffer.from(JSON.stringify({ id: 'only-id' })).toString('base64')
    const req = new Request('http://localhost:3000/api/hiring/requisitions', {
      headers: { cookie: `attendx-demo-session=${incompleteCookie}` },
    })
    await assert.rejects(
      async () => {
        await ServerIdentity.getAuthoritativeCaller(['HR'], req)
      },
      (err) => {
        assert.equal(err.status, 401)
        return true
      }
    )
  })

  await t.test('9.5: Manipulated demo cookie with unauthorized role fails closed with 403 Forbidden', async () => {
    process.env.NODE_ENV = 'development'
    process.env.ATTENDX_MOCK_STORE = 'true'

    const employeeCookie = createDemoCookie({
      id: 'emp-001',
      role: 'EMPLOYEE',
      tenant_id: T_ACME,
    })

    const req = new Request('http://localhost:3000/api/hiring/requisitions', {
      headers: { cookie: `attendx-demo-session=${employeeCookie}` },
    })

    await assert.rejects(
      async () => {
        await ServerIdentity.getAuthoritativeCaller(['SUPERADMIN', 'ADMIN', 'HR'], req)
      },
      (err) => {
        assert.equal(err.status, 403, 'EMPLOYEE must be rejected from administrative actions with 403 Forbidden')
        assert.ok(err.message.includes('Forbidden: Role \'EMPLOYEE\' cannot execute this administrative action'))
        return true
      }
    )
  })

  // ----------------------------------------------------------
  // Requirement 10: Existing legitimate authenticated workflows continue to work
  // ----------------------------------------------------------
  await t.test('10: RbacGuard role permissions boundary remains strict and deterministic', () => {
    // Verify that workforce roles are permitted and EMPLOYEE is denied on /hiring
    assert.equal(RbacGuard.isAuthorizedForRoute(['SUPERADMIN'], ['SUPERADMIN', 'ADMIN', 'HR', 'MANAGER']), true)
    assert.equal(RbacGuard.isAuthorizedForRoute(['ADMIN'], ['SUPERADMIN', 'ADMIN', 'HR', 'MANAGER']), true)
    assert.equal(RbacGuard.isAuthorizedForRoute(['HR'], ['SUPERADMIN', 'ADMIN', 'HR', 'MANAGER']), true)
    assert.equal(RbacGuard.isAuthorizedForRoute(['MANAGER'], ['SUPERADMIN', 'ADMIN', 'HR', 'MANAGER']), true)
    assert.equal(RbacGuard.isAuthorizedForRoute(['EMPLOYEE'], ['SUPERADMIN', 'ADMIN', 'HR', 'MANAGER']), false)
  })

  // ----------------------------------------------------------
  // Requirement 11: Privileged-Client Test Spy Safety & Boundary Enforcement
  // ----------------------------------------------------------
  await t.test('11.1: Privileged spy is disabled by default when ATTENDX_TEST_PRIVILEGED_SPY is unset', () => {
    delete process.env.ATTENDX_TEST_PRIVILEGED_SPY
    delete process.env.ATTENDX_TEST_ENVIRONMENT
    assert.equal(isPrivilegedSpyAllowed(), false)
  })

  await t.test('11.2: Privileged spy CANNOT be activated in production through env var alone', () => {
    process.env.NODE_ENV = 'production'
    process.env.ATTENDX_TEST_PRIVILEGED_SPY = '/tmp/spy.log'
    delete process.env.ATTENDX_TEST_ENVIRONMENT
    // ATTENDX_TEST_ENVIRONMENT is absent; setting ATTENDX_TEST_PRIVILEGED_SPY alone must return false
    assert.equal(isPrivilegedSpyAllowed(), false)
  })

  await t.test('11.3: Privileged spy BLOCKED without ATTENDX_TEST_ENVIRONMENT flag regardless of other flags', () => {
    process.env.NODE_ENV = 'development'
    process.env.ATTENDX_TEST_PRIVILEGED_SPY = '/tmp/spy.log'
    delete process.env.ATTENDX_TEST_ENVIRONMENT
    assert.equal(isPrivilegedSpyAllowed(), false)
  })

  await t.test('11.4: Privileged spy BLOCKED in hosted cloud environments even if flags are present', () => {
    process.env.ATTENDX_TEST_PRIVILEGED_SPY = '/tmp/spy.log'
    process.env.ATTENDX_TEST_ENVIRONMENT = 'true'

    // Vercel production check
    process.env.VERCEL_ENV = 'production'
    assert.equal(isPrivilegedSpyAllowed(), false)
    delete process.env.VERCEL_ENV

    // Render check
    process.env.RENDER = 'true'
    assert.equal(isPrivilegedSpyAllowed(), false)
    delete process.env.RENDER

    // AttendX production env check
    process.env.ATTENDX_ENV = 'production'
    assert.equal(isPrivilegedSpyAllowed(), false)
    delete process.env.ATTENDX_ENV
  })

  await t.test('11.5: Privileged spy BLOCKED if targeting production Supabase project', () => {
    process.env.ATTENDX_TEST_PRIVILEGED_SPY = '/tmp/spy.log'
    process.env.ATTENDX_TEST_ENVIRONMENT = 'true'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://xskgtrgiclzmwtyyhpjh.supabase.co'
    assert.equal(isPrivilegedSpyAllowed(), false)
  })

  await t.test('11.6: Privileged spy BLOCKED if ATTENDX_TEST_PRIVILEGED_SPY is empty or whitespace', () => {
    process.env.ATTENDX_TEST_PRIVILEGED_SPY = '   '
    process.env.ATTENDX_TEST_ENVIRONMENT = 'true'
    assert.equal(isPrivilegedSpyAllowed(), false)
  })

  await t.test('11.7: Privileged spy permitted ONLY when all security predicates are satisfied in local test', () => {
    process.env.NODE_ENV = 'production'
    process.env.ATTENDX_TEST_PRIVILEGED_SPY = '/tmp/spy.log'
    process.env.ATTENDX_TEST_ENVIRONMENT = 'true'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
    delete process.env.VERCEL_ENV
    delete process.env.ATTENDX_ENV
    delete process.env.RENDER
    assert.equal(isPrivilegedSpyAllowed(), true)
  })
})
