# AttendX v2 — Master Prompt (Continuation Brief)

You are picking up a Next.js 16 + Supabase workforce/attendance PWA at
`/Users/sridhar/Projects/AttendX_New`. A previous agent claimed to have built a
full product from a spec. An audit proved most of it does not exist. A second
pass has already landed real security fixes. **Your job is to finish the build
honestly.**

## Rules of engagement (non-negotiable)

1. **Never fabricate a fallback.** The original code contained an auth bypass
   that granted SUPERADMIN whenever login failed. If a dependency is missing,
   fail loudly. Do not invent mock data, demo users, or silent catch-blocks
   that pretend success.
2. **Verify with real execution, not by reading code.** Run the migration,
   run the query, load the page, watch the network tab. "The code implies it
   works" is not evidence.
3. **Report honestly.** If something is broken or unfinished, say so plainly.
   Do not write a self-congratulatory summary.
4. **Read `node_modules/next/dist/docs/` before writing Next.js code.** This is
   Next.js 16 — middleware is now `proxy.ts` with a named `proxy` export, and
   builds run on Turbopack. Your training data is likely stale here.
5. **Do not delete or weaken the RLS hardening** described below to make
   something pass.

## Environment reality

- `attendx-v2/.env.local` contains **literal placeholder strings**
  (`https://placeholder.supabase.co`, `sk-placeholder`, `placeholder-anon-key`).
  There is **no live Supabase project and no OpenAI key.**
- Local Postgres 15 **is** available and is how the schema was verified:
  `psql -d attendx_audit`. Docker is installed but the daemon is not running.
- `git log` shows a single `Initial commit from Create Next App`. Nothing is
  deployed. The `supabase/` directory is outside the git repo entirely.

**First thing to ask the user:** do they want to provision a real Supabase
project + OpenAI key now, or keep building against local Postgres? Everything
in Phase 3 below is blocked until real credentials exist. Do not fake it.

---

## PART A — What has ALREADY been fixed (do not redo, do not revert)

All of these are already applied in the working tree and verified against a
real local Postgres database:

1. **Auth bypass removed** — `hooks/useAuth.tsx`. `signIn` previously caught a
   failed `signInWithPassword` and fabricated a SUPERADMIN session, returning
   `{error:null}`. Any email + any password logged in as SUPERADMIN of a
   hardcoded tenant. It also contained a hardcoded `email.includes('hitler')`
   easter egg referencing a personal Gmail. All of it is gone; errors now
   propagate.
2. **Build blocker fixed** — `app/providers.tsx` rendered `<ToastContainer/>`
   as a *sibling* of `{children}`, so `ToastContext` never wrapped the tree.
   Every `useToast()` consumer threw and `next build` died prerendering
   `/admin/settings`. Now `<ToastContainer>{children}</ToastContainer>`.
3. **Cross-tenant leak closed** — `supabase/migrations/003_rls_hardening.sql`
   (new file). `get_my_tenant_id()` used `LIMIT 1` with no `ORDER BY`. For a
   user with membership in two tenants it returned whichever row the heap
   yielded first. **Proven leak:** the same user read Globex's employee roster
   instead of Acme's purely because the memberships were inserted in the
   opposite order. Now: honours an explicit `tenant_id` JWT claim (validated
   against real membership), resolves single-tenant users normally, and
   **fails closed (NULL)** for ambiguous identities.
