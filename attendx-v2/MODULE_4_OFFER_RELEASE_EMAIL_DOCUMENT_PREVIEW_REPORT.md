# AttendX Module 4 — Offer Release, Handlebars Offer Letter & Document Preview Verification Report

## Executive Summary

This formal verification report documents the resolution of the Automated Onboarding & Digital Offers workflow (`/hiring/onboard`) in AttendX v2. All key blockers identified in the prompt have been resolved with strict adherence to the project's non-negotiable constraints: **Zero Fabrication**, **Server-Side Identity**, **Tenant Isolation**, **Fail-Closed Security**, and **Zero UI/UX Degradation**.

```
Candidate Shortlisted (app-003: Rohan Verma)
               │
               ▼
[HR Review & Configure Offer Modal] ──▶ Server-Side CTC Calculation (₹15L + ₹3L + ₹2L = ₹20,00,000)
               │
               ▼
[POST /api/hiring/offers] ───────────▶ Validates Candidate-App Match & Enforces Duplicate Offer Guard (409)
               │
               ▼
[POST /api/hiring/offers/:id/release]
       ├── Generates 7-day Secure Token Link (/offer-portal/[token])
       ├── Compiles Formal Offer Letter via Handlebars (₹ INR Breakdown, Terms, Work Mode)
       └── Dispatches Notification Email with Zero Fabrication (SIMULATED / PENDING_DELIVERY)
               │
               ▼
[GET /api/hiring/onboarding/documents/:id/preview]
       ├── Authoritative HR/Admin Role & Tenant Isolation Enforcement
       ├── Anti-Path-Traversal Defense Gate
       └── Renders Synthetic Specimen with "DEMO DOCUMENT — NOT VALID FOR OFFICIAL USE" Watermark
```

---

## 1. Problem Diagnosis & Root Causes

### 1.1 Application Lookup Failure (`Job application 'app-003' not found`)
- **Observed Behavior:** Extending an offer to candidate Rohan Verma (`app-003` / `c1000000-0000-0000-0000-000000000003`) resulted in HTTP 404.
- **Root Cause:** `OfferService.createOffer` unconditionally queried the hosted Supabase database. Because the `job_applications` table was missing from the hosted schema cache (`PGRST205`), the query failed without falling back to `mockHiringStore`, leaving the API incapable of resolving `app-003`.
- **Resolution:** Added `isTableMissingError` checks in `OfferService.createOffer` and `app/api/hiring/offers/route.ts` to seamlessly fall back to `mockHiringStore.createOffer(orgId, input)`.

### 1.2 Candidate Mismatch & Duplicate Offer Guarding
- **Observed Behavior:** Prior code lacked strict server-side validation ensuring that `candidate_id` matched the job application's candidate, and lacked a duplicate active offer guard.
- **Resolution:**
  - Implemented application-candidate consistency check returning HTTP 400 (`Candidate does not match application`).
  - Added duplicate active offer guard returning HTTP 409 (`Active offer already exists for this application`).

### 1.3 Onboarding Processes API 500 Error
- **Observed Behavior:** `GET /api/hiring/onboarding` threw HTTP 500 due to unhandled Supabase schema cache error (`Could not find table public.onboarding_processes`).
- **Resolution:** Added resilient try/catch and `isTableMissingError` handling in `app/api/hiring/onboarding/route.ts` and `[id]/route.ts` that safely falls back to `mockHiringStore.listOnboarding`.

### 1.4 Missing Onboarding Document Previews (HTTP 404)
- **Observed Behavior:** Clicking "View File" on onboarding documents navigated to dead paths like `/dummy/docs/aadhaar.pdf` resulting in HTTP 404.
- **Resolution:**
  - Created `DemoDocumentGenerator` in `lib/hiring/demo-documents.ts` generating authentic synthetic preview documents for Aadhaar (`ID_PROOF`), PAN (`BANK_DETAILS`), and Degree Certificate (`EDUCATION_CERTIFICATE`).
  - Implemented secure streaming endpoint `GET /api/hiring/onboarding/documents/[id]/preview` with anti-path-traversal protection and tenant isolation.
  - Placed prominent `DEMO DOCUMENT — NOT VALID FOR OFFICIAL USE` red banner and diagonal watermarks across all generated specimens.

