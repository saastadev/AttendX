# AttendX - MVP - End-to-End auth, admin provisioning & production hardening

**Status:** IN PROGRESS  
**Priority:** CRITICAL  
**Due Date:** 22/08/2026, 01:00:00 (2 days left)  
**Assignees:** Nanthitha  
**Created By:** Team saasta  

---

**PRIORITY:** Critical  
**TYPE:** Feature + Hardening
> 
> **AUTHENTICATION IS THE PRIMARY SECURITY BOUNDARY.**
> Every other feature depends on this task being correct. Do not proceed based on assumptions about authentication, roles, tenant identity, or session state. Verify each boundary with real requests, real database rows, and negative tests.

---

# Scope

## A. Authentication — A to Z

### 1. Unified Login

There must be **ONE login page**.

Do **not** create separate Admin, HR, Manager, or Employee login pages.

After authentication is successfully established, resolve the user's role **server-side** and route accordingly:

- `ADMIN` / `SUPERADMIN` → `/admin`
- `HR` → `/hr`
- `MANAGER` → `/manager`
- `EMPLOYEE` → `/dashboard`

**Never trust a role supplied by the client.**

Role-based routing must happen only after a valid authenticated session exists.

---

### 2. Public Signup — Make an Explicit Security Decision

`useAuth.signUp()` currently allows anyone to self-register into a tenant by knowing its slug.

This makes tenant provisioning control illusory.

**Explicitly choose one model and implement it completely:**

**Preferred:** Disable public signup and use admin provisioning.

OR:

**Alternative:** Implement a secure invite-token flow.

If invite-based signup is selected:

- Token must be cryptographically strong.
- Token must be single-use.
- Token must expire.
- Token must be tenant-bound.
- Token must not grant arbitrary roles.
- Token must not allow tenant switching.
- Token must be invalidated after successful registration.
- Invitation acceptance must be audited.
- Client-provided tenant IDs must not override the invitation's tenant.

**Do not leave signup enabled accidentally.**

---

### 3. First-Login Password Change

First-login password change must be enforced **server-side in** `proxy.ts`.

The UI alone is insufficient.

Gate on:

`profiles.onboarding_completed`

Required behavior:

**Authenticated user + onboarding incomplete → password-change flow only.**

The user must not be able to bypass the requirement by:

- Directly visiting `/dashboard`
- Directly visiting `/admin`
- Calling an API
- Manipulating client state
- Editing local storage
- Modifying navigation

After successful password change:

- Update the required profile/onboarding state.
- Establish the correct session state.
- Allow normal routing.

---

### 4. Session Management

`active_sessions` already exists.

Wire it into the application.

Users should be able to:

- View active sessions/devices.
- See useful session metadata.
- Revoke an individual session.
- Revoke other sessions.
- Revoke all sessions where authorized.

### Password change

**Revoke all existing sessions on password change**, except the newly established session where appropriate.

Test:

- Current session remains valid where expected.
- Previous sessions become invalid.
- Revoked sessions cannot access protected routes.
- Revoked sessions cannot call protected APIs.

Do not merely delete a database row and assume the JWT has become invalid.

Verify actual session behavior.

---

### 5. Inactive Accounts

Explicitly block authentication for:

`is_active = false`

**RLS does not prevent login.**

Verify the complete flow:

1. Active user can authenticate.
2. User is deactivated.
3. New login fails.
4. Existing session behavior is explicitly handled.
5. Protected API access is rejected according to the session policy.

Do not rely on the frontend hiding the account.

---

### 6. Session Edge Cases

Test and correctly handle:

- Role revoked mid-session.
- Tenant membership revoked mid-session.
- User deactivated mid-session.
- Stale JWT claims.
- Expired password-reset token.
- Reused password-reset token.
- Concurrent login from multiple devices.
- Concurrent password changes.
- Rate-limited login attempts.
- Expired sessions.
- Revoked sessions.
- Invalid refresh tokens.

**Authorization must be based on current server-side authorization state where required, not blindly trusted from stale JWT claims.**

