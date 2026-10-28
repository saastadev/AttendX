// ============================================================
// AttendX v2 — Module 4: Real Database Sourcing & RLS Test Suite
// Executes against live PostgreSQL (postgresql://localhost:5432/attendx_test)
// Tests:
//   A. Mode 1 Job Posting (LinkedIn + Indeed Mocks)
//   B. Mode 1 Applicant Synchronization
//   C. Real Candidate & Job Application Table Persistence
//   D. Composite Uniqueness Constraint (uq_app_candidate_requisition)
//   E. Mode 2 Recruiter Candidate Discovery & Deduplication
//   F. AI Match Scoring against live Requisition requirements
//   G. Mode 2 Sourced Candidate Shortlisting into Pipeline
//   H. Hiring Pipeline State Transitions (17-stage state machine)
//   I. Real PostgreSQL RLS Tenant Isolation (Positive Controls Mandatory)
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import { Client } from 'pg'
import {
  LinkedInMockProvider,
  IndeedMockProvider,
  CandidateNormalizer,
} from '../../lib/hiring/sourcing-provider.ts'
import { MatchScoreEngine } from '../../lib/hiring/match-score-engine.ts'
import { HiringStateMachine } from '../../lib/hiring/state-machine.ts'

const DB_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/attendx_test'

const T_ACME = 'aa000000-0000-0000-0000-0000000000a1'
const T_GLOBEX = 'bb000000-0000-0000-0000-0000000000b2'

const U = {
  anitaHR: 'a0000003-0000-0000-0000-000000000003',
  adamAdm: 'a0000004-0000-0000-0000-000000000004',
  biancaHR: 'b0000003-0000-0000-0000-000000000003',
}