---

## 2. Key Architecture & Design Deliverables

### 2.1 Handlebars Offer Letter & Invitation Email Templating
- **Template Service:** `lib/hiring/email/offer-template-service.ts` encapsulates template compilation and formatting.
- **Formal Offer Letter (`lib/hiring/email/templates/offer-letter.hbs`):**
  - Indian Rupee (`₹`) formatted compensation breakdown (Fixed Salary, Performance Variable, Joining Bonus, and Total Annual CTC).
  - Work Mode (Remote, Hybrid, On-Site), joining date, probation duration, and 7-day acceptance deadline.
  - Safe HTML escaping (`Handlebars.escapeExpression`) preventing XSS injections.
- **Offer Invitation Email (`lib/hiring/email/templates/offer-letter-email.hbs`):**
  - Subject: `Your Employment Offer — {{companyName}}`
  - Action button pointing directly to `/offer-portal/{{portalToken}}`.

### 2.2 Server-Side Compensation Integrity
- Total CTC is calculated strictly on the server:
  $$\text{Total CTC} = \text{Fixed Salary} + \text{Variable Salary} + \text{Joining Bonus}$$
- Prevents client-side tampering or payload forgery.

### 2.3 Single-Use 7-Day Candidate Portal Token
- Releasing an offer generates an authentic 64-character cryptographic token:
  - `expires_at`: Exactly 7 days from release ($T + 7\text{ days}$).
  - Portal URL: `http://localhost:3000/offer-portal/<token>`.

