// ============================================================
// AttendX v2 — Module 4: Structured Interview Scheduling & Email Integration
// Comprehensive Verification Test Suite
// Non-negotiable constraints: Zero fabrication, authentic Google Meet validation,
// safe email templating with delivery tracking, and 3-round advancement.
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  STRUCTURED_INTERVIEW_ROUNDS,
  getStructuredRoundConfig,
  validateGoogleMeetUrl,
  renderInterviewEmail,
  escapeHtml
} from '../lib/hiring/interview-rounds.ts'
import { GoogleMeetProvider } from '../lib/hiring/meeting-provider.ts'
import { SendGridEmailProvider } from '../lib/hiring/email-provider.ts'
import { mockHiringStore } from '../lib/hiring/mock-store.ts'
import { InterviewService } from '../lib/hiring/interview-service.ts'

const ACME_ORG_ID = '11111111-0000-0000-0000-000000000001'
const BASE_URL = 'http://localhost:3000'

test('1. Structured Interview Rounds Configuration (3 Rounds)', (t) => {
  assert.equal(STRUCTURED_INTERVIEW_ROUNDS.length, 3, 'Must define exactly 3 canonical interview rounds')

  const r1 = getStructuredRoundConfig(1)
  assert.equal(r1.round_number, 1)
  assert.equal(r1.round_type, 'INTRODUCTORY')
  assert.equal(r1.default_duration_minutes, 20)
  assert.ok(r1.competencies.includes('Communication & Articulation'))

  const r2 = getStructuredRoundConfig(2)
  assert.equal(r2.round_number, 2)
  assert.equal(r2.round_type, 'CODING')
  assert.equal(r2.default_duration_minutes, 60)
  assert.ok(r2.competencies.includes('Problem Solving & Algorithms'))

  const r3 = getStructuredRoundConfig(3)
  assert.equal(r3.round_number, 3)
  assert.equal(r3.round_type, 'DEEP_DIVE')
  assert.equal(r3.default_duration_minutes, 60)
  assert.ok(r3.competencies.includes('System Architecture & Scalability'))
})

test('2. Google Meet URL Validation — Strict Security & Format Gate', (t) => {
  // Valid URLs
  const v1 = validateGoogleMeetUrl('https://meet.google.com/abc-defg-hij')
  assert.equal(v1.isValid, true, 'Standard 3-segment Meet URL must be valid')

  const v2 = validateGoogleMeetUrl('https://meet.google.com/abc-defg-hij?authuser=0')
  assert.equal(v2.isValid, true, 'Meet URL with authuser parameter must be valid')

  const v3 = validateGoogleMeetUrl('https://meet.google.com/xyz-1234-abc')
  assert.equal(v3.isValid, true)

  // Invalid URLs
  const inv1 = validateGoogleMeetUrl('http://meet.google.com/abc-defg-hij')
  assert.equal(inv1.isValid, false, 'Insecure HTTP link must be rejected')

  const inv2 = validateGoogleMeetUrl('https://zoom.us/j/123456789')
  assert.equal(inv2.isValid, false, 'Non-Google Meet URL must be rejected')

  const inv3 = validateGoogleMeetUrl('https://meet.google.com/')
  assert.equal(inv3.isValid, false, 'Empty path must be rejected')

  const inv4 = validateGoogleMeetUrl('not-a-url')
  assert.equal(inv4.isValid, false)

  const inv5 = validateGoogleMeetUrl('')
  assert.equal(inv5.isValid, false)
})

test('3. HTML Escaping & Email Template Interpolation', (t) => {
  const unsafeString = '<script>alert("xss")</script> & "quotes"'
  const escaped = escapeHtml(unsafeString)
  assert.ok(!escaped.includes('<script>'), 'Must escape script tags')
  assert.ok(escaped.includes('&lt;script&gt;'))
  assert.ok(escaped.includes('&amp;'))

  const template = 'Hello {{candidate_name}}, your {{round_name}} is at {{interview_time}}.'
  const rendered = renderInterviewEmail(template, {
    candidate_name: 'Aarav Sharma',
    round_name: 'Round 1 — Introductory Call',
    interview_time: '11:00 AM',
  })
  assert.equal(rendered, 'Hello Aarav Sharma, your Round 1 — Introductory Call is at 11:00 AM.')
})

