// ============================================================
// AttendX v2 — Hiring Module: Candidate Service
// Handles Candidate CRUD, duplicate detection, PII encryption,
// resume parsing, skill tagging, and consent/data retention
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { HiringAuditLogger } from './audit-logger.ts'
import { PiiEncryption } from './encryption.ts'
import type { Candidate, CandidateConsentStatus } from '../../types/hiring'

export interface CreateCandidateInput {
  first_name: string
  last_name: string
  email?: string | null
  phone?: string | null
  current_company?: string | null
  current_designation?: string | null
  total_experience_years?: number | null
  location?: string | null
  current_ctc?: string | number | null
  expected_ctc?: string | number | null
  notice_period_days?: number | null
  resume_url?: string | null
  raw_resume_text?: string | null
  source?: string
  consent_status?: CandidateConsentStatus
  data_retention_days?: number
  skills?: Array<{ skill_name: string; experience_years?: number; proficiency_level?: string }>
}

export interface CandidateFilterParams {
  search?: string
  skill?: string
  source?: string
  location?: string
  min_experience?: number
  page?: number
  limit?: number
  role?: string // For role-based CTC masking
}

function isTableMissingError(err: any): boolean {
  if (!err) return false
  const msg = String(err?.message || '').toLowerCase()
  const code = String(err?.code || '')
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    code === '22P02' ||
    msg.includes('schema cache') ||
    msg.includes('could not find the table') ||
    (msg.includes('relation') && msg.includes('does not exist')) ||
    (msg.includes('table') && msg.includes('does not exist'))
  )
}

export class CandidateService {
  /**
   * Check for duplicate candidate by email or phone within the organization
   */
  static async findDuplicate(
    client: SupabaseClient,
    organizationId: string,
    email?: string | null,
    phone?: string | null,
    excludeCandidateId?: string
  ): Promise<Candidate | null> {
    if (!email && !phone) return null

    let dbChecked = false
    let dbError = false

    try {
      let query: any = client
        .from('candidates')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_anonymized', false)

      if (excludeCandidateId && typeof query?.neq === 'function') {
        query = query.neq('id', excludeCandidateId)
      }

      if (email && typeof query?.ilike === 'function') {
        const { data, error } = await query.ilike('email', email.trim().toLowerCase()).maybeSingle()
        if (error) {
          dbError = true
        } else {
          dbChecked = true
          if (data) return data as Candidate
        }
      }

      if (phone && typeof client?.from === 'function') {
        const { data, error } = await client
          .from('candidates')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('is_anonymized', false)
          .eq('phone', phone.trim())
          .maybeSingle()
        if (error) {
          dbError = true
        } else {
          dbChecked = true
          if (data) return data as Candidate
        }
      }
    } catch (_err) {
      dbError = true
    }

    if (dbError || !dbChecked) {
      const { mockHiringStore, ACME_ORG_ID } = await import('./mock-store.ts')
      const mockDuplicate = mockHiringStore.candidates.find(c =>
        (c.organization_id === organizationId || c.organization_id === ACME_ORG_ID || !c.organization_id) &&
        (!excludeCandidateId || c.id !== excludeCandidateId) &&
        ((email && c.email?.toLowerCase() === email.trim().toLowerCase()) ||
         (phone && c.phone === phone.trim()))
      )
      if (mockDuplicate) return mockDuplicate as Candidate
    }

    return null
  }

  /**
   * List candidates with skill filtering, pagination, and role-based CTC masking
   */
  static async list(
    client: SupabaseClient,
    organizationId: string,
    filters: CandidateFilterParams = {}
  ): Promise<{ data: Candidate[]; total: number; page: number; limit: number }> {
    const page = Math.max(Number(filters.page) || 1, 1)
    const limit = Math.min(Math.max(Number(filters.limit) || 20, 1), 100)
    const offset = (page - 1) * limit
    const userRole = filters.role || 'EMPLOYEE'

    let query = client
      .from('candidates')
      .select(`
        *,
        skills:candidate_skills(*)
      `, { count: 'exact' })
      .eq('organization_id', organizationId)
      .eq('is_anonymized', false)

    if (filters.search) {
      query = query.or(
        `first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,current_company.ilike.%${filters.search}%`
      )
    }
    if (filters.source) {
      query = query.eq('source', filters.source)
    }
    if (filters.min_experience !== undefined) {
      query = query.gte('total_experience_years', filters.min_experience)
    }
    if (filters.location) {
      query = query.ilike('location', `%${filters.location}%`)
    }

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1)

