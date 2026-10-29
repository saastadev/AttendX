import test from 'node:test'
import assert from 'node:assert/strict'
import { mockHiringStore, ACME_ORG_ID } from '../lib/hiring/mock-store.ts'

test('Move to Interview and Application Resilience Suite', async (t) => {
  await t.test('1. mockHiringStore resolves dynamic application ID app-1793281089454 without throwing 404', () => {
    const dynamicId = 'app-1793281089454'
    const app = mockHiringStore.getApplicationById(ACME_ORG_ID, dynamicId)

    assert.ok(app, 'Dynamically resolved application')
    assert.equal(app.id, dynamicId)
    assert.ok(app.candidate, 'Candidate hydrated on application')
    assert.ok(app.requisition, 'Requisition hydrated on application')
  })

  await t.test('2. mockHiringStore.updateApplicationStage updates dynamic application to INTERVIEW stage', () => {
    const dynamicId = 'app-1793281089454'
    const updated = mockHiringStore.updateApplicationStage(ACME_ORG_ID, dynamicId, 'INTERVIEW', undefined, 'HR moved to interview')

    assert.ok(updated, 'Successfully updated stage')
    assert.equal(updated.stage, 'INTERVIEW')
    assert.equal(updated.id, dynamicId)
  })

  await t.test('3. mockHiringStore.scheduleInterview creates interview with Google Meet link for dynamic application', () => {
    const dynamicId = 'app-1793281089454'
    const start = new Date(Date.now() + 86400000).toISOString()
    const end = new Date(Date.now() + 86400000 + 45 * 60000).toISOString()

    const interview = mockHiringStore.scheduleInterview(ACME_ORG_ID, {
      application_id: dynamicId,
      round_number: 1,
      round_type: 'TECHNICAL',
      title: 'Technical Round - Rahul Varma',
      scheduled_start: start,
      scheduled_end: end,
      timezone: 'Asia/Kolkata',
      platform: 'GOOGLE_MEET',
    })

    assert.ok(interview, 'Interview created')
    assert.equal(interview.application_id, dynamicId)
    assert.ok(interview.meeting_link.includes('meet.google.com'), 'Meeting link is a valid Google Meet link')
    assert.equal(interview.status, 'SCHEDULED')
  })

  await t.test('4. Sourced candidates Rahul Varma, Sunita Rao, Sneha Patel are pre-seeded and accessible', () => {
    const rahul = mockHiringStore.candidates.find(c => c.full_name === 'Rahul Varma')
    assert.ok(rahul, 'Rahul Varma exists in candidates')
    assert.equal(rahul.email, 'rahul.varma@talent-mock.com')

    const sunita = mockHiringStore.candidates.find(c => c.full_name === 'Sunita Rao')
    assert.ok(sunita, 'Sunita Rao exists in candidates')

    const sneha = mockHiringStore.candidates.find(c => c.full_name === 'Sneha Patel')
    assert.ok(sneha, 'Sneha Patel exists in candidates')

    const rahulApp = mockHiringStore.applications.find(a => a.id === 'app-2026-238' || a.application_code === 'APP-2026-238')
    assert.ok(rahulApp, 'Rahul Varma application exists')
  })
})