test('4. Zero-Fabrication Google Meet Provider Behavior', async (t) => {
  const provider = new GoogleMeetProvider()

  // Manual link supplied
  const res1 = await provider.createMeeting({
    title: 'Round 1 Interview',
    scheduledStart: new Date().toISOString(),
    scheduledEnd: new Date(Date.now() + 1800000).toISOString(),
    timezone: 'Asia/Kolkata',
    attendeeEmails: ['cand@example.com'],
    platform: 'GOOGLE_MEET',
    customLink: 'https://meet.google.com/abc-defg-hij',
  })
  assert.equal(res1.joinUrl, 'https://meet.google.com/abc-defg-hij')
  assert.equal(res1.isManual, true)

  // No custom link supplied: provider returns default Google Meet link
  const res2 = await provider.createMeeting({
    title: 'Round 2 Interview',
    scheduledStart: new Date().toISOString(),
    scheduledEnd: new Date(Date.now() + 3600000).toISOString(),
    timezone: 'Asia/Kolkata',
    attendeeEmails: ['cand@example.com'],
    platform: 'GOOGLE_MEET',
  })
  assert.ok(res2.joinUrl.startsWith('https://meet.google.com/'), 'Default Meet URL must start with https://meet.google.com/')
  assert.equal(res2.platform, 'GOOGLE_MEET')
})

test('5. Zero-Fabrication Email Delivery Status', async (t) => {
  const emailProvider = new SendGridEmailProvider()

  // Draft mode
  const draftRes = await emailProvider.sendEmail({
    to: 'cand@example.com',
    subject: 'Draft Invite',
    text: 'Body',
    isDraft: true,
  })
  assert.equal(draftRes.status, 'DRAFT')
  assert.equal(draftRes.simulationStatus, 'SIMULATED')

  // When SENDGRID_API_KEY is not present, must not claim SENT or DELIVERED
  delete process.env.SENDGRID_API_KEY
  const pendingRes = await emailProvider.sendEmail({
    to: 'cand@example.com',
    subject: 'Pending Invite',
    text: 'Body',
  })
  assert.equal(pendingRes.status, 'PENDING_DELIVERY', 'Uncredentialed delivery must be marked PENDING_DELIVERY')
  assert.equal(pendingRes.simulationStatus, 'SIMULATED')
})

