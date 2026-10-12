// ============================================================
// AttendX v2 — Module 4: Candidate Assessment Test Suite
// Non-Negotiable Charter Rules: Zero Fabrication, Server-Side Identity, Dual-Security
// Verifies:
//  1. Anti-leak question delivery (candidate context strips answer keys)
//  2. Admin template retrieval (preserves answer keys for evaluation)
//  3. Strict tenant isolation (rejects cross-tenant access with 404)
//  4. Session start & countdown timer calculation
//  5. Deterministic grading (passing score positive control)
//  6. Deterministic grading (failing score negative control)
//  7. Text / Code keyword rubric evaluation
//  8. Server-side timer expiry enforcement (expired status & passed=false)
//  9. Idempotent submission handling
// 10. Atomic audit event logging
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import { AssessmentService } from '../lib/hiring/assessment-service.ts'

// In-memory mock client implementing Supabase table queries
function createMockSupabase(initialStore = {}) {
  const store = {
    assessments: [],
    candidate_assessments: [],
    job_applications: [],
    hiring_audit_logs: [],
    ...initialStore,
  }

  function createQueryBuilder(table) {
    let filters = []
    let selectedCols = '*'
    let isSingle = false
    let isMaybeSingle = false
    let orderCol = null
    let orderAsc = true
    let insertData = null
    let updateData = null

    const builder = {
      select(cols = '*') {
        selectedCols = cols
        return builder
      },
      insert(payload) {
        insertData = Array.isArray(payload) ? payload : [payload]
        return builder
      },
      update(payload) {
        updateData = payload
        return builder
      },
      eq(col, val) {
        filters.push({ type: 'eq', col, val })
        return builder
      },
      order(col, opts = { ascending: true }) {
        orderCol = col
        orderAsc = opts.ascending ?? true
        return builder
      },
      single() {
        isSingle = true
        return builder.then ? builder.then() : execute()
      },
      maybeSingle() {
        isMaybeSingle = true
        return builder.then ? builder.then() : execute()
      },
      then(onfulfilled, onrejected) {
        const result = execute()
        return Promise.resolve(result).then(onfulfilled, onrejected)
      },
    }

    function execute() {
      // 1. Handle INSERT
      if (insertData) {
        const inserted = insertData.map(row => {
          const item = {
            id: row.id || `mock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            created_at: new Date().toISOString(),
            ...row,
          }
          store[table].push(item)
          return item
        })
        const data = isSingle ? inserted[0] : inserted
        return { data, error: null }
      }

      // 2. Handle UPDATE
      if (updateData) {
        let matching = store[table].filter(row => {
          return filters.every(f => row[f.col] === f.val)
        })
        matching.forEach(row => {
          Object.assign(row, updateData)
        })
        return { data: matching, error: null }
      }

      // 3. Handle SELECT
      let rows = [...(store[table] || [])]
      for (const f of filters) {
        rows = rows.filter(r => r[f.col] === f.val)
      }

      // Handle joins if requested
      if (selectedCols.includes('assessment:assessments(*)')) {
        rows = rows.map(r => ({
          ...r,
          assessment: store.assessments.find(a => a.id === r.assessment_id) || null,
        }))
      }

      if (isSingle) {
        if (rows.length === 0) {
          return { data: null, error: { message: `No rows found in ${table}` } }
        }
        return { data: rows[0], error: null }
      }

      if (isMaybeSingle) {
        return { data: rows.length > 0 ? rows[0] : null, error: null }
      }

      return { data: rows, error: null }
    }

    return builder
  }

  return {
    from: (table) => createQueryBuilder(table),
    _store: store,
  }
}

// Fixtures for testing
const TENANT_A = 'tenant-acme-001'
const TENANT_B = 'tenant-globex-002'
const USER_RECRUITER = 'user-hr-101'
const CANDIDATE_ID = 'cand-alice-001'
const APP_ID = 'app-eng-001'

const SAMPLE_QUESTIONS = [
  {
    id: 'q1',
    question_text: 'What is the time complexity of lookup in an average hash table?',
    question_type: 'MULTIPLE_CHOICE',
    options: ['O(1)', 'O(n)', 'O(log n)', 'O(n^2)'],
    correct_option_index: 0,
    points: 20,
  },
  {
    id: 'q2',
    question_text: 'Which React hook handles side effects in functional components?',
    question_type: 'MULTIPLE_CHOICE',
    options: ['useState', 'useEffect', 'useMemo', 'useContext'],
    correct_option_index: 1,
    points: 20,
  },
  {
    id: 'q3',
    question_text: 'Explain how Node.js handles asynchronous operations using the Event Loop.',
    question_type: 'TEXT',
    rubric_keywords: ['libuv', 'callback', 'microtask', 'event loop', 'non-blocking'],
    points: 60,
  },
]

// ============================================================
// TESTS
// ============================================================

test('Scenario 1: Template Creation & Audit Event', async () => {
  const db = createMockSupabase()

  const assessment = await AssessmentService.createAssessment(
    db,
    TENANT_A,
    USER_RECRUITER,
    {
      title: 'Full Stack Engineering Assessment',
      description: 'Technical evaluation of Node.js and React competency',
      time_limit_minutes: 30,
      passing_score: 70,
      questions: SAMPLE_QUESTIONS,
    }
  )

  assert.equal(assessment.title, 'Full Stack Engineering Assessment')
  assert.equal(assessment.passing_score, 70)
  assert.equal(assessment.time_limit_minutes, 30)
  assert.equal(assessment.questions.length, 3)

  // Verify audit log
  const auditLogs = db._store.hiring_audit_logs
  assert.equal(auditLogs.length, 1)
  assert.equal(auditLogs[0].action, 'CREATE')
  assert.equal(auditLogs[0].entity_type, 'ASSESSMENT')
  assert.equal(auditLogs[0].organization_id, TENANT_A)
})

test('Scenario 2: Anti-Leak Question Delivery (Candidate Context Strips Keys)', async () => {
  const db = createMockSupabase({
    assessments: [
      {
        id: 'asm-001',
        organization_id: TENANT_A,
        title: 'Security Anti-Leak Test',
        time_limit_minutes: 30,
        passing_score: 60,
        questions: SAMPLE_QUESTIONS,
      },
    ],
  })

  // Candidate context: isCandidateContext = true
  const candidatePayload = await AssessmentService.getAssessment(db, TENANT_A, 'asm-001', true)

  for (const q of candidatePayload.questions) {
    assert.equal(q.correct_option_index, undefined, 'Answer key (correct_option_index) MUST NOT leak to candidate')
    assert.equal(q.rubric_keywords, undefined, 'Rubric keywords MUST NOT leak to candidate')
    assert.ok(q.question_text, 'Question text must be present')
  }

  // Recruiter context: isCandidateContext = false (Positive Control)
  const recruiterPayload = await AssessmentService.getAssessment(db, TENANT_A, 'asm-001', false)
  assert.equal(recruiterPayload.questions[0].correct_option_index, 0, 'Recruiter MUST see answer keys')
  assert.ok(recruiterPayload.questions[2].rubric_keywords.length > 0, 'Recruiter MUST see rubric keywords')
})

test('Scenario 3: Strict Tenant Isolation (Cross-Tenant Access Throws 404)', async () => {
  const db = createMockSupabase({
    assessments: [
      {
        id: 'asm-tenant-a',
        organization_id: TENANT_A,
        title: 'Tenant A Secret Exam',
        time_limit_minutes: 45,
        passing_score: 75,
        questions: SAMPLE_QUESTIONS,
      },
    ],
  })

  // Tenant B attempting to access Tenant A's assessment MUST fail closed
  await assert.rejects(
    async () => {
      await AssessmentService.getAssessment(db, TENANT_B, 'asm-tenant-a', false)
    },
    (err) => {
      assert.equal(err.status, 404)
      return true
    }
  )
})

test('Scenario 4: Assignment & Session Start with Active Countdown Timer', async () => {
  const db = createMockSupabase({
    assessments: [
      {
        id: 'asm-002',
        organization_id: TENANT_A,
        title: 'Engineering Exam',
        time_limit_minutes: 45,
        passing_score: 60,
        questions: SAMPLE_QUESTIONS,
      },
    ],
  })

  // 1. Assign assessment
  const assigned = await AssessmentService.assignAssessment(db, TENANT_A, USER_RECRUITER, {
    assessmentId: 'asm-002',
    candidateId: CANDIDATE_ID,
    applicationId: APP_ID,
  })

  assert.equal(assigned.status, 'ASSIGNED')
  assert.equal(assigned.assessment_id, 'asm-002')

  // 2. Start assessment session
  const session = await AssessmentService.startAssessment(db, TENANT_A, assigned.id)

  assert.equal(session.candidateAssessment.status, 'IN_PROGRESS')
  assert.ok(session.candidateAssessment.started_at, 'started_at timestamp must be set')
  assert.equal(session.timeLimitMinutes, 45)
  assert.ok(session.timeRemainingSeconds <= 45 * 60 && session.timeRemainingSeconds > 0)

  // Verify anti-leak in session questions
  assert.equal(session.assessment.questions[0].correct_option_index, undefined)
})

test('Scenario 5: Deterministic Evaluation — Passing Score (Positive Control)', async () => {
  const db = createMockSupabase({
    assessments: [
      {
        id: 'asm-003',
        organization_id: TENANT_A,
        title: 'Grading Test',
        time_limit_minutes: 30,
        passing_score: 70,
        questions: SAMPLE_QUESTIONS,
      },
    ],
    candidate_assessments: [
      {
        id: 'ca-pass-001',
        organization_id: TENANT_A,
        assessment_id: 'asm-003',
        candidate_id: CANDIDATE_ID,
        application_id: APP_ID,
        status: 'IN_PROGRESS',
        started_at: new Date().toISOString(), // Just started
        answers: {},
      },
    ],
  })

  // Submit all correct answers:
  // q1: 0 (correct, 20 pts)
  // q2: 1 (correct, 20 pts)
  // q3: Answer containing all rubric keywords (60 pts)
  const submission = {
    candidate_assessment_id: 'ca-pass-001',
    answers: {
      q1: 0,
      q2: 1,
      q3: 'The event loop in Node.js uses libuv for non-blocking asynchronous I/O and schedules callbacks in microtask queues.',
    },
  }

  const result = await AssessmentService.submitAssessment(db, TENANT_A, submission, {
    userId: 'candidate-user-1',
  })

  assert.equal(result.status, 'EVALUATED')
  assert.equal(result.score, 100)
  assert.equal(result.passed, true)
  assert.equal(result.correct_count, 3)
  assert.equal(result.breakdown.length, 3)

  // Verify mutation persisted to candidate_assessments
  const record = db._store.candidate_assessments.find(r => r.id === 'ca-pass-001')
  assert.equal(record.passed, true)
  assert.equal(record.score, 100)
  assert.equal(record.status, 'EVALUATED')

  // Verify audit log emitted
  const auditLogs = db._store.hiring_audit_logs.filter(l => l.action === 'SUBMIT_ASSESSMENT')
  assert.equal(auditLogs.length, 1)
  assert.equal(auditLogs[0].new_values.passed, true)
})

test('Scenario 6: Deterministic Evaluation — Failing Score (Negative Control)', async () => {
  const db = createMockSupabase({
    assessments: [
      {
        id: 'asm-004',
        organization_id: TENANT_A,
        title: 'Grading Test Fail',
        time_limit_minutes: 30,
        passing_score: 70,
        questions: SAMPLE_QUESTIONS,
      },
    ],
    candidate_assessments: [
      {
        id: 'ca-fail-001',
        organization_id: TENANT_A,
        assessment_id: 'asm-004',
        candidate_id: CANDIDATE_ID,
        application_id: APP_ID,
        status: 'IN_PROGRESS',
        started_at: new Date().toISOString(),
        answers: {},
      },
    ],
  })

  // Submit wrong answers
  const submission = {
    candidate_assessment_id: 'ca-fail-001',
    answers: {
      q1: 3, // incorrect (0 pts)
      q2: 0, // incorrect (0 pts)
      q3: 'I do not know.', // misses all rubric keywords (0 pts)
    },
  }

  const result = await AssessmentService.submitAssessment(db, TENANT_A, submission)

  assert.equal(result.status, 'EVALUATED')
  assert.equal(result.score, 0)
  assert.equal(result.passed, false)
  assert.equal(result.correct_count, 0)
})

test('Scenario 7: Server-Side Time Expiry Enforcement', async () => {
  const expiredStartTime = new Date(Date.now() - 3600 * 1000).toISOString() // 1 hour ago for a 30m test

  const db = createMockSupabase({
    assessments: [
      {
        id: 'asm-005',
        organization_id: TENANT_A,
        title: 'Timed Exam',
        time_limit_minutes: 30,
        passing_score: 60,
        questions: SAMPLE_QUESTIONS,
      },
    ],
    candidate_assessments: [
      {
        id: 'ca-expired-001',
        organization_id: TENANT_A,
        assessment_id: 'asm-005',
        candidate_id: CANDIDATE_ID,
        application_id: APP_ID,
        status: 'IN_PROGRESS',
        started_at: expiredStartTime,
        answers: {},
      },
    ],
  })

  // Candidate answers all correctly, but timer expired!
  const submission = {
    candidate_assessment_id: 'ca-expired-001',
    answers: {
      q1: 0,
      q2: 1,
      q3: 'libuv callback event loop microtask non-blocking',
    },
  }

  const result = await AssessmentService.submitAssessment(db, TENANT_A, submission)

  // Must fail closed due to time expiry
  assert.equal(result.status, 'EXPIRED')
  assert.equal(result.passed, false, 'Expired test MUST NOT pass regardless of score')
})

test('Scenario 8: Idempotent Submission Handling', async () => {
  const db = createMockSupabase({
    assessments: [
      {
        id: 'asm-006',
        organization_id: TENANT_A,
        title: 'Idempotency Exam',
        time_limit_minutes: 30,
        passing_score: 50,
        questions: SAMPLE_QUESTIONS,
      },
    ],
    candidate_assessments: [
      {
        id: 'ca-idem-001',
        organization_id: TENANT_A,
        assessment_id: 'asm-006',
        candidate_id: CANDIDATE_ID,
        application_id: APP_ID,
        status: 'EVALUATED',
        score: 85,
        passed: true,
        ai_evaluation: { correct_count: 2, breakdown: [] },
        answers: { q1: 0, q2: 1 },
      },
    ],
  })

  // Resubmitting already evaluated assessment returns existing evaluation idempotently
  const res = await AssessmentService.submitAssessment(db, TENANT_A, {
    candidate_assessment_id: 'ca-idem-001',
    answers: { q1: 3 }, // attempt to alter
  })

  assert.equal(res.status, 'EVALUATED')
  assert.equal(res.score, 85)
  assert.equal(res.passed, true)
})

test('Scenario 9: Text / Code Rubric Partial Scoring', async () => {
  const db = createMockSupabase({
    assessments: [
      {
        id: 'asm-007',
        organization_id: TENANT_A,
        title: 'Rubric Exam',
        time_limit_minutes: 30,
        passing_score: 50,
        questions: [
          {
            id: 'q-code-1',
            question_text: 'Implement a debounce function in TypeScript',
            question_type: 'CODE',
            rubric_keywords: ['setTimeout', 'clearTimeout', 'closure', 'arguments'],
            points: 100,
          },
        ],
      },
    ],
    candidate_assessments: [
      {
        id: 'ca-rubric-001',
        organization_id: TENANT_A,
        assessment_id: 'asm-007',
        candidate_id: CANDIDATE_ID,
        status: 'IN_PROGRESS',
        started_at: new Date().toISOString(),
        answers: {},
      },
    ],
  })

  // Candidate provides answer matching 2 of 4 keywords (50% score)
  const res = await AssessmentService.submitAssessment(db, TENANT_A, {
    candidate_assessment_id: 'ca-rubric-001',
    answers: {
      'q-code-1': 'function debounce(fn, ms) { let timer; return () => { clearTimeout(timer); timer = setTimeout(fn, ms); }; }',
    },
  })

  assert.equal(res.status, 'EVALUATED')
  assert.equal(res.score, 50)
  assert.equal(res.passed, true)
  assert.equal(res.correct_count, 1)
})

test('Scenario 10: Strict Tenant Isolation on Session Start', async () => {
  const db = createMockSupabase({
    assessments: [
      {
        id: 'asm-008',
        organization_id: TENANT_A,
        title: 'Isolated Exam',
        time_limit_minutes: 30,
        passing_score: 50,
        questions: SAMPLE_QUESTIONS,
      },
    ],
    candidate_assessments: [
      {
        id: 'ca-isolated-001',
        organization_id: TENANT_A,
        assessment_id: 'asm-008',
        candidate_id: CANDIDATE_ID,
        status: 'ASSIGNED',
        answers: {},
      },
    ],
  })

  // Tenant B attempting to start Tenant A's candidate assessment fails closed
  await assert.rejects(
    async () => {
      await AssessmentService.startAssessment(db, TENANT_B, 'ca-isolated-001')
    },
    (err) => {
      assert.equal(err.status, 404)
      return true
    }
  )
})

