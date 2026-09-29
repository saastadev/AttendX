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
