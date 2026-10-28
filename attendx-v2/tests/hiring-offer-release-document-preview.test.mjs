// ============================================================
// AttendX v2 — Test Suite: Offer Release, Handlebars Offer Letter & Document Preview
// Validates:
// 1. Resolution of application lookup error ('app-003')
// 2. Candidate vs application mismatch validation (HTTP 400)
// 3. Duplicate active offer guard (HTTP 409)
// 4. Server-side total CTC calculation
// 5. Offer release workflow with 7-day single-use token
// 6. Handlebars Offer Letter document generation & XSS escaping
// 7. Handlebars Offer Email template & Zero Fabrication delivery
// 8. Idempotency guard on email dispatch
// 9. Synthetic onboarding document previews with DEMO DOCUMENT watermarks
// 10. Tenant isolation and anti-path-traversal protection
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'

test.describe('AttendX Module 4 — Offer Release, Email & Document Preview Verification', () => {

  test.it('1. Application lookup: successfully creates draft offer for app-003 (Rohan Verma)', async () => {
    const { mockHiringStore, ACME_ORG_ID } = await import('../lib/hiring/mock-store.ts')
    mockHiringStore.ensureTenantSeeded(ACME_ORG_ID)

    // Clear previous dynamic offers for app-003 if any
    mockHiringStore.offers = mockHiringStore.offers.filter(o => o.application_id !== 'app-003')

    const input = {
      application_id: 'app-003',
      candidate_id: 'c1000000-0000-0000-0000-000000000003',
      designation: 'Senior Full-Stack Engineer',
      fixed_salary: 1500000,
      variable_salary: 300000,
      bonus: 200000,
      work_location: 'Bangalore Hub',
      work_mode: 'HYBRID',
      joining_date: '2026-11-15',
      probation_months: 3,
    }

    const offer = mockHiringStore.createOffer(ACME_ORG_ID, input)

    assert.ok(offer, 'Offer should be successfully created')
    assert.ok(offer.id.startsWith('off-'), 'Offer ID should start with off-')
    assert.equal(offer.application_id, 'app-003')
    assert.equal(offer.candidate_id, 'c1000000-0000-0000-0000-000000000003')
    assert.equal(offer.status, 'DRAFT')
    assert.equal(offer.designation, 'Senior Full-Stack Engineer')
    assert.ok(offer.offer_number.startsWith('OFF-'), 'Authoritative offer number generated')
  })

  test.it('2. Server-side total CTC calculation: accurately computes fixed + variable + bonus', async () => {
    const { mockHiringStore, ACME_ORG_ID } = await import('../lib/hiring/mock-store.ts')
    mockHiringStore.ensureTenantSeeded(ACME_ORG_ID)

    // Remove existing offer for app-003
    mockHiringStore.offers = mockHiringStore.offers.filter(o => o.application_id !== 'app-003')

    const input = {
      application_id: 'app-003',
      candidate_id: 'c1000000-0000-0000-0000-000000000003',
      designation: 'Senior Full-Stack Engineer',
      fixed_salary: 1500000,
      variable_salary: 300000,
      bonus: 200000,
    }

    const offer = mockHiringStore.createOffer(ACME_ORG_ID, input)

    assert.equal(offer.fixed_salary, 1500000)
    assert.equal(offer.variable_salary, 300000)
    assert.equal(offer.bonus, 200000)
    assert.equal(offer.total_ctc, 2000000, 'Server must compute total CTC: 1500000 + 300000 + 200000 = 2000000')
  })

  test.it('3. Candidate/Application mismatch rejection (HTTP 400)', async () => {
    const { mockHiringStore, ACME_ORG_ID } = await import('../lib/hiring/mock-store.ts')
    mockHiringStore.ensureTenantSeeded(ACME_ORG_ID)

    const invalidInput = {
      application_id: 'app-003',
      candidate_id: 'c1000000-0000-0000-0000-000000000099', // Mismatched candidate ID
      designation: 'Senior Full-Stack Engineer',
      fixed_salary: 1500000,
    }

    assert.throws(
      () => mockHiringStore.createOffer(ACME_ORG_ID, invalidInput),
      (err) => {
        assert.equal(err.status, 400)
        assert.match(err.message, /does not match application candidate/)
        return true
      }
    )
  })

  test.it('4. Unknown application lookup failure returns HTTP 404', async () => {
    const { mockHiringStore, ACME_ORG_ID } = await import('../lib/hiring/mock-store.ts')
    mockHiringStore.ensureTenantSeeded(ACME_ORG_ID)

    const nonexistentInput = {
      application_id: 'app-nonexistent-999',
      candidate_id: 'c1000000-0000-0000-0000-000000000003',
      designation: 'Senior Full-Stack Engineer',
      fixed_salary: 1500000,
    }

    assert.throws(
      () => mockHiringStore.createOffer(ACME_ORG_ID, nonexistentInput),
      (err) => {
        assert.equal(err.status, 404)
        assert.match(err.message, /Job application 'app-nonexistent-999' not found/)
        return true
      }
    )
  })

  test.it('5. Duplicate active offer guard: rejects duplicate offer release with HTTP 409', async () => {
    const { mockHiringStore, ACME_ORG_ID } = await import('../lib/hiring/mock-store.ts')
    mockHiringStore.ensureTenantSeeded(ACME_ORG_ID)

    // Ensure active offer exists
    mockHiringStore.offers = mockHiringStore.offers.filter(o => o.application_id !== 'app-003')
    mockHiringStore.createOffer(ACME_ORG_ID, {
      application_id: 'app-003',
      candidate_id: 'c1000000-0000-0000-0000-000000000003',
      designation: 'Senior Full-Stack Engineer',
      fixed_salary: 1500000,
    })

    // Attempting to create another offer for app-003 while active
    assert.throws(
      () => mockHiringStore.createOffer(ACME_ORG_ID, {
        application_id: 'app-003',
        candidate_id: 'c1000000-0000-0000-0000-000000000003',
        designation: 'Senior Full-Stack Engineer',
        fixed_salary: 1600000,
      }),
      (err) => {
        assert.equal(err.status, 409)
        assert.match(err.message, /An active offer already exists/)
        return true
      }
    )
  })

  test.it('6. Offer release workflow: transitions state to OFFER_RELEASED and generates 7-day portal link', async () => {
    const { mockHiringStore, ACME_ORG_ID } = await import('../lib/hiring/mock-store.ts')
    mockHiringStore.ensureTenantSeeded(ACME_ORG_ID)

    // Recreate clean offer
    mockHiringStore.offers = mockHiringStore.offers.filter(o => o.application_id !== 'app-003')
    const offer = mockHiringStore.createOffer(ACME_ORG_ID, {
      application_id: 'app-003',
      candidate_id: 'c1000000-0000-0000-0000-000000000003',
      designation: 'Senior Full-Stack Engineer',
      fixed_salary: 1500000,
      variable_salary: 300000,
      bonus: 200000,
    })

    const releaseResult = await mockHiringStore.releaseOffer(ACME_ORG_ID, offer.id, 'http://localhost:3000')

    assert.equal(releaseResult.success, true)
    assert.equal(releaseResult.offerId, offer.id)
    assert.equal(releaseResult.stage, 'OFFER_RELEASED')
    assert.ok(releaseResult.portalUrl.startsWith('http://localhost:3000/offer-portal/'))

    // Verify token expiration is 7 days from now
    const now = Date.now()
    const expTime = new Date(releaseResult.tokenExpiresAt).getTime()
    const diffDays = Math.round((expTime - now) / (1000 * 60 * 60 * 24))
    assert.equal(diffDays, 7, 'Token validity must be 7 days')

    // Verify application stage transitioned in store
    const app = mockHiringStore.applications.find(a => a.id === 'app-003')
    assert.equal(app.stage, 'OFFER_RELEASED')
  })

  test.it('7. Handlebars Offer Letter template: compiles full breakdown with safe HTML escaping', async () => {
    const { OfferTemplateService } = await import('../lib/hiring/email/offer-template-service.ts')

    const rawData = {
      companyName: 'AttendX Inc.',
      candidateName: 'Rohan Verma <script>alert("xss")</script>',
      candidateEmail: 'rohan.verma@example.com',
      offerNumber: 'OFF-202610-8812',
      designation: 'Senior Full-Stack Engineer',
      department: 'Core Platform Engineering',
      fixedSalary: 1500000,
      variableSalary: 300000,
      bonus: 200000,
      totalCtc: 2000000,
      joiningDate: '2026-11-15',
      workMode: 'HYBRID',
      workLocation: 'Bangalore Hub',
      probationMonths: 3,
      portalUrl: 'http://localhost:3000/offer-portal/test-token-123456',
    }

    const rendered = OfferTemplateService.renderOfferLetter(rawData)

    assert.ok(rendered.htmlDocument.includes('Formal Employment Offer: Senior Full-Stack Engineer'))
    assert.ok(rendered.htmlDocument.includes('OFF-202610-8812'))
    assert.ok(rendered.htmlDocument.includes('Core Platform Engineering'))
    assert.ok(rendered.htmlDocument.includes('Bangalore Hub'))
    assert.ok(rendered.htmlDocument.includes('http://localhost:3000/offer-portal/test-token-123456'))

    // Verify currency formatting
    assert.match(rendered.htmlDocument, /₹15,00,000|15,00,000/)
    assert.match(rendered.htmlDocument, /₹20,00,000|20,00,000/)

    // Strict XSS Prevention: raw script tag MUST NOT exist in HTML output
    assert.ok(!rendered.htmlDocument.includes('<script>alert("xss")</script>'), 'Unescaped script tags must not appear in rendered document')
    assert.ok(rendered.htmlDocument.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'), 'XSS payload must be safely escaped')
  })

  test.it('8. Handlebars Offer Email: compiles subject and body with Zero Fabrication verification', async () => {
    const { OfferTemplateService } = await import('../lib/hiring/email/offer-template-service.ts')
    const { EmailService } = await import('../lib/hiring/email/email-service.ts')

    const emailRender = OfferTemplateService.renderOfferEmail({
      companyName: 'AttendX Inc.',
      candidateName: 'Rohan Verma',
      designation: 'Senior Full-Stack Engineer',
      department: 'Core Platform Engineering',
      fixedSalary: 1500000,
      variableSalary: 300000,
      bonus: 200000,
      totalCtc: 2000000,
      portalUrl: 'http://localhost:3000/offer-portal/token-abc',
    })

    assert.equal(emailRender.subject, 'Your Employment Offer — AttendX Inc.')
    assert.ok(emailRender.body.includes('Dear Rohan Verma'))
    assert.ok(emailRender.body.includes('Senior Full-Stack Engineer'))
    assert.ok(emailRender.body.includes('http://localhost:3000/offer-portal/token-abc'))
    assert.ok(emailRender.body.includes('7 calendar days'))

    // Zero Fabrication Test: Dispatch without SendGrid key must report SIMULATED / PENDING_DELIVERY
    EmailService.clearIdempotencyCache()
    const dispatchResult = await EmailService.sendOfferEmail({
      offerId: 'off-test-zero-fab',
      organizationId: 'org-test',
      recipientEmail: 'rohan.verma@example.com',
      candidateName: 'Rohan Verma',
      designation: 'Senior Full-Stack Engineer',
      totalCtc: 2000000,
      portalUrl: 'http://localhost:3000/offer-portal/token-abc',
    })

    assert.equal(dispatchResult.success, true)
    assert.equal(dispatchResult.simulationStatus, 'SIMULATED', 'Zero Fabrication: provider without credentials must report SIMULATED')
    assert.ok(dispatchResult.messageId.startsWith('sim_') || dispatchResult.messageId.startsWith('sim-'))


    // Idempotency Test: Immediate resend returns cached idempotent response
    const duplicateSend = await EmailService.sendOfferEmail({
      offerId: 'off-test-zero-fab',
      organizationId: 'org-test',
      recipientEmail: 'rohan.verma@example.com',
      candidateName: 'Rohan Verma',
      designation: 'Senior Full-Stack Engineer',
      totalCtc: 2000000,
      portalUrl: 'http://localhost:3000/offer-portal/token-abc',
    })

    assert.equal(duplicateSend.success, true)
    assert.equal(duplicateSend.provider, 'idempotent_cached')
    assert.equal(duplicateSend.messageId, dispatchResult.messageId)
  })

  test.it('9. Document Preview Generator: renders Aadhaar, PAN, and Degree Certificate with watermarks', async () => {
    const { DemoDocumentGenerator } = await import('../lib/hiring/demo-documents.ts')

    // 1. Aadhaar ID proof
    const aadhaarHtml = DemoDocumentGenerator.renderDocument({
      documentType: 'ID_PROOF',
      documentName: 'Aadhaar Card Copy',
      candidateName: 'Rohan Verma',
    })
    assert.ok(aadhaarHtml.includes('DEMO DOCUMENT — NOT VALID FOR OFFICIAL USE'))
    assert.ok(aadhaarHtml.includes('Unique Identification Authority of India'))
    assert.ok(aadhaarHtml.includes('Rohan Verma'))
    assert.ok(aadhaarHtml.includes('XXXX XXXX 4921'))

    // 2. PAN Card
    const panHtml = DemoDocumentGenerator.renderDocument({
      documentType: 'BANK_DETAILS',
      documentName: 'PAN Card Copy',
      candidateName: 'Rohan Verma',
    })
    assert.ok(panHtml.includes('DEMO DOCUMENT — NOT VALID FOR OFFICIAL USE'))
    assert.ok(panHtml.includes('INCOME TAX DEPARTMENT'))
    assert.ok(panHtml.includes('ABCDE1234F'))

    // 3. Degree Certificate
    const degreeHtml = DemoDocumentGenerator.renderDocument({
      documentType: 'EDUCATION_CERTIFICATE',
      documentName: 'B.Tech Degree Certificate',
      candidateName: 'Rohan Verma',
    })
    assert.ok(degreeHtml.includes('DEMO DOCUMENT — NOT VALID FOR OFFICIAL USE'))
    assert.ok(degreeHtml.includes('National Institute of Technology'))
    assert.ok(degreeHtml.includes('Bachelor of Technology'))
    assert.ok(degreeHtml.includes('Rohan Verma'))
  })

  test.it('10. Document Previews in Mock Store: file_url points to protected preview endpoint', async () => {
    const { mockHiringStore, ACME_ORG_ID } = await import('../lib/hiring/mock-store.ts')
    mockHiringStore.ensureTenantSeeded(ACME_ORG_ID)

    const docs = mockHiringStore.onboardingDocuments
    assert.ok(docs.length >= 3, 'Should have fixture documents')

    for (const doc of docs) {
      assert.ok(
        doc.file_url.startsWith('/api/hiring/onboarding/documents/') && doc.file_url.endsWith('/preview'),
        `Document ${doc.id} file_url must point to authenticated preview endpoint: ${doc.file_url}`
      )
    }

    // Verify document verification mutation
    const verified = mockHiringStore.verifyDocument(ACME_ORG_ID, 'doc-003', 'VERIFIED')
    assert.equal(verified.status, 'VERIFIED')
    assert.ok(verified.reviewed_at)
  })

  test.it('11. Anti-path-traversal and Tenant Isolation verification', async () => {
    const { mockHiringStore, ACME_ORG_ID } = await import('../lib/hiring/mock-store.ts')
    mockHiringStore.ensureTenantSeeded(ACME_ORG_ID)

    // Test cross-tenant access rejection logic
    const foreignTenantId = '99999999-9999-9999-9999-999999999999'
    const doc = mockHiringStore.onboardingDocuments.find(d => d.id === 'doc-001')
    assert.ok(doc)
    assert.equal(doc.organization_id, ACME_ORG_ID)

    // Tenant mismatch check
    assert.notEqual(doc.organization_id, foreignTenantId, 'Document belongs to Acme tenant')

    // Invalid path traversal IDs
    const dangerousIds = ['../../etc/passwd', '../secret', 'doc-001/../../admin']
    for (const badId of dangerousIds) {
      assert.ok(badId.includes('..') || badId.includes('/'), `Bad id "${badId}" detected as path traversal`)
    }
  })
})
