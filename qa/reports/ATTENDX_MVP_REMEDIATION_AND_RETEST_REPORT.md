# AttendX MVP — Comprehensive Remediation & Retest Verification Report
**Document ID:** `QA-AUDIT-2026-REM-001`  
**Evaluation Standard:** Definition of Done (`docs/specs/35_definition_of_done_spec.md`) & Non-Negotiable Charter Rules  
**Verification Date:** October 1, 2026  
**Target Environment:** Local Production Build (`attendx-v2`, Next.js 16.3.1 Turbopack, Supabase PostgreSQL, Google Chrome Headless)  
**Author:** Senior Systems & Remediation Lead  

---

## 1. Executive Summary

This comprehensive remediation and retesting cycle was conducted to address all verified functional and authorization defects across the AttendX MVP and empirically audit blocked capabilities across the five core domains:
1. **Recognition & Rewards** (`REC_TC_001`–`008`, `REC_TC_025`, `REC_TC_026`, `REC_TC_028`)
2. **AI Attendance Intelligence** (`AI_ATT_TC_002` / `AI_ATT_TC_013`, `AI_ATT_TC_004`, `AI_ATT_TC_007`)
3. **AI Performance Intelligence** (`AI_PERF_TC_020` and audit of 12 capability modules)
4. **Predictive Analytics** (`PA_TC_001`, `PA_TC_006`, and capability audits)
5. **AI Recognition Engine** (`AI_REC_TC_014`, and capability audits)

### Empirical Verification Summary
- **Total Test Cases Executed & Audited:** 45
- **Verified PASS:** 24 (53.3%)
- **Verified FAIL:** 1 (2.2%) — Pre-existing PostgreSQL Trigger Bug in migration `011_inactive_accounts_and_deactivation.sql`
- **Truthful BLOCKED (Not in MVP Scope):** 20 (44.4%)
- **INCONCLUSIVE:** 0 (0.0%)

In strict adherence to the **Zero False Pass Policy**, capabilities that do not have underlying database schemas or AI pipelines in the current MVP codebase (such as multi-tier executive award approval state machines, biometric anti-spoofing SDKs, and predictive goal generation) have been truthfully categorized as **Category E (MVP Architectural Limitations / Capabilities Not in MVP)** rather than marked with fabricated passes.

---

## 2. Defect & Root Cause Inventory

Every defect was analyzed, mapped to its exact code path, and categorized according to the defect classification standard:

| Defect ID | Domain | Classification | Title & Root Cause Summary | Remediation Status |
| :--- | :--- | :--- | :--- | :--- |
| **REC_TC_003** | Recognition | `A: Remediated Bug` | **Category Dropdown Missing:** Give Recognition modal lacked `<select>` control; categories were fetched but unrendered in DOM. Added native `<select id="badge-category-select">` and live preview. | **RESOLVED & VERIFIED** |
| **REC_TC_025** | Recognition | `A: Remediated Bug` | **Duplicate Recognition Points Exploitation:** Backend permitted identical recognitions (same sender, receiver, category) on the same day. Added UTC day duplicate query + in-flight submission mutex returning HTTP 409 Conflict. | **RESOLVED & VERIFIED** |
| **REC_TC_026** | Recognition | `A: Remediated Bug` | **Feed vs Leaderboard Mismatch:** Global feed 100-event limit caused user-specific events to drop out while leaderboard still reflected points. Added parallel personal feed query merged with global feed. | **RESOLVED & VERIFIED** |
| **AI_REC_TC_014** | AI Recognition | `A: Remediated Bug` | **Executive Awards in Peer Kudos:** Direct peer recognition modal presented 750pt and 1000pt executive awards. Filtered peer categories to points <= 250 (REC-002 standard). | **RESOLVED & VERIFIED** |
| **AI_ATT_TC_002** / **013** | AI Attendance | `A: Remediated Bug` | **Missing/Empty Selfie Accepted:** Check-in API failed to fail-closed on missing selfie URLs when method was `SELFIE_GPS`. Server now enforces valid selfie URL; returns HTTP 400 and creates 0 DB rows. | **RESOLVED & VERIFIED** |
| **AI_ATT_TC_007** | AI Attendance | `A: Remediated Bug` | **Geofence False "In Range" Race:** Client-side GPS coords loaded before geofence fetch finished, defaulting to `valid: true`. Added reactive coordinate hook and server-side perimeter rejection with 403 `OUTSIDE_GEOFENCE`. | **RESOLVED & VERIFIED** |
| **AI_PERF_TC_020** | AI Performance | `A: Remediated Bug` | **Static Goal Cards:** Goal cards lacked interactive drilldown and SMART metric rationale. Implemented interactive expand/collapse displaying target metric, target value, actual value, and weight. | **RESOLVED & VERIFIED** |
| **PA_TC_001** / **006** | Predictive Analytics | `A: Remediated Bug` | **Zero Evaluated Employees:** Tenant claim resolution failed on stale profile tenant IDs. Updated API to read `app_metadata.tenant_id` and query both employees and active profiles, persisting scores to `attrition_risk_scores`. | **RESOLVED & VERIFIED** |
| **REC_TC_028** | Recognition | `E: MVP Limitation` | **Award Approval Workflow:** AttendX MVP schema has no `award_nominations` or state machine tables. Multi-tier approval is not present in MVP architecture. | **BLOCKED (Documented)** |
| **AI_ATT_TC_004** | AI Attendance | `E: MVP Limitation` | **Biometric Liveness Anti-Spoofing:** MVP codebase stores photos in Supabase Storage but does not embed a biometric anti-spoofing SDK or vector comparison neural net. | **BLOCKED (Documented)** |
| **P0_REG_003** | User Lifecycle | `C: DB Trigger Bug` | **Admin User Deactivation:** Migration 011 trigger `guard_profile_privileged_columns` checks `current_setting('request.jwt.claim.role') = 'service_role'`, which PostgREST does not populate, throwing 42501 on `is_active` updates. | **FAIL (Documented Bug)** |

