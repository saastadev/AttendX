# AttendX Module 4 — Staging Environment Preparation & Deployment Plan

**Document ID:** `MODULE_4_STAGING_PREPARATION_AND_DEPLOYMENT_PLAN.md`  
**Execution Timestamp:** 2026-10-14T11:42:00+05:30  
**Target Git Branch:** `feat/hiring-module-implementation`  
**Author:** Antigravity Agentic SDLC Gatekeeper  
**Audit Protocol:** AttendX Engineering Rules Charter (Spec 34) & Definition of Done (Spec 35)  
**Status:** 📋 **PLANNING & PREPARATION COMPLETE — AWAITING DEDICATED STAGING ENVIRONMENT**

---

## 1. Executive Summary & Governance Preconditions

In accordance with the Module 4 Gate directives:
> *"Proceed with staging preparation and deployment planning only.*  
> *1. Preserve all current source changes and untracked files.*  
> *2. Document the staging prerequisites: dedicated Supabase project, staging web deployment, approved access, environment variables and secret configuration.*  
> *3. Do not invent credentials, provision external infrastructure without authorization, or modify the existing hosted QA or production database.*  
> *4. Prepare a read-only schema inventory covering all 28 Hiring tables and their dependencies.*  
> *5. Do not select migration 019 applicability based only on the existence of job_requisitions; inspect the complete expected schema.*  
> *6. Prepare the migration sequence and post-deployment test commands for the eventual staging environment.*  
> *7. Identify what the deployment administrator must configure and what evidence is still missing.*  
> *8. Do not execute hosted migrations, change RLS policies, deploy application code, or start Batch 3.*  
> *Return a staging-readiness checklist and stop until the dedicated staging environment is available."*

### Governance Commitments & Verification
- **Zero Fabrication (§34.1):** No placeholder or fictitious staging credentials have been created. Staging endpoints and credentials must be provisioned directly by an authorized infrastructure operator.
- **Fail-Closed Dual Security (§34.3 & §34.4):** Edge route guards (`attendx-v2/proxy.ts`), API handlers (`attendx-v2/app/api/hiring/`), and database Row Level Security (`023_hiring_rls_hardening.sql`) are aligned and independently verified.
- **Environment Isolation:** Zero mutations were executed against hosted Supabase (`khaxowomjczuckfuraoh`) or Production (`xskgtrgiclzmwtyyhpjh`). Staging must remain 100% physically isolated from both.
- **Working Tree Preservation:** All 23 modified source files, 5 untracked migration and test artifacts, and the new schema inventory probe script are preserved.

---

## 2. Source Changes & Untracked Files Inventory

The working tree on `feat/hiring-module-implementation` is strictly preserved with zero unstaged resets or deletions:

### 2.1 Preserved Code Changes (23 Modified Files)
1. **Edge Route Guard:**
   - [`attendx-v2/proxy.ts`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/attendx-v2/proxy.ts): Enforces Boundary 1 protection intercepting `EMPLOYEE` caller from `/hiring` (HTTP 307 redirect to `/unauthorized`).
2. **API Handlers (19 Route Files):**
   - Stripped `EMPLOYEE` and phantom `CANDIDATE` roles from `getAuthoritativeCaller` across all hiring routes:
     - `app/api/hiring/applications/route.ts`
     - `app/api/hiring/applications/[id]/route.ts`
     - `app/api/hiring/applications/pipeline/route.ts`
     - `app/api/hiring/candidates/route.ts`
     - `app/api/hiring/candidates/[id]/route.ts`
     - `app/api/hiring/requisitions/route.ts`
     - `app/api/hiring/requisitions/[id]/route.ts`
     - `app/api/hiring/requisitions/[id]/skills/route.ts`
     - `app/api/hiring/interviews/route.ts`
     - `app/api/hiring/interviews/[id]/route.ts`
     - `app/api/hiring/assessments/route.ts`
     - `app/api/hiring/assessments/[id]/route.ts`
     - `app/api/hiring/assessments/[id]/start/route.ts`
     - `app/api/hiring/assessments/[id]/submit/route.ts`
     - `app/api/hiring/voice/call/route.ts`
     - `app/api/hiring/voice/call/[id]/route.ts`
     - `app/api/hiring/screenings/route.ts`
     - `app/api/hiring/match-score/route.ts`
     - `app/api/hiring/onboarding/documents/route.ts`
