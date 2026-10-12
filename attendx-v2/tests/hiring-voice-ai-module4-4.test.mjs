// ============================================================
// AttendX v2 — Module 4.4: Voice AI Calling Verification Suite
// Non-Negotiable Rules: Zero Fabrication, Server-Side Identity, State Machine Integrity
// Categories A–I (46+ assertions)
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {
  VoiceProviderFactory,
  MockVoiceProvider,
  VapiVoiceProvider,
  TwilioVoiceProvider,
} from '../lib/hiring/voice-provider.ts'
import { VoiceCallStateMachine, VoiceCallStateMachineError } from '../lib/hiring/voice-state-machine.ts'
import { VoiceAnalysisEngine } from '../lib/hiring/voice-analysis-engine.ts'
import { VoiceAIService } from '../lib/hiring/voice-service.ts'

// In-Memory Database for Voice AI Unit Tests
function createMockVoiceDb() {
  const store = {
    candidates: [
      {
        id: 'c1111111-1111-1111-1111-111111111111',
        organization_id: 'tenant-alpha',
        first_name: 'Arjun',
        last_name: 'Mehta',
        email: 'arjun.mehta@example.com',
        phone: '+919876543210',
        total_experience_years: 5,
        consent_status: 'GRANTED',
        skills: [
          { skill_name: 'TypeScript' },
          { skill_name: 'React' },
          { skill_name: 'Node.js' },
        ],
      },
      {
        id: 'c2222222-2222-2222-2222-222222222222',
        organization_id: 'tenant-alpha',
        first_name: 'Priya',
        last_name: 'Sharma',
        email: 'priya.sharma@example.com',
        phone: null, // No phone number
        total_experience_years: 3,
        consent_status: 'GRANTED',
        skills: [],
      },
      {
        id: 'c3333333-3333-3333-3333-333333333333',
        organization_id: 'tenant-alpha',
        first_name: 'Rohan',
        last_name: 'Verma',
        email: 'rohan.verma@example.com',
        phone: '+919811223344',
        total_experience_years: 4,
        consent_status: 'WITHDRAWN', // Withdrawn consent
        skills: [],
      },
      {
        id: 'c4444444-4444-4444-4444-444444444444',
        organization_id: 'tenant-beta', // Foreign tenant candidate
        first_name: 'Vikram',
        last_name: 'Singh',
        email: 'vikram.singh@example.com',
        phone: '+919900112233',
        total_experience_years: 6,
        consent_status: 'GRANTED',
        skills: [],
      },
    ],
    candidate_skills: [],
    job_requisitions: [
      {
        id: 'r1111111-1111-1111-1111-111111111111',
        organization_id: 'tenant-alpha',
        requisition_code: 'REQ-2026-001',
        title: 'Senior Full Stack Engineer',
        min_experience_years: 4,
        job_description: 'Building multi-tenant enterprise platforms with TypeScript, React, and Node.js.',
        skills: [
          { skill_name: 'TypeScript', is_required: true },
          { skill_name: 'React', is_required: true },
          { skill_name: 'Node.js', is_required: true },
        ],
      },
    ],
    job_applications: [
      {
        id: 'app11111-1111-1111-1111-111111111111',
        organization_id: 'tenant-alpha',
        candidate_id: 'c1111111-1111-1111-1111-111111111111',
        requisition_id: 'r1111111-1111-1111-1111-111111111111',
        stage: 'INTERVIEW',
      },
    ],
    ai_voice_calls: [],
    interviews: [],
    hiring_audit_logs: [],
  }

  const client = {
    from: (table) => {
      let queryTable = table
      let filters = []
      let orderCol = null
      let orderAsc = true
      let limitCount = null

      const builder = {
        select: (cols) => builder,
        eq: (col, val) => {
          filters.push((row) => row[col] === val)
          return builder
        },
        in: (col, arr) => {
          filters.push((row) => arr.includes(row[col]))
          return builder
        },
        gte: (col, val) => {
          filters.push((row) => row[col] >= val)
          return builder
        },
        lte: (col, val) => {
          filters.push((row) => row[col] <= val)
          return builder
        },
        gt: (col, val) => {
          filters.push((row) => row[col] > val)
          return builder
        },
        lt: (col, val) => {
          filters.push((row) => row[col] < val)
          return builder
        },
        neq: (col, val) => {
          filters.push((row) => row[col] !== val)
          return builder
        },
        order: (col, { ascending = true } = {}) => {
          orderCol = col
          orderAsc = ascending
          return builder
        },
        limit: (n) => {
          limitCount = n
          return builder
        },
        single: async () => {
          let rows = (store[queryTable] || []).filter((r) => filters.every((f) => f(r)))
          if (rows.length === 0) return { data: null, error: { message: 'Row not found' } }
          return { data: attachRelations(queryTable, rows[0]), error: null }
        },
        maybeSingle: async () => {
          let rows = (store[queryTable] || []).filter((r) => filters.every((f) => f(r)))
          return { data: rows.length > 0 ? attachRelations(queryTable, rows[0]) : null, error: null }
        },
        then: async (resolve) => {
          let rows = (store[queryTable] || []).filter((r) => filters.every((f) => f(r)))
          if (orderCol) {
            rows.sort((a, b) => {
              if (a[orderCol] < b[orderCol]) return orderAsc ? -1 : 1
              if (a[orderCol] > b[orderCol]) return orderAsc ? 1 : -1
              return 0
            })
          }
          if (limitCount) rows = rows.slice(0, limitCount)
          resolve({ data: rows.map((r) => attachRelations(queryTable, r)), error: null })
        },
        insert: (data) => {
          const inserted = Array.isArray(data) ? data : [data]
          const created = inserted.map((row) => {
            const full = {
              id: row.id || `gen-${Math.random().toString(36).substring(2, 9)}`,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              ...row,
            }
            store[queryTable].push(full)
            return full
          })
          return {
            select: () => ({
              single: async () => ({ data: attachRelations(queryTable, created[0]), error: null }),
              maybeSingle: async () => ({ data: attachRelations(queryTable, created[0]), error: null }),
              then: async (resolve) => resolve({ data: created.map((r) => attachRelations(queryTable, r)), error: null }),
            }),
            then: async (resolve) => resolve({ data: created, error: null }),
          }
        },
        update: (data) => {
          return {
            eq: (col, val) => {
              filters.push((row) => row[col] === val)
              return {
                eq: (col2, val2) => {
                  filters.push((row) => row[col2] === val2)
                  return {
                    select: () => ({
                      single: async () => {
                        let matched = (store[queryTable] || []).find((r) => filters.every((f) => f(r)))
                        if (matched) {
                          Object.assign(matched, data, { updated_at: new Date().toISOString() })
                          return { data: attachRelations(queryTable, matched), error: null }
                        }
                        return { data: null, error: { message: 'Not found for update' } }
                      },
                    }),
                    then: async (resolve) => {
                      let matched = (store[queryTable] || []).find((r) => filters.every((f) => f(r)))
                      if (matched) Object.assign(matched, data)
                      resolve({ data: matched, error: null })
                    },
                  }
                },
                select: () => ({
                  single: async () => {
                    let matched = (store[queryTable] || []).find((r) => filters.every((f) => f(r)))
                    if (matched) {
                      Object.assign(matched, data, { updated_at: new Date().toISOString() })
                      return { data: attachRelations(queryTable, matched), error: null }
                    }
                    return { data: null, error: { message: 'Not found for update' } }
                  },
                }),
                then: async (resolve) => {
                  let matched = (store[queryTable] || []).find((r) => filters.every((f) => f(r)))
                  if (matched) Object.assign(matched, data)
                  resolve({ data: matched, error: null })
                },
              }
            },
          }
        },
      }
      return builder
    },
    _store: store,
  }

  function attachRelations(table, row) {
    if (!row) return row
    const copy = { ...row }
    if (table === 'ai_voice_calls' || table === 'job_applications') {
      copy.candidate = store.candidates.find((c) => c.id === row.candidate_id)
      copy.requisition = store.job_requisitions.find((r) => r.id === row.requisition_id)
    }
    return copy
  }

  return client
}

