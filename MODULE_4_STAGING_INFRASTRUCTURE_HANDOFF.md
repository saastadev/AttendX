# AttendX Module 4 — Staging Infrastructure Handoff Specification

**Document ID:** `ATTENDX-HANDOFF-MOD4-001`  
**Date:** October 14, 2026  
**Author:** Principal Application Security Engineer & Lead Database Reliability Engineer  
**Recipient:** AttendX Deployment Administrator / DevOps Infrastructure Lead  
**Scope:** Module 4 (Hiring & Talent Acquisition) Pre-Staging Deployment Prerequisites  
**Target Environments:** Staging Only (Production and Hosted QA are Strictly Out of Scope)  

---

## 1. Executive Summary & Objective

Local security hardening, HTTP authorization verification, and PostgreSQL Row-Level Security (RLS) validation for AttendX Module 4 are complete and verified with reproducible evidence.

Per AttendX's **Zero False Pass Policy (§34.1, §35)** and strict non-negotiable engineering rules, **all hosted migrations and application deployments to staging remain strictly BLOCKED** until the deployment administrator provisions dedicated staging infrastructure.

This document defines the exact six prerequisite requirements, configuration parameters, and verification procedures that must be fulfilled before any hosted migration or deployment may proceed.

---

## 2. Mandatory Infrastructure Prerequisites

```
┌────────────────────────────────────────────────────────────────────────┐
│                   STAGING INFRASTRUCTURE TOPOLOGY                      │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   [ Staging Next.js App ]  ────────►  [ Dedicated Staging Supabase ]   │
│   (Isolated Compute Host)              (Project Ref: e.g., attendx-stg) │
│                                             │                          │
│                                             ▼                          │
│                                       PostgreSQL DB                    │
│                                       (Active RLS,                     │
│                                        Clean / Drift-Free Schema)      │
└────────────────────────────────────────────────────────────────────────┘
```

### Requirement 1: Dedicated, Isolated Staging Supabase / PostgreSQL Database
- **Isolation Guarantee:** Must be a completely separate Supabase project with its own PostgreSQL instance.
- **Prohibited Targets:** Under no circumstances may migrations be executed against:
  - Production (`xskgtrgiclzmwtyyhpjh`)
  - Hosted QA / Shared Testing (`khaxowomjczuckfuraoh`)
- **Database Extensions Required:**
  - `pgcrypto` / `uuid-ossp`
  - `vector` (for skill embeddings, if policy search is active)
- **Database Roles:**
  - Standard Supabase roles must exist: `postgres` (admin), `authenticated` (RLS enforced), `anon` (unauthenticated), and `service_role` (background tasks).

### Requirement 2: Dedicated Staging Next.js Application
- **Compute Isolation:** An isolated application compute instance (e.g., Render, Vercel Staging, or isolated container) hosting `attendx-v2`.
- **Branch / Build Target:** Built from branch `feat/hiring-module-implementation`.
- **Runtime Mode:** `NODE_ENV=production` or `NODE_ENV=staging`. (Must NOT run with `NODE_ENV=development` or with dummy mock flags in staging).

### Requirement 3: Securely Configured Staging Credentials & Environment Variables
The deployment administrator must configure the following environment variables within the staging environment secret store. **Do not transmit secrets via chat, git repositories, or unencrypted channels.**

| Environment Variable | Required Format / Purpose | Security Constraints |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<staging-project-ref>.supabase.co` | Must reference dedicated staging Supabase host only. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Authentic Supabase staging anonymous JWT | Browser-safe anon key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Authentic Supabase staging service-role JWT | Strictly server-side secret; never exposed to browser or client bundles. |
| `DATABASE_URL` | `postgresql://postgres:[password]@db.<staging-ref>.supabase.co:5432/postgres` | Direct connection string for migration execution and schema probes. |
| `NODE_ENV` | `staging` or `production` | Ensures `allowDemoAuthentication()` evaluates strictly to `false`. |
| `ATTENDX_MOCK_STORE` | **DO NOT SET** (or set to `false`) | Must be omitted to ensure live database store is active. |
| `ATTENDX_OFFLINE_MODE` | **DO NOT SET** (or set to `false`) | Must be omitted to ensure live database store is active. |

### Requirement 4: Authorized Read-Only Schema Inspection Access
- Prior to executing any DDL or migration scripts, the administrator or auditor must be provided read-only or diagnostic connection access to execute:
  [`attendx-v2/scripts/staging-schema-probe.sql`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/attendx-v2/scripts/staging-schema-probe.sql)
