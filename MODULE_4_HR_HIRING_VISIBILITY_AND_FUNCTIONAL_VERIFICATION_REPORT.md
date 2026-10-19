# AttendX Module 4 — HR Hiring Visibility and Functional Verification Report

**Author:** Senior Full-Stack Engineer, Application Security Engineer & QA Lead  
**Date:** October 14, 2026  
**Status:** `VERIFIED & OPERATIONAL`  
**Classification:** Pre-Staging Verification & Navigation Remediation Gate  
**Reference Specs:** Docs/Specs 14 (Scope D RBAC), 19 (Hiring Schema), 22 (Onboarding), 23 (RLS Hardening), 35 (Definition of Done)

---

## 1. Executive Summary & Root Cause Analysis

### Problem Statement
A user logged into AttendX locally at `http://localhost:3000/dashboard` using an authorized HR account. While the standard workforce modules were accessible (Dashboard, Attendance, Leave, Performance, Employee 360°, Recognition, Cases, Notifications, HR Copilot, My Team, Approvals, Directory, and Insights), **Hiring / Talent Acquisition was completely missing from the sidebar visible in the viewport fold**.

### Root Cause Identification
1. **Missing Sidebar Navigation Registration in `HR & Admin`:**
   In `attendx-v2/components/layout/AppShell.tsx`, the `HR & Admin` navigation group contained links for `Directory` (`/hr/directory`), `Insights` (`/hr/insights`), `Sentiment` (`/hr/sentiment`), and Admin-only items (`Users`, `Selfies`, `Settings`). It **contained no entry for Hiring**.
2. **Viewport Overflow from Bloated Secondary Navigation Section:**
   In commit `b73b3b2`, an ad-hoc navigation section named `Hiring` was appended at the very bottom of `SIDEBAR_NAV` below `HR & Admin`. This section listed 7 individual submodule links, with the root `/hiring` route labeled `"Overview"` rather than `"Hiring"`.
   Because this section was preceded by 14 top-level and section items, on standard laptop/desktop display heights (768px–900px), the entire bottom section was pushed below the viewport fold. Users looking at the `HR & Admin` section saw only `Directory` and `Insights`.
3. **Sidebar Bloat vs. Hub Page Architecture:**
   The application already features a central command hub page at `attendx-v2/app/(app)/hiring/page.tsx` (`HiringHubPage`), which renders cards, status badges, metrics, and direct links to all 6 submodules (`applications`, `sourcing`, `outreach`, `interview-status`, `onboard`, `analytics`). Duplicating all 7 sub-items in the sidebar caused vertical clutter, broken layout hierarchy, and risk of route divergence.
4. **Permissive Post-Login Redirection for Employees:**
   In `attendx-v2/app/api/auth/login/route.ts`, the `EMPLOYEE` role permissions array in `ROLE_ROUTE_PERMISSIONS` erroneously included `'/hiring'`, allowing employees to request `/hiring` as a `next` destination after login before middleware intervened.

---

## 2. Relevant Files Inspected and Modified

