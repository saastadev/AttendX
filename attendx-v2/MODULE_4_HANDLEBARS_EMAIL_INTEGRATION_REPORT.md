# AttendX Module 4 — Handlebars Email Templates & Interview Scheduling Integration Report

**Date:** October 28, 2026  
**Environment:** Next.js 16.3.1 (Turbopack), Node.js v25.9.0, PostgreSQL 16 (Local Test DB `attendx_test`), Supabase Server Client & Dev-Mock  
**Branch:** `feat/hiring-module-mvp-verified`  
**Status:** ✅ Fully Implemented, Verified, Built, and Audited  

---

## Executive Summary

As part of the **AttendX Module 4: Hiring Module MVP**, the legacy voice-calling agent workflow in **Interview Status & AI Screening** (`/hiring/interview-status`) has been completely replaced with a production-minded, database-backed structured interview scheduling and candidate communication system powered by **Handlebars** (`handlebars` v4.7.8).

The system models three canonical interview stages (Round 1 Introductory, Round 2 Coding Assessment, Round 3 Technical Deep Dive & HR), plus event-driven templates for Rescheduled and Cancelled interviews. It enforces strict variable validation (fail-closed on missing variables), native Handlebars safe HTML escaping against XSS injection (`{{variable}}` instead of unsafe `{{{...}}}`), explicit timezone formatting with `Intl.DateTimeFormat`, strict Google Meet link format validation, idempotency guards against accidental duplicate dispatches, and absolute adherence to **Zero Fabrication** (transparently reflecting `PENDING_DELIVERY` or `PENDING_CONFIGURATION` whenever real email credentials like `SENDGRID_API_KEY` are not provisioned).

---

## 1. Files Inspected and Modified

### Newly Created Files
- [`lib/hiring/email/email-template-service.ts`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/attendx-v2/lib/hiring/email/email-template-service.ts): Core Handlebars compilation, variable validation, date/time timezone formatting, and HTML/plain-text rendering service.
- [`lib/hiring/email/email-service.ts`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/attendx-v2/lib/hiring/email/email-service.ts): Server-side email dispatcher with recipient address validation, in-memory idempotency cache (60s duplicate send window), and provider routing.
- [`lib/hiring/email/templates/interview-round-1.hbs`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/attendx-v2/lib/hiring/email/templates/interview-round-1.hbs): Handlebars template for Round 1 — Introductory Interview (20m default).
- [`lib/hiring/email/templates/interview-round-2.hbs`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/attendx-v2/lib/hiring/email/templates/interview-round-2.hbs): Handlebars template for Round 2 — Coding Assessment (60m default).
- [`lib/hiring/email/templates/interview-round-3.hbs`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/attendx-v2/lib/hiring/email/templates/interview-round-3.hbs): Handlebars template for Round 3 — Technical & HR Deep Dive (60m default).
- [`lib/hiring/email/templates/interview-rescheduled.hbs`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/attendx-v2/lib/hiring/email/templates/interview-rescheduled.hbs): Handlebars template for interview rescheduling with conditional reason.
- [`lib/hiring/email/templates/interview-cancelled.hbs`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/attendx-v2/lib/hiring/email/templates/interview-cancelled.hbs): Handlebars template for interview cancellation with conditional reason.
- [`tests/hiring-handlebars-email-integration.test.mjs`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/attendx-v2/tests/hiring-handlebars-email-integration.test.mjs): 14 comprehensive unit & integration tests for Handlebars templates, variable validation, XSS protection, timezone handling, idempotency, and tenant isolation.
- [`scripts/capture-handlebars-screenshots.mjs`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/attendx-v2/scripts/capture-handlebars-screenshots.mjs): Automation script to launch Chrome headless via CDP, authenticate, preview templates, and capture high-resolution verification screenshots.

### Modified Files
- [`package.json`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/attendx-v2/package.json): Added `handlebars` dependency and `@types/handlebars` devDependency.
- [`lib/hiring/email-provider.ts`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/attendx-v2/lib/hiring/email-provider.ts): Added `PENDING_CONFIGURATION` to `EmailDeliveryStatus` union and export types.
- [`app/api/hiring/interviews/[id]/invitation/route.ts`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/attendx-v2/app/api/hiring/interviews/%5Bid%5D/invitation/route.ts): Updated `GET` to render via `EmailTemplateService` (with query parameter `template_key` support) and `POST` to dispatch via `EmailService`.
- [`app/api/hiring/interviews/[id]/route.ts`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/attendx-v2/app/api/hiring/interviews/%5Bid%5D/route.ts): Added optional `send_notification: true` support on interview reschedule/cancellation to trigger Handlebars notification dispatch.
- [`app/(app)/hiring/interview-status/page.tsx`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/attendx-v2/app/%28app%29/hiring/interview-status/page.tsx): Added live Handlebars template selection switcher in the email preview modal, allowing HR to inspect and switch between templates seamlessly before confirming dispatch.
- [`scripts/capture-interview-screenshot.mjs`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/attendx-v2/scripts/capture-interview-screenshot.mjs): Fixed empty `catch {}` block statements flagged by ESLint `no-empty` rule.