4. **`search_path` pinned** — `get_my_tenant_id`, `get_my_role`, `has_role`
   were `SECURITY DEFINER` with a mutable `search_path` (the standard definer
   hijack vector, flagged by Supabase's own linter). All now
   `SET search_path = public, pg_temp`.
5. **Profile tenant tampering blocked** — `profiles_self_update` had no
   `WITH CHECK`. Rewriting your own `profiles.tenant_id` was blocked *only as
   a side effect* of the SELECT policy; dropping that policy made escalation
   succeed. Now has an explicit `WITH CHECK` **plus** a
   `guard_profile_privileged_columns()` trigger freezing `tenant_id`, `id`,
   `is_active`, and `email` against self-service edits.
6. **`FORCE ROW LEVEL SECURITY`** applied to all 36 RLS tables so the table
   owner is not exempt.
7. **Supabase `auth` schema protected** — `001_initial_schema.sql` did
   `CREATE OR REPLACE FUNCTION auth.uid()` and `CREATE TABLE auth.users`.
   Against a real Supabase project that either fails on ownership or clobbers
   GoTrue's `auth.uid()`, which every RLS policy depends on. Now guarded by a
   `DO $shim$` block that detects a managed auth schema and leaves it alone.
8. **proxy.ts RBAC fixed** — used `.single()` on `user_roles` with no tenant
   filter, which throws for multi-tenant users and denied them access. Now
   selects all rows, prefers the `app_metadata.tenant_id` claim, and matches
   any held role. Same `.single()` bug fixed in `useAuth.loadUserProfile`.
9. **`/unauthorized` page created** — `proxy.ts` redirected there and it was a
   404.
10. **Offline queue retry engine** — `lib/offline/queue.ts`. Any error marked
    an item `FAILED` forever, and `getPendingQueueItems` only returned
    `PENDING`, so one transient network blip permanently destroyed a clock-in
    or leave request. Now: `attempts` counter, exponential backoff with jitter
    (~2s→5min cap), 5 attempts, a `PERMANENT_ERROR_CODES` set that
    dead-letters non-retryable Postgres errors immediately, and FAILED items
    are deliberately retained rather than cleared.

### Verified-good (leave alone, these are genuinely solid)
- RLS **read-path** isolation works. Tested with real data and real role
  impersonation (`SET ROLE authenticated` + `request.jwt.claim.sub`): an
  employee sees 0 rows from the other tenant, only their own attendance row,
  0 rows of `attrition_risk_scores` and `audit_log`, and exactly 1 tenant.
- **Role self-escalation is properly blocked.** `UPDATE user_roles SET
  role='ADMIN'` → `UPDATE 0`; `INSERT` of an ADMIN row → RLS violation.
- Offline-sync SQL matches the schema: `offline_id`/`sync_status`/`is_draft`
  columns all exist, and the attendance upsert's `onConflict` target
  `(tenant_id, employee_id, date)` is a real unique constraint.
- The 35-table schema is well structured, indexed, and has `updated_at`
  triggers. Security headers in `next.config.js` are sensible.

---

## PART B — KNOWN LOOSE END (fix this first)

`syncOfflineQueue()` now returns `{ synced, failed, retrying }` but
`hooks/useOfflineSync.tsx:29` still early-returns `{ synced: 0, failed: 0 }`
and its context type declares only `{synced, failed}`. Update the hook to
carry `retrying`, and surface dead-lettered items via the new
`getDeadLetterItems()` helper. Also note `pendingCount` now counts items
sitting inside a backoff window — decide whether that's the number you want
in the UI.

**Then run `npx next build` and confirm it completes.** It has not been
re-run since the queue rewrite. Expect a ~4–5 minute build.

---

## PART C — What DOES NOT EXIST (verified absent — build or descope, don't fake)

Searched the entire tree. These produced **zero** matches outside of feature
flags, type definitions, and nav labels:

| Claimed feature | Reality |
|---|---|
| AI Copilot / function calling / tool routing | **Absent.** No `openai` dependency. No API route. Only a feature-flag toggle and a dead nav link. |
| Embeddings pipeline | **Absent.** `skill_embeddings` table + ivfflat index exist; nothing ever writes or reads them. |
| Attrition risk scoring | **Absent.** `attrition_risk_scores` table exists; no job populates it. |
| Supabase Edge Functions | **Absent.** There is no `supabase/functions/` directory at all. |
| Push notifications | **Absent.** No `web-push` dep, no `PushManager`, no VAPID usage. Env vars declared and never read. |
| Realtime subscriptions | **Absent.** The only `.unsubscribe()` in the codebase is the auth state listener. |
| API routes / Server Actions | **Absent.** Zero `route.ts`, zero `'use server'`. `getSupabaseServiceClient()` is defined and never called. |
| Service worker / PWA offline | **Inert.** `@ducanh2912/next-pwa` is a **webpack** plugin; Next 16 builds with **Turbopack**, so `withPWA` is silently ignored and no `sw.js` is generated. |

**12 of 15 navigation links 404.** Only `/dashboard`, `/admin/users`, and
`/admin/settings` resolve. These route directories exist but are **empty**:
`copilot`, `cases`, `leave`, `notifications`, `performance`, `profile`,
`recognition`, `hr`, `manager`. `/attendance/checkin` exists but `/attendance`
does not.

**The seed is misleading.** `supabase/seed/001_seed_data.sql` header claims
"3 Tenants × 5 roles each + realistic sample data" but inserts **zero users,
zero profiles, zero employees, zero attendance records** — only reference data.

**The RLS test suite is theatre.** `supabase/tests/rls_isolation_tests.sql` has
no role switching, no JWT claims, and no assertions — it just SELECTs counts
and prints them. It queries tables the seed leaves empty, run as a superuser
with `rolbypassrls=t`. It returns all-zero "passes" **even with RLS completely
disabled** — this was demonstrated. Test 9 is a bare comment with no SQL.

---

## PART D — Priority order for your work

### Phase 1 — Make it truthful and runnable
1. Fix the Part B loose end; get `npx next build` green.
2. **Replace the RLS test suite** with a harness that actually asserts: seed
   real multi-tenant identities, `SET ROLE authenticated` +
   `SET request.jwt.claim.sub`, and `RAISE EXCEPTION` on any isolation
   failure so it exits non-zero. It must fail if RLS is turned off.
3. **Extend the seed** to insert real `auth.users`, `profiles`, `user_roles`,
   `employees`, and `attendance_records` across the 3 tenants — or correct the
   header comment to stop claiming data it doesn't create.
4. **Add fail-fast env validation** (e.g. a zod-parsed `lib/env.ts`) so
   placeholder credentials throw a clear startup error instead of surfacing as
   opaque DNS failures at runtime. The opaque failure is exactly what the auth
   bypass was papering over.
5. Add a `typecheck` and `lint` script — `package.json` currently has only
   `dev`, `build`, `start`, and there is **no test runner and no linter**
   installed at all.

### Phase 2 — Build the missing product surface
Work through the empty routes. For each, build the real page against real
Supabase queries (the existing `/dashboard` is a good reference — it uses
TanStack Query with genuine `supabase.from(...)` calls, not mocks). Suggested
order by user value: `/profile`, `/leave`, `/attendance`, `/notifications`,
`/cases`, `/recognition`, `/performance`, then `/hr/*` and `/manager/*`.
Remove nav links for anything you consciously descope — a 404 is worse than
an absent link.

### Phase 3 — Blocked until real credentials exist
Do not start these against placeholder keys.
6. **PWA/service worker**: `@ducanh2912/next-pwa` will not work under
   Turbopack. Either build with webpack, or switch to a Turbopack-compatible
   approach (e.g. Serwist, or a hand-written `sw.js` + registration).
   Verify a real `sw.js` is emitted and the app loads offline.
7. **AI Copilot**: needs a real `OPENAI_API_KEY` and the `openai` dependency.
   Build it as a Route Handler with proper tool/function definitions, and
   enforce tenant scope **server-side** — never trust a tenant id from the
   client.
8. **Embeddings**: generation + storage into `skill_embeddings` + a
   `match_*` RPC for vector search. Note the migration falls back to
   `CREATE DOMAIN vector AS float8[]` when pgvector is unavailable and skips
   the ivfflat index — confirm real pgvector is enabled on Supabase.
9. **Push notifications**: add `web-push`, wire VAPID, store subscriptions in
   the existing `push_tokens` table, and trigger from a real server-side event.
10. **Realtime**: subscribe to `postgres_changes` for notifications and
    attendance. Confirm RLS applies to realtime payloads.

### Phase 4 — Polish
11. `app/layout.tsx` sets `maximumScale: 1, userScalable: false` — a WCAG
    zoom-blocking accessibility violation. Remove it.
12. Consider column-level grants alongside the new trigger guard.
13. `proxy.ts` does a DB round-trip per request; the Next 16 docs explicitly
    warn proxy is not for data fetching. Consider putting the role in the JWT
    via a Supabase auth hook instead.

---

## Definition of done for each item
A change is done when you can show: the command you ran, the actual output,
and — for anything user-facing — the page rendering. Not "implemented".