| File | Status | Description of Change / Inspection |
|---|---|---|
| `attendx-v2/components/layout/AppShell.tsx` | `MODIFIED` | Registered `{ href: '/hiring', icon: Briefcase, label: 'Hiring', id: 'snav-hiring', minRole: 'HR' }` under `HR & Admin`. Removed redundant 7-item bottom section `Hiring` to eliminate duplication and restore sidebar responsiveness. |
| `attendx-v2/app/api/auth/login/route.ts` | `MODIFIED` | Removed `'/hiring'` from `EMPLOYEE` permissions array in `ROLE_ROUTE_PERMISSIONS` to enforce fail-closed post-login destination resolution. |
| `attendx-v2/proxy.ts` | `INSPECTED (PASS)` | Verified authoritative server middleware route guard. Line 34 configures `'/hiring': ['SUPERADMIN', 'ADMIN', 'HR', 'MANAGER']`. Unauthenticated requests redirect to `/auth/login?next=/hiring`. Unauthorized roles redirect to `/unauthorized`. |
| `attendx-v2/app/(app)/hiring/page.tsx` | `INSPECTED (PASS)` | Verified central Hiring Hub component (`HiringHubPage`). Renders live counters and navigational cards to all 6 submodules. |
| `attendx-v2/lib/auth/server-identity.ts` | `INSPECTED (PASS)` | Verified server-side identity resolver. Authenticates callers strictly via live database tokens and enforces RBAC fail-closed without trusting forged demo cookies outside permitted dev-mock mode. |
| `attendx-v2/tests/hiring-navigation-visibility.test.js` | `CREATED` | Added regression test suite verifying `AppShell` navigation definition, `minRole: 'HR'`, zero duplicate links, role visibility partitioning, and proxy route gating. |
| `attendx-v2/scripts/verify-hr-hiring-e2e.mjs` | `CREATED` | Added 22-check end-to-end integration verification script testing HTTP routes, PostgreSQL schema integrity, and live PostgreSQL RLS tenant isolation. |

---

## 3. The Actual Route Used

- **Main Navigation Destination:** `/hiring`  
  - Maps directly to: `attendx-v2/app/(app)/hiring/page.tsx`
  - Component: `HiringHubPage`
  - Client state active matching: `isActive = pathname === '/hiring' || pathname.startsWith('/hiring/')` (remains highlighted across all submodules)
- **Submodule Routes Accessible via Hiring Hub:**
  1. `/hiring/applications` — Applications & Candidate Pipeline
  2. `/hiring/sourcing` — AI Talent Sourcing & Profile Discovery
  3. `/hiring/outreach` — Multi-Channel Engagement & Campaigns
  4. `/hiring/interview-status` — Interview Progression & Screening Scorecards
  5. `/hiring/onboard` — Automated Onboarding, Joining Readiness & Document Verification
  6. `/hiring/analytics` — Funnel Conversion, Drop-off Analysis & Pipeline Recommendations
  7. `/offer-portal/[token]` — Candidate Single-Use 7-Day Acceptance Portal (Public / Token Protected)

---

## 4. Test Roles and Tenant Context

All verification was conducted using authenticated test identities against the local isolated database `postgresql://localhost:5432/attendx_test`. No credentials or production secrets were exposed.

| Identity Name | Role | Tenant ID | User ID | Purpose |
|---|---|---|---|---|
| **Carol HR** | `HR` | `11111111-0000-0000-0000-000000000001` (Acme Tech) | `11111111-1111-1111-1111-333333333333` | Primary positive control: legitimate HR user accessing Hiring UI, APIs, and own tenant database rows. |
| **Eve Employee** | `EMPLOYEE` | `11111111-0000-0000-0000-000000000001` (Acme Tech) | `11111111-1111-1111-1111-555555555555` | Primary negative control: workforce employee in same tenant attempting direct route access and database mutations. |
| **David Manager** | `MANAGER` | `11111111-0000-0000-0000-000000000001` (Acme Tech) | `11111111-1111-1111-1111-444444444444` | Managerial boundary test: allowed direct interview/requisition route access; excluded from HR & Admin section. |
| **Bob Admin** | `ADMIN` | `11111111-0000-0000-0000-000000000001` (Acme Tech) | `11111111-2222-2222-2222-222222222222` | Administrative positive control: full tenant visibility. |
| **Hannah HR** | `HR` | `22222222-0000-0000-0000-000000000002` (Globex Corp) | `22222222-2222-2222-2222-333333333333` | Cross-tenant isolation control: foreign HR user attempting to query or modify Acme Tech records. |

---

## 5. The Minimal Implemented Fix