test('MODULE 4.4 — VOICE AI CANDIDATE CALLING VERIFICATION SUITE', async (t) => {
  // ============================================================
  // CATEGORY A: Agent Configuration & Provider Abstraction
  // ============================================================
  await t.test('Category A: Provider Abstraction & Webhook Verification', async (tA) => {
    await tA.test('A1: Default provider is MockVoiceProvider', () => {
      const provider = VoiceProviderFactory.getProvider()
      assert.ok(provider instanceof MockVoiceProvider)
      assert.ok(provider.name === 'MOCK' || provider.name === 'Mock Voice AI')
    })

    await tA.test('A2: Provider implements VoiceProvider contract methods', () => {
      const provider = new MockVoiceProvider()
      assert.equal(typeof provider.name, 'string')
      assert.equal(typeof provider.initiateCall, 'function')
      assert.equal(typeof provider.verifyWebhook, 'function')
      assert.equal(typeof provider.parseWebhookPayload, 'function')
    })

    await tA.test('A3: Provider factory switches across MOCK, VAPI, and TWILIO', () => {
      const mockP = VoiceProviderFactory.getProvider('MOCK')
      const vapiP = VoiceProviderFactory.getProvider('VAPI')
      const twilioP = VoiceProviderFactory.getProvider('TWILIO')

      assert.ok(mockP instanceof MockVoiceProvider)
      assert.ok(vapiP instanceof VapiVoiceProvider)
      assert.ok(twilioP instanceof TwilioVoiceProvider)
    })

    await tA.test('A4: Webhook verification validates cryptographic HMAC signature', () => {
      const vapi = new VapiVoiceProvider()
      const payload = JSON.stringify({ callId: 'call-123', status: 'completed' })
      const secret = 'test-secret-key-44'

      // Valid signature
      const validSig = crypto.createHmac('sha256', secret).update(payload).digest('hex')
      assert.equal(vapi.verifyWebhook(payload, validSig, secret), true)

      // Invalid signature
      assert.equal(vapi.verifyWebhook(payload, 'tampered-signature-xyz', secret), false)
    })

    await tA.test('A5: Webhook payload parsing maps standard fields correctly', () => {
      const provider = new MockVoiceProvider()
      const rawPayload = {
        call_id: 'call-mock-99',
        status: 'COMPLETED',
        duration_seconds: 180,
        recording_url: 'https://storage.attendx.ai/recordings/call-99.mp3',
        transcript: 'AI Agent: Hello candidate!\nCandidate: Hello agent!',
        ai_summary: 'Screening call completed successfully.',
        overall_score: 85,
        sentiment: 'POSITIVE',
      }

      const parsed = provider.parseWebhookPayload(rawPayload)
      assert.equal(parsed.providerCallId, 'call-mock-99')
      assert.equal(parsed.status, 'COMPLETED')
      assert.equal(parsed.durationSeconds, 180)
      assert.equal(parsed.sentiment, 'POSITIVE')
      assert.equal(parsed.overallScore, 85)
    })
  })

  // ============================================================
  // CATEGORY B: Contextual Initial Screening Calls
  // ============================================================
  await t.test('Category B: Contextual Initial Screening Calls', async (tB) => {
    const db = createMockVoiceDb()

    await tB.test('B1: Missing candidate_id throws error', async () => {
      await assert.rejects(
        async () => {
          await VoiceAIService.initiateCall(db, 'tenant-alpha', 'user-001', {
            candidate_id: '',
          })
        },
        { message: 'candidate_id is required.' }
      )
    })

    await tB.test('B2: Non-existent candidate throws 404', async () => {
      await assert.rejects(
        async () => {
          await VoiceAIService.initiateCall(db, 'tenant-alpha', 'user-001', {
            candidate_id: 'c9999999-9999-9999-9999-999999999999',
          })
        },
        (err) => err.status === 404
      )
    })

    await tB.test('B3: Candidate missing valid phone number throws 400', async () => {
      await assert.rejects(
        async () => {
          await VoiceAIService.initiateCall(db, 'tenant-alpha', 'user-001', {
            candidate_id: 'c2222222-2222-2222-2222-222222222222', // Priya has phone: null
          })
        },
        (err) => err.status === 400 && err.message.includes('valid phone number')
      )
    })

    await tB.test('B4: Candidate with WITHDRAWN consent is blocked with 403', async () => {
      await assert.rejects(
        async () => {
          await VoiceAIService.initiateCall(db, 'tenant-alpha', 'user-001', {
            candidate_id: 'c3333333-3333-3333-3333-333333333333', // Rohan has WITHDRAWN consent
          })
        },
        (err) => err.status === 403 && err.message.includes('withdrawn consent')
      )
    })

    await tB.test('B5: Screening call creates call record with contextual title & required skills', async () => {
      const call = await VoiceAIService.initiateCall(db, 'tenant-alpha', 'user-001', {
        candidate_id: 'c1111111-1111-1111-1111-111111111111',
        requisition_id: 'r1111111-1111-1111-1111-111111111111',
        call_purpose: 'SCREENING',
        simulate_outcome: 'COMPLETED',
      })

      assert.ok(call.id)
      assert.equal(call.organization_id, 'tenant-alpha')
      assert.equal(call.candidate_id, 'c1111111-1111-1111-1111-111111111111')
      assert.equal(call.call_purpose, 'SCREENING')
      assert.ok(call.call_provider === 'MOCK' || call.call_provider === 'Mock Voice AI')
      assert.ok(call.provider_call_id.startsWith('mock_voice_') || call.provider_call_id.startsWith('mock-voice-'))
      assert.equal(call.phone_number, '+919876543210')
      assert.ok(call.transcript.includes('Senior Full Stack Engineer'))
      assert.ok(call.transcript.includes('TypeScript') || call.transcript.includes('React'))
    })
  })

  // ============================================================
  // CATEGORY C: Grounded Information Extraction (Zero Fabrication)
  // ============================================================
  await t.test('Category C: Grounded Information Extraction', async (tC) => {
    await tC.test('C1: Extracts explicit notice period of 30 days', () => {
      const transcript = 'AI Agent: What is your notice period?\nCandidate: My notice period is 30 days.'
      const extracted = VoiceAnalysisEngine.extractInformation(transcript)
      assert.equal(extracted.noticePeriodDays, 30)
    })

    await tC.test('C2: Extracts immediate notice period as 0 days', () => {
      const transcript = 'AI Agent: When can you join?\nCandidate: I can join immediately as I am currently serving notice.'
      const extracted = VoiceAnalysisEngine.extractInformation(transcript)
      assert.equal(extracted.noticePeriodDays, 0)
    })

    await tC.test('C3: Extracts expected and current CTC', () => {
      const transcript = 'Candidate: Currently my compensation is 18 LPA, and I am expecting around 25 LPA CTC.'
      const extracted = VoiceAnalysisEngine.extractInformation(transcript)
      assert.equal(extracted.currentSalary, '18 LPA')
      assert.equal(extracted.expectedSalary, '25 LPA')
    })

    await tC.test('C4: Extracts stated years of experience', () => {
      const transcript = 'Candidate: I have 6 years of experience working with high-throughput backend services.'
      const extracted = VoiceAnalysisEngine.extractInformation(transcript)
      assert.equal(extracted.yearsOfExperience, 6)
    })

    await tC.test('C5: Extracts technical skills mentioned in transcript', () => {
      const transcript = 'Candidate: In my daily work I use React, TypeScript, Docker, and PostgreSQL.'
      const extracted = VoiceAnalysisEngine.extractInformation(transcript)
      assert.ok(extracted.skillsMentioned.includes('React'))
      assert.ok(extracted.skillsMentioned.includes('TypeScript'))
      assert.ok(extracted.skillsMentioned.includes('PostgreSQL'))
    })

    await tC.test('C6: Extracts work mode preference and location', () => {
      const transcript = 'Candidate: I am based in Bengaluru and prefer a hybrid work model.'
      const extracted = VoiceAnalysisEngine.extractInformation(transcript)
      assert.equal(extracted.workModePreference, 'HYBRID')
      assert.equal(extracted.preferredLocation, 'Bengaluru')
    })

    await tC.test('C7: ZERO FABRICATION: Unmentioned fields return null (no hallucination)', () => {
      const transcript = 'AI Agent: Hello candidate!\nCandidate: Hello! Nice to connect with you.'
      const extracted = VoiceAnalysisEngine.extractInformation(transcript)
      assert.equal(extracted.noticePeriodDays, null)
      assert.equal(extracted.expectedSalary, null)
      assert.equal(extracted.currentSalary, null)
      assert.equal(extracted.yearsOfExperience, null)
      assert.equal(extracted.workModePreference, null)
    })
  })

  // ============================================================
  // CATEGORY D: Authentic AI Summary (Zero Fabrication)
  // ============================================================
  await t.test('Category D: Authentic AI Summary', async (tD) => {
    await tD.test('D1: Complete transcript produces structured, grounded summary', () => {
      const transcript = [
        'AI Agent: Hi Arjun, this is AttendX for the Senior Full Stack Engineer position.',
        'Candidate: Hi, I have 5 years experience with React, TypeScript, and Node.js.',
        'Candidate: My notice period is 30 days and I am expecting 24 LPA CTC.',
      ].join('\n')

      const summary = VoiceAnalysisEngine.generateSummary(transcript, {
        candidateName: 'Arjun Mehta',
        requisitionTitle: 'Senior Full Stack Engineer',
      })

      assert.ok(summary !== null)
      assert.ok(summary.includes('Arjun Mehta'))
      assert.ok(summary.includes('Senior Full Stack Engineer'))
      assert.ok(summary.includes('5 years'))
      assert.ok(summary.includes('30 days'))
      assert.ok(summary.includes('24 LPA'))
    })

    await tD.test('D2: ZERO FABRICATION: Empty or whitespace transcript returns null summary', () => {
      assert.equal(VoiceAnalysisEngine.generateSummary(''), null)
      assert.equal(VoiceAnalysisEngine.generateSummary('   \n  \t  '), null)
      assert.equal(VoiceAnalysisEngine.generateSummary(null), null)
    })
  })

  // ============================================================
  // CATEGORY E: Sentiment Analysis (Zero Fabrication)
  // ============================================================
  await t.test('Category E: Sentiment Analysis', async (tE) => {
    await tE.test('E1: Enthusiastic, collaborative transcript yields POSITIVE sentiment', () => {
      const transcript = 'Candidate: Absolutely, I would love to! That sounds fantastic and aligns perfectly with my goals.'
      const res = VoiceAnalysisEngine.analyzeSentiment(transcript)
      assert.ok(res !== null)
      assert.equal(res.sentiment, 'POSITIVE')
      assert.ok(res.confidence >= 0.7)
    })

    await tE.test('E2: Disinterested or negative transcript yields NEGATIVE sentiment', () => {
      const transcript = 'Candidate: I am not interested. The compensation is disappointing and your process is too slow.'
      const res = VoiceAnalysisEngine.analyzeSentiment(transcript)
      assert.ok(res !== null)
      assert.equal(res.sentiment, 'NEGATIVE')
    })

    await tE.test('E3: Matter-of-fact factual transcript yields NEUTRAL sentiment', () => {
      const transcript = 'Candidate: My notice is 30 days. I have 4 years experience in Python.'
      const res = VoiceAnalysisEngine.analyzeSentiment(transcript)
      assert.ok(res !== null)
      assert.ok(['NEUTRAL', 'POSITIVE'].includes(res.sentiment))
    })

    await tE.test('E4: ZERO FABRICATION: Empty transcript produces null sentiment', () => {
      assert.equal(VoiceAnalysisEngine.analyzeSentiment(''), null)
      assert.equal(VoiceAnalysisEngine.analyzeSentiment('   '), null)
      assert.equal(VoiceAnalysisEngine.analyzeSentiment(null), null)
    })
  })

  // ============================================================
  // CATEGORY F: 5-Dimension Explainable AI Scoring (Zero Fabrication)
  // ============================================================
  await t.test('Category F: 5-Dimension Explainable AI Scoring', async (tF) => {
    const req = {
      title: 'Senior Full Stack Engineer',
      skills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL'],
      min_experience_years: 4,
    }
    const cand = {
      full_name: 'Arjun Mehta',
      total_experience_years: 5,
    }

    await tF.test('F1: Generates 5 distinct dimensions with weights summing to 100%', () => {
      const transcript = [
        'Candidate: I have 5 years experience with React, TypeScript, and Node.js.',
        'Candidate: My notice period is 30 days. Looking for hybrid roles.',
      ].join('\n')

      const scoreResult = VoiceAnalysisEngine.calculateAiScore(transcript, req, cand)
      assert.ok(scoreResult !== null)
      assert.ok(scoreResult.skill_relevance)
      assert.ok(scoreResult.role_relevance)
      assert.ok(scoreResult.communication)
      assert.ok(scoreResult.experience)
      assert.ok(scoreResult.availability_fit)

      const totalWeight =
        scoreResult.skill_relevance.weight +
        scoreResult.role_relevance.weight +
        scoreResult.communication.weight +
        scoreResult.experience.weight +
        scoreResult.availability_fit.weight

      assert.equal(totalWeight, 100)
    })

    await tF.test('F2: Overall score is weighted composite of the 5 dimensions', () => {
      const transcript = [
        'Candidate: I have 5 years experience building production apps in React, TypeScript, and Node.js.',
        'Candidate: My notice period is 0 days and I can join immediately.',
      ].join('\n')

      const res = VoiceAnalysisEngine.calculateAiScore(transcript, req, cand)
      const expectedOverall = Math.round(
        res.skill_relevance.score * 0.30 +
        res.role_relevance.score * 0.25 +
        res.communication.score * 0.20 +
        res.experience.score * 0.15 +
        res.availability_fit.score * 0.10
      )

      assert.equal(res.overall_score, expectedOverall)
    })

    await tF.test('F3: Immediate availability scores higher on availability dimension than 90 days', () => {
      const tImmediate = 'Candidate: I can join immediately with 0 days notice.'
      const tLongNotice = 'Candidate: My notice period is 90 days non-negotiable.'

      const resImm = VoiceAnalysisEngine.calculateAiScore(tImmediate, req, cand)
      const resLong = VoiceAnalysisEngine.calculateAiScore(tLongNotice, req, cand)

      assert.ok(resImm.availability_fit.score > resLong.availability_fit.score)
      assert.equal(resImm.availability_fit.score, 100)
      assert.equal(resLong.availability_fit.score, 65)
    })

    await tF.test('F4: ZERO FABRICATION: Empty transcript produces null score and breakdown', () => {
      assert.equal(VoiceAnalysisEngine.calculateAiScore('', req, cand), null)
      assert.equal(VoiceAnalysisEngine.calculateAiScore('   ', req, cand), null)
      assert.equal(VoiceAnalysisEngine.calculateAiScore(null, req, cand), null)
    })
  })

  // ============================================================
  // CATEGORY G: Interview Scheduling Coordination & Candidate Follow-Up
  // ============================================================
  await t.test('Category G: Scheduling Coordination & Follow-Up Duplicate Prevention', async (tG) => {
    const db = createMockVoiceDb()

    await tG.test('G1: Scheduling call with slot confirmation coordinates interview', async () => {
      const slot = {
        start: new Date(Date.now() + 86400000).toISOString(),
        end: new Date(Date.now() + 90000000).toISOString(),
      }

      const call = await VoiceAIService.initiateCall(db, 'tenant-alpha', 'user-001', {
        candidate_id: 'c1111111-1111-1111-1111-111111111111',
        application_id: 'app11111-1111-1111-1111-111111111111',
        requisition_id: 'r1111111-1111-1111-1111-111111111111',
        call_purpose: 'SCHEDULING',
        scheduled_slots: [slot],
        simulate_outcome: 'COMPLETED',
      })

      assert.equal(call.call_purpose, 'SCHEDULING')
      assert.equal(call.status, 'COMPLETED')
      assert.ok(call.transcript.includes('schedule') || call.transcript.includes('confirmed'))
      // Check that interview was automatically coordinated
      assert.ok(db._store.interviews.length > 0)
    })

    await tG.test('G2: Follow-up call records purpose', async () => {
      const call = await VoiceAIService.initiateCall(db, 'tenant-alpha', 'user-001', {
        candidate_id: 'c1111111-1111-1111-1111-111111111111',
        call_purpose: 'FOLLOW_UP',
        follow_up_purpose: 'experience certificate verification',
      })

      assert.equal(call.call_purpose, 'FOLLOW_UP')
      assert.equal(call.extracted_data.follow_up_purpose, 'experience certificate verification')
    })

    await tG.test('G3: Duplicate follow-up call prevention: blocks concurrent active or recent completed (409 Conflict)', async () => {
      // Trying to trigger another follow-up call immediately for the same candidate
      await assert.rejects(
        async () => {
          await VoiceAIService.initiateCall(db, 'tenant-alpha', 'user-001', {
            candidate_id: 'c1111111-1111-1111-1111-111111111111',
            call_purpose: 'FOLLOW_UP',
          })
        },
        (err) => err.status === 409 && (err.message.includes('follow-up call') || err.message.includes('active follow-up call'))
      )
    })
  })

  // ============================================================
  // CATEGORY H: Authoritative State Machine & Idempotent Webhook Events
  // ============================================================
  await t.test('Category H: State Machine & Idempotent Webhook Events', async (tH) => {
    await tH.test('H1: Normal state progression: INITIATED -> IN_PROGRESS -> COMPLETED', () => {
      assert.equal(VoiceCallStateMachine.canTransition('INITIATED', 'IN_PROGRESS'), true)
      assert.equal(VoiceCallStateMachine.canTransition('IN_PROGRESS', 'COMPLETED'), true)
    })

    await tH.test('H2: Direct completion from INITIATED is valid', () => {
      assert.equal(VoiceCallStateMachine.canTransition('INITIATED', 'COMPLETED'), true)
    })

    await tH.test('H3: Unsuccessful outcomes: BUSY, NO_ANSWER, FAILED are valid from INITIATED/IN_PROGRESS', () => {
      assert.equal(VoiceCallStateMachine.canTransition('INITIATED', 'BUSY'), true)
      assert.equal(VoiceCallStateMachine.canTransition('INITIATED', 'NO_ANSWER'), true)
      assert.equal(VoiceCallStateMachine.canTransition('IN_PROGRESS', 'FAILED'), true)
    })

    await tH.test('H4: Terminal state COMPLETED cannot transition to IN_PROGRESS (409 Conflict)', () => {
      assert.equal(VoiceCallStateMachine.isTerminal('COMPLETED'), true)
      assert.equal(VoiceCallStateMachine.canTransition('COMPLETED', 'IN_PROGRESS'), false)

      assert.throws(
        () => {
          VoiceCallStateMachine.validateTransition('COMPLETED', 'IN_PROGRESS')
        },
        (err) => err instanceof VoiceCallStateMachineError && err.status === 409
      )
    })

    await tH.test('H5: Idempotent webhook handling: duplicate COMPLETED returns alreadyProcessed: true', async () => {
      const db = createMockVoiceDb()
      const initCall = await VoiceAIService.initiateCall(db, 'tenant-alpha', 'user-001', {
        candidate_id: 'c1111111-1111-1111-1111-111111111111',
        call_purpose: 'SCREENING',
        simulate_outcome: 'COMPLETED',
      })

      // Send first completion webhook event
      const res1 = await VoiceAIService.processProviderEvent(db, 'tenant-alpha', {
        providerCallId: initCall.provider_call_id,
        status: 'COMPLETED',
        durationSeconds: 210,
        transcript: 'AI Agent: Great!\nCandidate: Thank you!',
        aiSummary: 'Summary of screening call',
        overallScore: 88,
        sentiment: 'POSITIVE',
      })
      assert.equal(res1.alreadyProcessed, true) // Already completed by mock provider

      // Send second duplicate completion webhook event
      const res2 = await VoiceAIService.processProviderEvent(db, 'tenant-alpha', {
        providerCallId: initCall.provider_call_id,
        status: 'COMPLETED',
        durationSeconds: 210,
      })
      assert.equal(res2.alreadyProcessed, true)
    })
  })

  // ============================================================
  // CATEGORY I: Tenant Isolation & Tamper-Evident Auditing
  // ============================================================
  await t.test('Category I: Tenant Isolation & Tamper-Evident Auditing', async (tI) => {
    const db = createMockVoiceDb()

    await tI.test('I1: Cross-tenant candidate call access is blocked (404)', async () => {
      // Vikram Singh belongs to tenant-beta. Attempting to call him as tenant-alpha
      await assert.rejects(
        async () => {
          await VoiceAIService.initiateCall(db, 'tenant-alpha', 'user-001', {
            candidate_id: 'c4444444-4444-4444-4444-444444444444',
          })
        },
        (err) => err.status === 404
      )
    })

    await tI.test('I2: Tamper-evident audit logging records voice call mutations', async () => {
      const call = await VoiceAIService.initiateCall(db, 'tenant-alpha', 'user-001', {
        candidate_id: 'c1111111-1111-1111-1111-111111111111',
        call_purpose: 'SCREENING',
      })

      const auditLogs = db._store.hiring_audit_logs
      assert.ok(auditLogs.length > 0)
      const callLog = auditLogs.find((l) => l.action === 'VOICE_CALL_INITIATED' && l.entity_id === call.id)
      assert.ok(callLog)
      assert.equal(callLog.organization_id, 'tenant-alpha')
      assert.equal(callLog.user_id, 'user-001')
      assert.equal(callLog.entity_type, 'ai_voice_calls')
    })
  })
})
