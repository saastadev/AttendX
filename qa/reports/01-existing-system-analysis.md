# AttendX v2 — Existing System Architecture & Database Design Analysis (QA Phase 1)

**Document ID:** `QA-REPORT-01`  
**Date:** 2026-09-02  
**Author:** Senior QA Engineer, SDET & SaaS Multi-Tenant QA Specialist  
**Stage:** Phase 1 — Discovery & System Analysis (No Code / Schema / DB Modifications)  
**Status:** **DISCOVERY COMPLETE — AWAITING REVIEW BEFORE TEST SEEDING**

---

## 1. Executive Architecture Summary

AttendX v2 is a multi-tenant, AI-powered Workforce Intelligence Platform built on a modern Next.js App Router (v16 with Turbopack) frontend/API layer and a Supabase PostgreSQL relational database.

### System Layer Overview:
* **Frontend & Client UI:** Next.js 16.3.1 (React 19) App Router under `attendx-v2/app/` with 37 distinct production screens across 5 role portals (`/admin`, `/hr`, `/manager`, `/dashboard`, `/copilot`).
* **API Layer:** 31 REST/RPC API Route Handlers under `attendx-v2/app/api/` enforcing server-side identity extraction, CSRF origin verification, and rate limiting.
* **Server Middleware / Proxy:** `attendx-v2/proxy.ts` enforcing dual-boundary route guards, first-login onboarding gates, and session revocation checks.
* **Database & Security Layer:** Supabase PostgreSQL with 39 relational tables, 93 Row Level Security (RLS) policies, 24 stored procedures/triggers, and strict `tenant_id` isolation.

---

## 2. Actual Tenant Model (Live Implementation)

The authoritative root tenant boundary in the actual database is the **`tenants`** table:

```sql
CREATE TABLE public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(50) UNIQUE NOT NULL,
    logo_url TEXT,
    accent_color VARCHAR(7) DEFAULT '#6C63FF',
    app_name VARCHAR(100) DEFAULT 'AttendX',
    timezone VARCHAR(50) DEFAULT 'UTC',
    plan VARCHAR(20) DEFAULT 'FREE',
    max_employees INTEGER DEFAULT 25,
    features JSONB DEFAULT '{"ai_copilot": true, "geofence": true, "selfie_clockin": true}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Key Technical Characteristics:
1. **Tenant ID Format:** UUID (`id`).
2. **Branding & Config:** `accent_color`, `app_name`, `logo_url`, `timezone`, `plan`, `max_employees`, `features`.
3. **Public Read Policy:** Anyone can read `slug` and `name` for login lookup (`005_tenants_public_slug_read.sql`).
4. **Member Read Policy:** Authenticated members can read their own tenant row via `tenant_id = get_my_tenant_id()`.

---

## 3. Actual Organization Model vs Conceptual ERD

### Critical QA Architectural Finding:
* **Conceptual Business Model (Docx/PDF):** Anticipates a multi-tier hierarchy: `Tenant -> Organization -> Department -> Employee`.
* **Actual Database Implementation:** 
  * The current schema collapses the root organizational entity into the **`tenants`** table.
  * Every business entity (`profiles`, `departments`, `designations`, `geofences`, `shifts`, `employees`, `attendance_records`, `leaves`) directly references **`tenant_id`**.
  * There is currently **no standalone `organizations` table** in the live database schema migrations (`001_initial_schema.sql` through `016_canonical_reporting_rpcs.sql`).
* **QA Assessment:** 
  * `Tenant` currently acts as the top-level **Organization boundary**.
  * Multi-organization branching within a single tenant is functionally represented via **`departments`**, **`geofences` (branches/sites)**, and **`shifts`**, or as distinct isolated **Tenants** in the multi-tenant switcher (`014_multi_tenant_switcher_rpc.sql`).

---

## 4. Actual Department Model

The **`departments`** table models organizational business units:

```sql
CREATE TABLE public.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    head_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (tenant_id, name)
);
```

* **Foreign Keys:** `tenant_id -> tenants(id)`, `head_id -> profiles(id)`.
* **Isolation:** Scoped per tenant; unique constraint on `(tenant_id, name)`.

---

## 5. Actual Employee & IAM Model

The employee identity architecture is divided across three tightly coupled tables:

1. **`profiles`** (User Identity & State):
   * `id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`
   * `tenant_id UUID NOT NULL REFERENCES public.tenants(id)`
   * `email`, `full_name`, `avatar_url`, `phone`, `is_active`, `face_enrolled`, `onboarding_completed`
2. **`user_roles`** (RBAC Mapping):
   * `id UUID PRIMARY KEY`, `user_id UUID REFERENCES profiles(id)`, `tenant_id UUID REFERENCES tenants(id)`, `role user_role NOT NULL`
   * Roles supported: `'SUPERADMIN'`, `'ADMIN'`, `'HR'`, `'MANAGER'`, `'EMPLOYEE'`
3. **`employees`** (HR & Workforce Metadata):
   * `id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE`
   * `tenant_id UUID NOT NULL REFERENCES public.tenants(id)`
   * `employee_code VARCHAR(30) UNIQUE NOT NULL`
   * `department_id UUID REFERENCES public.departments(id)`
   * `designation_id UUID REFERENCES public.designations(id)`
   * `manager_id UUID REFERENCES public.employees(id)` (Reporting hierarchy)
   * `shift_id UUID REFERENCES public.shifts(id)`
   * `status TEXT DEFAULT 'ACTIVE'` (`ACTIVE`, `INACTIVE`, `TERMINATED`)
   * `employment_type TEXT DEFAULT 'FULL_TIME'` (`FULL_TIME`, `PART_TIME`, `CONTRACT`)
   * `joining_date DATE DEFAULT CURRENT_DATE`

---

## 6. Catalog of All 39 Live Database Tables

| Table Name | Entity Domain | Primary Key | Key Foreign Keys | RLS Active |
|:---|:---|:---|:---|:---:|
| `tenants` | Tenant Management | `id` | - | ✅ |
| `profiles` | User Profile / IAM | `id` | `auth.users(id)`, `tenants(id)` | ✅ |
| `user_roles` | RBAC Authorization | `id` | `profiles(id)`, `tenants(id)` | ✅ |
| `departments` | Org Structure | `id` | `tenants(id)`, `profiles(id)` | ✅ |
| `designations` | Job Titles | `id` | `tenants(id)` | ✅ |
| `employees` | Workforce / HR | `id` | `profiles(id)`, `tenants(id)`, `departments(id)`, `designations(id)`, `employees(id)`, `shifts(id)` | ✅ |
| `shifts` | Shift Management | `id` | `tenants(id)` | ✅ |
| `geofences` | GPS & Locations | `id` | `tenants(id)` | ✅ |
| `attendance_records` | Attendance Tracking | `id` | `tenants(id)`, `employees(id)`, `geofences(id)`, `shifts(id)` | ✅ |
| `breaks` | Attendance Breaks | `id` | `tenants(id)`, `attendance_records(id)` | ✅ |
| `attendance_corrections`| Manager Adjustments | `id` | `tenants(id)`, `attendance_records(id)`, `employees(id)`, `profiles(id)` | ✅ |
| `leave_types` | Leave Policies | `id` | `tenants(id)` | ✅ |
| `leave_balances` | Leave Entitlements | `id` | `tenants(id)`, `employees(id)`, `leave_types(id)` | ✅ |
| `leaves` | Leave Requests | `id` | `tenants(id)`, `employees(id)`, `leave_types(id)`, `profiles(id)` | ✅ |
| `holidays` | Company Holidays | `id` | `tenants(id)` | ✅ |
| `performance_cycles` | Performance Mgmt | `id` | `tenants(id)` | ✅ |
| `goals` | OKRs & Goals | `id` | `tenants(id)`, `performance_cycles(id)`, `employees(id)`, `profiles(id)` | ✅ |
| `self_reviews` | Performance Reviews | `id` | `tenants(id)`, `performance_cycles(id)`, `employees(id)` | ✅ |
| `manager_reviews` | Performance Reviews | `id` | `tenants(id)`, `performance_cycles(id)`, `employees(id)`, `profiles(id)` | ✅ |
| `recognition_categories`| Employee Recognition | `id` | `tenants(id)` | ✅ |
| `recognition_events` | Peer Kudos & Points | `id` | `tenants(id)`, `profiles(id)`, `recognition_categories(id)` | ✅ |
| `recognition_badges` | Awards & Badges | `id` | `tenants(id)`, `employees(id)` | ✅ |
| `announcements` | Company Comms | `id` | `tenants(id)`, `profiles(id)` | ✅ |
| `announcement_dismissals`| Comms State | `id` | `announcements(id)`, `profiles(id)` | ✅ |
| `notifications` | System Notifications | `id` | `tenants(id)`, `profiles(id)` | ✅ |
| `notification_preferences`| User Preferences | `id` | `profiles(id)`, `tenants(id)` | ✅ |
| `push_tokens` | Web Push Service | `id` | `profiles(id)`, `tenants(id)` | ✅ |
| `cases` | HR Helpdesk Tickets | `id` | `tenants(id)`, `profiles(id)` | ✅ |
| `case_messages` | Helpdesk Messages | `id` | `tenants(id)`, `cases(id)`, `profiles(id)` | ✅ |
| `case_attachments` | Helpdesk Attachments | `id` | `tenants(id)`, `cases(id)`, `case_messages(id)` | ✅ |
| `active_sessions` | Session Security | `id` | `profiles(id)`, `tenants(id)` | ✅ |
| `tenant_invites` | Token Onboarding | `id` | `tenants(id)`, `profiles(id)` | ✅ |
| `password_resets` | Auth Security | `id` | `profiles(id)`, `tenants(id)` | ✅ |
| `auth_rate_limits` | Security Defense | `id` | - | ✅ |
| `audit_log` | Database Audit Trail | `id` | `tenants(id)`, `profiles(id)` | ✅ |
| `offline_sync_log` | PWA Offline Tracking | `id` | `tenants(id)`, `profiles(id)` | ✅ |
| `onboarding_state` | User Onboarding State| `id` | `profiles(id)`, `tenants(id)` | ✅ |
| `attrition_risk_scores`| AI Analytics | `id` | `tenants(id)`, `employees(id)` | ✅ |
| `skill_embeddings` | AI Skill Matching | `id` | `tenants(id)`, `employees(id)` | ✅ |

---

## 7. PostgreSQL Stored Procedures & RPC Functions

1. **`get_my_tenant_id()`**: Reads `request.jwt.claims -> app_metadata -> tenant_id`, verifies membership against `user_roles`, and fails closed to `NULL` if ambiguous or missing.
2. **`get_my_role()`**: Returns authoritative active role for calling user in active tenant.
3. **`has_role(allowed_roles)`**: Boolean RBAC check helper.
4. **`switch_active_tenant(target_tenant_id)`**: Authoritative RPC for switching active tenant context.
5. **`get_my_available_tenants()`**: Discovers tenant memberships for the caller.
6. **`admin_attendance_glance(target_date)`**: Canonical attendance reporting RPC utilizing tenant-local timezone.
7. **`fn_audit_log_trigger()`**: Database trigger capturing Actor $\to$ Action $\to$ Target diffs.
8. **`guard_profile_privileged_columns()`**: Anti-tampering trigger preventing escalation of `is_active` or `onboarding_completed`.

---

## 8. Catalog of All 31 API Endpoints

| Endpoint Route | HTTP Methods | Auth Requirement | Target Role | Primary Purpose |
|:---|:---:|:---:|:---:|:---|
| `/api/auth/login` | `POST` | Public | Any | Unified login with server role resolution |
| `/api/auth/profile` | `GET` | Bearer/Cookie | Any | Current user profile, role, and tenant metadata |
| `/api/auth/first-login-password` | `POST` | Auth (Incomplete) | Any | Mandatory first-login password update |
| `/api/auth/forgot-password` | `POST` | Public | Any | Request password reset token |
| `/api/auth/reset-password` | `POST` | Public / Token | Any | Establish new password with reset token |
| `/api/auth/invite/verify` | `GET` | Public | Any | Verify 64-char crypto invitation token |
| `/api/auth/invite/accept` | `POST` | Public / Token | Any | Complete token onboarding registration |
| `/api/auth/invite/create` | `POST` | Authenticated | Admin/Superadmin | Generate tenant-bound invitation token |
| `/api/auth/tenants` | `GET` | Authenticated | Any | List user's authorized tenant memberships |
| `/api/auth/tenant/switch` | `POST` | Authenticated | Any | Switch active tenant context |
| `/api/admin/employees` | `POST, GET, PATCH` | Authenticated | Admin/Superadmin | Employee provisioning, roster, and edit |
| `/api/admin/attendance` | `GET, DELETE` | Authenticated | Admin/Superadmin | Admin attendance oversight & records |
| `/api/admin/glance` | `GET` | Authenticated | Admin/Superadmin | Attendance glance metrics via RPC |
| `/api/admin/users/[id]/deactivate`| `POST` | Authenticated | Admin/Superadmin | Atomic account deactivation |
| `/api/admin/users/[id]/reactivate`| `POST` | Authenticated | Admin/Superadmin | Account reactivation |
| `/api/admin/users/[id]/revoke-sessions`| `POST` | Authenticated | Admin/Superadmin | Remote user session revocation |
| `/api/attendance/checkin` | `POST` | Authenticated | Employee/Any | Geofenced selfie clock-in / clock-out |
| `/api/attendance/selfie` | `POST` | Authenticated | Employee/Any | Upload attendance verification selfie |
| `/api/leaves/apply` | `POST` | Authenticated | Employee/Any | Submit leave request |
| `/api/manager/approvals` | `GET` | Authenticated | Manager/HR/Admin | Team approvals queue (leaves & corrections) |
| `/api/manager/approvals/[id]` | `POST` | Authenticated | Manager/HR/Admin | Approve / Reject leave or correction |
| `/api/attrition/score` | `POST` | Authenticated | HR/Admin | AI workforce attrition score computation |
| `/api/copilot` | `POST` | Authenticated | Any | AI Copilot conversational assistant |
| `/api/employees/import` | `POST` | Authenticated | Admin/HR | Bulk CSV employee import |
| `/api/payroll/export` | `GET` | Authenticated | HR/Admin/Finance | Attendance & payroll CSV export |
| `/api/rag/ingest` | `POST` | Authenticated | Admin | Ingest documents for AI knowledge base |
| `/api/sessions` | `GET, POST, DELETE`| Authenticated | Any | List, register, or revoke active sessions |
| `/api/sessions/revoke-others`| `POST` | Authenticated | Any | Terminate all other active device sessions |
| `/api/sessions/revoke-all` | `POST` | Authenticated | Any | Global session termination |
| `/api/sync` | `POST` | Authenticated | Any | Process queued offline actions |
| `/api/health` | `GET` | Public | Public | System health and DB connectivity check |

---

## 9. Existing Test Infrastructure & Coverage Matrix

### Test Tooling:
* **Engine:** Node.js native test runner (`node --test`) & Vitest integration.
* **Test Suites Count:** 19 test files containing **164 automated test cases**.
* **Security Test Suite:** `tests/security-regression-matrix.test.js` (23 dedicated Spec 32–33 tests).
* **Secret Scanner:** `scripts/ci-secret-scan.mjs` (scans client bundle AST for leaked service keys).

---

## 10. QA Gaps & Missing Test Coverage

1. **Synthetic Multi-Industry Domain Datasets:** Current test suites validate logic using unit mocks and demo users; there is no structured dataset representing **5 distinct real-world business domains** (IT Tech, Retail Supermarkets, Precision Manufacturing, Express Logistics, Higher Education).
2. **Organization-Level Branching:** Need to validate how multi-location / multi-department business hierarchies function under the single-tenant vs multi-tenant architecture.
3. **High-Volume Relational Integrity Stress:** Need to verify referential integrity across 100+ employees, 300+ attendance records, and 50+ leaves without orphaned records.

---

## 11. Proposed Isolated QA Database & Execution Strategy

### ⚠️ Critical Safety Verification:
* **Production Database:** `https://xskgtrgiclzmwtyyhpjh.supabase.co` (DO NOT TOUCH / OFF LIMITS).
* **Target QA Database:** Dedicated Cloud Instance `https://bvfwhuiocyoqwokxkaad.supabase.co` (`bvfwhuiocyoqwokxkaad`).
* **Environment:** `NODE_ENV=development` / QA Isolation Mode.

### 5 Proposed Synthetic Test Tenants:
1. **`TENANT-IT`**: AcmeTech Solutions (IT / SaaS Cloud Engineering)
2. **`TENANT-RETAIL`**: RetailMart India (Multi-Store Hypermarket Chain)
3. **`TENANT-MFG`**: Precision Manufacturing Ltd (Heavy Factory & 3-Shift Plant)
4. **`TENANT-LOGISTICS`**: SwiftLogix Express (Fleet & Hub Distribution)
5. **`TENANT-EDU`**: FutureLearn Academy (Multi-Campus Educational Institute)

---

## 12. Discovery Conclusion & Sign-Off

* [x] Existing architecture analyzed
* [x] Live tenant & organization models mapped
* [x] 39 tables, 93 RLS policies, 24 RPCs, and 31 APIs cataloged
* [x] Zero application code or database records modified
* [x] Zero Git commits pushed

**STATUS: Phase 1 Discovery Complete. Ready for review.**