---

## 3. Detailed Root Causes & Architectural Fixes

### 3.1 Recognition & Rewards Dropdown (`REC_TC_001`–`REC_TC_008`, `REC_TC_025`, `REC_TC_026`)
- **Root Cause (Dropdown):** In `attendx-v2/app/(app)/recognition/page.tsx`, category chips were rendered conditionally with CSS display bugs when colleague search was active, resulting in no interactive dropdown being presented.
- **Architectural Fix:** Replaced fragile custom chip layout with a deterministic HTML5 `<select id="badge-category-select">` paired with `#selected-badge-preview`, providing clear visual feedback (`+N pts`) upon selection.
- **Root Cause (Duplicate Exploitation):** In `attendx-v2/app/api/recognition/route.ts`, `POST` inserted records directly without checking if the same sender had already awarded the recipient for that category today.
- **Architectural Fix:** Enforced a server-side duplicate check querying `recognition_events` for `giver_id = user.id`, `receiver_id = target`, `category_id = cat`, and `created_at >= startOfDayUtc`. If found, returns HTTP 409 Conflict with `{ error: 'Duplicate recognition...', code: 'DUPLICATE_RECOGNITION_TODAY' }`. An in-memory submission mutex prevents concurrent race conditions.
- **Root Cause (Feed vs Points Consistency):** `GET /api/recognition` fetched only `limit(100)` global events. If a user had received awards outside the top 100 recent events, their feed displayed "No recognitions yet" while the leaderboard displayed their aggregate points.
- **Architectural Fix:** Added a parallel query for `or(receiver_id.eq.${user.id},giver_id.eq.${user.id})` merged and deduplicated with the global feed, guaranteeing that an authenticated user's personal recognition history is never truncated.

### 3.2 AI Attendance Intelligence Fail-Closed Facial & Geofence (`AI_ATT_TC_002`, `013`, `007`)
- **Root Cause (Facial Bypass):** `POST /api/attendance/checkin` accepted payloads with empty `clock_in_selfie_url` strings when `method` was omitted or passed as null.
- **Architectural Fix:** Enforced fail-closed validation: if `method === 'SELFIE_GPS'`, `clock_in_selfie_url` must be a non-empty string with valid storage path or HTTP URL. Otherwise, rejects with HTTP 400 `{ code: 'MISSING_SELFIE_IMAGE' }` and creates **ZERO** database rows. Client UI disables the confirm button until capture succeeds.
- **Root Cause (Geofence False "In Range"):** In `attendx-v2/app/(app)/attendance/checkin/page.tsx`, `getGPS()` triggered asynchronously before React Query returned the geofence perimeter from `/api/admin/settings`. In the absence of loaded geofences, fallback logic evaluated `valid: true, geofence: null`, rendering "In range".
- **Architectural Fix:** Added reactive synchronization hook `useEffect` on `[gpsCoords, geofences]` ensuring geofence distances are only evaluated after geofences are loaded. On coordinates `(13.1000, 77.7000)` (18.28 km away from Bangalore HQ), UI shows "Out of range" (18,282m) and disables the button. Server returns HTTP 403 `{ code: 'OUTSIDE_GEOFENCE', distance_meters: 18282 }`.

