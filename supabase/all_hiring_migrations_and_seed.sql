-- ============================================================
-- AttendX Module 4: Hiring & Talent Acquisition Complete Migration Bundle
-- Target: attendx-qa (Supabase Project: khaxowomjczuckfuraoh) or local PostgreSQL
-- Order: 019_hiring_schema -> 022_is_required -> 023_rls_hardening -> 024_work_mode_dates -> 002_seed
-- Safe, idempotent, non-destructive execution
-- ============================================================

-- ============================================================
-- AttendX v2 — Migration 017: Comprehensive Hiring Module Schema
-- Compliant with AttendX multi-tenancy (tenants/organizations)
-- Spec: Sections 1 to 26 + Approved Enhancements & Unified State Machine
-- ============================================================

-- Ensure pgcrypto and uuid extensions are active
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Compatibility view so queries referencing "organizations" resolve to "tenants"
CREATE OR REPLACE VIEW public.organizations AS
  SELECT * FROM public.tenants;

-- Helper function to resolve current organization ID (aliases to get_my_tenant_id)
CREATE OR REPLACE FUNCTION public.get_my_organization_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT public.get_my_tenant_id();
$$;

-- Generic updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_hiring_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- 1. JOB REQUISITIONS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_requisitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  requisition_code TEXT NOT NULL,
  title TEXT NOT NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  designation_id UUID REFERENCES public.designations(id) ON DELETE SET NULL,
  hiring_manager_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recruiter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'OPEN', 'ON_HOLD', 'CLOSED')),
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  openings_count INT NOT NULL DEFAULT 1 CHECK (openings_count >= 1),
  filled_count INT NOT NULL DEFAULT 0 CHECK (filled_count >= 0),
  location TEXT,
  employment_type TEXT NOT NULL DEFAULT 'FULL_TIME' CHECK (employment_type IN ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP')),
  min_experience_years NUMERIC(4,1) DEFAULT 0,
  max_experience_years NUMERIC(4,1) DEFAULT 0,
  min_salary NUMERIC(14,2),
  max_salary NUMERIC(14,2),
  job_description TEXT,
  total_rounds INT NOT NULL DEFAULT 3 CHECK (total_rounds >= 1),
  google_form_url TEXT,
  document_mode TEXT NOT NULL DEFAULT 'NATIVE' CHECK (document_mode IN ('NATIVE', 'GOOGLE_FORM')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_requisition_code_per_org UNIQUE (organization_id, requisition_code)
);

DROP TRIGGER IF EXISTS trg_job_requisitions_updated_at ON public.job_requisitions;
CREATE TRIGGER trg_job_requisitions_updated_at
  BEFORE UPDATE ON public.job_requisitions
  FOR EACH ROW EXECUTE FUNCTION public.set_hiring_updated_at();

-- ------------------------------------------------------------
-- 2. JOB REQUISITION SKILLS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_requisition_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  requisition_id UUID NOT NULL REFERENCES public.job_requisitions(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  weight INT NOT NULL DEFAULT 1 CHECK (weight >= 1 AND weight <= 10),
  min_experience_years NUMERIC(4,1) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_requisition_skill UNIQUE (requisition_id, skill_name)
);

-- ------------------------------------------------------------
-- 3. CANDIDATES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  current_company TEXT,
  current_designation TEXT,
  total_experience_years NUMERIC(4,1) DEFAULT 0,
  location TEXT,
  current_ctc TEXT, -- Encrypted at rest
  expected_ctc TEXT, -- Encrypted at rest
  notice_period_days INT, -- Encrypted / restricted
  resume_url TEXT,
  raw_resume_text TEXT,
  source TEXT NOT NULL DEFAULT 'CAREER_SITE',
  consent_status TEXT NOT NULL DEFAULT 'GIVEN' CHECK (consent_status IN ('GIVEN', 'WITHDRAWN', 'EXPIRED')),
  consent_given_at TIMESTAMPTZ DEFAULT NOW(),
  data_retention_until TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '365 days'),
  is_anonymized BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_candidates_org_lower_email
  ON public.candidates (organization_id, lower(email))
  WHERE email IS NOT NULL AND is_anonymized = FALSE;

DROP TRIGGER IF EXISTS trg_candidates_updated_at ON public.candidates;
CREATE TRIGGER trg_candidates_updated_at
  BEFORE UPDATE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.set_hiring_updated_at();

-- ------------------------------------------------------------
-- 4. CANDIDATE SKILLS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.candidate_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  experience_years NUMERIC(4,1) DEFAULT 0,
  proficiency_level TEXT NOT NULL DEFAULT 'INTERMEDIATE' CHECK (proficiency_level IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT')),
  verified_by_ai BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_candidate_skill UNIQUE (candidate_id, skill_name)
);

CREATE INDEX IF NOT EXISTS idx_candidate_skills_name ON public.candidate_skills(skill_name);

