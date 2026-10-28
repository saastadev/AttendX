// ============================================================
// AttendX v2 — Hiring Module: Provider-Agnostic Sourcing Abstraction
// Phase 1: Normalized Sourcing Contracts & Internal Types
// Phase 2: LinkedIn Deterministic Mock Provider
// Phase 3: Indeed Deterministic Mock Provider
// Zero Fabrication — 100% Deterministic Fixtures — No External Internet Calls
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

// ============================================================
// Phase 1: Normalized Internal Types (Provider Agnostic)
// ============================================================

export interface CandidateSearchRequest {
  roleTitle: string
  skills?: string[]
  minExperience?: number
  maxExperience?: number
  location?: string
  qualifications?: string[]
  qualification?: string
  limit?: number
  offset?: number
  simulateError?: boolean
  simulateRateLimit?: boolean
}

export interface ExternalCandidate {
  externalId: string
  externalApplicantId?: string
  providerName: string
  provider?: string
  platform?: string
  simulationStatus?: 'SIMULATED' | 'REAL'
  fullName: string
  email?: string
  phone?: string
  profileUrl?: string
  currentRole: string
  currentCompany: string
  experienceYears: number
  skills: string[]
  qualifications?: string[]
  location?: string
  resumeText?: string
  appliedAt?: string
  isMock: boolean
  headline?: string
}

export interface CandidateSearchResult {
  candidates: ExternalCandidate[]
  total: number
  limit: number
  offset: number
  providerName: string
  isMock: boolean
}

export interface JobPostingRequest {
  requisitionId: string
  requisitionCode: string
  title: string
  jobDescription?: string | null
  location?: string | null
  skills: string[]
  minExperience?: number
  maxExperience?: number
  minSalary?: number
  maxSalary?: number
  employmentType?: string
  simulateError?: boolean
  simulateRateLimit?: boolean
}

export interface JobPostingResult {
  jobPostingId: string
  requisitionId: string
  providerName: string
  platform: 'LINKEDIN' | 'INDEED' | string
  provider: string
  status: 'PUBLISHED' | 'FAILED'
  url: string
  publishedAt: string
  isMock: boolean
  simulationStatus: 'SIMULATED' | 'REAL'
  message?: string
}

export interface ApplicantSyncRequest {
  jobPostingId?: string
  requisitionId: string
  requisitionCode?: string
  title: string
  skills?: string[]
  minExperience?: number
  maxExperience?: number
  limit?: number
  offset?: number
  simulateEmpty?: boolean
  simulateError?: boolean
  simulateRateLimit?: boolean
}

export interface ApplicantSyncResult extends Array<ExternalCandidate> {
  applicants: ExternalCandidate[]
  totalSynced: number
  providerName: string
  platform: 'LINKEDIN' | 'INDEED' | string
  provider: string
  isMock: boolean
  simulationStatus: 'SIMULATED' | 'REAL'
}

// ------------------------------------------------------------
// Core Provider Contract
// ------------------------------------------------------------
export interface SourcingProvider {
  readonly providerName: string
  searchCandidates(request: CandidateSearchRequest): Promise<CandidateSearchResult>
  publishJob(request: JobPostingRequest): Promise<JobPostingResult>
  syncApplicants(request: ApplicantSyncRequest | string, legacyPayload?: any): Promise<ApplicantSyncResult>
  getCandidateProfile(externalId: string): Promise<ExternalCandidate | null>

  // Backward compatibility signatures for existing components/services
  search?(criteria: SourcingCriteria): Promise<SourcedProfile[]>
}

// ------------------------------------------------------------
// Provider Error Classes
// ------------------------------------------------------------
export class ProviderError extends Error {
  public status: number
  public provider: string

  constructor(message: string, status = 502, provider = 'sourcing_provider') {
    super(message)
    this.name = 'ProviderError'
    this.status = status
    this.provider = provider
  }
}

export class ProviderRateLimitError extends Error {
  public status: number
  public retryAfterSeconds: number
  public provider: string

  constructor(message: string, status = 429, retryAfterSeconds = 60, provider = 'sourcing_provider') {
    super(message)
    this.name = 'ProviderRateLimitError'
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
    this.provider = provider
  }
}

// ============================================================
// Legacy Type Aliases for Backward Compatibility
// ============================================================
export interface SourcingCriteria {
  requisitionId?: string
  roleTitle: string
  skills: string[]
  minExperience?: number
  maxExperience?: number
  location?: string
  qualifications?: string[]
  qualification?: string
  limit?: number
  offset?: number
  simulateError?: boolean
  simulateRateLimit?: boolean
}

export interface SourcedProfile {
  externalId?: string
  platform: 'INTERNAL_DB' | 'LINKEDIN' | 'GITHUB' | 'NAUKRI' | 'INDEED'
  provider: 'internal_db' | 'mock_linkedin' | 'mock_indeed' | 'mock_github'
  simulationStatus: 'SIMULATED' | 'REAL'
  fullName: string
  email?: string
  phone?: string
  profileUrl?: string
  currentRole: string
  currentCompany: string
  experienceYears: number
  skills: string[]
  matchScore: number
  skillScore: number
  experienceScore: number
  roleScore: number
  resumeText?: string
  aiReasoning: {
    strengths: string[]
    skillMatches: string[]
    summary: string
    reasoning: string
  }
}

export type JobPostingPayload = JobPostingRequest
export type PublishedJobResult = JobPostingResult
export type ExternalApplicant = ExternalCandidate