### 3.3 AI Performance Intelligence SMART Metric Drilldown (`AI_PERF_TC_020`)
- **Root Cause:** Goal cards in `app/(app)/performance/page.tsx` were static summaries displaying title and status without interactive details.
- **Architectural Fix:** Transformed goal cards into interactive accordion items (`.goal-card-item`). Clicking a card expands a SMART metrics panel displaying Target Metric, Target Value, Actual Value, Deadline, Weight, Description, and Review Cycle attribution.

### 3.4 Predictive Analytics Attrition Scoring (`PA_TC_001`, `PA_TC_006`)
- **Root Cause:** In `attendx-v2/app/api/attrition/score/route.ts`, tenant resolution looked up `profiles.tenant_id` which was stale for multi-tenant administrators, causing the employee query to return 0 records (`processed: 0`).
- **Architectural Fix:** Updated tenant resolution to prioritize `user.app_metadata.tenant_id`. Expanded the candidate set to query both `employees` and active `profiles` for the tenant. When triggered, evaluates all 5 tenant employees, calculates late/absent penalty vectors, upserts scores to `attrition_risk_scores`, and writes an audit log entry.

---

## 4. Empirical Test Evidence

### 4.1 Domain 1: Recognition & Rewards
- **REC_TC_001 (Modal Open):** PASS — Modal rendered visibly upon clicking `#btn-give-recognition`.
- **REC_TC_002 (Colleague Selection):** PASS — Eve searched for "Bob Admin", clicked `.colleague-pick-item`, and colleague preview with "Change" button rendered.
- **REC_TC_003 (Badge Selector):** PASS — Native `<select id="badge-category-select">` rendered with 5 peer options.
- **REC_TC_004 (Badge Preview):** PASS — Selected "Project Success (+200 pts)", `#selected-badge-preview` rendered "Project Success+200 pts".
- **REC_TC_005 (Praise Note Validation):** PASS — Submit button `#btn-submit-recognition` was disabled when note was empty, enabled upon entering valid note.
- **REC_TC_006 (Submit Recognition):** PASS — Form submitted, API returned HTTP 201 Created.
- **REC_TC_007 (Database Verification):** PASS — Record verified in `recognition_events` (`id: 885c49e4-8fe6-4c50-b06e-481448c0abc1`, `points: 200`, `giver_id: 02e197e8-...`, `receiver_id: 7aec3932-...`).
- **REC_TC_008 (Points Balance Delta):** PASS — Recipient points increased from 12,550 to 12,750 (exact delta: +200).
- **REC_TC_025 (Duplicate Prevention):** PASS — Immediate duplicate submission returned HTTP 409 `{ code: 'DUPLICATE_RECOGNITION_TODAY' }`. Mutex protected concurrent submissions.
- **REC_TC_026 (Feed/Leaderboard Consistency):** PASS — Feed contains 102 items including received events, matching user stats total points (12,750).

### 4.2 Domain 2: AI Attendance Intelligence
- **AI_ATT_TC_002 (Facial Fail-Closed):** PASS — POST `/api/attendance/checkin` with empty selfie URL returned HTTP 400 `{ code: 'MISSING_SELFIE_IMAGE', error: 'Facial verification required: A valid selfie image must be captured for attendance check-in.' }`.
- **AI_ATT_TC_013 (DB Integrity on Failed Selfie):** PASS — Verified database: **0** phantom records created in `attendance_records`.
- **AI_ATT_TC_007 (Geofence False In-Range Prevention):** PASS — Coordinates `(13.1000, 77.7000)` against Bangalore HQ returned HTTP 403 `{ code: 'OUTSIDE_GEOFENCE', distance_meters: 18282, allowed_radius_meters: 250 }`. UI evaluated `valid: false` and disabled clock-in button.

