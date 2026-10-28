// ============================================================
// AttendX v2 — Hiring Module: AI Recommendations & Human Review Test Suite
// Verifies:
// 1. Zero Fabrication: Empty database returns [] (no placeholders/demos)
// 2. Data-Driven Triggers: BOTTLENECK, SOURCING_GAP, CANDIDATE_NEXT_STEP
// 3. Mathematical Traceability: Deterministic impact scores
// 4. Category Integrity: SALARY_BENCHMARK explicitly returns 0 records
// 5. Idempotent Deduplication: Re-running sync does not duplicate pending records
// 6. Human Review & Audit: Status transitions, tenant isolation, fail-closed 404
// Non-Negotiable Charter: Zero Fabrication, Server-Side Identity
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import { AnalyticsService } from '../lib/hiring/analytics-service.ts'

// Mock Supabase Client for empty database (simulating brand-new organization)
function createEmptyMockClient() {
  return {
    from: (table) => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        insert: async (rows) => ({ data: rows, error: null }),
        update: () => query,
        single: async () => ({ data: null, error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
        then: (resolve) => resolve({ data: [], error: null }),
      }
      return query
    }
  }
}

// In-Memory Database Mock for full pipeline and review lifecycle testing
function createInMemoryRecommendationsClient() {
  const db = {
    hiring_funnel_events: [],
    job_applications: [],
    job_requisitions: [
      { id: 'req-backend', organization_id: 'org-alpha', title: 'Senior Backend Engineer' },
      { id: 'req-frontend', organization_id: 'org-alpha', title: 'Lead Frontend Architect' },
      { id: 'req-beta', organization_id: 'org-beta', title: 'DevOps Engineer' },
    ],
    candidates: [
      { id: 'cand-1', organization_id: 'org-alpha', first_name: 'Aditi', last_name: 'Sharma' },
      { id: 'cand-2', organization_id: 'org-alpha', first_name: 'Rahul', last_name: 'Verma' },
    ],
    sourcing_searches: [],
    sourced_candidates: [],
    candidate_evaluations: [],
    hiring_ai_recommendations: [],
    hiring_audit_logs: [],
  }

  const client = {
    _db: db,
    from: (table) => {
      let currentTable = table
      let filters = []
      let selectFields = '*'
      let orderField = null
      let isSingle = false

      const builder = {
        select: (fields = '*') => {
          selectFields = fields
          return builder
        },
        eq: (col, val) => {
          filters.push({ col, val })
          return builder
        },
        order: (col, opts) => {
          orderField = col
          return builder
        },
        insert: (records) => {
          const arr = Array.isArray(records) ? records : [records]
          const inserted = arr.map((r, idx) => ({
            id: r.id || `rec-${Date.now()}-${idx}-${Math.random().toString(36).substring(7)}`,
            created_at: r.created_at || new Date().toISOString(),
            status: r.status || 'PENDING',
            ...r,
          }))
          db[currentTable].push(...inserted)
          const result = { data: Array.isArray(records) ? inserted : inserted[0], error: null }
          return {
            ...result,
            select: () => ({
              single: async () => ({ data: inserted[0], error: null }),
              then: (resolve) => resolve({ data: inserted, error: null }),
            }),
            then: (resolve) => resolve(result),
          }
        },
        update: (updates) => {
          return {
            eq: (col1, val1) => {
              return {
                eq: (col2, val2) => {
                  return {
                    select: () => ({
                      single: async () => {
                        const target = db[currentTable].find(r => r[col1] === val1 && r[col2] === val2)
                        if (!target) {
                          return { data: null, error: { message: 'Row not found' } }
                        }
                        Object.assign(target, updates)
                        return { data: target, error: null }
                      }
                    })
                  }
                }
              }
            }
          }
        },
        single: async () => {
          let rows = db[currentTable] || []
          for (const f of filters) {
            rows = rows.filter(r => r[f.col] === f.val)
          }
          if (rows.length === 0) {
            return { data: null, error: { message: 'Row not found' } }
          }
          return { data: rows[0], error: null }
        },
        then: (resolve) => {
          let rows = [...(db[currentTable] || [])]
          for (const f of filters) {
            rows = rows.filter(r => r[f.col] === f.val)
          }

          // Hydrate joins for test expectations
          if (currentTable === 'candidate_evaluations') {
            rows = rows.map(ev => ({
              ...ev,
              candidate: db.candidates.find(c => c.id === ev.candidate_id),
              application: (() => {
                const app = db.job_applications.find(a => a.id === ev.application_id)
                if (!app) return null
                return {
                  ...app,
                  requisition: db.job_requisitions.find(r => r.id === app.requisition_id)
                }
              })()
            }))
          }

          if (currentTable === 'sourcing_searches') {
            rows = rows.map(s => ({
              ...s,
              requisition: db.job_requisitions.find(r => r.id === s.requisition_id)
            }))
          }

          if (currentTable === 'hiring_ai_recommendations') {
            rows = rows.map(rec => ({
              ...rec,
              requisition: db.job_requisitions.find(r => r.id === rec.requisition_id)
            }))
          }

          resolve({ data: rows, error: null })
        }
      }

      return builder
    }
  }

  return client
}

