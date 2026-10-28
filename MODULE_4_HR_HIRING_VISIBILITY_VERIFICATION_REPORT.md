# AttendX Module 4 — HR Hiring Visibility Verification Report

**Author:** Senior Full-Stack Engineer, Application Security Engineer & QA Lead  
**Date:** October 14, 2026  
**Status:** `VERIFIED & OPERATIONAL`  
**Classification:** Pre-Staging Verification & Navigation Remediation Gate  
**Reference Specs:** Docs/Specs 14 (Scope D RBAC), 19 (Hiring Schema), 22 (Onboarding), 23 (RLS Hardening), 35 (Definition of Done)

---

## 1. Repository Identity and Branch Verification

A comprehensive inspection of local clones was performed to establish and confirm the correct repository:

```bash
$ pwd
/Users/nanthithavenkatachapathy/attendxnew/AttendX

$ git rev-parse --show-toplevel
/Users/nanthithavenkatachapathy/attendxnew/AttendX

$ git remote -v
origin  https://github.com/saastadev/AttendX.git (fetch)
origin  https://github.com/saastadev/AttendX.git (push)

$ git branch --show-current
feat/hiring-module-implementation
```

### Clone Comparison & Validation

Two distinct clones exist on the local workstation:
1. **`/Users/nanthithavenkatachapathy/attendx/AttendX` (Old/Legacy Clone)**:
   - Remote: `https://github.com/Saasta-Software-Services/AttendX.git` (branch `main`).
   - Contents: Legacy v1 architecture consisting of Go backend microservices (`services/ai-service`, `services/attendance-service`, etc.) and a Flutter mobile app (`mobile/`).
   - Does **NOT** contain the Next.js web application or the dashboard depicted in the user screenshot.
2. **`/Users/nanthithavenkatachapathy/attendxnew/AttendX` (Active/Correct Clone)**:
   - Remote: `https://github.com/saastadev/AttendX.git` (branch `feat/hiring-module-implementation`).
   - Contents: The contemporary AttendX v2 web application in `attendx-v2/` (Next.js 16.3.1, Turbopack, Tailwind CSS, Lucide icons, Supabase auth/data layer).
   - Serves the exact UI shown in the screenshot at `http://localhost:3000/dashboard`, featuring Carol HR, workspace items (Dashboard, Attendance, Leave, Performance, Employee 360°, Recognition, Cases, Notifications, HR Copilot), Team, and HR & Admin.

**Conclusion:** `/Users/nanthithavenkatachapathy/attendxnew/AttendX` is positively verified as the authentic codebase matching the reported issue.

---

## 2. Evidence of Reproduction

The issue reported by Janaki from Saasta (*"I have pulled the code but hiring model is not visible. I logged in as HR"*) was reproduced against the local application at `http://localhost:3000`:

1. **Authenticated Context:** Logged in with Carol HR (`hr@acme-tech.com`, role `HR`, Acme Tech tenant `11111111-0000-0000-0000-000000000001`).
2. **Dashboard Visual State:** The dashboard rendered at `http://localhost:3000/dashboard`.
3. **Sidebar Navigation Inspection:**
   - The visible navigation menu displayed: `Dashboard`, `Attendance`, `Leave`, `Performance`, `Employee 360°`, `Recognition`, `Cases`, `Notifications`, `HR Copilot`, `My Team`, `Approvals`, `Directory`, and `Insights`.
   - **Hiring / Talent Acquisition was completely absent from the HR & Admin section.**
4. **Scroll Container Inspection:**
   - An ad-hoc bottom section named `Hiring` containing 7 submodule links (`Overview`, `Applications`, `AI Sourcing`, `Outreach`, `Interviews`, `Onboarding`, `Analytics`) had been placed at the very end of `SIDEBAR_NAV`.
   - Because 14 preceding menu items occupied vertical space, the bottom section's top coordinate was **826.64px** and its bottom coordinate was **873.03px**.
   - On common laptop viewports (1366 × 768 and 1280 × 720), this section was pushed **105px to 153px below the visible viewport**, clipped by `.neu-sidebar` (`overflow-y: auto`), making it completely invisible without scrolling.

---

## 3. Root Cause

