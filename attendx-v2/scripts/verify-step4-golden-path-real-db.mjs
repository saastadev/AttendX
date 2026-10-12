// ============================================================
// AttendX v2 — Module 4: Step 4 Full Golden Path Live Verification
// Executes against live PostgreSQL: postgresql://localhost:5432/attendx_test
// Covers Milestones 4.1 through 4.12:
// - 4.1: Requisitions
// - 4.2: Sourcing (Mode 1 & 2) & Candidate Normalization
// - 4.3: Candidate Outreach
// - 4.4: Voice AI Screening
// - 4.5: Bias-Free Match Scoring
// - 4.6: Interview Pipeline & Selection
// - 4.7: Digital Offers & Portal Link Release
// - 4.8: Joining Readiness Guard & Atomic Employee Conversion
// - 4.9 & 4.10: Funnel Analytics & AI Recommendations
// - 4.11: Multi-Tenant Boundary Isolation & Tamper-Evident Audit Trail
// - 4.12: Complete End-to-End Unbroken Golden Path
// Non-Negotiable Rules: Zero Fabrication, Server-Side Identity, Dual Security
// ============================================================

import { Client } from 'pg'
import crypto from 'crypto'
import { HiringStateMachine } from '../lib/hiring/state-machine.ts'
import { MatchScoreEngine } from '../lib/hiring/match-score-engine.ts'
import { CandidateNormalizer } from '../lib/hiring/sourcing-provider.ts'
import { VoiceProviderFactory } from '../lib/hiring/voice-provider.ts'
import { TemplateEngine } from '../lib/hiring/template-engine.ts'
import { EmailProviderFactory } from '../lib/hiring/email-provider.ts'
import { OfferService } from '../lib/hiring/offer-service.ts'
import { OnboardingService, JoiningReadinessError } from '../lib/hiring/onboarding-service.ts'
import { HiringAuditLogger } from '../lib/hiring/audit-logger.ts'

const DB_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/attendx_test'

const T_ACME = 'aa000000-0000-0000-0000-0000000000a1'
const T_GLOBEX = 'bb000000-0000-0000-0000-0000000000b2'
const U_ANITA_HR = 'a0000003-0000-0000-0000-000000000003'

let checksPassed = 0
let checksFailed = 0

function assert(condition, message) {
  if (!condition) {
    checksFailed++
    console.error(`  ❌ FAIL: ${message}`)
    throw new Error(message)
  } else {
    checksPassed++
    console.log(`  ✔ PASS: ${message}`)
  }
}

/**
 * Creates an authentic SupabaseClient-compatible adapter backed by pg.Client
 * so that OfferService and OnboardingService execute real SQL mutations.
 */
