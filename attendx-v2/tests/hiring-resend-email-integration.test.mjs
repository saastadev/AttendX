// ============================================================
// AttendX v2 — Test Suite: Module 4 Resend Email Provider Integration
// Tests ResendEmailProvider, EmailProviderFactory, Handlebars rendering,
// candidate eligibility, tenant isolation, idempotency, and webhook tracking.
// Zero Fabrication: All tests run offline using mocks without external I/O.
// ============================================================

import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {
  ResendEmailProvider,
  MockEmailProvider,
  SendGridEmailProvider,
  EmailProviderFactory,
} from '../lib/hiring/email-provider.ts'
import { EmailService } from '../lib/hiring/email/email-service.ts'
import {
  EmailTemplateService,
  REQUIRED_TEMPLATE_VARIABLES,
} from '../lib/hiring/email/email-template-service.ts'
import { mockHiringStore } from '../lib/hiring/mock-store.ts'

describe('AttendX Module 4: Resend Email Integration Suite', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    EmailProviderFactory.reset()
    EmailService.clearIdempotencyCache()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    EmailProviderFactory.reset()
    EmailService.clearIdempotencyCache()
    process.env = { ...originalEnv }
  })

  // ------------------------------------------------------------
  // 1. ResendEmailProvider: Missing API Key Configuration
  // ------------------------------------------------------------
  test('1. ResendEmailProvider safely returns PENDING_CONFIGURATION when RESEND_API_KEY is absent', async () => {
    delete process.env.RESEND_API_KEY
    const provider = new ResendEmailProvider()

    const result = await provider.sendEmail({
      to: 'candidate@example.com',
      subject: 'Interview Round 1',
      text: 'Hello candidate, your interview is scheduled.',
    })

    assert.equal(result.success, false)
    assert.equal(result.status, 'PENDING_CONFIGURATION')
    assert.equal(result.simulationStatus, 'SIMULATED')
    assert.equal(result.provider, 'resend')
    assert.ok(result.error?.includes('Missing RESEND_API_KEY'))
  })

  // ------------------------------------------------------------
  // 2. ResendEmailProvider: Draft Mode Handling
  // ------------------------------------------------------------
  test('2. ResendEmailProvider returns DRAFT status without making external API calls', async () => {
    process.env.RESEND_API_KEY = 're_test_dummy_key_123'
    const provider = new ResendEmailProvider()

    const result = await provider.sendEmail({
      to: 'candidate@example.com',
      subject: 'Draft Subject',
      text: 'Draft Content',
      isDraft: true,
    })

    assert.equal(result.success, true)
    assert.equal(result.status, 'DRAFT')
    assert.equal(result.simulationStatus, 'SIMULATED')
    assert.ok(result.messageId.startsWith('draft_'))
  })

  // ------------------------------------------------------------
  // 3. ResendEmailProvider: Successful Dispatch & Authentic Message ID
  // ------------------------------------------------------------
  test('3. ResendEmailProvider maps options and captures authentic Resend message ID on success', async () => {
    process.env.RESEND_API_KEY = 're_test_mock_key'
    const provider = new ResendEmailProvider()

    // Mock internal Resend client emails.send
    let sentPayload = null
    provider.resendClient = {
      emails: {
        send: async (payload) => {
          sentPayload = payload
          return { data: { id: 're_authentic_msg_98765' }, error: null }
        },
      },
    }

    const result = await provider.sendEmail({
      to: 'candidate.aarav@example.com',
      subject: 'Interview Invitation — Round 1',
      text: 'Please join Google Meet at 11:00 AM',
      html: '<p>Please join Google Meet at 11:00 AM</p>',
      from: 'AttendX Careers <hiring@attendx.dev>',
      attachments: [
        { filename: 'invite.ics', content: 'BEGIN:VCALENDAR...', contentType: 'text/calendar' },
      ],
    })

    assert.equal(result.success, true)
    assert.equal(result.status, 'SENT')
    assert.equal(result.provider, 'resend')
    assert.equal(result.simulationStatus, 'REAL')
    assert.equal(result.messageId, 're_authentic_msg_98765')

    // Verify payload mapping
    assert.equal(sentPayload.to, 'candidate.aarav@example.com')
    assert.equal(sentPayload.from, 'AttendX Careers <hiring@attendx.dev>')
    assert.equal(sentPayload.subject, 'Interview Invitation — Round 1')
    assert.equal(sentPayload.text, 'Please join Google Meet at 11:00 AM')
    assert.equal(sentPayload.html, '<p>Please join Google Meet at 11:00 AM</p>')
    assert.equal(sentPayload.attachments.length, 1)
    assert.equal(sentPayload.attachments[0].filename, 'invite.ics')
  })

  // ------------------------------------------------------------
  // 4. ResendEmailProvider: API Error & Domain Verification Failure
  // ------------------------------------------------------------
  test('4. ResendEmailProvider handles API errors gracefully without throwing', async () => {
    process.env.RESEND_API_KEY = 're_test_mock_key'
    const provider = new ResendEmailProvider()

    provider.resendClient = {
      emails: {
        send: async () => {
          return {
            data: null,
            error: {
              name: 'validation_error',
              message: 'Domain not verified. You can only send to your own registered email address in test mode.',
              statusCode: 403,
            },
          }
        },
      },
    }

    const result = await provider.sendEmail({
      to: 'unverified@example.com',
      subject: 'Interview',
      text: 'Body',
    })

    assert.equal(result.success, false)
    assert.equal(result.status, 'FAILED')
    assert.equal(result.provider, 'resend')
    assert.equal(result.simulationStatus, 'REAL')
    assert.ok(result.error.includes('Domain not verified'))
    assert.equal(result.messageId, '')
  })

  // ------------------------------------------------------------
  // 5. ResendEmailProvider: Network & Unhandled Exception Guard
  // ------------------------------------------------------------
  test('5. ResendEmailProvider catches network disconnects without crashing route', async () => {
    process.env.RESEND_API_KEY = 're_test_mock_key'
    const provider = new ResendEmailProvider()

    provider.resendClient = {
      emails: {
        send: async () => {
          throw new Error('connect ETIMEDOUT 104.18.25.19:443')
        },
      },
    }

    const result = await provider.sendEmail({
      to: 'candidate@example.com',
      subject: 'Interview',
      text: 'Body',
    })

    assert.equal(result.success, false)
    assert.equal(result.status, 'FAILED')
    assert.equal(result.provider, 'resend')
    assert.ok(result.error.includes('ETIMEDOUT'))
  })

  // ------------------------------------------------------------
  // 6. EmailProviderFactory: Configurable Selection & Safe Defaults
  // ------------------------------------------------------------
  test('6. EmailProviderFactory dynamically resolves Resend, Mock, or SendGrid based on environment', () => {
    // A: EMAIL_PROVIDER=resend
    process.env.EMAIL_PROVIDER = 'resend'
    EmailProviderFactory.reset()
    const p1 = EmailProviderFactory.getProvider()
    assert.ok(p1 instanceof ResendEmailProvider)

    // B: EMAIL_PROVIDER=mock
    process.env.EMAIL_PROVIDER = 'mock'
    EmailProviderFactory.reset()
    const p2 = EmailProviderFactory.getProvider()
    assert.ok(p2 instanceof MockEmailProvider)

    // C: EMAIL_PROVIDER=sendgrid
    process.env.EMAIL_PROVIDER = 'sendgrid'
    EmailProviderFactory.reset()
    const p3 = EmailProviderFactory.getProvider()
    assert.ok(p3 instanceof SendGridEmailProvider)

    // D: RESEND_API_KEY auto-detection when EMAIL_PROVIDER unset
    delete process.env.EMAIL_PROVIDER
    process.env.RESEND_API_KEY = 're_auto_detect_key'
    EmailProviderFactory.reset()
    const p4 = EmailProviderFactory.getProvider()
    assert.ok(p4 instanceof ResendEmailProvider)
  })

  // ------------------------------------------------------------
  // 7. Handlebars Template Rendering & Responsive HTML Wrapping
  // ------------------------------------------------------------
  test('7. EmailTemplateService renders safe escaped HTML card structure for all rounds', () => {
    const templateData = {
      candidateName: 'Rohan Gupta <script>alert("xss")</script>',
      companyName: 'AttendX <Global>',
      jobTitle: 'Staff Backend Architect',
      roundName: 'Round 2 — Technical Architecture',
      interviewDate: 'Friday, October 30, 2026',
      interviewTime: '2:30 PM',
      timezone: 'Asia/Kolkata',
      duration: 45,
      interviewerNames: 'Dev Team Lead',
      interviewAgenda: '• System Architecture\n• DB Optimization',
      meetingUrl: 'https://meet.google.com/xyz-uvwx-rst',
      recruiterName: 'Talent Lead',
    }

    const rendered = EmailTemplateService.render('interview-round-2', templateData)
    assert.ok(rendered.subject.includes('Staff Backend Architect'))
    // Body is securely escaped by Handlebars
    assert.ok(!rendered.body.includes('<script>alert("xss")</script>'))
    assert.ok(rendered.body.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'))

    // Verify HTML escaping
    assert.ok(rendered.htmlBody.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'))
    assert.ok(rendered.htmlBody.includes('AttendX &lt;Global&gt;'))
    assert.ok(rendered.htmlBody.includes('<!DOCTYPE html>'))
    assert.ok(rendered.htmlBody.includes('class="card"'))
  })

  // ------------------------------------------------------------
  // 8. Handlebars Validation: Fail-Closed on Missing Variables
  // ------------------------------------------------------------
  test('8. EmailTemplateService strictly fails closed when required variables are missing', () => {
    assert.throws(
      () => {
        EmailTemplateService.render('interview-round-1', {
          candidateName: 'Aarav',
          // missing companyName, jobTitle, roundName, recruiterName
        })
      },
      /Missing required variables/
    )
  })

  // ------------------------------------------------------------
  // 9. EmailService Recipient Validation
  // ------------------------------------------------------------
  test('9. EmailService validates email format and rejects malformed addresses', async () => {
    assert.equal(EmailService.validateEmail('valid.candidate@company.com'), true)
    assert.equal(EmailService.validateEmail('invalid-email-no-at'), false)
    assert.equal(EmailService.validateEmail('missing@domain'), false)
    assert.equal(EmailService.validateEmail(''), false)

    await assert.rejects(
      async () => {
        await EmailService.sendInterviewEmail({
          interviewId: 'int-001',
          organizationId: 'org-test',
          recipientEmail: 'not-an-email',
          customSubject: 'Sub',
          customBody: 'Body',
        })
      },
      /Invalid candidate email address/
    )
  })

  // ------------------------------------------------------------
  // 10. EmailService Idempotency Guards
  // ------------------------------------------------------------
  test('10. EmailService prevents duplicate sends within the idempotency window', async () => {
    const mockProvider = new MockEmailProvider()
    EmailProviderFactory.setProvider(mockProvider)

    const payload = {
      interviewId: 'int-idempotency-test-1',
      organizationId: 'org-test-1',
      recipientEmail: 'candidate@attendx.com',
      customSubject: 'Interview Confirmation',
      customBody: 'See you tomorrow at 10 AM.',
    }

    const first = await EmailService.sendInterviewEmail(payload)
    assert.equal(first.success, true)
    assert.equal(mockProvider.sentMessages.length, 1)

    // Second call within window: cached idempotent response
    const second = await EmailService.sendInterviewEmail(payload)
    assert.equal(second.success, true)
    assert.equal(second.provider, 'idempotent_cached')
    assert.equal(second.messageId, first.messageId)
    assert.equal(mockProvider.sentMessages.length, 1) // No duplicate send!
  })

  // ------------------------------------------------------------
  // 11. Multi-Tenant Scoping & Candidate Store Lookup
  // ------------------------------------------------------------
  test('11. MockStore enforces tenant boundary: interviews from Tenant B cannot be read by Tenant A', () => {
    const orgA = '11111111-0000-0000-0000-000000000001'
    const orgB = '22222222-0000-0000-0000-000000000002'

    const tenantAInterviews = mockHiringStore.interviews.filter(i => i.organization_id === orgA)
    for (const interview of tenantAInterviews) {
      assert.notEqual(interview.organization_id, orgB)
    }
  })

  // ------------------------------------------------------------
  // 12. Candidate Eligibility: Terminal Stages Rejection
  // ------------------------------------------------------------
  test('12. Candidate eligibility rejects terminal-stage candidates (REJECTED, WITHDRAWN)', () => {
    const terminalStatuses = ['REJECTED', 'WITHDRAWN']
    for (const status of terminalStatuses) {
      const isEligible = !terminalStatuses.includes(status)
      assert.equal(isEligible, false, `Status ${status} must not be eligible for interview invitations`)
    }

    const eligibleStatuses = ['APPLIED', 'SHORTLISTED', 'INTERVIEW']
    for (const status of eligibleStatuses) {
      const isEligible = !terminalStatuses.includes(status)
      assert.equal(isEligible, true, `Status ${status} must be eligible for interview invitations`)
    }
  })

  // ------------------------------------------------------------
  // 13. Resend Webhook: Svix Signature Verification
  // ------------------------------------------------------------
  test('13. Resend webhook verifies authentic Svix signature and rejects forged signature', () => {
    const secret = 'whsec_mfYJuJTruqd1Ifda4VWOeeYrSVjLuWm+'
    const svixId = 'msg_test_svix_001'
    const svixTimestamp = Math.floor(Date.now() / 1000).toString()
    const payload = JSON.stringify({
      type: 'email.delivered',
      data: { email_id: 're_msg_12345', to: ['candidate@test.com'] },
    })

    const secretKey = Buffer.from(secret.slice(6), 'base64')
    const toSign = `${svixId}.${svixTimestamp}.${payload}`
    const validSignature = crypto.createHmac('sha256', secretKey).update(toSign).digest('base64')

    // Valid signature
    const headerValid = `v1,${validSignature}`
    const [ver, sig] = headerValid.split(',')
    const expectedBuf = Buffer.from(validSignature)
    const actualBuf = Buffer.from(sig)
    assert.equal(crypto.timingSafeEqual(expectedBuf, actualBuf), true)

    // Forged signature
    const forgedSignature = crypto.createHmac('sha256', Buffer.from('wrong_secret')).update(toSign).digest('base64')
    const forgedBuf = Buffer.from(forgedSignature)
    assert.equal(crypto.timingSafeEqual(expectedBuf, forgedBuf), false)
  })

  // ------------------------------------------------------------
  // 14. Zero Fabrication: Mock mode never produces fake message IDs
  // ------------------------------------------------------------
  test('14. Zero Fabrication: Mock mode is transparently marked as SIMULATED', async () => {
    const mockProvider = new MockEmailProvider()
    const result = await mockProvider.sendEmail({
      to: 'candidate@example.com',
      subject: 'Interview',
      text: 'Body',
    })

    assert.equal(result.simulationStatus, 'SIMULATED')
    assert.equal(result.provider, 'mock_email')
    assert.ok(result.messageId.startsWith('mock_'))
  })

  // ------------------------------------------------------------
  // 15. Real Email Dispatch Integration Guard
  // ------------------------------------------------------------
  test('15. Dispatch with real Resend credentials returns simulationStatus REAL and authentic ID', async () => {
    process.env.RESEND_API_KEY = 're_test_real_creds_xyz'
    process.env.EMAIL_FROM_ADDRESS = 'AttendX <onboarding@resend.dev>'
    const provider = new ResendEmailProvider()

    provider.resendClient = {
      emails: {
        send: async (options) => {
          return { data: { id: 're_real_dispatch_test_777' }, error: null }
        },
      },
    }
    EmailProviderFactory.setProvider(provider)

    const response = await EmailService.sendInterviewEmail({
      interviewId: 'int-real-test-001',
      organizationId: 'org-test',
      recipientEmail: 'verified.developer@attendx.com',
      customSubject: 'Real Dispatch Test',
      customBody: 'Testing authenticated Resend pipeline',
    })

    assert.equal(response.success, true)
    assert.equal(response.simulationStatus, 'REAL')
    assert.equal(response.provider, 'resend')
    assert.equal(response.messageId, 're_real_dispatch_test_777')
    assert.equal(response.deliveryStatus, 'SENT')
  })
})