3. **Database Seed & Security:**
   - [`supabase/seed/002_hiring_seed.sql`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/supabase/seed/002_hiring_seed.sql): 19 non-hex mnemonic UUIDs corrected to valid hexadecimal identifiers.
   - [`attendx-v2/tests/rbac-matrix.test.js`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/attendx-v2/tests/rbac-matrix.test.js): RBAC-11 hiring frontend route test.
   - [`attendx-v2/package.json`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/attendx-v2/package.json): Registered `test:rls:hiring` script.

### 2.2 Preserved Untracked Artifacts
- [`supabase/migrations/023_hiring_rls_hardening.sql`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/supabase/migrations/023_hiring_rls_hardening.sql): Complete RLS hardening migration.
- [`attendx-v2/tests/db/hiring-rls-hardening.test.js`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/attendx-v2/tests/db/hiring-rls-hardening.test.js): Real PostgreSQL RLS verification suite (13 tests).
- [`attendx-v2/tests/hiring-batch1-security-regression.test.mjs`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/attendx-v2/tests/hiring-batch1-security-regression.test.mjs): Security regression suite (105 tests).
- [`attendx-v2/scripts/staging-schema-probe.sql`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/attendx-v2/scripts/staging-schema-probe.sql): Read-only schema inventory and recommendation probe script.
- [`MODULE_4_BATCH_2_DATABASE_RLS_PREFLIGHT_REPORT.md`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/MODULE_4_BATCH_2_DATABASE_RLS_PREFLIGHT_REPORT.md): Batch 2 preflight report.
- [`MODULE_4_STAGING_DEPLOYMENT_REPORT.md`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/MODULE_4_STAGING_DEPLOYMENT_REPORT.md): Staging deployment gate report.

---

## 3. Staging Infrastructure Prerequisites

The deployment administrator must provision and verify the following targets prior to initiating staging deployment:

### 3.1 Dedicated Staging Supabase / PostgreSQL Instance
- **Dedicated Project:** A distinct Supabase project (e.g. `attendx-staging`) or PostgreSQL 15+ instance.
- **Physical Boundary:** Must not share PostgreSQL databases, connection pooling (`pgbouncer` / `supavisor`), GoTrue auth instances, or storage buckets with Production (`xskgtrgiclzmwtyyhpjh`) or Hosted QA (`khaxowomjczuckfuraoh`).
- **Required Extension Grants:** `uuid-ossp`, `pgcrypto` enabled.
- **Role Hierarchy:** Standard Supabase roles must exist (`postgres`, `authenticated`, `anon`, `service_role`).

### 3.2 Staging Web Application Deployment Target
- **Isolated Host:** Web application deployment accessible at an isolated staging origin (e.g., `https://staging.attendx.io` or `http://localhost:3003`).
- **Code Baseline:** Built directly from commit `feat/hiring-module-implementation` containing the hardened Next.js proxy and API handlers.
- **Network Routing:** Direct network route to the staging database and staging Supabase auth service.

### 3.3 Approved Access & Environment Configuration
The deployment administrator must populate a secured staging environment file (`attendx-v2/.env.staging.local`):

```bash
# ============================================================
# AttendX v2 — Staging Environment Configuration (.env.staging.local)
# STRICTLY ISOLATED FROM PRODUCTION (xskgtrgiclzmwtyyhpjh) & QA (khaxowomjczuckfuraoh)
# ============================================================

# 1. Supabase Client Credentials (Staging Project)
NEXT_PUBLIC_SUPABASE_URL=https://[STAGING_PROJECT_REF].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[STAGING_ANON_JWT]

# 2. Supabase Server / Service Role Key (SERVER-ONLY)
SUPABASE_SERVICE_ROLE_KEY=[STAGING_SERVICE_ROLE_JWT]

# 3. Direct PostgreSQL Connection URI (Required for Migration Runner & Real RLS Tests)
# Must connect as PostgreSQL superuser or database owner (postgres)
DATABASE_URL=postgresql://postgres:[STAGING_DB_PASSWORD]@db.[STAGING_PROJECT_REF].supabase.co:5432/postgres?sslmode=require
STAGING_DATABASE_URL=postgresql://postgres:[STAGING_DB_PASSWORD]@db.[STAGING_PROJECT_REF].supabase.co:5432/postgres?sslmode=require

# 4. Application Settings
NEXT_PUBLIC_APP_URL=https://staging.attendx.io
NODE_ENV=production

# 5. AI Copilot (Optional for Staging)
OPENAI_API_KEY=[STAGING_OPENAI_KEY_OR_PLACEHOLDER]
OPENAI_MODEL=gpt-4o-mini
```

