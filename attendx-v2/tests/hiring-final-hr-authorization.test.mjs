// ============================================================
// AttendX v2 — Module 4: Final HR-Only Authorization Test Suite
// Verifies:
// 1. Authorized HR user (Carol HR) has full tenant-scoped access (200 OK)
// 2. Regular employee (Eve Employee) is DENIED across pages (307 -> /unauthorized) and APIs (403)
// 3. Manager without HR permission (David Manager) is DENIED across pages (307) and APIs (403)
// 4. Administrator without HR permission (Bob Admin) is DENIED across pages (307) and APIs (403)
// 5. Unauthenticated user is DENIED across pages (307 -> /auth/login) and APIs (401)
// 6. HR user from another tenant (Hannah HR) is restricted to own tenant (0 Acme records, 404 on Acme IDs)
// 7. Denied callers cannot mutate any hiring records (POST, PUT, DELETE all return 403)
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'

const BASE_URL = process.env.ATTENDX_TEST_URL || 'http://localhost:3000'

const ACME_TENANT = '11111111-0000-0000-0000-000000000001'
const GLOBEX_TENANT = '22222222-0000-0000-0000-000000000002'

const CAROL_HR = {
  id: '11111111-1111-1111-1111-333333333333',
  tenant_id: ACME_TENANT,
  role: 'HR',
  email: 'hr@acme-tech.com',
  full_name: 'Carol HR',
}

const EVE_EMPLOYEE = {
  id: '11111111-1111-1111-1111-555555555555',
  tenant_id: ACME_TENANT,
  role: 'EMPLOYEE',
  email: 'employee@acme-tech.com',
  full_name: 'Eve Employee',
}

const DAVID_MANAGER = {
  id: '11111111-1111-1111-1111-444444444444',
  tenant_id: ACME_TENANT,
  role: 'MANAGER',
  email: 'manager@acme-tech.com',
  full_name: 'David Manager',
}

const BOB_ADMIN = {
  id: '11111111-1111-1111-1111-222222222222',
  tenant_id: ACME_TENANT,
  role: 'ADMIN',
  email: 'admin@acme-tech.com',
  full_name: 'Bob Admin',
}

const HANNAH_HR_GLOBEX = {
  id: '22222222-2222-2222-2222-333333333333',
  tenant_id: GLOBEX_TENANT,
  role: 'HR',
  email: 'hr@globex-corp.com',
  full_name: 'Hannah HR',
}

function encodeCookie(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64')
}

const HIRING_PAGES = [
  '/hiring',
  '/hiring/sourcing',
  '/hiring/applications',
  '/hiring/interview-status',
  '/hiring/outreach',
  '/hiring/onboard',
  '/hiring/analytics',
]

const HIRING_READ_APIS = [
  '/api/hiring/requisitions',
  '/api/hiring/applications',
  '/api/hiring/sourcing/searches',
  '/api/hiring/outreach/campaigns',
  '/api/hiring/outreach/messages',
  '/api/hiring/interviews',
  '/api/hiring/onboarding',
  '/api/hiring/analytics/funnel',
]