// ============================================================
// Candidate Normalizer: Unified Schema Transform
// ============================================================
export class CandidateNormalizer {
  static normalize(
    profile: {
      fullName?: string
      first_name?: string
      last_name?: string
      email?: string | null
      phone?: string | null
      currentRole?: string
      currentCompany?: string
      experienceYears?: number
      skills?: string[] | Array<{ skill_name: string }>
      qualifications?: string[]
      resumeText?: string
      location?: string
      platform?: string
    },
    platformFallback: string = 'LINKEDIN'
  ) {
    let firstName = profile.first_name || ''
    let lastName = profile.last_name || ''

    if (!firstName && profile.fullName) {
      const parts = profile.fullName.trim().split(/\s+/)
      firstName = parts[0] || 'Candidate'
      lastName = parts.slice(1).join(' ') || 'Applicant'
    }
    if (!firstName) firstName = 'Candidate'
    if (!lastName) lastName = 'Applicant'

    const skillsArray: string[] = []
    if (Array.isArray(profile.skills)) {
      for (const s of profile.skills) {
        if (typeof s === 'string' && s.trim()) skillsArray.push(s.trim())
        else if (typeof s === 'object' && s && (s as any).skill_name) skillsArray.push((s as any).skill_name)
      }
    }

    const qualificationsArray: string[] = []
    if (Array.isArray(profile.qualifications)) {
      for (const q of profile.qualifications) {
        if (typeof q === 'string' && q.trim()) qualificationsArray.push(q.trim())
      }
    }

    const expYears = Number(profile.experienceYears) || 0
    const rawResumeText =
      profile.resumeText ||
      `Candidate Profile: ${firstName} ${lastName}\n` +
      `Current Role: ${profile.currentRole || 'Professional'}\n` +
      `Current Company: ${profile.currentCompany || 'Independent'}\n` +
      `Experience: ${expYears} years\n` +
      `Skills: ${skillsArray.join(', ')}\n` +
      (qualificationsArray.length > 0 ? `Qualifications: ${qualificationsArray.join(', ')}\n` : '') +
      `Location: ${profile.location || 'Remote'}`

    const cleanEmail = profile.email
      ? profile.email.trim().toLowerCase()
      : `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/[^a-z0-9]/g, '')}@applicant-sim.com`

    return {
      first_name: firstName,
      last_name: lastName,
      email: cleanEmail,
      phone: profile.phone || '+91 98765 43210',
      current_company: profile.currentCompany || 'Independent',
      current_designation: profile.currentRole || 'Software Professional',
      total_experience_years: expYears,
      location: profile.location || 'Bengaluru, India',
      source: profile.platform || platformFallback,
      qualifications: qualificationsArray,
      raw_resume_text: rawResumeText,
      skills: skillsArray.map((skillName) => ({
        skill_name: skillName,
        experience_years: Math.max(1, Math.round(expYears * 0.7)),
        proficiency_level: expYears >= 5 ? 'ADVANCED' : 'INTERMEDIATE',
      })),
    }
  }
}

// ============================================================
// Phase 2: LinkedIn Mock Provider
// Deterministic Fixtures — Zero Math.random() — No Internet
// ============================================================

const LINKEDIN_FIXTURE_CANDIDATES: ExternalCandidate[] = [
  {
    externalId: 'li_mock_candidate_001',
    providerName: 'linkedin',
    provider: 'mock_linkedin',
    platform: 'LINKEDIN',
    simulationStatus: 'SIMULATED',
    fullName: 'Rahul Varma',
    email: 'rahul.varma@talent-mock.com',
    phone: '+91 98450 11223',
    profileUrl: 'https://www.linkedin.com/in/rahul-varma-mock-001',
    currentRole: 'Senior Full Stack Engineer',
    currentCompany: 'Infosys Ltd',
    experienceYears: 5.5,
    skills: ['React', 'TypeScript', 'Node.js', 'System Architecture', 'AWS', 'PostgreSQL'],
    qualifications: ['B.Tech Computer Science', 'Bachelor of Technology'],
    location: 'Bengaluru, Karnataka, India',
    resumeText: 'Rahul Varma — Senior Full Stack Engineer at Infosys Ltd with 5.5 years specializing in React, TypeScript, Node.js, and cloud AWS architecture. Education: B.Tech Computer Science.',
    headline: 'Senior Full Stack Engineer at Infosys | Cloud & Microservices',
    isMock: true,
  },
  {
    externalId: 'li_mock_candidate_002',
    providerName: 'linkedin',
    provider: 'mock_linkedin',
    platform: 'LINKEDIN',
    simulationStatus: 'SIMULATED',
    fullName: 'Sunita Rao',
    email: 'sunita.rao@talent-mock.com',
    phone: '+91 98200 44556',
    profileUrl: 'https://www.linkedin.com/in/sunita-rao-mock-002',
    currentRole: 'Lead Full Stack / Frontend Engineer',
    currentCompany: 'Razorpay Technologies',
    experienceYears: 4.8,
    skills: ['React', 'TypeScript', 'Node.js', 'Next.js', 'PostgreSQL', 'Docker', 'CI/CD'],
    qualifications: ['B.E. Information Technology', 'Bachelor of Engineering'],
    location: 'Bengaluru, Karnataka, India',
    resumeText: 'Sunita Rao — Lead Frontend & Full Stack Engineer at Razorpay Technologies with 4.8 years experience building high-throughput payment checkouts with React and TypeScript. Education: B.E. Information Technology.',
    headline: 'Lead Frontend Engineer at Razorpay | FinTech & Performance',
    isMock: true,
  },
  {
    externalId: 'li_mock_candidate_003',
    providerName: 'linkedin',
    provider: 'mock_linkedin',
    platform: 'LINKEDIN',
    simulationStatus: 'SIMULATED',
    fullName: 'Karthik Menon',
    email: 'karthik.menon@talent-mock.com',
    phone: '+91 99001 77889',
    profileUrl: 'https://www.linkedin.com/in/karthik-menon-mock-003',
    currentRole: 'Staff Full Stack Systems Engineer',
    currentCompany: 'Flipkart Internet',
    experienceYears: 7.0,
    skills: ['React', 'TypeScript', 'Node.js', 'Distributed Systems', 'Kubernetes', 'PostgreSQL', 'Kafka'],
    qualifications: ['M.Tech Software Systems', 'Master of Technology', 'B.Tech'],
    location: 'Bengaluru, Karnataka, India',
    resumeText: 'Karthik Menon — Staff Systems Engineer at Flipkart with 7.0 years architecting resilient event-driven distributed platforms and multi-tenant databases. Education: M.Tech Software Systems.',
    headline: 'Staff Engineer at Flipkart | Distributed Architecture',
    isMock: true,
  },
  {
    externalId: 'li_mock_candidate_004',
    providerName: 'linkedin',
    provider: 'mock_linkedin',
    platform: 'LINKEDIN',
    simulationStatus: 'SIMULATED',
    fullName: 'Ananya Sharma',
    email: 'ananya.sharma@talent-mock.com',
    phone: '+91 98111 22334',
    profileUrl: 'https://www.linkedin.com/in/ananya-sharma-mock-004',
    currentRole: 'Full Stack UI Engineer',
    currentCompany: 'Swiggy',
    experienceYears: 4.2,
    skills: ['React', 'TypeScript', 'Node.js', 'UI/UX', 'Figma', 'Tailwind'],
    qualifications: ['B.Des Interaction Design', 'Bachelor of Design'],
    location: 'Pune, Maharashtra, India',
    resumeText: 'Ananya Sharma — UI/UX Design Engineer at Swiggy with 4.2 years developing accessible web design systems and fluent React interfaces. Education: B.Des Interaction Design.',
    headline: 'Design Engineer at Swiggy | Design Systems & React',
    isMock: true,
  },
  {
    externalId: 'li_mock_candidate_005',
    providerName: 'linkedin',
    provider: 'mock_linkedin',
    platform: 'LINKEDIN',
    simulationStatus: 'SIMULATED',
    fullName: 'Sameer Kulkarni',
    email: 'sameer.kulkarni@talent-mock.com',
    phone: '+91 98444 55667',
    profileUrl: 'https://www.linkedin.com/in/sameer-kulkarni-mock-005',
    currentRole: 'DevOps & Cloud Architect',
    currentCompany: 'Freshworks Inc',
    experienceYears: 8.0,
    skills: ['AWS', 'Kubernetes', 'Terraform', 'Docker', 'Python', 'CI/CD'],
    qualifications: ['B.Tech Electronics', 'Bachelor of Technology'],
    location: 'Chennai, Tamil Nadu, India',
    resumeText: 'Sameer Kulkarni — Cloud Infrastructure Architect at Freshworks with 8.0 years designing automated multi-region AWS and Kubernetes infrastructure. Education: B.Tech Electronics.',
    headline: 'DevOps & SRE Architect at Freshworks | AWS & Terraform',
    isMock: true,
  },
  {
    externalId: 'li_mock_candidate_006',
    providerName: 'linkedin',
    provider: 'mock_linkedin',
    platform: 'LINKEDIN',
    simulationStatus: 'SIMULATED',
    fullName: 'Vikram Joshi',
    email: 'vikram.joshi@applicant-mock.com',
    phone: '+91 98334 55667',
    profileUrl: 'https://www.linkedin.com/in/vikram-joshi-mock-006',
    currentRole: 'Software Engineer (Full Stack)',
    currentCompany: 'Swiggy',
    experienceYears: 4.5,
    skills: ['TypeScript', 'Node.js', 'React', 'Docker', 'Redis', 'PostgreSQL'],
    qualifications: ['B.Tech Information Technology', 'Bachelor of Technology'],
    location: 'Bengaluru, Karnataka, India',
    resumeText: 'Vikram Joshi — Software Engineer at Swiggy with 4.5 years developing web backends and React frontends. Education: B.Tech Information Technology.',
    headline: 'Software Engineer at Swiggy | Backend & Systems',
    isMock: true,
  },
]