### 3.4 Secret Hygiene & Git Safety
- `.env.staging.local` is matching `.gitignore` pattern `.env*.local`.
- Zero credentials or service-role keys may be committed to Git.
- Verify secret leakage prevention prior to deployment via `npm run scan:secrets`.

---

## 4. Read-Only Schema Inventory & Dependency Model

### 4.1 Complete 28 Hiring Tables Inventory
The 28 hiring tables and their object profiles:

| # | Table Name | Key Columns | Direct `organization_id` | Triggers Defined in 019 | Expected Policies (Post-023) |
| :-: | :--- | :--- | :---: | :---: | :---: |
| 1 | `job_requisitions` | `id`, `requisition_code`, `title`, `status`, `openings_count` | ✅ Yes | `trg_job_requisitions_updated_at` | `_workforce_isolation` (1) |
| 2 | `job_requisition_skills` | `id`, `requisition_id`, `skill_name`, `weight` | ✅ Yes | None | `_workforce_isolation` (1) |
| 3 | `candidates` | `id`, `first_name`, `last_name`, `email`, `phone` | ✅ Yes | `trg_candidates_updated_at` | `_workforce_isolation` (1) |
| 4 | `candidate_skills` | `id`, `candidate_id`, `skill_name`, `proficiency` | ✅ Yes | None | `_workforce_isolation` (1) |
| 5 | `candidate_resumes` | `id`, `candidate_id`, `file_url`, `parsed_text` | ✅ Yes | None | `_workforce_isolation` (1) |
| 6 | `sourcing_searches` | `id`, `requisition_id`, `search_query`, `status` | ✅ Yes | None | `_workforce_isolation` (1) |
| 7 | `sourced_candidates` | `id`, `search_id`, `requisition_id`, `full_name`, `source` | ✅ Yes | None | `_workforce_isolation` (1) |
| 8 | `outreach_campaigns` | `id`, `requisition_id`, `title`, `channel`, `status` | ✅ Yes | `trg_outreach_campaigns_updated_at` | `_workforce_isolation` (1) |
| 9 | `outreach_templates` | `id`, `name`, `channel`, `subject`, `body_template` | ✅ Yes | `trg_outreach_templates_updated_at` | `_workforce_isolation` (1) |
| 10 | `outreach_messages` | `id`, `campaign_id`, `candidate_id`, `status` | ✅ Yes | None | `_workforce_isolation` (1) |
| 11 | `outreach_followups` | `id`, `campaign_id`, `sequence_number`, `delay_days` | ✅ Yes | None | `_workforce_isolation` (1) |
| 12 | `ai_voice_calls` | `id`, `candidate_id`, `requisition_id`, `status`, `sentiment` | ✅ Yes | `trg_ai_voice_calls_updated_at` | `_workforce_isolation` (1) |
| 13 | `assessments` | `id`, `requisition_id`, `title`, `passing_score` | ✅ Yes | `trg_assessments_updated_at` | `_workforce_isolation` (1) |
| 14 | `job_applications` | `id`, `candidate_id`, `requisition_id`, `stage`, `status` | ✅ Yes | `trg_job_applications_updated_at` | `_workforce_isolation` (1) |
| 15 | `ai_screenings` | `id`, `application_id`, `candidate_id`, `score`, `verdict` | ✅ Yes | `trg_ai_screenings_updated_at` | `_workforce_isolation` (1) |
| 16 | `candidate_assessments` | `id`, `application_id`, `candidate_id`, `assessment_id` | ✅ Yes | None | `_workforce_isolation` (1) |
| 17 | `hiring_funnel_events` | `id`, `application_id`, `from_stage`, `to_stage` | ✅ Yes | None | `_select`, `_insert`, `_update`, `_delete` (4) |
| 18 | `hiring_audit_logs` | `id`, `user_id`, `action`, `entity_type`, `entity_id` | ✅ Yes | None | `_select`, `_insert`, `_update`, `_delete` (4) |
| 19 | `interviews` | `id`, `application_id`, `candidate_id`, `round_number` | ✅ Yes | `trg_interviews_updated_at` | `_workforce_isolation` (1) |
| 20 | `candidate_evaluations` | `id`, `interview_id`, `application_id`, `score`, `recommendation`| ✅ Yes | `trg_candidate_evaluations_updated_at` | `_workforce_isolation` (1) |
| 21 | `offer_portal_tokens` | `id`, `offer_id`, `application_id`, `token_hash`, `expires_at` | ✅ Yes | None | `_workforce_isolation` (1) |
| 22 | `job_offers` | `id`, `application_id`, `candidate_id`, `status`, `base_salary` | ✅ Yes | `trg_job_offers_updated_at` | `_workforce_isolation` (1) |
| 23 | `onboarding_processes` | `id`, `application_id`, `candidate_id`, `offer_id`, `status` | ✅ Yes | `trg_onboarding_processes_updated_at` | `_workforce_isolation` (1) |
| 24 | `onboarding_documents` | `id`, `onboarding_id`, `document_type`, `status`, `is_required` | ✅ Yes | `trg_onboarding_documents_updated_at` | `_workforce_isolation` (1) |
| 25 | `onboarding_tasks` | `id`, `onboarding_id`, `task_name`, `status`, `is_required` | ✅ Yes | `trg_onboarding_tasks_updated_at` | `_workforce_isolation` (1) |
| 26 | `hiring_analytics_snapshots` | `id`, `metrics_payload`, `snapshot_date` | ✅ Yes | None | `_workforce_isolation` (1) |
| 27 | `hiring_ai_recommendations` | `id`, `requisition_id`, `recommendation_type` | ✅ Yes | None | `_workforce_isolation` (1) |
| 28 | `org_score_weights` | `id`, `experience_weight`, `skill_weight`, `assessment_weight` | ✅ Yes | `trg_org_score_weights_updated_at` | `_workforce_isolation` (1) |