---

# B. ADMIN PROVISIONING — TRANSACTIONAL SECURITY BOUNDARY

`POST /api/admin/employees` already exists.

Audit it end-to-end and harden it.

---

## 7. Caller Identity

The caller's:

- `user_id`
- `tenant_id`
- `role`

must be derived **server-side** from the authenticated session and authoritative database records.

Never accept them from:

- Request body
- Query parameters
- Headers supplied by the client
- Client state
- Model output

---

## 8. `app_metadata.tenant_id`

When creating an Auth user:

Set:

`app_metadata.tenant_id`

to the validated tenant ID.

`get_my_tenant_id()` in `003_rls_hardening.sql` reads:

`request.jwt.claims → app_metadata → tenant_id`

and validates it against a real `user_roles` row.

### NEVER use:

`user_metadata.tenant_id`

`user_metadata` is user-writable and therefore cannot be trusted as a tenant security boundary.

---

# 9. Atomic Provisioning

The current flow has a critical transactional problem:

`createUser()` and subsequent table writes do not automatically share one database transaction.

Possible failure:

**Auth user created → profile creation fails → user is orphaned but can still authenticate.**

Implement a safe provisioning strategy.

Use a **SECURITY DEFINER RPC** for the database-side creation of:

- Profiles
- User roles
- Employees
- Required related records

Then handle Auth user creation failure/rollback appropriately.

If the database transaction fails after the Auth user exists:

**Delete the newly created Auth user.**

---

## Mid-Flow Failure Test

Explicitly force a failure after Auth user creation.

Verify:

- No orphaned Auth user.
- No partial profile.
- No partial employee.
- No partial role.
- No misleading success response.
- Correct audit behavior.

**This test is mandatory.**

---

# 10. Employee Seat Limits

`tenants.max_employees` exists but currently has no enforcement.

Before provisioning:

- Resolve tenant server-side.
- Count/enforce the current employee limit atomically.
- Reject provisioning when the limit is reached.

Return a clear application-level error such as:

**Employee seat limit reached.**

Do not return a generic `500`.

Also test concurrent provisioning at the seat boundary.

Two simultaneous requests must not both bypass the limit.

---

# 11. Provisioning Password Security

Passwords must:

- Never be logged.
- Never appear in audit payloads.
- Never appear in API responses.
- Never appear in error messages.
- Never be returned to the client after provisioning.

Review structured logs, Sentry payloads, audit logs, database logs, and error handling.

---

# 12. Deactivation Over Deletion

Employees must be **deactivated, not hard-deleted**, where business requirements require historical preservation.

Verify that deactivation:

- Blocks authentication.
- Preserves attendance.
- Preserves leave history.
- Preserves cases.
- Preserves audit history.
- Preserves reporting integrity.

---

# C. MULTI-TENANT SWITCHER

`get_my_tenant_id()` now correctly **fails closed** when a user belongs to multiple tenants but has no explicit tenant claim.

Currently, such users see nothing.

Build a secure tenant switcher.

---

## 13. Tenant Selection

The tenant switcher must:

- Show only tenants the authenticated user actually belongs to.
- Never accept arbitrary tenant IDs.
- Validate the selected tenant against authoritative membership.
- Establish the tenant claim securely.
- Refresh/re-establish the session after changing tenant context where required.
- Ensure subsequent RLS queries use the selected tenant.
- Prevent tenant switching to an unauthorized tenant.

---

## 14. Tenant-Switching Security Tests

Test:

- User with one tenant.
- User with two tenants.
- User with multiple tenants and no claim.
- Valid tenant switch.
- Invalid tenant switch.
- Forged tenant ID.
- Cross-tenant URL manipulation.
- Stale tenant claim.
- Revoked tenant membership.

**Unauthorized tenant selection must fail closed.**

---

# D. AUTHORIZATION & RBAC

Create a complete RBAC matrix covering:

- `SUPERADMIN`
- `ADMIN`
- `HR`
- `MANAGER`
- `EMPLOYEE`

For each protected route/API:

- Allowed roles.
- Denied roles.
- Tenant boundary.
- Expected HTTP status.
- Expected RLS result.

Do not rely solely on route-level protection.

**Proxy protection and database RLS must independently enforce the security boundary.**

---

# E. PRODUCTION HARDENING

## 15. Audit Triggers

Verify that:

`004_audit_triggers.sql`

actually covers every privileged action.

At minimum:

- Role changes.
- Employee provisioning.
- Employee deactivation.
- Leave approval/rejection.
- Attendance edits.
- Settings changes.
- Exports.
- Impersonation.
- Tenant membership changes.
- Tenant switching where security-relevant.
- Password/security changes where appropriate.

Prefer **database triggers** over application-only logging wherever practical.

Application logging can be bypassed.

Database-level auditing provides a stronger security boundary.

---

# 16. Audit Log Integrity

Audit records must contain enough information to establish:

**Who → What → When → Tenant → Target → Result**

Do not store:

- Passwords.
- Access tokens.
- Refresh tokens.
- Service-role keys.
- Unnecessary sensitive payloads.

Verify audit entries with real database queries.

---

# 17. CI Secret Scanning

CI must fail if:

`SUPABASE_SERVICE_ROLE_KEY`

appears in:

- Client bundle.
- Browser JavaScript.
- Static output.
- Public environment variables.
- Generated artifacts.

Also fail if environment values match obvious insecure placeholders such as:

`placeholder`

`changeme`

and similar known placeholder patterns.

Do not rely only on source-code grep.

**Scan the actual production build output.**

---

# 18. Toolchain

The current `package.json` only has:

- `dev`
- `build`
- `start`

Add and configure:

- Vitest
- ESLint
- Prettier
- TypeScript type checking

Required scripts should include appropriate equivalents of:

- `test`
- `test:unit`
- `test:integration`
- `lint`
- `format`
- `format:check`
- `typecheck`
- `build`

CI must run them.

---

# 19. Auth Regression Test — Mandatory

Lock the previous auth bypass.

Test:

**Failed** `signInWithPassword()`

Expected:

- Authentication returns an error.
- No authenticated user is established.
- No role is assigned.
- No `SUPERADMIN` is granted.
- No tenant is selected.
- No protected route becomes accessible.
- Client auth store contains no authenticated user.

Also test invalid:

- Email
- Password
- Tenant context
- Session
- Refresh token

**A failed login must never produce a partially authenticated application state.**

---

# 20. PWA — FIX THE CURRENTLY INERT IMPLEMENTATION

`@ducanh2912/next-pwa` is a Webpack-oriented plugin.

Next.js 16 uses Turbopack in this project.

The current setup is silently inert and does not emit:

`sw.js`

Replace it with a working service-worker strategy such as:

- Serwist
- Or a correctly implemented custom service worker

Do not simply change configuration and assume it works.

---

## PWA Verification

Prove:

- Service worker is emitted.
- Service worker registers.
- App shell can load according to the intended offline strategy.
- Previously cached resources work offline.
- Network-off behavior is verified.
- Offline state is visible to the user.
- Sync behavior does not fake success.
- Authentication/security boundaries are not bypassed offline.

**Offline capability must never allow unauthorized access to protected data.**

---

# 21. Security Headers

Implement and verify:

- CSP
- HSTS
- `X-Content-Type-Options`
- Appropriate frame protection
- Referrer policy
- Permissions policy where appropriate

CSP must be tested against the actual application.

Do not blindly add a restrictive policy that breaks production functionality and call it complete.

Document any required exceptions.

---

# 22. Rate Limiting

Rate-limit security-sensitive endpoints:

- Login
- Password reset
- Signup/invite acceptance
- Admin provisioning
- Session operations
- Tenant switching
- Sensitive exports
- Other high-risk authentication APIs

Rate limits should consider:

- User
- IP
- Endpoint
- Tenant where appropriate

Return an honest rate-limit response.

Do not make rate limiting client-dependent.

---

# 23. Sentry & Structured Logging

