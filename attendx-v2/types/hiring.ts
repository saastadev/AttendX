// ============================================================
// AttendX v2 — Hiring Module TypeScript Types
// ============================================================

export type HiringStage =
  | 'SOURCED'
  | 'CONTACTED'
  | 'APPLIED'
  | 'SHORTLISTED'
  | 'INTERVIEW'
  | 'SELECTED'
  | 'OFFER_INTEREST_SENT'
  | 'OFFER_ACCEPTED'
  | 'DOCUMENTS_PENDING'
  | 'DOCUMENTS_VERIFIED'
  | 'OFFER_RELEASED'
  | 'OFFER_FINAL_ACCEPTED'
  | 'ONBOARDED'
  // Side exits
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'OFFER_DECLINED'
  | 'OFFER_FINAL_DECLINED'

export type RequisitionStatus = 'DRAFT' | 'OPEN' | 'ON_HOLD' | 'CLOSED'
export type RequisitionPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERNSHIP'
export type DocumentMode = 'NATIVE' | 'GOOGLE_FORM'

export interface JobRequisition {
  id: string
  organization_id: string
  requisition_code: string
  title: string
  department_id?: string | null
  designation_id?: string | null
  hiring_manager_id?: string | null
  recruiter_id?: string | null
  status: RequisitionStatus
  priority: RequisitionPriority
  openings_count: number
  filled_count: number
  location?: string | null
  employment_type: EmploymentType
  min_experience_years?: number | null
  max_experience_years?: number | null
  min_salary?: number | null
  max_salary?: number | null
  job_description?: string | null
  total_rounds: number
  google_form_url?: string | null
  document_mode: DocumentMode
  created_at: string
  updated_at: string
  // Joins
  skills?: JobRequisitionSkill[]
  department?: { id: string; name: string } | null
  designation?: { id: string; name: string } | null
  recruiter?: { id: string; full_name?: string; email?: string } | null
  hiring_manager?: { id: string; full_name?: string; email?: string } | null
  applications_count?: number
}

export interface JobRequisitionSkill {
  id: string
  organization_id: string
  requisition_id: string
  skill_name: string
  is_required: boolean
  weight: number
  min_experience_years?: number | null
  created_at: string
}

export type CandidateConsentStatus = 'GIVEN' | 'WITHDRAWN' | 'EXPIRED'

export interface Candidate {
  id: string
  organization_id: string
  first_name: string
  last_name: string
  email?: string | null
  phone?: string | null
  current_company?: string | null
  current_designation?: string | null
  total_experience_years: number
  location?: string | null
  current_ctc?: string | null
  expected_ctc?: string | null
  notice_period_days?: number | null
  resume_url?: string | null
  raw_resume_text?: string | null
  source: string
  consent_status: CandidateConsentStatus
  consent_given_at?: string | null
  data_retention_until?: string | null
  is_anonymized: boolean
  created_at: string
  updated_at: string
  // Joins
  skills?: CandidateSkill[]
}

export interface CandidateSkill {
  id: string
  organization_id: string
  candidate_id: string
  skill_name: string
  experience_years?: number | null
  proficiency_level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT'
  verified_by_ai: boolean
  created_at: string
}

export interface CandidateResume {
  id: string
  organization_id: string
  candidate_id: string
  file_name: string
  file_url: string
  file_size?: number | null
  mime_type?: string | null
  parsed_data: Record<string, unknown>
  is_primary: boolean
  created_at: string
}

export type ApplicationDecision = 'PENDING' | 'SELECTED' | 'REJECTED' | 'ONBOARDING'

export interface JobApplication {
  id: string
  organization_id: string
  application_code: string
  requisition_id: string
  candidate_id: string
  stage: HiringStage
  match_score: number
  skill_score: number
  experience_score: number
  jd_relevance_score: number
  match_reasoning: {
    summary?: string
    strengths?: string[]
    skill_matches?: Array<{ skill: string; matched: boolean; weight: number }>
    missing_skills?: string[]
    experience_notes?: string
  }
  applied_at: string
  current_decision: ApplicationDecision
  rejection_reason?: string | null
  withdrawal_reason?: string | null
  created_at: string
  updated_at: string
  // Joins
  candidate?: Candidate
  requisition?: JobRequisition
}

export type InterviewRoundType = 'HR' | 'TECHNICAL' | 'MANAGERIAL' | 'FINAL'
export type InterviewPlatform = 'ZOOM' | 'GOOGLE_MEET' | 'TEAMS' | 'IN_PERSON' | 'PHONE'
export type InterviewStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'NO_SHOW' | 'RESCHEDULED' | 'CANCELLED'

export interface Interview {
  id: string
  organization_id: string
  application_id: string
  candidate_id: string
  round_number: number
  round_type: InterviewRoundType
  title: string
  scheduled_start: string
  scheduled_end: string
  timezone: string
  platform: InterviewPlatform
  meeting_link?: string | null
  meeting_provider_event_id?: string | null
  interviewer_ids: string[]
  status: InterviewStatus
  notes?: string | null
  ai_summary?: string | null
  ai_summary_edited: boolean
  decision?: 'PENDING' | 'PASS' | 'FAIL' | 'ON_HOLD' | null
  decision_reason?: string | null
  decided_by?: string | null
  decided_at?: string | null
  created_at: string
  updated_at: string
  // Joins
  candidate?: Candidate
  application?: JobApplication
  evaluations?: CandidateEvaluation[]
}

