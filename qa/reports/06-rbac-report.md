# AttendX v2 — Role-Based Access Control (RBAC) Matrix Report (QA Phase 6)

**Document ID:** `QA-REPORT-06`  
**Date:** 2026-09-02  
**Author:** Senior Security QA Engineer & SDET  
**Status:** **100% PASS — DUAL BOUNDARY VERIFIED**

---

## 1. 5-Role RBAC Authorization Matrix

| Route / API Resource | `SUPERADMIN` | `ADMIN` | `HR` | `MANAGER` | `EMPLOYEE` | Dual Boundary Security Enforcement |
|:---|:---:|:---:|:---:|:---:|:---:|:---|
| `/admin` & `/api/admin/*` | 🟢 ALLOW | 🟢 ALLOW | 🔴 DENY | 🔴 DENY | 🔴 DENY | Proxy 307 Redirect + RLS 0 Rows |
| `/hr` & `/api/attrition/*` | 🟢 ALLOW | 🟢 ALLOW | 🟢 ALLOW | 🔴 DENY | 🔴 DENY | Proxy 307 Redirect + RLS Role Guard |
| `/manager/approvals` | 🟢 ALLOW | 🟢 ALLOW | 🟢 ALLOW | 🟢 ALLOW | 🔴 DENY | Proxy Guard + `employees.manager_id` SQL filter |
| `/dashboard` & `/attendance` | 🟢 ALLOW | 🟢 ALLOW | 🟢 ALLOW | 🟢 ALLOW | 🟢 ALLOW | Self-scoping `employee_id = auth.uid()` |
| `/leave/apply` | 🟢 ALLOW | 🟢 ALLOW | 🟢 ALLOW | 🟢 ALLOW | 🟢 ALLOW | Self-scoping balance check |
| `/api/admin/employees` (Provision) | 🟢 ALLOW | 🟢 ALLOW | 🔴 DENY | 🔴 DENY | 🔴 DENY | 403 Forbidden + Caller identity check |
| `/api/admin/users/[id]/deactivate`| 🟢 ALLOW | 🟢 ALLOW | 🔴 DENY | 🔴 DENY | 🔴 DENY | 403 Forbidden + Atomic deactivation RPC |

---

## 2. Key Security Findings

* **Zero Privilege Escalation:** Non-admin roles attempting to provision users or modify roles are rejected with `403 Forbidden`.
* **Server-Side Resolution:** Roles are derived from the authoritative `user_roles` database table; claims passed in client state or request body are strictly ignored.
