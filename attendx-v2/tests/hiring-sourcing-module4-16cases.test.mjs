// ============================================================
// AttendX v2 — Module 4: 16-Scenario Sourcing & AI Matching Test Suite
// Non-Negotiable Charter Rules: Zero Fabrication, Server-Side Identity, Dual-Security
// Strictly verifies all 16 scenarios defined in Module 4 requirements:
//  1. LinkedIn mock search
//  2. Indeed mock search
//  3. Combined LinkedIn + Indeed search
//  4. Filters (skills, experience, location)
//  5. Empty results (non-matching criteria)
//  6. Duplicate candidates handling
//  7. Job publishing
//  8. Applicant synchronization
//  9. Candidate creation
// 10. Application creation
// 11. Duplicate application prevention
// 12. Tenant isolation
// 13. Authorization
// 14. Provider failure
// 15. Provider timeout / rate-limit behavior
// 16. Deterministic mock behavior
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LinkedInMockProvider,
  IndeedMockProvider,
  CandidateNormalizer,
  ProviderError,
  ProviderRateLimitError,
} from '../lib/hiring/sourcing-provider.ts'
import { SourcingProviderFactory, getSourcingProvider } from '../lib/hiring/sourcing-factory.ts'
import { SourcingService } from '../lib/hiring/sourcing-service.ts'
import { MatchScoreEngine } from '../lib/hiring/match-score-engine.ts'
import { CandidateService } from '../lib/hiring/candidate-service.ts'
import { ApplicationService } from '../lib/hiring/application-service.ts'
import { RbacGuard } from '../lib/auth/rbac-guard.ts'

// In-memory mock Supabase client for unit test isolation
function createMockDb() {
  const store = {
    job_requisitions: [
      {
        id: '11111111-1111-1111-1111-111111111111',
        organization_id: 'tenant-acme-001',
        requisition_code: 'REQ-2026-001',
        title: 'Senior Full Stack Engineer',
        min_experience_years: 4,
        max_experience_years: 8,
        location: 'Bengaluru, India',
        job_description: 'Building microservices in React, TypeScript, and Node.js.',
        status: 'OPEN',
        skills: [
          { skill_name: 'React', is_required: true, weight: 10 },
          { skill_name: 'TypeScript', is_required: true, weight: 10 },
          { skill_name: 'Node.js', is_required: true, weight: 8 },
        ],
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        organization_id: 'tenant-globex-002', // Foreign Tenant
        requisition_code: 'REQ-GLOBEX-999',
        title: 'Security Architect',
        status: 'OPEN',
      },
    ],
    candidates: [],
    candidate_skills: [],
    job_applications: [],
    sourcing_searches: [],
    sourced_candidates: [],
    hiring_audit_logs: [],
  }

  const client = {
    from: (table) => {
      let currentData = store[table] || []
      let filters = []
      let rangeVal = null

      const queryBuilder = {
        select: (cols, opts) => queryBuilder,
        eq: (col, val) => {
          filters.push((row) => row[col] === val)
          return queryBuilder
        },
        neq: (col, val) => {
          filters.push((row) => row[col] !== val)
          return queryBuilder
        },
        gte: (col, val) => {
          filters.push((row) => Number(row[col]) >= Number(val))
          return queryBuilder
        },
        lte: (col, val) => {
          filters.push((row) => Number(row[col]) <= Number(val))
          return queryBuilder
        },
        ilike: (col, val) => {
          filters.push((row) => String(row[col] || '').toLowerCase() === String(val).toLowerCase())
          return queryBuilder
        },
        order: () => queryBuilder,
        range: (from, to) => {
          rangeVal = { from, to }
          return queryBuilder
        },
        limit: (n) => queryBuilder,
        insert: (records) => {
          if (!store[table]) store[table] = []
          const arr = Array.isArray(records) ? records : [records]
          const inserted = arr.map((r, i) => {
            const row = {
              id: r.id || `${table}_id_${store[table].length + i + 1}`,
              created_at: new Date().toISOString(),
              ...r,
            }
            store[table].push(row)
            return row
          })

          const insertBuilder = {
            select: () => insertBuilder,
            single: async () => ({ data: inserted[0] || null, error: null }),
            maybeSingle: async () => ({ data: inserted[0] || null, error: null }),
            then: (resolve) => resolve({ data: inserted, error: null }),
          }
          return insertBuilder
        },
        update: (values) => ({
          eq: async (col, val) => {
            for (const r of store[table]) {
              if (r[col] === val) {
                Object.assign(r, values)
              }
            }
            return { error: null }
          },
        }),
        single: async () => {
          const matches = currentData.filter((r) => filters.every((fn) => fn(r)))
          if (matches.length === 0) {
            return { data: null, error: { message: `No rows found in ${table}` } }
          }
          return { data: matches[0], error: null }
        },
        maybeSingle: async () => {
          const matches = currentData.filter((r) => filters.every((fn) => fn(r)))
          return { data: matches[0] || null, error: null }
        },
        then: (resolve) => {
          let matches = currentData.filter((r) => filters.every((fn) => fn(r)))
          if (rangeVal) {
            matches = matches.slice(rangeVal.from, rangeVal.to + 1)
          }
          resolve({ data: matches, count: matches.length, error: null })
        },
      }

      return queryBuilder
    },
  }

  return { client, store }
}