export interface CandidateEvaluation {
  id: string
  organization_id: string
  interview_id?: string | null
  application_id: string
  candidate_id: string
  evaluator_id: string
  technical_score?: number | null
  communication_score?: number | null
  problem_solving_score?: number | null
  culture_fit_score?: number | null
  overall_score?: number | null
  scorecard_feedback?: string | null
  recommendation: 'STRONG_HIRE' | 'HIRE' | 'MAYBE' | 'NO_HIRE'
  created_at: string
  updated_at: string
  evaluator?: { id: string; full_name?: string; email?: string } | null
}

export interface OfferPortalToken {
  id: string
  organization_id: string
  application_id: string
  token_hash: string
  purpose: 'INTEREST' | 'DOCUMENTS' | 'FINAL_OFFER'
  expires_at: string
  used_at?: string | null
  revoked_at?: string | null
  attempt_count: number
  last_attempt_at?: string | null
  ip_address?: string | null
  user_agent?: string | null
  created_at: string
}

export interface JobOffer {
  id: string
  organization_id: string
  application_id: string
  candidate_id: string
  offer_number: string
  designation: string
  department_id?: string | null
  fixed_salary: number
  variable_salary: number
  bonus: number
  total_ctc: number
  work_location: string
  work_mode: 'REMOTE' | 'ONSITE' | 'HYBRID'
  reporting_manager_id?: string | null
  joining_date: string
  probation_months: number
  benefits: string[]
  terms_and_conditions?: string | null
  offer_letter_url?: string | null
  approval_status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED'
  approved_by?: string | null
  approved_at?: string | null
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED'
  sent_at?: string | null
  accepted_at?: string | null
  declined_at?: string | null
  decline_reason?: string | null
  e_ack_name?: string | null
  e_ack_timestamp?: string | null
  e_ack_ip?: string | null
  created_at: string
  updated_at: string
  // Joins
  candidate?: Candidate
  department?: { id: string; name: string } | null
}

export type OnboardingStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'DOCUMENTS_PENDING'
  | 'DOCUMENTS_VERIFIED'
  | 'COMPLETED'
  | 'TERMINATED'

export interface OnboardingProcess {
  id: string
  organization_id: string
  application_id: string
  candidate_id: string
  offer_id?: string | null
  employee_id?: string | null
  status: OnboardingStatus
  completion_percentage: number
  target_completion_date?: string | null
  termination_reason?: string | null
  terminated_at?: string | null
  terminated_by?: string | null
  created_at: string
  updated_at: string
  // Joins
  candidate?: Candidate
  documents?: OnboardingDocument[]
  tasks?: OnboardingTask[]
}

export type OnboardingDocumentType =
  | 'ID_PROOF'
  | 'EDUCATION_CERTIFICATE'
  | 'PREVIOUS_EMPLOYMENT'
  | 'SALARY_SLIP'
  | 'BANK_DETAILS'
  | 'RESUME'
  | 'PHOTO'

export type OnboardingDocumentStatus =
  | 'NOT_SUBMITTED'
  | 'SUBMITTED'
  | 'VERIFIED'
  | 'PENDING'
  | 'REJECTED'

export interface OnboardingDocument {
  id: string
  organization_id: string
  onboarding_id: string
  document_type: OnboardingDocumentType
  document_name: string
  file_url?: string | null
  file_size?: number | null
  mime_type?: string | null
  status: OnboardingDocumentStatus
  reviewer_comment?: string | null
  reviewed_by?: string | null
  reviewed_at?: string | null
  scan_status: 'PENDING' | 'CLEAN' | 'INFECTED'
  is_required: boolean
  created_at: string
  updated_at: string
}

export interface OnboardingTask {
  id: string
  organization_id: string
  onboarding_id: string
  task_name: string
  description?: string | null
  category: 'IT' | 'HR' | 'ADMIN' | 'ORIENTATION'
  assigned_to?: string | null
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED'
  due_date?: string | null
  completed_at?: string | null
  completed_by?: string | null
  created_at: string
  updated_at: string
}

export interface OrgScoreWeights {
  id?: string
  organization_id: string
  skills_weight: number
  interview_weight: number
  experience_weight: number
  communication_weight: number
  assessment_weight: number
  culture_fit_weight: number
}

export interface CandidateOverallScore {
  candidate_id: string
  application_id: string
  overall_score: number
  skills_score: number
  interview_score: number
  experience_score: number
  communication_score: number
  assessment_score: number
  culture_fit_score: number
  weights_used: OrgScoreWeights
  explanation: string
}

export interface HiringFunnelEvent {
  id: string
  organization_id: string
  application_id: string
  from_stage?: string | null
  to_stage: string
  triggered_by?: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface HiringAuditLog {
  id: string
  organization_id: string
  user_id?: string | null
  action: string
  entity_type: string
  entity_id: string
  old_values?: Record<string, unknown> | null
  new_values?: Record<string, unknown> | null
  ip_address?: string | null
  user_agent?: string | null
  created_at: string
}

export interface HiringAnalyticsSnapshot {
  id: string
  organization_id: string
  snapshot_date: string
  metrics: Record<string, unknown>
  created_at: string
}

export interface HiringAiRecommendation {
  id: string
  organization_id: string
  requisition_id?: string | null
  recommendation_type: 'BOTTLENECK' | 'SOURCING_GAP' | 'SALARY_BENCHMARK' | 'CANDIDATE_NEXT_STEP'
  title: string
  description: string
  impact_score: number
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED'
  review_notes?: string | null
  reviewed_by?: string | null
  reviewed_at?: string | null
  model_name?: string | null
  model_version?: string | null
  created_at: string
}
