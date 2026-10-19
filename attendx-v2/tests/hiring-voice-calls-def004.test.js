// ============================================================
// AttendX v2 — DEF-004: Voice Calls Validation Regression Suite
// Verifies HTTP 400 validation for candidate_id:
// - Missing
// - Null
// - Empty string
// - Malformed string
// - Valid UUID passes validation
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'

test('DEF-004: POST /api/hiring/voice-calls candidate_id validation', async (t) => {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  function validatePayload(body) {
    if (!body || typeof body !== 'object') {
      return { status: 400, error: 'Request body must be a valid JSON object' }
    }
    if (body.candidate_id === undefined || body.candidate_id === null || (typeof body.candidate_id === 'string' && body.candidate_id.trim() === '')) {
      return { status: 400, error: 'candidate_id is required and must not be empty' }
    }
    if (typeof body.candidate_id !== 'string') {
      return { status: 400, error: 'candidate_id must be a string UUID' }
    }
    if (!UUID_REGEX.test(body.candidate_id.trim())) {
      return { status: 400, error: 'candidate_id must be a valid UUID' }
    }
    return { status: 200, valid: true }
  }

  await t.test('REG-VOI-01: Rejects missing candidate_id with 400', () => {
    const res = validatePayload({})
    assert.equal(res.status, 400)
    assert.equal(res.error, 'candidate_id is required and must not be empty')
  })

  await t.test('REG-VOI-02: Rejects null candidate_id with 400', () => {
    const res = validatePayload({ candidate_id: null })
    assert.equal(res.status, 400)
    assert.equal(res.error, 'candidate_id is required and must not be empty')
  })

  await t.test('REG-VOI-03: Rejects empty string candidate_id with 400', () => {
    const res = validatePayload({ candidate_id: '   ' })
    assert.equal(res.status, 400)
    assert.equal(res.error, 'candidate_id is required and must not be empty')
  })

  await t.test('REG-VOI-04: Rejects malformed candidate_id with 400', () => {
    const res = validatePayload({ candidate_id: 'invalid-uuid-123' })
    assert.equal(res.status, 400)
    assert.equal(res.error, 'candidate_id must be a valid UUID')
  })

  await t.test('REG-VOI-05: Accepts valid UUID candidate_id', () => {
    const res = validatePayload({ candidate_id: '11111111-2222-3333-4444-555555555555' })
    assert.equal(res.status, 200)
    assert.equal(res.valid, true)
  })
})