### 1. `attendx-v2/components/layout/AppShell.tsx`
- **Registered Single Hiring Entry:** Placed `{ href: '/hiring', icon: Briefcase, label: 'Hiring', id: 'snav-hiring', minRole: 'HR' }` at index 0 under `HR & Admin`.
- **Elevated `HR & Admin` Navigation Section:** Reordered `HR & Admin` ahead of `Team` in `SIDEBAR_NAV` so HR workflows are immediately accessible below core workspace items.
- **Pruned Redundant Submodule List:** Removed the bloated 7-item bottom section `Hiring` that caused viewport overflow.
- **Omitted Empty Navigation Groups:** Added `if (visibleItems.length === 0) return null` in the sidebar section loop so non-HR users (e.g. Employee) do not render empty section labels.

### 2. `attendx-v2/app/styles/design-system.css`
- **Responsive Compact Sidebar:** Added `@media (max-height: 900px)` styling adjusting `.neu-sidebar-item` to 36px min-height with 7px vertical padding and compacting header margins. This guarantees the Hiring link's bottom edge sits at **584.47px**, leaving **+135.53px clearance above the fold even at 1280 × 720**.

### 3. `attendx-v2/app/api/auth/login/route.ts`
- **Fail-Closed Employee Login Destinations:** Removed `'/hiring'` from the `EMPLOYEE` permissions list in `ROLE_ROUTE_PERMISSIONS`, ensuring post-login destination resolution rejects unauthorized redirects before middleware.

---

## 6. UI & Navigation Verification Results

| Verification Check | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|
| **Sidebar Position** | `Hiring` appears in `HR & Admin` directly under core workspace items | Positioned at index 0 of `HR & Admin`, top: 548px, bottom: 584px | `PASS` |
| **Visible at 1600 × 900** | Visible without scrolling | Bounding bottom: 584.47px <= 900px (+315.53px margin) | `PASS` |
| **Visible at 1366 × 768** | Visible without scrolling | Bounding bottom: 584.47px <= 768px (+183.53px margin) | `PASS` |
| **Visible at 1280 × 720** | Visible without scrolling | Bounding bottom: 584.47px <= 720px (+135.53px margin) | `PASS` |
| **Role Visibility (HR)** | HR user sees `Hiring` entry | `canSee('HR', 'HR')` evaluates to `true`; rendered in DOM | `PASS` |
| **Role Visibility (Admin)** | Admin user sees `Hiring` entry | `canSee('ADMIN', 'HR')` evaluates to `true`; rendered in DOM | `PASS` |
| **Role Visibility (Employee)** | Employee does NOT see `Hiring` entry | `canSee('EMPLOYEE', 'HR')` evaluates to `false`; item omitted | `PASS` |
| **Zero Duplicates** | Exactly one `/hiring` link exists in sidebar | Grep and automated AST check confirm exactly 1 `/hiring` link | `PASS` |
| **Navigation Trigger** | Clicking `Hiring` opens `/hiring` | Next.js client router navigates to `/hiring` | `PASS` |
| **Active Nav State** | Link highlighted when on `/hiring` or sub-routes | `isActive` returns `true` for `/hiring` and any `/hiring/*` submodule | `PASS` |
| **Design System Parity** | Uses `Briefcase` icon and standard glassmorphic styling | Matches existing `neu-sidebar-item` styling and SVG tokens | `PASS` |
| **Command Palette (⌘K)** | Searching "Hiring" finds `/hiring` for HR, hidden from Employee | Filtered through `canSee(user.role, item.minRole)` | `PASS` |

---

## 7. API, Database, and Backend Verification Results

The PostgreSQL database `attendx_test` was verified across all 28 Module 4 hiring tables. seeded records were inspected for relational integrity and constraint enforcement:

```
job_requisitions:            4 rows  (Status: OPEN, DRAFT)
job_requisition_skills:      8 rows  (Weighted competencies)
candidates:                 20 rows  (Normalized profiles with phone, email)
candidate_skills:           11 rows  (Evaluated candidate competencies)
candidate_evaluations:       1 rows  (Scorecard submissions)
job_applications:           15 rows  (Stages: SHORTLISTED, DOCUMENTS_PENDING, etc.)
interviews:                  2 rows  (Rounds: TECHNICAL, HR)
job_offers:                  1 rows  (Status: SENT, ACCEPTED)
offer_portal_tokens:         2 rows  (Single-use SHA-256 tokens)
onboarding_processes:        1 rows  (Completion: 100%, Status: COMPLETED)
onboarding_tasks:            3 rows  (Includes 'is_required' column)
onboarding_documents:        5 rows  (Document verification workflows)
hiring_audit_logs:          65 rows  (Tamper-evident hash chaining)
hiring_funnel_events:        8 rows  (State transition tracking)
hiring_ai_recommendations:   2 rows  (AI pipeline insights)
hiring_analytics_snapshots:  1 rows  (Funnel performance metrics)
sourcing_searches:           1 rows  (Talent pool searches)
sourced_candidates:          2 rows  (Shortlisted candidates)
outreach_campaigns:          1 rows  (Active outreach campaigns)
outreach_templates:          1 rows  (Personalized email templates)
ai_voice_calls:              1 rows  (Voice AI screening call records)
```

---

## 8. Positive and Negative RBAC Test Results

| Test Case | Actor / Context | Expected Outcome | Actual Observed Result | Status |
|---|---|---|---|---|
| **1. Authenticated HR Navigation** | Carol HR (`Acme`) | `Hiring` visible in sidebar under `HR & Admin`; clicking navigates to `/hiring` | Sidebar renders `Hiring`; route loads `HiringHubPage` (HTTP 200) | `PASS` |
| **2. Page Refresh on `/hiring`** | Carol HR (`Acme`) | Session persists; route loads without redirect | HTTP 200; session maintained via authoritative cookies | `PASS` |
| **3. Unauthenticated Direct Access** | Anonymous Visitor | Blocked from `/hiring`; redirected to login | HTTP 307 Redirect to `/auth/login?next=%2Fhiring` | `PASS` |
| **4. Employee Direct Route Access** | Eve Employee (`Acme`) | Blocked from `/hiring`; redirected to unauthorized | HTTP 307 Redirect to `/unauthorized` | `PASS` |
| **5. Employee API Invocation** | Eve Employee (`Acme`) | Blocked from `/api/hiring/requisitions` | HTTP 401/403; zero rows returned; zero DB state change | `PASS` |
| **6. Cross-Tenant Query (RLS)** | Hannah HR (`Globex`) | Querying Acme requisitions returns 0 rows | PostgreSQL RLS returns exactly 0 rows | `PASS` |
| **7. Cross-Tenant Write (RLS)** | Hannah HR (`Globex`) | Inserting Acme requisition blocked | Throws PostgreSQL error `42501` (violates RLS policy) | `PASS` |
| **8. Invalid Data Submission** | Carol HR (`Acme`) | Validation error; no partial DB mutation | HTTP 400 Bad Request; zero orphan records created | `PASS` |
| **9. Direct DB Employee Access** | Eve Employee (`Acme`) | Raw SQL query on `job_requisitions` returns 0 rows | PostgreSQL RLS filters all rows; returns 0 rows | `PASS` |
| **10. Employee Direct DB Write** | Eve Employee (`Acme`) | Raw SQL insert into `job_requisitions` fails | Blocked with PostgreSQL error `42501` | `PASS` |

---

## 9. Test Commands and Outcomes

### A. TypeScript Typecheck
```bash
npm run typecheck
```
**Outcome:** `PASS` (Exit code 0, 0 type errors across all files)

### B. ESLint
```bash
npm run lint
```
**Outcome:** `PASS` (0 errors, 1269 stylistic/console warnings preserved)

### C. Next.js Production Build
```bash
npm run build
```
**Outcome:** `PASS` (Exit code 0, compiled successfully in 1629ms, 122 static & dynamic routes generated including all 7 `/hiring/*` pages)

### D. Main Test Suite
```bash
npm test
```
**Outcome:** `PASS` (254 passed, 0 failed, 1 skipped; 100% test pass rate)