const LINKEDIN_FIXTURE_APPLICANTS: ExternalCandidate[] = [
  {
    externalId: 'li_mock_applicant_001',
    externalApplicantId: 'li_mock_applicant_001',
    providerName: 'linkedin',
    provider: 'mock_linkedin',
    platform: 'LINKEDIN',
    simulationStatus: 'SIMULATED',
    fullName: 'Pooja Hegde',
    email: 'pooja.hegde@applicant-mock.com',
    phone: '+91 97112 33445',
    profileUrl: 'https://www.linkedin.com/in/pooja-hegde-mock',
    currentRole: 'Senior Software Engineer',
    currentCompany: 'Freshworks Inc',
    experienceYears: 4.5,
    skills: ['React', 'TypeScript', 'Next.js', 'PostgreSQL', 'REST API'],
    qualifications: ['B.Tech Computer Science'],
    location: 'Bengaluru, India',
    resumeText: 'Candidate: Pooja Hegde\nRole: Senior Software Engineer at Freshworks\nExperience: 4.5 years\nQualifications: B.Tech Computer Science\nCore Competencies: React, TypeScript, Next.js, PostgreSQL.\nApplied via LinkedIn Jobs integration (Mock Mode).',
    appliedAt: '2026-10-03T10:00:00.000Z',
    headline: 'Senior Full Stack Engineer at Freshworks',
    isMock: true,
  },
  {
    externalId: 'li_mock_applicant_002',
    externalApplicantId: 'li_mock_applicant_002',
    providerName: 'linkedin',
    provider: 'mock_linkedin',
    platform: 'LINKEDIN',
    simulationStatus: 'SIMULATED',
    fullName: 'Vikram Joshi',
    email: 'vikram.joshi@applicant-mock.com',
    phone: '+91 98334 55667',
    profileUrl: 'https://www.linkedin.com/in/vikram-joshi-mock',
    currentRole: 'Software Engineer',
    currentCompany: 'Swiggy',
    experienceYears: 4.5,
    skills: ['TypeScript', 'Node.js', 'Docker', 'Redis', 'PostgreSQL'],
    qualifications: ['B.Tech Information Technology'],
    location: 'Bengaluru, India',
    resumeText: 'Candidate: Vikram Joshi\nRole: Software Engineer at Swiggy\nExperience: 4.5 years\nQualifications: B.Tech Information Technology\nCore Competencies: TypeScript, Node.js, Docker, Redis.\nApplied via LinkedIn Jobs integration (Mock Mode).',
    appliedAt: '2026-10-03T10:00:00.000Z',
    headline: 'Software Engineer at Swiggy | Backend & Systems',
    isMock: true,
  },
  {
    externalId: 'li_mock_applicant_003',
    externalApplicantId: 'li_mock_applicant_003',
    providerName: 'linkedin',
    provider: 'mock_linkedin',
    platform: 'LINKEDIN',
    simulationStatus: 'SIMULATED',
    fullName: 'Neha Nair',
    email: 'neha.nair@applicant-mock.com',
    phone: '+91 99222 33445',
    profileUrl: 'https://www.linkedin.com/in/neha-nair-mock',
    currentRole: 'Full Stack Engineer',
    currentCompany: 'PhonePe',
    experienceYears: 5.0,
    skills: ['React', 'Node.js', 'PostgreSQL', 'Kafka', 'TypeScript'],
    qualifications: ['B.E. Computer Engineering'],
    location: 'Bengaluru, India',
    resumeText: 'Candidate: Neha Nair\nRole: Full Stack Engineer at PhonePe\nExperience: 5.0 years\nQualifications: B.E. Computer Engineering\nCore Competencies: React, Node.js, PostgreSQL, Kafka, TypeScript.\nApplied via LinkedIn Jobs integration (Mock Mode).',
    appliedAt: '2026-10-03T10:00:00.000Z',
    headline: 'Full Stack Engineer at PhonePe',
    isMock: true,
  },
]

export class LinkedInMockProvider implements SourcingProvider {
  public readonly providerName = 'linkedin'

