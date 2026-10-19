# AttendX Module 4 — Staging Deployment and Verification Gate Report

**Document ID:** `MODULE_4_STAGING_DEPLOYMENT_REPORT.md`  
**Execution Timestamp:** 2026-10-14T11:20:00+05:30  
**Target Git Branch:** `feat/hiring-module-implementation`  
**Auditor:** Antigravity Agentic SDLC Gatekeeper  
**Audit Protocol:** AttendX Engineering Rules Charter (Spec 34) & Definition of Done (Spec 35)  
**Deployment Decision:** 🛑 **NOT READY — BLOCKERS REMAIN (STAGING ENVIRONMENT UNAVAILABLE)**

---

## 1. Executive Decision & Governing Preconditions

Per the explicit governing instruction:
> *"The Batch 2 report says READY FOR STAGING DEPLOYMENT. This is not permission to modify production or the existing hosted Supabase database.*  
> *1. Confirm that a separate, isolated staging environment exists and identify its database and application targets without exposing credentials.*  
> *If staging is unavailable or any migration precondition fails, stop without modifying the existing hosted database and report the blocker.*  
> *Do not report local test results as staging results."*

### Deployment Verdict
- **Target Status:** 🛑 **STAGING TARGET UNAVAILABLE / HOSTED SUPABASE GATED**
- **Action Taken:** In strict adherence to Fail-Closed (§34.3) and Zero Fabrication (§34.1), automated deployment has been **HALTED**. Zero mutations or migrations were executed against hosted Supabase (`khaxowomjczuckfuraoh`) or Production (`xskgtrgiclzmwtyyhpjh`).

---

## 2. Environment Target & Connectivity Audit

| Target Environment | Endpoint / Reference | Status | Verification Detail |
| :--- | :--- | :---: | :--- |
| **Production Supabase** | `https://xskgtrgiclzmwtyyhpjh.supabase.co` | 🔒 **OFF LIMITS** | Production database; strictly protected from non-production operations. |
| **Existing Hosted QA Supabase** | `https://khaxowomjczuckfuraoh.supabase.co` | 🛑 **GATED** | Probed read-only via PostgREST. `public.job_requisitions` is **MISSING** in schema cache (`PGRST205`). No direct DDL execution access (`psql` / management API token) is configured in repository environment. Not authorized for unreviewed automated mutations. |
| **Isolated Staging Database** | *None configured* | ❌ **UNAVAILABLE** | No dedicated staging database (`STAGING_DATABASE_URL`), staging Supabase project, or staging environment configuration exists in repo or environment variables. |
| **Isolated Staging Web App** | *None configured* | ❌ **UNAVAILABLE** | No staging application target provisioned. Local application server runs at `http://localhost:3002`. |
| **Local Disposable DBs** | `postgresql://localhost:5432/attendx_test` & `attendx_val_review` | 🟢 **VERIFIED BASELINE** | 74 tables, fully migrated, hardened with RLS, seeded with valid hex fixtures. Local test results are strictly isolated and not reported as staging results. |

### Read-Only Probe Evidence (Hosted QA Instance `khaxowomjczuckfuraoh`)
A live read-only probe was conducted using `@supabase/supabase-js` against `https://khaxowomjczuckfuraoh.supabase.co`:
```text
Query job_requisitions result: {
  data: null,
  error: {
    code: 'PGRST205',
    details: null,
    hint: "Perhaps you meant the table 'public.notifications'",
    message: "Could not find the table 'public.job_requisitions' in the schema cache"
  }
}
```
**Conclusion:** The 28 hiring tables from Migration 019 have never been applied to hosted Supabase project `khaxowomjczuckfuraoh`.

---

## 3. Migration Diffs & Artifact Review

All code changes and migration files remain strictly preserved in the working tree:

### 3.1 `supabase/migrations/019_hiring_schema.sql` (Committed)
- **Object Count:** 28 tables, 15 triggers executing `public.set_hiring_updated_at()`, 2 views (`v_active_job_requisitions`, `v_candidate_pipeline_summary`).
- **Idempotency Defect:** Triggers are created via `CREATE TRIGGER trg_<name> ...` without `OR REPLACE` or `DROP TRIGGER IF EXISTS`.
- **Precondition:** Must **ONLY** be run on a target database where `job_requisitions` and its triggers do not already exist. If re-run against an existing schema, it aborts on trigger collisions.

### 3.2 `supabase/migrations/022_onboarding_tasks_is_required.sql` (Committed)
- **Scope:** Adds `is_required BOOLEAN NOT NULL DEFAULT true` to `public.onboarding_tasks`.
- **Idempotency:** Fully idempotent (`ADD COLUMN IF NOT EXISTS`).

### 3.3 `supabase/migrations/023_hiring_rls_hardening.sql` (Untracked / Ready)
- **Scope:** 
  - Enables and forces RLS on all 28 hiring tables.
  - Drops permissive legacy policies (`<tbl>_tenant_isolation`).
  - Creates `<tbl>_workforce_isolation` enforcing RBAC (`SUPERADMIN`, `ADMIN`, `HR`, `MANAGER`) and scoping by `organization_id = public.get_my_tenant_id()`.
  - Enforces both `USING` and `WITH CHECK` clauses across all 28 tables.
  - Hardens `hiring_audit_logs` as tamper-evident and append-only (`UPDATE`/`DELETE` restricted to `service_role`).
  - Hardens `hiring_funnel_events` as immutable event stream (`UPDATE`/`DELETE` restricted to `service_role`).
  - Fails closed for anonymous (`anon`) queries on candidate tables and offer tokens.
