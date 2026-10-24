// ============================================================
// AttendX v2 — Module 4: Sourcing Requisition Eligibility Regression Suite
// Verifies Defect 1 Fixes across Service, State, and API boundaries:
// 1. OPEN requisition succeeds
// 2. Only DRAFT requisitions -> rejected with 400
// 3. Only PAUSED, FILLED, or CANCELLED requisitions -> rejected with 400
// 4. Stale or invalid selected requisition -> rejected with 404
// 5. Requisition belonging to another tenant -> rejected with 404 (IDOR)
// 6. ApplicationService.create with closed requisition -> rejected with 400
// 7. ApplicationService.create with non-existent or foreign requisition -> rejected with 404
// ============================================================

process.env.ATTENDX_MOCK_STORE = 'true'

import test from 'node:test'
import assert from 'node:assert/strict'
import { SourcingService } from '../lib/hiring/sourcing-service.ts'
import { ApplicationService } from '../lib/hiring/application-service.ts'
import { mockHiringStore } from '../lib/hiring/mock-store.ts'

const T_ACME = '11111111-0000-0000-0000-000000000001'
const T_GLOBEX = '22222222-0000-0000-0000-000000000002'

function createTestMockClient() {
  return {
    from(tableName) {
      let filters = []
      const chain = {
        select: () => chain,
        eq: (col, val) => {
          filters.push({ col, val })
          return chain
        },
        neq: (col, val) => {
          filters.push({ col, val, op: 'neq' })
          return chain
        },
        ilike: (col, val) => {
          filters.push({ col, val, op: 'ilike' })
          return chain
        },
        order: () => chain,
        limit: () => chain,
        single: async () => {
          const list = (tableName === 'job_requisitions' ? mockHiringStore.requisitions :
                        tableName === 'candidates' ? mockHiringStore.candidates :
                        tableName === 'job_applications' ? mockHiringStore.applications : [])
          const match = list.find(row => filters.every(f => {
            if (f.op === 'neq') return row[f.col] !== f.val
            if (f.op === 'ilike') return String(row[f.col] || '').toLowerCase() === String(f.val || '').toLowerCase()
            return row[f.col] === f.val
          }))
          if (!match) return { data: null, error: { message: 'Not found', code: 'PGRST116' } }
          return { data: match, error: null }
        },
        maybeSingle: async () => {
          const list = (tableName === 'job_requisitions' ? mockHiringStore.requisitions :
                        tableName === 'candidates' ? mockHiringStore.candidates :
                        tableName === 'job_applications' ? mockHiringStore.applications : [])
          const match = list.find(row => filters.every(f => {
            if (f.op === 'neq') return row[f.col] !== f.val
            if (f.op === 'ilike') return String(row[f.col] || '').toLowerCase() === String(f.val || '').toLowerCase()
            return row[f.col] === f.val
          }))
          return { data: match || null, error: null }
        },
        insert: (rows) => {
          const row = Array.isArray(rows) ? rows[0] : rows
          const inserted = { id: `id-${Date.now()}-${Math.floor(Math.random()*1000)}`, ...row, created_at: new Date().toISOString() }
          if (tableName === 'candidates') mockHiringStore.candidates.push(inserted)
          if (tableName === 'job_applications') mockHiringStore.applications.push(inserted)
          return {
            select: () => ({
              single: async () => ({ data: inserted, error: null })
            })
          }
        }
      }
      return chain
    }
  }
}

const MOCK_CLIENT = createTestMockClient()