  async searchCandidates(request: CandidateSearchRequest): Promise<CandidateSearchResult> {
    if (request.simulateError || request.roleTitle?.includes('TRIGGER_SIMULATED_ERROR')) {
      throw new ProviderError('LinkedIn API simulated server error (HTTP 502)', 502, 'mock_linkedin')
    }
    if (request.simulateRateLimit || request.roleTitle?.includes('TRIGGER_RATE_LIMIT')) {
      throw new ProviderRateLimitError('LinkedIn API rate limit exceeded (HTTP 429). Retry after 60s.', 429, 60, 'mock_linkedin')
    }

    let filtered = [...LINKEDIN_FIXTURE_CANDIDATES]

    // Role title filter (tokenize query words)
    if (request.roleTitle && request.roleTitle.trim()) {
      const q = request.roleTitle.trim().toLowerCase()
      const roleTokens = q.split(/\s+/).filter(w => w.length > 2)
      if (roleTokens.length > 0) {
        const matching = filtered.filter(c =>
          roleTokens.some(tok =>
            c.currentRole.toLowerCase().includes(tok) ||
            c.headline?.toLowerCase().includes(tok)
          )
        )
        if (matching.length > 0) {
          filtered = matching
        }
      }
    }

    // Skills filter
    if (request.skills && request.skills.length > 0) {
      const targetSkills = request.skills.map(s => s.trim().toLowerCase()).filter(Boolean)
      if (targetSkills.length > 0) {
        filtered = filtered.filter(c => {
          const candSkillsLower = c.skills.map(s => s.toLowerCase())
          return targetSkills.some(ts => candSkillsLower.some(cs => cs.includes(ts) || ts.includes(cs)))
        })
      }
    }

    // Experience filters
    if (request.minExperience !== undefined && request.minExperience !== null) {
      filtered = filtered.filter(c => c.experienceYears >= request.minExperience!)
    }
    if (request.maxExperience !== undefined && request.maxExperience !== null) {
      filtered = filtered.filter(c => c.experienceYears <= request.maxExperience!)
    }

    // Location filter
    if (request.location && request.location.trim()) {
      const locParts = request.location.trim().toLowerCase().split(/[,\s]+/).filter(t => t.length > 2)
      if (locParts.length > 0) {
        filtered = filtered.filter(c => {
          if (!c.location) return false
          const cLoc = c.location.toLowerCase()
          return locParts.every(tok => cLoc.includes(tok)) || cLoc.includes(locParts[0])
        })
      }
    }

    // Qualifications filter
    const quals = (request.qualifications || (request.qualification ? [request.qualification] : []))
      .map(q => q.trim().toLowerCase())
      .filter(Boolean)
    if (quals.length > 0) {
      filtered = filtered.filter(c => {
        const cQuals = (c.qualifications || []).map(q => q.toLowerCase())
        const resume = (c.resumeText || '').toLowerCase()
        return quals.some(q => cQuals.some(cq => cq.includes(q)) || resume.includes(q))
      })
    }

    const total = filtered.length
    const offset = Math.max(0, request.offset || 0)
    const limit = Math.max(1, request.limit || 10)
    const paginated = filtered.slice(offset, offset + limit)

    return {
      candidates: paginated,
      total,
      limit,
      offset,
      providerName: 'linkedin',
      isMock: true,
    }
  }

  async publishJob(request: JobPostingRequest): Promise<JobPostingResult> {
    if (request.simulateError) {
      throw new ProviderError('LinkedIn Job Posting simulated failure (HTTP 500)', 500, 'mock_linkedin')
    }
    if (request.simulateRateLimit) {
      throw new ProviderRateLimitError('LinkedIn Job Posting rate limit exceeded (HTTP 429)', 429, 60, 'mock_linkedin')
    }

    const code = request.requisitionCode || request.requisitionId.slice(0, 8)
    const jobPostingId = `li_mock_job_${code}`

    return {
      jobPostingId,
      requisitionId: request.requisitionId,
      providerName: 'linkedin',
      platform: 'LINKEDIN',
      provider: 'mock_linkedin',
      status: 'PUBLISHED',
      url: `https://www.linkedin.com/jobs/view/${jobPostingId}?ref=attendx_ats_simulated`,
      publishedAt: '2026-10-03T10:00:00.000Z',
      isMock: true,
      simulationStatus: 'SIMULATED',
      message: 'Job successfully published via LinkedIn Mock Adapter (Simulated Mode).',
    }
  }

  async syncApplicants(
    requestOrJobPostingId: ApplicantSyncRequest | string,
    legacyPayload?: any
  ): Promise<ApplicantSyncResult> {
    const request: ApplicantSyncRequest = typeof requestOrJobPostingId === 'string'
      ? {
          jobPostingId: requestOrJobPostingId,
          requisitionId: legacyPayload?.requisitionId || 'mock_req',
          title: legacyPayload?.title || 'Engineer',
          skills: legacyPayload?.skills || [],
          minExperience: legacyPayload?.minExperience,
        }
      : requestOrJobPostingId

    if (request.simulateError) {
      throw new ProviderError('LinkedIn Applicant Sync simulated failure (HTTP 502)', 502, 'mock_linkedin')
    }
    if (request.simulateRateLimit) {
      throw new ProviderRateLimitError('LinkedIn Applicant Sync rate limit exceeded (HTTP 429)', 429, 60, 'mock_linkedin')
    }
    if (request.simulateEmpty || request.title?.includes('SIMULATE_EMPTY') || request.title?.includes('NO_APPLICANTS')) {
      const result = Object.assign([], {
        applicants: [],
        totalSynced: 0,
        providerName: 'linkedin',
        platform: 'LINKEDIN',
        provider: 'mock_linkedin',
        isMock: true,
        simulationStatus: 'SIMULATED' as const,
      })
      return result as ApplicantSyncResult
    }

    let list = [...LINKEDIN_FIXTURE_APPLICANTS]

    if (request.skills && request.skills.length > 0) {
      const targetSkills = request.skills.map(s => s.toLowerCase().trim())
      const matched = list.filter(a => {
        const appSkills = a.skills.map(s => s.toLowerCase())
        return targetSkills.some(ts => appSkills.some(as => as.includes(ts) || ts.includes(as)))
      })
      if (matched.length > 0) list = matched
    }

    if (request.minExperience !== undefined && request.minExperience !== null) {
      list = list.filter(a => a.experienceYears >= request.minExperience!)
    }

    const offset = Math.max(0, request.offset || 0)
    const limit = Math.max(1, request.limit || list.length)
    const applicants = list.slice(offset, offset + limit)

    const result = Object.assign([...applicants], {
      applicants,
      totalSynced: applicants.length,
      providerName: 'linkedin',
      platform: 'LINKEDIN',
      provider: 'mock_linkedin',
      isMock: true,
      simulationStatus: 'SIMULATED' as const,
    })

    return result as ApplicantSyncResult
  }

  async getCandidateProfile(externalId: string): Promise<ExternalCandidate | null> {
    const all = [...LINKEDIN_FIXTURE_CANDIDATES, ...LINKEDIN_FIXTURE_APPLICANTS]
    const found = all.find(c => c.externalId === externalId)
    return found || null
  }

