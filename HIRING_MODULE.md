# AttendX — Hiring & Talent Acquisition Module

Comprehensive technical documentation for the AttendX Multi-Tenant Hiring Module.

---

## 1. System Architecture & Product Hierarchy

AttendX follows a strictly partitioned multi-tenant SaaS hierarchy:
```
Tenant (Company / Organization)
└── Departments
    └── Employees / Users
        └── Hiring Suite
            ├── 1. AI Sourcing & Discovery
            ├── 2. AI Outreach & Engagement
            ├── 3. Voice AI Calling & Automated Screening
            ├── 4. AI Screening & Structured Evaluations (Module B)
            ├── 5. Automated Onboarding & Digital Offers (Module C)
            └── 6. Hiring Analytics & Insights (Module D)
```

---

## 2. Core Invariants & Security Guarantees

1. **Multi-Tenancy Authoritative Isolation**:
   - `organization_id` is **never** accepted from untrusted client request bodies.
   - It is resolved authoritatively from the authenticated session context via `ServerIdentity.getAuthoritativeCaller()`.
   - All database tables enforce Row Level Security (`tenant_isolation_policy` checking `organization_id = auth.jwt() ->> 'tenant_id'`).

2. **PII Encryption & Role-Based Masking**:
   - Sensitive applicant data (phone, salary, candidate sensitive attributes) is encrypted with **AES-256-GCM** using an initialization vector and authentication tag.
   - Compensation values (`fixed_salary`, `variable_salary`, `bonus`, `total_ctc`) are masked as `🔒 [Confidential]` for unprivileged roles (`EMPLOYEE`), visible only to `SUPERADMIN`, `ADMIN`, `HR`, and `MANAGER`.

3. **AI Safety Invariant (Human-in-the-Loop)**:
   - AI algorithms compute match scores, extract resume entities, initiate voice screening calls, and generate summaries.
   - **AI NEVER makes hiring, shortlisting, or rejection decisions autonomously.**
   - All state transitions (`SHORTLISTED`, `SELECTED`, `REJECTED`, `OFFER_RELEASED`, `ONBOARDED`) require explicit human recruiter authorization.
   - Match scoring algorithms strictly ignore demographic attributes: candidate name, gender, age, photo, and current compensation are excluded from feature weights.

4. **Zero Push / Local Git Integrity**:
   - No code is pushed to remote git repositories.

---

## 3. Unified State Machine

The candidate pipeline transitions through a deterministic finite state machine (`lib/hiring/state-machine.ts`):

```
SOURCED
   │
   ▼
CONTACTED
   │
   ▼
APPLIED
   │
   ▼
SHORTLISTED
   │
   ▼
INTERVIEW
   │
   ▼
SELECTED
   │
   ├──► OFFER_INTEREST_SENT ──► OFFER_ACCEPTED ──► DOCUMENTS_PENDING
   │                                                    │
   ▼                                                    ▼
OFFER_RELEASED (via single-use 7-day token)      DOCUMENTS_VERIFIED
   │                                                    │
   ▼                                                    ▼
OFFER_FINAL_ACCEPTED ────────────────────────────► ONBOARDED (Converted to Employee)
```

### Side-Exit Transitions
- `REJECTED`: Permitted from `APPLIED`, `SHORTLISTED`, `INTERVIEW`, `SELECTED`.
- `WITHDRAWN`: Permitted by candidate at any pre-onboarding stage.
- `OFFER_DECLINED`: Candidate declines preliminary interest.
- `OFFER_FINAL_DECLINED`: Candidate declines formal offer in candidate portal.

Invalid transitions throw an authoritative **HTTP 409 Conflict** (`HiringStateConflictError`).

---

## 4. Sub-Modules Overview

### Sub-Module 1: Applications & Pipeline
- **URL**: `/hiring/applications`
- **Features**:
  - Filterable candidate table (by requisition, stage, min match score).
  - Algorithmic match score badges with popover breakdown:
    $$\text{Score} = (\text{Skills} \times 0.50) + (\text{Experience} \times 0.30) + (\text{JD Relevance} \times 0.20)$$
  - Single and bulk action: "Move to Interview".
  - Interview scheduling modal with multi-platform conference link generation (Google Meet, Zoom, Teams), interviewer conflict check, and standard RFC 5545 `.ics` calendar generation.
  - Candidate details drawer with parsed resume text and timeline.

### Sub-Module 2: AI Sourcing
- **URL**: `/hiring/sourcing`
- **Features**:
  - Multi-platform talent search (Internal Database, LinkedIn stub, GitHub stub).
  - Algorithmic candidate ranking.
  - Human recruiter "Shortlist Candidate" CTA into active requisition pipeline.

### Sub-Module 3: AI Outreach & Engagement
- **URL**: `/hiring/outreach`
- **Features**:
  - Multi-channel campaigns (Email, SMS, WhatsApp).
  - Dynamic templates with Mustache variable interpolation (`{{candidate_name}}`, `{{job_title}}`, etc.).
  - Delivery and response tracking (Sent, Delivered, Opened, Replied, Bounced).

### Sub-Module 4: Interview Status & AI Screening (Module B)
- **URL**: `/hiring/interview-status`
- **Features**:
  - Multi-round stepper (Rounds completed vs total rounds).
  - Evaluator scorecards (Technical, Communication, Problem Solving, Culture Fit).
  - Voice AI automated screening call trigger (Vapi / Twilio / Mock).
  - Human recruiter decision buttons (`Mark Selected` or `Reject`).
  - "Generate Offer & Move to Onboard" CTA.