Add Sentry with:

- Tenant context
- User context where appropriate
- Request correlation ID
- Environment
- Route/API context

But explicitly prevent:

- Passwords
- Tokens
- Service-role keys
- Sensitive request bodies
- Unnecessary employee data

from being captured.

Structured logs should include useful operational information without exposing PII.

---

# 24. REQUEST CORRELATION

Introduce a request/correlation ID for important API operations.

The ID should connect:

**Client request → API → database operation → audit log → error/logging system**

This will make provisioning and authentication failures diagnosable without exposing sensitive data.

---

# 25. CSRF / REQUEST ORIGIN SECURITY

Review state-changing browser requests for CSRF protection and origin validation where applicable.

Especially protect:

- Employee provisioning
- Leave actions
- Attendance modifications
- Session revocation
- Password changes
- Tenant switching
- Administrative settings

Do not assume authentication alone protects browser-based state-changing requests.

---

# 26. AUTH API ERROR DISCIPLINE

Do not expose unnecessary information through authentication errors.

Avoid leaking:

- Whether a specific account exists.
- Internal database errors.
- Tenant structure.
- Role assignments.
- Internal user IDs.

At the same time, internal logs should preserve enough information to diagnose the failure safely.

---

# 27. SESSION & JWT SECURITY

Verify:

- Access-token expiry.
- Refresh-token behavior.
- Session revocation.
- Password-change invalidation.
- Role changes.
- Tenant membership changes.
- Deactivation.
- Logout.
- Concurrent sessions.

Do not assume deleting an `active_sessions` row automatically invalidates an already-issued JWT.

Test the actual behavior.

---

# 28. API CONTRACTS — WEEK 1 HANDOFF

This task publishes **ALL authentication and API contracts to UI**.

Publish early:

- Login request/response.
- Role-routing behavior.
- Session response.
- Session list.
- Session revoke.
- Logout.
- Password change.
- Password reset.
- Employee provisioning.
- Employee deactivation.
- Tenant switch.
- Invite acceptance if implemented.
- Authorization errors.
- Rate-limit responses.

For every endpoint document:

- HTTP method.
- Path.
- Authentication requirement.
- Required role.
- Request schema.
- Response schema.
- Error schema.
- Status codes.
- Tenant behavior.

**UI must not reverse-engineer API behavior.**

---

# 29. AUTH HELPER — AI HANDOFF

Publish the canonical server-side session/auth helper to AI Engineering.

It must expose the authoritative context required by AI tools:

- User ID.
- Tenant ID.
- Role.
- Session validity.
- Relevant authorization state.

**AI must use this helper instead of implementing its own tenant/role resolution.**

---

# 30. DATA ENGINE HANDOFF

Consume the reporting RPCs from Data Engineering.

Do not duplicate attendance reporting logic in the API layer.

The API must use the canonical reporting contract and tenant-local date behavior provided by the database layer.

---

# 31. REAL END-TO-END DEMO

Definition of Done requires the following sequence to be demonstrated with **real output and real database evidence**.

### Step 1 — Admin Login

Admin logs in.

Expected:

`/admin`

Show the actual authenticated session/role resolution.

---

### Step 2 — Employee Provisioning

Admin creates an employee.

Show real rows in:

- `auth.users`
- `profiles`
- `user_roles`
- `employees`
- `audit_log`

Verify the records belong to the correct tenant.

---

### Step 3 — First Login

Log in as the newly provisioned employee.

Expected:

**Forced password change**

Then:

`/dashboard`

Prove the password-change gate was enforced server-side.

---

### Step 4 — Clock In

Employee clocks in.

Show the real:

`attendance_records`

row including the actual attendance metadata, selfie/storage reference where applicable, and geofence information.

---

### Step 5 — Attendance Reporting

Admin dashboard shows:

- Employee → Present
- Colleague → Absent

Verify the result uses **TENANT-LOCAL time**.

Do not rely on the browser timezone.

---

### Step 6 — Clock Out

Employee clocks out.

Verify:

`work_minutes`