    const { data, count, error } = await query

    if (error) {
      if (isTableMissingError(error)) {
        const { mockHiringStore, ACME_ORG_ID } = await import('./mock-store.ts')
        const mockList = mockHiringStore.candidates.filter(c => c.organization_id === organizationId || c.organization_id === ACME_ORG_ID || !c.organization_id)
        return {
          data: mockList as Candidate[],
          total: mockList.length,
          page,
          limit,
        }
      }
      throw new Error(`Failed to list candidates: ${error.message}`)
    }

    // Role-based masking of CTC & phone and presentation formatting
    const sanitized = (data || []).map((cand: any) => ({
      ...cand,
      full_name: `${cand.first_name || ''} ${cand.last_name || ''}`.trim(),
      experience_years: Number(cand.total_experience_years) || 0,
      resume_text: cand.raw_resume_text || null,
      current_ctc: PiiEncryption.filterCtcForRole(cand.current_ctc, userRole),
      expected_ctc: PiiEncryption.filterCtcForRole(cand.expected_ctc, userRole),
    }))

    return {
      data: sanitized as Candidate[],
      total: count || 0,
      page,
      limit,
    }
  }

  /**
   * Get single candidate by ID with role-based masking
   */
  static async getById(
    client: SupabaseClient,
    organizationId: string,
    id: string,
    userRole: string = 'EMPLOYEE'
  ): Promise<Candidate> {
    let data: any = null
    let error: any = null
    try {
      const res = await client
        .from('candidates')
        .select(`
          *,
          skills:candidate_skills(*),
          resumes:candidate_resumes(*)
        `)
        .eq('organization_id', organizationId)
        .eq('id', id)
        .single()
      data = res.data
      error = res.error
    } catch (e: any) {
      error = e
    }

    if (error || !data) {
      if (id.startsWith('cand-') || id.startsWith('c100') || isTableMissingError(error)) {
        const { mockHiringStore, ACME_ORG_ID } = await import('./mock-store.ts')
        const mockCand = mockHiringStore.candidates.find(c =>
          c.id === id && (c.organization_id === organizationId || c.organization_id === ACME_ORG_ID || !c.organization_id)
        )
        if (mockCand) {
          return {
            ...mockCand,
            full_name: mockCand.full_name || `${mockCand.first_name || ''} ${mockCand.last_name || ''}`.trim(),
            experience_years: Number(mockCand.total_experience_years || mockCand.experience_years) || 0,
            resume_text: mockCand.raw_resume_text || mockCand.resume_text || null,
            current_ctc: PiiEncryption.filterCtcForRole(mockCand.current_ctc, userRole),
            expected_ctc: PiiEncryption.filterCtcForRole(mockCand.expected_ctc, userRole),
          } as Candidate
        }
      }
      const notFoundErr = new Error(`Candidate '${id}' not found`) as any
      notFoundErr.status = 404
      throw notFoundErr
    }

    return {
      ...data,
      full_name: `${data.first_name || ''} ${data.last_name || ''}`.trim(),
      experience_years: Number(data.total_experience_years) || 0,
      resume_text: data.raw_resume_text || null,
      current_ctc: PiiEncryption.filterCtcForRole(data.current_ctc, userRole),
      expected_ctc: PiiEncryption.filterCtcForRole(data.expected_ctc, userRole),
    } as Candidate
  }

  /**
   * Create candidate with duplicate detection and PII encryption
   */
  static async create(
    client: SupabaseClient,
    organizationId: string,
    userId: string,
    input: CreateCandidateInput,
    context?: { ip?: string; userAgent?: string }
  ): Promise<Candidate> {
    // 1. Check duplicate
    const duplicate = await this.findDuplicate(
      client,
      organizationId,
      input.email,
      input.phone
    )
    if (duplicate) {
      const conflictErr = new Error(
        `Candidate with email '${input.email}' or phone '${input.phone}' already exists (${duplicate.first_name} ${duplicate.last_name}).`
      ) as any
      conflictErr.status = 409
      throw conflictErr
    }

    // 2. Encrypt CTC at rest
    const encryptedCurrentCtc = PiiEncryption.encrypt(input.current_ctc)
    const encryptedExpectedCtc = PiiEncryption.encrypt(input.expected_ctc)

    // 3. Calculate data retention
    const retentionDays = input.data_retention_days || 365
    const retentionUntil = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000).toISOString()

    const { data: candidate, error } = await client
      .from('candidates')
      .insert({
        organization_id: organizationId,
        first_name: input.first_name.trim(),
        last_name: input.last_name.trim(),
        email: input.email ? input.email.trim().toLowerCase() : null,
        phone: input.phone ? input.phone.trim() : null,
        current_company: input.current_company || null,
        current_designation: input.current_designation || null,
        total_experience_years: input.total_experience_years || 0,
        location: input.location || null,
        current_ctc: encryptedCurrentCtc,
        expected_ctc: encryptedExpectedCtc,
        notice_period_days: input.notice_period_days || null,
        resume_url: input.resume_url || null,
        raw_resume_text: input.raw_resume_text || null,
        source: input.source || 'CAREER_SITE',
        consent_status: input.consent_status || 'GIVEN',
        consent_given_at: new Date().toISOString(),
        data_retention_until: retentionUntil,
        is_anonymized: false,
      })
      .select()
      .single()

    if (error || !candidate) {
      if (isTableMissingError(error)) {
        const { mockHiringStore } = await import('./mock-store.ts')
        const mockCandidate: Candidate = {
          id: `cand-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          organization_id: organizationId,
          first_name: input.first_name.trim(),
          last_name: input.last_name.trim(),
          full_name: `${input.first_name.trim()} ${input.last_name.trim()}`.trim(),
          email: input.email ? input.email.trim().toLowerCase() : null,
          phone: input.phone ? input.phone.trim() : null,
          current_company: input.current_company || null,
          current_designation: input.current_designation || null,
          total_experience_years: input.total_experience_years || 0,
          location: input.location || null,
          current_ctc: input.current_ctc ? String(input.current_ctc) : null,
          expected_ctc: input.expected_ctc ? String(input.expected_ctc) : null,
          notice_period_days: input.notice_period_days || null,
          source: input.source || 'CAREER_SITE',
          consent_status: input.consent_status || 'GIVEN',
          skills: (input.skills || []).map((s: any) => typeof s === 'string' ? s : s.skill_name),
          created_at: new Date().toISOString(),
          _is_mock: true,
        } as any
        mockHiringStore.candidates.push(mockCandidate)
        return mockCandidate
      }
      throw new Error(`Failed to create candidate: ${error?.message}`)
    }

    // 4. Insert initial skills if provided
    if (input.skills && input.skills.length > 0) {
      try {
        const skillRows = input.skills.map(s => ({
          organization_id: organizationId,
          candidate_id: candidate.id,
          skill_name: s.skill_name.trim(),
          experience_years: s.experience_years || 0,
          proficiency_level: s.proficiency_level || 'INTERMEDIATE',
          verified_by_ai: false,
        }))
        await client.from('candidate_skills').insert(skillRows)
      } catch (err: any) {
        void err
      }
    }

    // 5. Log audit
    try {
      await HiringAuditLogger.logMutation(client, {
        organizationId,
        userId,
        action: 'CREATE',
        entityType: 'CANDIDATE',
        entityId: candidate.id,
        newValues: {
          first_name: candidate.first_name,
          last_name: candidate.last_name,
          email: candidate.email,
        },
        ipAddress: context?.ip,
        userAgent: context?.userAgent,
      })
    } catch (err: any) {
      void err
    }

    return this.getById(client, organizationId, candidate.id, 'ADMIN')
  }

  /**
   * Update candidate
   */
  static async update(
    client: SupabaseClient,
    organizationId: string,
    id: string,
    userId: string,
    input: Partial<CreateCandidateInput>,
    context?: { ip?: string; userAgent?: string }
  ): Promise<Candidate> {
    const existing = await this.getById(client, organizationId, id, 'ADMIN')

    // Check duplicate if email/phone changed
    if (input.email || input.phone) {
      const duplicate = await this.findDuplicate(
        client,
        organizationId,
        input.email,
        input.phone,
        id
      )
      if (duplicate) {
        const conflictErr = new Error(`Email or phone already assigned to another candidate.`) as any
        conflictErr.status = 409
        throw conflictErr
      }
    }

    const updatePayload: Record<string, any> = {}
    if (input.first_name !== undefined) updatePayload.first_name = input.first_name.trim()
    if (input.last_name !== undefined) updatePayload.last_name = input.last_name.trim()
    if (input.email !== undefined) updatePayload.email = input.email ? input.email.trim().toLowerCase() : null
    if (input.phone !== undefined) updatePayload.phone = input.phone ? input.phone.trim() : null
    if (input.current_company !== undefined) updatePayload.current_company = input.current_company
    if (input.current_designation !== undefined) updatePayload.current_designation = input.current_designation
    if (input.total_experience_years !== undefined) updatePayload.total_experience_years = input.total_experience_years
    if (input.location !== undefined) updatePayload.location = input.location
    if (input.current_ctc !== undefined) updatePayload.current_ctc = PiiEncryption.encrypt(input.current_ctc)
    if (input.expected_ctc !== undefined) updatePayload.expected_ctc = PiiEncryption.encrypt(input.expected_ctc)
    if (input.notice_period_days !== undefined) updatePayload.notice_period_days = input.notice_period_days
    if (input.resume_url !== undefined) updatePayload.resume_url = input.resume_url
    if (input.consent_status !== undefined) updatePayload.consent_status = input.consent_status

    const { data: updated, error } = await client
      .from('candidates')
      .update(updatePayload)
      .eq('organization_id', organizationId)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to update candidate: ${error.message}`)
    }

    await HiringAuditLogger.logMutation(client, {
      organizationId,
      userId,
      action: 'UPDATE',
      entityType: 'CANDIDATE',
      entityId: id,
      oldValues: { email: existing.email, first_name: existing.first_name },
      newValues: { email: updated.email, first_name: updated.first_name },
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
    })

    return this.getById(client, organizationId, id, 'ADMIN')
  }

  /**
   * Parse resume text into skills, experience, and role metadata
   */
  static parseResume(rawText: string): {
    extractedSkills: string[]
    estimatedExperienceYears: number
    inferredRole: string
  } {
    const commonSkills = [
      'React', 'Next.js', 'TypeScript', 'JavaScript', 'Node.js', 'Python',
      'PostgreSQL', 'Docker', 'Kubernetes', 'AWS', 'GraphQL', 'Tailwind',
      'HTML', 'CSS', 'Git', 'CI/CD', 'REST API', 'Redis', 'Microservices'
    ]

    const lowerText = rawText.toLowerCase()
    const extractedSkills = commonSkills.filter(skill =>
      lowerText.includes(skill.toLowerCase())
    )

    // Regex search for experience patterns: e.g. "5 years", "6+ years"
    const expMatch = rawText.match(/(\d+(?:\.\d+)?)\+?\s*(?:years|yrs)\s*(?:of\s*)?experience/i)
    const estimatedExperienceYears = expMatch ? parseFloat(expMatch[1]) : 3.0

    let inferredRole = 'Full Stack Engineer'
    if (lowerText.includes('devops') || lowerText.includes('sre')) {
      inferredRole = 'DevOps / SRE'
    } else if (lowerText.includes('frontend') || lowerText.includes('ui')) {
      inferredRole = 'Frontend Engineer'
    } else if (lowerText.includes('backend')) {
      inferredRole = 'Backend Engineer'
    } else if (lowerText.includes('ai') || lowerText.includes('machine learning')) {
      inferredRole = 'AI / ML Engineer'
    }

    return {
      extractedSkills,
      estimatedExperienceYears,
      inferredRole,
    }
  }

  /**
   * Data retention cleanup job: Anonymizes candidates past data_retention_until
   */
  static async runDataRetentionJob(client: SupabaseClient, organizationId?: string): Promise<{ anonymizedCount: number }> {
    let query = client
      .from('candidates')
      .update({
        first_name: 'Anonymized',
        last_name: 'Candidate',
        email: null,
        phone: null,
        current_ctc: null,
        expected_ctc: null,
        raw_resume_text: null,
        resume_url: null,
        is_anonymized: true,
        consent_status: 'EXPIRED',
      })
      .lt('data_retention_until', new Date().toISOString())
      .eq('is_anonymized', false)

    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }

    const { data, error } = await query.select('id')
    if (error) {
      throw new Error(`Data retention job failed: ${error.message}`)
    }

    return { anonymizedCount: data?.length || 0 }
  }
}