### 4.2 Dependency Graph
```mermaid
graph TD
  Core_Tenants["public.tenants (id)"] --> Core_Deps["departments / designations / auth.users"]
  Core_Tenants --> REQ["job_requisitions"]
  Core_Tenants --> CAND["candidates"]
  REQ --> REQ_SKILLS["job_requisition_skills"]
  CAND --> CAND_SKILLS["candidate_skills"]
  CAND --> CAND_RES["candidate_resumes"]
  REQ --> SOURCING["sourcing_searches"]
  SOURCING --> SOURCED_CAND["sourced_candidates"]
  CAND --> OUTREACH["outreach_messages / campaigns"]
  REQ --> APP["job_applications"]
  CAND --> APP
  APP --> VOICE["ai_voice_calls"]
  APP --> SCREEN["ai_screenings"]
  APP --> ASSESS["candidate_assessments"]
  APP --> FUNNEL["hiring_funnel_events (immutable)"]
  APP --> AUDIT["hiring_audit_logs (append-only)"]
  APP --> INTV["interviews"]
  INTV --> EVAL["candidate_evaluations"]
  APP --> OFFER["job_offers"]
  OFFER --> TOKEN["offer_portal_tokens (fail-closed)"]
  OFFER --> ONBOARD["onboarding_processes"]
  ONBOARD --> DOCS["onboarding_documents"]
  ONBOARD --> TASKS["onboarding_tasks (is_required)"]
  ONBOARD -.->|"Atomic Conversion"| EMP["public.employees (id)"]
```

---

## 5. Schema-Aware Migration 019 Applicability Engine

### 5.1 Why `job_requisitions` Alone Is Insufficient
Migration `019_hiring_schema.sql` creates:
- Exactly 28 tables.
- Exactly 15 triggers using raw `CREATE TRIGGER trg_<name> ...` without `OR REPLACE` or `DROP TRIGGER IF EXISTS`.
- 1 trigger function (`public.set_hiring_updated_at()`).
- 1 compatibility view (`public.organizations`).