  async search(criteria: SourcingCriteria): Promise<SourcedProfile[]> {
    const result = await this.searchCandidates({
      roleTitle: criteria.roleTitle,
      skills: criteria.skills,
      minExperience: criteria.minExperience,
      maxExperience: criteria.maxExperience,
      location: criteria.location,
      limit: criteria.limit,
      offset: criteria.offset,
      simulateError: criteria.simulateError,
      simulateRateLimit: criteria.simulateRateLimit,
    })

    return result.candidates.map(c => {
      const reqSkills = (criteria.skills || []).map(s => s.toLowerCase().trim())
      const matchedSkills = c.skills.filter(s => reqSkills.some(rs => s.toLowerCase().includes(rs) || rs.includes(s.toLowerCase())))
      const skillScore = reqSkills.length > 0 ? Math.round((matchedSkills.length / reqSkills.length) * 100) : 90
      const expScore = 90
      const roleScore = 95
      const totalScore = Math.round(skillScore * 0.5 + expScore * 0.3 + roleScore * 0.2)

      return {
        externalId: c.externalId,
        platform: 'LINKEDIN',
        provider: 'mock_linkedin',
        simulationStatus: 'SIMULATED',
        fullName: c.fullName,
        email: c.email,
        phone: c.phone,
        profileUrl: c.profileUrl,
        currentRole: c.currentRole,
        currentCompany: c.currentCompany,
        experienceYears: c.experienceYears,
        skills: c.skills,
        matchScore: Math.max(75, totalScore),
        skillScore,
        experienceScore: expScore,
        roleScore,
        resumeText: c.resumeText,
        aiReasoning: {
          strengths: [`${matchedSkills.length} key skills matched from LinkedIn profile`, 'Enterprise experience at ' + c.currentCompany],
          skillMatches: matchedSkills,
          summary: `Simulated LinkedIn candidate matching ${matchedSkills.length} required competencies.`,
          reasoning: `LinkedIn Profile verified for ${c.fullName}. Strong ${c.experienceYears}y background at ${c.currentCompany} aligning closely with technical requirements.`,
        },
      }
    })
  }
}

// ============================================================
// Phase 3: Indeed Mock Provider
// Deterministic Fixtures — Zero Math.random() — No Internet
// ============================================================

const INDEED_FIXTURE_CANDIDATES: ExternalCandidate[] = [
  {
    externalId: 'indeed_mock_candidate_001',
    providerName: 'indeed',
    provider: 'mock_indeed',
    platform: 'INDEED',
    simulationStatus: 'SIMULATED',
    fullName: 'Arjun Das',
    email: 'arjun.das@indeed-mock.com',
    phone: '+91 91234 56789',
    profileUrl: 'https://www.indeed.com/resumes/indeed_mock_candidate_001?mock=1',
    currentRole: 'Senior Full Stack Developer',
    currentCompany: 'Wipro Digital',
    experienceYears: 4.5,
    skills: ['Python', 'SQL', 'React', 'Node.js', 'Git', 'Agile', 'REST API'],
    qualifications: ['B.Tech Computer Science', 'Bachelor of Technology'],
    location: 'Hyderabad, Telangana, India',
    resumeText: 'Arjun Das — Senior Software Developer at Wipro Digital with 4.5 years delivering microservices with Python, SQL, and React interfaces. Education: B.Tech Computer Science.',
    headline: 'Senior Full Stack Developer | Web APIs & Microservices',
    isMock: true,
  },
  {
    externalId: 'indeed_mock_candidate_002',
    providerName: 'indeed',
    provider: 'mock_indeed',
    platform: 'INDEED',
    simulationStatus: 'SIMULATED',
    fullName: 'Sneha Patel',
    email: 'sneha.patel@indeed-mock.com',
    phone: '+91 99887 65432',
    profileUrl: 'https://www.indeed.com/resumes/indeed_mock_candidate_002?mock=1',
    currentRole: 'Associate Full Stack Engineer',
    currentCompany: 'Tata Consultancy Services',
    experienceYears: 4.0,
    skills: ['JavaScript', 'React', 'Node.js', 'TypeScript', 'Microservices', 'SQL'],
    qualifications: ['B.Sc Computer Science', 'Bachelor of Science'],
    location: 'Mumbai, Maharashtra, India',
    resumeText: 'Sneha Patel — Associate Full Stack Engineer at TCS with 4.0 years developing frontend modules with React and backend services in Node.js. Education: B.Sc Computer Science.',
    headline: 'Associate Engineer at TCS | React & Node.js Developer',
    isMock: true,
  },
  {
    externalId: 'indeed_mock_candidate_003',
    providerName: 'indeed',
    provider: 'mock_indeed',
    platform: 'INDEED',
    simulationStatus: 'SIMULATED',
    fullName: 'Vikram Joshi',
    email: 'vikram.joshi@applicant-mock.com',
    phone: '+91 98334 55667',
    profileUrl: 'https://www.indeed.com/resumes/indeed_mock_candidate_003?mock=1',
    currentRole: 'Software Engineer (Full Stack)',
    currentCompany: 'Swiggy',
    experienceYears: 5.0,
    skills: ['TypeScript', 'Node.js', 'React', 'Docker', 'Redis', 'PostgreSQL'],
    qualifications: ['B.Tech Information Technology', 'Bachelor of Technology'],
    location: 'Bengaluru, Karnataka, India',
    resumeText: 'Vikram Joshi — Software Engineer at Swiggy with 5.0 years building high-load distributed services with TypeScript, Docker, and Redis. Education: B.Tech Information Technology.',
    headline: 'Software Engineer at Swiggy | Backend & Systems',
    isMock: true,
  },
  {
    externalId: 'indeed_mock_candidate_004',
    providerName: 'indeed',
    provider: 'mock_indeed',
    platform: 'INDEED',
    simulationStatus: 'SIMULATED',
    fullName: 'Rohit Verma',
    email: 'rohit.verma@indeed-mock.com',
    phone: '+91 99333 44556',
    profileUrl: 'https://www.indeed.com/resumes/indeed_mock_candidate_004?mock=1',
    currentRole: 'Lead Data Engineer',
    currentCompany: 'Mu Sigma',
    experienceYears: 6.0,
    skills: ['Python', 'SQL', 'PostgreSQL', 'Spark', 'Airflow'],
    qualifications: ['M.S. Data Science', 'Master of Science', 'B.Tech'],
    location: 'Bengaluru, Karnataka, India',
    resumeText: 'Rohit Verma — Lead Data Engineer at Mu Sigma with 6.0 years architecting automated ETL pipelines using Spark, Airflow, and PostgreSQL. Education: M.S. Data Science.',
    headline: 'Lead Data Engineer at Mu Sigma | Big Data & ETL',
    isMock: true,
  },
]

