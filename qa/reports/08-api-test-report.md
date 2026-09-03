# AttendX v2 — API Validation & Contract Test Report (QA Phase 8)

**Document ID:** `QA-REPORT-08`  
**Date:** 2026-09-02  
**Author:** Senior API & Security QA Specialist  
**Status:** **100% PASS (ALL 31 API ROUTES VERIFIED)**

---

## 1. Key API Endpoints & Contract Validation

| Endpoint | Method | Expected Status | Security Behavior | Actual Response Code | Status |
|:---|:---:|:---:|:---|:---:|:---:|
| `/api/auth/login` | `POST` | `200 OK` | Issues valid JWT + session cookie | `200 OK` | 🟢 **PASS** |
| `/api/auth/login` (Invalid) | `POST` | `401 Unauthorized` | Rejects bad password, 0 store grant | `401 Unauthorized` | 🟢 **PASS** |
| `/api/auth/tenants` | `GET` | `200 OK` | Lists only authorized tenants | `200 OK` (N=2 rows) | 🟢 **PASS** |
| `/api/auth/tenant/switch` | `POST` | `200 OK` | Refreshes claim in `app_metadata` | `200 OK` | 🟢 **PASS** |
| `/api/auth/tenant/switch` (Forged)| `POST` | `403 Forbidden` | Non-member switch rejected | `403 Forbidden` | 🟢 **PASS** |
| `/api/admin/employees` | `POST` | `201 Created` | Derives caller tenant server-side | `201 Created` | 🟢 **PASS** |
| `/api/admin/employees` (Capacity) | `POST` | `422 Unprocessable`| Enforces `tenants.max_employees` | `422 SEAT_LIMIT_REACHED`| 🟢 **PASS** |
| `/api/attendance/checkin` | `POST` | `200 OK` | Validates GPS & geofence boundary | `200 OK` | 🟢 **PASS** |
| `/api/leaves/apply` | `POST` | `200 OK` | Validates balance & creates request | `200 OK` | 🟢 **PASS** |
| `/api/sessions/revoke-others` | `POST` | `200 OK` | Marks secondary devices `is_revoked` | `200 OK` | 🟢 **PASS** |
| `/api/health` | `GET` | `200 OK` | System health check | `200 OK` | 🟢 **PASS** |
