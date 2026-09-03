# AttendX v2 — Defect & Architectural Observation Report (QA Phase 10)

**Document ID:** `QA-REPORT-10`  
**Date:** 2026-09-02  
**Author:** Lead QA Engineer & Database Architect  
**Status:** **DISCOVERED ITEMS CATALOGED & REPORTED**

---

## 1. Defect Classification & Priority Matrix

| Defect ID | Priority | Category | Description | Severity | Workaround / Architecture Resolution |
|:---|:---:|:---|:---|:---:|:---|
| `DEF-01` | **P3** | Conceptual ERD vs Live DB | Conceptual ERD lists a separate `organizations` table, but the live schema collapses the root organization into `tenants`. | **Low / Architectural Note** | Functionally equivalent: `Tenant` serves as the top-level organization boundary; branches are modeled via `geofences` and `departments`. |
| `DEF-02` | **P3** | Initial Dev Load | First visit to `/auth/login` on freshly booted dev server compiled JIT modules. | **Low / Performance** | Fast-path bypass added in `proxy.ts` (< 150ms response). |
| `DEF-03` | **P4** | DOM Type Normalization | `AnimatedValue.tsx` logged console error when `totalLeaveAvailable` was not yet initialized on `/dashboard`. | **Low / UI Warning** | Handled: Null-safe numeric parsing applied. |

---

## 2. Zero Critical (P0 / P1) Security Defects

* **Cross-Tenant Data Leakage:** **0** (RLS guarantees strict tenant containment).
* **Auth Bypass:** **0** (Failed login rejects session and stores 0 elevated roles).
* **Credential Leaks in Client:** **0** (AST scanner confirms clean client bundles).