- **Idempotency:** Fully idempotent (`DROP POLICY IF EXISTS`, `ENABLE`, `FORCE`).

### 3.4 `supabase/seed/002_hiring_seed.sql` (Modified)
- **Defect Resolution:** Corrected 19 non-hexadecimal mnemonic UUIDs (e.g. `s1000000...`, `t1000000...`, `m1000000...`, `i1000000...`, `o1000000...`, `p1000000...`) to valid hex literals (`d1...`, `d2...`, `d3...`, `e1...`, `e2...`, `e3...`).
- **Isolation Policy:** Development seed fixtures are restricted to local test execution and **MUST NOT** be executed against staging or production databases.

### 3.5 Application-Level Hardening (Modified)
- **`attendx-v2/proxy.ts`:** Hardened Edge route guard restricting `/hiring` paths to `SUPERADMIN`, `ADMIN`, `HR`, and `MANAGER`. Ordinary `EMPLOYEE` is intercepted at Boundary 1 and redirected (HTTP 307) to `/unauthorized`.
- **19 API Handlers in `attendx-v2/app/api/hiring/`:** Stripped `EMPLOYEE` and phantom `CANDIDATE` roles from `getAuthoritativeCaller` across all hiring routes.

---

## 4. Local Test & Verification Baseline

*(Note: In compliance with Rule 10, the following results are from the local PostgreSQL baseline `attendx_test`, provided solely as proof of migration correctness prior to staging availability.)*

| Suite | Command | Tests Run | Pass | Fail | Skipped | Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **CI Guardrails & Secrets** | `npm run ci` | 249 | 248 | 0 | 1 | 🟢 **PASS** |
| **Security Regression Matrix** | `npm run test:security` | 23 | 23 | 0 | 0 | 🟢 **PASS** |
| **Real DB RLS Hardening** | `npm run test:rls:hiring` | 13 | 13 | 0 | 0 | 🟢 **PASS** |
| **Hiring Security Suite** | `node tests/hiring-batch1-security-regression.test.mjs` | 105 | 105 | 0 | 0 | 🟢 **PASS** |
| **Real DB Voice AI Suite** | `npm run test:rls` | 39 | 39 | 0 | 0 | 🟢 **PASS** |
| **Real DB Onboarding & Sourcing** | `node --test tests/db/hiring-*.test.js` | 19 | 19 | 0 | 0 | 🟢 **PASS** |
| **Module 4 Golden Path** | `node scripts/verify-step4-golden-path-real-db.mjs` | 48 | 48 | 0 | 0 | 🟢 **PASS** |
| **Next.js Production Build** | `npm run build` | 122 routes | 122 | 0 | 0 | 🟢 **PASS** |

---

## 5. Deployment Requirements & Preflight Checklist for Staging

Before any deployment to staging or hosted Supabase can be authorized, the following operations must be performed:

### Step 1: Provision Isolated Staging Environment
1. Provision a dedicated Supabase project or PostgreSQL 15+ database instance for staging (e.g. `attendx-staging`).
2. Provide sanitized environment configuration (`STAGING_DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
3. Deploy an isolated instance of the Next.js application server (e.g., `http://staging.attendx.io` or `http://localhost:3003`).

### Step 2: Target Pre-Deployment Schema Probe
Execute the following read-only probe on the staging database to confirm object inventory:
```sql
SELECT 
  table_name,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t.table_name) AS table_exists
FROM (VALUES 
  ('job_requisitions'), ('job_applications'), ('candidates'), ('onboarding_tasks'), ('hiring_audit_logs')
) AS t(table_name);
```

### Step 3: Migration Execution Sequence
Apply migrations strictly in dependency order:
1. **Migration 019 (`019_hiring_schema.sql`):** 
   - Apply **ONLY IF** `job_requisitions` does NOT exist.
   - If tables already exist, **DO NOT RUN 019** (trigger collision will fail).
2. **Migration 022 (`022_onboarding_tasks_is_required.sql`):**
   - Apply incrementally.
3. **Migration 023 (`023_hiring_rls_hardening.sql`):**
   - Apply incrementally. Drops legacy policies, forces RLS, applies RBAC and append-only constraints.

### Step 4: Staging Post-Deployment Verification
Once staging is accessible:
1. Verify 28 tables have `relrowsecurity = true` and `relforcerowsecurity = true`.
2. Execute `attendx-v2/tests/db/hiring-rls-hardening.test.js` using `DATABASE_URL=<staging_url>`.
3. Execute `attendx-v2/scripts/verify-step4-golden-path-real-db.mjs` using `DATABASE_URL=<staging_url>`.
4. Validate public offer portal token access fails closed on anonymous direct database queries and functions through authenticated service-role API routes.

---

## 6. Blockers Summary & Awaiting Approval

1. **BLOCKER 1:** Dedicated, isolated staging environment is not provisioned or configured.
2. **BLOCKER 2:** Hosted Supabase instance (`khaxowomjczuckfuraoh`) lacks the 28 hiring tables and has no direct DDL connection string configured in the repository.
3. **BLOCKER 3:** Explicit policy prohibits mutating hosted Supabase or production without authorized sign-off.

**Stopping execution.** Working tree is pristine and preserved. Awaiting operator provisioning of the staging environment or authorized deployment instructions.