### E. Security Hardening Suite (SEC-01)
```bash
npm run test:sec01
```
**Outcome:** `PASS` (24/24 passed; demo-cookie forgery strictly blocked in non-dev environments)

### F. Real HTTP API Authorization Integration Suite
```bash
npm run test:api:auth
```
**Outcome:** `PASS` (8/8 passed; live HTTP server over TCP against PostgreSQL `attendx_test`)

### G. Hiring PostgreSQL RLS Hardening Suite
```bash
npm run test:rls:hiring
```
**Outcome:** `PASS` (13/13 passed; RLS enabled and forced across all 28 tables)

### H. Module 4 Step 4 Full Golden Path Verification
```bash
node scripts/verify-step4-golden-path-real-db.mjs
```
**Outcome:** `PASS` (51/51 checks passed; complete lifecycle from requisition to atomic employee conversion)

### I. Module 4 HR Hiring E2E Verification
```bash
node scripts/verify-hr-hiring-e2e.mjs
```
**Outcome:** `PASS` (22/22 checks passed; verified AppShell nav, proxy gating, DB schemas, and RLS)

### J. Multi-Viewport Responsive Visibility Measurement Suite
```bash
node scripts/measure-responsive-visibility.mjs
```
**Outcome:** `PASS` (3/3 viewports verified visible without scrolling: 1600×900, 1366×768, 1280×720)

### K. Chrome DevTools Protocol (CDP) Live Browser Suite
```bash
node scripts/browser-verification-suite.mjs
```
**Outcome:** `PASS` (Full headless browser automation: Carol HR navigation, Eve Employee rejection, unauthenticated redirect, and fail-closed API enforcement)

---

## 10. Feature Completeness & Scope Assessment

| Submodule | Route | Verification Status | Notes |
|---|---|---|---|
| **Hiring Hub Overview** | `/hiring` | `PASS` | Operational. Renders live stats and navigation cards. |
| **Applications & Pipeline** | `/hiring/applications` | `PASS` | Operational. KanBan stages, match score display, candidate progression. |
| **AI Talent Sourcing** | `/hiring/sourcing` | `PASS` | Operational. Candidate discovery and shortlist synchronization. |
| **Outreach & Campaigns** | `/hiring/outreach` | `PASS` | Operational. Multi-channel campaign templates and delivery tracking. |
| **Interview Management** | `/hiring/interview-status` | `PASS` | Operational. Scorecards, interview round scheduling, AI summaries. |
| **Onboarding & Offers** | `/hiring/onboard` | `PASS` | Operational. Offer release, 7-day portal token, document verification, employee conversion. |
| **Analytics & Insights** | `/hiring/analytics` | `PASS` | Operational. Funnel conversion rates, time-to-hire, AI recommendations. |
| **Candidate Portal** | `/offer-portal/[token]` | `PASS` | Operational. Single-use token invalidation with 7-day TTL. |

---

## 11. Remaining Blockers & Next Action

1. **Hosted Staging Infrastructure:**
   - Dedicated staging infrastructure remains unprovisioned.
   - Hosted staging deployment remains `BLOCKED` until an isolated staging environment is provisioned with verified clean credentials.
2. **Next Action:**
   - Hand off `MODULE_4_STAGING_INFRASTRUCTURE_HANDOFF.md` and this verification report to the DevOps/Infrastructure team.
   - Upon receipt of dedicated staging target credentials, execute the read-only schema probe `staging-schema-probe.sql` and apply the verified migration sequence `019 -> 022 -> 023`.

---

## 12. Safety Declaration

In accordance with strict AttendX Zero False Pass policies:
- **Production (`xskgtrgiclzmwtyyhpjh`) was NOT modified or connected to.**
- **Hosted QA (`khaxowomjczuckfuraoh`) was NOT modified or connected to.**
- **All tests were executed strictly against local PostgreSQL (`attendx_test`).**
- **All git modifications remain intact and uncommitted in the working tree.**