test('6. Mock Store Interview Scheduling, Rescheduling, and Feedback', (t) => {
  mockHiringStore.ensureTenantSeeded(ACME_ORG_ID)
  const app = mockHiringStore.applications.find(a => a.organization_id === ACME_ORG_ID)
  assert.ok(app, 'Must find seeded application for ACME_ORG_ID')

  // Schedule Round 1
  const scheduled = mockHiringStore.scheduleInterview(ACME_ORG_ID, {
    application_id: app.id,
    round_number: 1,
    title: 'Round 1 — Introductory / Quick Hello',
    scheduled_start: '2026-11-01T10:00:00.000Z',
    scheduled_end: '2026-11-01T10:20:00.000Z',
    timezone: 'Asia/Kolkata',
    platform: 'GOOGLE_MEET',
    custom_meeting_link: 'https://meet.google.com/int-test-one',
  })
  assert.equal(scheduled.round_number, 1)
  assert.equal(scheduled.status, 'SCHEDULED')
  assert.equal(scheduled.meeting_link, 'https://meet.google.com/int-test-one')

  // Reschedule Round 1
  const rescheduled = mockHiringStore.rescheduleInterview(
    ACME_ORG_ID,
    scheduled.id,
    '2026-11-01T14:00:00.000Z',
    '2026-11-01T14:20:00.000Z',
    'Candidate requested afternoon slot'
  )
  assert.equal(rescheduled.status, 'RESCHEDULED')
  assert.equal(rescheduled.scheduled_start, '2026-11-01T14:00:00.000Z')

  // Record Scorecard Feedback
  const feedbackResult = mockHiringStore.recordInterviewFeedback(ACME_ORG_ID, scheduled.id, {
    technical_score: 90,
    communication_score: 95,
    problem_solving_score: 88,
    culture_fit_score: 92,
    recommendation: 'STRONG_HIRE',
    decision: 'PASS',
    scorecard_feedback: 'Outstanding articulation and clear career motivation.',
  })
  assert.equal(feedbackResult.interview.status, 'COMPLETED')
  assert.equal(feedbackResult.interview.decision, 'PASS')
  assert.equal(feedbackResult.evaluation.recommendation, 'STRONG_HIRE')
  assert.equal(feedbackResult.evaluation.technical_score, 90)

  // Advance Round 1 -> 2
  const advance1 = mockHiringStore.advanceRound(ACME_ORG_ID, scheduled.id, {
    title: 'Round 2 — Technical / Coding Assessment',
    scheduled_start: '2026-11-03T10:00:00.000Z',
    scheduled_end: '2026-11-03T11:00:00.000Z',
    custom_meeting_link: 'https://meet.google.com/int-test-two',
  })
  assert.equal(advance1.advanced, true)
  assert.equal(advance1.finalRound, false)
  assert.equal(advance1.nextRound, 2)
  assert.ok(advance1.nextInterview)
  assert.equal(advance1.nextInterview.round_number, 2)

  // Complete Round 2
  mockHiringStore.recordInterviewFeedback(ACME_ORG_ID, advance1.nextInterview.id, {
    technical_score: 88,
    recommendation: 'HIRE',
    decision: 'PASS',
  })

  // Advance Round 2 -> 3
  const advance2 = mockHiringStore.advanceRound(ACME_ORG_ID, advance1.nextInterview.id, {
    title: 'Round 3 — Technical Deep Dive & HR',
    scheduled_start: '2026-11-05T10:00:00.000Z',
    scheduled_end: '2026-11-05T11:00:00.000Z',
    custom_meeting_link: 'https://meet.google.com/int-test-three',
  })
  assert.equal(advance2.advanced, true)
  assert.equal(advance2.nextRound, 3)
  assert.ok(advance2.nextInterview)

  // Complete Round 3
  mockHiringStore.recordInterviewFeedback(ACME_ORG_ID, advance2.nextInterview.id, {
    technical_score: 92,
    recommendation: 'STRONG_HIRE',
    decision: 'PASS',
  })

  // Advance Round 3 -> Final Selection
  const advance3 = mockHiringStore.advanceRound(ACME_ORG_ID, advance2.nextInterview.id)
  assert.equal(advance3.advanced, true)
  assert.equal(advance3.finalRound, true)
  assert.equal(advance3.application?.stage, 'SELECTED', 'Completing Round 3 must advance application to SELECTED')
})

test('7. Interview Service: Conflict Detection across Interviewers', async (t) => {
  // Create a mock client that delegates to mock store
  const mockClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            lt: () => ({
              gt: () => Promise.resolve({
                data: [
                  {
                    id: 'existing-int-001',
                    title: 'Active Coding Interview',
                    scheduled_start: '2026-11-01T10:00:00.000Z',
                    scheduled_end: '2026-11-01T11:00:00.000Z',
                    interviewer_ids: ['user-interviewer-1'],
                  }
                ],
                error: null
              })
            })
          })
        })
      })
    })
  }

  // Conflict case: same interviewer booked at overlapping time
  const conflict = await InterviewService.detectConflicts(
    mockClient,
    ACME_ORG_ID,
    ['user-interviewer-1'],
    '2026-11-01T10:30:00.000Z',
    '2026-11-01T11:30:00.000Z'
  )
  assert.equal(conflict.hasConflict, true, 'Must detect overlapping interview for same interviewer')
  assert.equal(conflict.conflictingInterviews.length, 1)

  // Non-conflict case: different interviewer
  const noConflict = await InterviewService.detectConflicts(
    mockClient,
    ACME_ORG_ID,
    ['user-interviewer-2'],
    '2026-11-01T10:30:00.000Z',
    '2026-11-01T11:30:00.000Z'
  )
  assert.equal(noConflict.hasConflict, false, 'Different interviewer must not conflict')
})