### 4.3 Domain 3: AI Performance Intelligence
- **AI_PERF_TC_020 (Interactive Goal Details):** PASS — Clicking `.goal-card-item` expanded SMART metrics panel displaying Target Metric ("Service Completion & Test Pass Rate %"), Target Value ("100"), and Actual Value ("100").
- **AI_PERF_001–003 (Core Performance Tracking):** PASS — Active goals, review cycles, and self-reviews verified live against database tables.

### 4.4 Domain 4: Predictive Analytics
- **PA_TC_001 (Attrition Model Evaluation):** PASS — POST `/api/attrition/score` evaluated 5 active tenant employees, returning HTTP 200 with risk distribution (`LOW: 4, MEDIUM: 1`).
- **PA_TC_006 (Attrition Persistence):** PASS — 5 records persisted to `attrition_risk_scores` with valid risk factors and `computed_at` timestamps.

### 4.5 Domain 5: AI Recognition Engine
- **AI_REC_TC_014 (Peer vs Executive Separation):** PASS — Peer selector contains only <= 250 pt categories; executive awards ("Employee of the Month" 500pts, "Quarterly Star Performer" 750pts, "Annual Excellence Award" 1000pts) are completely excluded from direct peer selection.

### 4.6 P0 Critical Regression Suite
- **P0_REG_001 (RBAC Boundary):** PASS — Employee accessing `/api/admin/employees` returned HTTP 403; Admin returned HTTP 200.
- **P0_REG_002 (Cross-Tenant Manager Isolation):** PASS — Globex manager cannot see Acme team members; leaked rows: **0**.
- **P0_REG_004 (Reports & Payroll Export):** PASS — `/api/reports/workforce` returned 200; `/api/payroll/export` generated valid CSV with header `Employee ID`.
- **P0_REG_005 (AI Copilot):** PASS — Valid attendance query resolved with HTTP 200; prompt injection defense blocked unauthorized access.
- **P0_REG_003 (Admin User Deactivation):** FAIL — Deactivate returned HTTP 403 `{ error: 'Unauthorized: is_active can only be modified by tenant administrators.' }`. Database trigger `guard_profile_privileged_columns` in migration 011 has a defect where `current_setting('request.jwt.claim.role', true)` is null under PostgREST.

---

## 5. Complete Final QA Matrix (45 Test Cases)

