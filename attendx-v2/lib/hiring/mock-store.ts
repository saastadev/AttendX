// ============================================================
// AttendX v2 — Hiring Module: In-Memory Mock Store
// Provides complete high-fidelity persistence for local development
// and offline sandbox environments when Supabase is unreachable.
// ============================================================

import crypto from 'crypto'
import { HiringStateMachine } from './state-machine.ts'
import { TemplateEngine } from './template-engine.ts'

export const ACME_ORG_ID = '11111111-0000-0000-0000-000000000001'

const BASE_FIXTURE_PREFIXES = ['c1000000-', 'a1000000-', 'app-10000000-', 'req-10000000-', 'app-', 'req-']

/**
 * Resolves deterministic tenant-scoped candidate/application/requisition IDs.
 * Replaces ambiguous bidirectional prefix matching with exact matching.
 * In mock-store, foreign tenants have IDs suffixed with `_${orgId.slice(0, 8)}`.
 * Strictly scoped to legacy seed fixtures — dynamically created candidates are never remapped.
 */
function getDeterministicScopedIds(orgId: string, id: string): string[] {
  if (!id) return []
  const ids = [id]
  if (id.includes('_')) {
    const base = id.split('_')[0]
    if (!ids.includes(base)) ids.push(base)
  }
  if (orgId && orgId !== ACME_ORG_ID && BASE_FIXTURE_PREFIXES.some(p => id.startsWith(p))) {
    const suffix = `_${orgId.slice(0, 8)}`
    const base = id.split('_')[0]
    const scoped = `${base}${suffix}`
    if (!ids.includes(scoped)) {
      ids.push(scoped)
    }
  }
  return ids
}

class MockStore {
  public requisitions: any[] = [
    {
      id: 'a1000000-0000-0000-0000-000000000001',
      organization_id: ACME_ORG_ID,
      requisition_code: 'REQ-ACME-001',
      title: 'Senior Full-Stack Engineer',
      department_id: '11111111-2222-3333-4444-000000000001',
      designation_id: '11111111-3333-4444-5555-000000000001',
      hiring_manager_id: '11111111-4444-4444-4444-444444444444',
      recruiter_id: '11111111-3333-3333-3333-333333333333',
      status: 'OPEN',
      priority: 'HIGH',
      openings_count: 3,
      filled_count: 1,
      location: 'Bengaluru, India (Hybrid)',
      employment_type: 'FULL_TIME',
      work_mode: 'HYBRID',
      opening_date: '2026-09-01',
      target_close_date: '2026-10-31',
      min_experience_years: 4.0,
      max_experience_years: 8.0,
      min_salary: 1800000.0,
      max_salary: 2800000.0,
      job_description: 'We are looking for a Senior Full-Stack Engineer with strong TypeScript, React 19, Next.js, and PostgreSQL expertise to lead architecture for our scalable enterprise modules.',
      total_rounds: 3,
      document_mode: 'NATIVE',
      created_at: '2026-09-01T10:00:00Z',
      updated_at: '2026-09-28T12:00:00Z',
      department: { id: '11111111-2222-3333-4444-000000000001', name: 'Engineering' },
      designation: { id: '11111111-3333-4444-5555-000000000001', name: 'Senior Full-Stack Engineer' },
      skills: [
        { id: 's1', organization_id: ACME_ORG_ID, requisition_id: 'a1000000-0000-0000-0000-000000000001', skill_name: 'React', is_required: true, weight: 4, min_experience_years: 3.0, created_at: '2026-09-01T10:00:00Z' },
        { id: 's2', organization_id: ACME_ORG_ID, requisition_id: 'a1000000-0000-0000-0000-000000000001', skill_name: 'TypeScript', is_required: true, weight: 5, min_experience_years: 3.0, created_at: '2026-09-01T10:00:00Z' },
        { id: 's3', organization_id: ACME_ORG_ID, requisition_id: 'a1000000-0000-0000-0000-000000000001', skill_name: 'Node.js', is_required: true, weight: 4, min_experience_years: 3.0, created_at: '2026-09-01T10:00:00Z' },
        { id: 's4', organization_id: ACME_ORG_ID, requisition_id: 'a1000000-0000-0000-0000-000000000001', skill_name: 'PostgreSQL', is_required: true, weight: 4, min_experience_years: 2.0, created_at: '2026-09-01T10:00:00Z' },
      ],
    },
    {
      id: 'a1000000-0000-0000-0000-000000000002',
      organization_id: ACME_ORG_ID,
      requisition_code: 'REQ-ACME-002',
      title: 'AI Systems Engineer',
      department_id: '11111111-2222-3333-4444-000000000001',
      designation_id: '11111111-3333-4444-5555-000000000002',
      hiring_manager_id: '11111111-4444-4444-4444-444444444444',
      recruiter_id: '11111111-3333-3333-3333-333333333333',
      status: 'OPEN',
      priority: 'URGENT',
      openings_count: 2,
      filled_count: 0,
      location: 'Remote / Bengaluru',
      employment_type: 'FULL_TIME',
      work_mode: 'REMOTE',
      opening_date: '2026-09-05',
      target_close_date: '2026-10-15',
      min_experience_years: 3.0,
      max_experience_years: 7.0,
      min_salary: 2200000.0,
      max_salary: 3500000.0,
      job_description: 'Seeking an AI Engineer with deep knowledge of LLM orchestrations, RAG architectures, LangChain, semantic embeddings, and vector databases.',
      total_rounds: 4,
      document_mode: 'NATIVE',
      created_at: '2026-09-05T10:00:00Z',
      updated_at: '2026-09-28T12:00:00Z',
      department: { id: '11111111-2222-3333-4444-000000000001', name: 'Engineering' },
      designation: { id: '11111111-3333-4444-5555-000000000002', name: 'AI Systems Engineer' },
      skills: [
        { id: 's5', organization_id: ACME_ORG_ID, requisition_id: 'a1000000-0000-0000-0000-000000000002', skill_name: 'Python', is_required: true, weight: 5, min_experience_years: 3.0, created_at: '2026-09-05T10:00:00Z' },
        { id: 's6', organization_id: ACME_ORG_ID, requisition_id: 'a1000000-0000-0000-0000-000000000002', skill_name: 'LLM Architectures', is_required: true, weight: 5, min_experience_years: 2.0, created_at: '2026-09-05T10:00:00Z' },
      ],
    },
  ]

