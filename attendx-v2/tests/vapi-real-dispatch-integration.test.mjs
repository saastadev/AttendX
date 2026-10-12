// ============================================================
// AttendX v2 — Vapi Real Outbound Call Dispatch Integration Tests
// Verifies:
// 1. Correct construction of outbound HTTP request to Vapi API
// 2. Strict live/mock separation & credential validation
// 3. Provider error handling (401, 400, timeout)
// 4. Webhook verification & idempotent lifecycle updates
// 5. Zero fabrication (real calls marked isSimulated: false)
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { VapiVoiceProvider, VoiceProviderFactory } from '../lib/hiring/voice-provider.ts'
import { VoiceAIService } from '../lib/hiring/voice-service.ts'

const TEST_ORG_ID = '11111111-0000-0000-0000-000000000001'
const OTHER_ORG_ID = '22222222-0000-0000-0000-000000000002'

test('VAPI REAL OUTBOUND CALL DISPATCH INTEGRATION SUITE', async (t) => {
  // ------------------------------------------------------------
  // 1. Successful Outbound HTTP Dispatch Construction
  // ------------------------------------------------------------
  await t.test('1. Outbound dispatch constructs correct Vapi API request with job context', async () => {
    let capturedUrl = ''
    let capturedOptions = null

    const mockFetch = async (url, opts) => {
      capturedUrl = String(url)
      capturedOptions = opts
      return {
        ok: true,
        status: 201,
        statusText: 'Created',
        json: async () => ({
          id: 'vapi_call_real_12345',
          status: 'queued',
          type: 'outboundPhoneCall',
          phoneNumberId: 'vapi_phone_num_abc',
          customer: { number: '+917904336925', name: 'Nanthitha Venkatachalapathy' },
        }),
      }
    }

    const provider = new VapiVoiceProvider({
      apiKey: 'vapi_live_test_api_key_777',
      phoneNumberId: 'vapi_phone_num_abc',
      webhookSecret: 'vapi_secret_sig_xyz',
      serverUrl: 'https://test.attendx.ai/api/hiring/voice/webhook',
      fetchImpl: mockFetch,
    })

    const callResult = await provider.initiateCall({
      candidateId: 'c1000000-0000-0000-0000-000000000001',
      candidateName: 'Nanthitha Venkatachalapathy',
      candidatePhone: '+91 79043 36925',
      organizationId: TEST_ORG_ID,
      requisitionId: 'r1000000-0000-0000-0000-000000000001',
      requisitionTitle: 'Senior Full-Stack Engineer',
      requisitionSkills: ['Python', 'FastAPI', 'React', 'Docker'],
      callPurpose: 'SCREENING',
    })

    // Assert URL & HTTP Method
    assert.equal(capturedUrl, 'https://api.vapi.ai/call/phone', 'Dispatches to official Vapi call/phone endpoint')
    assert.equal(capturedOptions.method, 'POST', 'HTTP Method is POST')

    // Assert Headers
    assert.equal(capturedOptions.headers['Authorization'], 'Bearer vapi_live_test_api_key_777')
    assert.equal(capturedOptions.headers['Content-Type'], 'application/json')

    // Assert Payload Structure
    const body = JSON.parse(capturedOptions.body)
    assert.equal(body.phoneNumberId, 'vapi_phone_num_abc', 'Payload includes configured Vapi phone number ID')
    assert.equal(body.customer.number, '+917904336925', 'Phone cleaned to E.164 format')
    assert.equal(body.customer.name, 'Nanthitha Venkatachalapathy')
    assert.equal(body.assistant.serverUrl, 'https://test.attendx.ai/api/hiring/voice/webhook', 'Includes webhook URL')
    assert.match(body.assistant.firstMessage, /Senior Full-Stack Engineer/i, 'Greeting includes role title')
    assert.match(body.assistant.model.messages[0].content, /Python, FastAPI, React, Docker/i, 'System prompt includes required skills')

    // Assert Returned Result
    assert.equal(callResult.provider, 'VAPI')
    assert.equal(callResult.callId, 'vapi_call_real_12345')
    assert.equal(callResult.providerCallId, 'vapi_call_real_12345')
    assert.equal(callResult.status, 'INITIATED')
    assert.equal(callResult.isSimulated, false, 'Real Vapi call is NOT marked as simulated')
  })

  // ------------------------------------------------------------
  // 2. Pre-configured Assistant ID & Overrides Dispatch
  // ------------------------------------------------------------
  await t.test('2. Outbound dispatch with VAPI_ASSISTANT_ID uses assistantOverrides', async () => {
    let capturedBody = null

    const mockFetch = async (_url, opts) => {
      capturedBody = JSON.parse(opts.body)
      return {
        ok: true,
        status: 201,
        json: async () => ({ id: 'vapi_call_asst_99', status: 'queued' }),
      }
    }

    const provider = new VapiVoiceProvider({
      apiKey: 'vapi_key_test',
      phoneNumberId: 'phone_test_1',
      assistantId: 'asst_preset_123',
      serverUrl: 'https://test.attendx.ai/api/hiring/voice/webhook',
      fetchImpl: mockFetch,
    })

    await provider.initiateCall({
      candidateId: 'c1',
      candidateName: 'Aarav Sharma',
      candidatePhone: '+919876543210',
      organizationId: TEST_ORG_ID,
      requisitionTitle: 'Lead Architect',
    })

    assert.equal(capturedBody.assistantId, 'asst_preset_123', 'Uses assistantId when configured')
    assert.ok(capturedBody.assistantOverrides, 'Includes assistantOverrides')
    assert.equal(capturedBody.assistantOverrides.variableValues.candidateName, 'Aarav Sharma')
    assert.equal(capturedBody.assistantOverrides.serverUrl, 'https://test.attendx.ai/api/hiring/voice/webhook')
  })

  // ------------------------------------------------------------
  // 3. Configuration & Phone Validation Errors
  // ------------------------------------------------------------
  await t.test('3. Missing credentials or invalid phone produces explicit errors', async () => {
    // Missing API Key
    const noKeyProvider = new VapiVoiceProvider({ apiKey: '', phoneNumberId: 'phone_1' })
    await assert.rejects(
      () => noKeyProvider.initiateCall({ candidateId: 'c1', candidateName: 'Test', candidatePhone: '+919876543210', organizationId: TEST_ORG_ID }),
      (err) => {
        assert.equal(err.status, 500)
        assert.match(err.message, /VAPI_API_KEY environment variable is not configured/i)
        return true
      }
    )

    // Missing Phone Number ID
    const noPhoneIdProvider = new VapiVoiceProvider({ apiKey: 'key_1', phoneNumberId: '' })
    await assert.rejects(
      () => noPhoneIdProvider.initiateCall({ candidateId: 'c1', candidateName: 'Test', candidatePhone: '+919876543210', organizationId: TEST_ORG_ID }),
      (err) => {
        assert.equal(err.status, 500)
        assert.match(err.message, /VAPI_PHONE_NUMBER_ID environment variable is not configured/i)
        return true
      }
    )

    // Missing Candidate Phone
    const provider = new VapiVoiceProvider({ apiKey: 'key_1', phoneNumberId: 'phone_1' })
    await assert.rejects(
      () => provider.initiateCall({ candidateId: 'c1', candidateName: 'Test', candidatePhone: '', organizationId: TEST_ORG_ID }),
      (err) => {
        assert.equal(err.status, 400)
        assert.match(err.message, /Candidate phone number is required/i)
        return true
      }
    )

    // Invalid Candidate Phone Format (not E.164)
    await assert.rejects(
      () => provider.initiateCall({ candidateId: 'c1', candidateName: 'Test', candidatePhone: '12345', organizationId: TEST_ORG_ID }),
      (err) => {
        assert.equal(err.status, 400)
        assert.match(err.message, /Must be valid E\.164 format/i)
        return true
      }
    )
  })

  // ------------------------------------------------------------
  // 4. Provider HTTP Error Responses (401, 400, Timeout)
  // ------------------------------------------------------------
  await t.test('4. Provider HTTP errors and timeouts throw explicit error with upstream status', async () => {
    // 401 Unauthorized
    const authFailFetch = async () => ({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ message: 'Invalid API Key provided.' }),
    })
    const authProvider = new VapiVoiceProvider({ apiKey: 'bad_key', phoneNumberId: 'phone_1', fetchImpl: authFailFetch })
    await assert.rejects(
      () => authProvider.initiateCall({ candidateId: 'c1', candidateName: 'Test', candidatePhone: '+919876543210', organizationId: TEST_ORG_ID }),
      (err) => {
        assert.equal(err.status, 401)
        assert.match(err.message, /Invalid API Key provided/i)
        return true
      }
    )

    // 400 Bad Request from Vapi (e.g., number not verified)
    const badReqFetch = async () => ({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ message: 'The phone number provided has not been verified.' }),
    })
    const badReqProvider = new VapiVoiceProvider({ apiKey: 'key_1', phoneNumberId: 'phone_1', fetchImpl: badReqFetch })
    await assert.rejects(
      () => badReqProvider.initiateCall({ candidateId: 'c1', candidateName: 'Test', candidatePhone: '+919876543210', organizationId: TEST_ORG_ID }),
      (err) => {
        assert.equal(err.status, 400)
        assert.match(err.message, /phone number provided has not been verified/i)
        return true
      }
    )

    // Timeout Error (15s abort)
    const timeoutFetch = async () => {
      const timeoutError = new Error('The operation was aborted')
      timeoutError.name = 'TimeoutError'
      throw timeoutError
    }
    const timeoutProvider = new VapiVoiceProvider({ apiKey: 'key_1', phoneNumberId: 'phone_1', fetchImpl: timeoutFetch })
    await assert.rejects(
      () => timeoutProvider.initiateCall({ candidateId: 'c1', candidateName: 'Test', candidatePhone: '+919876543210', organizationId: TEST_ORG_ID }),
      (err) => {
        assert.equal(err.status, 504)
        assert.match(err.message, /timed out after 15 seconds/i)
        return true
      }
    )
  })

  // ------------------------------------------------------------
  // 5. Vapi Webhook Signature Verification & Payload Parsing
  // ------------------------------------------------------------
  await t.test('5. Webhook verification and payload parsing (Zero Fabrication)', () => {
    const secret = 'vapi_webhook_secret_999'
    const provider = new VapiVoiceProvider({ apiKey: 'k', phoneNumberId: 'p', webhookSecret: secret })

    const rawPayload = JSON.stringify({
      message: {
        type: 'end-of-call-report',
        call: {
          id: 'vapi_call_real_12345',
          status: 'ended',
          endedReason: 'customer-ended-call',
          duration: 215,
        },
        transcript: 'AI Agent: Hello Nanthitha, what is your notice period?\nCandidate: I have a 30 days notice period and 2 years of experience.',
        recordingUrl: 'https://vapi.ai/recordings/vapi_call_real_12345.mp3',
        analysis: {
          summary: 'Candidate verified 30 days notice and 2 years relevant experience.',
          score: 88,
          sentiment: 'POSITIVE',
        },
      },
    })

    // Valid HMAC Signature
    const validHmac = crypto.createHmac('sha256', secret).update(rawPayload).digest('hex')
    assert.equal(provider.verifyWebhook(rawPayload, validHmac), true, 'Valid HMAC signature passes')

    // Invalid Signature
    assert.equal(provider.verifyWebhook(rawPayload, 'forged_signature_abc'), false, 'Forged signature rejected')

    // Shared Secret Header
    assert.equal(provider.verifyWebhook(rawPayload, secret), true, 'Direct secret header passes')

    // Parse Payload
    const event = provider.parseWebhookPayload(JSON.parse(rawPayload))
    assert.equal(event.providerCallId, 'vapi_call_real_12345')
    assert.equal(event.status, 'COMPLETED')
    assert.equal(event.durationSeconds, 215)
    assert.equal(event.recordingUrl, 'https://vapi.ai/recordings/vapi_call_real_12345.mp3')
    assert.equal(event.overallScore, 88)
    assert.equal(event.sentiment, 'POSITIVE')
    assert.equal(event.isSimulated, false, 'Real webhook event is not simulated')

    // Extracted facts from authentic transcript
    assert.equal(event.extractedData.noticePeriodDays, 30)
    assert.equal(event.extractedData.relevantExperienceYears, 2)
  })

  // ------------------------------------------------------------
  // 6. Webhook Unsuccessful Call Outcomes (BUSY, NO_ANSWER, FAILED)
  // ------------------------------------------------------------
  await t.test('6. Webhook parses busy, no-answer, and failed outcomes accurately', () => {
    const provider = new VapiVoiceProvider({ apiKey: 'k', phoneNumberId: 'p' })

    // Busy
    const busyEvent = provider.parseWebhookPayload({
      message: {
        call: { id: 'call_b', status: 'busy', endedReason: 'customer-busy' },
      },
    })
    assert.equal(busyEvent.status, 'BUSY')

    // No Answer
    const noAnswerEvent = provider.parseWebhookPayload({
      message: {
        call: { id: 'call_na', status: 'ended', endedReason: 'customer-did-not-answer' },
      },
    })
    assert.equal(noAnswerEvent.status, 'NO_ANSWER')

    // Failed
    const failedEvent = provider.parseWebhookPayload({
      message: {
        call: { id: 'call_f', status: 'failed', endedReason: 'provider-error' },
      },
    })
    assert.equal(failedEvent.status, 'FAILED')
  })

  // ------------------------------------------------------------
  // 7. Full Service Lifecycle & Persistence Simulation
  // ------------------------------------------------------------
  await t.test('7. VoiceAIService persists real Vapi call and updates on webhook', async () => {
    // In-memory test store simulating Supabase client
    const callStore = []
    const auditStore = []

    const testDb = {
      from: (table) => {
        if (table === 'candidates') {
          return {
            select: () => ({
              eq: (col1, val1) => ({
                eq: (col2, val2) => {
                  const resultFn = async () => ({
                    data: {
                      id: val1,
                      organization_id: val2,
                      first_name: 'Nanthitha',
                      last_name: 'Venkatachalapathy',
                      phone: '+91 79043 36925',
                      consent_status: 'GIVEN',
                      total_experience_years: 2,
                    },
                    error: null,
                  })
                  return {
                    single: resultFn,
                    maybeSingle: resultFn,
                  }
                },
              }),
            }),
          }
        }
        if (table === 'ai_voice_calls') {
          return {
            select: () => ({
              eq: (col1, val1) => ({
                eq: (col2, val2) => ({
                  eq: () => ({
                    gte: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
                  }),
                  maybeSingle: async () => {
                    const row = callStore.find(c => c[col1] === val1 && c[col2] === val2)
                    return { data: row || null, error: null }
                  },
                }),
              }),
            }),
            insert: (record) => {
              const inserted = { id: `db_call_${Date.now()}`, ...record, candidate: {}, requisition: {} }
              callStore.push(inserted)
              return {
                select: () => Promise.resolve({ data: [inserted], error: null }),
              }
            },
            update: (updates) => ({
              eq: (col1, val1) => ({
                eq: (col2, val2) => ({
                  select: () => ({
                    single: async () => {
                      const idx = callStore.findIndex(c => c[col1] === val1 && c[col2] === val2)
                      if (idx !== -1) {
                        callStore[idx] = { ...callStore[idx], ...updates }
                        return { data: callStore[idx], error: null }
                      }
                      return { data: null, error: { message: 'Not found' } }
                    },
                  }),
                }),
              }),
            }),
          }
        }
        if (table === 'hiring_audit_logs') {
          return {
            insert: (log) => {
              auditStore.push(log)
              return {
                select: () => ({
                  single: async () => ({ data: { id: `log_${Date.now()}` }, error: null }),
                }),
              }
            },
          }
        }
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
        }
      },
    }

    // Set up Vapi provider with mock fetch
    const mockVapiFetch = async () => ({
      ok: true,
      status: 201,
      json: async () => ({ id: 'vapi_dispatch_888', status: 'queued' }),
    })
    const realVapiProvider = new VapiVoiceProvider({
      apiKey: 'test_k',
      phoneNumberId: 'test_p',
      fetchImpl: mockVapiFetch,
    })

    // Temporarily register in factory
    const originalGetProvider = VoiceProviderFactory.getProvider
    VoiceProviderFactory.getProvider = (p) => (p === 'VAPI' ? realVapiProvider : originalGetProvider(p))

    try {
      // 1. Initiate Real Vapi Call
      const call = await VoiceAIService.initiateCall(
        testDb,
        TEST_ORG_ID,
        'user-recruiter-1',
        {
          candidate_id: 'c1000000-0000-0000-0000-000000000001',
          provider: 'VAPI',
        }
      )

      assert.equal(call.call_provider, 'VAPI')
      assert.equal(call.provider_call_id, 'vapi_dispatch_888')
      assert.equal(call.status, 'INITIATED')
      assert.equal(call.extracted_data.is_simulated, false, 'Initial call is marked real (is_simulated: false)')

      // 2. Inbound Webhook Event Processing
      const webhookEvent = {
        providerCallId: 'vapi_dispatch_888',
        status: 'COMPLETED',
        durationSeconds: 240,
        recordingUrl: 'https://vapi.ai/rec/888.mp3',
        transcript: 'AI Agent: What is your preferred work mode?\nCandidate: I prefer a hybrid setup in Bengaluru.',
        aiSummary: 'Screening concluded with confirmed hybrid work preference.',
        overallScore: 86,
        sentiment: 'POSITIVE',
        extractedData: { workModePreference: 'HYBRID', location: 'Bengaluru' },
        isSimulated: false,
      }

      const webhookResult = await VoiceAIService.processProviderEvent(testDb, TEST_ORG_ID, webhookEvent)
      assert.equal(webhookResult.alreadyProcessed, false)
      assert.equal(webhookResult.call.status, 'COMPLETED')
      assert.equal(webhookResult.call.duration_seconds, 240)
      assert.equal(webhookResult.call.webhook_verified, true)

      // 3. Idempotent Retry Handling
      const retryResult = await VoiceAIService.processProviderEvent(testDb, TEST_ORG_ID, webhookEvent)
      assert.equal(retryResult.alreadyProcessed, true, 'Duplicate webhook returns alreadyProcessed: true')
    } finally {
      VoiceProviderFactory.getProvider = originalGetProvider
    }
  })
})