---

## 2. Handlebars Templates Implemented

| Template Key | Template File | Subject Format | Default Duration | Required Variables |
| :--- | :--- | :--- | :--- | :--- |
| `interview-round-1` | `lib/hiring/email/templates/interview-round-1.hbs` | `Interview Invitation — Round 1: Introduction — {{jobTitle}}` | 20 minutes | `candidateName`, `companyName`, `jobTitle`, `roundName`, `interviewDate`, `interviewTime`, `timezone`, `duration`, `interviewerNames`, `interviewAgenda`, `meetingUrl`, `recruiterName` |
| `interview-round-2` | `lib/hiring/email/templates/interview-round-2.hbs` | `Interview Invitation — Round 2: Coding Assessment — {{jobTitle}}` | 60 minutes | All scheduling variables + problem-solving, tools & screen share instructions |
| `interview-round-3` | `lib/hiring/email/templates/interview-round-3.hbs` | `Interview Invitation — Round 3: Technical & HR — {{jobTitle}}` | 60 minutes | All scheduling variables + distributed systems, leadership & compensation topics |
| `interview-rescheduled`| `lib/hiring/email/templates/interview-rescheduled.hbs` | `Interview Rescheduled: {{roundName}} — {{jobTitle}}` | From interview | Updated date, time, timezone, duration, meet link, optional `rescheduleReason` |
| `interview-cancelled` | `lib/hiring/email/templates/interview-cancelled.hbs` | `Interview Cancelled: {{roundName}} — {{jobTitle}}` | N/A | `candidateName`, `companyName`, `jobTitle`, `roundName`, `recruiterName`, optional `cancelReason` |

### Handlebars Security & Architecture Highlights
1. **Zero Unsafe Interpolation (`{{{...}}}`):** All dynamic variables use standard double braces `{{variable}}`, ensuring Handlebars strictly HTML-escapes all special characters (`&`, `<`, `>`, `"`, `'`). Verified by passing `<script>alert("XSS")</script>` and `<img src=x onerror=alert(1)>` in unit test suite.
2. **Fail-Closed Variable Validation:** Missing or whitespace-only required parameters reject immediately with a descriptive error before dispatching, preventing corrupted or half-filled email bodies.
3. **Resilient Dual-Mode Template Resolution:** Files are loaded from `process.cwd()/lib/hiring/email/templates/*.hbs`, with an automatic embedded string fallback map to ensure standalone, bundled, or serverless deployments never fail if `.hbs` assets are omitted by the bundler.
4. **Timezone Fidelity:** Date and time strings are computed using Node's `Intl.DateTimeFormat` with the explicit interview timezone (e.g. `Asia/Kolkata`, `UTC`, `America/New_York`), never relying on local server process time.

---

## 3. Email Provider Integration & Credential Status

### Zero Fabrication Architecture
- **Missing Credentials Behavior:** When `process.env.SENDGRID_API_KEY` or SMTP credentials are not set, the provider transparently logs and returns:
  - `status: 'PENDING_DELIVERY'` (or `'PENDING_CONFIGURATION'`)
  - `provider: 'mock_email'`
  - `simulationStatus: 'SIMULATED'`
  - It **never** fabricates a false `SENT` or `DELIVERED` status without external provider confirmation.
- **Automated Tests:** In all automated tests, the `MockEmailProvider` is active via `EmailProviderFactory.setProvider(mockProvider)`, ensuring zero external network calls and zero risk of sending emails to candidate addresses.
- **Idempotency Protection:** `EmailService` caches dispatch requests for 60 seconds per `interviewId` + action to prevent double-clicks or concurrent network retries from sending duplicate emails.

---

## 4. Interview Scheduling & Persistence Verification