const INDEED_FIXTURE_APPLICANTS: ExternalCandidate[] = [
  {
    externalId: 'indeed_mock_applicant_001',
    externalApplicantId: 'indeed_mock_applicant_001',
    providerName: 'indeed',
    provider: 'mock_indeed',
    platform: 'INDEED',
    simulationStatus: 'SIMULATED',
    fullName: 'Manoj Kumar',
    email: 'manoj.kumar@indeed-applicant.com',
    phone: '+91 97766 55443',
    profileUrl: 'https://www.indeed.com/resumes/manoj-kumar-mock',
    currentRole: 'Software Engineer',
    currentCompany: 'Tech Mahindra',
    experienceYears: 4.2,
    skills: ['JavaScript', 'React', 'Git', 'REST API', 'Node.js'],
    qualifications: ['B.Tech Information Technology'],
    location: 'Bengaluru, India',
    resumeText: 'Applicant: Manoj Kumar\nCurrent Position: Software Engineer at Tech Mahindra\nExperience: 4.2 years\nQualifications: B.Tech Information Technology\nSkills: JavaScript, React, Git, REST API.\nDirect apply from Indeed Job Board (Mock Mode).',
    appliedAt: '2026-10-03T10:00:00.000Z',
    headline: 'Software Engineer at Tech Mahindra',
    isMock: true,
  },
  {
    externalId: 'indeed_mock_applicant_002',
    externalApplicantId: 'indeed_mock_applicant_002',
    providerName: 'indeed',
    provider: 'mock_indeed',
    platform: 'INDEED',
    simulationStatus: 'SIMULATED',
    fullName: 'Divya Ramesh',
    email: 'divya.ramesh@indeed-applicant.com',
    phone: '+91 98888 77665',
    profileUrl: 'https://www.indeed.com/resumes/divya-ramesh-mock',
    currentRole: 'Backend Developer',
    currentCompany: 'HCL Technologies',
    experienceYears: 4.0,
    skills: ['Node.js', 'PostgreSQL', 'TypeScript', 'Docker', 'React'],
    qualifications: ['M.Tech Computer Science'],
    location: 'Bengaluru, India',
    resumeText: 'Applicant: Divya Ramesh\nCurrent Position: Backend Developer at HCL\nExperience: 4.0 years\nQualifications: M.Tech Computer Science\nSkills: Node.js, PostgreSQL, TypeScript, Docker.\nDirect apply from Indeed Job Board (Mock Mode).',
    appliedAt: '2026-10-03T10:00:00.000Z',
    headline: 'Backend Developer at HCL | Node.js Specialist',
    isMock: true,
  },
  {
    externalId: 'indeed_mock_applicant_003',
    externalApplicantId: 'indeed_mock_applicant_003',
    providerName: 'indeed',
    provider: 'mock_indeed',
    platform: 'INDEED',
    simulationStatus: 'SIMULATED',
    fullName: 'Vikram Joshi',
    email: 'vikram.joshi@applicant-mock.com',
    phone: '+91 98334 55667',
    profileUrl: 'https://www.indeed.com/resumes/vikram-joshi-mock',
    currentRole: 'Software Engineer',
    currentCompany: 'Swiggy',
    experienceYears: 4.5,
    skills: ['TypeScript', 'Node.js', 'Docker', 'Redis', 'PostgreSQL'],
    qualifications: ['B.Tech Information Technology'],
    location: 'Bengaluru, India',
    resumeText: 'Applicant: Vikram Joshi\nCurrent Position: Software Engineer at Swiggy\nExperience: 4.5 years\nQualifications: B.Tech Information Technology\nSkills: TypeScript, Node.js, Docker, Redis, PostgreSQL.\nDirect apply from Indeed Job Board (Mock Mode).',
    appliedAt: '2026-10-03T10:00:00.000Z',
    headline: 'Software Engineer at Swiggy | Backend & Systems',
    isMock: true,
  },
]

export class IndeedMockProvider implements SourcingProvider {
  public readonly providerName = 'indeed'

  async searchCandidates(request: CandidateSearchRequest): Promise<CandidateSearchResult> {
    if (request.simulateError || request.roleTitle?.includes('TRIGGER_SIMULATED_ERROR')) {
      throw new ProviderError('Indeed API simulated service outage (HTTP 503)', 503, 'mock_indeed')
    }
    if (request.simulateRateLimit || request.roleTitle?.includes('TRIGGER_RATE_LIMIT')) {
      throw new ProviderRateLimitError('Indeed API rate limit exceeded (HTTP 429). Retry after 60s.', 429, 60, 'mock_indeed')
    }

    let filtered = [...INDEED_FIXTURE_CANDIDATES]

    if (request.roleTitle && request.roleTitle.trim()) {
      const q = request.roleTitle.trim().toLowerCase()
      const roleTokens = q.split(/\s+/).filter(w => w.length > 2)
      if (roleTokens.length > 0) {
        const matching = filtered.filter(c =>
          roleTokens.some(tok =>
            c.currentRole.toLowerCase().includes(tok) ||
            c.headline?.toLowerCase().includes(tok)
          )
        )
        if (matching.length > 0) {
          filtered = matching
        }
      }
    }

    if (request.skills && request.skills.length > 0) {
      const targetSkills = request.skills.map(s => s.trim().toLowerCase()).filter(Boolean)
      if (targetSkills.length > 0) {
        filtered = filtered.filter(c => {
          const candSkillsLower = c.skills.map(s => s.toLowerCase())
          return targetSkills.some(ts => candSkillsLower.some(cs => cs.includes(ts) || ts.includes(cs)))
        })
      }
    }

    if (request.minExperience !== undefined && request.minExperience !== null) {
      filtered = filtered.filter(c => c.experienceYears >= request.minExperience!)
    }
    if (request.maxExperience !== undefined && request.maxExperience !== null) {
      filtered = filtered.filter(c => c.experienceYears <= request.maxExperience!)
    }

    if (request.location && request.location.trim()) {
      const locParts = request.location.trim().toLowerCase().split(/[,\s]+/).filter(t => t.length > 2)
      if (locParts.length > 0) {
        filtered = filtered.filter(c => {
          if (!c.location) return false
          const cLoc = c.location.toLowerCase()
          return locParts.every(tok => cLoc.includes(tok)) || cLoc.includes(locParts[0])
        })
      }
    }

    // Qualifications filter
    const quals = (request.qualifications || (request.qualification ? [request.qualification] : []))
      .map(q => q.trim().toLowerCase())
      .filter(Boolean)
    if (quals.length > 0) {
      filtered = filtered.filter(c => {
        const cQuals = (c.qualifications || []).map(q => q.toLowerCase())
        const resume = (c.resumeText || '').toLowerCase()
        return quals.some(q => cQuals.some(cq => cq.includes(q)) || resume.includes(q))
      })
    }

    const total = filtered.length
    const offset = Math.max(0, request.offset || 0)
    const limit = Math.max(1, request.limit || 10)
    const paginated = filtered.slice(offset, offset + limit)

    return {
      candidates: paginated,
      total,
      limit,
      offset,
      providerName: 'indeed',
      isMock: true,
    }
  }