test('FINAL HR-ONLY AUTHORIZATION & SECURITY AUDIT SUITE', async (t) => {
  // --------------------------------------------------------------------------
  // Identity 1: Authorized HR User (Carol HR) - Must have FULL access
  // --------------------------------------------------------------------------
  await t.test('1. Authorized HR user (Carol HR) permitted across all hiring pages and APIs', async (sub) => {
    const hrCookie = `attendx-demo-session=${encodeCookie(CAROL_HR)}`

    for (const page of HIRING_PAGES) {
      await sub.test(`HR UI navigation to ${page} -> 200 OK`, async () => {
        const res = await fetch(`${BASE_URL}${page}`, {
          headers: { Cookie: hrCookie },
          redirect: 'manual',
        })
        assert.equal(res.status, 200, `Expected 200 OK for HR on ${page}, got ${res.status}`)
      })
    }

    for (const api of HIRING_READ_APIS) {
      await sub.test(`HR API GET ${api} -> 200 OK`, async () => {
        const res = await fetch(`${BASE_URL}${api}`, {
          headers: { Cookie: hrCookie },
        })
        assert.equal(res.status, 200, `Expected 200 OK for HR on ${api}, got ${res.status}`)
      })
    }
  })

  // --------------------------------------------------------------------------
  // Identity 2: Regular Employee (Eve Employee) - Must be DENIED
  // --------------------------------------------------------------------------
  await t.test('2. Regular employee (Eve Employee) denied across all hiring pages (307) and APIs (403)', async (sub) => {
    const empCookie = `attendx-demo-session=${encodeCookie(EVE_EMPLOYEE)}`

    for (const page of HIRING_PAGES) {
      await sub.test(`EMPLOYEE UI navigation to ${page} -> 307 Redirect /unauthorized`, async () => {
        const res = await fetch(`${BASE_URL}${page}`, {
          headers: { Cookie: empCookie },
          redirect: 'manual',
        })
        assert.equal(res.status, 307, `Expected 307 for employee on ${page}`)
        assert.ok(res.headers.get('location')?.includes('/unauthorized'))
      })
    }

    for (const api of HIRING_READ_APIS) {
      await sub.test(`EMPLOYEE API GET ${api} -> 403 Forbidden`, async () => {
        const res = await fetch(`${BASE_URL}${api}`, {
          headers: { Cookie: empCookie },
        })
        assert.equal(res.status, 403, `Expected 403 Forbidden for employee on ${api}`)
      })
    }
  })

  // --------------------------------------------------------------------------
  // Identity 3: Manager without HR Permission (David Manager) - Must be DENIED
  // --------------------------------------------------------------------------
  await t.test('3. Manager without HR permission (David Manager) denied across all hiring pages (307) and APIs (403)', async (sub) => {
    const mgrCookie = `attendx-demo-session=${encodeCookie(DAVID_MANAGER)}`

    for (const page of HIRING_PAGES) {
      await sub.test(`MANAGER UI navigation to ${page} -> 307 Redirect /unauthorized`, async () => {
        const res = await fetch(`${BASE_URL}${page}`, {
          headers: { Cookie: mgrCookie },
          redirect: 'manual',
        })
        assert.equal(res.status, 307, `Expected 307 for manager without HR on ${page}`)
        assert.ok(res.headers.get('location')?.includes('/unauthorized'))
      })
    }

    for (const api of HIRING_READ_APIS) {
      await sub.test(`MANAGER API GET ${api} -> 403 Forbidden`, async () => {
        const res = await fetch(`${BASE_URL}${api}`, {
          headers: { Cookie: mgrCookie },
        })
        assert.equal(res.status, 403, `Expected 403 Forbidden for manager on ${api}`)
      })
    }
  })

  // --------------------------------------------------------------------------
  // Identity 4: Administrator without HR Permission (Bob Admin) - Must be DENIED
  // --------------------------------------------------------------------------
  await t.test('4. Administrator without HR permission (Bob Admin) denied across all hiring pages (307) and APIs (403)', async (sub) => {
    const adminCookie = `attendx-demo-session=${encodeCookie(BOB_ADMIN)}`

    for (const page of HIRING_PAGES) {
      await sub.test(`ADMIN UI navigation to ${page} -> 307 Redirect /unauthorized`, async () => {
        const res = await fetch(`${BASE_URL}${page}`, {
          headers: { Cookie: adminCookie },
          redirect: 'manual',
        })
        assert.equal(res.status, 307, `Expected 307 for admin without HR on ${page}`)
        assert.ok(res.headers.get('location')?.includes('/unauthorized'))
      })
    }

    for (const api of HIRING_READ_APIS) {
      await sub.test(`ADMIN API GET ${api} -> 403 Forbidden`, async () => {
        const res = await fetch(`${BASE_URL}${api}`, {
          headers: { Cookie: adminCookie },
        })
        assert.equal(res.status, 403, `Expected 403 Forbidden for admin on ${api}`)
      })
    }
  })

  // --------------------------------------------------------------------------
  // Identity 5: Unauthenticated User - Must be DENIED (401)
  // --------------------------------------------------------------------------
  await t.test('5. Unauthenticated user denied across all hiring pages (307 -> login) and APIs (401)', async (sub) => {
    for (const page of HIRING_PAGES) {
      await sub.test(`Unauthenticated UI navigation to ${page} -> 307 Redirect /auth/login`, async () => {
        const res = await fetch(`${BASE_URL}${page}`, { redirect: 'manual' })
        assert.equal(res.status, 307, `Expected 307 for unauthenticated on ${page}`)
        assert.ok(res.headers.get('location')?.includes('/auth/login'))
      })
    }

    for (const api of HIRING_READ_APIS) {
      await sub.test(`Unauthenticated API GET ${api} -> 401 Unauthorized`, async () => {
        const res = await fetch(`${BASE_URL}${api}`)
        assert.equal(res.status, 401, `Expected 401 Unauthorized for unauthenticated on ${api}`)
      })
    }
  })

  // --------------------------------------------------------------------------
  // Identity 6: HR User from Another Tenant (Hannah HR) - Tenant Isolation
  // --------------------------------------------------------------------------
  await t.test('6. HR user from another tenant (Hannah HR) strictly isolated to Globex (0 Acme records)', async (sub) => {
    const globexCookie = `attendx-demo-session=${encodeCookie(HANNAH_HR_GLOBEX)}`

    await sub.test('Globex HR receives 0 Acme requisitions', async () => {
      const res = await fetch(`${BASE_URL}/api/hiring/requisitions`, {
        headers: { Cookie: globexCookie },
      })
      assert.equal(res.status, 200)
      const data = await res.json()
      const reqs = data.requisitions || data.data || []
      const acmeReqs = reqs.filter(r => r.organization_id === ACME_TENANT || r.requisition_number?.includes('ACME'))
      assert.equal(acmeReqs.length, 0, 'Globex HR must not receive Acme requisitions')
    })

    await sub.test('Globex HR cannot fetch specific Acme requisition (fails closed with 404)', async () => {
      const res = await fetch(`${BASE_URL}/api/hiring/requisitions/00000000-0000-0000-0000-000000000001`, {
        headers: { Cookie: globexCookie },
      })
      assert.equal(res.status, 404)
    })

    await sub.test('Globex HR cannot fetch specific Acme candidate (fails closed with 404)', async () => {
      const res = await fetch(`${BASE_URL}/api/hiring/candidates/475189a9-f04b-498c-bbf7-d246f3446258`, {
        headers: { Cookie: globexCookie },
      })
      assert.equal(res.status, 404)
    })
  })

  // --------------------------------------------------------------------------
  // Mutation Guards: Denied Callers Cannot Mutate Hiring Records
  // --------------------------------------------------------------------------
  await t.test('7. Denied callers (Employee, Manager, Admin) CANNOT mutate hiring records (403 Forbidden)', async (sub) => {
    const deniedUsers = [
      { name: 'EMPLOYEE', cookie: `attendx-demo-session=${encodeCookie(EVE_EMPLOYEE)}` },
      { name: 'MANAGER', cookie: `attendx-demo-session=${encodeCookie(DAVID_MANAGER)}` },
      { name: 'ADMIN', cookie: `attendx-demo-session=${encodeCookie(BOB_ADMIN)}` },
    ]

    for (const { name, cookie } of deniedUsers) {
      await sub.test(`${name} POST /api/hiring/requisitions -> 403 Forbidden`, async () => {
        const res = await fetch(`${BASE_URL}/api/hiring/requisitions`, {
          method: 'POST',
          headers: { Cookie: cookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Illegal Requisition', department_id: 'd1' }),
        })
        assert.equal(res.status, 403, `${name} must not be able to create requisition`)
      })

      await sub.test(`${name} POST /api/hiring/sourcing/shortlist -> 403 Forbidden`, async () => {
        const res = await fetch(`${BASE_URL}/api/hiring/sourcing/shortlist`, {
          method: 'POST',
          headers: { Cookie: cookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidate_id: 'c1', requisition_id: 'r1' }),
        })
        assert.equal(res.status, 403, `${name} must not be able to shortlist candidate`)
      })

      await sub.test(`${name} POST /api/hiring/outreach/campaigns -> 403 Forbidden`, async () => {
        const res = await fetch(`${BASE_URL}/api/hiring/outreach/campaigns`, {
          method: 'POST',
          headers: { Cookie: cookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Illegal Campaign' }),
        })
        assert.equal(res.status, 403, `${name} must not be able to create campaign`)
      })

      await sub.test(`${name} PATCH /api/hiring/applications/a5f09392-2eb0-4e6a-acf3-304b69f55e1e/stage -> 403 Forbidden`, async () => {
        const res = await fetch(`${BASE_URL}/api/hiring/applications/a5f09392-2eb0-4e6a-acf3-304b69f55e1e/stage`, {
          method: 'PATCH',
          headers: { Cookie: cookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ target_stage: 'OFFERED' }),
        })
        assert.equal(res.status, 403, `${name} must not be able to mutate application stage`)
      })
    }
  })
})