**Danger Scenarios:**
1. **The Partial Run / False Positive:** If `job_requisitions` exists because someone manually ran a snippet or an earlier aborted deployment created 2 tables, naively skipping Migration 019 leaves 26 tables missing. Subsequent queries immediately crash with `PGRST205` / `relation does not exist`.
2. **The Collision / False Negative:** If `job_requisitions` does not exist or was renamed, but triggers (`trg_job_requisitions_updated_at`) or function `set_hiring_updated_at` already exist in `pg_trigger`, running Migration 019 aborts with fatal error `42710 (duplicate_object: trigger already exists)`.

### 5.2 The 3-Way Schema Decision Matrix
The administrator must execute [`scripts/staging-schema-probe.sql`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/attendx-v2/scripts/staging-schema-probe.sql) and apply the following rule:

```mermaid
flowchart TD
    Start["Execute scripts/staging-schema-probe.sql"] --> Check["Evaluate Object Inventory"]
    Check -->|Tables = 0 AND Triggers = 0| CaseA["Case A: Clean Baseline"]
    Check -->|Tables = 28 AND Triggers = 15| CaseB["Case B: Migration 019 Complete"]
    Check -->|Tables 1..27 OR Triggers 1..14| CaseC["Case C: Schema Drift / Partial"]

    CaseA --> ActionA["Run 019_hiring_schema.sql<br/>Run 022_onboarding_tasks_is_required.sql<br/>Run 023_hiring_rls_hardening.sql"]
    CaseB --> ActionB["SKIP 019_hiring_schema.sql<br/>Run 022_onboarding_tasks_is_required.sql<br/>Run 023_hiring_rls_hardening.sql"]
    CaseC --> ActionC["🛑 HALT DEPLOYMENT<br/>Generate Targeted DDL Reconciliation<br/>Do NOT run 019"]
```

---

## 6. Migration Sequence & Post-Deployment Test Protocol

### 6.1 Pre-Migration Step: Execute Schema Inventory Probe
```bash
# In attendx-v2 directory:
psql "$STAGING_DATABASE_URL" -f scripts/staging-schema-probe.sql
```
- If output returns `CLEAN BASELINE -> APPLY 019, 022, 023 IN ORDER`, proceed to Sequence A.
- If output returns `MIGRATION 019 COMPLETE -> SKIP 019, APPLY 022 & 023`, proceed to Sequence B.
- If output returns `SCHEMA DRIFT DETECTED`, **STOP** and reconcile missing objects before proceeding.

### 6.2 Migration Execution Commands

#### Sequence A (Clean Staging Target)
```bash
echo "==> Step 1: Applying Migration 019 (Hiring Schema)"
psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f ../supabase/migrations/019_hiring_schema.sql

echo "==> Step 2: Applying Migration 022 (Onboarding is_required)"
psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f ../supabase/migrations/022_onboarding_tasks_is_required.sql

echo "==> Step 3: Applying Migration 023 (Hiring RLS Hardening)"
psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f ../supabase/migrations/023_hiring_rls_hardening.sql
```

#### Sequence B (Existing Staging Schema Target)
```bash
echo "==> Skipping Migration 019 (Already present)"

echo "==> Step 1: Applying Migration 022 (Onboarding is_required)"
psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f ../supabase/migrations/022_onboarding_tasks_is_required.sql

echo "==> Step 2: Applying Migration 023 (Hiring RLS Hardening)"
psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f ../supabase/migrations/023_hiring_rls_hardening.sql
```

### 6.3 Post-Deployment Test Protocol (Staging Database & API)
Run the following test commands targeting staging. **Every command must be recorded in the final staging verification report:**

