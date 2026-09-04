# AttendX v2 — Isolated QA & Test Environment Guide

> **Environment Target:** `attendx-qa` (Supabase Project: `khaxowomjczuckfuraoh`)  
> **Safety Guarantee:** 100% isolated from the main/production database. Any testing, data generation, or stress tests performed here will NOT impact production.

---

## 1. Quick Setup for Teammates (3 Steps)

### Step 1: Clone & Configure `.env.local`
In the `attendx-v2` directory, create or update `.env.local`:

```bash
# Supabase QA Instance Credentials
NEXT_PUBLIC_SUPABASE_URL=https://khaxowomjczuckfuraoh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtoYXhvd29tamN6dWNrZnVyYW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzNTk2NTEsImV4cCI6MjEwMzkzNTY1MX0.4oNOYIfMcE42hKc3Dr9KHQFTyEW1nc1MHGTy5duj7Us
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtoYXhvd29tamN6dWNrZnVyYW9oIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODM1OTY1MSwiZXhwIjoyMTAzOTM1NjUxfQ.r9MrZMZ0jGriqnd321PWbNPF6fp0oetkB5NUifHDDNk

# Application Settings
NEXT_PUBLIC_APP_URL=http://localhost:3002
NODE_ENV=development
```

### Step 2: Start the Application
```bash
cd attendx-v2
npm install
npm run dev -- -p 3002
```

### Step 3: Open in Browser
Navigate to **`http://localhost:3002/auth/login`**

---

## 2. Test Accounts & Credentials

All test accounts use the standard password: **`Password123!`**

### 💻 Tenant 1: Acme Technologies (IT & Cloud SaaS)
* **Domain Focus:** Cloud Architecture, Software Engineering, DevOps shifts, Tech Park Geofences.
* **Accent Theme:** Indigo / Purple (`#6C63FF`)

| Role | Email | Password | Primary Test Scope |
|:---|:---|:---|:---|
| **Admin** | `admin@acme-tech.com` | `Password123!` | Full admin dashboard, employee roster, geofence zones, shifts, settings |
| **HR Partner** | `hr@acme-tech.com` | `Password123!` | Department directory, employee lifecycle, onboarding review |
| **Manager** | `manager@acme-tech.com` | `Password123!` | Team attendance glance, leave approvals, performance reviews |
| **Employee** | `employee@acme-tech.com` | `Password123!` | Clock-in/out, leave requests, peer recognition kudos, OKR goals |

---

### 🛒 Tenant 2: Globex Corp (Multi-Store Retail)
* **Domain Focus:** Store Floor Cashiers, Morning/Evening shifts, Retail MegaStore Geofences.
* **Accent Theme:** Sky Blue (`#0EA5E9`)

| Role | Email | Password | Primary Test Scope |
|:---|:---|:---|:---|
| **Admin** | `admin@globex-corp.com` | `Password123!` | Retail store admin, multi-branch geofencing, cashier rosters |
| **HR Partner** | `hr@globex-corp.com` | `Password123!` | Store staff management, shift rostering |
| **Manager** | `manager@globex-corp.com` | `Password123!` | Cashier approvals, shift swaps, store attendance tracking |
| **Employee** | `employee@globex-corp.com` | `Password123!` | Store clock-in, casual leave, peer kudos |

---

### 🏭 Tenant 3: Initech Ltd (Manufacturing & Operations)
* **Domain Focus:** CNC Machine Operators, 3-tier 24/7 plant shifts, Factory QC.
* **Accent Theme:** Amber / Gold (`#F59E0B`)

| Role | Email | Password | Primary Test Scope |
|:---|:---|:---|:---|
| **Admin** | `admin@initech-ltd.com` | `Password123!` | Plant-wide operations, 3-shift schedules, safety compliance |
| **HR Partner** | `hr@initech-ltd.com` | `Password123!` | Plant safety records, operator onboarding |
| **Manager** | `manager@initech-ltd.com` | `Password123!` | Assembly line approvals, factory attendance tracking |
| **Employee** | `employee@initech-ltd.com` | `Password123!` | Factory clock-in, earned leave, shift attendance |

---

## 3. Key Feature Scenarios to Test

1. **Multi-Tenant Data Isolation (Zero Data Leakage):**
   * Log into `admin@acme-tech.com` and notice Acme employees.
   * Log into `admin@globex-corp.com` and verify that Acme's data is 100% invisible.
2. **Dynamic Multi-Tenant Branding:**
   * Notice that the UI theme color and workspace title adapt automatically to each tenant.
3. **Geofenced Clock-In:**
   * Test the attendance module with valid/invalid GPS coordinates.
4. **Leave Management & Auto-Deduction:**
   * Apply for leave as an Employee $\to$ Approve as Manager $\to$ Verify balance deduction.
5. **Today-at-a-Glance Dashboard:**
   * Real-time attendance counters (Present, Absent, On Leave, Completed) calculated per tenant timezone.

---

## 4. Running the Automated QA Test Suite

To run the automated multi-tenant ERD and RBAC tests locally:

```bash
node qa/tests/erd-multi-tenant-qa.test.js
```

---

## 5. QA Reports & Documentation Reference
All formal verification audits and architectural reports are available in:
* `qa/reports/01-existing-system-analysis.md`
* `qa/reports/03-test-data-matrix.md`
* `qa/reports/04-tenant-isolation-report.md`
* `qa/reports/06-rbac-report.md`
* `qa/reports/11-final-qa-report.md`