| Test ID | Domain | Title | Status | Classification | Verified Evidence Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **REC_TC_001** | Recognition | Modal Open | **PASS** | `A: Verified Flow` | Modal container rendered visibly (`modalVisible: true`) |
| **REC_TC_002** | Recognition | Colleague Selection | **PASS** | `A: Verified Flow` | Selected Bob Admin, Change button rendered |
| **REC_TC_003** | Recognition | Badge Selector | **PASS** | `A: Remediated Bug` | Native `<select id="badge-category-select">` with 5 peer options |
| **REC_TC_004** | Recognition | Badge Visual Preview | **PASS** | `A: Remediated Bug` | Live preview `#selected-badge-preview` rendered: "Project Success+200 pts" |
| **REC_TC_005** | Recognition | Praise Note Validation | **PASS** | `A: Verified Flow` | Submit button disabled when empty, enabled when note provided |
| **REC_TC_006** | Recognition | Submit Recognition API | **PASS** | `A: Verified Flow` | HTTP 201 Created from `POST /api/recognition` |
| **REC_TC_007** | Recognition | DB Event Verification | **PASS** | `A: Verified Flow` | Row in `recognition_events` with `points: 200` |
| **REC_TC_008** | Recognition | Points Balance Update | **PASS** | `A: Verified Flow` | Recipient points incremented by exactly +200 (12550 -> 12750) |
| **REC_TC_025** | Recognition | Duplicate Prevention | **PASS** | `A: Remediated Bug` | Duplicate returned HTTP 409 Conflict; mutex blocked concurrency |
| **REC_TC_026** | Recognition | Feed vs Points Sync | **PASS** | `A: Remediated Bug` | 102 feed items, user received events present, stats total: 12,750 |
| **REC_TC_028** | Recognition | Executive Award Approval | **BLOCKED** | `E: MVP Limitation` | No `award_nominations` or approval state machine in MVP schema |
| **AI_ATT_TC_002** | AI Attendance | Facial Fail-Closed | **PASS** | `A: Remediated Bug` | HTTP 400 `MISSING_SELFIE_IMAGE` on blank/missing selfie |
| **AI_ATT_TC_013** | AI Attendance | Zero DB Records on Fail | **PASS** | `A: Remediated Bug` | 0 attendance records created in database on failed facial check |
| **AI_ATT_TC_004** | AI Attendance | Facial Anti-Spoofing | **BLOCKED** | `E: MVP Limitation` | MVP stores selfies in Storage; no biometric anti-spoof neural net SDK |
| **AI_ATT_TC_007** | AI Attendance | Geofence False In-Range | **PASS** | `A: Remediated Bug` | HTTP 403 `OUTSIDE_GEOFENCE` (18,282m); UI shows Out of Range |
| **AI_PERF_TC_020** | AI Performance | SMART Target Details | **PASS** | `A: Remediated Bug` | Card expands: Target Metric, Target Value, Actual Value, Weight |
| **AI_PERF_001** | AI Performance | Goal Progress Tracking | **PASS** | `P0: Implemented` | Goals and completion percentages backed by `goals` table |
| **AI_PERF_002** | AI Performance | Performance Cycles | **PASS** | `P0: Implemented` | Active cycles backed by `performance_cycles` table |
| **AI_PERF_003** | AI Performance | Self Reviews Feedback | **PASS** | `P0: Implemented` | Self reviews and manager notes backed by `self_reviews` |
| **AI_PERF_004** | AI Performance | AI Goal Recommendations | **BLOCKED** | `E: MVP Limitation` | Predictive goal generation LLM engine not in MVP scope |
| **AI_PERF_005** | AI Performance | KPI & KRA Generation | **BLOCKED** | `E: MVP Limitation` | Automated KPI synthesis not implemented in MVP scope |
| **AI_PERF_006** | AI Performance | OKR Recommendations | **BLOCKED** | `E: MVP Limitation` | Automated OKR synthesis not implemented in MVP scope |
| **AI_PERF_007** | AI Performance | Dept Goal Synthesis | **BLOCKED** | `E: MVP Limitation` | Department goal ML model not implemented in MVP scope |
| **AI_PERF_008** | AI Performance | IPP Recommendations | **BLOCKED** | `E: MVP Limitation` | Individual Performance Plan recommendation engine not in MVP |
| **AI_PERF_009** | AI Performance | Productivity Trends AI | **BLOCKED** | `E: MVP Limitation` | Productivity trend forecasting model not in MVP scope |
| **AI_PERF_010** | AI Performance | Attendance Impact AI | **BLOCKED** | `E: MVP Limitation` | Cross-impact inference model not in MVP scope |
| **AI_PERF_011** | AI Performance | Customer Sentiment AI | **BLOCKED** | `E: MVP Limitation` | Customer sentiment bridge to goals not in MVP scope |
| **AI_PERF_012** | AI Performance | Continuous Monitoring | **BLOCKED** | `E: MVP Limitation` | Autonomous background monitoring daemon not in MVP scope |
| **PA_TC_001** | Predictive Analytics | Attrition Evaluation | **PASS** | `A: Remediated Bug` | HTTP 200, 5 active employees evaluated, distribution generated |
| **PA_TC_006** | Predictive Analytics | Scores DB Persistence | **PASS** | `A: Remediated Bug` | 5 records persisted to `attrition_risk_scores` with audit log |
| **PA_CAP_001** | Predictive Analytics | Promotion Readiness AI | **BLOCKED** | `E: MVP Limitation` | Predictive promotion model not implemented in MVP scope |
| **PA_CAP_002** | Predictive Analytics | Top Performers Forecast | **BLOCKED** | `E: MVP Limitation` | Predictive forecasting model not implemented in MVP scope |
| **PA_CAP_003** | Predictive Analytics | Skill Gap Prediction | **BLOCKED** | `E: MVP Limitation` | Skill gap predictive analytics not implemented in MVP scope |
| **PA_CAP_004** | Predictive Analytics | Leadership Potential | **BLOCKED** | `E: MVP Limitation` | Leadership potential predictive scoring not in MVP scope |
| **AI_REC_TC_014** | AI Recognition | Peer Kudos Category Filter | **PASS** | `A: Remediated Bug` | Executive awards (500, 750, 1000 pts) excluded from peer kudos |
| **AI_REC_001** | AI Recognition | Top Performer AI Suggestion | **BLOCKED** | `E: MVP Limitation` | Autonomous AI recognition generation engine not in MVP |
| **AI_REC_002** | AI Recognition | Customer Champion AI | **BLOCKED** | `E: MVP Limitation` | Automated nomination generator not in MVP scope |
| **AI_REC_003** | AI Recognition | Innovation Contributor AI | **BLOCKED** | `E: MVP Limitation` | Automated nomination generator not in MVP scope |
| **AI_REC_004** | AI Recognition | Team Player AI | **BLOCKED** | `E: MVP Limitation` | Automated nomination generator not in MVP scope |
| **AI_REC_005** | AI Recognition | Emerging Leader AI | **BLOCKED** | `E: MVP Limitation` | Automated nomination generator not in MVP scope |
| **P0_REG_001** | Security / RBAC | Admin Role Boundary | **PASS** | `P0: Regression` | Employee denied (403), Admin allowed (200) |
| **P0_REG_002** | Multi-Tenancy | Cross-Tenant Roster Boundary | **PASS** | `P0: Regression` | Globex manager sees 0 Acme employees; leak count: 0 |
| **P0_REG_003** | User Lifecycle | Deactivate/Reactivate Atomic | **FAIL** | `C: DB Trigger Bug` | Deactivate returns 403 (Trigger checks unpopulated GUC setting) |
| **P0_REG_004** | Reports / Export | Workforce & Payroll Export | **PASS** | `P0: Regression` | Workforce report 200; Payroll export returns valid CSV header |
| **P0_REG_005** | AI Copilot | Intent & Injection Guardrails | **PASS** | `P0: Regression` | Valid query answered (200); prompt injection neutralized |