async function asUser(client, uid, sql, params = [], tenantClaim = null) {
  await client.query('BEGIN')
  try {
    await client.query('SET LOCAL ROLE authenticated')
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid])
    await client.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`)
    if (tenantClaim) {
      await client.query(`SELECT set_config('request.jwt.claim.tenant_id', $1, true)`, [tenantClaim])
    }
    const res = await client.query(sql, params)
    await client.query('ROLLBACK')
    return res
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  }
}

test('MODULE 4 — REAL DATABASE SOURCING & ISOLATION SUITE', async (t) => {
  const client = new Client({ connectionString: DB_URL, connectionTimeoutMillis: 5000 })
  await client.connect()

  let testRequisitionId = null
  let testCandidateId = null
  let testApplicationId = null

  t.after(async () => {
    // Cleanup rows created during test
    if (testApplicationId) {
      await client.query('DELETE FROM job_applications WHERE id = $1', [testApplicationId]).catch(() => {})
    }
    if (testCandidateId) {
      await client.query('DELETE FROM candidates WHERE id = $1', [testCandidateId]).catch(() => {})
    }
    if (testRequisitionId) {
      await client.query('DELETE FROM job_requisitions WHERE id = $1', [testRequisitionId]).catch(() => {})
    }
    await client.end()
  })

  // ------------------------------------------------------------
  // Test 1: Real Database Requisition Persistence
  // ------------------------------------------------------------
  await t.test('1. Job Requisition creation in live PostgreSQL', async () => {
    const code = `REQ-TEST-${Date.now().toString().slice(-4)}`
    const insertRes = await client.query(`
      INSERT INTO job_requisitions (
        organization_id, requisition_code, title, status, priority,
        openings_count, min_experience_years, max_experience_years,
        min_salary, max_salary, location, employment_type, job_description
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
      ) RETURNING id, requisition_code, title;
    `, [
      T_ACME, code, 'Lead Cloud Architect', 'OPEN', 'HIGH',
      2, 5, 10, 2500000, 3500000, 'Bengaluru, India', 'FULL_TIME',
      'Architecting resilient distributed microservices with React and Node.js'
    ])

    assert.equal(insertRes.rowCount, 1)
    testRequisitionId = insertRes.rows[0].id
    assert.ok(testRequisitionId)
    assert.equal(insertRes.rows[0].requisition_code, code)
  })

  // ------------------------------------------------------------
  // Test 2: Mode 1 Job Posting to Mock Providers
  // ------------------------------------------------------------
  await t.test('2. Mode 1: Deterministic mock job publishing', async () => {
    const li = new LinkedInMockProvider()
    const ind = new IndeedMockProvider()

    const reqPayload = {
      requisitionId: testRequisitionId,
      requisitionCode: 'REQ-LIVE-001',
      title: 'Lead Cloud Architect',
      skills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL'],
      minExperience: 5,
      maxExperience: 10,
    }

    const liRes = await li.publishJob(reqPayload)
    assert.equal(liRes.providerName, 'linkedin')
    assert.equal(liRes.status, 'PUBLISHED')
    assert.equal(liRes.isMock, true)
    assert.equal(liRes.simulationStatus, 'SIMULATED')
    assert.ok(liRes.jobPostingId.startsWith('li_mock_job_'))

    const indRes = await ind.publishJob(reqPayload)
    assert.equal(indRes.providerName, 'indeed')
    assert.equal(indRes.status, 'PUBLISHED')
    assert.equal(indRes.isMock, true)
    assert.equal(indRes.simulationStatus, 'SIMULATED')
    assert.ok(indRes.jobPostingId.startsWith('indeed_mock_job_'))
  })

  // ------------------------------------------------------------
  // Test 3: Mode 1 Applicant Synchronization & Candidate Persistence
  // ------------------------------------------------------------
  await t.test('3. Mode 1: Sync applicants into live candidates & job_applications', async () => {
    const li = new LinkedInMockProvider()
    const syncRes = await li.syncApplicants({
      requisitionId: testRequisitionId,
      title: 'Lead Cloud Architect',
      skills: ['React', 'TypeScript'],
      minExperience: 4,
    })

    assert.ok(syncRes.applicants.length >= 1)
    const firstApplicant = syncRes.applicants[0]

    const normalized = CandidateNormalizer.normalize({
      fullName: firstApplicant.fullName,
      email: firstApplicant.email,
      phone: firstApplicant.phone,
      currentRole: firstApplicant.currentRole,
      currentCompany: firstApplicant.currentCompany,
      experienceYears: firstApplicant.experienceYears,
      skills: firstApplicant.skills,
      resumeText: firstApplicant.resumeText,
      platform: 'LINKEDIN',
    }, 'LINKEDIN')

    // Insert Candidate into real database
    const candRes = await client.query(`
      INSERT INTO candidates (
        organization_id, first_name, last_name, email, phone,
        current_company, current_designation, total_experience_years,
        location, source, raw_resume_text
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
      ) RETURNING id, email, first_name;
    `, [
      T_ACME, normalized.first_name, normalized.last_name,
      normalized.email, normalized.phone, normalized.current_company,
      normalized.current_designation, normalized.total_experience_years,
      normalized.location, normalized.source, normalized.raw_resume_text
    ])

    assert.equal(candRes.rowCount, 1)
    testCandidateId = candRes.rows[0].id
    assert.ok(testCandidateId)

    // Compute AI match score
    const match = MatchScoreEngine.compute(
      {
        total_experience_years: normalized.total_experience_years,
        skills: normalized.skills,
        raw_resume_text: normalized.raw_resume_text,
      },
      {
        title: 'Lead Cloud Architect',
        min_experience_years: 5,
        max_experience_years: 10,
        job_description: 'Architecting resilient distributed microservices with React and Node.js',
        skills: [
          { id: '1', skill_name: 'React', is_required: true, weight: 10 },
          { id: '2', skill_name: 'TypeScript', is_required: true, weight: 10 },
        ],
      }
    )

    // Insert Job Application in APPLIED stage
    const appCode = `APP-TEST-${Date.now().toString().slice(-4)}`
    const appRes = await client.query(`
      INSERT INTO job_applications (
        organization_id, application_code, requisition_id, candidate_id,
        stage, match_score, skill_score, experience_score, jd_relevance_score,
        match_reasoning
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
      ) RETURNING id, application_code, stage, match_score;
    `, [
      T_ACME, appCode, testRequisitionId, testCandidateId,
      'APPLIED', match.match_score, match.skill_score, match.experience_score,
      match.jd_relevance_score, JSON.stringify(match.reasoning)
    ])

    assert.equal(appRes.rowCount, 1)
    testApplicationId = appRes.rows[0].id
    assert.equal(appRes.rows[0].stage, 'APPLIED')
    assert.ok(appRes.rows[0].match_score > 0)
  })

  // ------------------------------------------------------------
  // Test 4: Database Composite Uniqueness Constraint
  // ------------------------------------------------------------
  await t.test('4. Composite Uniqueness: uq_app_candidate_requisition enforced by PostgreSQL', async () => {
    const duplicateAppCode = `APP-DUP-${Date.now().toString().slice(-4)}`

    // Attempt to insert duplicate application for same requisition and candidate in live PostgreSQL
    await assert.rejects(
      async () => {
        await client.query(`
          INSERT INTO job_applications (
            organization_id, application_code, requisition_id, candidate_id, stage
          ) VALUES ($1, $2, $3, $4, $5);
        `, [T_ACME, duplicateAppCode, testRequisitionId, testCandidateId, 'APPLIED'])
      },
      (err) => {
        // Postgres unique violation code 23505
        assert.equal(err.code, '23505')
        assert.ok(err.constraint.includes('uq_app_candidate_requisition') || err.message.includes('unique'))
        return true
      }
    )
  })

  // ------------------------------------------------------------
  // Test 5: Mode 2 Recruiter Candidate Discovery & Cross-Provider Deduplication
  // ------------------------------------------------------------
  await t.test('5. Mode 2: Multi-provider search and cross-platform deduplication', async () => {
    const li = new LinkedInMockProvider()
    const ind = new IndeedMockProvider()

    const liSearch = await li.searchCandidates({
      roleTitle: 'Software Engineer',
      skills: ['TypeScript', 'Node.js'],
      minExperience: 3,
    })

    const indSearch = await ind.searchCandidates({
      roleTitle: 'Software Engineer',
      skills: ['TypeScript', 'Node.js'],
      minExperience: 3,
    })

    const combined = [...liSearch.candidates, ...indSearch.candidates]
    const seenEmails = new Set()
    const deduplicated = []

    for (const c of combined) {
      if (c.email && seenEmails.has(c.email.toLowerCase())) continue
      if (c.email) seenEmails.add(c.email.toLowerCase())
      deduplicated.push(c)
    }

    // Vikram Joshi exists on both LinkedIn & Indeed; deduplication collapses to 1
    const vikrams = deduplicated.filter(c => c.email === 'vikram.joshi@applicant-mock.com')
    assert.equal(vikrams.length, 1)
    assert.ok(deduplicated.length >= 3)
  })

  // ------------------------------------------------------------
  // Test 6: Pipeline State Machine Progression
  // ------------------------------------------------------------
  await t.test('6. State machine progression from APPLIED to SHORTLISTED to INTERVIEW', async () => {
    assert.equal(HiringStateMachine.canTransition('APPLIED', 'SHORTLISTED'), true)

    // Update in live database
    const step1 = await client.query(`
      UPDATE job_applications SET stage = 'SHORTLISTED', updated_at = NOW()
      WHERE id = $1 RETURNING stage;
    `, [testApplicationId])
    assert.equal(step1.rows[0].stage, 'SHORTLISTED')

    assert.equal(HiringStateMachine.canTransition('SHORTLISTED', 'INTERVIEW'), true)
    const step2 = await client.query(`
      UPDATE job_applications SET stage = 'INTERVIEW', updated_at = NOW()
      WHERE id = $1 RETURNING stage;
    `, [testApplicationId])
    assert.equal(step2.rows[0].stage, 'INTERVIEW')
  })

  // ------------------------------------------------------------
  // Test 7: Real PostgreSQL RLS Tenant Isolation (Positive Controls)
  // ------------------------------------------------------------
  await t.test('7. RLS Dual-Security: Acme HR sees own requisition; Globex HR sees zero', async () => {
    // Positive control: Anita (Acme HR) queries job_requisitions for Acme
    const posRes = await asUser(
      client,
      U.anitaHR,
      `SELECT count(*)::int as c FROM job_requisitions WHERE id = $1`,
      [testRequisitionId],
      T_ACME
    )
    assert.equal(posRes.rows[0].c, 1, 'Positive control failed: Acme HR MUST see own tenant requisition')

    // Negative assertion: Bianca (Globex HR) queries job_requisitions for Acme's requisition
    const negRes = await asUser(
      client,
      U.biancaHR,
      `SELECT count(*)::int as c FROM job_requisitions WHERE id = $1`,
      [testRequisitionId],
      T_GLOBEX
    )
    assert.equal(negRes.rows[0].c, 0, 'Cross-tenant leak: Globex HR MUST see 0 rows of Acme requisition')
  })
})
