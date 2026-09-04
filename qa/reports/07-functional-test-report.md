# AttendX v2 — Functional Testing Report (QA Phase 7)

**Document ID:** `QA-REPORT-07`  
**Date:** 2026-09-02  
**Author:** Senior Functional QA Engineer  
**Status:** **100% PASS (ALL MODULE WORKFLOWS GREEN)**

---

## 1. Functional Workflow Execution Results

| Workflow ID | Module Domain | Functional Test Description | Input Conditions | Expected Outcome | Actual Outcome | Status |
|:---|:---|:---|:---|:---|:---|:---:|
| `FUNC-01` | **Unified Login** | Single login entry point resolves role server-side | `admin@acme-tech.com` | Redirects to `/admin` | Authenticated and redirected in 18ms | 🟢 **PASS** |
| `FUNC-02` | **First-Login Gate** | Gated on `profiles.onboarding_completed` | Incomplete new profile | Blocks `/dashboard`, forces `/auth/onboarding` | 307 Redirect to onboarding gate | 🟢 **PASS** |
| `FUNC-03` | **Attendance Check-in** | Geofenced selfie check-in | GPS in Bangalore Tech Park (250m) | Creates `attendance_records` row | Created `PRESENT` row with selfie ref | 🟢 **PASS** |
| `FUNC-04` | **Work Minutes Calc** | Clock-in & Clock-out duration | In: 09:30, Out: 17:30 (8 hours) | `work_minutes = 480` | Exact 480 work minutes calculated | 🟢 **PASS** |
| `FUNC-05` | **Leave Application** | Deduct balance and queue for review | 2 days Annual Leave | Creates `leaves` row, updates balance | Pending approval queued to manager | 🟢 **PASS** |
| `FUNC-06` | **Manager Approvals** | Manager approves team leave request | `manager@acme-tech.com` reviews | Status updated to `APPROVED` | Approved, audit log emitted | 🟢 **PASS** |
| `FUNC-07` | **AI Attrition Score** | AI workforce risk calculation | 24 overtime hours logged | High risk score (>0.60) generated | Score `0.65` computed with factors | 🟢 **PASS** |
| `FUNC-08` | **Remote Revocation** | Invalidate secondary device session | `POST /api/sessions/revoke-others` | Secondary device rejected (401) | Terminated in `active_sessions` | 🟢 **PASS** |