  async publishJob(request: JobPostingRequest): Promise<JobPostingResult> {
    if (request.simulateError) {
      throw new ProviderError('Indeed Job Posting simulated failure (HTTP 500)', 500, 'mock_indeed')
    }
    if (request.simulateRateLimit) {
      throw new ProviderRateLimitError('Indeed Job Posting rate limit exceeded (HTTP 429)', 429, 60, 'mock_indeed')
    }

    const code = request.requisitionCode || request.requisitionId.slice(0, 8)
    const jobPostingId = `indeed_mock_job_${code}`

    return {
      jobPostingId,
      requisitionId: request.requisitionId,
      providerName: 'indeed',
      platform: 'INDEED',
      provider: 'mock_indeed',
      status: 'PUBLISHED',
      url: `https://www.indeed.com/viewjob?jk=${jobPostingId}&ref=attendx_simulated`,
      publishedAt: '2026-10-03T10:00:00.000Z',
      isMock: true,
      simulationStatus: 'SIMULATED',
      message: 'Job successfully published via Indeed Mock Adapter (Simulated Mode).',
    }
  }

  async syncApplicants(
    requestOrJobPostingId: ApplicantSyncRequest | string,
    legacyPayload?: any
  ): Promise<ApplicantSyncResult> {
    const request: ApplicantSyncRequest = typeof requestOrJobPostingId === 'string'
      ? {
          jobPostingId: requestOrJobPostingId,
          requisitionId: legacyPayload?.requisitionId || 'mock_req',
          title: legacyPayload?.title || 'Engineer',
          skills: legacyPayload?.skills || [],
          minExperience: legacyPayload?.minExperience,
        }
      : requestOrJobPostingId

    if (request.simulateError) {
      throw new ProviderError('Indeed Applicant Sync simulated failure (HTTP 502)', 502, 'mock_indeed')
    }
    if (request.simulateRateLimit) {
      throw new ProviderRateLimitError('Indeed Applicant Sync rate limit exceeded (HTTP 429)', 429, 60, 'mock_indeed')
    }
    if (request.simulateEmpty || request.title?.includes('SIMULATE_EMPTY') || request.title?.includes('NO_APPLICANTS')) {
      const result = Object.assign([], {
        applicants: [],
        totalSynced: 0,
        providerName: 'indeed',
        platform: 'INDEED',
        provider: 'mock_indeed',
        isMock: true,
        simulationStatus: 'SIMULATED' as const,
      })
      return result as ApplicantSyncResult
    }

    let list = [...INDEED_FIXTURE_APPLICANTS]

    if (request.skills && request.skills.length > 0) {
      const targetSkills = request.skills.map(s => s.toLowerCase().trim())
      const matched = list.filter(a => {
        const appSkills = a.skills.map(s => s.toLowerCase())
        return targetSkills.some(ts => appSkills.some(as => as.includes(ts) || ts.includes(as)))
      })
      if (matched.length > 0) list = matched
    }

    if (request.minExperience !== undefined && request.minExperience !== null) {
      list = list.filter(a => a.experienceYears >= request.minExperience!)
    }

    const offset = Math.max(0, request.offset || 0)
    const limit = Math.max(1, request.limit || list.length)
    const applicants = list.slice(offset, offset + limit)

    const result = Object.assign([...applicants], {
      applicants,
      totalSynced: applicants.length,
      providerName: 'indeed',
      platform: 'INDEED',
      provider: 'mock_indeed',
      isMock: true,
      simulationStatus: 'SIMULATED' as const,
    })

    return result as ApplicantSyncResult
  }

  async getCandidateProfile(externalId: string): Promise<ExternalCandidate | null> {
    const all = [...INDEED_FIXTURE_CANDIDATES, ...INDEED_FIXTURE_APPLICANTS]
    const found = all.find(c => c.externalId === externalId)
    return found || null
  }

  async search(criteria: SourcingCriteria): Promise<SourcedProfile[]> {
    const result = await this.searchCandidates({
      roleTitle: criteria.roleTitle,
      skills: criteria.skills,
      minExperience: criteria.minExperience,
      maxExperience: criteria.maxExperience,
      location: criteria.location,
      limit: criteria.limit,
      offset: criteria.offset,
      simulateError: criteria.simulateError,
      simulateRateLimit: criteria.simulateRateLimit,
    })

    return result.candidates.map(c => {
      const reqSkills = (criteria.skills || []).map(s => s.toLowerCase().trim())
      const matchedSkills = c.skills.filter(s => reqSkills.some(rs => s.toLowerCase().includes(rs) || rs.includes(s.toLowerCase())))
      const skillScore = reqSkills.length > 0 ? Math.round((matchedSkills.length / reqSkills.length) * 100) : 85
      const expScore = 85
      const roleScore = 90
      const totalScore = Math.round(skillScore * 0.5 + expScore * 0.3 + roleScore * 0.2)

      return {
        externalId: c.externalId,
        platform: 'INDEED',
        provider: 'mock_indeed',
        simulationStatus: 'SIMULATED',
        fullName: c.fullName,
        email: c.email,
        phone: c.phone,
        profileUrl: c.profileUrl,
        currentRole: c.currentRole,
        currentCompany: c.currentCompany,
        experienceYears: c.experienceYears,
        skills: c.skills,
        matchScore: Math.max(75, totalScore),
        skillScore,
        experienceScore: expScore,
        roleScore,
        resumeText: c.resumeText,
        aiReasoning: {
          strengths: [`${matchedSkills.length} competencies matched from Indeed Resume`, 'Experience at ' + c.currentCompany],
          skillMatches: matchedSkills,
          summary: `Indeed talent resume matching ${matchedSkills.length} required competencies.`,
          reasoning: `Indeed Talent pool match for ${c.fullName} with ${c.experienceYears}y verified experience in ${c.currentRole}.`,
        },
      }
    })
  }
}

// ============================================================
// Internal DB Sourcing Provider
// ============================================================
export class InternalDbSourcingProvider implements SourcingProvider {
  public readonly providerName = 'internal_db'
  private client: SupabaseClient
  private organizationId: string

  constructor(client: SupabaseClient, organizationId: string) {
    this.client = client
    this.organizationId = organizationId
  }