is correctly calculated from the actual timestamps.

---

### Step 7 — Employee Attempts Admin Access

Employee requests:

`/admin/*`

Prove both:

1. **Proxy blocks the request.**
2. **RLS returns zero unauthorized rows.**

These are two separate security boundaries and both must be tested.

---

### Step 8 — Cross-Tenant Isolation

Tenant B Admin attempts to access Tenant A employee data.

Prove with a real query:

**Tenant B → Tenant A rows = 0**

AND:

**Tenant B → Tenant B rows = N**

The positive control is mandatory.

---

### Step 9 — Build

Run the complete production validation.

**Build green.**

---

# 32. SECURITY REGRESSION MATRIX

Create automated tests covering:

| Scenario                      | Expected                 |
| -------------------------------| --------------------------|
| Failed login                  | Authentication rejected  |
| Failed login                  | No user in auth store    |
| Failed login                  | No SUPERADMIN            |
| Inactive user login           | Rejected                 |
| Employee → `/admin`           | Blocked                  |
| Employee → admin API          | Unauthorized             |
| Employee → own data           | Allowed where authorized |
| Employee → other tenant       | Blocked                  |
| Admin → own tenant            | Allowed                  |
| Admin → other tenant          | Blocked                  |
| Revoked role → privileged API | Blocked                  |
| Revoked tenant membership     | Blocked                  |
| Invalid tenant switch         | Blocked                  |
| Valid tenant switch           | Allowed                  |
| Missing tenant claim          | Fail closed              |
| Forged tenant claim           | Blocked                  |
| Seat limit reached            | Explicit limit error     |
| Provisioning mid-flow failure | Rollback                 |
| Password change               | Old sessions revoked     |
| Expired reset token           | Rejected                 |
| Reused reset token            | Rejected                 |
| Service role key in browser   | CI failure               |

---

# 33. NO-VACUOUS-TEST REQUIREMENT

Every security test must prove that the test data actually exists.

For example:

**Invalid:**
> 
> Employee sees 0 admin rows.

**Valid:**
> 
> Employee sees N authorized employee rows, then sees 0 admin-only rows.

This rule applies to:

- RLS
- RBAC
- Tenant isolation
- Session tests
- Storage tests
- API authorization tests

---

# NON-NEGOTIABLE ENGINEERING RULES

## 1. NO FABRICATION

This codebase previously shipped an **auth bypass that granted SUPERADMIN on failed login**.

It also had tests that passed for the wrong reason.

**If something is broken, say so. Never add a fallback that fakes success.**

---

## 2. SERVER-SIDE IDENTITY

User identity, tenant identity, and role are authoritative only when resolved server-side.

Never trust them from:

- Request body
- Query parameters
- Client state
- Local storage
- Conversation history
- Model output
- `user_metadata`

---

## 3. FAIL CLOSED

If the application cannot establish:

- Valid session
- Valid user
- Valid tenant membership
- Valid role

then access must be denied.

**Do not guess. Do not default to Admin. Do not default to SUPERADMIN. Do not default to the first tenant.**

---

## 4. POSITIVE CONTROLS

Every negative authorization test must have a positive control.
> 
> **"Sees 0 rows of another tenant" is meaningless unless you first prove "sees N rows of its own tenant."**

---

## 5. SERVICE ROLE KEY

`SUPABASE_SERVICE_ROLE_KEY` **never reaches the browser.**

---

## 6. NO CLIENT-CONTROLLED TENANT

**Tenant ID is ALWAYS derived server-side from the authenticated session/membership context.**

Never derive the security boundary from:

- Request body
- Query parameter
- Client state
- User-writable metadata

---

## 7. NO FAKE SUCCESS

Never report:

- Login success
- Employee creation
- Clock-in
- Clock-out
- Password change
- Session revocation
- Tenant switch

as successful unless the authoritative backend/database operation actually succeeded.

---

# DEFINITION OF DONE

The task is **NOT DONE** until:

- One unified login page exists.
- Role-based routing is server-side.
- Public signup is explicitly disabled or securely invite-gated.
- First-login password change is enforced in `proxy.ts`.
- Password changes revoke existing sessions.
- Inactive accounts cannot authenticate.
- Stale roles/session state are handled.
- Admin provisioning derives tenant/role server-side.
- `app_metadata.tenant_id` is correctly established.
- `user_metadata` is never trusted for tenant security.
- Provisioning is atomic or safely compensating.
- Mid-flow provisioning failure leaves no orphaned Auth user.
- Employee limits are enforced atomically.
- Passwords never appear in logs, audit records, responses, or errors.
- Employees are deactivated rather than improperly hard-deleted.
- Multi-tenant switcher validates membership.
- `get_my_tenant_id()` fails closed.
- Full RBAC matrix passes.
- Privileged actions are audited.
- Audit triggers cover required privileged operations.
- Service-role secret scanning passes.
- Placeholder environment values are rejected.
- Vitest is configured.
- ESLint is configured.
- Prettier is configured.
- Typecheck exists and passes.
- CI runs tests, lint, typecheck, build, and security checks.
- Auth bypass regression test passes.
- PWA service worker actually exists and registers.
- Offline behavior is actually tested with network disabled.
- CSP and HSTS are configured and verified.
- Rate limiting is active on security-sensitive endpoints.
- Sentry and structured logging contain no prohibited PII/secrets.
- Request correlation IDs exist for important flows.
- State-changing requests have appropriate CSRF/origin protection.
- Session revocation is tested against actual protected requests.
- All API contracts are published to UI.
- Canonical session/auth helper is published to AI Engineering.
- Reporting RPCs from Data Engineering are consumed correctly.
- Complete end-to-end demo sequence succeeds with **real data**.
- Cross-tenant access is proven blocked.
- Employee → Admin access is blocked by both proxy and RLS.
- Build is green.

**No "works locally" sign-off. Every critical authentication and authorization property requires executable evidence.**

---

# PRs — Split, Don't Batch

`feat(api): unified login with role-based routing`

`feat(api): disable public signup and add invite-token flow`

`feat(api): forced first-login password change`

`feat(api): harden admin provisioning with atomic rollback`

`feat(api): enforce employee seat limits`

`feat(api): session management and remote revoke`

`feat(api): multi-tenant switcher with validated tenant claim`

`test(api): auth regression and RBAC matrix suite`

`fix(infra): replace inert next-pwa with working service worker`

`chore(infra): add vitest, eslint, typecheck and CI secret scanning`

`feat(infra): add security headers rate limiting and observability`

---

# Repo & Environments

**Repo:** [https://github.com/saastadev/AttendX.git](https://github.com/saastadev/AttendX.git)  
**Live:** [https://attendx-86y5.onrender.com](https://attendx-86y5.onrender.com/)

**Stack:** Next.js 16 (Turbopack, `proxy.ts` not `middleware.ts`) · React 19 · Supabase · Postgres RLS

**IMPORTANT:** Read `node_modules/next/dist/docs/` before writing Next.js code — v16 differs from most training data.

---

# Branch Naming

`<type>/<area>-<short-slug>`

**Example:** `feat/ui-admin-dashboard`

**Types:** `feat` · `fix` · `refactor` · `perf` · `test` · `chore` · `docs`  
**Areas:** `ui` · `api` · `db` · `ai` · `infra`

---

# PR Title

`<type>(<area>): <imperative summary>`

**Example:** `feat(api): add admin employee provisioning endpoint`

---

# PR Description — Required Sections

### What & Why

### Screenshots / Evidence

**Real output, real screenshots. NOT "should work".**

### Schema or API Changes

### How to Test

**Exact commands**

### Risk & Rollback

### Checklist

- `npx next build` passes
- Typecheck + lint pass
- RLS isolation tested as **EMPLOYEE** and **ADMIN**, and cross-tenant
- No secrets in client bundle
- Loading / empty / error / populated states all handled
- Works on **390px mobile**

**PRs over ~400 lines get split. Every PR links its task ID.**