-- ------------------------------------------------------------
-- 5. CANDIDATE RESUMES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.candidate_resumes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INT,
  mime_type TEXT,
  parsed_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 6. SOURCING SEARCHES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sourcing_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  requisition_id UUID REFERENCES public.job_requisitions(id) ON DELETE SET NULL,
  search_title TEXT NOT NULL,
  platforms JSONB NOT NULL DEFAULT '["internal_db"]'::jsonb,
  skills_filter JSONB NOT NULL DEFAULT '[]'::jsonb,
  min_experience NUMERIC(4,1) DEFAULT 0,
  max_experience NUMERIC(4,1),
  location TEXT,
  status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
  total_results_count INT NOT NULL DEFAULT 0,
  executed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 7. SOURCED CANDIDATES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sourced_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  search_id UUID NOT NULL REFERENCES public.sourcing_searches(id) ON DELETE CASCADE,
  requisition_id UUID REFERENCES public.job_requisitions(id) ON DELETE SET NULL,
  external_id TEXT,
  platform TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  profile_url TEXT,
  "current_role" TEXT,
  current_company TEXT,
  experience_years NUMERIC(4,1) DEFAULT 0,
  skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  match_score NUMERIC(5,2) DEFAULT 0,
  skill_score NUMERIC(5,2) DEFAULT 0,
  experience_score NUMERIC(5,2) DEFAULT 0,
  role_score NUMERIC(5,2) DEFAULT 0,
  ai_reasoning JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_shortlisted BOOLEAN NOT NULL DEFAULT FALSE,
  shortlisted_candidate_id UUID REFERENCES public.candidates(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 8. OUTREACH CAMPAIGNS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outreach_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  requisition_id UUID REFERENCES public.job_requisitions(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED')),
  channels JSONB NOT NULL DEFAULT '["EMAIL"]'::jsonb,
  total_targeted INT NOT NULL DEFAULT 0,
  total_sent INT NOT NULL DEFAULT 0,
  total_delivered INT NOT NULL DEFAULT 0,
  total_opened INT NOT NULL DEFAULT 0,
  total_replied INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_outreach_campaigns_updated_at ON public.outreach_campaigns;
CREATE TRIGGER trg_outreach_campaigns_updated_at
  BEFORE UPDATE ON public.outreach_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_hiring_updated_at();

-- ------------------------------------------------------------
-- 9. OUTREACH TEMPLATES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outreach_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'EMAIL' CHECK (channel IN ('EMAIL', 'WHATSAPP', 'SMS')),
  subject TEXT,
  body_template TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_ai_customizable BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_outreach_templates_updated_at ON public.outreach_templates;
CREATE TRIGGER trg_outreach_templates_updated_at
  BEFORE UPDATE ON public.outreach_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_hiring_updated_at();

-- ------------------------------------------------------------
-- 10. OUTREACH MESSAGES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outreach_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.outreach_campaigns(id) ON DELETE SET NULL,
  candidate_id UUID REFERENCES public.candidates(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'EMAIL' CHECK (channel IN ('EMAIL', 'WHATSAPP', 'SMS')),
  recipient TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'DELIVERED', 'OPENED', 'REPLIED', 'FAILED', 'BOUNCED')),
  error_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 11. OUTREACH FOLLOWUPS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outreach_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.outreach_campaigns(id) ON DELETE CASCADE,
  step_number INT NOT NULL DEFAULT 1,
  delay_days INT NOT NULL DEFAULT 3,
  template_id UUID REFERENCES public.outreach_templates(id) ON DELETE SET NULL,
  condition_type TEXT NOT NULL DEFAULT 'NO_REPLY' CHECK (condition_type IN ('NO_REPLY', 'NO_OPEN', 'ALWAYS')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 12. AI VOICE CALLS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_voice_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  requisition_id UUID REFERENCES public.job_requisitions(id) ON DELETE SET NULL,
  call_provider TEXT NOT NULL DEFAULT 'VAPI',
  provider_call_id TEXT,
  phone_number TEXT NOT NULL,
  call_purpose TEXT NOT NULL DEFAULT 'SCREENING' CHECK (call_purpose IN ('SCREENING', 'SCHEDULING', 'FOLLOW_UP')),
  status TEXT NOT NULL DEFAULT 'INITIATED' CHECK (status IN ('INITIATED', 'IN_PROGRESS', 'COMPLETED', 'BUSY', 'NO_ANSWER', 'FAILED')),
  duration_seconds INT DEFAULT 0,
  recording_url TEXT,
  transcript TEXT,
  ai_summary TEXT,
  overall_score NUMERIC(5,2),
  sentiment TEXT CHECK (sentiment IN ('POSITIVE', 'NEUTRAL', 'NEGATIVE')),
  extracted_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  model_name TEXT,
  model_version TEXT,
  webhook_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_ai_voice_calls_updated_at ON public.ai_voice_calls;
CREATE TRIGGER trg_ai_voice_calls_updated_at
  BEFORE UPDATE ON public.ai_voice_calls
  FOR EACH ROW EXECUTE FUNCTION public.set_hiring_updated_at();

-- ------------------------------------------------------------
-- 13. ASSESSMENTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  requisition_id UUID REFERENCES public.job_requisitions(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  time_limit_minutes INT DEFAULT 45 CHECK (time_limit_minutes >= 5),
  passing_score NUMERIC(5,2) DEFAULT 60.00,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_assessments_updated_at ON public.assessments;
CREATE TRIGGER trg_assessments_updated_at
  BEFORE UPDATE ON public.assessments
  FOR EACH ROW EXECUTE FUNCTION public.set_hiring_updated_at();

-- ------------------------------------------------------------
-- 14. JOB APPLICATIONS (Unified State Machine Core)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  application_code TEXT NOT NULL,
  requisition_id UUID NOT NULL REFERENCES public.job_requisitions(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT 'APPLIED' CHECK (stage IN (
    'SOURCED', 'CONTACTED', 'APPLIED', 'SHORTLISTED', 'INTERVIEW', 'SELECTED',
    'OFFER_INTEREST_SENT', 'OFFER_ACCEPTED', 'DOCUMENTS_PENDING', 'DOCUMENTS_VERIFIED',
    'OFFER_RELEASED', 'OFFER_FINAL_ACCEPTED', 'ONBOARDED',
    'REJECTED', 'WITHDRAWN', 'OFFER_DECLINED', 'OFFER_FINAL_DECLINED'
  )),
  match_score NUMERIC(5,2) DEFAULT 0,
  skill_score NUMERIC(5,2) DEFAULT 0,
  experience_score NUMERIC(5,2) DEFAULT 0,
  jd_relevance_score NUMERIC(5,2) DEFAULT 0,
  match_reasoning JSONB NOT NULL DEFAULT '{}'::jsonb,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_decision TEXT NOT NULL DEFAULT 'PENDING' CHECK (current_decision IN ('PENDING', 'SELECTED', 'REJECTED', 'ONBOARDING')),
  rejection_reason TEXT,
  withdrawal_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_app_code_per_org UNIQUE (organization_id, application_code),
  CONSTRAINT uq_app_candidate_requisition UNIQUE (organization_id, requisition_id, candidate_id)
);

DROP TRIGGER IF EXISTS trg_job_applications_updated_at ON public.job_applications;
CREATE TRIGGER trg_job_applications_updated_at
  BEFORE UPDATE ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_hiring_updated_at();

-- ------------------------------------------------------------
-- 15. AI SCREENINGS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_screenings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  requisition_id UUID REFERENCES public.job_requisitions(id) ON DELETE SET NULL,
  application_id UUID REFERENCES public.job_applications(id) ON DELETE CASCADE,
  skill_assessment_score NUMERIC(5,2) DEFAULT 0,
  relevancy_score NUMERIC(5,2) DEFAULT 0,
  communication_score NUMERIC(5,2) DEFAULT 0,
  culture_fit_score NUMERIC(5,2) DEFAULT 0,
  overall_score NUMERIC(5,2) DEFAULT 0,
  strengths JSONB NOT NULL DEFAULT '[]'::jsonb,
  weaknesses JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendations TEXT,
  detailed_analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
  human_reviewed BOOLEAN NOT NULL DEFAULT FALSE,
  human_reviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  human_decision TEXT CHECK (human_decision IN ('ACCEPT', 'REJECT', 'MODIFY')),
  model_name TEXT NOT NULL DEFAULT 'claude-3-7-sonnet',
  model_version TEXT NOT NULL DEFAULT '20250219',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_ai_screenings_updated_at ON public.ai_screenings;
CREATE TRIGGER trg_ai_screenings_updated_at
  BEFORE UPDATE ON public.ai_screenings
  FOR EACH ROW EXECUTE FUNCTION public.set_hiring_updated_at();

-- ------------------------------------------------------------
-- 16. CANDIDATE ASSESSMENTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.candidate_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  assessment_id UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  application_id UUID REFERENCES public.job_applications(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ASSIGNED' CHECK (status IN ('ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'EVALUATED', 'EXPIRED')),
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  score NUMERIC(5,2),
  passed BOOLEAN,
  ai_evaluation JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  evaluated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 17. HIRING FUNNEL EVENTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hiring_funnel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 18. HIRING AUDIT LOGS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hiring_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 19. INTERVIEWS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  round_number INT NOT NULL DEFAULT 1 CHECK (round_number >= 1),
  round_type TEXT NOT NULL DEFAULT 'TECHNICAL' CHECK (round_type IN ('HR', 'TECHNICAL', 'MANAGERIAL', 'FINAL')),
  title TEXT NOT NULL,
  scheduled_start TIMESTAMPTZ NOT NULL,
  scheduled_end TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  platform TEXT NOT NULL DEFAULT 'GOOGLE_MEET' CHECK (platform IN ('ZOOM', 'GOOGLE_MEET', 'TEAMS', 'IN_PERSON', 'PHONE')),
  meeting_link TEXT,
  meeting_provider_event_id TEXT,
  interviewer_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'RESCHEDULED', 'CANCELLED')),
  notes TEXT,
  ai_summary TEXT,
  ai_summary_edited BOOLEAN NOT NULL DEFAULT FALSE,
  decision TEXT DEFAULT 'PENDING' CHECK (decision IN ('PENDING', 'PASS', 'FAIL', 'ON_HOLD')),
  decision_reason TEXT,
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_interviews_updated_at ON public.interviews;
CREATE TRIGGER trg_interviews_updated_at
  BEFORE UPDATE ON public.interviews
  FOR EACH ROW EXECUTE FUNCTION public.set_hiring_updated_at();