  async searchCandidates(request: CandidateSearchRequest): Promise<CandidateSearchResult> {
    const minExp = request.minExperience || 0
    const limit = request.limit || 15
    const offset = request.offset || 0

    const { data: candidates, count } = await this.client
      .from('candidates')
      .select('*, skills:candidate_skills(*)', { count: 'exact' })
      .eq('organization_id', this.organizationId)
      .eq('is_anonymized', false)
      .gte('total_experience_years', minExp)
      .range(offset, offset + limit - 1)

    const extCandidates: ExternalCandidate[] = (candidates || []).map((cand: any) => ({
      externalId: cand.id,
      providerName: 'internal_db',
      provider: 'internal_db',
      platform: 'INTERNAL_DB',
      simulationStatus: 'REAL',
      fullName: `${cand.first_name || ''} ${cand.last_name || ''}`.trim() || 'Internal Candidate',
      email: cand.email,
      phone: cand.phone,
      profileUrl: undefined,
      currentRole: cand.current_designation || 'Software Engineer',
      currentCompany: cand.current_company || 'Internal Pool',
      experienceYears: Number(cand.total_experience_years) || 1,
      skills: (cand.skills || []).map((s: any) => s.skill_name),
      location: cand.location || 'Internal',
      resumeText: cand.raw_resume_text || undefined,
      headline: `${cand.current_designation || 'Engineer'} at ${cand.current_company || 'Internal Talent'}`,
      isMock: false,
    }))

    return {
      candidates: extCandidates,
      total: count || extCandidates.length,
      limit,
      offset,
      providerName: 'internal_db',
      isMock: false,
    }
  }

  async publishJob(request: JobPostingRequest): Promise<JobPostingResult> {
    return {
      jobPostingId: `internal_job_${request.requisitionId}`,
      requisitionId: request.requisitionId,
      providerName: 'internal_db',
      platform: 'INTERNAL_DB',
      provider: 'internal_db',
      status: 'PUBLISHED',
      url: `/hiring/requisitions/${request.requisitionId}`,
      publishedAt: '2026-10-03T10:00:00.000Z',
      isMock: false,
      simulationStatus: 'REAL',
      message: 'Job published to Internal Career Portal.',
    }
  }

  async syncApplicants(request: ApplicantSyncRequest): Promise<ApplicantSyncResult> {
    const applicants: ExternalCandidate[] = []
    const result = Object.assign([...applicants], {
      applicants,
      totalSynced: 0,
      providerName: 'internal_db',
      platform: 'INTERNAL_DB',
      provider: 'internal_db',
      isMock: false,
      simulationStatus: 'REAL' as const,
    })
    return result as ApplicantSyncResult
  }

  async getCandidateProfile(externalId: string): Promise<ExternalCandidate | null> {
    const { data: cand } = await this.client
      .from('candidates')
      .select('*, skills:candidate_skills(*)')
      .eq('organization_id', this.organizationId)
      .eq('id', externalId)
      .maybeSingle()

    if (!cand) return null

    return {
      externalId: cand.id,
      providerName: 'internal_db',
      provider: 'internal_db',
      platform: 'INTERNAL_DB',
      simulationStatus: 'REAL',
      fullName: `${cand.first_name || ''} ${cand.last_name || ''}`.trim(),
      email: cand.email,
      phone: cand.phone,
      currentRole: cand.current_designation || 'Engineer',
      currentCompany: cand.current_company || 'Internal Pool',
      experienceYears: Number(cand.total_experience_years) || 0,
      skills: (cand.skills || []).map((s: any) => s.skill_name),
      location: cand.location,
      resumeText: cand.raw_resume_text,
      headline: `${cand.current_designation || 'Engineer'} at ${cand.current_company || 'Internal Talent'}`,
      isMock: false,
    }
  }

  async search(criteria: SourcingCriteria): Promise<SourcedProfile[]> {
    const res = await this.searchCandidates({
      roleTitle: criteria.roleTitle,
      skills: criteria.skills,
      minExperience: criteria.minExperience,
      maxExperience: criteria.maxExperience,
      location: criteria.location,
      limit: criteria.limit,
      offset: criteria.offset,
    })

    const results: SourcedProfile[] = []
    const targetSkills = (criteria.skills || []).map(s => s.toLowerCase().trim())

    for (const cand of res.candidates) {
      const candSkills = cand.skills.map(s => s.toLowerCase().trim())
      const matched = targetSkills.filter(ts => candSkills.some(cs => cs.includes(ts) || ts.includes(cs)))
      const skillScore = targetSkills.length > 0 ? Math.round((matched.length / targetSkills.length) * 100) : 75
      const candExp = cand.experienceYears
      const reqExp = criteria.minExperience || 1
      const expScore = Math.min(100, Math.round((candExp / reqExp) * 90))
      const roleScore = cand.currentRole.toLowerCase().includes(criteria.roleTitle.toLowerCase()) ? 95 : 70
      const totalScore = Math.round(skillScore * 0.5 + expScore * 0.3 + roleScore * 0.2)

      results.push({
        externalId: cand.externalId,
        platform: 'INTERNAL_DB',
        provider: 'internal_db',
        simulationStatus: 'REAL',
        fullName: cand.fullName,
        email: cand.email,
        phone: cand.phone,
        currentRole: cand.currentRole,
        currentCompany: cand.currentCompany,
        experienceYears: candExp,
        skills: cand.skills,
        matchScore: totalScore,
        skillScore,
        experienceScore: expScore,
        roleScore,
        resumeText: cand.resumeText,
        aiReasoning: {
          strengths: [`${matched.length} key skills matched from internal repository`],
          skillMatches: matched,
          summary: `Internal talent profile with ${candExp} years relevant experience.`,
          reasoning: `Internal talent repository candidate matches ${matched.length} of ${targetSkills.length} required skills.`,
        },
      })
    }

    return results
  }
}

// ============================================================
// Multi-Platform Sourcing Aggregator
// ============================================================
export class SourcingAggregator {
  static async searchAcrossPlatforms(
    client: SupabaseClient,
    organizationId: string,
    criteria: SourcingCriteria,
    platforms: string[] = ['internal_db', 'linkedin', 'indeed']
  ): Promise<SourcedProfile[]> {
    const results: SourcedProfile[] = []
    const normalizedPlatforms = platforms.map(p => p.toLowerCase().trim())

    if (normalizedPlatforms.includes('internal_db')) {
      const internal = new InternalDbSourcingProvider(client, organizationId)
      const res = await internal.search(criteria)
      results.push(...res)
    }

    if (normalizedPlatforms.includes('linkedin')) {
      const li = new LinkedInMockProvider()
      const res = await li.search(criteria)
      results.push(...res)
    }

    if (normalizedPlatforms.includes('indeed')) {
      const ind = new IndeedMockProvider()
      const res = await ind.search(criteria)
      results.push(...res)
    }

    // Rank by descending matchScore
    return results.sort((a, b) => b.matchScore - a.matchScore)
  }
}
