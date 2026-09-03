# AttendX v2 — Organization Isolation & Hierarchy Report (QA Phase 5)

**Document ID:** `QA-REPORT-05`  
**Date:** 2026-09-02  
**Author:** Senior Multi-Tenant QA Engineer  
**Status:** **ARCHITECTURAL CLARIFICATION & FINDINGS**

---

## 1. Executive Summary

This report evaluates how the existing AttendX application handles multi-organization and branch partitioning within and across tenants.

---

## 2. Core Architectural Findings

1. **Root Hierarchy Boundary:**
   * In the live database, the **`tenants`** table acts as the highest-level organizational and billing boundary.
   * There is **no dedicated `organizations` table** in the live database schema.
2. **Branch & Unit Representation in Live System:**
   * **Multi-Store / Multi-Branch Locations:** Modeled via **`geofences`** (e.g. *Chennai MegaStore #101*, *Bangalore Retail #204*).
   * **Departments & Units:** Modeled via **`departments`** (e.g. *Store Operations*, *Cashier Services*).
   * **Shifts & Rosters:** Modeled via **`shifts`** (e.g. *Morning Cashier Shift*, *Evening Shift*).
3. **Multi-Tenant / Multi-Company User Access:**
   * A single user belonging to multiple companies/branches is granted multiple records in **`user_roles`** (one row per `tenant_id`).
   * The user uses the **Multi-Tenant Switcher** (`switch_active_tenant`) to change active organizational context safely without cross-tenant data leakage.

---

## 3. QA Recommendation

* For enterprise deployments requiring a distinct `Tenant -> Organization -> Department` nesting, the existing architecture safely partitions organizations as separate isolated **Tenants** with unified multi-tenant login switcher support.