test('MODULE 4 — AI HIRING RECOMMENDATIONS & HUMAN REVIEW SUITE', async (t) => {

  await t.test('SCENARIO 1 (Zero-Fabrication): Empty organization returns exactly [] recommendations', async () => {
    const emptyClient = createEmptyMockClient()
    const recs = await AnalyticsService.getAIRecommendations(emptyClient, 'org-empty')
    assert.deepEqual(recs, [], 'Must return empty array [] when no recommendations exist')

    const generated = await AnalyticsService.generateAndSyncRecommendations(emptyClient, 'org-empty')
    assert.deepEqual(generated, [], 'Must not fabricate placeholder or demo recommendations')
  })

  await t.test('SCENARIO 2 (Bottleneck Generation): High stage duration generates BOTTLENECK with deterministic score', async () => {
    const client = createInMemoryRecommendationsClient()

    // Seed 2 applications with high duration in INTERVIEW stage (4.0 days)
    client._db.job_applications.push(
      { id: 'app-1', organization_id: 'org-alpha', stage: 'INTERVIEW' },
      { id: 'app-2', organization_id: 'org-alpha', stage: 'INTERVIEW' }
    )

    // App 1: INTERVIEW stage duration 4.0 days
    client._db.hiring_funnel_events.push(
      { application_id: 'app-1', organization_id: 'org-alpha', from_stage: 'SHORTLISTED', to_stage: 'INTERVIEW', created_at: '2026-10-01T10:00:00Z' },
      { application_id: 'app-1', organization_id: 'org-alpha', from_stage: 'INTERVIEW', to_stage: 'SELECTED', created_at: '2026-10-05T10:00:00Z' }
    )
    // App 2: INTERVIEW stage duration 4.0 days
    client._db.hiring_funnel_events.push(
      { application_id: 'app-2', organization_id: 'org-alpha', from_stage: 'SHORTLISTED', to_stage: 'INTERVIEW', created_at: '2026-10-01T10:00:00Z' },
      { application_id: 'app-2', organization_id: 'org-alpha', from_stage: 'INTERVIEW', to_stage: 'SELECTED', created_at: '2026-10-05T10:00:00Z' }
    )

    const recs = await AnalyticsService.generateAndSyncRecommendations(client, 'org-alpha')
    const bottleneck = recs.find(r => r.recommendation_type === 'BOTTLENECK')

    assert.ok(bottleneck, 'Expected BOTTLENECK recommendation to be generated')
    assert.match(bottleneck.title, /Interview Stage/i)
    assert.equal(bottleneck.status, 'PENDING')
    // Deterministic formula: min(99, round(50 + 4.0 * 10)) = 90
    assert.equal(bottleneck.impact_score, 90, 'Deterministic impact score must equal 90')
  })

  await t.test('SCENARIO 3 (Bottleneck Below Threshold): Fast stage duration (< 3.0 days) does NOT trigger bottleneck', async () => {
    const client = createInMemoryRecommendationsClient()

    client._db.job_applications.push(
      { id: 'app-fast-1', organization_id: 'org-alpha', stage: 'SHORTLISTED' },
      { id: 'app-fast-2', organization_id: 'org-alpha', stage: 'SHORTLISTED' }
    )

    // Duration is only 1.0 day
    client._db.hiring_funnel_events.push(
      { application_id: 'app-fast-1', organization_id: 'org-alpha', from_stage: 'APPLIED', to_stage: 'SHORTLISTED', created_at: '2026-10-01T10:00:00Z' },
      { application_id: 'app-fast-1', organization_id: 'org-alpha', from_stage: 'SHORTLISTED', to_stage: 'INTERVIEW', created_at: '2026-10-02T10:00:00Z' },
      { application_id: 'app-fast-2', organization_id: 'org-alpha', from_stage: 'APPLIED', to_stage: 'SHORTLISTED', created_at: '2026-10-01T10:00:00Z' },
      { application_id: 'app-fast-2', organization_id: 'org-alpha', from_stage: 'SHORTLISTED', to_stage: 'INTERVIEW', created_at: '2026-10-02T10:00:00Z' }
    )

    const recs = await AnalyticsService.generateAndSyncRecommendations(client, 'org-alpha')
    const bottleneck = recs.find(r => r.recommendation_type === 'BOTTLENECK')
    assert.equal(bottleneck, undefined, 'Must not generate BOTTLENECK when duration is under 3.0 days')
  })

  await t.test('SCENARIO 4 (Sourcing Gap Generation): Low match score (< 65%) generates SOURCING_GAP recommendation', async () => {
    const client = createInMemoryRecommendationsClient()

    client._db.sourcing_searches.push({
      id: 'search-1',
      organization_id: 'org-alpha',
      requisition_id: 'req-backend',
      search_title: 'Senior Backend Sourcing',
    })

    // Sourced candidates with average match score of (50 + 40) / 2 = 45%
    client._db.sourced_candidates.push(
      { id: 'sc-1', organization_id: 'org-alpha', requisition_id: 'req-backend', match_score: 50 },
      { id: 'sc-2', organization_id: 'org-alpha', requisition_id: 'req-backend', match_score: 40 }
    )

    const recs = await AnalyticsService.generateAndSyncRecommendations(client, 'org-alpha')
    const gap = recs.find(r => r.recommendation_type === 'SOURCING_GAP')

    assert.ok(gap, 'Expected SOURCING_GAP recommendation to be generated')
    assert.match(gap.title, /Senior Backend Engineer/i)
    assert.equal(gap.requisition_id, 'req-backend')
    // Deterministic formula: max(50, min(95, round(100 - 45))) = 55
    assert.equal(gap.impact_score, 55, 'Deterministic impact score must equal 55')
  })

  await t.test('SCENARIO 5 (Sourcing Gap Below Threshold): High match score (>= 65%) does NOT trigger sourcing gap', async () => {
    const client = createInMemoryRecommendationsClient()

    client._db.sourcing_searches.push({
      id: 'search-2',
      organization_id: 'org-alpha',
      requisition_id: 'req-frontend',
      search_title: 'Lead Frontend Sourcing',
    })

    // Sourced candidates with high match score: 85% and 80% (avg 82.5%)
    client._db.sourced_candidates.push(
      { id: 'sc-3', organization_id: 'org-alpha', requisition_id: 'req-frontend', match_score: 85 },
      { id: 'sc-4', organization_id: 'org-alpha', requisition_id: 'req-frontend', match_score: 80 }
    )

    const recs = await AnalyticsService.generateAndSyncRecommendations(client, 'org-alpha')
    const gap = recs.find(r => r.recommendation_type === 'SOURCING_GAP' && r.requisition_id === 'req-frontend')
    assert.equal(gap, undefined, 'Must not generate SOURCING_GAP when match score exceeds 65%')
  })

  await t.test('SCENARIO 6 (Candidate Next Step Generation): High evaluation score (>= 80) recommends candidate advancement', async () => {
    const client = createInMemoryRecommendationsClient()

    client._db.job_applications.push({
      id: 'app-cand-1',
      organization_id: 'org-alpha',
      candidate_id: 'cand-1',
      requisition_id: 'req-backend',
      stage: 'INTERVIEW',
    })

    client._db.candidate_evaluations.push({
      id: 'eval-cand-1',
      organization_id: 'org-alpha',
      application_id: 'app-cand-1',
      candidate_id: 'cand-1',
      overall_score: 92,
      recommendation: 'STRONG_HIRE',
    })

    const recs = await AnalyticsService.generateAndSyncRecommendations(client, 'org-alpha')
    const nextStep = recs.find(r => r.recommendation_type === 'CANDIDATE_NEXT_STEP')

    assert.ok(nextStep, 'Expected CANDIDATE_NEXT_STEP recommendation to be generated')
    assert.match(nextStep.title, /Advance Aditi Sharma/i)
    assert.match(nextStep.description, /Senior Backend Engineer/i)
    assert.equal(nextStep.impact_score, 92, 'Deterministic impact score matches evaluation score')
  })

  await t.test('SCENARIO 7 (Candidate Next Step Below Threshold): Evaluation score < 80 does not generate promotion', async () => {
    const client = createInMemoryRecommendationsClient()

    client._db.job_applications.push({
      id: 'app-cand-2',
      organization_id: 'org-alpha',
      candidate_id: 'cand-2',
      requisition_id: 'req-backend',
      stage: 'INTERVIEW',
    })

    client._db.candidate_evaluations.push({
      id: 'eval-cand-2',
      organization_id: 'org-alpha',
      application_id: 'app-cand-2',
      candidate_id: 'cand-2',
      overall_score: 72,
      recommendation: 'MAYBE',
    })

    const recs = await AnalyticsService.generateAndSyncRecommendations(client, 'org-alpha')
    const nextStep = recs.find(r => r.recommendation_type === 'CANDIDATE_NEXT_STEP' && r.description.includes('Rahul Verma'))
    assert.equal(nextStep, undefined, 'Must not recommend candidate advancement when score is below 80 and not STRONG_HIRE')
  })

  await t.test('SCENARIO 8 (Salary Benchmark): Explicitly unsupported (Zero Fabrication)', async () => {
    const client = createInMemoryRecommendationsClient()
    const recs = await AnalyticsService.generateAndSyncRecommendations(client, 'org-alpha')
    const salaryRecs = recs.filter(r => r.recommendation_type === 'SALARY_BENCHMARK')
    assert.equal(salaryRecs.length, 0, 'Must produce 0 SALARY_BENCHMARK recommendations due to absence of market compensation table')
  })

  await t.test('SCENARIO 9 (Idempotent Deduplication): Re-running sync does not duplicate active pending recommendations', async () => {
    const client = createInMemoryRecommendationsClient()

    client._db.job_applications.push({
      id: 'app-dup',
      organization_id: 'org-alpha',
      candidate_id: 'cand-1',
      requisition_id: 'req-backend',
      stage: 'INTERVIEW',
    })
    client._db.candidate_evaluations.push({
      id: 'eval-dup',
      organization_id: 'org-alpha',
      application_id: 'app-dup',
      candidate_id: 'cand-1',
      overall_score: 95,
      recommendation: 'STRONG_HIRE',
    })

    // First execution
    const run1 = await AnalyticsService.generateAndSyncRecommendations(client, 'org-alpha')
    const count1 = run1.filter(r => r.recommendation_type === 'CANDIDATE_NEXT_STEP').length
    assert.equal(count1, 1, 'First run creates 1 recommendation')

    // Second execution
    const run2 = await AnalyticsService.generateAndSyncRecommendations(client, 'org-alpha')
    const count2 = run2.filter(r => r.recommendation_type === 'CANDIDATE_NEXT_STEP').length
    assert.equal(count2, 1, 'Second run must not duplicate existing pending recommendation')
  })

  await t.test('SCENARIO 10 (Human Review ACCEPT): Review mutation marks status ACCEPTED with notes and audit record', async () => {
    const client = createInMemoryRecommendationsClient()

    client._db.hiring_ai_recommendations.push({
      id: 'rec-test-1',
      organization_id: 'org-alpha',
      recommendation_type: 'BOTTLENECK',
      title: 'Interview Stage Bottleneck',
      description: 'Long delay',
      impact_score: 85,
      status: 'PENDING',
      created_at: new Date().toISOString(),
    })

    const reviewerId = 'usr-hr-lead-1'
    const updated = await AnalyticsService.reviewRecommendation(client, {
      organizationId: 'org-alpha',
      recommendationId: 'rec-test-1',
      reviewerId,
      status: 'ACCEPTED',
      reviewNotes: 'Approved adding 2 additional interview panel members.',
    })

    assert.equal(updated.status, 'ACCEPTED')
    assert.equal(updated.reviewed_by, reviewerId)
    assert.equal(updated.review_notes, 'Approved adding 2 additional interview panel members.')
    assert.ok(updated.reviewed_at)

    // Verify audit log entry
    const auditLogs = client._db.hiring_audit_logs
    const log = auditLogs.find(l => l.entity_id === 'rec-test-1')
    assert.ok(log, 'Audit log entry must be created')
    assert.equal(log.action, 'RECOMMENDATION_REVIEWED')
    assert.equal(log.user_id, reviewerId)
    assert.equal(log.old_values.status, 'PENDING')
    assert.equal(log.new_values.status, 'ACCEPTED')
  })

  await t.test('SCENARIO 11 (Human Review REJECT): Review mutation marks status REJECTED with notes', async () => {
    const client = createInMemoryRecommendationsClient()

    client._db.hiring_ai_recommendations.push({
      id: 'rec-test-2',
      organization_id: 'org-alpha',
      recommendation_type: 'SOURCING_GAP',
      title: 'Sourcing Gap',
      description: 'Low match score',
      impact_score: 60,
      status: 'PENDING',
      created_at: new Date().toISOString(),
    })

    const reviewerId = 'usr-manager-1'
    const updated = await AnalyticsService.reviewRecommendation(client, {
      organizationId: 'org-alpha',
      recommendationId: 'rec-test-2',
      reviewerId,
      status: 'REJECTED',
      reviewNotes: 'Role requirements are non-standard by design for niche pilot.',
    })

    assert.equal(updated.status, 'REJECTED')
    assert.equal(updated.reviewed_by, reviewerId)
    assert.equal(updated.review_notes, 'Role requirements are non-standard by design for niche pilot.')
  })

  await t.test('SCENARIO 12 (Invalid Status Validation): Rejects invalid status with 400', async () => {
    const client = createInMemoryRecommendationsClient()

    await assert.rejects(
      async () => {
        await AnalyticsService.reviewRecommendation(client, {
          organizationId: 'org-alpha',
          recommendationId: 'rec-test-1',
          reviewerId: 'usr-1',
          status: 'INVALID_STATUS',
        })
      },
      (err) => {
        assert.equal(err.status, 400)
        assert.match(err.message, /Invalid status/i)
        return true
      }
    )
  })

  await t.test('SCENARIO 13 (Strict Tenant Isolation): Reviewing another tenant recommendation throws 404', async () => {
    const client = createInMemoryRecommendationsClient()

    // Recommendation belongs to org-beta
    client._db.hiring_ai_recommendations.push({
      id: 'rec-beta-1',
      organization_id: 'org-beta',
      recommendation_type: 'BOTTLENECK',
      title: 'Beta Bottleneck',
      description: 'Beta delay',
      impact_score: 75,
      status: 'PENDING',
      created_at: new Date().toISOString(),
    })

    // Caller from org-alpha attempts to mutate it
    await assert.rejects(
      async () => {
        await AnalyticsService.reviewRecommendation(client, {
          organizationId: 'org-alpha', // Cross-tenant attempt
          recommendationId: 'rec-beta-1',
          reviewerId: 'usr-attacker',
          status: 'ACCEPTED',
        })
      },
      (err) => {
        assert.equal(err.status, 404, 'Must fail-closed with 404 Not Found')
        return true
      }
    )
  })

  await t.test('SCENARIO 14 (Non-Existent Recommendation): Throws 404 Not Found', async () => {
    const client = createInMemoryRecommendationsClient()

    await assert.rejects(
      async () => {
        await AnalyticsService.reviewRecommendation(client, {
          organizationId: 'org-alpha',
          recommendationId: 'non-existent-rec-id',
          reviewerId: 'usr-1',
          status: 'ACCEPTED',
        })
      },
      (err) => {
        assert.equal(err.status, 404)
        return true
      }
    )
  })

  await t.test('SCENARIO 15 (Positive Control for Tenant Isolation): Reviewing own tenant recommendation succeeds', async () => {
    const client = createInMemoryRecommendationsClient()

    client._db.hiring_ai_recommendations.push({
      id: 'rec-alpha-valid',
      organization_id: 'org-alpha',
      recommendation_type: 'BOTTLENECK',
      title: 'Alpha Bottleneck',
      description: 'Alpha delay',
      impact_score: 75,
      status: 'PENDING',
      created_at: new Date().toISOString(),
    })

    const updated = await AnalyticsService.reviewRecommendation(client, {
      organizationId: 'org-alpha',
      recommendationId: 'rec-alpha-valid',
      reviewerId: 'usr-alpha-hr',
      status: 'ACCEPTED',
      reviewNotes: 'Authorized by Alpha HR lead',
    })

    assert.equal(updated.status, 'ACCEPTED')
    assert.equal(updated.organization_id, 'org-alpha')
    assert.equal(updated.reviewed_by, 'usr-alpha-hr')
  })

  await t.test('SCENARIO 16 (Server-Side Identity): reviewed_by is strictly authoritative from caller', async () => {
    const client = createInMemoryRecommendationsClient()

    client._db.hiring_ai_recommendations.push({
      id: 'rec-auth-1',
      organization_id: 'org-alpha',
      recommendation_type: 'CANDIDATE_NEXT_STEP',
      title: 'Advance Candidate',
      description: 'Ready for offer',
      impact_score: 88,
      status: 'PENDING',
      created_at: new Date().toISOString(),
    })

    // Authoritative caller is usr-real-admin, spoofed payload cannot override it
    const authoritativeCallerId = 'usr-real-admin'
    const updated = await AnalyticsService.reviewRecommendation(client, {
      organizationId: 'org-alpha',
      recommendationId: 'rec-auth-1',
      reviewerId: authoritativeCallerId,
      status: 'ACCEPTED',
      reviewNotes: 'Verified credential and interview notes',
    })

    assert.equal(updated.reviewed_by, 'usr-real-admin', 'reviewed_by must match authoritative caller ID')
    const log = client._db.hiring_audit_logs.find(l => l.entity_id === 'rec-auth-1')
    assert.equal(log.user_id, 'usr-real-admin', 'Audit log must record authoritative caller ID')
  })

  await t.test('SCENARIO 17 (LIVE MODE + DB FAILURE): PostgreSQL failure throws explicit error, NEVER returns mock data', async () => {
    // Failing DB client simulating network timeout / DB down
    const failingDbClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: null, error: { message: 'connection to server at "postgres:5432" failed: Connection refused' } }),
            eq: () => Promise.resolve({ data: null, error: { message: 'connection to server at "postgres:5432" failed: Connection refused' } })
          })
        }),
        insert: () => Promise.resolve({ data: null, error: { message: 'connection to server at "postgres:5432" failed: Connection refused' } })
      })
    }

    // Must throw explicit error on getAIRecommendations
    await assert.rejects(
      async () => {
        await AnalyticsService.getAIRecommendations(failingDbClient, 'org-live-prod')
      },
      (err) => {
        assert.match(err.message, /Database error querying recommendations/i)
        assert.match(err.message, /Connection refused/i)
        return true
      },
      'Must throw explicit database error on DB failure instead of returning mock data'
    )

    // Must throw explicit error on generateAndSyncRecommendations
    await assert.rejects(
      async () => {
        await AnalyticsService.generateAndSyncRecommendations(failingDbClient, 'org-live-prod')
      },
      (err) => {
        assert.match(err.message, /Database error/i)
        return true
      },
      'Must throw explicit database error on DB failure instead of silently falling back to mock store'
    )
  })

  await t.test('SCENARIO 18 (LIVE MODE + EMPTY DB): Connected DB with 0 rows returns exactly [], never synthetic cards', async () => {
    // Connected DB client returning 0 rows with error: null
    const connectedEmptyDbClient = {
      from: () => {
        const q = {
          select: () => q,
          eq: () => q,
          order: () => q,
          then: (resolve) => resolve({ data: [], error: null })
        }
        return q
      }
    }

    const recs = await AnalyticsService.getAIRecommendations(connectedEmptyDbClient, 'org-live-empty')
    assert.deepEqual(recs, [], 'Connected DB with zero rows must return truthful []')
  })

  await t.test('SCENARIO 19 (MOCK MODE): Explicit mock store usage conforms to canonical schema and supports empty tenants', async () => {
    const { mockHiringStore } = await import('../lib/hiring/mock-store.ts')
    
    // Seeded mock tenant
    const seeded = mockHiringStore.getRecommendations('aa000000-0000-0000-0000-0000000000a1').recommendations
    assert.ok(seeded.length > 0, 'Seeded mock tenant returns recommendations')
    for (const r of seeded) {
      assert.ok(r.recommendation_type, 'Must have canonical recommendation_type')
      assert.equal(r.type, undefined, 'Must NOT contain legacy type field')
      assert.equal(r.impact, undefined, 'Must NOT contain legacy impact field')
      assert.ok(typeof r.impact_score === 'number', 'Must have numeric impact_score')
    }

    // Explicit empty tenant in mock store
    const emptyTenantRecs = mockHiringStore.getRecommendations('empty-tenant-000').recommendations
    assert.deepEqual(emptyTenantRecs, [], 'Empty tenant in mock store must return truthful []')
  })
})