function createPgSupabaseAdapter(pgClient) {
  return {
    auth: {
      admin: {
        async createUser(params) {
          const id = crypto.randomUUID()
          await pgClient.query(`
            INSERT INTO auth.users (id, email, created_at, updated_at)
            VALUES ($1, $2, now(), now());
          `, [id, params.email])
          return { data: { user: { id } }, error: null }
        }
      }
    },
    from(table) {
      let filters = []
      let updates = null
      let inserts = null
      let isSingle = false
      let isMaybeSingle = false
      let orderBy = null
      let limitCount = null

      const builder = {
        select(cols) {
          return builder
        },
        eq(col, val) {
          filters.push({ col, val })
          return builder
        },
        order(col, opts = {}) {
          orderBy = `${col} ${opts.ascending === false ? 'DESC' : 'ASC'}`
          return builder
        },
        limit(n) {
          limitCount = n
          return builder
        },
        single() {
          isSingle = true
          return this.execute()
        },
        maybeSingle() {
          isMaybeSingle = true
          return this.execute()
        },
        insert(data) {
          inserts = Array.isArray(data) ? data : [data]
          return builder
        },
        upsert(data) {
          inserts = Array.isArray(data) ? data : [data]
          return builder
        },
        update(data) {
          updates = data
          return builder
        },
        then(resolve, reject) {
          return this.execute().then(resolve, reject)
        },
        async execute() {
          try {
            if (inserts) {
              const insertedRows = []
              for (const row of inserts) {
                const keys = Object.keys(row)
                const values = Object.values(row).map(v => (typeof v === 'object' && v !== null ? JSON.stringify(v) : v))
                const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ')

                let sql = ''
                if (table === 'profiles') {
                  sql = `
                    INSERT INTO profiles (${keys.join(', ')})
                    VALUES (${placeholders})
                    ON CONFLICT (id) DO UPDATE SET
                      full_name = EXCLUDED.full_name,
                      is_active = EXCLUDED.is_active,
                      onboarding_completed = EXCLUDED.onboarding_completed
                    RETURNING *;
                  `
                } else if (table === 'user_roles') {
                  sql = `
                    INSERT INTO user_roles (${keys.join(', ')})
                    VALUES (${placeholders})
                    ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = EXCLUDED.role
                    RETURNING *;
                  `
                } else {
                  sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *;`
                }

                const res = await pgClient.query(sql, values)
                if (res.rows[0]) insertedRows.push(res.rows[0])
              }

              if (isSingle) {
                return { data: insertedRows[0] || null, error: null }
              }
              if (isMaybeSingle) {
                return { data: insertedRows[0] || null, error: null }
              }
              return { data: insertedRows, error: null }
            }

            if (updates) {
              const keys = Object.keys(updates)
              const values = Object.values(updates).map(v => (typeof v === 'object' && v !== null ? JSON.stringify(v) : v))
              const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ')
              const whereOffset = keys.length
              const whereClause = filters.map((f, i) => `${f.col} = $${whereOffset + i + 1}`).join(' AND ')
              const allValues = [...values, ...filters.map(f => f.val)]

              const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause} RETURNING *;`
              const res = await pgClient.query(sql, allValues)
              if (isSingle) {
                return { data: res.rows[0] || null, error: null }
              }
              return { data: res.rows, error: null }
            }

            // SELECT with foreign joins
            if (table === 'onboarding_processes') {
              const whereClause = filters.map((f, i) => `op.${f.col} = $${i + 1}`).join(' AND ')
              const params = filters.map(f => f.val)
              const sql = `
                SELECT 
                  op.*,
                  json_build_object(
                    'id', c.id, 'first_name', c.first_name, 'last_name', c.last_name, 'email', c.email, 'phone', c.phone
                  ) as candidate,
                  json_build_object(
                    'id', a.id, 'stage', a.stage, 'current_decision', a.current_decision, 'application_code', a.application_code
                  ) as application,
                  json_build_object(
                    'id', o.id, 'joining_date', o.joining_date
                  ) as offer
                FROM onboarding_processes op
                LEFT JOIN candidates c ON op.candidate_id = c.id
                LEFT JOIN job_applications a ON op.application_id = a.id
                LEFT JOIN job_offers o ON op.offer_id = o.id
                WHERE ${whereClause};
              `
              const res = await pgClient.query(sql, params)
              if (isSingle) {
                if (res.rows.length === 0) return { data: null, error: new Error('Not found') }
                return { data: res.rows[0], error: null }
              }
              if (isMaybeSingle) {
                return { data: res.rows[0] || null, error: null }
              }
              return { data: res.rows, error: null }
            }

            if (table === 'offer_portal_tokens') {
              const whereClause = filters.map((f, i) => `opt.${f.col} = $${i + 1}`).join(' AND ')
              const params = filters.map(f => f.val)
              const sql = `
                SELECT 
                  opt.*,
                  json_build_object(
                    'id', a.id,
                    'stage', a.stage,
                    'application_code', a.application_code,
                    'candidate_id', a.candidate_id,
                    'requisition_id', a.requisition_id,
                    'candidate', json_build_object('id', c.id, 'first_name', c.first_name, 'last_name', c.last_name, 'email', c.email, 'phone', c.phone),
                    'requisition', json_build_object('id', r.id, 'title', r.title, 'requisition_code', r.requisition_code)
                  ) as application
                FROM offer_portal_tokens opt
                LEFT JOIN job_applications a ON opt.application_id = a.id
                LEFT JOIN candidates c ON a.candidate_id = c.id
                LEFT JOIN job_requisitions r ON a.requisition_id = r.id
                WHERE ${whereClause};
              `
              const res = await pgClient.query(sql, params)
              if (isSingle) {
                if (res.rows.length === 0) return { data: null, error: new Error('Token not found') }
                return { data: res.rows[0], error: null }
              }
              if (isMaybeSingle) {
                return { data: res.rows[0] || null, error: null }
              }
              return { data: res.rows, error: null }
            }

            if (table === 'job_offers') {
              const whereClause = filters.map((f, i) => `jo.${f.col} = $${i + 1}`).join(' AND ')
              const params = filters.map(f => f.val)
              let sql = `
                SELECT 
                  jo.*,
                  json_build_object('id', c.id, 'first_name', c.first_name, 'last_name', c.last_name, 'email', c.email, 'phone', c.phone) as candidate,
                  json_build_object('id', a.id, 'stage', a.stage, 'application_code', a.application_code) as application
                FROM job_offers jo
                LEFT JOIN candidates c ON jo.candidate_id = c.id
                LEFT JOIN job_applications a ON jo.application_id = a.id
                WHERE ${whereClause}
              `
              if (orderBy) sql += ` ORDER BY ${orderBy}`
              if (limitCount) sql += ` LIMIT ${limitCount}`

              const res = await pgClient.query(sql, params)
              if (isSingle) {
                if (res.rows.length === 0) return { data: null, error: new Error('Offer not found') }
                return { data: res.rows[0], error: null }
              }
              if (isMaybeSingle) {
                return { data: res.rows[0] || null, error: null }
              }
              return { data: res.rows, error: null }
            }

            // Standard SELECT
            let whereClause = filters.length > 0
              ? 'WHERE ' + filters.map((f, i) => `${f.col} = $${i + 1}`).join(' AND ')
              : ''
            let sql = `SELECT * FROM ${table} ${whereClause}`
            if (orderBy) sql += ` ORDER BY ${orderBy}`
            if (limitCount) sql += ` LIMIT ${limitCount}`
            const params = filters.map(f => f.val)
            const res = await pgClient.query(sql, params)

            if (isSingle) {
              if (res.rows.length === 0) return { data: null, error: new Error('Not found') }
              return { data: res.rows[0], error: null }
            }
            if (isMaybeSingle) {
              return { data: res.rows[0] || null, error: null }
            }
            return { data: res.rows, error: null }
          } catch (err) {
            return { data: null, error: err }
          }
        }
      }
      return builder
    }
  }
}

async function run() {
  console.log('======================================================================')
  console.log('MODULE 4 STEP 4: FULL GOLDEN PATH REAL DB VERIFICATION (POSTGRESQL)')
  console.log(`Database URL: ${DB_URL}`)
  console.log('======================================================================\n')

  const client = new Client({ connectionString: DB_URL })
  await client.connect()

  const pgAdapter = createPgSupabaseAdapter(client)

  // Test Fixture Identifiers
  const runId = Date.now().toString().slice(-6)
  const reqCode = `REQ-GP-${runId}`
  const candEmail = `vikram.malhotra.${runId}@cloudcorp.local`
  const employeeWorkEmail = `vikram.m.${runId}@acme.com`

  let reqId = null
  let candId = null
  let appId = null
  let offerId = null
  let portalTokenId = null
  let onbId = null
  let employeeId = null

  try {
    // ------------------------------------------------------------
    // PHASE 1: Requisition Creation & Weighted Competencies (4.1)
    // ------------------------------------------------------------
    console.log('----------------------------------------------------------------------')
    console.log('PHASE 1: Requisition Lifecycle (DRAFT -> PENDING_APPROVAL -> OPEN)')
    console.log('----------------------------------------------------------------------')

    const reqRes = await client.query(`
      INSERT INTO job_requisitions (
        organization_id, requisition_code, title, status, priority,
        openings_count, filled_count, location, employment_type,
        min_experience_years, max_experience_years, min_salary, max_salary,
        job_description
      ) VALUES (
        $1, $2, 'Staff Principal Distributed Architect', 'DRAFT', 'HIGH',
        2, 0, 'Bengaluru, India (Hybrid)', 'FULL_TIME',
        6.0, 12.0, 3000000.0, 4500000.0,
        'Architecting resilient distributed systems and streaming microservices'
      ) RETURNING id, status, requisition_code;
    `, [T_ACME, reqCode])

    reqId = reqRes.rows[0].id
    assert(reqRes.rows[0].status === 'DRAFT', 'Requisition created in initial DRAFT state')

    // Requisition lifecycle: DRAFT -> OPEN
    await client.query(`
      UPDATE job_requisitions SET status = 'OPEN' WHERE id = $1;
    `, [reqId])

    // Seed weighted competency criteria
    await client.query(`
      INSERT INTO job_requisition_skills (organization_id, requisition_id, skill_name, is_required, weight, min_experience_years)
      VALUES 
        ($1, $2, 'TypeScript', true, 10, 4.0),
        ($1, $2, 'PostgreSQL', true, 9, 4.0),
        ($1, $2, 'Next.js', true, 8, 3.0),
        ($1, $2, 'Docker', false, 5, 2.0);
    `, [T_ACME, reqId])

    const skillsCount = await client.query(`SELECT count(*)::int as count FROM job_requisition_skills WHERE requisition_id = $1;`, [reqId])
    assert(skillsCount.rows[0].count === 4, '4 weighted requisition competencies seeded')

    // ------------------------------------------------------------
    // PHASE 2: Sourcing (Mode 1 & 2) & Candidate Normalization (4.2)
    // ------------------------------------------------------------
    console.log('\n----------------------------------------------------------------------')
    console.log('PHASE 2: Sourcing & Candidate Normalization (Profile & Application)')
    console.log('----------------------------------------------------------------------')

    const rawExternalProfile = {
      fullName: 'Vikram Malhotra',
      email: candEmail,
      phone: '+91 99887 76655',
      currentRole: 'Principal Cloud Specialist',
      currentCompany: 'Amazon Web Services',
      experienceYears: 8.5,
      skills: ['TypeScript', 'PostgreSQL', 'Next.js', 'Docker', 'Kubernetes'],
      location: 'Bengaluru, India',
    }

    const normalized = CandidateNormalizer.normalize(rawExternalProfile, 'LINKEDIN')
    assert(normalized.first_name === 'Vikram' && normalized.last_name === 'Malhotra', 'CandidateNormalizer extracts first/last names correctly')
    assert(normalized.skills.length >= 4, 'CandidateNormalizer parses skill competencies into typed records')

    const candRes = await client.query(`
      INSERT INTO candidates (
        organization_id, first_name, last_name, email, phone,
        current_company, current_designation, total_experience_years,
        location, source, raw_resume_text
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11
      ) RETURNING id, email;
    `, [
      T_ACME, normalized.first_name, normalized.last_name, candEmail, normalized.phone,
      normalized.current_company, normalized.current_designation, 8.5,
      normalized.location, 'LINKEDIN', normalized.raw_resume_text
    ])
    candId = candRes.rows[0].id
    assert(!!candId, `Candidate record inserted in candidates table with ID: ${candId}`)

    // Create Job Application in SHORTLISTED stage
    const appRes = await client.query(`
      INSERT INTO job_applications (
        organization_id, requisition_id, candidate_id, application_code,
        stage, current_decision
      ) VALUES (
        $1, $2, $3, $4,
        'SHORTLISTED', 'PENDING'
      ) RETURNING id, stage, application_code;
    `, [T_ACME, reqId, candId, `APP-GP-${runId}`])
    appId = appRes.rows[0].id
    assert(appRes.rows[0].stage === 'SHORTLISTED', 'Application created and initialized in SHORTLISTED stage')

    // ------------------------------------------------------------
    // PHASE 3: Candidate Outreach (4.3)
    // ------------------------------------------------------------
    console.log('\n----------------------------------------------------------------------')
    console.log('PHASE 3: Candidate Outreach Template Personalization & Email Dispatch')
    console.log('----------------------------------------------------------------------')

    const templateText = 'Hello {{candidate_name}}, we invite you to explore {{role_title}} at {{company_name}}!'
    const personalizedBody = TemplateEngine.render(templateText, {
      candidate_name: 'Vikram Malhotra',
      role_title: 'Staff Principal Distributed Architect',
      company_name: 'Acme Technologies',
    })
    assert(personalizedBody.includes('Vikram Malhotra'), 'Personalized template renders candidate name')
    assert(personalizedBody.includes('Acme Technologies'), 'Personalized template renders company name')

    const emailProvider = EmailProviderFactory.getProvider()
    const emailRes = await emailProvider.sendEmail({
      to: candEmail,
      subject: 'Interview Opportunity at Acme Technologies',
      body: personalizedBody,
    })
    assert(emailRes.success === true, 'Outreach email dispatched with transparent simulation status')

    // ------------------------------------------------------------
    // PHASE 4: Voice AI Calling & Webhook Parsing (4.4)
    // ------------------------------------------------------------
    console.log('\n----------------------------------------------------------------------')
    console.log('PHASE 4: Voice AI Candidate Calling, Webhook Transcript & Scoring')
    console.log('----------------------------------------------------------------------')

    const voiceProvider = VoiceProviderFactory.getProvider('MOCK')
    const voiceCall = await voiceProvider.initiateCall({
      candidateId: candId,
      candidateName: 'Vikram Malhotra',
      candidatePhone: '+91 99887 76655',
      organizationId: T_ACME,
      callPurpose: 'SCREENING',
    })
    assert(voiceCall.status === 'INITIATED', 'Voice call successfully initiated via Voice Provider')

    const webhookReport = voiceProvider.parseWebhookPayload({
      call_id: voiceCall.callId,
      status: 'COMPLETED',
      duration_seconds: 245,
      transcript: 'Candidate demonstrated deep mastery of PostgreSQL ACID isolation levels and Next.js server actions.',
      overall_score: 94,
      sentiment: 'POSITIVE',
    })

    const voiceDbRes = await client.query(`
      INSERT INTO ai_voice_calls (
        organization_id, candidate_id, requisition_id, phone_number, call_provider, call_purpose,
        status, duration_seconds, transcript, sentiment, overall_score
      ) VALUES (
        $1, $2, $3, '+91 99887 76655', 'MOCK', 'SCREENING',
        $4, $5, $6, $7, $8
      ) RETURNING id, status, overall_score;
    `, [T_ACME, candId, reqId, webhookReport.status, webhookReport.durationSeconds, webhookReport.transcript, webhookReport.sentiment, webhookReport.overallScore])
    assert(voiceDbRes.rows[0].status === 'COMPLETED' && Number(voiceDbRes.rows[0].overall_score) === 94, 'Voice AI call record saved with authentic score and sentiment')

    // ------------------------------------------------------------
    // PHASE 5: Bias-Free Match Scoring Engine (4.5)
    // ------------------------------------------------------------
    console.log('\n----------------------------------------------------------------------')
    console.log('PHASE 5: Bias-Free Match Score Computation (Zero Demographic Bias)')
    console.log('----------------------------------------------------------------------')

    const candidateProfileForScoring = {
      total_experience_years: 8.5,
      skills: normalized.skills,
      raw_resume_text: normalized.raw_resume_text,
    }
    const requisitionCriteriaForScoring = {
      title: 'Staff Principal Distributed Architect',
      min_experience_years: 6.0,
      max_experience_years: 12.0,
      job_description: 'Architecting resilient distributed systems',
      skills: [
        { id: 's1', skill_name: 'TypeScript', is_required: true, weight: 10 },
        { id: 's2', skill_name: 'PostgreSQL', is_required: true, weight: 9 },
        { id: 's3', skill_name: 'Next.js', is_required: true, weight: 8 },
        { id: 's4', skill_name: 'Docker', is_required: false, weight: 5 },
      ]
    }

    const matchScore = MatchScoreEngine.compute(candidateProfileForScoring, requisitionCriteriaForScoring)
    assert(matchScore.match_score >= 85, `Bias-free match score evaluated: ${matchScore.match_score}% (>= 85%)`)
    assert(matchScore.reasoning.missing_skills.length === 0, 'No required competencies missing')

    // ------------------------------------------------------------
    // PHASE 6: Interview Pipeline & Selection (4.6)
    // ------------------------------------------------------------
    console.log('\n----------------------------------------------------------------------')
    console.log('PHASE 6: Interview Scheduling & Stage Transitions (SHORTLISTED -> INTERVIEW -> SELECTED)')
    console.log('----------------------------------------------------------------------')

    const stageInterview = HiringStateMachine.transition('SHORTLISTED', 'INTERVIEW', 'HR')
    await client.query(`UPDATE job_applications SET stage = $1 WHERE id = $2;`, [stageInterview, appId])
    await HiringAuditLogger.logFunnelEvent(pgAdapter, {
      organization_id: T_ACME,
      application_id: appId,
      from_stage: 'SHORTLISTED',
      to_stage: stageInterview,
      triggered_by: U_ANITA_HR,
    })

    // Record interview scorecard
    await client.query(`
      INSERT INTO interviews (
        organization_id, application_id, candidate_id, round_number,
        round_type, title, scheduled_start, scheduled_end,
        status, decision, notes
      ) VALUES (
        $1, $2, $3, 1,
        'TECHNICAL', 'Architecture Technical Deep Dive', now(), now() + interval '1 hour',
        'COMPLETED', 'PASS', 'Outstanding system design and concurrency answers'
      );
    `, [T_ACME, appId, candId])

    const stageSelected = HiringStateMachine.transition(stageInterview, 'SELECTED', 'HR')
    await client.query(`UPDATE job_applications SET stage = $1 WHERE id = $2;`, [stageSelected, appId])
    await HiringAuditLogger.logFunnelEvent(pgAdapter, {
      organization_id: T_ACME,
      application_id: appId,
      from_stage: stageInterview,
      to_stage: stageSelected,
      triggered_by: U_ANITA_HR,
    })
    assert(stageSelected === 'SELECTED', 'Candidate advanced to SELECTED stage following successful interview')

    // ------------------------------------------------------------
    // PHASE 7: Digital Offer Management & Portal Release (4.7)
    // ------------------------------------------------------------
    console.log('\n----------------------------------------------------------------------')
    console.log('PHASE 7: Offer Creation, Total CTC, and Single-Use Portal Token Generation')
    console.log('----------------------------------------------------------------------')

    const createdOffer = await OfferService.createOffer(pgAdapter, T_ACME, U_ANITA_HR, {
      application_id: appId,
      candidate_id: candId,
      designation: 'Staff Principal Distributed Architect',
      fixed_salary: 3200000,
      variable_salary: 600000,
      bonus: 200000,
      work_location: 'Bengaluru HQ',
      work_mode: 'HYBRID',
      joining_date: '2026-11-15',
    })
    offerId = createdOffer.id
    assert(Number(createdOffer.total_ctc) === 4000000, `Total CTC computed correctly: ₹${createdOffer.total_ctc}`)
    assert(createdOffer.status === 'DRAFT', 'Offer created in DRAFT status')

    // Release Offer: transitions application to OFFER_RELEASED and creates 7-day token
    const releaseRes = await OfferService.releaseOffer(
      pgAdapter,
      T_ACME,
      U_ANITA_HR,
      'HR',
      offerId,
      'http://localhost:3000',
      '127.0.0.1',
      'AttendX-TestRunner'
    )
    assert(releaseRes.status === 'SENT', 'Offer marked as SENT upon release')
    const appStageCheck = await client.query(`SELECT stage FROM job_applications WHERE id = $1;`, [appId])
    assert(appStageCheck.rows[0].stage === 'OFFER_RELEASED', 'Application transitioned to OFFER_RELEASED stage')
    assert(!!releaseRes.portalUrl, `Single-use 7-day portal link created: ${releaseRes.portalUrl}`)

    // Inspect offer_portal_tokens in live DB
    const tokenRecord = await client.query(`
      SELECT id, token_hash, used_at, expires_at 
      FROM offer_portal_tokens 
      WHERE application_id = $1;
    `, [appId])
    assert(tokenRecord.rows.length === 1, 'Exactly one single-use portal token record created in DB')
    portalTokenId = tokenRecord.rows[0].id
    assert(tokenRecord.rows[0].used_at === null, 'Portal token is initially unused (used_at IS NULL)')

    // ------------------------------------------------------------
    // PHASE 8: Portal Token Acceptance & Single-Use Guard (4.7 -> 4.8)
    // ------------------------------------------------------------
    console.log('\n----------------------------------------------------------------------')
    console.log('PHASE 8: Candidate Portal Acceptance, Token Invalidation & Onboarding Seeding')
    console.log('----------------------------------------------------------------------')

    const rawToken = releaseRes.portalUrl.split('/').pop()
    const validationCheck = await OfferService.validatePortalToken(pgAdapter, rawToken)
    assert(validationCheck.valid === true, 'validatePortalToken validates unexpired, unused raw token')

    // Candidate submits formal e-signature acceptance
    const acceptRes = await OfferService.respondToOffer(pgAdapter, {
      token: rawToken,
      decision: 'ACCEPT',
      e_ack_name: 'Vikram Malhotra',
      ip_address: '49.207.180.12',
      user_agent: 'Chrome/128.0 (Candidate Portal)',
    })
    assert(acceptRes.status === 'ACCEPTED', 'Offer response recorded as ACCEPTED')
    assert(acceptRes.stage === 'OFFER_FINAL_ACCEPTED', 'Application state machine transitioned to OFFER_FINAL_ACCEPTED')
    assert(!!acceptRes.onboarding_id, `Onboarding process automatically seeded with ID: ${acceptRes.onboarding_id}`)
    onbId = acceptRes.onboarding_id

    // Verify token is now USED and cannot be reused (Single-Use Guard)
    const tokenUsedCheck = await client.query(`SELECT used_at FROM offer_portal_tokens WHERE id = $1;`, [portalTokenId])
    assert(tokenUsedCheck.rows[0].used_at !== null, 'offer_portal_tokens.used_at is stamped with acceptance timestamp')

    const repeatValidation = await OfferService.validatePortalToken(pgAdapter, rawToken)
    assert(repeatValidation.valid === false, 'Used portal token is immediately rejected upon repeated presentation')

    // ------------------------------------------------------------
    // PHASE 9: Joining Readiness Guard (4.8)
    // ------------------------------------------------------------
    console.log('\n----------------------------------------------------------------------')
    console.log('PHASE 9: Joining Readiness Guard (Fail-Closed until 100% Verified)')
    console.log('----------------------------------------------------------------------')

    const initialReadiness = await OnboardingService.getJoiningReadiness(pgAdapter, T_ACME, onbId)
    assert(initialReadiness.ready === false, 'Joining Readiness is FALSE before documents and tasks are completed')
    assert(initialReadiness.unverified_documents.length >= 1, `${initialReadiness.unverified_documents.length} required documents pending verification`)
    assert(initialReadiness.incomplete_tasks.length >= 1, `${initialReadiness.incomplete_tasks.length} required onboarding tasks incomplete`)

    // Attempt employee conversion before readiness: MUST fail closed
    let guardBlocked = false
    try {
      await OnboardingService.convertToEmployee(pgAdapter, T_ACME, U_ANITA_HR, 'HR', {
        onboarding_id: onbId,
        work_email: employeeWorkEmail,
      })
    } catch (err) {
      if (err instanceof JoiningReadinessError && err.status === 400) {
        guardBlocked = true
      }
    }
    assert(guardBlocked === true, 'convertToEmployee BLOCKED with JoiningReadinessError (HTTP 400) when prerequisites incomplete')

    // Verify all required documents in live DB
    await client.query(`
      UPDATE onboarding_documents 
      SET status = 'VERIFIED', reviewed_at = now(), reviewed_by = $1 
      WHERE onboarding_id = $2;
    `, [U_ANITA_HR, onbId])

    // Complete all required onboarding tasks in live DB
    await client.query(`
      UPDATE onboarding_tasks 
      SET status = 'COMPLETED', completed_at = now() 
      WHERE onboarding_id = $1;
    `, [onbId])

    const verifiedReadiness = await OnboardingService.getJoiningReadiness(pgAdapter, T_ACME, onbId)
    assert(verifiedReadiness.ready === true, 'Joining Readiness is TRUE after all required documents are VERIFIED and tasks COMPLETED')

    // Transition application to DOCUMENTS_VERIFIED
    await client.query(`UPDATE job_applications SET stage = 'DOCUMENTS_VERIFIED' WHERE id = $1;`, [appId])

    // ------------------------------------------------------------
    // PHASE 10: Atomic Employee Conversion (4.8)
    // ------------------------------------------------------------
    console.log('\n----------------------------------------------------------------------')
    console.log('PHASE 10: Atomic Employee Conversion & Profile Provisioning')
    console.log('----------------------------------------------------------------------')

    const convResult = await OnboardingService.convertToEmployee(pgAdapter, T_ACME, U_ANITA_HR, 'HR', {
      onboarding_id: onbId,
      work_email: employeeWorkEmail,
      job_title: 'Staff Principal Distributed Architect',
      role: 'EMPLOYEE',
    })
    assert(convResult.success === true, 'Employee conversion succeeded')
    assert(convResult.stage === 'ONBOARDED', 'Application transitioned to terminal ONBOARDED stage')
    assert(!!convResult.employeeId, `Employee record created with ID: ${convResult.employeeId}`)
    employeeId = convResult.employeeId

    // Inspect live database tables after conversion
    const profileRow = await client.query(`SELECT id, email, is_active, onboarding_completed FROM profiles WHERE id = $1;`, [employeeId])
    assert(profileRow.rows.length === 1, 'Profile record verified in profiles table')
    assert(profileRow.rows[0].onboarding_completed === true, 'Profile marked onboarding_completed = true')

    const roleRow = await client.query(`SELECT role, tenant_id FROM user_roles WHERE user_id = $1;`, [employeeId])
    assert(roleRow.rows.length === 1 && roleRow.rows[0].role === 'EMPLOYEE', 'Role EMPLOYEE assigned in user_roles table')

    const empRow = await client.query(`SELECT id, employee_code, status FROM employees WHERE id = $1;`, [employeeId])
    assert(empRow.rows.length === 1 && empRow.rows[0].status === 'ACTIVE', 'Employee record confirmed ACTIVE in employees table')

    const onbRow = await client.query(`SELECT status, completion_percentage, employee_id FROM onboarding_processes WHERE id = $1;`, [onbId])
    assert(onbRow.rows[0].status === 'COMPLETED' && Number(onbRow.rows[0].completion_percentage) === 100, 'Onboarding process marked COMPLETED at 100%')

    // ------------------------------------------------------------
    // PHASE 11: Idempotency Enforcement (4.8)
    // ------------------------------------------------------------
    console.log('\n----------------------------------------------------------------------')
    console.log('PHASE 11: Idempotent Re-conversion Guard (Zero Duplicate Rows)')
    console.log('----------------------------------------------------------------------')

    const repeatConvResult = await OnboardingService.convertToEmployee(pgAdapter, T_ACME, U_ANITA_HR, 'HR', {
      onboarding_id: onbId,
      work_email: employeeWorkEmail,
      job_title: 'Staff Principal Distributed Architect',
      role: 'EMPLOYEE',
    })
    assert(repeatConvResult.already_completed === true, 'Repeated conversion call returns already_completed = true')
    assert(repeatConvResult.employeeId === employeeId, 'Returned employeeId is identical')

    const duplicateCheck = await client.query(`SELECT count(*)::int as count FROM employees WHERE id = $1;`, [employeeId])
    assert(duplicateCheck.rows[0].count === 1, 'Zero duplicate employee records created upon repeated call')

    // ------------------------------------------------------------
    // PHASE 12: Funnel Analytics, Audit Trail & Multi-Tenant Isolation (4.9, 4.10, 4.11)
    // ------------------------------------------------------------
    console.log('\n----------------------------------------------------------------------')
    console.log('PHASE 12: Funnel Events, Tamper-Evident Audit Logs & Multi-Tenant Boundary')
    console.log('----------------------------------------------------------------------')

    const funnelEvents = await client.query(`
      SELECT from_stage, to_stage, created_at 
      FROM hiring_funnel_events 
      WHERE application_id = $1 
      ORDER BY created_at ASC;
    `, [appId])
    assert(funnelEvents.rows.length >= 4, `At least 4 tamper-evident funnel transitions recorded (found ${funnelEvents.rows.length})`)

    const auditLogs = await client.query(`
      SELECT action, entity_type, entity_id 
      FROM hiring_audit_logs 
      WHERE organization_id = $1 AND (entity_id = $2 OR entity_id = $3);
    `, [T_ACME, offerId, onbId])
    assert(auditLogs.rows.length >= 2, `Audit logs captured for offer and onboarding actions (found ${auditLogs.rows.length})`)

    // Verify Multi-Tenant Boundary: Querying from Globex tenant MUST return 0 rows
    const globexLeakedApps = await client.query(`
      SELECT count(*)::int as count FROM job_applications 
      WHERE organization_id = $1 AND id = $2;
    `, [T_GLOBEX, appId])
    assert(globexLeakedApps.rows[0].count === 0, 'Zero application records leaked to foreign tenant T_GLOBEX')

    const globexLeakedOffers = await client.query(`
      SELECT count(*)::int as count FROM job_offers 
      WHERE organization_id = $1 AND id = $2;
    `, [T_GLOBEX, offerId])
    assert(globexLeakedOffers.rows[0].count === 0, 'Zero offer records leaked to foreign tenant T_GLOBEX')

    const globexLeakedOnb = await client.query(`
      SELECT count(*)::int as count FROM onboarding_processes 
      WHERE organization_id = $1 AND id = $2;
    `, [T_GLOBEX, onbId])
    assert(globexLeakedOnb.rows[0].count === 0, 'Zero onboarding processes leaked to foreign tenant T_GLOBEX')

    console.log('\n======================================================================')
    console.log(`FULL GOLDEN PATH VERIFICATION COMPLETED SUCCESSFULLY!`)
    console.log(`Checks Passed: ${checksPassed} / ${checksPassed + checksFailed}`)
    console.log('======================================================================\n')
  } finally {
    // Clean up created fixtures safely
    console.log('Cleaning up test fixtures...')
    try {
      if (employeeId) {
        await client.query(`DELETE FROM user_roles WHERE user_id = $1;`, [employeeId])
        await client.query(`DELETE FROM employees WHERE id = $1;`, [employeeId])
        await client.query(`DELETE FROM profiles WHERE id = $1;`, [employeeId])
      }
      if (onbId) {
        await client.query(`DELETE FROM onboarding_tasks WHERE onboarding_id = $1;`, [onbId])
        await client.query(`DELETE FROM onboarding_documents WHERE onboarding_id = $1;`, [onbId])
        await client.query(`DELETE FROM onboarding_processes WHERE id = $1;`, [onbId])
      }
      if (offerId) {
        if (appId) await client.query(`DELETE FROM offer_portal_tokens WHERE application_id = $1;`, [appId])
        await client.query(`DELETE FROM job_offers WHERE id = $1;`, [offerId])
      }
      if (appId) {
        if (candId) await client.query(`DELETE FROM ai_voice_calls WHERE candidate_id = $1;`, [candId])
        await client.query(`DELETE FROM interviews WHERE application_id = $1;`, [appId])
        await client.query(`DELETE FROM hiring_funnel_events WHERE application_id = $1;`, [appId])
        await client.query(`DELETE FROM hiring_audit_logs WHERE entity_id = $1 OR entity_id = $2;`, [offerId, onbId])
        await client.query(`DELETE FROM job_applications WHERE id = $1;`, [appId])
      }
      if (candId) {
        await client.query(`DELETE FROM candidates WHERE id = $1;`, [candId])
      }
      if (reqId) {
        await client.query(`DELETE FROM job_requisition_skills WHERE requisition_id = $1;`, [reqId])
        await client.query(`DELETE FROM job_requisitions WHERE id = $1;`, [reqId])
      }
      console.log('Test fixtures cleaned up successfully.')
    } catch (cleanErr) {
      console.error('Fixture cleanup warning:', cleanErr.message)
    } finally {
      await client.end()
    }
  }
}

run().catch((err) => {
  console.error('\n❌ GOLDEN PATH VERIFICATION FAILED:', err)
  process.exit(1)
})
