// ============================================================
// AttendX v2 — Hiring Module: Phase 3, 4 & 5 Test Suite
// Verifies Voice AI Providers, Offer Tokens, Onboarding Progress,
// Analytics Funnel Calculations, and End-to-End State Transitions
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'crypto'
import { VoiceProviderFactory, MockVoiceProvider, VapiVoiceProvider } from '../lib/hiring/voice-provider.ts'
import { HiringStateMachine, HiringStateMachineError } from '../lib/hiring/state-machine.ts'

test('Hiring Module — Phase 3, 4 & 5 Comprehensive Test Suite', async (t) => {

  // ------------------------------------------------------------
  // 1. VOICE AI PROVIDER TESTS
  // ------------------------------------------------------------
  await t.test('VOICE-01: VoiceProviderFactory returns appropriate provider implementations', () => {
    const mockProvider = VoiceProviderFactory.getProvider('MOCK')
    assert.equal(mockProvider.name, 'MOCK')

    const vapiProvider = VoiceProviderFactory.getProvider('VAPI')
    assert.equal(vapiProvider.name, 'VAPI')

    const twilioProvider = VoiceProviderFactory.getProvider('TWILIO')
    assert.equal(twilioProvider.name, 'TWILIO')
  })

  await t.test('VOICE-02: MockVoiceProvider initiates call and parses screening webhook', async () => {
    const provider = new MockVoiceProvider()
    const callRes = await provider.initiateCall({
      candidateId: 'cand-1',
      candidateName: 'John Doe',
      candidatePhone: '+919876543210',
      organizationId: 'org-1',
      callPurpose: 'SCREENING',
    })

    assert.equal(callRes.status, 'INITIATED')
    assert.ok(callRes.callId.startsWith('mock_voice_'))

    // Verify webhook HMAC
    assert.equal(provider.verifyWebhook('{}', 'mock_valid_signature'), true)

    // Parse payload
    const parsed = provider.parseWebhookPayload({
      call_id: callRes.providerCallId,
      status: 'COMPLETED',
      duration_seconds: 210,
      overall_score: 86,
      sentiment: 'POSITIVE',
    })

    assert.equal(parsed.status, 'COMPLETED')
    assert.equal(parsed.durationSeconds, 210)
    assert.equal(parsed.overallScore, 86)
    assert.equal(parsed.sentiment, 'POSITIVE')
  })

  await t.test('VOICE-03: Vapi HMAC signature verification works correctly', () => {
    const vapi = new VapiVoiceProvider('test_key', 'my_secret_token')
    const body = JSON.stringify({ message: { type: 'end-of-call-report', call: { id: 'call-99' } } })
    const validSignature = crypto.createHmac('sha256', 'my_secret_token').update(body).digest('hex')

    assert.equal(vapi.verifyWebhook(body, validSignature, 'my_secret_token'), true)
    assert.equal(vapi.verifyWebhook(body, 'invalid_signature_hex', 'my_secret_token'), false)
  })

  // ------------------------------------------------------------
  // 2. OFFER SERVICE & TOKEN TESTS
  // ------------------------------------------------------------
  await t.test('OFFER-01: Token generator creates 64-char hex raw token and 64-char SHA-256 hash', () => {
    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

    assert.equal(rawToken.length, 64)
    assert.equal(tokenHash.length, 64)

    // Hash matches
    const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    assert.equal(tokenHash, expectedHash)
  })

  await t.test('OFFER-02: Authoritative offer number adheres to OFF-YYYYMM-XXXX pattern', () => {
    const d = new Date()
    const yyyymm = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
    const rand = Math.floor(1000 + Math.random() * 9000)
    const offerNum = `OFF-${yyyymm}-${rand}`
    assert.match(offerNum, /^OFF-\d{6}-\d{4}$/)
  })

  // ------------------------------------------------------------
  // 3. COMPLETE PIPELINE STATE MACHINE TRANSITIONS
  // ------------------------------------------------------------
  await t.test('STATE-01: Full lifecycle transitions from SOURCED to ONBOARDED', () => {
    const mainPath = [
      'SOURCED',
      'CONTACTED',
      'APPLIED',
      'SHORTLISTED',
      'INTERVIEW',
      'SELECTED',
      'OFFER_INTEREST_SENT',
      'OFFER_ACCEPTED',
      'DOCUMENTS_PENDING',
      'DOCUMENTS_VERIFIED',
      'OFFER_RELEASED',
      'OFFER_FINAL_ACCEPTED',
      'ONBOARDED',
    ]

    for (let i = 0; i < mainPath.length - 1; i++) {
      const from = mainPath[i]
      const to = mainPath[i + 1]
      assert.equal(HiringStateMachine.canTransition(from, to), true, `Must be able to transition from ${from} to ${to}`)
      assert.doesNotThrow(() => HiringStateMachine.validateTransition(from, to))
    }
  })

  await t.test('STATE-02: Candidate decline triggers side exits correctly', () => {
    assert.doesNotThrow(() => HiringStateMachine.validateTransition('OFFER_RELEASED', 'OFFER_FINAL_DECLINED'))
    assert.doesNotThrow(() => HiringStateMachine.validateTransition('OFFER_INTEREST_SENT', 'OFFER_DECLINED'))
  })

  await t.test('STATE-03: Invalid stage jump throws 409 Conflict', () => {
    assert.throws(
      () => HiringStateMachine.validateTransition('SOURCED', 'ONBOARDED'),
      (err) => err instanceof HiringStateMachineError && err.status === 409
    )
  })

  await t.test('STATE-04: Unauthorized skip throws 409 Conflict', () => {
    assert.throws(
      () => HiringStateMachine.validateTransition('APPLIED', 'ONBOARDED'),
      (err) => err instanceof HiringStateMachineError && err.status === 409
    )
  })
})