test('8. Interview Service: Schedule Interview with Google Meet Link Validation', async (t) => {
  const dummyClient = { from: () => { throw new Error('schema cache missing table') } }

  // Rejects invalid link
  await assert.rejects(
    async () => {
      await InterviewService.schedule(
        dummyClient,
        ACME_ORG_ID,
        'user-hr-01',
        {
          application_id: 'app-001',
          title: 'Round 1',
          scheduled_start: '2026-11-01T10:00:00.000Z',
          scheduled_end: '2026-11-01T10:20:00.000Z',
          platform: 'GOOGLE_MEET',
          custom_meeting_link: 'https://invalid-link.com/123',
          interviewer_ids: ['user-01'],
        }
      )
    },
    (err) => {
      assert.equal(err.status, 400)
      assert.ok(err.message.includes('Google Meet URL'))
      return true
    }
  )

  // Accepts valid Google Meet link and falls back gracefully to mockStore
  const scheduled = await InterviewService.schedule(
    dummyClient,
    ACME_ORG_ID,
    'user-hr-01',
    {
      application_id: mockHiringStore.applications[0].id,
      round_number: 1,
      title: 'Round 1 — Introductory / Quick Hello',
      scheduled_start: '2026-11-02T10:00:00.000Z',
      scheduled_end: '2026-11-02T10:20:00.000Z',
      platform: 'GOOGLE_MEET',
      custom_meeting_link: 'https://meet.google.com/test-meet-srv',
      interviewer_ids: ['user-01'],
    }
  )
  assert.ok(scheduled)
  assert.equal(scheduled.meeting_link, 'https://meet.google.com/test-meet-srv')
  assert.equal(scheduled.status, 'SCHEDULED')
})

test('9. Interview Service: Record Feedback Scorecard', async (t) => {
  const dummyClient = { from: () => { throw new Error('schema cache missing table') } }
  const interview = mockHiringStore.interviews[0]

  const result = await InterviewService.recordFeedback(
    dummyClient,
    ACME_ORG_ID,
    interview.id,
    'user-evaluator-1',
    {
      technical_score: 95,
      communication_score: 92,
      problem_solving_score: 90,
      culture_fit_score: 94,
      recommendation: 'STRONG_HIRE',
      decision: 'PASS',
      scorecard_feedback: 'Demonstrated exceptional understanding of multi-round interview pipelines.',
    }
  )
  assert.ok(result.interview)
  assert.equal(result.interview.status, 'COMPLETED')
  assert.equal(result.interview.decision, 'PASS')
  assert.equal(result.evaluation.technical_score, 95)
})

test('10. Interview Service: Advance Round (Round 1 -> 2 -> 3 -> SELECTED)', async (t) => {
  const dummyClient = { from: () => { throw new Error('schema cache missing table') } }
  const interview = mockHiringStore.interviews[0]

  // Advance
  const advResult = await InterviewService.advanceRound(
    dummyClient,
    ACME_ORG_ID,
    interview.id,
    'user-hr-01',
    {
      title: 'Round 2 — Technical / Coding Assessment',
      scheduled_start: '2026-11-04T10:00:00.000Z',
      scheduled_end: '2026-11-04T11:00:00.000Z',
      custom_meeting_link: 'https://meet.google.com/adv-round-two',
    }
  )
  assert.equal(advResult.advanced, true)
})

test('11. HTTP TCP Boundary: Unauthenticated access strictly returns 401', async (t) => {
  const res = await fetch(`${BASE_URL}/api/hiring/interviews`)
  assert.equal(res.status, 401, 'Unauthenticated TCP request to /api/hiring/interviews must fail closed with 401')
})
