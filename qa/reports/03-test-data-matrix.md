# AttendX v2 — Synthetic Test Data Matrix across 5 Domains (QA Phase 3)

**Document ID:** `QA-REPORT-03`  
**Date:** 2026-09-02  
**Author:** Senior SDET & Multi-Tenant Specialist  
**Status:** **100% SPECIFIED & STANDALONE READY**

---

## 1. Multi-Industry Domain Roster & Setup Matrix

| Identifier | Domain / Industry | Synthetic Company Name | Slug | Planned Seats | Shifts Setup | Geofences Setup |
|:---|:---|:---|:---|:---:|:---|:---|
| `TENANT-IT` | IT / Cloud Tech | **AcmeTech Solutions** | `acmetech` | 500 | Core 9:30–18:30, US On-Call | Bangalore Tech Park (250m) |
| `TENANT-RETAIL` | Retail Supermarkets | **RetailMart India** | `retailmart` | 1000 | Morning 6–14:30, Evening Store | Chennai #101, Bangalore #204 |
| `TENANT-MFG` | Heavy Manufacturing | **Precision Manufacturing** | `precision-mfg`| 750 | 3 Rotational 8h Shifts (Day/Eve/Night)| Pune Plant #1 (350m) |
| `TENANT-LOGISTICS`| Express Logistics | **SwiftLogix Express** | `swiftlogix` | 600 | 24h Fleet Shift | Central Logistics Hub (400m) |
| `TENANT-EDU` | Higher Education | **FutureLearn Academy** | `futurelearn` | 400 | Academic Lecture Shift | Main University Campus (500m) |

---

## 2. Test Volume Target Matrix

| Entity Category | Target Test Volume | Synthetic Identifier Prefix | Current Status |
|:---|:---:|:---:|:---:|
| **Tenants** | 5 | `TENANT-*` | 🟢 Verified Isolated |
| **Departments** | 20+ | `DEPT-*` | 🟢 Mapped per Tenant |
| **Designations** | 25+ | `DESIG-*` | 🟢 Mapped per Tenant |
| **Employees** | 100+ | `IT-EMP-*`, `RET-EMP-*`, etc. | 🟢 Roster Established |
| **Attendance Records** | 300+ | `ATT-*` | 🟢 Work Calculations Verified |
| **Leave Requests** | 50+ | `LEV-*` | 🟢 Balances Deducted |
| **Performance Goals** | 50+ | `GOAL-*` | 🟢 Cycle Linked |
| **Recognition Kudos** | 30+ | `REC-*` | 🟢 Points Leaderboard Live |
| **Audit Log Entries** | 100+ | `AUD-*` | 🟢 Trigger Recorded |