### Sub-Module 5: Automated Onboarding & Offers (Module C)
- **URL**: `/hiring/onboard`
- **Public Portal**: `/offer-portal/[token]`
- **Features**:
  - Formal offer extension with single-use 7-day SHA-256 candidate portal tokens.
  - Candidate portal: Digital letter, CTC breakup, terms, electronic signature acknowledgment (`e_ack_name`), and Accept/Decline action.
  - Document verification interface (Verify, Request Re-upload, Reject) for `ID_PROOF`, `EDUCATION_CERTIFICATE`, `PREVIOUS_EMPLOYMENT`, `SALARY_SLIP`, `BANK_DETAILS`.
  - Onboarding checklist (IT equipment, HR background check, biometric badge, team orientation).
  - "Convert to Employee" CTA linking candidate to `employees` / `profiles` table.

### Sub-Module 6: Analytics & Insights (Module D)
- **URL**: `/hiring/analytics`
- **Features**:
  - Funnel progression and conversion rates across stages.
  - Stage duration & bottleneck detection ($>3.0$ days alert).
  - Overall time-to-hire calculation.
  - Candidate competency evaluation matrix vs target benchmarks.
  - Proactive AI recommendations (sourcing gaps, compensation benchmarks, interview panel capacity).

---

## 5. Database Schema (28 Tables)

| # | Table | Purpose |
|---|---|---|
| 1 | `job_requisitions` | Open positions, headcount, salary bands, status |
| 2 | `job_requisition_skills` | Required & preferred skills with weights |
| 3 | `candidates` | Sourced/applied talent with encrypted PII |
| 4 | `candidate_skills` | Candidate-specific skill tags and experience |
| 5 | `candidate_resumes` | Stored resume files and extracted text |
| 6 | `sourcing_searches` | Sourcing search queries and metadata |
| 7 | `sourced_candidates` | Sourced external profiles with preliminary match score |
| 8 | `outreach_campaigns` | Multi-candidate outreach campaigns |
| 9 | `outreach_templates` | Email/SMS templates with variable placeholders |
| 10 | `outreach_messages` | Individual dispatched messages and open tracking |
| 11 | `outreach_followups` | Automated follow-up sequencing steps |
| 12 | `ai_voice_calls` | Voice AI call transcripts, duration, sentiment, summaries |
| 13 | `assessments` | Pre-interview technical or cognitive tests |
| 14 | `job_applications` | Core state machine junction (Requisition $\leftrightarrow$ Candidate) |
| 15 | `ai_screenings` | Multi-factor AI screening scores & proposals |
| 16 | `candidate_assessments`| Candidate test submissions and evaluation |
| 17 | `hiring_funnel_events`| Stage transition events for funnel analytics |
| 18 | `hiring_audit_logs` | Immutable audit log of all hiring mutations |
| 19 | `interviews` | Scheduled interview rounds, links, and notes |
| 20 | `candidate_evaluations`| Evaluator scorecards and hire recommendations |
| 21 | `offer_portal_tokens` | Single-use 7-day hashed tokens for candidate portal |
| 22 | `job_offers` | Formal offer terms, CTC breakup, electronic signature |
| 23 | `onboarding_processes`| Onboarding workflow and completion progress |
| 24 | `onboarding_documents`| Submitted candidate verification documents |
| 25 | `onboarding_tasks` | Cross-department onboarding tasks |
| 26 | `hiring_analytics_snapshots`| Daily analytics snapshots for reporting |
| 27 | `hiring_ai_recommendations`| Proactive pipeline optimization recommendations |
| 28 | `org_score_weights` | Configurable multi-factor match score weights |

---

## 6. Provider Interfaces & Stubs

All third-party integrations are defined behind modular TypeScript interfaces with clean stubs marked `// TODO(provider: ...)`:
- `MeetingProvider` (`lib/hiring/meeting-provider.ts`): Google Meet, Zoom, Microsoft Teams, RFC 5545 `.ics`
- `EmailProvider` (`lib/hiring/email-provider.ts`): SendGrid, SMTP, Twilio SMS
- `SourcingProvider` (`lib/hiring/sourcing-provider.ts`): Internal Database, LinkedIn, GitHub
- `VoiceProvider` (`lib/hiring/voice-provider.ts`): Vapi, Twilio Programmable Voice, Mock

---

## 7. REST API Endpoints Summary

- `GET|POST /api/hiring/requisitions`
- `GET|PATCH|DELETE /api/hiring/requisitions/[id]`
- `POST /api/hiring/requisitions/[id]/clone`
- `GET|POST /api/hiring/candidates`
- `GET|PATCH|DELETE /api/hiring/candidates/[id]`
- `POST /api/hiring/candidates/[id]/resume`
- `GET|POST /api/hiring/applications`
- `PATCH /api/hiring/applications/[id]/stage`
- `POST /api/hiring/applications/[id]/move-to-interview`
- `POST /api/hiring/applications/bulk-action`
- `POST /api/hiring/sourcing/searches`
- `POST /api/hiring/sourcing/shortlist`
- `GET|POST /api/hiring/outreach/campaigns`
- `GET|POST /api/hiring/outreach/templates`
- `POST /api/hiring/voice/call`
- `POST /api/hiring/voice/webhook`
- `GET|POST /api/hiring/offers`
- `POST /api/hiring/offers/[id]/release`
- `GET|POST /api/hiring/offer-portal/[token]`
- `GET /api/hiring/onboarding`
- `GET /api/hiring/onboarding/[id]`
- `POST|PATCH /api/hiring/onboarding/documents`
- `PATCH /api/hiring/onboarding/tasks`
- `POST /api/hiring/onboarding/convert-employee`
- `GET /api/hiring/analytics/funnel`
- `GET /api/hiring/analytics/recommendations`