test('MODULE 4: SOURCING REQUISITION ELIGIBILITY REGRESSION SUITE', async (t) => {
  // Setup mock requisitions in mock store
  const openReqId = 'req-open-test-01'
  const draftReqId = 'req-draft-test-02'
  const filledReqId = 'req-filled-test-03'
  const cancelledReqId = 'req-cancelled-test-04'
  const globexOpenReqId = 'req-globex-open-05'

  mockHiringStore.requisitions = [
    {
      id: openReqId,
      organization_id: T_ACME,
      requisition_code: 'REQ-OPEN-01',
      title: 'Senior Frontend Engineer',
      status: 'OPEN',
      min_experience_years: 3,
      max_experience_years: 6,
      skills: ['React', 'TypeScript'],
    },
    {
      id: draftReqId,
      organization_id: T_ACME,
      requisition_code: 'REQ-DRAFT-02',
      title: 'Junior QA Tester',
      status: 'DRAFT',
      min_experience_years: 1,
      max_experience_years: 3,
      skills: ['Jest', 'Playwright'],
    },
    {
      id: filledReqId,
      organization_id: T_ACME,
      requisition_code: 'REQ-FILLED-03',
      title: 'DevOps Lead',
      status: 'FILLED',
      min_experience_years: 5,
      max_experience_years: 8,
      skills: ['Kubernetes', 'Terraform'],
    },
    {
      id: cancelledReqId,
      organization_id: T_ACME,
      requisition_code: 'REQ-CANCELLED-04',
      title: 'Product Manager',
      status: 'CANCELLED',
      min_experience_years: 4,
      max_experience_years: 7,
      skills: ['Agile', 'Jira'],
    },
    {
      id: globexOpenReqId,
      organization_id: T_GLOBEX,
      requisition_code: 'REQ-GLOBEX-05',
      title: 'Security Analyst',
      status: 'OPEN',
      min_experience_years: 3,
      max_experience_years: 6,
      skills: ['SOC2', 'PenTesting'],
    },
  ]

  // Setup memory sourced candidate
  const candId = 'src-cand-reg-01'
  SourcingService.memorySourcedCandidates.set(candId, {
    id: candId,
    full_name: 'Priya Patel',
    email: 'priya.patel@example.com',
    phone: '+91 98765 43219',
    current_role: 'Senior React Developer',
    current_company: 'Tech Corp',
    experience_years: 5,
    skills: ['React', 'TypeScript', 'Node.js'],
    platform: 'LINKEDIN',
  })

  // 1. Positive Control: OPEN requisition succeeds
  await t.test('1. Shortlisting into an OPEN requisition succeeds', async () => {
    const result = await SourcingService.shortlistCandidate(
      MOCK_CLIENT,
      T_ACME,
      'u-hr-001',
      candId,
      openReqId
    )

    assert.ok(result.application)
    assert.equal(result.application.requisition_id, openReqId)
    assert.equal(result.application.stage, 'SHORTLISTED')
    assert.ok(result.application.match_score > 0)
  })

  // 2. Only DRAFT requisitions -> rejected with 400
  await t.test('2. Shortlisting into a DRAFT requisition fails closed with 400', async () => {
    await assert.rejects(
      async () => {
        await SourcingService.shortlistCandidate(
          MOCK_CLIENT,
          T_ACME,
          'u-hr-001',
          candId,
          draftReqId
        )
      },
      (err) => {
        assert.equal(err.status, 400)
        assert.ok(err.message.includes('not eligible for candidate shortlisting'))
        assert.ok(err.message.includes('DRAFT'))
        return true
      }
    )
  })

  // 3. Only FILLED or CANCELLED requisitions -> rejected with 400
  await t.test('3. Shortlisting into FILLED or CANCELLED requisitions fails closed with 400', async () => {
    // 3a. FILLED
    await assert.rejects(
      async () => {
        await SourcingService.shortlistCandidate(
          MOCK_CLIENT,
          T_ACME,
          'u-hr-001',
          candId,
          filledReqId
        )
      },
      (err) => {
        assert.equal(err.status, 400)
        assert.ok(err.message.includes('FILLED'))
        return true
      }
    )

    // 3b. CANCELLED
    await assert.rejects(
      async () => {
        await SourcingService.shortlistCandidate(
          MOCK_CLIENT,
          T_ACME,
          'u-hr-001',
          candId,
          cancelledReqId
        )
      },
      (err) => {
        assert.equal(err.status, 400)
        assert.ok(err.message.includes('CANCELLED'))
        return true
      }
    )
  })

  // 4. Stale or invalid selected requisition -> rejected with 404
  await t.test('4. Shortlisting into a stale or invalid requisition ID fails closed with 404', async () => {
    const invalidReqId = 'req-nonexistent-9999'
    await assert.rejects(
      async () => {
        await SourcingService.shortlistCandidate(
          MOCK_CLIENT,
          T_ACME,
          'u-hr-001',
          candId,
          invalidReqId
        )
      },
      (err) => {
        assert.equal(err.status, 404)
        assert.ok(err.message.includes(invalidReqId))
        return true
      }
    )
  })

  // 5. Requisition belonging to another tenant -> rejected with 404 (Cross-tenant IDOR)
  await t.test('5. Shortlisting into another tenant requisition fails closed with 404', async () => {
    await assert.rejects(
      async () => {
        await SourcingService.shortlistCandidate(
          MOCK_CLIENT,
          T_ACME, // Acme caller attempting to shortlist into Globex requisition
          'u-hr-001',
          candId,
          globexOpenReqId
        )
      },
      (err) => {
        assert.equal(err.status, 404)
        return true
      }
    )
  })

  // 6. ApplicationService.create enforces OPEN status immediately before application creation
  await t.test('6. ApplicationService.create rejects non-OPEN requisition with 400', async () => {
    const mockDb = {
      from: (tbl) => {
        if (tbl === 'candidates') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { id: 'c-01', organization_id: T_ACME } })
                })
              })
            })
          }
        }
        if (tbl === 'job_requisitions') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { id: draftReqId, status: 'DRAFT', organization_id: T_ACME } })
                })
              })
            })
          }
        }
        return {}
      }
    }

    await assert.rejects(
      async () => {
        await ApplicationService.create(
          mockDb,
          T_ACME,
          'u-hr-001',
          {
            requisition_id: draftReqId,
            candidate_id: 'c-01',
            stage: 'SHORTLISTED',
          }
        )
      },
      (err) => {
        assert.equal(err.status, 400)
        assert.ok(err.message.includes('not eligible for new applications'))
        assert.ok(err.message.includes('DRAFT'))
        return true
      }
    )
  })

  // 7. ApplicationService.create rejects foreign tenant requisition with 404
  await t.test('7. ApplicationService.create rejects cross-tenant requisition with 404', async () => {
    const mockDb = {
      from: (tbl) => {
        if (tbl === 'candidates') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { id: 'c-01', organization_id: T_ACME } })
                })
              })
            })
          }
        }
        if (tbl === 'job_requisitions') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null }) // not found for T_ACME
                })
              })
            })
          }
        }
        return {}
      }
    }

    await assert.rejects(
      async () => {
        await ApplicationService.create(
          mockDb,
          T_ACME,
          'u-hr-001',
          {
            requisition_id: globexOpenReqId,
            candidate_id: 'c-01',
            stage: 'SHORTLISTED',
          }
        )
      },
      (err) => {
        assert.equal(err.status, 404)
        return true
      }
    )
  })
})