```bash
# In attendx-v2 directory:

# 1. Post-Migration Schema Probe (Verify 28 tables, RLS ENABLED & FORCED, 34 policies)
psql "$STAGING_DATABASE_URL" -f scripts/staging-schema-probe.sql

# 2. Real Staging PostgreSQL RLS Hardening Test (13 tests)
DATABASE_URL="$STAGING_DATABASE_URL" node --experimental-strip-types --test tests/db/hiring-rls-hardening.test.js

# 3. Real Staging PostgreSQL Voice AI & RLS Test (7 tests)
DATABASE_URL="$STAGING_DATABASE_URL" node --experimental-strip-types --test tests/db/hiring-voice-real-db.test.js

# 4. Real Staging PostgreSQL Onboarding & Sourcing Tests (19 tests)
DATABASE_URL="$STAGING_DATABASE_URL" node --experimental-strip-types --test tests/db/hiring-onboarding-real-db.test.js tests/db/hiring-sourcing-real-db.test.js

# 5. Full Hiring Golden-Path End-to-End Smoke Test (48/48 checks)
DATABASE_URL="$STAGING_DATABASE_URL" node scripts/verify-step4-golden-path-real-db.mjs

# 6. Boundary 1 & API Security Regression Matrix (105 tests)
NEXT_PUBLIC_APP_URL="https://staging.attendx.io" node tests/hiring-batch1-security-regression.test.mjs

# 7. Candidate Offer Portal Token Fail-Closed Check (HTTP Probe)
# Direct anonymous call to non-existent or unauthenticated portal endpoint must fail closed:
curl -s -o /dev/null -w "%{http_code}\n" https://staging.attendx.io/api/hiring/offers/portal/invalid-token
# Expected output: 404 or 401 (Never 200 or 500)
```

---

## 7. Administrator Configuration & Missing Evidence Register

### 7.1 Administrator Actions Required
- [ ] **Action 1:** Provision an isolated staging Supabase project or PostgreSQL 15+ database instance.
- [ ] **Action 2:** Create `.env.staging.local` using the template in Section 3.3.
- [ ] **Action 3:** Deploy application branch `feat/hiring-module-implementation` to staging web host.
- [ ] **Action 4:** Run `psql "$STAGING_DATABASE_URL" -f scripts/staging-schema-probe.sql` and capture output.
- [ ] **Action 5:** Apply migrations according to the 3-Way Decision Matrix (Section 5.2).
- [ ] **Action 6:** Execute all 7 post-deployment verification commands (Section 6.3).
- [ ] **Action 7:** Attach raw terminal outputs to the final staging sign-off report.

### 7.2 Missing Evidence Register
The following evidence cannot be obtained until the dedicated staging environment is provisioned by the operator:
1. `STAGING_DATABASE_URL` connectivity and version confirmation.
2. Staging pre-deployment probe output from `scripts/staging-schema-probe.sql`.
3. Staging migration execution logs (confirming zero trigger collision errors).
4. Staging post-migration RLS verification log (`13 pass / 0 fail`).
5. Staging golden-path verification log (`48 pass / 0 fail`).
6. Staging web server health check (`GET /api/health` HTTP 200).
7. Staging candidate portal token fail-closed HTTP response status.

---

## 8. Staging Readiness Checklist & Stop Condition

| Gate Item | Requirement | Readiness Status | Action Required |
| :--- | :--- | :---: | :--- |
| **Source Integrity** | All 23 modified + 5 untracked files preserved | 🟢 **READY** | None. Preserved in git working tree. |
| **RLS Migration 023** | Hardened policies with `USING` and `WITH CHECK` | 🟢 **READY** | Ready in `supabase/migrations/023_hiring_rls_hardening.sql`. |
| **Seed Data Hygiene** | Hex UUIDs validated; isolated from staging/prod | 🟢 **READY** | Resolved. Seeds restricted to local testing. |
| **Schema Inventory Probe** | Read-only probe covering all 28 tables & triggers | 🟢 **READY** | Created at `attendx-v2/scripts/staging-schema-probe.sql`. |
| **Migration Sequence** | Dependency order & trigger collision safety defined | 🟢 **READY** | Detailed runbook ready in Section 6. |
| **Post-Deployment Tests**| Exact test commands targeting staging DB & App | 🟢 **READY** | 7 test commands documented in Section 6.3. |
| **Dedicated Staging DB** | Isolated PostgreSQL / Supabase instance | 🔴 **PENDING** | Operator must provision staging database. |
| **Staging Web Server** | Next.js server with hardened proxy deployed | 🔴 **PENDING** | Operator must deploy web staging target. |
| **Staging Sign-off** | Live evidence from isolated staging environment | 🔴 **PENDING** | Operator must execute runbook and record logs. |

### Final Stop Condition
Automated execution is **STOPPED**. No migrations have been applied to hosted QA or production. The system is ready to execute immediately upon provisioning of the dedicated staging environment.