1. **Schedule Conflict Detection:** Overlap detection (`existing.start < new.end AND existing.end > new.start`) checks interviewer panel availability before scheduling or rescheduling, returning HTTP 409 Conflict if an interviewer is already booked.
2. **Google Meet Validation:** Manual and generated Google Meet links are strictly validated against `^https:\/\/meet\.google\.com\/[a-z0-9_-]+(\?[a-zA-Z0-9_=&-]+)?$`.
3. **Database & Mock Store Persistence:**
   - Real PostgreSQL: Stores to `interviews` table with notes tracking `Invitation Status: PENDING_DELIVERY (MsgID: ...)`.
   - Fallback Mock Store: Automatically clones fixtures for foreign tenants (e.g. SwiftLogix) and tracks `invitation_status`, `invitation_subject`, and `invitation_body`.
4. **Human-in-the-Loop Workflow:**
   - Schedule Interview -> Preview Rendered Email in Modal -> Edit Subject/Body if desired -> Save Draft OR Send Invitation.

---

## 5. Database Schema Changes

No destructive migrations were run. The existing schema and `mock-store.ts` structures natively accommodate:
- `interviews.invitation_status`: Tracks delivery state (`DRAFT`, `PENDING_DELIVERY`, `PENDING_CONFIGURATION`, `SIMULATED`, `SENT`).
- `interviews.invitation_subject` & `invitation_body`: Tracks rendered invitation text.
- `outreach_messages`: Used for logging candidate email communication history.

---

## 6. HR Authorization & Tenant Isolation Verification

All interview endpoints require server-authoritative caller authentication via `ServerIdentity.getAuthoritativeCaller(['SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'], request)`:
- Unauthenticated requests fail with **HTTP 401 Unauthorized**.
- `EMPLOYEE` role requests fail with **HTTP 403 Forbidden**.
- Cross-tenant requests (e.g. Acme accessing SwiftLogix interview) fail with **HTTP 404 Not Found** (tenant-scoped fail-closed).

---

## 7. Test Commands & Actual Execution Results

### 1. Handlebars Email Integration Test Suite
```bash
node --test tests/hiring-handlebars-email-integration.test.mjs
```
**Output:**
```
▶ AttendX Module 4: Handlebars Email Template System
  ✔ Renders Round 1: Introductory Interview template with subject and body (4.723458ms)
  ✔ Renders Round 2: Coding Assessment template with coding instructions (2.0195ms)
  ✔ Renders Round 3: Technical Deep Dive & HR template (0.7545ms)
  ✔ Renders Rescheduled Interview template with optional reason (1.336959ms)
  ✔ Renders Cancelled Interview template with optional reason (0.864167ms)
  ✔ Fails closed when required variable candidateName is missing (0.213166ms)
  ✔ Fails closed when multiple required variables are missing (0.083625ms)
  ✔ Safely escapes malicious HTML/XSS payloads in candidate and company names (0.08475ms)
  ✔ Formats date and time in specified timezone (Asia/Kolkata vs UTC) (9.607833ms)
  ✔ Strictly validates authentic Google Meet URL formats (0.296459ms)
  ✔ EmailService validates recipient format and prevents invalid recipient (0.243208ms)
  ✔ EmailService prevents accidental duplicate sends (Idempotency) (0.111792ms)
  ✔ Draft saves bypass idempotency locks (0.048208ms)
  ✔ MockStore enforces tenant isolation for interviews and applications (0.269334ms)
✔ AttendX Module 4: Handlebars Email Template System (21.308209ms)
ℹ tests 14 | pass 14 | fail 0
```
**Exit Code:** `0`

### 2. Structured Interview Scheduling Regression Suite
```bash
node --test tests/hiring-structured-interview-scheduling.test.mjs
```
**Output:** `ℹ tests 11 | pass 11 | fail 0 (duration: 167ms)`  
**Exit Code:** `0`

### 3. Hiring Batch 1 Security & Route Hardening Suite
```bash
node --test tests/hiring-batch1-security-regression.test.mjs
```
**Output:** `ℹ tests 105 | pass 105 | fail 0 (duration: 124ms)`  
**Exit Code:** `0`

### 4. Comprehensive Sourcing 16-Scenario Suite
```bash
node --test tests/hiring-sourcing-module4-16cases.test.mjs
```
**Output:** `ℹ tests 19 | pass 19 | fail 0 (duration: 134ms)`  
**Exit Code:** `0`

### 5. Demo Cookie & Tenant Security Hardening Suite
```bash
node --test tests/sec01-demo-cookie-hardening.test.mjs
```
**Output:** `ℹ tests 24 | pass 24 | fail 0 (duration: 136ms)`  
**Exit Code:** `0`