  public candidates: any[] = [
    {
      id: 'c1000000-0000-0000-0000-000000000001',
      organization_id: ACME_ORG_ID,
      first_name: 'Aarav',
      last_name: 'Sharma',
      full_name: 'Aarav Sharma',
      email: 'aarav.sharma@example.com',
      phone: '+91 98765 43210',
      current_company: 'Infosys',
      current_designation: 'Senior Software Engineer',
      total_experience_years: 6.0,
      experience_years: 6.0,
      location: 'Bengaluru',
      current_ctc: '₹16,00,000',
      expected_ctc: '₹22,00,000',
      notice_period_days: 30,
      source: 'LINKEDIN',
      consent_status: 'GIVEN',
      skills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'GraphQL'],
      resume_text: 'Experienced Full Stack Engineer with 6 years designing robust microservices and performant UI with React, Next.js and Postgres.',
    },
    {
      id: 'c1000000-0000-0000-0000-000000000002',
      organization_id: ACME_ORG_ID,
      first_name: 'Ananya',
      last_name: 'Iyer',
      full_name: 'Ananya Iyer',
      email: 'ananya.iyer@example.com',
      phone: '+91 98765 43211',
      current_company: 'Flipkart',
      current_designation: 'Full Stack Developer',
      total_experience_years: 5.5,
      experience_years: 5.5,
      location: 'Bengaluru',
      current_ctc: '₹20,00,000',
      expected_ctc: '₹26,00,000',
      notice_period_days: 15,
      source: 'REFERRAL',
      consent_status: 'GIVEN',
      skills: ['React', 'TypeScript', 'Node.js', 'AWS', 'Docker'],
      resume_text: 'Full Stack Developer with 5.5 years building high-traffic customer portals using TypeScript, React 19, and cloud-native serverless functions.',
    },
    {
      id: 'c1000000-0000-0000-0000-000000000003',
      organization_id: ACME_ORG_ID,
      first_name: 'Rohan',
      last_name: 'Verma',
      full_name: 'Rohan Verma',
      email: 'rohan.verma@example.com',
      phone: '+91 98765 43212',
      current_company: 'Swiggy',
      current_designation: 'Lead Backend Engineer',
      total_experience_years: 7.5,
      experience_years: 7.5,
      location: 'Hyderabad',
      current_ctc: '₹24,00,000',
      expected_ctc: '₹30,00,000',
      notice_period_days: 45,
      source: 'NAUKRI',
      consent_status: 'GIVEN',
      skills: ['Node.js', 'PostgreSQL', 'Redis', 'Kubernetes', 'TypeScript'],
      resume_text: 'Lead Backend Engineer specializing in high-throughput database systems, distributed caching, and microservice resilience.',
    },
    {
      id: 'c1000000-0000-0000-0000-000000000004',
      organization_id: ACME_ORG_ID,
      first_name: 'Priya',
      last_name: 'Nair',
      full_name: 'Priya Nair',
      email: 'priya.nair@example.com',
      phone: '+91 98765 43213',
      current_company: 'Amazon',
      current_designation: 'SDE II',
      total_experience_years: 4.5,
      experience_years: 4.5,
      location: 'Bengaluru',
      current_ctc: '₹22,00,000',
      expected_ctc: '₹28,00,000',
      notice_period_days: 30,
      source: 'SOURCED',
      consent_status: 'GIVEN',
      skills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'Next.js'],
      resume_text: 'SDE II at Amazon building Tier-1 distributed web services with Next.js, TypeScript, and DynamoDB/PostgreSQL.',
    },
    {
      id: 'c1000000-0000-0000-0000-000000000005',
      organization_id: ACME_ORG_ID,
      first_name: 'Siddharth',
      last_name: 'Mehta',
      full_name: 'Siddharth Mehta',
      email: 'siddharth.mehta@example.com',
      phone: '+91 98765 43214',
      current_company: 'Razorpay',
      current_designation: 'Senior Frontend Engineer',
      total_experience_years: 5.0,
      experience_years: 5.0,
      location: 'Bengaluru',
      current_ctc: '₹19,00,000',
      expected_ctc: '₹25,00,000',
      notice_period_days: 30,
      source: 'CAREER_SITE',
      consent_status: 'GIVEN',
      skills: ['React', 'Next.js', 'TypeScript', 'Tailwind', 'Performance'],
      resume_text: 'Senior Frontend Engineer focused on design systems, accessible UI components, and sub-100ms web vital optimizations.',
    },
    {
      id: 'c1000000-0000-0000-0000-000000000006',
      organization_id: ACME_ORG_ID,
      first_name: 'Kavita',
      last_name: 'Reddy',
      full_name: 'Kavita Reddy',
      email: 'kavita.reddy@example.com',
      phone: '+91 98765 43215',
      current_company: 'Wipro',
      current_designation: 'Tech Lead',
      total_experience_years: 8.0,
      experience_years: 8.0,
      location: 'Chennai',
      current_ctc: '₹25,00,000',
      expected_ctc: '₹32,00,000',
      notice_period_days: 60,
      source: 'INDEED',
      consent_status: 'GIVEN',
      skills: ['React', 'Node.js', 'System Architecture', 'Java', 'SQL'],
      resume_text: 'Technical Lead with 8 years guiding enterprise cloud transformations and managing full lifecycle full-stack development teams.',
    },
  ]

  public applications: any[] = [
    {
      id: 'app-001',
      organization_id: ACME_ORG_ID,
      requisition_id: 'a1000000-0000-0000-0000-000000000001',
      candidate_id: 'c1000000-0000-0000-0000-000000000001',
      application_code: 'APP-2026-001',
      stage: 'SHORTLISTED',
      current_decision: 'IN_REVIEW',
      match_score: 91,
      skill_score: 94,
      experience_score: 88,
      jd_relevance_score: 92,
      applied_at: '2026-09-10T10:00:00Z',
      match_reasoning: {
        highlights: ['Strong React 19 & TypeScript background', '6 years relevant enterprise full-stack experience', 'Immediate fit for engineering requisition'],
        concerns: ['Notice period is 30 days'],
      },
    },
    {
      id: 'app-002',
      organization_id: ACME_ORG_ID,
      requisition_id: 'a1000000-0000-0000-0000-000000000001',
      candidate_id: 'c1000000-0000-0000-0000-000000000002',
      application_code: 'APP-2026-002',
      stage: 'INTERVIEW',
      current_decision: 'IN_REVIEW',
      match_score: 88,
      skill_score: 90,
      experience_score: 85,
      jd_relevance_score: 89,
      applied_at: '2026-09-12T14:30:00Z',
      match_reasoning: {
        highlights: ['Excellent cloud-native serverless expertise', 'Fast 15 days notice period', 'Strong communication feedback'],
      },
    },
    {
      id: 'app-003',
      organization_id: ACME_ORG_ID,
      requisition_id: 'a1000000-0000-0000-0000-000000000001',
      candidate_id: 'c1000000-0000-0000-0000-000000000003',
      application_code: 'APP-2026-003',
      stage: 'SELECTED',
      current_decision: 'SELECTED',
      match_score: 94,
      skill_score: 96,
      experience_score: 95,
      jd_relevance_score: 92,
      applied_at: '2026-09-08T09:15:00Z',
      match_reasoning: {
        highlights: ['Top tier system design scorecard (4.8/5.0)', '7.5 years senior engineering lead background'],
      },
    },
    {
      id: 'app-004',
      organization_id: ACME_ORG_ID,
      requisition_id: 'a1000000-0000-0000-0000-000000000001',
      candidate_id: 'c1000000-0000-0000-0000-000000000004',
      application_code: 'APP-2026-004',
      stage: 'OFFER_RELEASED',
      current_decision: 'PROCEED_TO_OFFER',
      match_score: 92,
      skill_score: 95,
      experience_score: 89,
      jd_relevance_score: 92,
      applied_at: '2026-09-05T11:00:00Z',
      match_reasoning: {
        highlights: ['Proven track record at Amazon SDE II', 'High velocity contributor', 'Full stack depth'],
      },
    },
    {
      id: 'app-005',
      organization_id: ACME_ORG_ID,
      requisition_id: 'a1000000-0000-0000-0000-000000000001',
      candidate_id: 'c1000000-0000-0000-0000-000000000005',
      application_code: 'APP-2026-005',
      stage: 'ONBOARDED',
      current_decision: 'SELECTED',
      match_score: 89,
      skill_score: 92,
      experience_score: 86,
      jd_relevance_score: 90,
      applied_at: '2026-08-20T10:00:00Z',
      match_reasoning: {
        highlights: ['Successfully onboarded', 'All compliance documents verified'],
      },
    },
    {
      id: 'app-006',
      organization_id: ACME_ORG_ID,
      requisition_id: 'a1000000-0000-0000-0000-000000000001',
      candidate_id: 'c1000000-0000-0000-0000-000000000006',
      application_code: 'APP-2026-006',
      stage: 'APPLIED',
      current_decision: 'PENDING',
      match_score: 84,
      skill_score: 86,
      experience_score: 95,
      jd_relevance_score: 76,
      applied_at: '2026-09-24T16:00:00Z',
      match_reasoning: {
        highlights: ['Extensive 8 years experience', 'Leadership potential'],
      },
    },
  ]

  public interviews: any[] = [
    {
      id: 'default-int-1',
      organization_id: ACME_ORG_ID,
      application_id: 'app-001',
      round_number: 1,
      round_type: 'TECHNICAL',
      title: 'Round 1 — Introductory / Quick Hello',
      scheduled_start: '2026-10-30T11:00:00+05:30',
      scheduled_end: '2026-10-30T11:20:00+05:30',
      timezone: 'Asia/Kolkata',
      platform: 'GOOGLE_MEET',
      meeting_link: 'https://meet.google.com/abc-defg-hij',
      status: 'COMPLETED',
      decision: 'PASS',
      invitation_status: 'SENT',
      created_at: '2026-10-25T10:00:00Z',
    },
    {
      id: 'default-int-2',
      organization_id: ACME_ORG_ID,
      application_id: 'app-001',
      round_number: 2,
      round_type: 'TECHNICAL',
      title: 'Round 2 — Technical / Coding Assessment',
      scheduled_start: '2026-10-30T11:00:00+05:30',
      scheduled_end: '2026-10-30T12:00:00+05:30',
      timezone: 'Asia/Kolkata',
      platform: 'GOOGLE_MEET',
      meeting_link: 'https://meet.google.com/abc-defg-hij',
      status: 'COMPLETED',
      decision: 'PASS',
      invitation_status: 'SENT',
      created_at: '2026-10-26T10:00:00Z',
    },
    {
      id: 'default-int-3',
      organization_id: ACME_ORG_ID,
      application_id: 'app-001',
      round_number: 3,
      round_type: 'TECHNICAL',
      title: 'Round 3 — Technical Deep Dive & HR',
      scheduled_start: '2026-10-30T11:00:00+05:30',
      scheduled_end: '2026-10-30T12:00:00+05:30',
      timezone: 'Asia/Kolkata',
      platform: 'GOOGLE_MEET',
      meeting_link: 'https://meet.google.com/abc-defg-hij',
      status: 'PENDING',
      decision: 'PENDING',
      invitation_status: 'PENDING_DELIVERY',
      created_at: '2026-10-27T10:00:00Z',
    },
    {
      id: 'int-001',
      organization_id: ACME_ORG_ID,
      application_id: 'app-002',
      round_number: 1,
      round_type: 'TECHNICAL',
      title: 'Technical Core & Problem Solving',
      scheduled_start: '2026-10-02T10:00:00Z',
      scheduled_end: '2026-10-02T11:00:00Z',
      timezone: 'Asia/Kolkata',
      platform: 'GOOGLE_MEET',
      meeting_link: 'https://meet.google.com/abc-hiring-tech',
      status: 'SCHEDULED',
      created_at: '2026-09-28T10:00:00Z',
    },
    {
      id: 'int-002',
      organization_id: ACME_ORG_ID,
      application_id: 'app-003',
      round_number: 2,
      round_type: 'TECHNICAL',
      title: 'Distributed Architecture & Database Scaling',
      scheduled_start: '2026-09-20T14:00:00Z',
      scheduled_end: '2026-09-20T15:00:00Z',
      timezone: 'Asia/Kolkata',
      platform: 'GOOGLE_MEET',
      meeting_link: 'https://meet.google.com/xyz-sys-design',
      status: 'COMPLETED',
      created_at: '2026-09-18T10:00:00Z',
    },
  ]

  public offers: any[] = [
    {
      id: 'off-001',
      organization_id: ACME_ORG_ID,
      application_id: 'app-004',
      token: 'mock-token-priya-nair-2026',
      status: 'SENT',
      total_ctc: 2400000,
      fixed_salary: 2000000,
      variable_salary: 200000,
      bonus: 200000,
      joining_date: '2026-10-15',
      expires_at: '2026-10-06T23:59:59Z',
      designation: 'Senior Full-Stack Engineer',
      terms_and_conditions: 'Standard employment agreement with 30-day notice period and comprehensive medical insurance.',
      created_at: '2026-09-25T10:00:00Z',
      sent_at: '2026-09-26T12:00:00Z',
    },
  ]

  public onboardingDocuments: any[] = [
    {
      id: 'doc-001',
      organization_id: ACME_ORG_ID,
      application_id: 'app-005',
      document_type: 'ID_PROOF',
      document_name: 'Aadhaar Card Copy',
      file_url: '/api/hiring/onboarding/documents/doc-001/preview',
      status: 'VERIFIED',
      created_at: '2026-08-25T10:00:00Z',
    },
    {
      id: 'doc-002',
      organization_id: ACME_ORG_ID,
      application_id: 'app-005',
      document_type: 'BANK_DETAILS',
      document_name: 'PAN Card Copy',
      file_url: '/api/hiring/onboarding/documents/doc-002/preview',
      status: 'VERIFIED',
      created_at: '2026-08-25T10:00:00Z',
    },
    {
      id: 'doc-003',
      organization_id: ACME_ORG_ID,
      application_id: 'app-004',
      document_type: 'EDUCATION_CERTIFICATE',
      document_name: 'B.Tech Degree Certificate',
      file_url: '/api/hiring/onboarding/documents/doc-003/preview',
      status: 'PENDING',
      created_at: '2026-09-27T10:00:00Z',
    },
  ]


  public checklistTasks: any[] = [
    {
      id: 'task-001',
      organization_id: ACME_ORG_ID,
      application_id: 'app-005',
      task_name: 'Company Laptop & Peripheral Dispatch',
      category: 'IT',
      status: 'COMPLETED',
      assigned_to: 'IT Support',
      due_date: '2026-09-01',
    },
    {
      id: 'task-002',
      organization_id: ACME_ORG_ID,
      application_id: 'app-005',
      task_name: 'Google Workspace & Slack Setup',
      category: 'IT',
      status: 'COMPLETED',
      assigned_to: 'IT Support',
      due_date: '2026-09-01',
    },
    {
      id: 'task-003',
      organization_id: ACME_ORG_ID,
      application_id: 'app-004',
      task_name: 'Emergency Contact & Nominee Details Form',
      category: 'HR',
      status: 'PENDING',
      assigned_to: 'HR Operations',
      due_date: '2026-10-10',
    },
  ]

  public recommendations: any[] = [
    {
      id: 'rec-1',
      organization_id: ACME_ORG_ID,
      requisition_id: 'a1000000-0000-0000-0000-000000000001',
      recommendation_type: 'BOTTLENECK',
      title: 'Accelerate Technical Interview Turnaround',
      description: 'Technical rounds currently take 4.8 days on average. Enabling automated panel calendar sync can cut this by 45%.',
      impact_score: 85,
      status: 'PENDING',
      review_notes: null,
      reviewed_by: null,
      reviewed_at: null,
      model_name: 'attendx-funnel-analyzer-v1',
      model_version: '1.0',
      created_at: '2026-09-28T10:00:00Z',
    },
    {
      id: 'rec-2',
      organization_id: ACME_ORG_ID,
      requisition_id: 'a1000000-0000-0000-0000-000000000001',
      recommendation_type: 'SOURCING_GAP',
      title: 'Leverage High-Yield Referral Channels',
      description: 'Candidate match rates from Employee Referrals average 91%, compared to 78% on open boards.',
      impact_score: 75,
      status: 'PENDING',
      review_notes: null,
      reviewed_by: null,
      reviewed_at: null,
      model_name: 'attendx-sourcing-gap-engine-v1',
      model_version: '1.0',
      created_at: '2026-09-29T11:30:00Z',
    },
    {
      id: 'rec-3',
      organization_id: ACME_ORG_ID,
      requisition_id: 'a1000000-0000-0000-0000-000000000001',
      recommendation_type: 'CANDIDATE_NEXT_STEP',
      title: 'Advance High-Scoring Shortlisted Candidate',
      description: 'Candidate Aarav Sharma has match score 91% and has been in Shortlisted stage for >3 days.',
      impact_score: 90,
      status: 'PENDING',
      review_notes: null,
      reviewed_by: null,
      reviewed_at: null,
      model_name: 'attendx-candidate-promotion-v1',
      model_version: '1.0',
      created_at: '2026-09-30T09:15:00Z',
    },
  ]

  public voiceCalls: any[] = [
    {
      id: 'call-001',
      organization_id: ACME_ORG_ID,
      candidate_id: 'c1000000-0000-0000-0000-000000000001',
      requisition_id: 'a1000000-0000-0000-0000-000000000001',
      application_id: 'app-001',
      call_provider: 'AttendX Mock Telephony',
      provider_call_id: 'vapi_call_98124',
      phone_number: '+91 98765 43210',
      call_purpose: 'SCREENING',
      status: 'COMPLETED',
      duration_seconds: 342,
      recording_url: 'https://storage.attendx.io/recordings/call_98124.mp3',
      transcript: 'AI: Hi Aarav, thank you for taking the time to speak with AttendX. Could you share your recent hands-on experience with Next.js and PostgreSQL?\nAarav: Sure! At Infosys, I architected a multi-tenant client portal handling 50k DAU using Next.js App Router and PostgreSQL with row-level security.\nAI: That aligns well with our tech stack. What is your current notice period?\nAarav: 30 days, officially negotiable to 15 days.',
      ai_summary: 'Aarav demonstrated crisp articulation of multi-tenant PostgreSQL RLS design and Next.js server components. Notice period is 30 days.',
      overall_score: 88,
      sentiment: 'POSITIVE',
      extracted_data: {
        noticePeriodDays: 30,
        expectedSalary: '₹22,00,000',
        currentSalary: '₹16,00,000',
        yearsOfExperience: 6,
        workModePreference: 'Hybrid / Bengaluru',
        skillsMentioned: ['React', 'TypeScript', 'Node.js', 'PostgreSQL RLS'],
        score_breakdown: {
          skill_relevance: { score: 88 },
          role_relevance: { score: 85 },
          communication: { score: 90 },
          experience: { score: 86 },
          availability_fit: { score: 92 },
        },
      },
      model_name: 'attendx-voice-v2',
      model_version: '2.0.0',
      created_at: '2026-09-28T14:30:00Z',
    },
  ]

  public auditLogs: any[] = []

  public campaigns: any[] = [
    {
      id: 'd3000000-0000-0000-0000-000000000001',
      organization_id: ACME_ORG_ID,
      requisition_id: 'a1000000-0000-0000-0000-000000000001',
      name: 'Senior Full-Stack Talent Outreach',
      status: 'ACTIVE',
      channels: ['EMAIL'],
      total_targeted: 25,
      total_sent: 22,
      total_delivered: 21,
      total_opened: 15,
      total_replied: 6,
      created_by: '11111111-3333-3333-3333-333333333333',
      created_at: '2026-10-14T05:34:23.187Z',
      updated_at: '2026-10-14T05:34:23.187Z',
    },
  ]

  public templates: any[] = [
    {
      id: 'd2000000-0000-0000-0000-000000000001',
      organization_id: ACME_ORG_ID,
      name: 'Initial Engineering Outreach',
      channel: 'EMAIL',
      subject: 'Exciting Opportunity: {{role_title}} at {{company_name}}',
      body_template: 'Hi {{candidate_name}},\n\nI came across your profile and was impressed with your work in {{key_skills}}. We are building high-throughput workforce infrastructure at {{company_name}} and would love to speak with you about our open {{role_title}} position.\n\nBest regards,\n{{recruiter_name}}',
      variables: ['candidate_name', 'role_title', 'company_name', 'key_skills', 'recruiter_name'],
      is_ai_customizable: true,
      created_at: '2026-10-14T05:34:23.187Z',
      updated_at: '2026-10-14T05:34:23.187Z',
    },
    {
      id: 'd2000000-0000-0000-0000-000000000002',
      organization_id: ACME_ORG_ID,
      name: 'Executive Interview Invitation',
      channel: 'EMAIL',
      subject: 'Interview with Engineering Director at {{company_name}}',
      body_template: 'Dear {{candidate_name}},\n\nFollowing our review of your application for {{role_title}}, we are excited to invite you to an executive discussion with our engineering leadership.\n\nRound: {{interview_round}}\nDate: {{interview_date}}\nTime: {{interview_time}}\nMeeting Link: {{meeting_link}}\n\nPlease let us know if you need any accommodations.\n\nWarm regards,\n{{recruiter_name}}',
      variables: ['candidate_name', 'role_title', 'company_name', 'interview_round', 'interview_date', 'interview_time', 'meeting_link', 'recruiter_name'],
      is_ai_customizable: true,
      created_at: '2026-10-15T09:00:00Z',
      updated_at: '2026-10-15T09:00:00Z',
    },
    {
      id: 'd2000000-0000-0000-0000-000000000003',
      organization_id: ACME_ORG_ID,
      name: 'Candidate Quick Follow-up SMS',
      channel: 'SMS',
      subject: null,
      body_template: 'Hi {{candidate_name}}, this is {{recruiter_name}} from {{company_name}}. Just following up on our email regarding the {{role_title}} role. Let us know your availability this week!',
      variables: ['candidate_name', 'recruiter_name', 'company_name', 'role_title'],
      is_ai_customizable: false,
      created_at: '2026-10-16T14:30:00Z',
      updated_at: '2026-10-16T14:30:00Z',
    },
  ]

  public messages: any[] = [
    {
      id: 'msg-001',
      organization_id: ACME_ORG_ID,
      campaign_id: 'd3000000-0000-0000-0000-000000000001',
      candidate_id: 'c1000000-0000-0000-0000-000000000001',
      channel: 'EMAIL',
      recipient: 'aarav.sharma@example.com',
      subject: 'Exploring Senior Backend Engineer role at AttendX',
      body: 'Hi Aarav Sharma,\n\nI came across your profile and was impressed with your work in React, TypeScript. We are building high-throughput workforce infrastructure at AttendX and would love to speak with you about our open Senior Full-Stack Engineer position.\n\nBest regards,\nCarol HR',
      status: 'REPLIED',
      error_message: null,
      retry_count: 0,
      sent_at: '2026-09-28T14:32:00Z',
      delivered_at: '2026-09-28T14:33:00Z',
      opened_at: '2026-09-28T15:10:00Z',
      replied_at: '2026-09-28T16:45:00Z',
      created_at: '2026-09-28T14:32:00Z',
    },
    {
      id: 'msg-002',
      organization_id: ACME_ORG_ID,
      campaign_id: 'd3000000-0000-0000-0000-000000000001',
      candidate_id: 'c1000000-0000-0000-0000-000000000002',
      channel: 'EMAIL',
      recipient: 'ananya.iyer@example.com',
      subject: 'Frontend Architect opportunity at AttendX',
      body: 'Hi Ananya Iyer,\n\nWe would love to speak with you regarding our Frontend Architect position...',
      status: 'OPENED',
      error_message: null,
      retry_count: 0,
      sent_at: '2026-09-28T11:15:00Z',
      delivered_at: '2026-09-28T11:16:00Z',
      opened_at: '2026-09-28T12:04:00Z',
      replied_at: null,
      created_at: '2026-09-28T11:15:00Z',
    },
    {
      id: 'msg-003',
      organization_id: ACME_ORG_ID,
      campaign_id: 'd3000000-0000-0000-0000-000000000001',
      candidate_id: 'c1000000-0000-0000-0000-000000000003',
      channel: 'EMAIL',
      recipient: 'rohan.verma@example.com',
      subject: 'Interview with Engineering Director at AttendX',
      body: 'Dear Rohan Verma,\n\nFollowing our review of your application, we are excited to invite you to an executive discussion with our engineering leadership...',
      status: 'DELIVERED',
      error_message: null,
      retry_count: 0,
      sent_at: '2026-09-29T09:30:00Z',
      delivered_at: '2026-09-29T09:31:00Z',
      opened_at: null,
      replied_at: null,
      created_at: '2026-09-29T09:30:00Z',
    },
  ]

  // Multi-tenant seeding helper ensuring any tenant (Acme, SwiftLogix, etc.) has full rich data
  ensureTenantSeeded(orgId: string) {
    if (!orgId || orgId === ACME_ORG_ID) return
    const exists = this.requisitions.some(r => r.organization_id === orgId)
    if (exists) return

    const baseReqs = this.requisitions.filter(r => r.organization_id === ACME_ORG_ID)
    for (const r of baseReqs) {
      this.requisitions.push({
        ...r,
        id: `${r.id}_${orgId.slice(0, 8)}`,
        organization_id: orgId,
        skills: (r.skills || []).map((s: any) => ({
          ...s,
          id: `${s.id}_${orgId.slice(0, 8)}`,
          organization_id: orgId,
          requisition_id: `${r.id}_${orgId.slice(0, 8)}`,
        })),
      })
    }

    const baseCands = this.candidates.filter(c => c.organization_id === ACME_ORG_ID && BASE_FIXTURE_PREFIXES.some(p => c.id.startsWith(p)))
    for (const c of baseCands) {
      this.candidates.push({
        ...c,
        id: `${c.id}_${orgId.slice(0, 8)}`,
        organization_id: orgId,
      })
    }

    const baseApps = this.applications.filter(a => a.organization_id === ACME_ORG_ID && BASE_FIXTURE_PREFIXES.some(p => a.id.startsWith(p)))
    for (const a of baseApps) {
      this.applications.push({
        ...a,
        id: `${a.id}_${orgId.slice(0, 8)}`,
        organization_id: orgId,
        requisition_id: `${a.requisition_id}_${orgId.slice(0, 8)}`,
        candidate_id: `${a.candidate_id}_${orgId.slice(0, 8)}`,
      })
    }

    const baseInts = this.interviews.filter(i => i.organization_id === ACME_ORG_ID)
    for (const i of baseInts) {
      this.interviews.push({
        ...i,
        id: `${i.id}_${orgId.slice(0, 8)}`,
        organization_id: orgId,
        application_id: `${i.application_id}_${orgId.slice(0, 8)}`,
      })
    }

    const baseOffers = this.offers.filter(o => o.organization_id === ACME_ORG_ID)
    for (const o of baseOffers) {
      this.offers.push({
        ...o,
        id: `${o.id}_${orgId.slice(0, 8)}`,
        organization_id: orgId,
        application_id: `${o.application_id}_${orgId.slice(0, 8)}`,
      })
    }

    const baseDocs = this.onboardingDocuments.filter(d => d.organization_id === ACME_ORG_ID)
    for (const d of baseDocs) {
      this.onboardingDocuments.push({
        ...d,
        id: `${d.id}_${orgId.slice(0, 8)}`,
        organization_id: orgId,
        application_id: `${d.application_id}_${orgId.slice(0, 8)}`,
      })
    }

    const baseTasks = this.checklistTasks.filter(t => t.organization_id === ACME_ORG_ID)
    for (const t of baseTasks) {
      this.checklistTasks.push({
        ...t,
        id: `${t.id}_${orgId.slice(0, 8)}`,
        organization_id: orgId,
        application_id: `${t.application_id}_${orgId.slice(0, 8)}`,
      })
    }

    const baseRecs = this.recommendations.filter(r => r.organization_id === ACME_ORG_ID)
    for (const r of baseRecs) {
      this.recommendations.push({
        ...r,
        id: `${r.id}_${orgId.slice(0, 8)}`,
        organization_id: orgId,
      })
    }

    const baseCalls = this.voiceCalls.filter(c => c.organization_id === ACME_ORG_ID)
    for (const c of baseCalls) {
      this.voiceCalls.push({
        ...c,
        id: `${c.id}_${orgId.slice(0, 8)}`,
        organization_id: orgId,
        candidate_id: `${c.candidate_id}_${orgId.slice(0, 8)}`,
        application_id: c.application_id ? `${c.application_id}_${orgId.slice(0, 8)}` : null,
        requisition_id: c.requisition_id ? `${c.requisition_id}_${orgId.slice(0, 8)}` : null,
      })
    }

    const baseCamps = this.campaigns.filter(c => c.organization_id === ACME_ORG_ID)
    for (const c of baseCamps) {
      this.campaigns.push({
        ...c,
        id: `${c.id}_${orgId.slice(0, 8)}`,
        organization_id: orgId,
        requisition_id: c.requisition_id ? `${c.requisition_id}_${orgId.slice(0, 8)}` : null,
      })
    }

    const baseTpls = this.templates.filter(t => t.organization_id === ACME_ORG_ID)
    for (const t of baseTpls) {
      this.templates.push({
        ...t,
        id: `${t.id}_${orgId.slice(0, 8)}`,
        organization_id: orgId,
      })
    }

    const baseMsgs = this.messages.filter(m => m.organization_id === ACME_ORG_ID)
    for (const m of baseMsgs) {
      this.messages.push({
        ...m,
        id: `${m.id}_${orgId.slice(0, 8)}`,
        organization_id: orgId,
        campaign_id: m.campaign_id ? `${m.campaign_id}_${orgId.slice(0, 8)}` : null,
        candidate_id: m.candidate_id ? `${m.candidate_id}_${orgId.slice(0, 8)}` : null,
      })
    }
  }

  // Requisitions API
  listRequisitions(orgId: string, filters: any = {}) {
    this.ensureTenantSeeded(orgId)
    let list = this.requisitions.filter(r => r.organization_id === orgId || !orgId)
    if (filters.status && filters.status !== 'ALL') {
      list = list.filter(r => r.status === filters.status)
    }
    if (filters.search) {
      const q = filters.search.toLowerCase()
      list = list.filter(r => r.title.toLowerCase().includes(q) || r.requisition_code.toLowerCase().includes(q))
    }
    // Normalize: always return department as a plain string (not an object)
    const normalized = list.map(r => ({
      ...r,
      department: typeof r.department === 'object' ? (r.department?.name ?? 'Engineering') : (r.department ?? 'Engineering'),
      designation: typeof r.designation === 'object' ? (r.designation?.name ?? r.title) : (r.designation ?? r.title),
    }))
    return {
      data: normalized,
      total: normalized.length,
      page: filters.page || 1,
      limit: filters.limit || 20,
    }
  }

  getRequisitionById(orgId: string, id: string) {
    return this.requisitions.find(r => r.id === id && (r.organization_id === orgId || !orgId)) || this.requisitions[0]
  }

  createRequisition(orgId: string, input: any) {
    const newReq: any = {
      id: `req-${Date.now()}`,
      organization_id: orgId || ACME_ORG_ID,
      requisition_code: input.requisition_code || `REQ-${Math.floor(100 + Math.random() * 900)}`,
      title: input.title,
      status: input.status || 'OPEN',
      priority: input.priority || 'MEDIUM',
      openings_count: input.openings_count || 1,
      filled_count: 0,
      location: input.location || 'Remote',
      employment_type: input.employment_type || 'FULL_TIME',
      work_mode: input.work_mode || 'HYBRID',
      opening_date: input.opening_date || new Date().toISOString().split('T')[0],
      target_close_date: input.target_close_date || null,
      min_experience_years: input.min_experience_years || 0,
      max_experience_years: input.max_experience_years || 10,
      min_salary: input.min_salary || null,
      max_salary: input.max_salary || null,
      job_description: input.job_description || '',
      total_rounds: input.total_rounds || 3,
      document_mode: input.document_mode || 'NATIVE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      department: { id: 'd1', name: 'Engineering' },
      designation: { id: 'des1', name: input.title },
      skills: (input.skills || []).map((s: any, idx: number) => ({
        id: `sk-${Date.now()}-${idx}`,
        organization_id: orgId || ACME_ORG_ID,
        requisition_id: `req-${Date.now()}`,
        skill_name: s.skill_name,
        is_required: s.is_required ?? true,
        weight: s.weight ?? 4,
        min_experience_years: s.min_experience_years ?? 1,
        created_at: new Date().toISOString(),
      })),
    }
    this.requisitions.unshift(newReq)
    return newReq
  }

  // Candidates API
  listCandidates(orgId: string, filters: any = {}) {
    this.ensureTenantSeeded(orgId)
    let list = this.candidates.filter(c => c.organization_id === orgId || !orgId)
    if (filters.search) {
      const q = filters.search.toLowerCase()
      list = list.filter(c => (c.full_name || `${c.first_name} ${c.last_name}`).toLowerCase().includes(q) || c.email?.toLowerCase().includes(q))
    }
    if (filters.skill) {
      const sk = filters.skill.toLowerCase()
      list = list.filter(c => (c.skills || []).some((s: string) => s.toLowerCase().includes(sk)))
    }
    return {
      data: list,
      total: list.length,
      page: filters.page || 1,
      limit: filters.limit || 20,
    }
  }

  getCandidateById(orgId: string, id: string) {
    this.ensureTenantSeeded(orgId)
    const validIds = getDeterministicScopedIds(orgId, id)
    return this.candidates.find(
      c => (c.organization_id === orgId || (!orgId && c.organization_id === ACME_ORG_ID)) &&
           validIds.includes(c.id)
    )
  }

  createCandidate(orgId: string, input: any) {
    this.ensureTenantSeeded(orgId)
    // Duplicate check by email or phone within tenant
    const existing = this.candidates.find(c =>
      (c.organization_id === orgId || !orgId) &&
      ((input.email && c.email?.toLowerCase() === input.email.toLowerCase()) ||
       (input.phone && c.phone === input.phone))
    )
    if (existing) {
      const err: any = new Error(
        `Candidate with email '${input.email}' or phone '${input.phone}' already exists (${existing.first_name} ${existing.last_name}).`
      )
      err.status = 409
      throw err
    }

    const newId = input.id || `c${Date.now()}`
    const candidate = {
      id: newId,
      organization_id: orgId,
      first_name: input.first_name,
      last_name: input.last_name,
      full_name: `${input.first_name} ${input.last_name}`.trim(),
      email: input.email?.toLowerCase(),
      phone: input.phone,
      location: input.location,
      total_experience_years: input.total_experience_years || 0,
      skills: input.skills || [],
      current_designation: input.current_designation,
      current_company: input.current_company,
      notice_period_days: input.notice_period_days ?? null,
      current_ctc: input.current_ctc ?? null,
      expected_ctc: input.expected_ctc ?? null,
      consent_status: input.consent_status || 'GIVEN',
      created_at: new Date().toISOString(),
    }
    this.candidates.push(candidate)
    return candidate
  }

  // Applications API
  listApplications(orgId: string, filters: any = {}) {
    this.ensureTenantSeeded(orgId)
    let list = this.applications.filter(a => a.organization_id === orgId || !orgId)
    if (filters.requisition_id && filters.requisition_id !== 'ALL') {
      list = list.filter(a => a.requisition_id === filters.requisition_id)
    }
    if (filters.stage && filters.stage !== 'ALL') {
      list = list.filter(a => a.stage === filters.stage)
    }
    if (filters.min_score) {
      list = list.filter(a => (a.match_score || 0) >= Number(filters.min_score))
    }

    const hydrated = list.map(app => {
      const validCandIds = getDeterministicScopedIds(orgId, app.candidate_id)
      const candidate = this.candidates.find(
        c => (c.organization_id === app.organization_id || (!app.organization_id && c.organization_id === ACME_ORG_ID)) &&
             validCandIds.includes(c.id)
      )
      const validReqIds = getDeterministicScopedIds(orgId, app.requisition_id)
      const requisition = this.requisitions.find(
        r => (r.organization_id === app.organization_id || (!app.organization_id && r.organization_id === ACME_ORG_ID)) &&
             validReqIds.includes(r.id)
      )
      return {
        ...app,
        candidate: candidate ? {
          ...candidate,
          current_ctc: filters.role === 'EMPLOYEE' ? '🔒 [Confidential]' : candidate.current_ctc,
          expected_ctc: filters.role === 'EMPLOYEE' ? '🔒 [Confidential]' : candidate.expected_ctc,
        } : null,
        requisition: requisition ? {
          id: requisition.id,
          title: requisition.title,
          department: typeof requisition.department === 'object' ? (requisition.department?.name || 'Engineering') : (requisition.department || 'Engineering'),
          location: requisition.location || 'Remote',
        } : null,
      }
    })

    return {
      applications: hydrated,
      total: hydrated.length,
      page: filters.page || 1,
      limit: filters.limit || 20,
    }
  }

  getApplicationById(orgId: string, id: string) {
    this.ensureTenantSeeded(orgId)
    const validAppIds = getDeterministicScopedIds(orgId, id)
    let app = this.applications.find(a => validAppIds.includes(a.id) && (a.organization_id === orgId || !orgId))
    if (!app) {
      app = this.applications.find(a => validAppIds.includes(a.id))
    }
    if (!app) return null
    const validCandIds = getDeterministicScopedIds(orgId, app.candidate_id)
    const candidate = this.candidates.find(c => validCandIds.includes(c.id) && (c.organization_id === app.organization_id || !c.organization_id))
    const validReqIds = getDeterministicScopedIds(orgId, app.requisition_id)
    const requisition = this.requisitions.find(r => validReqIds.includes(r.id) && (r.organization_id === app.organization_id || !r.organization_id))
    return {
      ...app,
      candidate,
      requisition,
    }
  }

  updateApplicationStage(orgId: string, id: string, targetStage: string, decision?: string, notes?: string) {
    this.ensureTenantSeeded(orgId)
    const validAppIds = getDeterministicScopedIds(orgId, id)
    let app = this.applications.find(a => validAppIds.includes(a.id) && (a.organization_id === orgId || !orgId))
    if (!app) {
      app = this.applications.find(a => validAppIds.includes(a.id))
    }
    if (!app) {
      const err = new Error('Application not found') as any
      err.status = 404
      throw err
    }

    // Enforce state machine validation
    HiringStateMachine.validateTransition(app.stage, targetStage)

    app.stage = targetStage
    if (decision) app.current_decision = decision
    app.updated_at = new Date().toISOString()

    const validCandIds = getDeterministicScopedIds(orgId, app.candidate_id)
    const candidate = this.candidates.find(
      c => (c.organization_id === app.organization_id || (!app.organization_id && c.organization_id === ACME_ORG_ID)) &&
           validCandIds.includes(c.id)
    )
    const validReqIds = getDeterministicScopedIds(orgId, app.requisition_id)
    const requisition = this.requisitions.find(
      r => (r.organization_id === app.organization_id || (!app.organization_id && r.organization_id === ACME_ORG_ID)) &&
           validReqIds.includes(r.id)
    )

    return {
      ...app,
      candidate: candidate || null,
      requisition: requisition || null,
    }
  }

  createApplication(orgId: string, input: any) {
    this.ensureTenantSeeded(orgId)
    let candidateId = input.candidate_id
    if (!candidateId) {
      candidateId = `cand-${Date.now()}`
      this.candidates.push({
        id: candidateId,
        organization_id: orgId || ACME_ORG_ID,
        first_name: input.candidate_name?.split(' ')[0] || 'Candidate',
        last_name: input.candidate_name?.split(' ').slice(1).join(' ') || '',
        full_name: input.candidate_name || 'Candidate',
        email: input.email || `candidate.${Date.now()}@example.com`,
        phone: input.phone || '+1-555-0100',
        current_role: input.current_role || 'Software Engineer',
        current_company: input.current_company || 'Tech Corp',
        total_experience_years: input.experience_years || 4,
        key_skills: input.skills || ['React', 'TypeScript'],
        created_at: new Date().toISOString(),
      })
    }

    const newApp: any = {
      id: `app-${Date.now()}`,
      organization_id: orgId || ACME_ORG_ID,
      requisition_id: input.requisition_id,
      candidate_id: candidateId,
      application_code: `APP-2026-${Math.floor(100 + Math.random() * 900)}`,
      stage: input.stage || 'APPLIED',
      current_decision: 'IN_REVIEW',
      match_score: input.match_score || 85,
      skill_score: input.skill_score || 85,
      experience_score: input.experience_score || 85,
      jd_relevance_score: input.jd_relevance_score || 85,
      applied_at: new Date().toISOString(),
      match_reasoning: input.match_reasoning || {
        highlights: ['Matches required competencies'],
        concerns: [],
      },
    }
    this.applications.unshift(newApp)
    return newApp
  }

  // Interview API
  listInterviews(orgId: string, applicationId?: string) {
    this.ensureTenantSeeded(orgId)
    let list = this.interviews.filter(i => i.organization_id === orgId || !orgId)
    if (applicationId) {
      list = list.filter(i => i.application_id === applicationId)
    }
    return list.map(item => {
      const app = this.applications.find(a => a.id === item.application_id)
      const cand = app ? this.candidates.find(c => c.id === app.candidate_id) : null
      return {
        ...item,
        application: app ? { id: app.id, application_code: app.application_code, stage: app.stage } : null,
        candidate: cand ? { id: cand.id, first_name: cand.first_name, last_name: cand.last_name, email: cand.email, phone: cand.phone } : null,
        evaluations: item.evaluations || [],
      }
    })
  }

  scheduleInterview(orgId: string, input: any) {
    this.ensureTenantSeeded(orgId)
    const app = this.applications.find(a => a.id === input.application_id)
    const newInterview: any = {
      id: `int-${Date.now()}`,
      organization_id: orgId || ACME_ORG_ID,
      application_id: input.application_id,
      candidate_id: app?.candidate_id || input.candidate_id,
      round_number: input.round_number || 1,
      round_type: input.round_type || (input.round_number === 1 ? 'INTRODUCTORY' : input.round_number === 2 ? 'CODING' : 'DEEP_DIVE'),
      title: input.title || `Round ${input.round_number || 1} Interview`,
      scheduled_start: input.scheduled_start,
      scheduled_end: input.scheduled_end,
      timezone: input.timezone || 'Asia/Kolkata',
      platform: input.platform || 'GOOGLE_MEET',
      meeting_link: input.custom_meeting_link || input.meeting_link || '',
      is_manual_meet_link: Boolean(input.custom_meeting_link || input.is_manual),
      interviewer_ids: input.interviewer_ids || ['11111111-2222-2222-2222-222222222222'],
      agenda: input.agenda || '',
      instructions: input.instructions || '',
      status: 'SCHEDULED',
      decision: 'PENDING',
      invitation_status: input.invitation_status || 'PENDING_DELIVERY',
      invitation_subject: input.invitation_subject || '',
      invitation_body: input.invitation_body || '',
      evaluations: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    this.interviews.unshift(newInterview)

    // Advance application to INTERVIEW stage if currently in SHORTLISTED
    if (app && app.stage === 'SHORTLISTED') {
      app.stage = 'INTERVIEW'
    }

    return newInterview
  }

  rescheduleInterview(orgId: string, id: string, newStart: string, newEnd: string, reason?: string) {
    this.ensureTenantSeeded(orgId)
    const interview = this.interviews.find(i => i.id === id && (i.organization_id === orgId || !orgId))
    if (!interview) {
      const err: any = new Error('Interview not found')
      err.status = 404
      throw err
    }
    interview.scheduled_start = newStart
    interview.scheduled_end = newEnd
    interview.status = 'RESCHEDULED'
    if (reason) interview.notes = (interview.notes ? interview.notes + '\n' : '') + `Rescheduled: ${reason}`
    interview.updated_at = new Date().toISOString()
    return interview
  }

  cancelInterview(orgId: string, id: string, reason?: string) {
    this.ensureTenantSeeded(orgId)
    const interview = this.interviews.find(i => i.id === id && (i.organization_id === orgId || !orgId))
    if (!interview) {
      const err: any = new Error('Interview not found')
      err.status = 404
      throw err
    }
    interview.status = 'CANCELLED'
    if (reason) interview.notes = (interview.notes ? interview.notes + '\n' : '') + `Cancelled: ${reason}`
    interview.updated_at = new Date().toISOString()
    return interview
  }

  recordInterviewFeedback(orgId: string, id: string, feedback: any) {
    this.ensureTenantSeeded(orgId)
    const interview = this.interviews.find(i => i.id === id && (i.organization_id === orgId || !orgId))
    if (!interview) {
      const err: any = new Error('Interview not found')
      err.status = 404
      throw err
    }
    const evaluation = {
      id: `eval-${Date.now()}`,
      interview_id: id,
      organization_id: orgId || ACME_ORG_ID,
      evaluator_id: feedback.evaluator_id || '11111111-2222-2222-2222-222222222222',
      technical_score: feedback.technical_score ?? 85,
      communication_score: feedback.communication_score ?? 85,
      problem_solving_score: feedback.problem_solving_score ?? 85,
      culture_fit_score: feedback.culture_fit_score ?? 85,
      overall_score: feedback.overall_score ?? 85,
      scorecard_feedback: feedback.scorecard_feedback || feedback.feedback || '',
      recommendation: feedback.recommendation || 'HIRE',
      created_at: new Date().toISOString(),
    }
    if (!interview.evaluations) interview.evaluations = []
    interview.evaluations.unshift(evaluation)
    interview.status = 'COMPLETED'
    interview.decision = feedback.decision || (['STRONG_HIRE', 'HIRE'].includes(evaluation.recommendation) ? 'PASS' : 'FAIL')
    interview.decision_reason = evaluation.scorecard_feedback
    interview.updated_at = new Date().toISOString()
    return { interview, evaluation }
  }

  advanceRound(orgId: string, id: string, nextRoundInput?: any) {
    this.ensureTenantSeeded(orgId)
    const interview = this.interviews.find(i => i.id === id && (i.organization_id === orgId || !orgId))
    if (!interview) {
      const err: any = new Error('Interview not found')
      err.status = 404
      throw err
    }
    const currentRound = Number(interview.round_number || 1)
    const app = this.applications.find(a => a.id === interview.application_id)

    if (currentRound >= 3) {
      if (app) {
        app.stage = 'SELECTED'
      }
      return {
        advanced: true,
        finalRound: true,
        currentRound,
        nextRound: null,
        application: app,
        interview,
      }
    } else {
      const nextRoundNumber = currentRound + 1
      let nextInterview = null
      if (nextRoundInput && (nextRoundInput.scheduled_start || nextRoundInput.title)) {
        nextInterview = this.scheduleInterview(orgId, {
          application_id: interview.application_id,
          candidate_id: interview.candidate_id,
          round_number: nextRoundNumber,
          round_type: nextRoundNumber === 2 ? 'CODING' : 'DEEP_DIVE',
          title: nextRoundInput.title || `Round ${nextRoundNumber} Interview`,
          scheduled_start: nextRoundInput.scheduled_start || new Date(Date.now() + 86400000).toISOString(),
          scheduled_end: nextRoundInput.scheduled_end || new Date(Date.now() + 86400000 + 3600000).toISOString(),
          timezone: nextRoundInput.timezone || interview.timezone || 'Asia/Kolkata',
          platform: nextRoundInput.platform || 'GOOGLE_MEET',
          custom_meeting_link: nextRoundInput.custom_meeting_link || '',
          interviewer_ids: nextRoundInput.interviewer_ids || interview.interviewer_ids,
          notes: nextRoundInput.notes,
        })
      }
      return {
        advanced: true,
        finalRound: false,
        currentRound,
        nextRound: nextRoundNumber,
        nextInterview,
        interview,
      }
    }
  }

  createOffer(orgId: string, input: any) {
    this.ensureTenantSeeded(orgId)

    if (!input.application_id || !input.candidate_id) {
      const err = new Error('application_id and candidate_id are required') as any
      err.status = 400
      throw err
    }

    const validAppIds = getDeterministicScopedIds(orgId, input.application_id)
    const app = this.applications.find(a => (validAppIds.includes(a.id) || a.id === input.application_id) && (a.organization_id === orgId || !orgId))
    if (!app) {
      const notFoundErr = new Error(`Job application '${input.application_id}' not found.`) as any
      notFoundErr.status = 404
      throw notFoundErr
    }

    const validCandIds = getDeterministicScopedIds(orgId, app.candidate_id)
    if (!validCandIds.includes(input.candidate_id) && app.candidate_id !== input.candidate_id) {
      const mismatchErr = new Error(`Candidate '${input.candidate_id}' does not match application candidate.`) as any
      mismatchErr.status = 400
      throw mismatchErr
    }

    // Check duplicate active offer guard
    const existingOffer = this.offers.find(
      o => (o.application_id === app.id || validAppIds.includes(o.application_id)) &&
           (o.organization_id === orgId || !orgId) &&
           ['DRAFT', 'SENT', 'ACCEPTED'].includes(o.status)
    )
    if (existingOffer) {
      const dupErr = new Error('An active offer already exists for this job application.') as any
      dupErr.status = 409
      throw dupErr
    }

    const fixed = Number(input.fixed_salary)
    if (isNaN(fixed) || fixed <= 0) {
      const valErr = new Error('fixed_salary must be a positive number') as any
      valErr.status = 400
      throw valErr
    }
    const variable = Number(input.variable_salary) || 0
    const bonus = Number(input.bonus) || 0
    const totalCtc = fixed + variable + bonus

    const d = new Date()
    const yyyymm = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
    const rand = Math.floor(1000 + Math.random() * 9000)
    const offerNumber = `OFF-${yyyymm}-${rand}`

    const newOffer: any = {
      id: `off-${Date.now()}`,
      organization_id: orgId || ACME_ORG_ID,
      application_id: app.id,
      candidate_id: app.candidate_id,
      offer_number: offerNumber,
      designation: input.designation || 'Senior Software Engineer',
      department_id: input.department_id || null,
      fixed_salary: fixed,
      variable_salary: variable,
      bonus: bonus,
      total_ctc: totalCtc,
      work_location: input.work_location || 'Bangalore Hub',
      work_mode: input.work_mode || 'HYBRID',
      reporting_manager_id: input.reporting_manager_id || null,
      joining_date: input.joining_date || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      probation_months: input.probation_months ?? 3,
      benefits: input.benefits || ['Comprehensive Health Insurance', 'Provident Fund', 'Annual Bonus'],
      terms_and_conditions: input.terms_and_conditions || 'Standard company employment policies, non-disclosure agreements, and code of conduct apply.',
      approval_status: 'APPROVED',
      status: 'DRAFT',
      created_at: new Date().toISOString(),
    }

    this.offers.unshift(newOffer)
    return newOffer
  }

  async releaseOffer(orgId: string, offerId: string, portalBaseUrl: string = 'http://localhost:3000') {
    this.ensureTenantSeeded(orgId)
    const offer = this.offers.find(o => o.id === offerId && (o.organization_id === orgId || !orgId))
    if (!offer) {
      const err = new Error('Offer not found') as any
      err.status = 404
      throw err
    }

    const token = crypto.randomBytes(32).toString('hex')
    offer.status = 'SENT'
    offer.token = token
    offer.token_hash = crypto.createHash('sha256').update(token).digest('hex')
    offer.sent_at = new Date().toISOString()
    offer.expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const validAppIds = getDeterministicScopedIds(orgId, offer.application_id)
    const app = this.applications.find(a => (validAppIds.includes(a.id) || a.id === offer.application_id) && (a.organization_id === orgId || !orgId))
    if (app) {
      app.stage = 'OFFER_RELEASED'
    }

    const candidate = app ? this.candidates.find(c => c.id === app.candidate_id || c.id === offer.candidate_id) : null
    const candidateName = candidate?.full_name || `${candidate?.first_name || ''} ${candidate?.last_name || ''}`.trim() || 'Candidate'
    const candidateEmail = candidate?.email || 'candidate@example.com'

    const portalUrl = `${portalBaseUrl}/offer-portal/${token}`

    // Render Handlebars Offer Letter & Offer Email
    let emailResult: any = null
    let offerLetterDoc: any = null
    try {
      const { OfferTemplateService } = await import('./email/offer-template-service.ts')
      const { EmailService } = await import('./email/email-service.ts')

      offerLetterDoc = OfferTemplateService.renderOfferLetter({
        companyName: 'AttendX Inc.',
        candidateName,
        candidateEmail,
        offerNumber: offer.offer_number || `OFF-${offer.id.slice(0, 8)}`,
        designation: offer.designation,
        department: 'Engineering',
        fixedSalary: offer.fixed_salary,
        variableSalary: offer.variable_salary,
        bonus: offer.bonus,
        totalCtc: offer.total_ctc,
        joiningDate: offer.joining_date,
        workMode: offer.work_mode,
        workLocation: offer.work_location,
        portalUrl,
        expiresAt: offer.expires_at,
      })

      emailResult = await EmailService.sendOfferEmail({
        offerId: offer.id,
        organizationId: orgId,
        recipientEmail: candidateEmail,
        candidateName,
        designation: offer.designation,
        companyName: 'AttendX Inc.',
        department: 'Engineering',
        totalCtc: offer.total_ctc,
        fixedSalary: offer.fixed_salary,
        variableSalary: offer.variable_salary,
        bonus: offer.bonus,
        joiningDate: offer.joining_date,
        workMode: offer.work_mode,
        workLocation: offer.work_location,
        portalUrl,
        expiresAt: offer.expires_at,
      })
    } catch (renderOrSendErr) {
      console.error('[MockStore.releaseOffer] Email render or send warning:', renderOrSendErr)
    }

    return {
      success: true,
      offerId: offer.id,
      applicationId: offer.application_id,
      stage: 'OFFER_RELEASED',
      portalUrl,
      tokenExpiresAt: offer.expires_at,
      emailSent: emailResult ? emailResult.success : true,
      emailMode: emailResult ? emailResult.simulationStatus : 'SIMULATED',
      emailDelivery: emailResult,
      offerLetter: offerLetterDoc ? { offerNumber: offerLetterDoc.offerNumber } : null,
    }
  }


  // Offer API
  getOfferByToken(token: string) {
    const offer = this.offers.find(o => o.token === token)
    if (!offer) return null
    const app = this.applications.find(a => a.id === offer.application_id)
    const candidate = app ? this.candidates.find(c => c.id === app.candidate_id) : null
    const req = app ? this.requisitions.find(r => r.id === app.requisition_id) : null

    return {
      offer,
      candidate: candidate ? {
        id: candidate.id,
        first_name: candidate.first_name,
        last_name: candidate.last_name,
        email: candidate.email,
        phone: candidate.phone,
      } : null,
      requisition: req ? {
        title: req.title,
        location: req.location,
        employment_type: req.employment_type,
        department: typeof req.department === 'object' ? req.department?.name : (req.department || 'Engineering'),
      } : null,
    }
  }

  respondOffer(token: string, action: 'ACCEPT' | 'DECLINE', eSignature?: string) {
    const offer = this.offers.find(o => o.token === token)
    if (!offer) {
      const err = new Error('Offer token not found or expired') as any
      err.status = 404
      throw err
    }
    if (offer.status !== 'SENT') {
      const err = new Error(`Offer has already been ${offer.status.toLowerCase()}`) as any
      err.status = 409
      throw err
    }

    offer.status = action === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED'
    offer.accepted_at = action === 'ACCEPT' ? new Date().toISOString() : undefined
    offer.declined_at = action === 'DECLINE' ? new Date().toISOString() : undefined
    offer.e_ack_name = eSignature

    const nextStage = action === 'ACCEPT' ? 'OFFER_FINAL_ACCEPTED' : 'OFFER_FINAL_DECLINED'
    const app = this.applications.find(a => a.id === offer.application_id)
    if (app) {
      app.stage = nextStage
    }

    if (action === 'ACCEPT') {
      // Seed default verified documents and completed tasks for immediate joining readiness
      const existingDocs = this.onboardingDocuments.filter(d => d.application_id === offer.application_id)
      if (existingDocs.length === 0) {
        const docId1 = `doc-${Date.now()}-1`
        const docId2 = `doc-${Date.now()}-2`
        this.onboardingDocuments.push(
          {
            id: docId1,
            organization_id: offer.organization_id,
            application_id: offer.application_id,
            document_type: 'ID_PROOF',
            document_name: 'Aadhaar Card Copy',
            file_url: `/api/hiring/onboarding/documents/${docId1}/preview`,
            status: 'VERIFIED',
            is_required: true,
            reviewed_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          },
          {
            id: docId2,
            organization_id: offer.organization_id,
            application_id: offer.application_id,
            document_type: 'BANK_DETAILS',
            document_name: 'PAN Card Copy',
            file_url: `/api/hiring/onboarding/documents/${docId2}/preview`,
            status: 'VERIFIED',
            is_required: true,
            reviewed_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          }
        )

      }

      const existingTasks = this.checklistTasks.filter(t => t.application_id === offer.application_id)
      if (existingTasks.length === 0) {
        this.checklistTasks.push(
          {
            id: `task-${Date.now()}-1`,
            organization_id: offer.organization_id,
            application_id: offer.application_id,
            task_name: 'Company Laptop & Peripheral Dispatch',
            category: 'IT',
            status: 'COMPLETED',
            is_required: true,
            completed_at: new Date().toISOString(),
          },
          {
            id: `task-${Date.now()}-2`,
            organization_id: offer.organization_id,
            application_id: offer.application_id,
            task_name: 'Google Workspace & Slack Setup',
            category: 'IT',
            status: 'COMPLETED',
            is_required: true,
            completed_at: new Date().toISOString(),
          }
        )
      }
    }

    return {
      success: true,
      decision: action,
      status: offer.status,
      stage: nextStage,
      onboarding_id: `onb-${offer.application_id}`,
      offer,
    }
  }

  // Onboarding API
  verifyDocument(orgId: string, docId: string, status: 'VERIFIED' | 'REJECTED', rejectionReason?: string) {
    const doc = this.onboardingDocuments.find(d => d.id === docId && (d.organization_id === orgId || !orgId))
    if (!doc) {
      const err = new Error('Document not found') as any
      err.status = 404
      throw err
    }
    doc.status = status
    doc.reviewed_at = new Date().toISOString()
    doc.reviewer_comment = rejectionReason
    return doc
  }

  updateChecklistTask(orgId: string, taskId: string, status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED') {
    const task = this.checklistTasks.find(t => t.id === taskId && (t.organization_id === orgId || !orgId))
    if (!task) {
      const err = new Error('Task not found') as any
      err.status = 404
      throw err
    }
    task.status = status
    task.completed_at = status === 'COMPLETED' ? new Date().toISOString() : undefined
    return task
  }

  convertToEmployee(orgId: string, onboardingId: string, input: any = {}) {
    this.ensureTenantSeeded(orgId)
    const appId = onboardingId.startsWith('onb-') ? onboardingId.replace('onb-', '') : onboardingId
    const app = this.applications.find(a => (a.id === appId || `onb-${a.id}` === onboardingId) && (a.organization_id === orgId || !orgId))
    if (!app) {
      const err = new Error('Onboarding process not found') as any
      err.status = 404
      throw err
    }

    app.stage = 'ONBOARDED'
    const empId = `emp-${Date.now()}`

    return {
      success: true,
      onboardingId,
      stage: 'ONBOARDED',
      employeeId: empId,
      user_id: empId,
      work_email: input.work_email || 'employee@attendx.com',
    }
  }

  // Analytics API
  getFunnelMetrics(orgId: string) {
    const stages = [
      { stage: 'SOURCED', label: 'Sourced', count: 28, conversionRate: 100, avgDurationDays: 1.5 },
      { stage: 'APPLIED', label: 'Applied', count: 24, conversionRate: 86, avgDurationDays: 2.1 },
      { stage: 'SHORTLISTED', label: 'Shortlisted', count: 18, conversionRate: 75, avgDurationDays: 1.8 },
      { stage: 'INTERVIEW', label: 'Interview Rounds', count: 12, conversionRate: 67, avgDurationDays: 4.2 },
      { stage: 'SELECTED', label: 'Selected', count: 7, conversionRate: 58, avgDurationDays: 1.2 },
      { stage: 'OFFER_RELEASED', label: 'Offer Released', count: 6, conversionRate: 86, avgDurationDays: 2.0 },
      { stage: 'ONBOARDED', label: 'Onboarded', count: 4, conversionRate: 67, avgDurationDays: 1.7 },
    ]

    return {
      stages,
      totalCandidates: 28,
      totalHires: 4,
      overallConversionRate: 14.3,
      timeToHireDays: 14.5,
    }
  }

  getBottlenecks(orgId: string) {
    return {
      bottlenecks: [
        {
          stage: 'INTERVIEW',
          avg_days_in_stage: 4.8,
          active_candidate_count: 5,
          sla_days: 3.0,
          is_alert: true,
          alert_reason: 'Average interview round completion exceeds 3.0-day SLA by 1.8 days.',
        },
        {
          stage: 'DOCUMENTS_PENDING',
          avg_days_in_stage: 3.4,
          active_candidate_count: 2,
          sla_days: 3.0,
          is_alert: true,
          alert_reason: 'Candidates are taking longer to upload background verification documents.',
        },
        {
          stage: 'SHORTLISTED',
          avg_days_in_stage: 1.5,
          active_candidate_count: 8,
          sla_days: 2.0,
          is_alert: false,
        },
      ],
    }
  }

  getCompetencies(orgId: string) {
    return {
      competencies: [
        { competency: 'TypeScript & React', average_score: 88, benchmark: 80, gap: 8 },
        { competency: 'System Architecture', average_score: 82, benchmark: 75, gap: 7 },
        { competency: 'Database & SQL', average_score: 79, benchmark: 75, gap: 4 },
        { competency: 'Problem Solving', average_score: 85, benchmark: 80, gap: 5 },
        { competency: 'Communication', average_score: 84, benchmark: 70, gap: 14 },
      ],
    }
  }

  getRecommendations(orgId: string) {
    if (orgId && (orgId.includes('empty') || orgId === '00000000-0000-0000-0000-000000000000')) {
      return { recommendations: [] }
    }
    this.ensureTenantSeeded(orgId)
    const recs = this.recommendations.filter(r => r.organization_id === orgId || !orgId)
    return {
      recommendations: recs,
    }
  }

  reviewRecommendation(
    orgId: string,
    id: string,
    status: 'ACCEPTED' | 'REJECTED' | 'PENDING',
    reviewNotes?: string | null,
    reviewerId?: string | null
  ) {
    this.ensureTenantSeeded(orgId)
    const rec = this.recommendations.find(r => r.id === id && (r.organization_id === orgId || !orgId))
    if (rec) {
      rec.status = status
      rec.review_notes = reviewNotes || null
      rec.reviewed_by = reviewerId || null
      rec.reviewed_at = new Date().toISOString()
      return rec
    }
    return null
  }

  // Offers API
  listOffers(orgId: string) {
    this.ensureTenantSeeded(orgId)
    const offers = this.offers.filter(o => o.organization_id === orgId || !orgId)
    return offers.map(o => {
      const app = this.applications.find(a => a.id === o.application_id)
      const cand = app ? this.candidates.find(c => c.id === app.candidate_id) : null
      return {
        ...o,
        candidate: cand ? {
          ...cand,
          full_name: cand.full_name || `${cand.first_name || ''} ${cand.last_name || ''}`.trim(),
        } : null,
        application: app ? {
          id: app.id,
          stage: app.stage,
          application_code: app.application_code,
        } : null,
      }
    })
  }

  // Onboarding Processes API
  listOnboarding(orgId: string, filters: any = {}) {
    this.ensureTenantSeeded(orgId)
    const targetApps = this.applications.filter(a =>
      (a.organization_id === orgId || !orgId) &&
      ['SELECTED', 'OFFER_RELEASED', 'OFFER_ACCEPTED', 'OFFER_FINAL_ACCEPTED', 'DOCUMENTS_PENDING', 'DOCUMENTS_VERIFIED', 'ONBOARDED'].includes(a.stage)
    )

    const list = targetApps.map(app => {
      const candidate = this.candidates.find(c => c.id === app.candidate_id)
      const requisition = this.requisitions.find(r => r.id === app.requisition_id)
      const docs = this.onboardingDocuments.filter(d => d.application_id === app.id)
      const tasks = this.checklistTasks.filter(t => t.application_id === app.id)
      const completedTasks = tasks.filter(t => t.status === 'COMPLETED').length
      const totalTasks = Math.max(tasks.length, 1)
      const pct = Math.round((completedTasks / totalTasks) * 100)

      return {
        id: `onb-${app.id}`,
        organization_id: app.organization_id,
        application_id: app.id,
        candidate_id: app.candidate_id,
        candidate: candidate ? {
          id: candidate.id,
          full_name: candidate.full_name,
          email: candidate.email,
          phone: candidate.phone,
        } : { id: app.candidate_id, full_name: 'Candidate', email: '', phone: '' },
        application: {
          id: app.id,
          application_code: app.application_code,
          stage: app.stage,
          requisition: requisition ? {
            id: requisition.id,
            title: requisition.title,
            department: typeof requisition.department === 'object' ? requisition.department?.name : (requisition.department || 'Engineering'),
          } : { id: '', title: 'General Requisition', department: 'Operations' },
        },
        status: app.stage === 'ONBOARDED' ? 'COMPLETED' : 'IN_PROGRESS',
        target_joining_date: '2026-10-15',
        completion_percentage: app.stage === 'ONBOARDED' ? 100 : Math.max(pct, 45),
        documents: docs,
        tasks: tasks,
        created_at: app.applied_at || new Date().toISOString(),
      }
    })

    return { processes: list, data: list }
  }

  // Candidate evaluation profiles for analytics page
  getCandidateProfiles(orgId: string) {
    return [
      {
        id: 'aarav-sharma',
        name: 'Aarav Sharma',
        initials: 'AS',
        avatarBg: '#5B5BF5',
        role: 'Backend Lead',
        experience: '7 yrs experience',
        lastInterviewDate: '28 Sep 2026',
        overallScore: 84,
        badge: 'Interview Rounds',
        rounds: [
          { name: 'Screening', date: '18 Sep', score: 78 },
          { name: 'Technical R1', date: '22 Sep', score: 85 },
          { name: 'Technical R2', date: '25 Sep', score: 88 },
          { name: 'Culture', date: '28 Sep', score: 80 },
        ],
        competencies: [
          { name: 'Technical Skills', score: 88, target: 75 },
          { name: 'Communication', score: 82, target: 70 },
          { name: 'Problem Solving', score: 85, target: 72 },
          { name: 'Culture Fit', score: 80, target: 80 },
          { name: 'System Design', score: 86, target: 70 },
        ],
      },
      {
        id: 'meera-iyer',
        name: 'Meera Iyer',
        initials: 'MI',
        avatarBg: '#059669',
        role: 'Senior Full-Stack',
        experience: '6 yrs experience',
        lastInterviewDate: '24 Sep 2026',
        overallScore: 91,
        badge: 'Interview Rounds',
        rounds: [
          { name: 'Screening', date: '15 Sep', score: 88 },
          { name: 'Technical R1', date: '19 Sep', score: 92 },
          { name: 'Technical R2', date: '22 Sep', score: 95 },
          { name: 'Culture', date: '24 Sep', score: 89 },
        ],
        competencies: [
          { name: 'Technical Skills', score: 94, target: 75 },
          { name: 'Communication', score: 88, target: 70 },
          { name: 'Problem Solving', score: 92, target: 72 },
          { name: 'Culture Fit', score: 85, target: 80 },
          { name: 'System Design', score: 90, target: 70 },
        ],
      },
      {
        id: 'rohan-verma',
        name: 'Rohan Verma',
        initials: 'RV',
        avatarBg: '#8B5CF6',
        role: 'Lead Architect',
        experience: '8 yrs experience',
        lastInterviewDate: '20 Sep 2026',
        overallScore: 89,
        badge: 'Selected',
        rounds: [
          { name: 'Screening', date: '12 Sep', score: 82 },
          { name: 'Technical R1', date: '16 Sep', score: 90 },
          { name: 'Technical R2', date: '20 Sep', score: 94 },
        ],
        competencies: [
          { name: 'Technical Skills', score: 92, target: 75 },
          { name: 'Communication', score: 84, target: 70 },
          { name: 'Problem Solving', score: 89, target: 72 },
          { name: 'Culture Fit', score: 82, target: 80 },
          { name: 'System Design', score: 95, target: 70 },
        ],
      },
      {
        id: 'priya-nair',
        name: 'Priya Nair',
        initials: 'PN',
        avatarBg: '#EC4899',
        role: 'Cloud Architect',
        experience: '5 yrs experience',
        lastInterviewDate: '22 Sep 2026',
        overallScore: 93,
        badge: 'Offer Released',
        rounds: [
          { name: 'Screening', date: '10 Sep', score: 90 },
          { name: 'Technical R1', date: '15 Sep', score: 94 },
          { name: 'Technical R2', date: '18 Sep', score: 96 },
          { name: 'Leadership', date: '22 Sep', score: 92 },
        ],
        competencies: [
          { name: 'Technical Skills', score: 95, target: 75 },
          { name: 'Communication', score: 91, target: 70 },
          { name: 'Problem Solving', score: 94, target: 72 },
          { name: 'Culture Fit', score: 88, target: 80 },
          { name: 'System Design', score: 96, target: 70 },
        ],
      },
    ]
  }

  listVoiceCalls(organizationId: string, filters?: { candidate_id?: string; requisition_id?: string; call_purpose?: string; status?: string }) {
    this.ensureTenantSeeded(organizationId)
    let list = this.voiceCalls.filter(c => c.organization_id === organizationId || !c.organization_id)
    if (filters?.candidate_id) {
      const validCids = getDeterministicScopedIds(organizationId, filters.candidate_id)
      list = list.filter(c => validCids.includes(c.candidate_id))
    }
    if (filters?.requisition_id) {
      const validRids = getDeterministicScopedIds(organizationId, filters.requisition_id)
      list = list.filter(c => c.requisition_id && validRids.includes(c.requisition_id))
    }
    if (filters?.call_purpose) {
      list = list.filter(c => c.call_purpose?.toUpperCase() === filters.call_purpose?.toUpperCase())
    }
    if (filters?.status) {
      list = list.filter(c => c.status?.toUpperCase() === filters.status?.toUpperCase())
    }
    return list.map(c => {
      const validCandIds = getDeterministicScopedIds(organizationId, c.candidate_id)
      const candidate = this.candidates.find(
        cand => (cand.organization_id === c.organization_id || (!c.organization_id && cand.organization_id === ACME_ORG_ID)) &&
                validCandIds.includes(cand.id)
      )
      const validReqIds = c.requisition_id ? getDeterministicScopedIds(organizationId, c.requisition_id) : []
      const requisition = this.requisitions.find(
        r => (r.organization_id === c.organization_id || (!c.organization_id && r.organization_id === ACME_ORG_ID)) &&
             validReqIds.includes(r.id)
      )
      return {
        ...c,
        candidate: candidate || null,
        requisition: requisition || null,
      }
    })
  }

  initiateVoiceCall(organizationId: string, userId: string, input: any) {
    this.ensureTenantSeeded(organizationId)

    // 1. Resolve candidate strictly scoped to tenant with exact deterministic ID mapping
    const validCandidateIds = getDeterministicScopedIds(organizationId, input.candidate_id)
    const candidate = this.candidates.find(
      c => (c.organization_id === organizationId || (!organizationId && c.organization_id === ACME_ORG_ID)) &&
           validCandidateIds.includes(c.id)
    )

    if (!candidate) {
      const err: any = new Error(`Candidate '${input.candidate_id}' not found.`)
      err.status = 404
      throw err
    }

    // 2. Candidate consent verification
    if (candidate.consent_status === 'WITHDRAWN') {
      const err: any = new Error('Candidate has withdrawn consent for voice communications.')
      err.status = 403
      throw err
    }

    // 3. Resolve phone number
    const targetPhone = input.phone_number || candidate.phone
    if (!targetPhone || !targetPhone.trim()) {
      const err: any = new Error('Candidate does not have a valid phone number.')
      err.status = 400
      throw err
    }

    // 4. Resolve requisition and application independently
    let application: any = null
    if (input.application_id) {
      const validAppIds = getDeterministicScopedIds(organizationId, input.application_id)
      application = this.applications.find(
        a => (a.organization_id === organizationId || (!organizationId && a.organization_id === ACME_ORG_ID)) &&
             validAppIds.includes(a.id)
      )
      if (!application) {
        const err: any = new Error(`Application '${input.application_id}' not found.`)
        err.status = 404
        throw err
      }
      if (application.candidate_id !== candidate.id && !validCandidateIds.includes(application.candidate_id)) {
        const err: any = new Error(`Application '${input.application_id}' does not belong to candidate '${candidate.id}'.`)
        err.status = 400
        throw err
      }
    }

    const targetReqId = input.requisition_id || application?.requisition_id
    let requisition: any = null
    if (targetReqId) {
      const validReqIds = getDeterministicScopedIds(organizationId, targetReqId)
      requisition = this.requisitions.find(
        r => (r.organization_id === organizationId || (!organizationId && r.organization_id === ACME_ORG_ID)) &&
             validReqIds.includes(r.id)
      )
      if (!requisition && input.requisition_id) {
        const err: any = new Error(`Requisition '${input.requisition_id}' not found.`)
        err.status = 404
        throw err
      }
    }

    const purpose = input.call_purpose || 'SCREENING'

    // 5. Follow-up duplicate prevention (1-hour cooldown)
    if (purpose === 'FOLLOW_UP') {
      const oneHourAgo = Date.now() - 3600000
      const existingActive = this.voiceCalls.find(
        c => c.organization_id === organizationId &&
             c.candidate_id === candidate.id &&
             c.call_purpose === 'FOLLOW_UP' &&
             ['INITIATED', 'IN_PROGRESS'].includes(c.status)
      )
      if (existingActive) {
        const err: any = new Error('An active follow-up call already exists for this candidate.')
        err.status = 409
        throw err
      }

      const recentCompleted = this.voiceCalls.find(
        c => c.organization_id === organizationId &&
             c.candidate_id === candidate.id &&
             c.call_purpose === 'FOLLOW_UP' &&
             c.status === 'COMPLETED' &&
             new Date(c.created_at).getTime() >= oneHourAgo
      )
      if (recentCompleted) {
        const err: any = new Error('A follow-up call was already completed for this candidate recently.')
        err.status = 409
        throw err
      }
    }

    // 6. Generate authentic simulated call
    const callRecord = {
      id: `call-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      organization_id: organizationId,
      candidate_id: candidate.id,
      requisition_id: requisition?.id || input.requisition_id || null,
      application_id: application?.id || input.application_id || null,
      call_provider: 'MOCK',
      is_simulated: true,
      simulation_notice: 'SIMULATED CALL: This conversation was generated deterministically by Mock Telephony for sandbox verification. Dialogue responses and metrics do NOT represent statements provided by the actual candidate.',
      provider_call_id: `mock_call_${Date.now()}`,
      phone_number: targetPhone,
      call_purpose: purpose,
      status: 'COMPLETED',
      duration_seconds: 285,
      recording_url: `https://storage.attendx.io/recordings/call_${Date.now()}.mp3`,
      transcript: `[SIMULATION NOTICE: Automated sandbox test dialogue. Not an actual candidate recording.]\nAI: Hello ${candidate.first_name}, calling from AttendX regarding your application for ${requisition?.title || 'the open position'}. Are you available for a brief discussion?\n${candidate.first_name}: Yes, definitely! I am available.\nAI: Great. Could you tell us about your experience with ${candidate.skills?.slice(0, 3).join(', ') || 'core software engineering'}?\n${candidate.first_name}: Absolutely, I have ${candidate.total_experience_years || 2} years of hands-on experience designing scalable architectures.\nAI: Thank you, we will follow up with next steps shortly.`,
      ai_summary: `[SIMULATION SUMMARY] Demonstrated technical competencies in ${(candidate.skills || []).slice(0, 3).join(', ')}. Discussion deferred notice period and compensation details to formal HR rounds.`,
      overall_score: 87,
      sentiment: 'POSITIVE',
      extracted_data: {
        is_simulated: true,
        simulation_notice: 'Simulated dialogue extraction. Does not represent actual candidate responses.',
        noticePeriodDays: candidate.notice_period_days ?? null,
        expectedSalary: candidate.expected_ctc ? `${candidate.expected_ctc}` : null,
        currentSalary: candidate.current_ctc ? `${candidate.current_ctc}` : null,
        yearsOfExperience: candidate.total_experience_years || null,
        workModePreference: candidate.location ? `Based in ${candidate.location}` : null,
        skillsMentioned: candidate.skills || [],
        score_breakdown: {
          skill_relevance: { score: 88 },
          role_relevance: { score: 85 },
          communication: { score: 90 },
          experience: { score: 86 },
          availability_fit: { score: 90 },
        },
      },
      model_name: 'attendx-voice-v2',
      model_version: '2.0.0',
      created_at: new Date().toISOString(),
      candidate,
      requisition: requisition || null,
    }

    this.voiceCalls.unshift(callRecord)

    // Log mock audit mutation
    this.auditLogs.push({
      id: `audit-${Date.now()}`,
      organization_id: organizationId,
      user_id: userId,
      action: 'VOICE_CALL_INITIATED',
      entity_type: 'ai_voice_calls',
      entity_id: callRecord.id,
      new_values: {
        candidate_id: candidate.id,
        call_purpose: purpose,
        provider: callRecord.call_provider,
      },
      created_at: new Date().toISOString(),
    })

    return callRecord
  }

  // ============================================================
  // Outreach Module Store Operations
  // ============================================================

  listCampaigns(orgId: string) {
    this.ensureTenantSeeded(orgId)
    const list = this.campaigns.filter(c => c.organization_id === orgId)

    return list.map(camp => {
      let req = this.requisitions.find(r => r.id === camp.requisition_id)
      if (!req && camp.requisition_id) {
        const baseReqId = camp.requisition_id.split('_')[0]
        req = this.requisitions.find(r => r.id === baseReqId)
      }

      // Derive dynamic communication counts from actual messages if present
      const campMsgs = this.messages.filter(m => m.campaign_id === camp.id || m.campaign_id === camp.id.split('_')[0])
      const realSent = campMsgs.length
      const realDelivered = campMsgs.filter(m => m.status === 'DELIVERED' || m.status === 'OPENED' || m.status === 'REPLIED').length
      const realOpened = campMsgs.filter(m => m.status === 'OPENED' || m.status === 'REPLIED').length
      const realReplied = campMsgs.filter(m => m.status === 'REPLIED').length

      return {
        ...camp,
        total_sent: Math.max(camp.total_sent || 0, realSent),
        total_delivered: Math.max(camp.total_delivered || 0, realDelivered),
        total_opened: Math.max(camp.total_opened || 0, realOpened),
        total_replied: Math.max(camp.total_replied || 0, realReplied),
        requisition: req ? { id: req.id, title: req.title } : null,
      }
    })
  }

  getCampaign(orgId: string, campaignId: string) {
    this.ensureTenantSeeded(orgId)
    const baseId = campaignId.split('_')[0]
    const validIds = [campaignId, baseId, `${baseId}_${orgId.slice(0, 8)}`]

    return this.campaigns.find(c =>
      validIds.includes(c.id) && c.organization_id === orgId
    ) || null
  }

  createCampaign(orgId: string, input: any) {
    this.ensureTenantSeeded(orgId)
    if (!input.name || !input.name.trim()) {
      const err = new Error('name is required') as any
      err.status = 400
      throw err
    }

    let req = null
    if (input.requisition_id) {
      req = this.requisitions.find(r => r.id === input.requisition_id || r.id === input.requisition_id.split('_')[0])
    }

    const campaign = {
      id: `camp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      organization_id: orgId,
      requisition_id: input.requisition_id || null,
      name: input.name.trim(),
      channels: Array.isArray(input.channels) && input.channels.length > 0 ? input.channels : ['EMAIL'],
      status: input.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT',
      total_targeted: Number(input.total_targeted || 0),
      total_sent: 0,
      total_delivered: 0,
      total_opened: 0,
      total_replied: 0,
      created_by: input.created_by || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      requisition: req ? { id: req.id, title: req.title } : null,
    }

    this.campaigns.unshift(campaign)
    return campaign
  }

  updateCampaign(orgId: string, campaignId: string, patch: any) {
    const camp = this.getCampaign(orgId, campaignId)
    if (!camp) {
      const err = new Error(`Campaign '${campaignId}' not found`) as any
      err.status = 404
      throw err
    }

    if (patch.status) camp.status = patch.status
    if (patch.name) camp.name = patch.name.trim()
    if (patch.total_sent !== undefined) camp.total_sent = patch.total_sent
    if (patch.total_delivered !== undefined) camp.total_delivered = patch.total_delivered
    if (patch.total_opened !== undefined) camp.total_opened = patch.total_opened
    if (patch.total_replied !== undefined) camp.total_replied = patch.total_replied
    camp.updated_at = new Date().toISOString()

    return camp
  }

  listTemplates(orgId: string) {
    this.ensureTenantSeeded(orgId)
    return this.templates.filter(t => t.organization_id === orgId)
  }

  getTemplate(orgId: string, templateId: string) {
    this.ensureTenantSeeded(orgId)
    const baseId = templateId.split('_')[0]
    const validIds = [templateId, baseId, `${baseId}_${orgId.slice(0, 8)}`]

    return this.templates.find(t =>
      validIds.includes(t.id) && t.organization_id === orgId
    ) || null
  }

  createTemplate(orgId: string, input: any) {
    this.ensureTenantSeeded(orgId)
    if (!input.name || !input.name.trim()) {
      const err = new Error('name is required') as any
      err.status = 400
      throw err
    }
    if (!input.body_template || !input.body_template.trim()) {
      const err = new Error('body_template is required') as any
      err.status = 400
      throw err
    }

    const variables = Array.isArray(input.variables) && input.variables.length > 0
      ? input.variables
      : TemplateEngine.extractVariables(`${input.body_template} ${input.subject || ''}`)

    const tpl = {
      id: `tmpl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      organization_id: orgId,
      name: input.name.trim(),
      channel: input.channel || 'EMAIL',
      subject: input.subject || null,
      body_template: input.body_template.trim(),
      variables,
      is_ai_customizable: input.is_ai_customizable !== false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    this.templates.unshift(tpl)
    return tpl
  }

  listMessages(orgId: string, filters: { candidateId?: string; campaignId?: string } = {}) {
    this.ensureTenantSeeded(orgId)
    let list = this.messages.filter(m => m.organization_id === orgId)

    if (filters.candidateId) {
      const baseCand = filters.candidateId.split('_')[0]
      list = list.filter(m => m.candidate_id === filters.candidateId || m.candidate_id === baseCand)
    }
    if (filters.campaignId) {
      const baseCamp = filters.campaignId.split('_')[0]
      list = list.filter(m => m.campaign_id === filters.campaignId || m.campaign_id === baseCamp)
    }

    return list.map(msg => {
      let cand = this.candidates.find(c => c.id === msg.candidate_id)
      if (!cand && msg.candidate_id) {
        const baseCandId = msg.candidate_id.split('_')[0]
        cand = this.candidates.find(c => c.id === baseCandId)
      }
      return {
        ...msg,
        candidate_name: cand ? (cand.full_name || `${cand.first_name} ${cand.last_name}`) : (msg.candidate_name || 'Candidate'),
        candidate: cand ? {
          id: cand.id,
          first_name: cand.first_name,
          last_name: cand.last_name,
          full_name: cand.full_name || `${cand.first_name} ${cand.last_name}`,
          email: cand.email,
          phone: cand.phone,
        } : null,
      }
    })
  }

  recordMessage(orgId: string, msg: any) {
    this.ensureTenantSeeded(orgId)
    let cand = this.candidates.find(c => c.id === msg.candidate_id || c.id === msg.candidate_id?.split('_')[0])
    const candidateName = cand ? (cand.full_name || `${cand.first_name} ${cand.last_name}`) : (msg.candidate_name || 'Candidate')

    const newMsg = {
      id: msg.id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      organization_id: orgId,
      campaign_id: msg.campaign_id || null,
      candidate_id: msg.candidate_id,
      candidate_name: candidateName,
      channel: msg.channel || 'EMAIL',
      recipient: msg.recipient,
      subject: msg.subject || null,
      body: msg.body,
      status: msg.status || 'SENT',
      error_message: msg.error_message || null,
      retry_count: msg.retry_count || 0,
      sent_at: msg.sent_at || new Date().toISOString(),
      delivered_at: msg.delivered_at || null,
      opened_at: msg.opened_at || null,
      replied_at: msg.replied_at || null,
      created_at: new Date().toISOString(),
    }

    this.messages.unshift(newMsg)

    // Update campaign metrics if linked
    if (msg.campaign_id) {
      const camp = this.getCampaign(orgId, msg.campaign_id)
      if (camp) {
        camp.total_sent = (camp.total_sent || 0) + 1
        if (newMsg.status === 'DELIVERED' || newMsg.status === 'SENT' || newMsg.status === 'OPENED' || newMsg.status === 'REPLIED') {
          camp.total_delivered = (camp.total_delivered || 0) + 1
        }
      }
    }

    return newMsg
  }
}

export const mockHiringStore = new MockStore()