- **Mandatory Decision Rules (Zero False Pass Policy):** The schema probe validates actual database objects (all 28 tables, 15 triggers, functions, views, columns, foreign keys, indexes, and migration history), never relying on a table count or the presence of `job_requisitions` alone:
  - **A. Clean baseline:** Apply `019 → 022 → 023` only after the read-only schema probe verifies that the required Hiring schema is completely absent (0/28 tables, 0/15 triggers, base function absent) and all baseline preconditions (tenants, profiles, departments) are satisfied.
  - **B. Complete, consistent baseline:** Skip `019` only after verifying all expected baseline tables, columns, constraints, indexes, functions, triggers, and relationships are present and consistent. Then determine whether `022` (column `is_required`) and `023` (role-aware RLS functions/policies) are required based on their actual application state.
  - **C. Partial, inconsistent, or ambiguous schema:** Stop immediately for manual reconciliation. Do not automatically run `019`, do not skip `019`, and do not attempt automatic schema repair.
  - **D. Migration history disagrees with actual database objects:** If `supabase_migrations.schema_migrations` disagrees with actual database objects, stop and document the discrepancy. Do not assume migration history alone proves the database is correct.

### Requirement 5: Recoverable Backup or Point-in-Time Recovery Snapshot
- **Backup Verification:** A full snapshot or physical backup of the target staging database must be created immediately prior to executing any DDL.
- **Rollback Readiness:** The deployment administrator must confirm that the database can be restored to this snapshot within 15 minutes in the event of an unexpected DDL error.

### Requirement 6: Explicit Written Deployment Approval
- Formal sign-off by the deployment administrator approving:
  1. The target database identifier and isolation confirmation (strictly non-production, non-hosted-QA).
  2. The schema-probe classification results validated against Rules A, B, C, or D.
  3. The proposed migration sequence justified by verified object state:
     - Under Rule A (Clean): Apply `019_hiring_schema.sql` -> `022_onboarding_tasks_is_required.sql` -> `023_hiring_rls_hardening.sql`.
     - Under Rule B (Consistent): Skip `019`; apply only unapplied migrations (`022` and/or `023`).
     - Under Rule C or D: Migrations strictly HALTED pending manual engineering reconciliation.
  4. Post-deployment verification execution authorization.

---

## 3. Staging Preflight Execution Checklist for Administrator

```markdown
[ ] 1. Provision dedicated Supabase project (Record Project Ref, verify NOT production xskgtrgiclzmwtyyhpjh or QA khaxowomjczuckfuraoh).
[ ] 2. Provision dedicated Next.js staging host withfeat/hiring-module-implementation build.
[ ] 3. Inject staging environment variables (verify no placeholder values, verify ATTENDX_MOCK_STORE is unset).
[ ] 4. Create pre-migration database snapshot/backup and verify 15-minute rollback capability.
[ ] 5. Execute read-only schema probe:
       psql "$DATABASE_URL" -f attendx-v2/scripts/staging-schema-probe.sql
[ ] 6. Review probe output and classify target schema strictly against Rules A, B, C, or D:
       - Rule A (Clean): Proceed to migration sequence 019 -> 022 -> 023.
       - Rule B (Complete Baseline): Skip 019, evaluate 022/023 application state.
       - Rule C (Partial/Drift): HALT execution, escalate for manual schema reconciliation.
       - Rule D (History Disagreement): HALT execution, document discrepancy.
[ ] 7. Issue formal deployment sign-off with approved migration sequence.
```

---

## 4. Post-Deployment Verification Sequence (To Be Executed Post-Handoff)

Once the handoff prerequisites are satisfied, the engineering team will execute the verified post-deployment quality gate against the live staging target:

1. **Database Schema Verification:** Confirm all 28 hiring tables, 44 indexes, 15 triggers, and the `is_required` column exist.
2. **PostgreSQL RLS Audit:** Verify all 28 hiring tables have `ROW LEVEL SECURITY ENABLED` and `FORCED`.
3. **HTTP API Authorization Verification (`test:api:auth`):** Transmit live HTTP requests to verify that forged cookies fail closed with HTTP 401.
4. **Hiring Golden Path Verification:** Run end-to-end multi-tenant lifecycle verification with authentic test accounts.
