# AttendX product audit and delivery plan

## Current baseline

- 27 authenticated application pages and 114 API route handlers are present.
- Authentication, tenant isolation, RBAC, session revocation, attendance, leave, recognition, reporting, employee 360, sentiment, and hiring have automated coverage.
- The current regression suite passes: 273 tests.
- TypeScript, ESLint, and the production Next.js build pass.

## Fixes completed in this audit

- HR Copilot now calls the live `/api/copilot` route with a stable per-page conversation ID, so conversation history can be isolated and reused safely.
- Copilot no longer claims that an existing backend is “not deployed”; genuine service unavailability is reported as an error.
- Copilot workforce analytics no longer invents default morale, engagement, retention, or anomaly values when the database has no snapshot.
- Copilot team-leave answers are scoped to the caller’s reporting context: tenant-wide for HR/Admin, direct reports for Managers, and same-manager colleagues for Employees.
- Mobile login now opens directly to the sign-in form instead of blocking authentication behind a three-second splash animation.

## Remaining product gaps, ordered by user impact

### P0 — make every visible action trustworthy

1. Add browser-level journeys for login, onboarding, dashboard, clock-in/out, leave application, manager approval, recognition, and hiring interview scheduling.
2. Replace any remaining simulated provider path in production with explicit configuration states and operator-visible setup guidance. Simulation must never look like delivery.
3. Add a single shared client API layer for loading, mutation, error, retry, and stale-data handling so pages behave consistently.
4. Add empty, loading, offline, permission-denied, and partial-data states to every major page.

### P1 — complete workforce workflows

1. Attendance: correction requests, approval history, shift/overtime visibility, and a clear “active shift” recovery flow.
2. Leave: balance validation before submit, overlap detection, cancellation, approval delegation, and audit history.
3. Performance: employee self-review, manager review, goals/OKRs, deadlines, and notification reminders.
4. Notifications: deep links to the originating record, unread counts, bulk actions, and reliable read-state refresh.
5. Employee profile: editable fields with validation, avatar/document handling, and change history.

### P1 — make hiring production-ready

1. Complete real Zoom and Teams adapters behind explicit credentials and health checks.
2. Add provider configuration pages and delivery diagnostics for email, meetings, sourcing, and voice.
3. Add candidate-facing application status, interview rescheduling, consent, and document upload failure recovery.
4. Add offer expiry, withdrawal, audit history, and onboarding conversion rollback paths.

### P2 — make the product feel polished

1. Establish shared page primitives for tables, filters, drawers, confirmations, toasts, and responsive mobile layouts.
2. Add keyboard navigation, focus management, accessible labels, and reduced-motion support.
3. Add dashboard personalization by role and actionable empty states instead of decorative placeholders.
4. Add product telemetry for failed mutations, provider errors, and time-to-success without collecting sensitive content.

## Delivery sequence

1. Browser smoke suite and shared API/error layer.
2. Attendance and leave end-to-end completion.
3. Performance, notifications, and profile completion.
4. Hiring provider/configuration hardening.
5. UI polish, accessibility, telemetry, and release checklist.

Each increment should ship with an end-to-end test, a permission test, a mobile check, and explicit empty/error/offline states.