1. **Missing Registration in `HR & Admin`:** [`AppShell.tsx`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/attendx-v2/components/layout/AppShell.tsx) defined `Directory` (`/hr/directory`), `Insights` (`/hr/insights`), `Sentiment` (`/hr/sentiment`), and Admin tools under `HR & Admin`, but lacked an entry for `Hiring`.
2. **Vertical Navigation Bloat & Viewport Clipping:** Appending 7 submodule links at the bottom of the sidebar caused excessive vertical height, pushing Hiring below the fold on all standard laptop displays.
3. **Hub Architecture Bypassed:** The application already possesses a centralized Hiring Hub page at `app/(app)/hiring/page.tsx` (`HiringHubPage`), rendering cards, live statistics, and links to all 6 submodules. Redundant submodule links in the sidebar created visual clutter and layout divergence.
4. **Permissive Post-Login Role Destination:** In [`login/route.ts`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/attendx-v2/app/api/auth/login/route.ts), `EMPLOYEE` permissions in `ROLE_ROUTE_PERMISSIONS` erroneously included `'/hiring'`.

---

## 4. Files Changed

Only non-destructive, targeted adjustments were made to resolve navigation and enforce fail-closed security:

| File | Status | Description of Change |
| :--- | :--- | :--- |
| [`attendx-v2/components/layout/AppShell.tsx`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/attendx-v2/components/layout/AppShell.tsx) | `MODIFIED` | 1. Registered `{ href: '/hiring', icon: Briefcase, label: 'Hiring', id: 'snav-hiring', minRole: 'HR' }` at index 0 of `HR & Admin`.<br>2. Reordered `HR & Admin` ahead of `Team` in `SIDEBAR_NAV`.<br>3. Removed redundant 7-item bottom section `Hiring`.<br>4. Added `if (visibleItems.length === 0) return null` to omit empty section headers. |
| [`attendx-v2/app/styles/design-system.css`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/attendx-v2/app/styles/design-system.css) | `MODIFIED` | Added `@media (max-height: 900px)` compact sidebar styling (`min-height: 36px`, `padding: 7px 20px`), positioning Hiring at `top: 548px`, `bottom: 584px` across all viewports. |
| [`attendx-v2/app/api/auth/login/route.ts`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/attendx-v2/app/api/auth/login/route.ts) | `MODIFIED` | Removed `'/hiring'` from `EMPLOYEE` permissions in `ROLE_ROUTE_PERMISSIONS`. |
| [`attendx-v2/tests/hiring-navigation-visibility.test.js`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/attendx-v2/tests/hiring-navigation-visibility.test.js) | `CREATED` | Unit test suite asserting navigation presence, `minRole: 'HR'`, zero duplicates, and RBAC ranking. |
| [`attendx-v2/scripts/measure-responsive-visibility.mjs`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/attendx-v2/scripts/measure-responsive-visibility.mjs) | `CREATED` | Automated Chrome CDP measurement script verifying bounding boxes and visibility across 1600×900, 1366×768, and 1280×720 viewports. |
| [`attendx-v2/scripts/browser-verification-suite.mjs`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/attendx-v2/scripts/browser-verification-suite.mjs) | `CREATED` | Full headless Chrome CDP verification suite testing HR navigation, Employee rejection, unauthenticated redirect, and API authorization. |

---

## 5. HR Navigation and Route Verification

### Multi-Viewport Geometric Measurements

Live DOM measurements captured at `window.scrollX === 0` and `sidebar.scrollTop === 0` via native Chrome DevTools Protocol:

| Viewport | Dimensions | Bounding Rectangle | Visible Without Scroll? | Parent Clipped? | Click Navigation | Clearance Above Fold |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| **1600 × 900** | 1600 × 900 | `top: 548.08px`, `bottom: 584.47px` | **YES (PASS)** | No | Navigates to `/hiring` | **+315.53px** |
| **1366 × 768** | 1366 × 768 | `top: 548.08px`, `bottom: 584.47px` | **YES (PASS)** | No | Navigates to `/hiring` | **+183.53px** |
| **1280 × 720** | 1280 × 720 | `top: 548.08px`, `bottom: 584.47px` | **YES (PASS)** | No | Navigates to `/hiring` | **+135.53px** |
| **Laptop Window (650px)** | 1366 × 650 | `top: 548.08px`, `bottom: 584.47px` | **YES (PASS)** | No | Navigates to `/hiring` | **+65.53px** |

### Functional UI Checks
- **Route Navigation:** Clicking the `Hiring` sidebar link successfully navigates to `http://localhost:3000/hiring`.
- **Hiring Hub Render:** Renders `H1: "Hiring & Talent Acquisition"`, active summary metrics (`Total Jobs: 1`, `Active Requisitions: 1`, `Candidates: 1`, `Interviews: 1`), and navigational cards to all 6 submodules (`applications`, `sourcing`, `outreach`, `interview-status`, `onboard`, `analytics`).
- **Session Persistence:** Hard refresh (`Page.reload`) at `/hiring` maintains valid HR session without redirects.
- **Active Navigation Indicator:** `isActive` correctly highlights the `Hiring` link when browsing `/hiring` or any sub-route.