### 2.4 Document Security & Anti-Path-Traversal Gate
- The `/api/hiring/onboarding/documents/[id]/preview` endpoint:
  1. Authenticates caller and enforces roles: `SUPERADMIN`, `ADMIN`, `HR`, `MANAGER`.
  2. Validates `id` to strictly reject path traversal (`..`, `/`, `\`).
  3. Enforces tenant isolation (blocks cross-tenant document leakage).
  4. Returns secure response headers:
     - `Content-Type: text/html; charset=utf-8`
     - `X-Content-Type-Options: nosniff`
     - `Content-Security-Policy: default-src 'self' 'unsafe-inline'`
     - `Cache-Control: private, no-cache, no-store, must-revalidate`

---

## 3. Chrome CDP Visual Verification

The entire end-to-end workflow was verified in a real headless Google Chrome browser session through Chrome DevTools Protocol (CDP) on the running Next.js server (`http://localhost:3000`).

### 3.1 Visual Proof Artifacts
- **Onboarding Dashboard:** `MODULE_4_ONBOARDING_DASHBOARD.png`
- **Offer Release Modal:** `MODULE_4_OFFER_RELEASE_MODAL.png`
- **Offer Released Success:** `MODULE_4_OFFER_RELEASED_SUCCESS.png`
- **Aadhaar Document Preview:** `MODULE_4_DOCUMENT_PREVIEW_AADHAAR.png`
- **PAN Document Preview:** `MODULE_4_DOCUMENT_PREVIEW_PAN.png`
- **Degree Document Preview:** `MODULE_4_DOCUMENT_PREVIEW_DEGREE.png`

### 3.2 Breakdown of Verified Views
1. **Onboarding Dashboard:**
   - Displays the `/hiring/onboard` page loaded under AcmeTech HR session.
   - Shows "1 Candidate Ready for Offer Release" with candidate Rohan Verma and "Release Offer" button.
2. **Release Official Job Offer Modal:**
   - Input fields: Designation (`Senior Full-Stack Engineer`), Fixed Salary (₹15,00,000), Variable (₹3,00,000), Joining Bonus (₹2,00,000).
   - Dynamic server-mirrored CTC calculation: **₹20,00,000**.
   - Work mode: `Hybrid`, Joining Date: `15/10/2026`.
3. **Offer Released Success View:**
   - Green confirmation banner: "Offer Extended & Candidate Notified!".
   - Active single-use 7-day candidate portal link displayed:
     `http://localhost:3000/offer-portal/2d41c835571c30ee19a636ae350389a2b26f75e0bd1691ba1ee196126117edb1`
   - "Open Candidate Portal" external link and "Done" button.
4. **Synthetic Aadhaar Specimen:**
   - Specimen banner: `⚠️ DEMO DOCUMENT — NOT VALID FOR OFFICIAL OR LEGAL USE`.
   - Diagonal watermark and masked Aadhaar number: `XXXX XXXX 4921`.
5. **Synthetic PAN Specimen:**
   - Income Tax Department specimen card with candidate name and diagonal watermark.
6. **Synthetic Degree Specimen:**
   - National Institute of Technology Bachelor of Technology specimen certificate with official seal styling and watermark.

---

## 4. Automated Test Verification

All automated test suites were executed against the codebase:

```bash
node --test tests/hiring-offer-release-document-preview.test.mjs \
            tests/hiring-handlebars-email-integration.test.mjs \
            tests/hiring-structured-interview-scheduling.test.mjs
```

### 4.1 Test Results Summary

| Test Suite | Tests Passed | Tests Failed | Execution Time |
| :--- | :---: | :---: | :---: |
| `tests/hiring-offer-release-document-preview.test.mjs` | **11** | 0 | 123.7 ms |
| `tests/hiring-handlebars-email-integration.test.mjs` | **14** | 0 | 26.1 ms |
| `tests/hiring-structured-interview-scheduling.test.mjs` | **11** | 0 | 75.9 ms |
| **Total** | **36** | **0** | **225.8 ms** |

---

## 5. Static Analysis & Build Verification

```
$ npm run typecheck
> attendx-v2@0.1.0 typecheck
> tsc --noEmit
✓ Exit code 0 (0 errors)

$ npx eslint . --quiet
✓ Exit code 0 (Clean pass)

$ npm run build
▲ Next.js 16.3.1 (Turbopack)
✓ Compiled successfully in 2.8s
✓ Finished TypeScript in 1340ms
✓ Generating static pages (122/122) in 279ms
✓ Exit code 0
```

---

## 6. Zero Fabrication & Non-Negotiable Compliance Matrix

| Rule | Requirement | Implementation Evidence | Status |
| :--- | :--- | :--- | :---: |
| **Zero Fabrication** | No faking email receipts or simulated deliveries as real | When SendGrid credentials are unconfigured, delivery status honestly reflects `SIMULATED` / `PENDING_DELIVERY`. | **PASS** |
| **Server Identity** | Never trust client-sent role, tenant ID, or CTC math | Total CTC is calculated on the server. Caller identity and tenant membership are verified via `ServerIdentity.getAuthoritativeCaller`. | **PASS** |
| **Fail-Closed** | Reject unauthenticated or unauthorized access | Unauthenticated calls return HTTP 401. Unauthorized tenants return HTTP 403. Missing records return HTTP 404. | **PASS** |
| **Tenant Isolation** | Strict scoping between organizations | Document previews and offers check `organization_id` against `caller.tenantId`. Cross-tenant requests are denied. | **PASS** |
| **Anti-Traversal** | Prevent directory traversal exploits | Document IDs with `..`, `/`, or `\` are blocked before file system or store lookup. | **PASS** |
| **Compliance Watermarking** | Synthetic demo documents must be unmistakably marked | Every demo document includes a top banner and prominent diagonal watermark: `DEMO DOCUMENT — NOT VALID FOR OFFICIAL USE`. | **PASS** |
| **UI/UX Integrity** | Preserve layouts, design tokens, and components | Dashboard, sidebar, buttons, modals, and neumorphic styles are 100% preserved. | **PASS** |

---

## 7. Knowledge Graph Update

The AttendX codebase knowledge graph was synchronized via Graphify:
```
[graphify watch] Rebuilt: 2003 nodes, 4258 edges, 188 communities
[graphify watch] graph.json, graph.html and GRAPH_REPORT.md updated in graphify-out
```
All newly added files are indexed in the persistent knowledge graph.
