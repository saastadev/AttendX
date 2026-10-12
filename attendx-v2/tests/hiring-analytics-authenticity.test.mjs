// ============================================================
// AttendX v2 — Hiring Module: Analytics Authenticity & Anti-Fabrication Test Suite
// Verifies:
// 1. Zero Fabrication: Empty database returns truthful 0, [], and null states
// 2. No Mock Fallbacks: No hardcoded stage durations (3.5, 1.8), fake competencies,
//    or synthetic candidate profiles
// 3. Mathematical Integrity: Authentic conversion rates, stage durations, and averages
// Non-Negotiable Charter: Zero Fabrication, Server-Side Identity
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import { AnalyticsService } from '../lib/hiring/analytics-service.ts'

// Mock Supabase Client that returns empty rows (simulating empty organization)
function createEmptyMockClient() {
  return {
    from: (table) => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        single: async () => ({ data: null, error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
        then: (resolve) => resolve({ data: [], error: null }),
      }
      return query
    }
  }
}

// Mock Supabase Client with populated realistic data
function createPopulatedMockClient() {
  const mockApps = [
    { id: 'app-1', stage: 'SOURCED', applied_at: '2026-10-01T10:00:00Z', created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z' },
    { id: 'app-2', stage: 'SHORTLISTED', applied_at: '2026-10-01T10:00:00Z', created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z' },
    { id: 'app-3', stage: 'INTERVIEW', applied_at: '2026-10-01T10:00:00Z', created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z' },
    { id: 'app-4', stage: 'ONBOARDED', applied_at: '2026-10-01T10:00:00Z', created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z' },
  ]

  const mockEvents = [
    { application_id: 'app-4', from_stage: 'SOURCED', to_stage: 'APPLIED', created_at: '2026-10-01T10:00:00Z' },
    { application_id: 'app-4', from_stage: 'APPLIED', to_stage: 'SHORTLISTED', created_at: '2026-10-02T10:00:00Z' }, // 1 day
    { application_id: 'app-4', from_stage: 'SHORTLISTED', to_stage: 'INTERVIEW', created_at: '2026-10-04T10:00:00Z' }, // 2 days
    { application_id: 'app-4', from_stage: 'INTERVIEW', to_stage: 'ONBOARDED', created_at: '2026-10-07T10:00:00Z' }, // 3 days
  ]

  const mockEvaluations = [
    {
      id: 'eval-1',
      candidate_id: 'cand-1',
      application_id: 'app-3',
      technical_score: 90,
      communication_score: 80,
      problem_solving_score: 85,
      culture_fit_score: 95,
      overall_score: 88,
      recommendation: 'STRONG_HIRE',
      created_at: '2026-10-04T12:00:00Z',
      candidate: { id: 'cand-1', first_name: 'Priya', last_name: 'Nair', email: 'priya@test.com', total_experience_years: 5 },
      application: { id: 'app-3', stage: 'INTERVIEW', requisition: { id: 'req-1', title: 'Senior Backend Engineer' } },
      interview: { id: 'int-1', round_number: 1, round_type: 'TECHNICAL', title: 'Technical System Design', scheduled_start: '2026-10-04T11:00:00Z' }
    }
  ]

  const mockRecommendations = [
    {
      id: 'rec-real-1',
      organization_id: 'org-1',
      recommendation_type: 'BOTTLENECK',
      title: 'Interview Stage Latency',
      description: 'Stage duration exceeds target SLA',
      impact_score: 88,
      status: 'PENDING',
      created_at: '2026-10-05T00:00:00Z'
    }
  ]

  return {
    from: (table) => {
      let data = []
      if (table === 'job_applications') data = mockApps
      else if (table === 'hiring_funnel_events') data = mockEvents
      else if (table === 'candidate_evaluations') data = mockEvaluations
      else if (table === 'hiring_ai_recommendations') data = mockRecommendations

      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        single: async () => ({ data: data[0] || null, error: null }),
        maybeSingle: async () => ({ data: data[0] || null, error: null }),
        then: (resolve) => resolve({ data, error: null }),
      }
      return query
    }
  }
}

test('MODULE 4 — ANALYTICS AUTHENTICITY & ZERO-FABRICATION SUITE', async (t) => {
  // ------------------------------------------------------------
  // 1. EMPTY DATABASE / ZERO-DATA INTEGRITY (RULE 1: NO FABRICATION)
  // ------------------------------------------------------------
  await t.test('AUTH-01: Empty organization returns truthful 0 candidates, hires, conversion, and time-to-hire', async () => {
    const client = createEmptyMockClient()
    const result = await AnalyticsService.getFunnelMetrics(client, 'org-empty')

    assert.equal(result.totalCandidates, 0, 'Total candidates must be 0')
    assert.equal(result.totalHires, 0, 'Total hires must be 0')
    assert.equal(result.overallConversionRate, 0, 'Overall conversion rate must be 0% (not NaN or fallback)')
    assert.equal(result.timeToHireDays, 0, 'Time to hire must be 0 days (not 14.5 or 15.3)')

    // Check all stage durations and conversion rates
    for (const stage of result.stages) {
      assert.equal(stage.count, 0, `Stage ${stage.stage} count must be 0`)
      assert.equal(stage.conversionRate, 0, `Stage ${stage.stage} conversion rate must be 0%`)
      assert.equal(stage.avgDurationDays, 0, `Stage ${stage.stage} duration must be 0 (no fake 3.5 or 1.8)`)
    }
  })

  await t.test('AUTH-02: Empty evaluations returns empty array [] (no fake benchmark scores)', async () => {
    const client = createEmptyMockClient()
    const competencies = await AnalyticsService.getCompetencyScores(client, 'org-empty')

    assert.ok(Array.isArray(competencies), 'Competencies must be an array')
    assert.equal(competencies.length, 0, 'Must be empty array when 0 evaluations exist')
  })

  await t.test('AUTH-03: Empty candidate profiles returns empty array [] (no hardcoded CANDIDATES)', async () => {
    const client = createEmptyMockClient()
    const profiles = await AnalyticsService.getCandidateEvaluationProfiles(client, 'org-empty')

    assert.ok(Array.isArray(profiles), 'Profiles must be an array')
    assert.equal(profiles.length, 0, 'Must be empty array when 0 candidate evaluations exist')
  })

  await t.test('AUTH-04: Empty AI recommendations returns empty array [] (no hardcoded suggestions)', async () => {
    const client = createEmptyMockClient()
    const recs = await AnalyticsService.getAIRecommendations(client, 'org-empty')

    assert.ok(Array.isArray(recs), 'Recommendations must be an array')
    assert.equal(recs.length, 0, 'Must be empty array when 0 recommendations exist in DB')
  })

  // ------------------------------------------------------------
  // 2. POPULATED DATABASE INTEGRITY (MATHEMATICALLY ACCURATE CALCULATIONS)
  // ------------------------------------------------------------
  await t.test('AUTH-05: Populated data computes genuine conversion rates and time-in-stage durations', async () => {
    const client = createPopulatedMockClient()
    const result = await AnalyticsService.getFunnelMetrics(client, 'org-populated')

    assert.equal(result.totalCandidates, 4, 'Should identify 4 total applications')
    assert.equal(result.totalHires, 1, 'Should identify 1 hire in ONBOARDED stage')
    assert.equal(result.overallConversionRate, 25, '1 / 4 = 25% conversion')
    assert.ok(result.timeToHireDays > 0, 'Time to hire must be positive when transitions exist')

    // Find APPLIED and SHORTLISTED stages
    const appliedStage = result.stages.find(s => s.stage === 'APPLIED')
    assert.ok(appliedStage, 'APPLIED stage exists')
    assert.ok(appliedStage.count >= 1, 'Cumulative count reflects progression')
  })

  await t.test('AUTH-06: Candidate evaluation profile extracts genuine scores, rounds, and candidate details', async () => {
    const client = createPopulatedMockClient()
    const profiles = await AnalyticsService.getCandidateEvaluationProfiles(client, 'org-populated')

    assert.equal(profiles.length, 1, 'Should return 1 candidate profile')
    const cand = profiles[0]
    assert.equal(cand.name, 'Priya Nair')
    assert.equal(cand.role, 'Senior Backend Engineer')
    assert.equal(cand.overallScore, 88)
    assert.equal(cand.badge, 'STRONG HIRE')

    // Rounds check
    assert.equal(cand.rounds.length, 1)
    assert.equal(cand.rounds[0].name, 'Technical System Design')
    assert.equal(cand.rounds[0].score, 88)

    // Competencies check
    const techComp = cand.competencies.find(c => c.name === 'Technical Skills')
    assert.ok(techComp)
    assert.equal(techComp.score, 90)
    assert.equal(techComp.target, 75)
  })

  await t.test('AUTH-07: AI recommendations returns authentic DB records when populated', async () => {
    const client = createPopulatedMockClient()
    const recs = await AnalyticsService.getAIRecommendations(client, 'org-populated')

    assert.equal(recs.length, 1)
    assert.equal(recs[0].id, 'rec-real-1')
    assert.equal(recs[0].recommendation_type, 'BOTTLENECK')
    assert.equal(recs[0].impact_score, 88)
  })
})