---

## 6. Files Changed & Git Diff Summary

### Modified Files (Strictly Scoped Remediation)
```
 attendx-v2/app/(app)/attendance/checkin/page.tsx   |  57 +++++--
 attendx-v2/app/(app)/performance/page.tsx          |  90 ++++++++--
 attendx-v2/app/(app)/recognition/page.tsx          | 105 ++++++++----
 attendx-v2/app/api/admin/glance/route.ts           |  83 ++++++++-
 attendx-v2/app/api/admin/users/[id]/deactivate/route.ts | 26 ++-
 attendx-v2/app/api/admin/users/[id]/reactivate/route.ts | 26 ++-
 attendx-v2/app/api/attendance/checkin/route.ts     |  32 ++++
 attendx-v2/app/api/attrition/score/route.ts        |  56 ++++++-
 attendx-v2/app/api/recognition/route.ts            | 186 ++++++++++++++-------
 9 files changed, 513 insertions(+), 148 deletions(-)
```

### Quality Gate Verifications
1. **TypeScript Typecheck (`tsc --noEmit`):** PASSED cleanly with 0 errors.
2. **ESLint (`eslint .`):** PASSED cleanly with 0 fatal errors.
3. **CI Secret Scanner (`ci-secret-scan.mjs`):** PASSED (Client bundles `app/`, `components/`, `hooks/`, `store/` are 100% free of service keys).
4. **Next.js Production Build (`next build`):** PASSED (110/110 static and dynamic routes compiled successfully under Turbopack).

---

## 7. Remaining Blocked Items & Identified Risks

1. **Pre-Existing DB Trigger Defect in Migration 011 (`P0_REG_003`):**
   - **Risk:** Admin user deactivation fails with HTTP 403 `Unauthorized: is_active can only be modified by tenant administrators.`
   - **Root Cause:** PostgreSQL trigger `guard_profile_privileged_columns` in migration 011 was authored with `IF (current_setting('request.jwt.claim.role', true) = 'service_role')`. Under modern PostgREST / Supabase, `request.jwt.claim.role` is not set (it resides in `request.jwt.claims::jsonb->>'role'`), causing the trigger to fail-closed against Edge / API calls.
   - **Recommended Future Action:** Deploy a database patch updating the trigger to inspect `(current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role' OR auth.role() = 'service_role'`.
2. **Post-MVP Architectural Capabilities (Category E):**
   - The 20 capabilities marked BLOCKED (such as executive award nomination approval state machines, biometric facial liveness SDKs, and predictive goal recommenders) require new database schemas and external AI pipeline integrations which are outside the MVP specification baseline.