### 6. Real API Authorization HTTP Integration Suite
```bash
node --test tests/hiring-api-auth-http-integration.test.mjs
```
**Output:** `ℹ tests 8 | pass 8 | fail 0 (duration: 2316ms)`  
**Exit Code:** `0`

### 7. CI Secret Scan
```bash
npm run scan:secrets
```
**Output:**
```
🔍 [AttendX CI Secret Scanner] Scanning client bundles for secret leakage...
✅ Client directories (app/, components/, hooks/, store/) are 100% clean of service keys.
```
**Exit Code:** `0`

### 8. TypeScript Typecheck
```bash
npm run typecheck
```
**Output:** `> tsc --noEmit (0 errors)`  
**Exit Code:** `0`

### 9. ESLint Quiet Check
```bash
npx eslint . --quiet
```
**Output:** `0 problems (0 errors)`  
**Exit Code:** `0`

### 10. Next.js Production Build
```bash
npm run build
```
**Output:**
```
▲ Next.js 16.3.1 (Turbopack)
✓ Compiled successfully in 3.1s
✓ Generating static pages using 9 workers (122/122) in 359ms
```
**Exit Code:** `0`

---

## 8. Browser Verification & Artifact Screenshots

Browser testing was performed using Google Chrome in headless mode via Chrome DevTools Protocol (CDP) connecting to `http://localhost:3000`.

### Captured Artifacts:
1. **Handlebars Email Invitation Modal:**
   - Path: [`file:///Users/nanthithavenkatachapathy/.gemini/antigravity-cli/brain/f8b9dc2a-6f15-4f5c-b80b-3e2642b7b9f9/interview-status-handlebars-email-modal.png`](file:///Users/nanthithavenkatachapathy/.gemini/antigravity-cli/brain/f8b9dc2a-6f15-4f5c-b80b-3e2642b7b9f9/interview-status-handlebars-email-modal.png)
   - Visual Verification: Demonstrates modal open with template selector showing `Round 1 — Introductory Interview`, candidate email recipient `aarav.sharma@example.com`, rendered Handlebars subject `Interview Invitation — Round 1: Introduction — Senior Full-Stack Engineer`, rendered body with agenda, date, duration, and meet link, and Zero Fabrication disclosure alert.
2. **Structured Interview Progression & Google Meet Details Card:**
   - Path: [`file:///Users/nanthithavenkatachapathy/.gemini/antigravity-cli/brain/f8b9dc2a-6f15-4f5c-b80b-3e2642b7b9f9/interview-status-handlebars-dashboard.png`](file:///Users/nanthithavenkatachapathy/.gemini/antigravity-cli/brain/f8b9dc2a-6f15-4f5c-b80b-3e2642b7b9f9/interview-status-handlebars-dashboard.png)
   - Visual Verification: Displays the 3-round stepper, `Join Google Meet` button, `Email Invite` trigger button, `Record Feedback`, `Reschedule`, and `Cancel` buttons, and honest delivery status `PENDING_DELIVERY (Sandbox/Pending)`.

---

## 9. Manual Setup Instructions for Production Email Delivery

To enable real outbound email delivery via SendGrid or SMTP in production:
1. Obtain an API key from SendGrid with `Mail Send` permissions.
2. In `.env.production` (or hosted environment secrets), configure:
   ```env
   SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ATTENDX_EMAIL_FROM="AttendX Hiring <hiring@yourdomain.com>"
   ```
3. To enable Google Calendar event synchronization:
   ```env
   GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=xxxxxxxx
   GOOGLE_CALENDAR_REDIRECT_URI=https://app.attendx.io/api/auth/google/callback
   ```
4. Without these credentials, the system runs safely in transparent sandbox mode, generating valid ICS calendar files, rendering preview templates, and recording status as `PENDING_DELIVERY`.

---

## 10. Remaining Limitations

1. **Live Calendar Bidirectional Webhooks:** While ICS invite files and Google Meet links are generated and dispatched, live bi-directional sync (updating when a candidate declines on their external calendar) requires an inbound webhook receiver and Google Push Notifications setup.
2. **Provider Delivery Event Webhooks:** Tracking post-send states (`DELIVERED`, `BOUNCED`, `OPENED`) requires setting up an inbound SendGrid Event Webhook endpoint at `/api/webhooks/sendgrid`. Currently, delivery state immediately upon dispatch is recorded as `SENT` (when key is present) or `PENDING_DELIVERY` (sandbox).