-- ------------------------------------------------------------
-- 20. CANDIDATE EVALUATIONS (Human Scorecards)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.candidate_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  interview_id UUID REFERENCES public.interviews(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  evaluator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  technical_score NUMERIC(5,2) DEFAULT 0,
  communication_score NUMERIC(5,2) DEFAULT 0,
  problem_solving_score NUMERIC(5,2) DEFAULT 0,
  culture_fit_score NUMERIC(5,2) DEFAULT 0,
  overall_score NUMERIC(5,2) DEFAULT 0,
  scorecard_feedback TEXT,
  recommendation TEXT NOT NULL DEFAULT 'HIRE' CHECK (recommendation IN ('STRONG_HIRE', 'HIRE', 'MAYBE', 'NO_HIRE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_candidate_evaluations_updated_at ON public.candidate_evaluations;
CREATE TRIGGER trg_candidate_evaluations_updated_at
  BEFORE UPDATE ON public.candidate_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.set_hiring_updated_at();

-- ------------------------------------------------------------
-- 21. OFFER PORTAL TOKENS (Secure Candidate Portal Links)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.offer_portal_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK (purpose IN ('INTEREST', 'DOCUMENTS', 'FINAL_OFFER')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  attempt_count INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 22. JOB OFFERS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  offer_number TEXT NOT NULL,
  designation TEXT NOT NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  fixed_salary NUMERIC(14,2) NOT NULL DEFAULT 0,
  variable_salary NUMERIC(14,2) NOT NULL DEFAULT 0,
  bonus NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_ctc NUMERIC(14,2) NOT NULL DEFAULT 0,
  work_location TEXT NOT NULL DEFAULT 'Headquarters',
  work_mode TEXT NOT NULL DEFAULT 'HYBRID' CHECK (work_mode IN ('REMOTE', 'ONSITE', 'HYBRID')),
  reporting_manager_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  joining_date DATE NOT NULL,
  probation_months INT NOT NULL DEFAULT 3 CHECK (probation_months >= 0),
  benefits JSONB NOT NULL DEFAULT '[]'::jsonb,
  terms_and_conditions TEXT,
  offer_letter_url TEXT,
  approval_status TEXT NOT NULL DEFAULT 'APPROVED' CHECK (approval_status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED')),
  sent_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  decline_reason TEXT,
  e_ack_name TEXT,
  e_ack_timestamp TIMESTAMPTZ,
  e_ack_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_offer_number_per_org UNIQUE (organization_id, offer_number)
);

DROP TRIGGER IF EXISTS trg_job_offers_updated_at ON public.job_offers;
CREATE TRIGGER trg_job_offers_updated_at
  BEFORE UPDATE ON public.job_offers
  FOR EACH ROW EXECUTE FUNCTION public.set_hiring_updated_at();

-- ------------------------------------------------------------
-- 23. ONBOARDING PROCESSES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.onboarding_processes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  offer_id UUID REFERENCES public.job_offers(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN (
    'NOT_STARTED', 'IN_PROGRESS', 'DOCUMENTS_PENDING', 'DOCUMENTS_VERIFIED', 'COMPLETED', 'TERMINATED'
  )),
  completion_percentage NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
  target_completion_date DATE,
  termination_reason TEXT,
  terminated_at TIMESTAMPTZ,
  terminated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_onboarding_processes_updated_at ON public.onboarding_processes;
CREATE TRIGGER trg_onboarding_processes_updated_at
  BEFORE UPDATE ON public.onboarding_processes
  FOR EACH ROW EXECUTE FUNCTION public.set_hiring_updated_at();

-- ------------------------------------------------------------
-- 24. ONBOARDING DOCUMENTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.onboarding_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  onboarding_id UUID NOT NULL REFERENCES public.onboarding_processes(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN (
    'ID_PROOF', 'EDUCATION_CERTIFICATE', 'PREVIOUS_EMPLOYMENT', 'SALARY_SLIP', 'BANK_DETAILS', 'RESUME', 'PHOTO'
  )),
  document_name TEXT NOT NULL,
  file_url TEXT,
  file_size INT,
  mime_type TEXT,
  status TEXT NOT NULL DEFAULT 'NOT_SUBMITTED' CHECK (status IN (
    'NOT_SUBMITTED', 'SUBMITTED', 'VERIFIED', 'PENDING', 'REJECTED'
  )),
  reviewer_comment TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  scan_status TEXT NOT NULL DEFAULT 'CLEAN' CHECK (scan_status IN ('PENDING', 'CLEAN', 'INFECTED')),
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_onboarding_documents_updated_at ON public.onboarding_documents;
CREATE TRIGGER trg_onboarding_documents_updated_at
  BEFORE UPDATE ON public.onboarding_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_hiring_updated_at();

-- ------------------------------------------------------------
-- 25. ONBOARDING TASKS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.onboarding_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  onboarding_id UUID NOT NULL REFERENCES public.onboarding_processes(id) ON DELETE CASCADE,
  task_name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'IT' CHECK (category IN ('IT', 'HR', 'ADMIN', 'ORIENTATION')),
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED')),
  due_date DATE,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_onboarding_tasks_updated_at ON public.onboarding_tasks;
CREATE TRIGGER trg_onboarding_tasks_updated_at
  BEFORE UPDATE ON public.onboarding_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_hiring_updated_at();

-- ------------------------------------------------------------
-- 26. HIRING ANALYTICS SNAPSHOTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hiring_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_analytics_snapshot UNIQUE (organization_id, snapshot_date)
);

-- ------------------------------------------------------------
-- 27. HIRING AI RECOMMENDATIONS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hiring_ai_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  requisition_id UUID REFERENCES public.job_requisitions(id) ON DELETE SET NULL,
  recommendation_type TEXT NOT NULL CHECK (recommendation_type IN ('BOTTLENECK', 'SOURCING_GAP', 'SALARY_BENCHMARK', 'CANDIDATE_NEXT_STEP')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  impact_score NUMERIC(5,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED')),
  review_notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  model_name TEXT,
  model_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 28. ORG SCORE WEIGHTS (Customizable Multi-factor Scoring)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.org_score_weights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  skills_weight NUMERIC(5,2) NOT NULL DEFAULT 30.00,
  interview_weight NUMERIC(5,2) NOT NULL DEFAULT 25.00,
  experience_weight NUMERIC(5,2) NOT NULL DEFAULT 15.00,
  communication_weight NUMERIC(5,2) NOT NULL DEFAULT 15.00,
  assessment_weight NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  culture_fit_weight NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_org_score_weights_updated_at ON public.org_score_weights;
CREATE TRIGGER trg_org_score_weights_updated_at
  BEFORE UPDATE ON public.org_score_weights
  FOR EACH ROW EXECUTE FUNCTION public.set_hiring_updated_at();

-- ============================================================
-- INDEXES ON ALL FOREIGN KEYS & COMMONLY QUERIED COLUMNS
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_job_requisitions_org ON public.job_requisitions(organization_id);
CREATE INDEX IF NOT EXISTS idx_job_requisitions_dept ON public.job_requisitions(department_id);
CREATE INDEX IF NOT EXISTS idx_job_requisitions_desig ON public.job_requisitions(designation_id);
CREATE INDEX IF NOT EXISTS idx_job_requisitions_status ON public.job_requisitions(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_job_req_skills_req ON public.job_requisition_skills(requisition_id);
CREATE INDEX IF NOT EXISTS idx_job_req_skills_org ON public.job_requisition_skills(organization_id);

CREATE INDEX IF NOT EXISTS idx_candidates_org ON public.candidates(organization_id);
CREATE INDEX IF NOT EXISTS idx_candidates_retention ON public.candidates(data_retention_until) WHERE is_anonymized = FALSE;

CREATE INDEX IF NOT EXISTS idx_candidate_skills_cand ON public.candidate_skills(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_skills_org ON public.candidate_skills(organization_id);

CREATE INDEX IF NOT EXISTS idx_candidate_resumes_cand ON public.candidate_resumes(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_resumes_org ON public.candidate_resumes(organization_id);

CREATE INDEX IF NOT EXISTS idx_sourcing_searches_org ON public.sourcing_searches(organization_id);
CREATE INDEX IF NOT EXISTS idx_sourcing_searches_req ON public.sourcing_searches(requisition_id);

CREATE INDEX IF NOT EXISTS idx_sourced_cand_search ON public.sourced_candidates(search_id);
CREATE INDEX IF NOT EXISTS idx_sourced_cand_req ON public.sourced_candidates(requisition_id);
CREATE INDEX IF NOT EXISTS idx_sourced_cand_org ON public.sourced_candidates(organization_id);

CREATE INDEX IF NOT EXISTS idx_outreach_campaigns_org ON public.outreach_campaigns(organization_id);
CREATE INDEX IF NOT EXISTS idx_outreach_templates_org ON public.outreach_templates(organization_id);

CREATE INDEX IF NOT EXISTS idx_outreach_messages_camp ON public.outreach_messages(campaign_id);
CREATE INDEX IF NOT EXISTS idx_outreach_messages_cand ON public.outreach_messages(candidate_id);
CREATE INDEX IF NOT EXISTS idx_outreach_messages_org ON public.outreach_messages(organization_id);

CREATE INDEX IF NOT EXISTS idx_outreach_followups_camp ON public.outreach_followups(campaign_id);
CREATE INDEX IF NOT EXISTS idx_outreach_followups_org ON public.outreach_followups(organization_id);

CREATE INDEX IF NOT EXISTS idx_ai_voice_calls_cand ON public.ai_voice_calls(candidate_id);
CREATE INDEX IF NOT EXISTS idx_ai_voice_calls_req ON public.ai_voice_calls(requisition_id);
CREATE INDEX IF NOT EXISTS idx_ai_voice_calls_org ON public.ai_voice_calls(organization_id);

CREATE INDEX IF NOT EXISTS idx_assessments_req ON public.assessments(requisition_id);
CREATE INDEX IF NOT EXISTS idx_assessments_org ON public.assessments(organization_id);

CREATE INDEX IF NOT EXISTS idx_job_app_org ON public.job_applications(organization_id);
CREATE INDEX IF NOT EXISTS idx_job_app_req ON public.job_applications(requisition_id);
CREATE INDEX IF NOT EXISTS idx_job_app_cand ON public.job_applications(candidate_id);
CREATE INDEX IF NOT EXISTS idx_job_app_stage ON public.job_applications(organization_id, stage);

CREATE INDEX IF NOT EXISTS idx_ai_screenings_app ON public.ai_screenings(application_id);
CREATE INDEX IF NOT EXISTS idx_ai_screenings_cand ON public.ai_screenings(candidate_id);
CREATE INDEX IF NOT EXISTS idx_ai_screenings_org ON public.ai_screenings(organization_id);

CREATE INDEX IF NOT EXISTS idx_candidate_assess_app ON public.candidate_assessments(application_id);
CREATE INDEX IF NOT EXISTS idx_candidate_assess_cand ON public.candidate_assessments(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_assess_org ON public.candidate_assessments(organization_id);

CREATE INDEX IF NOT EXISTS idx_funnel_events_app ON public.hiring_funnel_events(application_id);
CREATE INDEX IF NOT EXISTS idx_funnel_events_org ON public.hiring_funnel_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_funnel_events_stage ON public.hiring_funnel_events(to_stage);

CREATE INDEX IF NOT EXISTS idx_hiring_audit_org ON public.hiring_audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_hiring_audit_entity ON public.hiring_audit_logs(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_interviews_app ON public.interviews(application_id);
CREATE INDEX IF NOT EXISTS idx_interviews_cand ON public.interviews(candidate_id);
CREATE INDEX IF NOT EXISTS idx_interviews_org ON public.interviews(organization_id);
CREATE INDEX IF NOT EXISTS idx_interviews_status ON public.interviews(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_cand_eval_interview ON public.candidate_evaluations(interview_id);
CREATE INDEX IF NOT EXISTS idx_cand_eval_app ON public.candidate_evaluations(application_id);
CREATE INDEX IF NOT EXISTS idx_cand_eval_cand ON public.candidate_evaluations(candidate_id);
CREATE INDEX IF NOT EXISTS idx_cand_eval_org ON public.candidate_evaluations(organization_id);

CREATE INDEX IF NOT EXISTS idx_offer_tokens_hash ON public.offer_portal_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_offer_tokens_app ON public.offer_portal_tokens(application_id);
CREATE INDEX IF NOT EXISTS idx_offer_tokens_org ON public.offer_portal_tokens(organization_id);

CREATE INDEX IF NOT EXISTS idx_job_offers_app ON public.job_offers(application_id);
CREATE INDEX IF NOT EXISTS idx_job_offers_cand ON public.job_offers(candidate_id);
CREATE INDEX IF NOT EXISTS idx_job_offers_org ON public.job_offers(organization_id);

CREATE INDEX IF NOT EXISTS idx_onboarding_proc_app ON public.onboarding_processes(application_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_proc_cand ON public.onboarding_processes(candidate_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_proc_org ON public.onboarding_processes(organization_id);

CREATE INDEX IF NOT EXISTS idx_onboarding_docs_proc ON public.onboarding_documents(onboarding_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_docs_org ON public.onboarding_documents(organization_id);

CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_proc ON public.onboarding_tasks(onboarding_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_org ON public.onboarding_tasks(organization_id);

CREATE INDEX IF NOT EXISTS idx_analytics_snap_org ON public.hiring_analytics_snapshots(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_recs_org ON public.hiring_ai_recommendations(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_recs_req ON public.hiring_ai_recommendations(requisition_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Multi-tenant isolation enforced at database level
-- ============================================================

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'job_requisitions', 'job_requisition_skills', 'candidates', 'candidate_skills',
    'candidate_resumes', 'sourcing_searches', 'sourced_candidates', 'outreach_campaigns',
    'outreach_templates', 'outreach_messages', 'outreach_followups', 'ai_voice_calls',
    'assessments', 'job_applications', 'ai_screenings', 'candidate_assessments',
    'hiring_funnel_events', 'hiring_audit_logs', 'interviews', 'candidate_evaluations',
    'offer_portal_tokens', 'job_offers', 'onboarding_processes', 'onboarding_documents',
    'onboarding_tasks', 'hiring_analytics_snapshots', 'hiring_ai_recommendations', 'org_score_weights'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', tbl);
    
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', tbl || '_tenant_isolation', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (organization_id = public.get_my_tenant_id() OR auth.role() = ''service_role'');',
      tbl || '_tenant_isolation', tbl
    );
  END LOOP;
END $$;


-- ============================================================
-- Migration 022: Add is_required flag to onboarding_tasks
-- Allows tasks to be marked as required or optional for Joining Readiness
-- ============================================================

ALTER TABLE public.onboarding_tasks 
ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT true;


-- ============================================================
-- AttendX v2 — Migration 023: Hiring Module RLS Hardening
-- Enforces strict role-based access control (RBAC) and multi-tenant
-- isolation across all 28 hiring tables at the database level.
--
-- Security Rules:
-- 1. Restrict workforce recruitment data to SUPERADMIN, ADMIN, HR, and MANAGER.
-- 2. Explicitly DENY ordinary EMPLOYEE access from recruitment records.
-- 3. Scope queries strictly by organization_id = public.get_my_tenant_id().
-- 4. Audit logs (hiring_audit_logs) are append-only:
--    - SELECT: SUPERADMIN, ADMIN, HR, service_role
--    - INSERT: SUPERADMIN, ADMIN, HR, MANAGER, service_role
--    - UPDATE / DELETE: service_role only
-- 5. Funnel events (hiring_funnel_events) are immutable:
--    - SELECT / INSERT: SUPERADMIN, ADMIN, HR, MANAGER, service_role
--    - UPDATE / DELETE: service_role only
-- 6. Offer portal tokens & candidate-facing tables:
--    - Public / candidate actions are mediated via backend service_role.
--    - Direct workforce access restricted to authorized roles within tenant.
--    - Anonymous (anon) direct table access blocked (fail-closed).
-- 7. Both USING and WITH CHECK clauses are enforced on all write policies.
-- ============================================================

-- Ensure pgcrypto extension is active
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
DECLARE
  tbl text;
  -- 26 standard hiring tables (Workforce: SUPERADMIN, ADMIN, HR, MANAGER)
  standard_tables text[] := ARRAY[
    'job_requisitions',
    'job_requisition_skills',
    'candidates',
    'candidate_skills',
    'candidate_resumes',
    'sourcing_searches',
    'sourced_candidates',
    'outreach_campaigns',
    'outreach_templates',
    'outreach_messages',
    'outreach_followups',
    'ai_voice_calls',
    'assessments',
    'job_applications',
    'ai_screenings',
    'candidate_assessments',
    'interviews',
    'candidate_evaluations',
    'offer_portal_tokens',
    'job_offers',
    'onboarding_processes',
    'onboarding_documents',
    'onboarding_tasks',
    'hiring_analytics_snapshots',
    'hiring_ai_recommendations',
    'org_score_weights'
  ];
BEGIN
  -- ----------------------------------------------------------
  -- 1. Standard Hiring Tables: Restrict to SUPERADMIN, ADMIN, HR, MANAGER
  -- ----------------------------------------------------------
  FOREACH tbl IN ARRAY standard_tables LOOP
    -- Enable and Force RLS
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', tbl);

    -- Drop legacy policies
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', tbl || '_tenant_isolation', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', tbl || '_workforce_isolation', tbl);

    -- Create hardened workforce isolation policy (USING + WITH CHECK)
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (
        (organization_id = public.get_my_tenant_id() AND public.has_role(ARRAY[''SUPERADMIN'', ''ADMIN'', ''HR'', ''MANAGER'']::user_role[]))
        OR auth.role() = ''service_role''
      ) WITH CHECK (
        (organization_id = public.get_my_tenant_id() AND public.has_role(ARRAY[''SUPERADMIN'', ''ADMIN'', ''HR'', ''MANAGER'']::user_role[]))
        OR auth.role() = ''service_role''
      );',
      tbl || '_workforce_isolation', tbl
    );
  END LOOP;

  -- ----------------------------------------------------------
  -- 2. Audit Logs (hiring_audit_logs): Tamper-evident, Append-only
  -- ----------------------------------------------------------
  EXECUTE 'ALTER TABLE public.hiring_audit_logs ENABLE ROW LEVEL SECURITY;';
  EXECUTE 'ALTER TABLE public.hiring_audit_logs FORCE ROW LEVEL SECURITY;';
  EXECUTE 'DROP POLICY IF EXISTS hiring_audit_logs_tenant_isolation ON public.hiring_audit_logs;';
  EXECUTE 'DROP POLICY IF EXISTS hiring_audit_logs_select ON public.hiring_audit_logs;';
  EXECUTE 'DROP POLICY IF EXISTS hiring_audit_logs_insert ON public.hiring_audit_logs;';
  EXECUTE 'DROP POLICY IF EXISTS hiring_audit_logs_update ON public.hiring_audit_logs;';
  EXECUTE 'DROP POLICY IF EXISTS hiring_audit_logs_delete ON public.hiring_audit_logs;';

  -- SELECT: SUPERADMIN, ADMIN, HR, service_role (Managers & Employees denied)
  EXECUTE 'CREATE POLICY hiring_audit_logs_select ON public.hiring_audit_logs FOR SELECT USING (
    (organization_id = public.get_my_tenant_id() AND public.has_role(ARRAY[''SUPERADMIN'', ''ADMIN'', ''HR'']::user_role[]))
    OR auth.role() = ''service_role''
  );';

  -- INSERT: SUPERADMIN, ADMIN, HR, MANAGER, service_role (append-only)
  EXECUTE 'CREATE POLICY hiring_audit_logs_insert ON public.hiring_audit_logs FOR INSERT WITH CHECK (
    (organization_id = public.get_my_tenant_id() AND public.has_role(ARRAY[''SUPERADMIN'', ''ADMIN'', ''HR'', ''MANAGER'']::user_role[]))
    OR auth.role() = ''service_role''
  );';

  -- UPDATE: service_role ONLY (audits cannot be modified by users)
  EXECUTE 'CREATE POLICY hiring_audit_logs_update ON public.hiring_audit_logs FOR UPDATE USING (
    auth.role() = ''service_role''
  ) WITH CHECK (
    auth.role() = ''service_role''
  );';

  -- DELETE: service_role ONLY (audits cannot be deleted by users)
  EXECUTE 'CREATE POLICY hiring_audit_logs_delete ON public.hiring_audit_logs FOR DELETE USING (
    auth.role() = ''service_role''
  );';

  -- ----------------------------------------------------------
  -- 3. Funnel Events (hiring_funnel_events): Immutable Stage Event Stream
  -- ----------------------------------------------------------
  EXECUTE 'ALTER TABLE public.hiring_funnel_events ENABLE ROW LEVEL SECURITY;';
  EXECUTE 'ALTER TABLE public.hiring_funnel_events FORCE ROW LEVEL SECURITY;';
  EXECUTE 'DROP POLICY IF EXISTS hiring_funnel_events_tenant_isolation ON public.hiring_funnel_events;';
  EXECUTE 'DROP POLICY IF EXISTS hiring_funnel_events_select ON public.hiring_funnel_events;';
  EXECUTE 'DROP POLICY IF EXISTS hiring_funnel_events_insert ON public.hiring_funnel_events;';
  EXECUTE 'DROP POLICY IF EXISTS hiring_funnel_events_update ON public.hiring_funnel_events;';
  EXECUTE 'DROP POLICY IF EXISTS hiring_funnel_events_delete ON public.hiring_funnel_events;';

  -- SELECT: SUPERADMIN, ADMIN, HR, MANAGER, service_role
  EXECUTE 'CREATE POLICY hiring_funnel_events_select ON public.hiring_funnel_events FOR SELECT USING (
    (organization_id = public.get_my_tenant_id() AND public.has_role(ARRAY[''SUPERADMIN'', ''ADMIN'', ''HR'', ''MANAGER'']::user_role[]))
    OR auth.role() = ''service_role''
  );';

  -- INSERT: SUPERADMIN, ADMIN, HR, MANAGER, service_role (append-only)
  EXECUTE 'CREATE POLICY hiring_funnel_events_insert ON public.hiring_funnel_events FOR INSERT WITH CHECK (
    (organization_id = public.get_my_tenant_id() AND public.has_role(ARRAY[''SUPERADMIN'', ''ADMIN'', ''HR'', ''MANAGER'']::user_role[]))
    OR auth.role() = ''service_role''
  );';

  -- UPDATE: service_role ONLY
  EXECUTE 'CREATE POLICY hiring_funnel_events_update ON public.hiring_funnel_events FOR UPDATE USING (
    auth.role() = ''service_role''
  ) WITH CHECK (
    auth.role() = ''service_role''
  );';

  -- DELETE: service_role ONLY
  EXECUTE 'CREATE POLICY hiring_funnel_events_delete ON public.hiring_funnel_events FOR DELETE USING (
    auth.role() = ''service_role''
  );';

END $$;


-- ============================================================
-- Migration 024: Add work_mode, opening_date, and target_close_date to job_requisitions
-- Module 4.1 Job Requisition Schema Alignment
-- Backward-compatible, additive schema change with safe defaults
-- ============================================================

ALTER TABLE public.job_requisitions
  ADD COLUMN IF NOT EXISTS work_mode TEXT NOT NULL DEFAULT 'HYBRID' CHECK (work_mode IN ('REMOTE', 'ONSITE', 'HYBRID')),
  ADD COLUMN IF NOT EXISTS opening_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS target_close_date DATE;

-- Add check constraint to ensure target_close_date is >= opening_date if provided
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_requisitions_target_close_date_check'
  ) THEN
    ALTER TABLE public.job_requisitions
      ADD CONSTRAINT job_requisitions_target_close_date_check
      CHECK (target_close_date IS NULL OR opening_date IS NULL OR target_close_date >= opening_date);
  END IF;
END $$;


-- ============================================================
-- AttendX v2 — Seed Data: Hiring Module (002_hiring_seed.sql)
-- 2 Tenants × 2 Requisitions each × 20+ Candidates Across All Funnel Stages
-- Provides complete data for Pipeline Kanban, Sourcing, Outreach, Voice AI,
-- Screening, Interviews, Onboarding, Documents, and Analytics dashboards
-- ============================================================

-- ------------------------------------------------------------
-- 1. DEPARTMENTS & DESIGNATIONS (Ensure present for Acme & Globex)
-- ------------------------------------------------------------
INSERT INTO public.departments (id, tenant_id, name, description) VALUES
  ('11111111-2222-3333-4444-000000000001', '11111111-0000-0000-0000-000000000001', 'Engineering', 'Core platform and product engineering'),
  ('11111111-2222-3333-4444-000000000002', '11111111-0000-0000-0000-000000000001', 'Product & Design', 'Product management and UI/UX design'),
  ('22222222-2222-3333-4444-000000000001', '22222222-0000-0000-0000-000000000002', 'Infrastructure', 'Cloud, Site Reliability & DevOps'),
  ('22222222-2222-3333-4444-000000000002', '22222222-0000-0000-0000-000000000002', 'Design Studio', 'Enterprise experience and visual design')
ON CONFLICT (tenant_id, name) DO NOTHING;

INSERT INTO public.designations (id, tenant_id, name, level) VALUES
  ('11111111-3333-4444-5555-000000000001', '11111111-0000-0000-0000-000000000001', 'Senior Full-Stack Engineer', 4),
  ('11111111-3333-4444-5555-000000000002', '11111111-0000-0000-0000-000000000001', 'AI Systems Engineer', 4),
  ('22222222-3333-4444-5555-000000000001', '22222222-0000-0000-0000-000000000002', 'Senior DevOps Engineer', 4),
  ('22222222-3333-4444-5555-000000000002', '22222222-0000-0000-0000-000000000002', 'Senior Product Designer', 3)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- ------------------------------------------------------------
-- 2. ORG SCORE WEIGHTS
-- ------------------------------------------------------------
INSERT INTO public.org_score_weights (organization_id, skills_weight, interview_weight, experience_weight, communication_weight, assessment_weight, culture_fit_weight)
VALUES
  ('11111111-0000-0000-0000-000000000001', 30.00, 25.00, 15.00, 15.00, 10.00, 5.00),
  ('22222222-0000-0000-0000-000000000002', 30.00, 25.00, 15.00, 15.00, 10.00, 5.00)
ON CONFLICT (organization_id) DO UPDATE SET updated_at = NOW();

-- ------------------------------------------------------------
-- 3. JOB REQUISITIONS (2 for Acme, 2 for Globex)
-- ------------------------------------------------------------
INSERT INTO public.job_requisitions (
  id, organization_id, requisition_code, title, department_id, designation_id,
  hiring_manager_id, recruiter_id, status, priority, openings_count, filled_count,
  location, employment_type, min_experience_years, max_experience_years,
  min_salary, max_salary, job_description, total_rounds, document_mode
) VALUES
  (
    'a1000000-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000001',
    'REQ-ACME-001',
    'Senior Full-Stack Engineer',
    '11111111-2222-3333-4444-000000000001',
    '11111111-3333-4444-5555-000000000001',
    '11111111-1111-1111-1111-444444444444',
    '11111111-1111-1111-1111-333333333333',
    'OPEN',
    'HIGH',
    3,
    1,
    'Bengaluru, India (Hybrid)',
    'FULL_TIME',
    4.0,
    8.0,
    1800000.00,
    2800000.00,
    'We are looking for a Senior Full-Stack Engineer with strong TypeScript, React 19, Next.js, and PostgreSQL expertise to lead architecture for our scalable enterprise modules.',
    3,
    'NATIVE'
  ),
  (
    'a1000000-0000-0000-0000-000000000002',
    '11111111-0000-0000-0000-000000000001',
    'REQ-ACME-002',
    'AI Systems Engineer',
    '11111111-2222-3333-4444-000000000001',
    '11111111-3333-4444-5555-000000000002',
    '11111111-1111-1111-1111-444444444444',
    '11111111-1111-1111-1111-333333333333',
    'OPEN',
    'URGENT',
    2,
    0,
    'Remote / Bengaluru',
    'FULL_TIME',
    3.0,
    7.0,
    2200000.00,
    3500000.00,
    'Seeking an AI Engineer with deep knowledge of LLM orchestrations, RAG architectures, LangChain, semantic embeddings, and vector databases.',
    4,
    'NATIVE'
  ),
  (
    'a2000000-0000-0000-0000-000000000001',
    '22222222-0000-0000-0000-000000000002',
    'REQ-GLB-001',
    'Senior DevOps Engineer',
    '22222222-2222-3333-4444-000000000001',
    '22222222-3333-4444-5555-000000000001',
    '22222222-2222-2222-2222-444444444444',
    '22222222-2222-2222-2222-333333333333',
    'OPEN',
    'HIGH',
    2,
    0,
    'New York, NY (Hybrid)',
    'FULL_TIME',
    5.0,
    10.0,
    140000.00,
    180000.00,
    'Lead our multi-cloud Kubernetes infrastructure, CI/CD pipelines, Terraform automation, and observability stack.',
    3,
    'NATIVE'
  ),
  (
    'a2000000-0000-0000-0000-000000000002',
    '22222222-0000-0000-0000-000000000002',
    'REQ-GLB-002',
    'Senior Product Designer',
    '22222222-2222-3333-4444-000000000002',
    '22222222-3333-4444-5555-000000000002',
    '22222222-2222-2222-2222-444444444444',
    '22222222-2222-2222-2222-333333333333',
    'OPEN',
    'MEDIUM',
    1,
    0,
    'San Francisco / Remote',
    'FULL_TIME',
    4.0,
    8.0,
    120000.00,
    160000.00,
    'Design intuitive enterprise workflows, design tokens, design systems, and rapid interactive prototypes.',
    3,
    'NATIVE'
  )
ON CONFLICT (organization_id, requisition_code) DO NOTHING;

-- ------------------------------------------------------------
-- 4. REQUISITION SKILLS
-- ------------------------------------------------------------
INSERT INTO public.job_requisition_skills (organization_id, requisition_id, skill_name, is_required, weight, min_experience_years) VALUES
  ('11111111-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'React', TRUE, 4, 3.0),
  ('11111111-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'TypeScript', TRUE, 5, 3.0),
  ('11111111-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Node.js', TRUE, 4, 3.0),
  ('11111111-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'PostgreSQL', TRUE, 4, 2.0),
  ('11111111-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Next.js', FALSE, 3, 2.0),
  ('11111111-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'Python', TRUE, 5, 3.0),
  ('11111111-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'LLM Architectures', TRUE, 5, 2.0),
  ('11111111-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'Vector Databases', TRUE, 4, 1.5)
ON CONFLICT (requisition_id, skill_name) DO NOTHING;

-- ------------------------------------------------------------
-- 5. CANDIDATES (20 realistic candidates)
-- ------------------------------------------------------------
INSERT INTO public.candidates (
  id, organization_id, first_name, last_name, email, phone, current_company,
  current_designation, total_experience_years, location, current_ctc, expected_ctc,
  notice_period_days, source, consent_status
) VALUES
  -- Acme Candidates
  ('c1000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Aarav', 'Sharma', 'aarav.sharma@example.com', '+91 98765 43210', 'Infosys', 'Senior Software Engineer', 6.0, 'Bengaluru', 'enc:ctc:1600000', 'enc:ctc:2200000', 30, 'LINKEDIN', 'GIVEN'),
  ('c1000000-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'Ananya', 'Iyer', 'ananya.iyer@example.com', '+91 98765 43211', 'Flipkart', 'Full Stack Developer', 5.5, 'Bengaluru', 'enc:ctc:2000000', 'enc:ctc:2600000', 15, 'REFERRAL', 'GIVEN'),
  ('c1000000-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', 'Rohan', 'Verma', 'rohan.verma@example.com', '+91 98765 43212', 'Swiggy', 'Lead Backend Engineer', 7.5, 'Hyderabad', 'enc:ctc:2400000', 'enc:ctc:3000000', 45, 'NAUKRI', 'GIVEN'),
  ('c1000000-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001', 'Priya', 'Nair', 'priya.nair@example.com', '+91 98765 43213', 'Amazon', 'SDE II', 4.5, 'Bengaluru', 'enc:ctc:2200000', 'enc:ctc:2800000', 30, 'SOURCED', 'GIVEN'),
  ('c1000000-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001', 'Siddharth', 'Mehta', 'siddharth.mehta@example.com', '+91 98765 43214', 'Razorpay', 'Senior Frontend Engineer', 5.0, 'Bengaluru', 'enc:ctc:1900000', 'enc:ctc:2500000', 30, 'CAREER_SITE', 'GIVEN'),
  ('c1000000-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000001', 'Kavita', 'Reddy', 'kavita.reddy@example.com', '+91 98765 43215', 'Wipro', 'Tech Lead', 8.0, 'Chennai', 'enc:ctc:2500000', 'enc:ctc:3200000', 60, 'INDEED', 'GIVEN'),
  ('c1000000-0000-0000-0000-000000000007', '11111111-0000-0000-0000-000000000001', 'Vikram', 'Patel', 'vikram.patel@example.com', '+91 98765 43216', 'Freshworks', 'Senior React Developer', 6.2, 'Bengaluru', 'enc:ctc:2100000', 'enc:ctc:2700000', 30, 'GITHUB', 'GIVEN'),
  ('c1000000-0000-0000-0000-000000000008', '11111111-0000-0000-0000-000000000001', 'Neha', 'Deshmukh', 'neha.deshmukh@example.com', '+91 98765 43217', 'Zomato', 'Software Engineer', 3.5, 'Delhi NCR', 'enc:ctc:1500000', 'enc:ctc:2000000', 15, 'CAREER_SITE', 'GIVEN'),
  ('c1000000-0000-0000-0000-000000000009', '11111111-0000-0000-0000-000000000001', 'Aditya', 'Joshi', 'aditya.joshi@example.com', '+91 98765 43218', 'Microsoft', 'Software Engineer II', 5.0, 'Hyderabad', 'enc:ctc:2300000', 'enc:ctc:2900000', 30, 'LINKEDIN', 'GIVEN'),
  ('c1000000-0000-0000-0000-000000000010', '11111111-0000-0000-0000-000000000001', 'Sneha', 'Kulkarni', 'sneha.kulkarni@example.com', '+91 98765 43219', 'TCS', 'Senior Associate', 6.5, 'Pune', 'enc:ctc:1700000', 'enc:ctc:2300000', 45, 'NAUKRI', 'GIVEN'),

  -- Globex Candidates
  ('c2000000-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 'Liam', 'Smith', 'liam.smith@example.com', '+1 555-0101', 'Datadog', 'Senior SRE', 7.0, 'New York, NY', 'enc:ctc:155000', 'enc:ctc:175000', 14, 'LINKEDIN', 'GIVEN'),
  ('c2000000-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002', 'Emma', 'Johnson', 'emma.johnson@example.com', '+1 555-0102', 'Figma', 'Product Designer', 5.0, 'San Francisco, CA', 'enc:ctc:135000', 'enc:ctc:155000', 14, 'DRIBBBLE', 'GIVEN'),
  ('c2000000-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000002', 'Noah', 'Brown', 'noah.brown@example.com', '+1 555-0103', 'Cloudflare', 'Cloud Engineer', 6.5, 'Austin, TX', 'enc:ctc:145000', 'enc:ctc:165000', 30, 'GITHUB', 'GIVEN'),
  ('c2000000-0000-0000-0000-000000000004', '22222222-0000-0000-0000-000000000002', 'Olivia', 'Davis', 'olivia.davis@example.com', '+1 555-0104', 'Stripe', 'UX Researcher', 4.5, 'Seattle, WA', 'enc:ctc:130000', 'enc:ctc:150000', 14, 'LINKEDIN', 'GIVEN'),
  ('c2000000-0000-0000-0000-000000000005', '22222222-0000-0000-0000-000000000002', 'William', 'Miller', 'william.miller@example.com', '+1 555-0105', 'Twilio', 'DevOps Specialist', 8.0, 'Remote', 'enc:ctc:160000', 'enc:ctc:185000', 30, 'CAREER_SITE', 'GIVEN'),
  ('c2000000-0000-0000-0000-000000000006', '22222222-0000-0000-0000-000000000002', 'Sophia', 'Wilson', 'sophia.wilson@example.com', '+1 555-0106', 'Airbnb', 'Senior Product Designer', 6.0, 'San Francisco, CA', 'enc:ctc:150000', 'enc:ctc:170000', 14, 'REFERRAL', 'GIVEN'),
  ('c2000000-0000-0000-0000-000000000007', '22222222-0000-0000-0000-000000000002', 'James', 'Taylor', 'james.taylor@example.com', '+1 555-0107', 'HashiCorp', 'Infrastructure Architect', 9.0, 'Boston, MA', 'enc:ctc:175000', 'enc:ctc:200000', 30, 'SOURCED', 'GIVEN'),
  ('c2000000-0000-0000-0000-000000000008', '22222222-0000-0000-0000-000000000002', 'Isabella', 'Anderson', 'isabella.anderson@example.com', '+1 555-0108', 'Notion', 'Brand & UI Designer', 4.0, 'New York, NY', 'enc:ctc:120000', 'enc:ctc:140000', 14, 'INDEED', 'GIVEN'),
  ('c2000000-0000-0000-0000-000000000009', '22222222-0000-0000-0000-000000000002', 'Benjamin', 'Thomas', 'benjamin.thomas@example.com', '+1 555-0109', 'Spotify', 'Site Reliability Engineer', 5.5, 'Remote', 'enc:ctc:140000', 'enc:ctc:160000', 30, 'LINKEDIN', 'GIVEN'),
  ('c2000000-0000-0000-0000-000000000010', '22222222-0000-0000-0000-000000000002', 'Mia', 'Jackson', 'mia.jackson@example.com', '+1 555-0110', 'Canva', 'Visual Designer', 3.8, 'Remote', 'enc:ctc:110000', 'enc:ctc:130000', 14, 'DRIBBBLE', 'GIVEN')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 6. CANDIDATE SKILLS
-- ------------------------------------------------------------
INSERT INTO public.candidate_skills (organization_id, candidate_id, skill_name, experience_years, proficiency_level, verified_by_ai) VALUES
  ('11111111-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'React', 5.0, 'EXPERT', TRUE),
  ('11111111-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'TypeScript', 4.5, 'ADVANCED', TRUE),
  ('11111111-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Node.js', 5.0, 'ADVANCED', TRUE),
  ('11111111-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'PostgreSQL', 4.0, 'INTERMEDIATE', TRUE),
  ('11111111-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'React', 4.5, 'ADVANCED', TRUE),
  ('11111111-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'Next.js', 3.5, 'ADVANCED', TRUE),
  ('11111111-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'TypeScript', 4.0, 'ADVANCED', TRUE),
  ('11111111-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003', 'Node.js', 7.0, 'EXPERT', TRUE),
  ('11111111-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003', 'PostgreSQL', 6.0, 'EXPERT', TRUE),
  ('11111111-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000004', 'React', 4.0, 'INTERMEDIATE', FALSE),
  ('11111111-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000005', 'React', 4.5, 'ADVANCED', TRUE)
ON CONFLICT (candidate_id, skill_name) DO NOTHING;

-- ------------------------------------------------------------
-- 7. JOB APPLICATIONS ACROSS ALL FUNNEL STAGES
-- ------------------------------------------------------------
INSERT INTO public.job_applications (
  id, organization_id, application_code, requisition_id, candidate_id, stage,
  match_score, skill_score, experience_score, jd_relevance_score, current_decision, match_reasoning
) VALUES
  -- 1. SOURCED
  ('b1000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'APP-2026-001', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000004', 'SOURCED', 62.50, 60.00, 65.00, 62.50, 'PENDING', '{"summary": "Discovered via LinkedIn Sourcing. 4.5 years experience aligns with range."}'),
  
  -- 2. CONTACTED
  ('b1000000-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'APP-2026-002', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000006', 'CONTACTED', 72.00, 75.00, 80.00, 65.00, 'PENDING', '{"summary": "Outreach email sent; candidate confirmed receipt."}'),

  -- 3. APPLIED
  ('b1000000-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', 'APP-2026-003', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000007', 'APPLIED', 82.50, 85.00, 80.00, 82.00, 'PENDING', '{"summary": "Direct career site application with verified GitHub repository."}'),
  ('b1000000-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001', 'APP-2026-004', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000008', 'APPLIED', 48.00, 45.00, 50.00, 50.00, 'PENDING', '{"summary": "Junior experience profile below 4 years baseline."}'),

  -- 4. SHORTLISTED
  ('b1000000-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001', 'APP-2026-005', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000009', 'SHORTLISTED', 88.00, 90.00, 85.00, 89.00, 'PENDING', '{"summary": "Shortlisted by Recruiter. Excellent React and TypeScript track record."}'),

  -- 5. INTERVIEW
  ('b1000000-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000001', 'APP-2026-006', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000005', 'INTERVIEW', 84.00, 85.00, 82.00, 85.00, 'PENDING', '{"summary": "Technical round 1 completed; managerial round scheduled."}'),

  -- 6. SELECTED
  ('b1000000-0000-0000-0000-000000000007', '11111111-0000-0000-0000-000000000001', 'APP-2026-007', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003', 'SELECTED', 92.50, 95.00, 90.00, 93.00, 'SELECTED', '{"summary": "All rounds cleared with Strong Hire recommendations across interviewers."}'),

  -- 7. OFFER_INTEREST_SENT
  ('b1000000-0000-0000-0000-000000000008', '11111111-0000-0000-0000-000000000001', 'APP-2026-008', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'OFFER_INTEREST_SENT', 89.00, 90.00, 88.00, 89.00, 'SELECTED', '{"summary": "Offer interest letter sent via candidate portal."}'),

  -- 8. OFFER_ACCEPTED
  ('b1000000-0000-0000-0000-000000000009', '11111111-0000-0000-0000-000000000001', 'APP-2026-009', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000010', 'OFFER_ACCEPTED', 81.00, 80.00, 85.00, 80.00, 'SELECTED', '{"summary": "Candidate accepted preliminary interest terms."}'),

  -- 9. DOCUMENTS_PENDING
  ('b1000000-0000-0000-0000-000000000010', '11111111-0000-0000-0000-000000000001', 'APP-2026-010', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'DOCUMENTS_PENDING', 94.00, 96.00, 92.00, 94.00, 'SELECTED', '{"summary": "Candidate submitted 4 of 6 required documents for verification."}'),

  -- 10. REJECTED
  ('b1000000-0000-0000-0000-000000000011', '11111111-0000-0000-0000-000000000001', 'APP-2026-011', 'a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000004', 'REJECTED', 52.00, 50.00, 55.00, 52.00, 'REJECTED', '{"summary": "Technical bar not met for LLM architecture requirements."}'),

  -- Globex Applications
  ('b2000000-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 'APP-GLB-001', 'a2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'DOCUMENTS_VERIFIED', 91.00, 92.00, 90.00, 91.00, 'SELECTED', '{"summary": "All credentials verified. Offer letter generation pending."}'),
  ('b2000000-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002', 'APP-GLB-002', 'a2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000003', 'OFFER_RELEASED', 93.50, 95.00, 92.00, 94.00, 'SELECTED', '{"summary": "Official offer letter released via portal."}'),
  ('b2000000-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000002', 'APP-GLB-003', 'a2000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000002', 'OFFER_FINAL_ACCEPTED', 95.00, 96.00, 94.00, 95.00, 'SELECTED', '{"summary": "Signed and accepted offer letter received. Conversion to employee ready."}'),
  ('b2000000-0000-0000-0000-000000000004', '22222222-0000-0000-0000-000000000002', 'APP-GLB-004', 'a2000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000006', 'ONBOARDED', 96.00, 98.00, 95.00, 96.00, 'ONBOARDING', '{"summary": "Successfully converted to full-time employee."}')
ON CONFLICT (organization_id, application_code) DO NOTHING;

-- ------------------------------------------------------------
-- 8. HIRING FUNNEL EVENTS
-- ------------------------------------------------------------
INSERT INTO public.hiring_funnel_events (organization_id, application_id, from_stage, to_stage, metadata) VALUES
  ('11111111-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', NULL, 'SOURCED', '{"source": "LINKEDIN"}'),
  ('11111111-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'SOURCED', 'CONTACTED', '{"channel": "EMAIL"}'),
  ('11111111-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000005', 'APPLIED', 'SHORTLISTED', '{"actor": "Carol HR"}'),
  ('11111111-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000006', 'SHORTLISTED', 'INTERVIEW', '{"round": 1}'),
  ('11111111-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000007', 'INTERVIEW', 'SELECTED', '{"decision": "SELECTED"}'),
  ('11111111-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000010', 'SELECTED', 'OFFER_INTEREST_SENT', '{"portal_link_created": true}'),
  ('11111111-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000010', 'OFFER_INTEREST_SENT', 'OFFER_ACCEPTED', '{"candidate_ip": "103.21.244.1"}'),
  ('11111111-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000010', 'OFFER_ACCEPTED', 'DOCUMENTS_PENDING', '{"docs_required": 6}');

-- ------------------------------------------------------------
-- 9. SOURCING SEARCHES & SOURCED CANDIDATES
-- ------------------------------------------------------------
INSERT INTO public.sourcing_searches (
  id, organization_id, requisition_id, search_title, platforms, skills_filter,
  min_experience, max_experience, location, status, total_results_count
) VALUES
  (
    'd1000000-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    'Senior React & TypeScript Engineers',
    '["linkedin", "github", "internal_db"]'::jsonb,
    '["React", "TypeScript", "Node.js"]'::jsonb,
    4.0, 8.0, 'Bengaluru', 'COMPLETED', 14
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sourced_candidates (
  organization_id, search_id, requisition_id, platform, full_name, email,
  "current_role", current_company, experience_years, skills, match_score,
  skill_score, experience_score, role_score, ai_reasoning, is_shortlisted
) VALUES
  (
    '11111111-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    'LINKEDIN',
    'Deepak Verma',
    'deepak.verma@example.com',
    'Senior Full Stack Developer',
    'Paytm',
    6.0,
    '["React", "Node.js", "PostgreSQL", "Next.js"]'::jsonb,
    88.50,
    90.00,
    85.00,
    90.00,
    '{"strengths": ["6 years full stack experience", "Extensive React & Node production systems"]}'::jsonb,
    FALSE
  ),
  (
    '11111111-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    'GITHUB',
    'Tarun Saxena',
    'tarun.saxena@example.com',
    'Staff Frontend Engineer',
    'Postman',
    7.5,
    '["TypeScript", "React 19", "WebSockets"]'::jsonb,
    92.00,
    95.00,
    90.00,
    91.00,
    '{"strengths": ["High open-source GitHub contribution", "Advanced TypeScript library maintainer"]}'::jsonb,
    FALSE
  );

-- ------------------------------------------------------------
-- 10. OUTREACH CAMPAIGNS, TEMPLATES & MESSAGES
-- ------------------------------------------------------------
INSERT INTO public.outreach_templates (
  id, organization_id, name, channel, subject, body_template, variables
) VALUES
  (
    'd2000000-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000001',
    'Initial Engineering Outreach',
    'EMAIL',
    'Exciting Opportunity: {{role_title}} at {{company_name}}',
    'Hi {{candidate_name}},\n\nI came across your profile and was impressed with your work in {{key_skills}}. We are building high-throughput workforce infrastructure at {{company_name}} and would love to speak with you about our open {{role_title}} position.\n\nBest regards,\n{{recruiter_name}}',
    '["candidate_name", "role_title", "company_name", "key_skills", "recruiter_name"]'::jsonb
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.outreach_campaigns (
  id, organization_id, requisition_id, name, status, channels,
  total_targeted, total_sent, total_delivered, total_opened, total_replied
) VALUES
  (
    'd3000000-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    'Senior Full-Stack Talent Outreach',
    'ACTIVE',
    '["EMAIL"]'::jsonb,
    25, 22, 21, 15, 6
  )
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 11. AI VOICE CALLS
-- ------------------------------------------------------------
INSERT INTO public.ai_voice_calls (
  organization_id, candidate_id, requisition_id, call_provider, provider_call_id,
  phone_number, call_purpose, status, duration_seconds, recording_url, transcript,
  ai_summary, overall_score, sentiment, extracted_data, model_name, model_version
) VALUES
  (
    '11111111-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    'VAPI',
    'vapi_call_98124',
    '+91 98765 43210',
    'SCREENING',
    'COMPLETED',
    342,
    'https://storage.attendx.io/recordings/call_98124.mp3',
    'AI: Hi Aarav, thank you for taking the time to speak with AttendX. Could you share your recent hands-on experience with Next.js and PostgreSQL?\nAarav: Sure! At Infosys, I architected a multi-tenant client portal handling 50k DAU using Next.js App Router and PostgreSQL with row-level security.\nAI: That aligns well with our tech stack. What is your current notice period?\nAarav: 30 days, officially negotiable to 15 days.',
    'Aarav demonstrated crisp articulation of multi-tenant PostgreSQL RLS design and Next.js server components. Notice period is 30 days.',
    88.00,
    'POSITIVE',
    '{"confirmed_notice_period_days": 30, "experience_verified": true, "strongest_skill": "PostgreSQL RLS"}'::jsonb,
    'claude-3-7-sonnet',
    '20250219'
  );

-- ------------------------------------------------------------
-- 12. INTERVIEWS & CANDIDATE EVALUATIONS
-- ------------------------------------------------------------
INSERT INTO public.interviews (
  id, organization_id, application_id, candidate_id, round_number, round_type,
  title, scheduled_start, scheduled_end, timezone, platform, meeting_link,
  interviewer_ids, status, notes, ai_summary, decision, decided_by, decided_at
) VALUES
  (
    'e1000000-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000006',
    'c1000000-0000-0000-0000-000000000005',
    1,
    'TECHNICAL',
    'Round 1: System Design & TypeScript Deep Dive',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '2 days' + INTERVAL '45 minutes',
    'Asia/Kolkata',
    'GOOGLE_MEET',
    'https://meet.google.com/abc-defg-hij',
    '["11111111-1111-1111-1111-444444444444"]'::jsonb,
    'COMPLETED',
    'Candidate solved state hydration and concurrent rendering challenges effectively.',
    'Clear architectural thinking in distributed state management. Recommended moving to Managerial round.',
    'PASS',
    '11111111-1111-1111-1111-444444444444',
    NOW() - INTERVAL '2 days'
  ),
  (
    'e1000000-0000-0000-0000-000000000002',
    '11111111-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000006',
    'c1000000-0000-0000-0000-000000000005',
    2,
    'MANAGERIAL',
    'Round 2: Engineering Culture & Ownership',
    NOW() + INTERVAL '1 day',
    NOW() + INTERVAL '1 day' + INTERVAL '45 minutes',
    'Asia/Kolkata',
    'GOOGLE_MEET',
    'https://meet.google.com/xyz-uvwx-rst',
    '["11111111-1111-1111-1111-444444444444"]'::jsonb,
    'SCHEDULED',
    NULL, NULL, 'PENDING', NULL, NULL
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.candidate_evaluations (
  organization_id, interview_id, application_id, candidate_id, evaluator_id,
  technical_score, communication_score, problem_solving_score, culture_fit_score,
  overall_score, scorecard_feedback, recommendation
) VALUES
  (
    '11111111-0000-0000-0000-000000000001',
    'e1000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000006',
    'c1000000-0000-0000-0000-000000000005',
    '11111111-1111-1111-1111-444444444444',
    90.00, 85.00, 92.00, 88.00, 88.75,
    'Demonstrated senior-level knowledge of React concurrency and PostgreSQL schema indexing. Very strong hire.',
    'STRONG_HIRE'
  );

-- ------------------------------------------------------------
-- 13. OFFER PORTAL TOKENS & JOB OFFERS
-- ------------------------------------------------------------
INSERT INTO public.offer_portal_tokens (
  organization_id, application_id, token_hash, purpose, expires_at, attempt_count
) VALUES
  (
    '11111111-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000008',
    'tok_hash_demo_interest_789abc',
    'INTEREST',
    NOW() + INTERVAL '7 days',
    0
  ),
  (
    '11111111-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000010',
    'tok_hash_demo_docs_123xyz',
    'DOCUMENTS',
    NOW() + INTERVAL '6 days',
    1
  )
ON CONFLICT (token_hash) DO NOTHING;

INSERT INTO public.job_offers (
  id, organization_id, application_id, candidate_id, offer_number, designation,
  department_id, fixed_salary, variable_salary, bonus, total_ctc, work_location,
  work_mode, reporting_manager_id, joining_date, probation_months, benefits,
  status, approval_status
) VALUES
  (
    'e2000000-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000010',
    'c1000000-0000-0000-0000-000000000001',
    'OFFER-ACME-2026-001',
    'Senior Full-Stack Engineer',
    '11111111-2222-3333-4444-000000000001',
    2200000.00,
    300000.00,
    200000.00,
    2700000.00,
    'Bengaluru HQ',
    'HYBRID',
    '11111111-1111-1111-1111-444444444444',
    CURRENT_DATE + INTERVAL '30 days',
    3,
    '["Comprehensive Health Insurance (Family coverage)", "Annual Learning Stipend ($1,000)", "Home Office Setup Allowance"]'::jsonb,
    'DRAFT',
    'APPROVED'
  )
ON CONFLICT (organization_id, offer_number) DO NOTHING;

-- ------------------------------------------------------------
-- 14. ONBOARDING PROCESSES, DOCUMENTS & TASKS
-- ------------------------------------------------------------
INSERT INTO public.onboarding_processes (
  id, organization_id, application_id, candidate_id, offer_id,
  status, completion_percentage, target_completion_date
) VALUES
  (
    'e3000000-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000010',
    'c1000000-0000-0000-0000-000000000001',
    'e2000000-0000-0000-0000-000000000001',
    'DOCUMENTS_PENDING',
    60.00,
    CURRENT_DATE + INTERVAL '25 days'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.onboarding_documents (
  organization_id, onboarding_id, document_type, document_name, file_url,
  status, is_required, reviewer_comment, reviewed_by, reviewed_at
) VALUES
  (
    '11111111-0000-0000-0000-000000000001',
    'e3000000-0000-0000-0000-000000000001',
    'ID_PROOF',
    'Aadhaar / National ID Card',
    'https://storage.attendx.io/docs/aarav_id.pdf',
    'VERIFIED',
    TRUE,
    'Government ID clearly verified against national database format.',
    '11111111-1111-1111-1111-333333333333',
    NOW() - INTERVAL '1 day'
  ),
  (
    '11111111-0000-0000-0000-000000000001',
    'e3000000-0000-0000-0000-000000000001',
    'EDUCATION_CERTIFICATE',
    'Degree Certificate (B.Tech Computer Science)',
    'https://storage.attendx.io/docs/aarav_degree.pdf',
    'VERIFIED',
    TRUE,
    'Original degree verified.',
    '11111111-1111-1111-1111-333333333333',
    NOW() - INTERVAL '1 day'
  ),
  (
    '11111111-0000-0000-0000-000000000001',
    'e3000000-0000-0000-0000-000000000001',
    'PREVIOUS_EMPLOYMENT',
    'Relieving Letter & Service Certificate',
    'https://storage.attendx.io/docs/aarav_relieving.pdf',
    'SUBMITTED',
    TRUE,
    NULL, NULL, NULL
  ),
  (
    '11111111-0000-0000-0000-000000000001',
    'e3000000-0000-0000-0000-000000000001',
    'SALARY_SLIP',
    'Last 3 Months Salary Slips',
    NULL,
    'NOT_SUBMITTED',
    TRUE,
    NULL, NULL, NULL
  ),
  (
    '11111111-0000-0000-0000-000000000001',
    'e3000000-0000-0000-0000-000000000001',
    'BANK_DETAILS',
    'Cancelled Cheque / Bank Passbook',
    'https://storage.attendx.io/docs/aarav_bank.pdf',
    'PENDING',
    TRUE,
    'IFSC code was partially blurry. Please re-upload a clear scan.',
    '11111111-1111-1111-1111-333333333333',
    NOW() - INTERVAL '12 hours'
  );

INSERT INTO public.onboarding_tasks (
  organization_id, onboarding_id, task_name, description, category, status, due_date
) VALUES
  ('11111111-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 'Provision Corporate Laptop (MacBook Pro M3)', 'Configure dev tools, VPN, and device security profiles', 'IT', 'IN_PROGRESS', CURRENT_DATE + INTERVAL '10 days'),
  ('11111111-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 'Create Google Workspace & GitHub accounts', 'Grant repository write access and add to engineering groups', 'IT', 'PENDING', CURRENT_DATE + INTERVAL '15 days'),
  ('11111111-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 'Schedule First-Day Orientation & Buddy intro', 'Assign engineering onboarding mentor', 'HR', 'PENDING', CURRENT_DATE + INTERVAL '20 days');

-- ------------------------------------------------------------
-- 15. HIRING ANALYTICS SNAPSHOTS & RECOMMENDATIONS
-- ------------------------------------------------------------
INSERT INTO public.hiring_analytics_snapshots (
  organization_id, snapshot_date, metrics
) VALUES
  (
    '11111111-0000-0000-0000-000000000001',
    CURRENT_DATE,
    '{
      "total_applications": 11,
      "active_requisitions": 2,
      "stage_distribution": {
        "SOURCED": 1,
        "CONTACTED": 1,
        "APPLIED": 2,
        "SHORTLISTED": 1,
        "INTERVIEW": 1,
        "SELECTED": 1,
        "OFFER_INTEREST_SENT": 1,
        "OFFER_ACCEPTED": 1,
        "DOCUMENTS_PENDING": 1,
        "REJECTED": 1
      },
      "average_time_to_hire_days": 21.4,
      "average_cost_per_hire": 42000,
      "bottleneck_stage": "DOCUMENTS_PENDING",
      "sourcing_channel_effectiveness": {
        "LINKEDIN": {"total": 4, "hire_rate": 0.25},
        "REFERRAL": {"total": 3, "hire_rate": 0.66},
        "GITHUB": {"total": 2, "hire_rate": 0.50},
        "NAUKRI": {"total": 2, "hire_rate": 0.00}
      }
    }'::jsonb
  )
ON CONFLICT (organization_id, snapshot_date) DO NOTHING;

INSERT INTO public.hiring_ai_recommendations (
  organization_id, requisition_id, recommendation_type, title, description, impact_score, status
) VALUES
  (
    '11111111-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    'BOTTLENECK',
    'Document Collection Lag in REQ-ACME-001',
    'Candidates spend an average of 4.2 days uploading previous employer documents. Enable automated SMS reminders to reduce turnaround by 40%.',
    8.5,
    'PENDING'
  ),
  (
    '11111111-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000002',
    'SOURCING_GAP',
    'Low Pipeline Volume for AI Systems Engineers',
    'Only 1 shortlisted candidate currently in pipeline for REQ-ACME-002. Recommended action: Expand sourcing search to GitHub and HuggingFace repositories.',
    9.0,
    'PENDING'
  );


-- ============================================================
-- Reload PostgREST schema cache immediately
-- ============================================================
NOTIFY pgrst, 'reload schema';
