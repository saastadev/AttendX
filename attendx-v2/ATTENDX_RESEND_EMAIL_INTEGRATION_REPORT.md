# AttendX Module 4 — Resend Email Integration for Shortlisted Candidates
## Formal Verification & Implementation Report

**Date:** October 29, 2026  
**Repository:** `saastadev/AttendX` (`attendx-v2`)  
**Git Branch:** `main` (synchronized with commit `c0f8a8a` by Varshith Reddy)  
**Verification Status:** **100% PASSED** (273 unit tests, 15 Resend-specific tests, TypeScript, Secret Scan, CI Guardrails, and Next.js Turbopack production build)  
**Engineering Principles:** **Zero Fabrication | Server-Side Identity | Fail-Closed Security**

---

## 1. Verified Original Architecture

Prior to this integration, the AttendX Hiring system utilized a pluggable provider interface defined in `lib/hiring/email-provider.ts` and orchestrated via `EmailService` and `EmailTemplateService`:

1. **Email Provider Abstraction (`lib/hiring/email-provider.ts`):**
   - Defined `EmailProvider` interface with method `sendEmail(options: SendEmailOptions): Promise<SendEmailResult>`.
   - Contained `MockEmailProvider` returning `status: 'SIMULATED'` and `provider: 'mock_email'` for offline unit tests.
   - Contained a placeholder `SendGridEmailProvider` returning `status: 'PENDING_DELIVERY'` when credentials were not provided.
   - Centralized provider instantiation via `EmailProviderFactory.getProvider()`.

2. **Server-Side Email Orchestration (`lib/hiring/email/email-service.ts`):**
   - Validated candidate email addresses against RFC 5322 regex.
   - Guarded dispatches with a 60-second in-memory idempotency cache (`sentIdempotencyRegistry`).
   - Resolved sender identity and invoked the active provider.

3. **Handlebars Template Service (`lib/hiring/email/email-template-service.ts`):**
   - Compiled Handlebars templates for Round 1 (Introductory), Round 2 (Coding Assessment), Round 3 (System Architecture & HR), Rescheduling, and Cancellation.
   - Validated required fields before dispatch, failing closed on missing parameters.
   - Escaped dynamic variables to eliminate cross-site scripting (XSS) vectors.

4. **REST API Route (`app/api/hiring/interviews/[id]/invitation/route.ts`):**
   - `GET`: Authenticated caller via `ServerIdentity.getAuthoritativeCaller(['HR', 'ADMIN', 'MANAGER'])`, retrieved interview details scoped by `organization_id`, and rendered the Handlebars template for preview.
   - `POST`: Verified candidate email from database record, dispatched interview invitation via `EmailService.sendInterviewEmail()`, and updated `invitation_status`.

5. **HR Frontend UI (`app/(app)/hiring/interview-status/page.tsx`):**
   - Provided interactive interview status board, round tracking, and Handlebars email preview modal.
   - The UI layout was preserved exactly as committed by teammate Varshith Reddy in commit `c0f8a8a`.

---

## 2. Root Cause & Missing Integration Identified

The pre-implementation audit identified the following gaps:

1. **Missing Resend Provider Adapter:**
   `lib/hiring/email-provider.ts` only had a stub for SendGrid. There was no adapter implementing `EmailProvider` using the official `resend` Node.js SDK.
2. **Missing Resend SDK Dependency:**
   The `resend` package was not declared in `package.json`.
3. **No Dynamic HTML Email Generation:**
   `EmailService.sendInterviewEmail()` and `sendOfferEmail()` were only dispatching plain-text `text` payloads to providers. Resend requires rich HTML or formatted markup for modern email clients.
4. **Missing Inbound Delivery Webhook:**
   There was no webhook endpoint at `/api/webhooks/resend` to receive asynchronous delivery events (`email.delivered`, `email.bounced`, `email.opened`) and update candidate interview records accordingly.
5. **Terminal Stage Candidate Guard:**
   The invitation route previously did not check candidate eligibility for terminal stages (`REJECTED`, `WITHDRAWN`), risking accidental emails to non-viable candidates.

---

## 3. Files Added or Modified and Rationale

