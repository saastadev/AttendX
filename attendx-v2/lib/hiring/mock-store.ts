// ============================================================
// AttendX v2 — Hiring Module: In-Memory Mock Store
// Provides complete high-fidelity persistence for local development
// and offline sandbox environments when Supabase is unreachable.
// ============================================================

import { HiringStateMachine } from './state-machine'

const ACME_ORG_ID = '11111111-0000-0000-0000-000000000001'

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
      file_url: '/dummy/docs/aadhaar.pdf',
      status: 'VERIFIED',
      created_at: '2026-08-25T10:00:00Z',
    },
    {
      id: 'doc-002',
      organization_id: ACME_ORG_ID,
      application_id: 'app-005',
      document_type: 'BANK_DETAILS',
      document_name: 'PAN Card Copy',
      file_url: '/dummy/docs/pan.pdf',
      status: 'VERIFIED',
      created_at: '2026-08-25T10:00:00Z',
    },
    {
      id: 'doc-003',
      organization_id: ACME_ORG_ID,
      application_id: 'app-004',
      document_type: 'EDUCATION_CERTIFICATE',
      document_name: 'B.Tech Degree Certificate',
      file_url: '/dummy/docs/degree.pdf',
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

  // Requisitions API
  listRequisitions(orgId: string, filters: any = {}) {
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

  // Applications API
  listApplications(orgId: string, filters: any = {}) {
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
      const candidate = this.candidates.find(c => c.id === app.candidate_id)
      const requisition = this.requisitions.find(r => r.id === app.requisition_id)
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
          department: requisition.department?.name || 'Engineering',
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
    const app = this.applications.find(a => a.id === id && (a.organization_id === orgId || !orgId))
    if (!app) return null
    const candidate = this.candidates.find(c => c.id === app.candidate_id)
    const requisition = this.requisitions.find(r => r.id === app.requisition_id)
    return {
      ...app,
      candidate,
      requisition,
    }
  }

  updateApplicationStage(orgId: string, id: string, targetStage: string, decision?: string, notes?: string) {
    const app = this.applications.find(a => a.id === id && (a.organization_id === orgId || !orgId))
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
    return app
  }

  // Interview API
  listInterviews(orgId: string, applicationId?: string) {
    let list = this.interviews.filter(i => i.organization_id === orgId || !orgId)
    if (applicationId) {
      list = list.filter(i => i.application_id === applicationId)
    }
    return list
  }

  scheduleInterview(orgId: string, input: any) {
    const newInterview: any = {
      id: `int-${Date.now()}`,
      organization_id: orgId || ACME_ORG_ID,
      application_id: input.application_id,
      round_number: input.round_number || 1,
      round_type: input.round_type || 'TECHNICAL',
      title: input.title || 'Technical Round',
      scheduled_start: input.scheduled_start,
      scheduled_end: input.scheduled_end,
      timezone: input.timezone || 'UTC',
      platform: input.platform || 'GOOGLE_MEET',
      meeting_link: input.meeting_url || input.custom_meeting_link || `https://meet.google.com/hiring-${Math.random().toString(36).substring(7)}`,
      status: 'SCHEDULED',
      created_at: new Date().toISOString(),
    }
    this.interviews.unshift(newInterview)

    // Advance application to INTERVIEW stage if currently in SHORTLISTED
    const app = this.applications.find(a => a.id === input.application_id)
    if (app && app.stage === 'SHORTLISTED') {
      app.stage = 'INTERVIEW'
    }

    return newInterview
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
        first_name: candidate.first_name,
        last_name: candidate.last_name,
        email: candidate.email,
        phone: candidate.phone,
      } : null,
      requisition: req ? {
        title: req.title,
        location: req.location,
        employment_type: req.employment_type,
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

    const app = this.applications.find(a => a.id === offer.application_id)
    if (app) {
      app.stage = action === 'ACCEPT' ? 'OFFER_ACCEPTED' : 'OFFER_DECLINED'
    }

    return offer
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
    return {
      recommendations: [
        {
          id: 'rec-1',
          type: 'BOTTLENECK_OPTIMIZATION',
          title: 'Accelerate Technical Interview Turnaround',
          description: 'Technical rounds currently take 4.8 days on average. Enabling automated panel calendar sync can cut this by 45%.',
          impact: 'HIGH',
        },
        {
          id: 'rec-2',
          type: 'SOURCING_EXPANSION',
          title: 'Leverage High-Yield Referral Channels',
          description: 'Candidate match rates from Employee Referrals average 91%, compared to 78% on open boards.',
          impact: 'MEDIUM',
        },
      ],
    }
  }
}

export const mockHiringStore = new MockStore()