---

## 6. API, Database, and Authorization Results

### Security & RBAC Boundary Enforcement

| Test Case | Identity / Context | Expected Outcome | Observed Result | Status |
| :--- | :--- | :--- | :--- | :---: |
| **HR Navigation** | Carol HR (`Acme`) | Visible under `HR & Admin`; clicking loads `/hiring` | Rendered; navigates to `HiringHubPage` | `PASS` |
| **Unauthenticated Direct Access** | Anonymous | Blocked from `/hiring`; redirected to login | HTTP 307 Redirect to `/auth/login?next=%2Fhiring` | `PASS` |
| **Employee Direct Access** | Eve Employee (`Acme`) | Blocked from `/hiring`; redirected to unauthorized | HTTP 307 Redirect to `/unauthorized` | `PASS` |
| **Employee Sidebar Access** | Eve Employee (`Acme`) | Hiring link hidden; empty headers omitted | **0** Hiring links in DOM; 0 empty headers | `PASS` |
| **Employee API Invocation** | Eve Employee (`Acme`) | Protected Hiring APIs reject unauthorized caller | **HTTP 403 Forbidden** | `PASS` |
| **Cross-Tenant RLS Read** | Hannah HR (`Globex`) | Querying Acme requisitions returns 0 rows | **0 rows returned** | `PASS` |
| **Cross-Tenant RLS Write** | Hannah HR (`Globex`) | Inserting Acme requisition blocked | **PostgreSQL Error 42501** | `PASS` |
| **Empty State Honesty** | Non-existent records | No fabricated cards or false metrics | Honest empty states rendered | `PASS` |

### Database Integrity Verification
All 28 Module 4 hiring tables verified active with forced Row-Level Security in local PostgreSQL `attendx_test`. Relational integrity confirmed across `job_requisitions` (4 rows), `candidates` (20 rows), `job_applications` (15 rows), `interviews` (2 rows), `job_offers` (1 row), `offer_portal_tokens` (2 rows), and `hiring_audit_logs` (65 rows).

---

## 7. Regression Test Outcomes

All verification suites were executed against the live application and database:

```bash
# 1. TypeScript Compilation
$ npm run typecheck
Outcome: PASS (0 errors)

# 2. ESLint Static Analysis
$ npx eslint --quiet
Outcome: PASS (0 errors)

# 3. Production Build
$ npm run build
Outcome: PASS (122 static & dynamic routes compiled in 1848ms)

# 4. Core Jest Test Suite
$ npm test
Outcome: PASS (254 passed, 0 failed, 1 skipped)

# 5. Real API Authorization Integration Suite
$ npm run test:api:auth
Outcome: PASS (8 / 8 passed)

# 6. SEC-01 Demo Cookie Hardening Suite
$ npm run test:sec01
Outcome: PASS (24 / 24 passed)

# 7. Hiring PostgreSQL RLS Hardening Suite
$ npm run test:rls:hiring
Outcome: PASS (13 / 13 passed)

# 8. Step 4 Golden Path Real-DB Verification
$ node scripts/verify-step4-golden-path-real-db.mjs
Outcome: PASS (51 / 51 passed)

# 9. HR Hiring End-to-End Verification
$ node scripts/verify-hr-hiring-e2e.mjs
Outcome: PASS (22 / 22 passed)

# 10. Multi-Viewport Responsive Visibility Suite
$ node scripts/measure-responsive-visibility.mjs
Outcome: PASS (3 / 3 viewports passed: 1600x900, 1366x768, 1280x720)

# 11. Chrome CDP Live Browser Suite
$ node scripts/browser-verification-suite.mjs
Outcome: PASS (All assertions passed)
```

---

## 8. Remaining Blockers & Staging Status

1. **Local Readiness:** **COMPLETE & VERIFIED.** The missing Hiring module is resolved, responsive across all viewports, fully functional, and strictly secured.
2. **Hosted Staging Deployment:** Remains **BLOCKED** pending provisioning of isolated staging infrastructure with verified clean credentials.
3. **Safety Declaration:** Production (`xskgtrgiclzmwtyyhpjh`) and Hosted QA (`khaxowomjczuckfuraoh`) were untouched. All changes remain preserved in the local working tree.
