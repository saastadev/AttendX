# AttendX v2 — Load & Security Testing Execution Guide

This guide documents how to execute the automated Load and Security testing suite for AttendX MVP in an isolated non-production environment.

---

## 1. Prerequisites

1. **Next.js Development Server Running:**
   ```bash
   cd attendx-v2
   npm run dev -- -p 3002
   ```
2. **Target Environment:**
   * Target: `attendx-qa` (Supabase Project: `khaxowomjczuckfuraoh`)
   * Credentials configured in `attendx-v2/.env.local`.

---

## 2. Running the Automated Test Suite

To run the complete automated baseline benchmark and 30-vector security test suite:

```bash
node qa/tests/load-and-security-qa.test.mjs
```

### What This Script Tests:
1. **Health Verification:** Pings `/api/health` to confirm server readiness and measure database ping.
2. **Multi-Tenant Authentication:** Logs into 6 distinct personas across Tenant A (Acme Technologies) and Tenant B (Globex Corp).
3. **Baseline Benchmarks:** Measures latency, throughput, and min/max timings across 6 critical APIs.
4. **Security Testing (30 Assertions):**
   * **Authentication:** Unauthenticated requests, empty tokens, invalid Bearer tokens, valid tokens.
   * **RBAC:** Employee and Manager barriers on `/api/admin/employees`, `/api/manager/team`, `/api/reports/workforce`, `/api/sentiment/analytics`.
   * **Multi-Tenant Isolation:** Validates Tenant B admin sees 100% Tenant B data and 0% Tenant A data. Validates cross-tenant 360 and kudos requests are blocked (`404`).
   * **IDOR Protection:** Validates horizontal peer 360 requests are blocked (`403`), self-kudos is rejected (`400`).
   * **Input Validation:** Rejection of empty bodies, missing fields, non-UUIDs, string overflow (>500 chars), negative days in leave requests.
   * **Injection Defenses:** Parameterized SQL search, NoSQL body operators, AI Copilot prompt injection guardrails.
   * **Data Exposure:** Verifies zero password hashes, bcrypt hashes, or service-role keys in responses.
   * **Error Handling:** Verifies malformed JSON responses return sanitized errors without V8 stack traces.
   * **Session Security:** Audits active sessions on `/api/sessions`.
   * **Rate Limiting:** Verifies `HTTP 429 Too Many Requests` after 5 failed login attempts.

---

## 3. Related Reports & Documentation

* Formal QA Audit Report: [`qa/reports/13-load-and-security-testing-report.md`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/qa/reports/13-load-and-security-testing-report.md)
* Formal DoD Sign-Off: [`docs/audit/36_load_and_security_testing_dod_report.md`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/docs/audit/36_load_and_security_testing_dod_report.md)
* Multi-Tenant Setup Guide: [`qa/QA_ENVIRONMENT_GUIDE.md`](file:///Users/nanthithavenkatachapathy/attendxnew/AttendX/qa/QA_ENVIRONMENT_GUIDE.md)