| File Path | Action | Rationale |
| :--- | :--- | :--- |
| `package.json` & `package-lock.json` | **Modified** | Added official `resend@^6.35.0` dependency. |
| `lib/hiring/email-provider.ts` | **Modified** | Implemented `ResendEmailProvider`, expanded `SendEmailResult.provider` union type to include `'resend'`, updated `EmailProviderFactory` to select Resend when `EMAIL_PROVIDER=resend` or `RESEND_API_KEY` is set, and added `EmailProviderFactory.reset()`. |
| `lib/hiring/email/email-template-service.ts` | **Modified** | Added static `wrapHtml(bodyText, subjectText)` to wrap all emails in responsive card HTML without double-escaping Handlebars-sanitized content. |
| `lib/hiring/email/email-service.ts` | **Modified** | Updated `sendInterviewEmail()` and `sendOfferEmail()` to generate `htmlBody` and pass `html` along with fallback sender resolution (`process.env.EMAIL_FROM_ADDRESS || process.env.ATTENDX_EMAIL_FROM`). |
| `app/api/hiring/interviews/[id]/invitation/route.ts` | **Modified** | Added `hasRealEmailCredentials()` helper, terminal stage candidate rejection (`REJECTED`, `WITHDRAWN`), stage progression from `SHORTLISTED` to `INTERVIEW`, and safe error responses on provider failures. |
| `lib/hiring/interview-service.ts` | **Modified** | Updated line 265 to check `RESEND_API_KEY || SENDGRID_API_KEY` when determining initial delivery status. |
| `app/api/webhooks/resend/route.ts` | **Added** | Created webhook handler to receive `email.delivered`, `email.bounced`, and `email.opened` events with timing-safe Svix signature verification and event deduplication. |
| `.env.example` | **Verified** | Confirmed presence of `EMAIL_PROVIDER=mock`, `RESEND_API_KEY=`, `EMAIL_FROM_ADDRESS=`, and `RESEND_WEBHOOK_SECRET=`. |
| `tests/hiring-resend-email-integration.test.mjs` | **Added** | 15 targeted tests covering request mapping, credential detection, missing key handling, draft mode, Handlebars escaping, candidate eligibility, idempotency, and Svix signature verification. |

---

## 4. Resend Configuration Instructions

To enable live email delivery in production or development:

1. Obtain a Resend API Key from the [Resend Dashboard](https://resend.com/api-keys).
2. Verify your sending domain in [Resend Domains](https://resend.com/domains) (or use `onboarding@resend.dev` for developer testing to your own account email).
3. Set the following environment variables in `.env.local`:

```dotenv
# Select Resend as the active provider
EMAIL_PROVIDER=resend

# Secret Resend API key (starts with re_)
RESEND_API_KEY=re_your_api_key_here

# Verified sender address
EMAIL_FROM_ADDRESS=AttendX Hiring <onboarding@resend.dev>

# Optional: Resend Webhook signing secret (starts with whsec_)
RESEND_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

4. For automated testing and local offline development, keep `EMAIL_PROVIDER=mock` (the safe default).

---

## 5. Candidate Interview Invitation & Template Flow

```
[HR User clicks "Send Invitation" in UI]
                  │
                  ▼
[POST /api/hiring/interviews/[id]/invitation]
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
[Verify HR Caller]   [Verify Candidate Record]
        │                   │
        │            (Reject if REJECTED / WITHDRAWN)
        │            (Fetch verified candidate.email from DB)
        ▼                   ▼
[EmailTemplateService.render(templateKey, data)]
  - Escapes variables (anti-XSS)
  - Generates plain text and responsive HTML card
                  │
                  ▼
[EmailService.sendInterviewEmail()]
  - Checks 60-Second Idempotency Cache
  - Resolves Sender from EMAIL_FROM_ADDRESS
                  │
                  ▼
[EmailProviderFactory.getProvider()]
                  │
       ┌──────────┴──────────┐
       ▼                     ▼
[EMAIL_PROVIDER=mock]   [EMAIL_PROVIDER=resend]
       │                     │
[MockEmailProvider]     [ResendEmailProvider]
- Status: SIMULATED     - If key absent: PENDING_CONFIGURATION
- No external calls     - Calls client.emails.send()
                        - On success: status: 'SENT', ID: 're_...'
                        - On API error: status: 'FAILED' (Zero Fabrication)
                  │
                  ▼
[Persist in Interview Record / Audit Log]
                  │
                  ▼
[Return Response Envelope: { success: true, data: { delivery_status: 'SENT', ... } }]
                  │
                  ▼
[Resend Webhook: /api/webhooks/resend]
  - Verifies Svix HMAC signature
  - Updates status to DELIVERED / BOUNCED / OPENED
```

---

## 6. Test Suite Execution & Verification Results

### A. Resend Provider Integration Suite
**Command:** `node --test tests/hiring-resend-email-integration.test.mjs`  
**Exit Code:** `0`  
**Result:** **15 passed, 0 failed (26ms)**
- Test 1: Safely returns `PENDING_CONFIGURATION` when `RESEND_API_KEY` is absent (no crash).
- Test 2: Returns `DRAFT` status without making external API calls.
- Test 3: Maps options and captures authentic Resend message ID on success.
- Test 4: Handles API errors (domain unverified) gracefully without throwing.
- Test 5: Catches network disconnects (`ETIMEDOUT`) without crashing route.
- Test 6: `EmailProviderFactory` dynamically resolves Resend, Mock, or SendGrid based on environment.
- Test 7: `EmailTemplateService` renders safe escaped HTML card structure for all rounds.
- Test 8: `EmailTemplateService` strictly fails closed when required variables are missing.
- Test 9: `EmailService` validates email format and rejects malformed addresses.
- Test 10: `EmailService` prevents duplicate sends within the 60-second idempotency window.
- Test 11: `MockStore` enforces tenant boundary (cross-tenant denial).
- Test 12: Candidate eligibility rejects terminal-stage candidates (`REJECTED`, `WITHDRAWN`).
- Test 13: Resend webhook verifies authentic Svix signature and rejects forged signatures.
- Test 14: Zero Fabrication: Mock mode is transparently marked as `SIMULATED`.
- Test 15: Dispatch with real Resend credentials returns `simulationStatus: 'REAL'` and authentic message ID.

### B. Existing Hiring Module Regression Suites
**Command:** `node --test tests/hiring-handlebars-email-integration.test.mjs tests/hiring-structured-interview-scheduling.test.mjs tests/hiring-module4-end-to-end.test.mjs tests/hiring-offer-release-document-preview.test.mjs tests/hiring-outreach-handlebars-campaigns.test.mjs`  
**Exit Code:** `0`  
**Result:** **67 passed, 0 failed (289ms)**

### C. Full Repository Unit Test Suite
**Command:** `npm test`  
**Exit Code:** `0`  
**Result:** **273 passed, 0 failed (495ms)**

### D. TypeScript Strict Check
**Command:** `npm run typecheck`  
**Exit Code:** `0`  
**Result:** Clean compilation (`tsc --noEmit`), 0 errors.

### E. ESLint Check
**Command:** `npm run lint`  
**Exit Code:** `0` (0 errors, warnings only).

### F. CI Secret Scanner & Anti-Fabrication Guardrails
**Command:** `npm run scan:secrets && ./scripts/ci-guardrails.sh`  
**Exit Code:** `0`  
**Result:** 100% clean of client-side secret leaks, zero empty catch blocks, all route destinations intact.

### G. Next.js Production Build
**Command:** `npm run build`  
**Exit Code:** `0`  
**Result:** Compiled successfully in 2.8s; all 124 routes prerendered / dynamic endpoints registered (including `/api/webhooks/resend`).

---

## 7. Security, Tenant Isolation, and Idempotency Results

1. **Server-Side Identity Enforcement:**
   Calls to `/api/hiring/interviews/[id]/invitation` strictly authenticate the caller's session via `ServerIdentity.getAuthoritativeCaller(['HR', 'ADMIN', 'MANAGER'])`. Unauthenticated requests immediately receive HTTP 401.
2. **Tenant Scoping:**
   Interviews, candidates, and job applications are queried strictly with `.eq('organization_id', caller.tenantId)`. Cross-tenant candidate ID injection returns HTTP 404.
3. **Server-Resolved Recipient:**
   The destination email address is retrieved from the verified candidate database record (`candidate.email`). Any client-supplied `to` parameter in the JSON body is ignored to prevent unauthorized email relays.
4. **Idempotency Window:**
   The 60-second window in `EmailService` intercepts accidental repeated button clicks and network retries, returning cached message IDs without triggering duplicate Resend dispatches.
5. **Svix Webhook Verification:**
   The webhook endpoint computes timing-safe HMAC SHA-256 signatures over `${svixId}.${svixTimestamp}.${payload}` to prevent replay attacks and header forgery.

---

## 8. Definition of Done Checklist

- [x] Resend official Node.js SDK integrated via `ResendEmailProvider`.
- [x] `EmailProviderFactory` updated with environment variable resolution (`EMAIL_PROVIDER=resend`).
- [x] Safe failure on missing credentials (`status: 'PENDING_CONFIGURATION'`, `simulationStatus: 'SIMULATED'`).
- [x] Zero Fabrication enforced: never returns a fake provider message ID or reports live delivery without real provider acceptance.
- [x] Handlebars template compilation preserved with safe HTML escaping and responsive styling.
- [x] Terminal-stage candidate eligibility enforced (`REJECTED` / `WITHDRAWN` rejected with 400).
- [x] Resend webhook endpoint `/api/webhooks/resend` implemented with Svix signature validation.
- [x] 15 focused tests added in `tests/hiring-resend-email-integration.test.mjs` (all passing).
- [x] All 273 existing repository unit tests passing with zero regressions.
- [x] Next.js production build (`npm run build`) succeeded with 0 errors.
- [x] UI layout and styles preserved intact without modifications.
- [x] All changes kept local and uncommitted.