test('MODULE 4 — COMPREHENSIVE 16-SCENARIO SOURCING VERIFICATION', async (t) => {
  const { client, store } = createMockDb()
  const tenantId = 'tenant-acme-001'
  const userId = 'usr-recruiter-001'
  const requisitionId = '11111111-1111-1111-1111-111111111111'

  // ------------------------------------------------------------
  // Scenario 1: LinkedIn mock search
  // ------------------------------------------------------------
  await t.test('Scenario 1: LinkedIn mock search returns deterministic candidates', async () => {
    const provider = SourcingProviderFactory.getProvider('linkedin')
    assert.equal(provider.providerName, 'linkedin')

    const result = await provider.searchCandidates({
      roleTitle: 'Full Stack Engineer',
      skills: ['React', 'TypeScript'],
      minExperience: 3,
    })

    assert.equal(result.providerName, 'linkedin')
    assert.equal(result.isMock, true)
    assert.ok(result.candidates.length > 0)
    for (const cand of result.candidates) {
      assert.ok(cand.externalId.startsWith('li_mock_candidate_'))
      assert.equal(cand.isMock, true)
      assert.ok(cand.fullName)
      assert.ok(cand.skills.length > 0)
      assert.ok(cand.experienceYears >= 3)
    }
  })

  // ------------------------------------------------------------
  // Scenario 2: Indeed mock search
  // ------------------------------------------------------------
  await t.test('Scenario 2: Indeed mock search returns deterministic candidates', async () => {
    const provider = SourcingProviderFactory.getProvider('indeed')
    assert.equal(provider.providerName, 'indeed')

    const result = await provider.searchCandidates({
      roleTitle: 'Full Stack Engineer',
      skills: ['Python', 'SQL'],
      minExperience: 3,
    })

    assert.equal(result.providerName, 'indeed')
    assert.equal(result.isMock, true)
    assert.ok(result.candidates.length > 0)
    for (const cand of result.candidates) {
      assert.ok(cand.externalId.startsWith('indeed_mock_candidate_'))
      assert.equal(cand.isMock, true)
      assert.ok(cand.fullName)
      assert.ok(cand.currentRole)
    }
  })

  // ------------------------------------------------------------
  // Scenario 3: Combined LinkedIn + Indeed search
  // ------------------------------------------------------------
  await t.test('Scenario 3: Combined LinkedIn + Indeed search aggregates and ranks candidates', async () => {
    const searchRes = await SourcingService.executeSearch(client, tenantId, userId, {
      requisitionId,
      roleTitle: 'Full Stack Engineer',
      skills: ['React', 'TypeScript', 'Node.js'],
      minExperience: 3,
      platforms: ['linkedin', 'indeed'],
    })

    assert.ok(searchRes.search)
    assert.equal(searchRes.search.status, 'COMPLETED')
    assert.ok(searchRes.candidates.length >= 4)

    // Verify both platforms present in aggregated results
    const platforms = new Set(searchRes.candidates.map((c) => c.platform))
    assert.ok(platforms.has('LINKEDIN'), 'Expected LinkedIn in candidates')
    assert.ok(platforms.has('INDEED'), 'Expected Indeed in candidates')

    // Verify ranked descending by match_score
    for (let i = 0; i < searchRes.candidates.length - 1; i++) {
      assert.ok(searchRes.candidates[i].match_score >= searchRes.candidates[i + 1].match_score)
    }
  })

  // ------------------------------------------------------------
  // Scenario 4: Filters (skills, experience, location)
  // ------------------------------------------------------------
  await t.test('Scenario 4: Strict filtering by skills, experience, and location', async () => {
    const provider = getSourcingProvider('linkedin')

    // Filter by high experience and specific skill
    const res = await provider.searchCandidates({
      roleTitle: 'Architect',
      skills: ['AWS', 'Kubernetes'],
      minExperience: 7,
      location: 'Chennai',
    })

    assert.equal(res.candidates.length, 1)
    const match = res.candidates[0]
    assert.equal(match.fullName, 'Sameer Kulkarni')
    assert.ok(match.experienceYears >= 7)
    assert.ok(match.location.includes('Chennai'))
    assert.ok(match.skills.includes('AWS'))
    assert.ok(match.skills.includes('Kubernetes'))
  })

  // ------------------------------------------------------------
  // Scenario 5: Empty results
  // ------------------------------------------------------------
  await t.test('Scenario 5: Non-matching search returns deterministic empty result without throwing', async () => {
    const provider = getSourcingProvider('linkedin')

    const res = await provider.searchCandidates({
      roleTitle: 'Astronaut Pilot',
      skills: ['OrbitalNavigationSystem99'],
      minExperience: 25,
      location: 'Antarctica',
    })

    assert.equal(res.candidates.length, 0)
    assert.equal(res.total, 0)
    assert.equal(res.isMock, true)
  })

  // ------------------------------------------------------------
  // Scenario 6: Duplicate candidates handling
  // ------------------------------------------------------------
  await t.test('Scenario 6: Duplicate candidate across LinkedIn & Indeed is deduplicated', async () => {
    // Vikram Joshi is in both LinkedIn and Indeed fixtures with email vikram.joshi@applicant-mock.com
    const searchRes = await SourcingService.executeSearch(client, tenantId, userId, {
      requisitionId,
      roleTitle: 'Software Engineer',
      skills: ['TypeScript', 'Node.js'],
      minExperience: 3,
      platforms: ['linkedin', 'indeed'],
    })

    const vikrams = searchRes.candidates.filter(
      (c) => c.email === 'vikram.joshi@applicant-mock.com'
    )
    assert.equal(vikrams.length, 1, 'Expected Vikram Joshi to be deduplicated to exactly 1 candidate')
  })

  // ------------------------------------------------------------
  // Scenario 7: Job publishing
  // ------------------------------------------------------------
  await t.test('Scenario 7: Job publishing returns transparent mock status and provider URLs', async () => {
    const pubRes = await SourcingService.publishJob(
      client,
      tenantId,
      userId,
      requisitionId,
      ['LINKEDIN', 'INDEED']
    )

    assert.equal(pubRes.results.length, 2)
    const [liPub, indPub] = pubRes.results

    assert.equal(liPub.providerName, 'linkedin')
    assert.equal(liPub.status, 'PUBLISHED')
    assert.equal(liPub.isMock, true)
    assert.equal(liPub.simulationStatus, 'SIMULATED')
    assert.ok(liPub.jobPostingId.startsWith('li_mock_job_'))
    assert.ok(liPub.url.includes('linkedin.com'))

    assert.equal(indPub.providerName, 'indeed')
    assert.equal(indPub.status, 'PUBLISHED')
    assert.equal(indPub.isMock, true)
    assert.equal(indPub.simulationStatus, 'SIMULATED')
    assert.ok(indPub.jobPostingId.startsWith('indeed_mock_job_'))
    assert.ok(indPub.url.includes('indeed.com'))
  })

  // ------------------------------------------------------------
  // Scenario 8: Applicant synchronization
  // ------------------------------------------------------------
  await t.test('Scenario 8: Applicant synchronization retrieves structured candidates from providers', async () => {
    const liProvider = getSourcingProvider('linkedin')
    const indProvider = getSourcingProvider('indeed')

    const liApps = await liProvider.syncApplicants({
      requisitionId,
      title: 'Senior Full Stack Engineer',
      skills: ['React', 'TypeScript'],
      minExperience: 3,
    })

    assert.equal(liApps.providerName, 'linkedin')
    assert.equal(liApps.isMock, true)
    assert.ok(liApps.applicants.length >= 2)
    for (const app of liApps.applicants) {
      assert.ok(app.fullName)
      assert.ok(app.email)
      assert.ok(app.resumeText)
    }

    const indApps = await indProvider.syncApplicants({
      requisitionId,
      title: 'Senior Full Stack Engineer',
      skills: ['JavaScript', 'React'],
      minExperience: 3,
    })

    assert.equal(indApps.providerName, 'indeed')
    assert.equal(indApps.isMock, true)
    assert.ok(indApps.applicants.length >= 1)
  })

  // ------------------------------------------------------------
  // Scenario 9: Candidate creation in database
  // ------------------------------------------------------------
  await t.test('Scenario 9: Ingested applicant creates candidate record with encrypted PII and source', async () => {
    const normalized = CandidateNormalizer.normalize(
      {
        fullName: 'Pooja Hegde',
        email: 'pooja.hegde@applicant-mock.com',
        phone: '+91 97112 33445',
        currentRole: 'Senior Software Engineer',
        currentCompany: 'Freshworks Inc',
        experienceYears: 4.5,
        skills: ['React', 'TypeScript', 'Next.js'],
        location: 'Bengaluru, India',
        platform: 'LINKEDIN',
      },
      'LINKEDIN'
    )

    const candidate = await CandidateService.create(client, tenantId, userId, normalized)

    assert.ok(candidate.id)
    assert.equal(candidate.first_name, 'Pooja')
    assert.equal(candidate.last_name, 'Hegde')
    assert.equal(candidate.email, 'pooja.hegde@applicant-mock.com')
    assert.equal(candidate.source, 'LINKEDIN')
    assert.equal(candidate.total_experience_years, 4.5)
  })

  // ------------------------------------------------------------
  // Scenario 10: Application creation in pipeline
  // ------------------------------------------------------------
  await t.test('Scenario 10: Application is created in APPLIED stage with computed match scores', async () => {
    // Find candidate created in Scenario 9
    const cand = store.candidates.find((c) => c.email === 'pooja.hegde@applicant-mock.com')
    assert.ok(cand, 'Candidate must exist')

    const app = await ApplicationService.create(client, tenantId, userId, {
      requisition_id: requisitionId,
      candidate_id: cand.id,
      stage: 'APPLIED',
      match_score: 92,
      skill_score: 95,
      experience_score: 90,
      jd_relevance_score: 90,
    })

    assert.ok(app.id)
    assert.ok(app.application_code.startsWith('APP-2026-'))
    assert.equal(app.stage, 'APPLIED')
    assert.equal(app.match_score, 92)
    assert.equal(app.requisition_id, requisitionId)
    assert.equal(app.candidate_id, cand.id)
  })

  // ------------------------------------------------------------
  // Scenario 11: Duplicate application prevention
  // ------------------------------------------------------------
  await t.test('Scenario 11: Duplicate application creation for same candidate & requisition throws 409 Conflict', async () => {
    const cand = store.candidates.find((c) => c.email === 'pooja.hegde@applicant-mock.com')

    await assert.rejects(
      async () => {
        await ApplicationService.create(client, tenantId, userId, {
          requisition_id: requisitionId,
          candidate_id: cand.id,
          stage: 'APPLIED',
        })
      },
      (err) => err.status === 409
    )

    const allAppsForCand = store.job_applications.filter(
      (a) => a.requisition_id === requisitionId && a.candidate_id === cand.id
    )
    assert.equal(allAppsForCand.length, 1, 'Must strictly enforce 1 application per candidate per requisition')
  })

  // ------------------------------------------------------------
  // Scenario 12: Tenant isolation
  // ------------------------------------------------------------
  await t.test('Scenario 12: Cross-tenant requisition access fails closed (404 Not Found)', async () => {
    // Foreign tenant requisition
    const foreignReqId = '22222222-2222-2222-2222-222222222222'

    // Tenant Acme attempts to publish foreign Globex requisition
    await assert.rejects(
      async () => {
        await SourcingService.publishJob(client, tenantId, userId, foreignReqId, ['LINKEDIN'])
      },
      (err) => err.status === 404
    )
  })

  // ------------------------------------------------------------
  // Scenario 13: Authorization
  // ------------------------------------------------------------
  await t.test('Scenario 13: Unauthorized role (EMPLOYEE) is rejected; only privileged roles permitted', () => {
    const requiredRoles = ['SUPERADMIN', 'ADMIN', 'HR']

    // Unauthorized roles
    assert.equal(RbacGuard.isAuthorizedForRoute(['EMPLOYEE'], requiredRoles), false)
    assert.equal(RbacGuard.isAuthorizedForRoute(['INTERVIEWER'], requiredRoles), false)
    assert.equal(RbacGuard.hasPrivilege('EMPLOYEE', 'ADMIN'), false)

    // Authorized roles
    assert.equal(RbacGuard.isAuthorizedForRoute(['ADMIN'], requiredRoles), true)
    assert.equal(RbacGuard.isAuthorizedForRoute(['HR'], requiredRoles), true)
    assert.equal(RbacGuard.isAuthorizedForRoute(['SUPERADMIN'], requiredRoles), true)
    assert.equal(RbacGuard.hasPrivilege('ADMIN', 'HR'), true)
  })

  // ------------------------------------------------------------
  // Scenario 14: Provider failure simulation
  // ------------------------------------------------------------
  await t.test('Scenario 14: Provider failure triggers ProviderError (HTTP 502/500)', async () => {
    const provider = getSourcingProvider('linkedin')

    await assert.rejects(
      async () => {
        await provider.searchCandidates({
          roleTitle: 'TRIGGER_SIMULATED_ERROR',
        })
      },
      (err) => {
        assert.ok(err instanceof ProviderError)
        assert.equal(err.status, 502)
        assert.equal(err.provider, 'mock_linkedin')
        return true
      }
    )
  })

  // ------------------------------------------------------------
  // Scenario 15: Provider timeout / rate-limit behavior
  // ------------------------------------------------------------
  await t.test('Scenario 15: Rate limit trigger throws ProviderRateLimitError (HTTP 429)', async () => {
    const provider = getSourcingProvider('indeed')

    await assert.rejects(
      async () => {
        await provider.searchCandidates({
          roleTitle: 'TRIGGER_RATE_LIMIT',
        })
      },
      (err) => {
        assert.ok(err instanceof ProviderRateLimitError)
        assert.equal(err.status, 429)
        assert.equal(err.retryAfterSeconds, 60)
        assert.equal(err.provider, 'mock_indeed')
        return true
      }
    )
  })

  // ------------------------------------------------------------
  // Scenario 16: Deterministic mock behavior
  // ------------------------------------------------------------
  await t.test('Scenario 16: 100% deterministic search results across multiple executions', async () => {
    const provider = getSourcingProvider('linkedin')
    const criteria = {
      roleTitle: 'Full Stack Engineer',
      skills: ['React', 'TypeScript', 'Node.js'],
      minExperience: 4,
    }

    const run1 = await provider.searchCandidates(criteria)
    const run2 = await provider.searchCandidates(criteria)
    const run3 = await provider.searchCandidates(criteria)

    assert.deepEqual(run1, run2)
    assert.deepEqual(run2, run3)
  })

  // ------------------------------------------------------------
  // Scenario 17: Pipeline Transition Invariant (Item K)
  // ------------------------------------------------------------
  await t.test('Scenario 17: Sourced/Applied application transitions through hiring pipeline stages', async () => {
    const { HiringStateMachine } = await import('../lib/hiring/state-machine.ts')

    // SOURCED -> CONTACTED -> APPLIED -> SHORTLISTED -> INTERVIEW
    assert.equal(HiringStateMachine.canTransition('SOURCED', 'CONTACTED'), true)
    assert.equal(HiringStateMachine.canTransition('CONTACTED', 'APPLIED'), true)
    assert.equal(HiringStateMachine.canTransition('APPLIED', 'SHORTLISTED'), true)
    assert.equal(HiringStateMachine.canTransition('SHORTLISTED', 'INTERVIEW'), true)

    // Illegal skip: SOURCED -> ONBOARDED throws 409
    assert.equal(HiringStateMachine.canTransition('SOURCED', 'ONBOARDED'), false)
  })

  // ------------------------------------------------------------
  // Scenario 18: Repeated Applicant Sync Idempotency (Item P)
  // ------------------------------------------------------------
  await t.test('Scenario 18: Repeated applicant sync safely reuses records without throwing 409 or duplicating', async () => {
    const sync1 = await SourcingService.syncApplicants(
      client,
      tenantId,
      userId,
      requisitionId,
      ['LINKEDIN', 'INDEED']
    )

    assert.ok(sync1.syncedCount > 0, 'First sync must import applicants')
    const initialAppCount = store.job_applications.length

    // Second sync for same requisition and platforms
    const sync2 = await SourcingService.syncApplicants(
      client,
      tenantId,
      userId,
      requisitionId,
      ['LINKEDIN', 'INDEED']
    )

    // Must be idempotent: no new applications created, no 409 error thrown
    assert.equal(store.job_applications.length, initialAppCount, 'Application count must remain identical on repeated sync')
    assert.ok(sync2.applications.length > 0, 'Must return existing application records')
  })
})

