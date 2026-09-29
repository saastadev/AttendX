# AttendX Hiring Module — Migration Notes (017_hiring_schema.sql)

This document records the architectural decisions, table mappings, and enhancements implemented in migration `017_hiring_schema.sql` for the AttendX Hiring Module.

---

## 1. Core Entity Reuse & Multi-Tenancy Architecture
- **Tenant Entity**: The existing AttendX primary multi-tenant root is `public.tenants(id)`. To seamlessly satisfy the Hiring DB specification while preserving AttendX's existing schema:
  - All hiring tables define `organization_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE`.
  - A PostgreSQL compatibility view `public.organizations` maps directly to `public.tenants`.
  - `public.get_my_organization_id()` is established as an alias for `public.get_my_tenant_id()`.
- **Departments & Designations**:
  - `job_requisitions.department_id` references existing `public.departments(id)`.
  - `job_requisitions.designation_id` references existing `public.designations(id)`.
  - `job_offers.department_id` references existing `public.departments(id)`.
- **Employees & Users**:
  - Requisition recruiters, hiring managers, interviewers, document reviewers, and approvers reference `auth.users(id)`.
  - `onboarding_processes.employee_id` links to `auth.users(id)` and `public.employees(id)` upon conversion.
- **Audit & Notifications**:
  - `hiring_audit_logs` provides dedicated fine-grained auditing for all hiring entity lifecycle changes.
  - Notifications link directly into `public.notifications`.

---

## 2. Approved Schema Improvements

### a) Per-Organization Uniqueness Constraints
- `uq_requisition_code_per_org`: `UNIQUE (organization_id, requisition_code)`.
- `uq_app_code_per_org`: `UNIQUE (organization_id, application_code)`.
- `uq_offer_number_per_org`: `UNIQUE (organization_id, offer_number)`.
*Benefit*: Multiple independent tenants can adopt their own organizational numbering schemes (e.g. `REQ-001`, `APP-2026-01`, `OFFER-001`) without collisions.

### b) Direct `organization_id` on All Child Tables
All 28 tables carry `organization_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE`:
- Avoids multi-hop joins when querying child entities (e.g., candidate skills, outreach follow-ups, interview evaluations, onboarding tasks).
- Permits uniform, ultra-fast Row-Level Security (RLS) policies: `USING (organization_id = public.get_my_tenant_id() OR auth.role() = 'service_role')`.

### c) Automatic `updated_at` Triggers
- Trigger function `public.set_hiring_updated_at()` is attached to all tables containing `updated_at` timestamps.

### d) Exhaustive Indexing
- B-tree indexes added on every foreign key column across all 28 tables.
- Partial unique index on candidate emails per organization:
  ```sql
  CREATE UNIQUE INDEX uq_candidates_org_lower_email
    ON public.candidates (organization_id, lower(email))
    WHERE email IS NOT NULL AND is_anonymized = FALSE;
  ```
- Filtering indexes on commonly filtered attributes: `(organization_id, status)`, `(organization_id, stage)`, `data_retention_until`, `token_hash`.

### e) Unified State Machine Check Constraints
`job_applications.stage` strictly enforces the single-source-of-truth state machine:
- **Main Path**: `SOURCED` > `CONTACTED` > `APPLIED` > `SHORTLISTED` > `INTERVIEW` > `SELECTED` > `OFFER_INTEREST_SENT` > `OFFER_ACCEPTED` > `DOCUMENTS_PENDING` > `DOCUMENTS_VERIFIED` > `OFFER_RELEASED` > `OFFER_FINAL_ACCEPTED` > `ONBOARDED`.
- **Side Exits**: `REJECTED`, `WITHDRAWN`, `OFFER_DECLINED`, `OFFER_FINAL_DECLINED`.

### f) PII & Confidential Data Encryption at Rest
- Sensitive compensation and contact attributes (`candidates.current_ctc`, `candidates.expected_ctc`, `candidates.phone`) are stored encrypted at rest via AES-256-GCM.
- Role-based decryption policies restrict CTC access to `ADMIN`, `HR` (Recruiter), and `MANAGER` (Hiring Manager).

### g) Onboarding Document Verification & Status Tracking
- Document status enum includes `NOT_SUBMITTED`, `SUBMITTED`, `VERIFIED`, `PENDING`, `REJECTED`.
- Tracks `reviewer_comment`, `reviewed_by`, `reviewed_at`, and `scan_status` (`PENDING`, `CLEAN`, `INFECTED`).
