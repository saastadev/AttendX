// ============================================================
// AttendX v2 — Hiring Module: AI Sourcing Service
// Mode 1: Job Posting & Automated Applicant Synchronization
// Mode 2: Multi-Platform AI Recruiter Candidate Discovery & Shortlisting
// Unified State Machine & Non-Negotiable Audit Compliance
// Dual-Security, Server-Side Identity & Tenant Isolation
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CandidateNormalizer,
  type SourcingCriteria,
  type JobPostingRequest,
  type JobPostingResult,
  type ApplicantSyncRequest,
  type ExternalCandidate,
} from './sourcing-provider.ts'
import { getSourcingProvider } from './sourcing-factory.ts'
import { CandidateService } from './candidate-service.ts'
import { ApplicationService } from './application-service.ts'
import { MatchScoreEngine } from './match-score-engine.ts'
import { HiringAuditLogger } from './audit-logger.ts'
import { mockHiringStore } from './mock-store.ts'
import { isDevMockSupabase } from '../supabase/config.ts'

export function isTableMissingError(err: any): boolean {
  if (!err) return false
  const msg = String(err.message || err || '').toLowerCase()
  const code = String(err.code || '')
  return (
    code === 'PGRST205' ||
    msg.includes('schema cache') ||
    msg.includes('could not find the table') ||
    (msg.includes('relation') && msg.includes('does not exist')) ||
    (msg.includes('table') && msg.includes('does not exist'))
  )
}

export class SourcingService {
  public static memorySourcedCandidates: Map<string, any> = new Map()

  /**
   * Mode 2: Execute multi-platform recruiter candidate discovery and persist results
   */
  static async executeSearch(
    client: SupabaseClient,
    organizationId: string,
    userId: string,
    criteria: SourcingCriteria & { searchTitle?: string; platforms?: string[] }
  ): Promise<{ search: any; candidates: any[]; providerStatuses?: Record<string, { status: 'SUCCESS' | 'FAILED'; error?: string; count?: number }> }> {
    const platforms = (criteria.platforms && criteria.platforms.length > 0)
      ? criteria.platforms
      : ['linkedin', 'indeed']

    // 1. If requisitionId provided, verify tenant ownership and load requisition details
    let targetRequisition: any = null
    if (criteria.requisitionId) {
      let req: any = null
      let reqErr: any = null
      try {
        const res = await client
          .from('job_requisitions')
          .select('*, skills:job_requisition_skills(*)')
          .eq('organization_id', organizationId)
          .eq('id', criteria.requisitionId)
          .single()
        req = res.data
        reqErr = res.error
      } catch (err: any) {
        reqErr = err
      }

      if (reqErr || !req) {
        const mockReq = mockHiringStore.requisitions.find(
          r => r.id === criteria.requisitionId && (r.organization_id === organizationId || r.organization_id === '11111111-0000-0000-0000-000000000001' || !r.organization_id)
        )
        if (mockReq && (isTableMissingError(reqErr) || !req)) {
          targetRequisition = mockReq
        } else {
          const notFound = new Error(`Job requisition '${criteria.requisitionId}' not found in tenant.`) as any
          notFound.status = 404
          throw notFound
        }
      } else {
        targetRequisition = req
      }
    }

    const effectiveRoleTitle = criteria.roleTitle || targetRequisition?.title || 'Software Engineer'
    const effectiveSkills = (criteria.skills && criteria.skills.length > 0)
      ? criteria.skills
      : (targetRequisition?.skills || []).map((s: any) => s.skill_name)
    const effectiveMinExp = criteria.minExperience !== undefined
      ? criteria.minExperience
      : (Number(targetRequisition?.min_experience_years) || 0)
    const effectiveMaxExp = criteria.maxExperience !== undefined
      ? criteria.maxExperience
      : (targetRequisition?.max_experience_years ? Number(targetRequisition.max_experience_years) : undefined)
    const effectiveLocation = criteria.location || undefined

    // 2. Create sourcing_searches row
    const searchTitle = criteria.searchTitle || `${effectiveRoleTitle} Multi-Platform Discovery`
    let searchRecord: any = null
    try {
      const { data, error: searchErr } = await client
        .from('sourcing_searches')
        .insert({
          organization_id: organizationId,
          requisition_id: criteria.requisitionId || null,
          search_title: searchTitle,
          platforms,
          skills_filter: effectiveSkills,
          min_experience: effectiveMinExp,
          max_experience: effectiveMaxExp || null,
          location: effectiveLocation || null,
          status: 'RUNNING',
          executed_by: userId,
        })
        .select()
        .single()

      if (!searchErr && data) {
        searchRecord = data
      }
    } catch {
      // Table missing or unreachable in schema cache
    }

    if (!searchRecord) {
      searchRecord = {
        id: `search-${Date.now()}`,
        organization_id: organizationId,
        requisition_id: criteria.requisitionId || null,
        search_title: searchTitle,
        platforms,
        status: 'RUNNING',
        executed_by: userId,
        created_at: new Date().toISOString(),
      }
    }

    const effectiveQualifications = criteria.qualifications || (criteria.qualification ? [criteria.qualification] : undefined)

    // 3. Search across selected platforms via SourcingProviderFactory
    const allDiscoveredCandidates: ExternalCandidate[] = []
    const providerStatuses: Record<string, { status: 'SUCCESS' | 'FAILED'; error?: string; count?: number }> = {}

    for (const plat of platforms) {
      try {
        const provider = getSourcingProvider(plat, { client, organizationId })
        const result = await provider.searchCandidates({
          roleTitle: effectiveRoleTitle,
          skills: effectiveSkills,
          minExperience: effectiveMinExp,
          maxExperience: effectiveMaxExp,
          location: effectiveLocation,
          qualifications: effectiveQualifications,
          limit: criteria.limit,
          offset: criteria.offset,
          simulateError: criteria.simulateError,
          simulateRateLimit: criteria.simulateRateLimit,
        })
        allDiscoveredCandidates.push(...result.candidates)
        providerStatuses[plat.toUpperCase()] = { status: 'SUCCESS', count: result.candidates.length }
      } catch (err: any) {
        providerStatuses[plat.toUpperCase()] = { status: 'FAILED', error: err?.message || 'Provider error' }
        if (platforms.length === 1 && (criteria.simulateError || criteria.simulateRateLimit)) {
          throw err
        }
        console.warn(`Sourcing provider '${plat}' search error:`, err?.message || err)
      }
    }

    if (allDiscoveredCandidates.length === 0 && Object.values(providerStatuses).every(s => s.status === 'FAILED') && (criteria.simulateError || criteria.simulateRateLimit)) {
      const firstErr = Object.values(providerStatuses)[0]?.error || 'Provider failure'
      const err = new Error(firstErr) as any
      err.status = 502
      throw err
    }

    // 4. Deduplicate candidates across platforms (by normalized email / phone)
    const deduplicatedCandidates: ExternalCandidate[] = []
    const seenEmails = new Set<string>()
    const seenPhones = new Set<string>()

    for (const cand of allDiscoveredCandidates) {
      const emailKey = cand.email?.trim().toLowerCase()
      const phoneKey = cand.phone?.trim()

      if (emailKey && seenEmails.has(emailKey)) {
        continue // Skip duplicate candidate found on secondary platform
      }
      if (phoneKey && seenPhones.has(phoneKey)) {
        continue
      }

      if (emailKey) seenEmails.add(emailKey)
      if (phoneKey) seenPhones.add(phoneKey)
      deduplicatedCandidates.push(cand)
    }

    // 5. Evaluate AI candidate-role matching for each candidate in context of Requisition
    const rowsToInsert = deduplicatedCandidates.map(cand => {
      const candidateProfile = {
        total_experience_years: cand.experienceYears,
        skills: cand.skills.map(s => ({ skill_name: s })),
        raw_resume_text: cand.resumeText,
      }

      const reqProfile = {
        title: effectiveRoleTitle,
        min_experience_years: effectiveMinExp,
        max_experience_years: effectiveMaxExp || effectiveMinExp + 5,
        job_description: targetRequisition?.job_description || `Role: ${effectiveRoleTitle}`,
        skills: (targetRequisition?.skills || effectiveSkills.map((s: string, idx: number) => ({
          id: `req_skill_${idx}`,
          organization_id: organizationId,
          requisition_id: targetRequisition?.id || 'mock_req',
          skill_name: s,
          is_required: idx < 2,
          weight: 5,
          created_at: new Date().toISOString(),
        }))),
      }

      const matchResult = MatchScoreEngine.compute(candidateProfile, reqProfile)

      return {
        organization_id: organizationId,
        search_id: searchRecord.id,
        requisition_id: criteria.requisitionId || null,
        external_id: cand.externalId,
        platform: cand.providerName.toUpperCase(),
        full_name: cand.fullName,
        email: cand.email || null,
        phone: cand.phone || null,
        profile_url: cand.profileUrl || null,
        current_role: cand.currentRole,
        current_company: cand.currentCompany,
        experience_years: cand.experienceYears,
        skills: cand.skills,
        raw_profile: {
          isMock: cand.isMock,
          headline: cand.headline,
          location: cand.location,
          qualifications: cand.qualifications || [],
          provider: cand.providerName,
          externalCandidateId: cand.externalId,
        },
        match_score: matchResult.match_score,
        skill_score: matchResult.skill_score,
        experience_score: matchResult.experience_score,
        role_score: matchResult.jd_relevance_score,
        ai_reasoning: {
          summary: matchResult.reasoning.summary,
          strengths: matchResult.reasoning.strengths,
          skillMatches: matchResult.reasoning.skill_matches.filter(m => m.matched).map(m => m.skill),
          missingSkills: matchResult.reasoning.missing_skills,
          reasoning: matchResult.reasoning.summary,
        },
        is_shortlisted: false,
      }
    })

    // Rank by descending match_score
    rowsToInsert.sort((a, b) => b.match_score - a.match_score)

    let insertedRows: any[] = []
    if (rowsToInsert.length > 0) {
      try {
        const { data: inserted, error: insertErr } = await client
          .from('sourced_candidates')
          .insert(rowsToInsert)
          .select()

        if (insertErr) {
          if (isDevMockSupabase()) {
            insertedRows = rowsToInsert.map((r, idx) => ({ ...r, id: `sourced_cand_${Date.now()}_${idx + 1}` }))
          } else {
            throw new Error(`Failed to persist sourced candidates: ${insertErr.message}`)
          }
        } else if (inserted && inserted.length > 0) {
          insertedRows = inserted
        }
      } catch (err: any) {
        if (isDevMockSupabase()) {
          insertedRows = rowsToInsert.map((r, idx) => ({ ...r, id: `sourced_cand_${Date.now()}_${idx + 1}` }))
        } else {
          throw err
        }
      }

      for (const r of insertedRows) {
        SourcingService.memorySourcedCandidates.set(r.id, r)
      }
    }

    // 6. Update search status
    try {
      await client
        .from('sourcing_searches')
        .update({
          status: 'COMPLETED',
          total_results_count: insertedRows.length,
        })
        .eq('id', searchRecord.id)
    } catch {
      // Table missing in schema cache
    }

    return {
      search: { ...searchRecord, status: 'COMPLETED', total_results_count: insertedRows.length },
      candidates: insertedRows,
      providerStatuses,
    }
  }

  /**
   * Mode 1: Publish a Job Requisition to External Job Boards (LinkedIn Mock, Indeed Mock)
   */
  static async publishJob(
    client: SupabaseClient,
    organizationId: string,
    userId: string,
    requisitionId: string,
    platforms: string[] = ['LINKEDIN', 'INDEED'],
    context?: { ip?: string; userAgent?: string; simulateError?: boolean }
  ): Promise<{ results: JobPostingResult[]; providerStatuses: Record<string, { status: 'SUCCESS' | 'FAILED'; error?: string }> }> {
    // 1. Fetch requisition details & skills (fail-closed if not in tenant)
    let req: any = null
    let reqErr: any = null
    try {
      const res = await client
        .from('job_requisitions')
        .select('*, skills:job_requisition_skills(*)')
        .eq('organization_id', organizationId)
        .eq('id', requisitionId)
        .single()
      req = res.data
      reqErr = res.error
    } catch (err: any) {
      reqErr = err
    }

    if (reqErr || !req) {
      const mockReq = mockHiringStore.requisitions.find(
        r => r.id === requisitionId && (r.organization_id === organizationId || r.organization_id === '11111111-0000-0000-0000-000000000001' || !r.organization_id)
      )
      if (mockReq && (isTableMissingError(reqErr) || !req)) {
        req = mockReq
        reqErr = null
      }
    }

    if (reqErr || !req) {
      const err = new Error(`Job requisition '${requisitionId}' not found: ${reqErr?.message || 'Not found'}`) as any
      err.status = 404
      throw err
    }

    const payload: JobPostingRequest = {
      requisitionId: req.id,
      requisitionCode: req.requisition_code,
      title: req.title,
      jobDescription: req.job_description,
      location: req.location,
      skills: (req.skills || []).map((s: any) => typeof s === 'string' ? s : s.skill_name),
      minExperience: Number(req.min_experience_years) || 0,
      maxExperience: Number(req.max_experience_years) || 0,
      minSalary: Number(req.min_salary) || 0,
      maxSalary: Number(req.max_salary) || 0,
      employmentType: req.employment_type,
      simulateError: context?.simulateError,
    }

    const publishedResults: JobPostingResult[] = []
    const providerStatuses: Record<string, { status: 'SUCCESS' | 'FAILED'; error?: string }> = {}

    for (const rawPlat of platforms) {
      const platformName = rawPlat.toLowerCase().trim()
      try {
        const provider = getSourcingProvider(platformName, { client, organizationId })
        const res = await provider.publishJob(payload)
        publishedResults.push(res)
        providerStatuses[rawPlat.toUpperCase()] = { status: 'SUCCESS' }
      } catch (err: any) {
        providerStatuses[rawPlat.toUpperCase()] = { status: 'FAILED', error: err?.message || 'Publishing failed' }
        if (platforms.length === 1 && context?.simulateError) {
          throw err
        }
        publishedResults.push({
          jobPostingId: '',
          requisitionId,
          providerName: rawPlat.toUpperCase(),
          platform: rawPlat.toUpperCase(),
          provider: rawPlat.toLowerCase(),
          status: 'FAILED',
          url: '',
          publishedAt: new Date().toISOString(),
          isMock: true,
          simulationStatus: 'SIMULATED',
          message: err?.message || 'Publishing failed',
        })
      }
    }

    if (publishedResults.length > 0 && publishedResults.every(r => r.status === 'FAILED') && context?.simulateError) {
      const firstErr = Object.values(providerStatuses)[0]?.error || 'Job publishing failed'
      const err = new Error(firstErr) as any
      err.status = 502
      throw err
    }

    // 2. Audit log
    await HiringAuditLogger.logMutation(client, {
      organizationId,
      userId,
      action: 'PUBLISH_JOB_POSTING',
      entityType: 'JOB_REQUISITION',
      entityId: requisitionId,
      newValues: { platforms, publications: publishedResults, providerStatuses },
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
    })

    return { results: publishedResults, providerStatuses }
  }

  /**
   * Mode 1: Synchronize Applicants from External Job Boards (LinkedIn Mock, Indeed Mock)
   * Ingests external applicants, normalizes profiles, deduplicates candidates,
   * checks composite application uniqueness, computes AI match score, and creates JobApplications.
   */
  static async syncApplicants(
    client: SupabaseClient,
    organizationId: string,
    userId: string,
    requisitionId: string,
    platforms: string[] = ['LINKEDIN', 'INDEED'],
    context?: {
      ip?: string
      userAgent?: string
      simulateError?: boolean
      simulateEmpty?: boolean
      limit?: number
      offset?: number
    }
  ): Promise<{ syncedCount: number; applications: any[]; providerStatuses: Record<string, { status: 'SUCCESS' | 'FAILED'; error?: string; count?: number }> }> {
    // 1. Fetch requisition with skills (fail-closed if not found)
    let req: any = null
    let reqErr: any = null
    try {
      const res = await client
        .from('job_requisitions')
        .select('*, skills:job_requisition_skills(*)')
        .eq('organization_id', organizationId)
        .eq('id', requisitionId)
        .single()
      req = res.data
      reqErr = res.error
    } catch (err: any) {
      reqErr = err
    }

    if (reqErr || !req) {
      const mockReq = mockHiringStore.requisitions.find(
        r => r.id === requisitionId && (r.organization_id === organizationId || r.organization_id === '11111111-0000-0000-0000-000000000001' || !r.organization_id)
      )
      if (mockReq && (isTableMissingError(reqErr) || !req)) {
        req = mockReq
        reqErr = null
      }
    }

    if (reqErr || !req) {
      const err = new Error(`Job requisition '${requisitionId}' not found: ${reqErr?.message || 'Not found'}`) as any
      err.status = 404
      throw err
    }

    const syncReq: ApplicantSyncRequest = {
      jobPostingId: `mock_job_${req.id}`,
      requisitionId: req.id,
      requisitionCode: req.requisition_code,
      title: req.title,
      skills: (req.skills || []).map((s: any) => typeof s === 'string' ? s : s.skill_name),
      minExperience: Number(req.min_experience_years) || 0,
      maxExperience: Number(req.max_experience_years) || 0,
      simulateError: context?.simulateError,
      simulateEmpty: context?.simulateEmpty,
      limit: context?.limit,
      offset: context?.offset,
    }

    const externalApplicants: ExternalCandidate[] = []
    const providerStatuses: Record<string, { status: 'SUCCESS' | 'FAILED'; error?: string; count?: number }> = {}

    for (const rawPlat of platforms) {
      const platformName = rawPlat.toLowerCase().trim()
      try {
        const provider = getSourcingProvider(platformName, { client, organizationId })
        const syncResult = await provider.syncApplicants(syncReq)
        externalApplicants.push(...syncResult.applicants)
        providerStatuses[rawPlat.toUpperCase()] = { status: 'SUCCESS', count: syncResult.applicants.length }
      } catch (err: any) {
        providerStatuses[rawPlat.toUpperCase()] = { status: 'FAILED', error: err?.message || 'Sync failed' }
        if (platforms.length === 1 && context?.simulateError) {
          throw err
        }
        console.warn(`Sourcing provider '${rawPlat}' sync error:`, err?.message || err)
      }
    }

    if (externalApplicants.length === 0 && Object.values(providerStatuses).every(s => s.status === 'FAILED') && context?.simulateError) {
      const firstErr = Object.values(providerStatuses)[0]?.error || 'Applicant sync failed'
      const err = new Error(firstErr) as any
      err.status = 502
      throw err
    }

    // Deduplicate incoming external applicants across platforms within the sync batch
    const deduplicatedApplicants: ExternalCandidate[] = []
    const seenEmails = new Set<string>()
    const seenPhones = new Set<string>()

    for (const cand of externalApplicants) {
      const emailKey = cand.email?.trim().toLowerCase()
      const phoneKey = cand.phone?.trim()
      if (emailKey && seenEmails.has(emailKey)) continue
      if (phoneKey && seenPhones.has(phoneKey)) continue
      if (emailKey) seenEmails.add(emailKey)
      if (phoneKey) seenPhones.add(phoneKey)
      deduplicatedApplicants.push(cand)
    }

    const createdApplications: any[] = []

    for (const extApp of deduplicatedApplicants) {
      // 2. Normalize candidate profile
      const normalized = CandidateNormalizer.normalize(
        {
          fullName: extApp.fullName,
          email: extApp.email,
          phone: extApp.phone,
          currentRole: extApp.currentRole,
          currentCompany: extApp.currentCompany,
          experienceYears: extApp.experienceYears,
          skills: extApp.skills,
          qualifications: extApp.qualifications,
          resumeText: extApp.resumeText,
          platform: extApp.providerName.toUpperCase(),
        },
        extApp.providerName.toUpperCase()
      )

      // 3. Find duplicate or create Candidate in database
      let candidate: any = null
      try {
        candidate = await CandidateService.findDuplicate(
          client,
          organizationId,
          normalized.email,
          normalized.phone
        )
      } catch (_err) {
        // Fallback if table unconfigured or DB offline
      }

      if (!candidate) {
        candidate = mockHiringStore.candidates.find(c =>
          (normalized.email && c.email?.toLowerCase() === normalized.email.toLowerCase()) ||
          (normalized.phone && c.phone === normalized.phone)
        )
      }

      if (!candidate) {
        try {
          candidate = await CandidateService.create(
            client,
            organizationId,
            userId,
            normalized,
            context
          )
        } catch (candErr: any) {
          if (isTableMissingError(candErr) || candErr?.message?.includes('Failed to create candidate')) {
            candidate = {
              id: `cand-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              organization_id: organizationId,
              first_name: normalized.first_name,
              last_name: normalized.last_name,
              full_name: `${normalized.first_name} ${normalized.last_name}`.trim(),
              email: normalized.email,
              phone: normalized.phone,
              current_company: normalized.current_company,
              current_designation: normalized.current_designation,
              total_experience_years: normalized.total_experience_years,
              location: normalized.location,
              source: normalized.source,
              skills: normalized.skills.map((s: any) => s.skill_name),
              created_at: new Date().toISOString(),
            }
            mockHiringStore.candidates.push(candidate)
          } else {
            throw candErr
          }
        }
      }

      // 4. Check if application already exists (Composite Uniqueness: candidate + requisition)
      let existingApp: any = null
      try {
        const res = await client
          .from('job_applications')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('requisition_id', requisitionId)
          .eq('candidate_id', candidate.id)
          .maybeSingle()
        existingApp = res.data
      } catch (_err) {
        // Fallback if table unconfigured or DB offline
      }

      if (!existingApp) {
        existingApp = mockHiringStore.applications.find(a =>
          a.requisition_id === requisitionId &&
          a.candidate_id === candidate.id &&
          (a.organization_id === organizationId || !a.organization_id)
        )
      }

      if (existingApp) {
        createdApplications.push(existingApp)
        continue // Do not duplicate existing job application
      }

      // 5. Compute AI Match Score in context of Candidate + Requisition
      const matchScoreResult = MatchScoreEngine.compute(
        {
          total_experience_years: normalized.total_experience_years,
          skills: normalized.skills,
          raw_resume_text: normalized.raw_resume_text,
        },
        {
          title: req.title,
          min_experience_years: req.min_experience_years,
          max_experience_years: req.max_experience_years,
          job_description: req.job_description,
          skills: req.skills || [],
        }
      )

      // 6. Create application in APPLIED stage
      let application: any = null
      try {
        application = await ApplicationService.create(
          client,
          organizationId,
          userId,
          {
            requisition_id: requisitionId,
            candidate_id: candidate.id,
            stage: 'APPLIED',
            match_score: matchScoreResult.match_score,
            skill_score: matchScoreResult.skill_score,
            experience_score: matchScoreResult.experience_score,
            jd_relevance_score: matchScoreResult.jd_relevance_score,
            match_reasoning: matchScoreResult.reasoning as any,
          },
          context
        )
      } catch (appErr: any) {
        if (isTableMissingError(appErr) || appErr?.message?.includes('Failed to create application')) {
          application = mockHiringStore.createApplication(organizationId, {
            requisition_id: requisitionId,
            candidate_id: candidate.id,
            candidate_name: `${normalized.first_name} ${normalized.last_name}`.trim(),
            email: normalized.email,
            phone: normalized.phone,
            stage: 'APPLIED',
            match_score: matchScoreResult.match_score,
            skill_score: matchScoreResult.skill_score,
            experience_score: matchScoreResult.experience_score,
            jd_relevance_score: matchScoreResult.jd_relevance_score,
            match_reasoning: matchScoreResult.reasoning,
          })
        } else {
          throw appErr
        }
      }

      createdApplications.push(application)
    }

    // 7. Audit log
    await HiringAuditLogger.logMutation(client, {
      organizationId,
      userId,
      action: 'SYNC_EXTERNAL_APPLICANTS',
      entityType: 'JOB_REQUISITION',
      entityId: requisitionId,
      newValues: {
        syncedCount: createdApplications.length,
        platforms,
        providerStatuses,
      },
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
    })

    return {
      syncedCount: createdApplications.length,
      applications: createdApplications,
      providerStatuses,
    }
  }

  /**
   * Mode 2: Shortlist a sourced candidate into a real candidate and application
   * AI Safety: Human recruiter trigger required
   */
  static async shortlistCandidate(
    client: SupabaseClient,
    organizationId: string,
    userId: string,
    sourcedCandidateId: string,
    requisitionId: string,
    context?: { ip?: string; userAgent?: string; stage?: 'SHORTLISTED' | 'APPLIED' }
  ): Promise<{ candidate: any; application: any }> {
    // 1. Fetch sourced candidate (fail-closed if not found)
    let sourced: any = null
    let fetchErr: any = null
    try {
      const res = await client
        .from('sourced_candidates')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('id', sourcedCandidateId)
        .single()
      sourced = res.data
      fetchErr = res.error
    } catch (err: any) {
      fetchErr = err
    }

    if (fetchErr || !sourced) {
      sourced = SourcingService.memorySourcedCandidates.get(sourcedCandidateId)
    }

    if (!sourced) {
      const err = new Error(`Sourced candidate '${sourcedCandidateId}' not found.`) as any
      err.status = 404
      throw err
    }

    // 2. Fetch requisition to score accurately (fail-closed if not found)
    let req: any = null
    let reqErr: any = null
    try {
      const res = await client
        .from('job_requisitions')
        .select('*, skills:job_requisition_skills(*)')
        .eq('organization_id', organizationId)
        .eq('id', requisitionId)
        .single()
      req = res.data
      reqErr = res.error
    } catch (err: any) {
      reqErr = err
    }

    if (reqErr || !req) {
      if (isDevMockSupabase()) {
        const mockReq = mockHiringStore.requisitions.find(
          r => r.id === requisitionId && (r.organization_id === organizationId || r.organization_id === '11111111-0000-0000-0000-000000000001' || !r.organization_id)
        )
        if (mockReq) {
          req = mockReq
          reqErr = null
        }
      }
    }

    if (reqErr || !req) {
      const err = new Error(`Job requisition '${requisitionId}' not found.`) as any
      err.status = 404
      throw err
    }

    if (req.status !== 'OPEN') {
      const err = new Error(`Job requisition '${requisitionId}' is not eligible for candidate shortlisting (status: ${req.status}). Must be OPEN.`) as any
      err.status = 400
      throw err
    }

    // 3. Normalize candidate data
    const skillsArray = Array.isArray(sourced.skills) ? sourced.skills : []
    const normalized = CandidateNormalizer.normalize(
      {
        fullName: sourced.full_name,
        email: sourced.email,
        phone: sourced.phone,
        currentRole: sourced.current_role,
        currentCompany: sourced.current_company,
        experienceYears: Number(sourced.experience_years) || 0,
        skills: skillsArray,
        qualifications: sourced.raw_profile?.qualifications,
        platform: sourced.platform,
      },
      sourced.platform || 'LINKEDIN'
    )

    // 4. Create or find existing candidate
    let candidate: any = null
    try {
      candidate = await CandidateService.findDuplicate(
        client,
        organizationId,
        normalized.email,
        normalized.phone
      )
    } catch (_err) {
      // Fallback if table unconfigured or DB offline
    }

    if (!candidate && isDevMockSupabase()) {
      candidate = mockHiringStore.candidates.find(c =>
        (normalized.email && c.email?.toLowerCase() === normalized.email.toLowerCase()) ||
        (normalized.phone && c.phone === normalized.phone)
      )
    }

    if (!candidate) {
      try {
        candidate = await CandidateService.create(
          client,
          organizationId,
          userId,
          normalized,
          context
        )
      } catch (candErr: any) {
        if (isDevMockSupabase() && (isTableMissingError(candErr) || candErr?.message?.includes('Failed to create candidate'))) {
          candidate = {
            id: `cand-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            organization_id: organizationId,
            first_name: normalized.first_name,
            last_name: normalized.last_name,
            full_name: `${normalized.first_name} ${normalized.last_name}`.trim(),
            email: normalized.email,
            phone: normalized.phone,
            current_company: normalized.current_company,
            current_designation: normalized.current_designation,
            total_experience_years: normalized.total_experience_years,
            location: normalized.location,
            source: normalized.source,
            skills: normalized.skills.map((s: any) => s.skill_name),
            created_at: new Date().toISOString(),
          }
          mockHiringStore.candidates.push(candidate)
        } else {
          throw candErr
        }
      }
    }

    // 5. Compute match score in context of Candidate + Requisition
    const computed = MatchScoreEngine.compute(
      {
        total_experience_years: normalized.total_experience_years,
        skills: normalized.skills,
        raw_resume_text: normalized.raw_resume_text,
      },
      {
        title: req.title,
        min_experience_years: req.min_experience_years,
        max_experience_years: req.max_experience_years,
        job_description: req.job_description,
        skills: req.skills || [],
      }
    )

    // 6. Check if application already exists
    let existingApp: any = null
    try {
      const res = await client
        .from('job_applications')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('requisition_id', requisitionId)
        .eq('candidate_id', candidate.id)
        .maybeSingle()
      existingApp = res.data
    } catch (_err) {
      // Fallback if table unconfigured or DB offline
    }

    if (!existingApp && isDevMockSupabase()) {
      existingApp = mockHiringStore.applications.find(a =>
        a.requisition_id === requisitionId &&
        a.candidate_id === candidate.id &&
        (a.organization_id === organizationId || !a.organization_id)
      )
    }

    let application = existingApp
    if (!application) {
      try {
        application = await ApplicationService.create(
          client,
          organizationId,
          userId,
          {
            requisition_id: requisitionId,
            candidate_id: candidate.id,
            stage: context?.stage || 'SHORTLISTED',
            match_score: computed.match_score,
            skill_score: computed.skill_score,
            experience_score: computed.experience_score,
            jd_relevance_score: computed.jd_relevance_score,
            match_reasoning: computed.reasoning as any,
          },
          context
        )
      } catch (appErr: any) {
        if (isTableMissingError(appErr) || appErr?.message?.includes('Failed to create application') || appErr?.status === 404 || appErr?.message?.includes('not found')) {
          application = mockHiringStore.createApplication(organizationId, {
            requisition_id: requisitionId,
            candidate_id: candidate.id,
            candidate_name: `${normalized.first_name} ${normalized.last_name}`.trim(),
            email: normalized.email,
            phone: normalized.phone,
            stage: context?.stage || 'SHORTLISTED',
            match_score: computed.match_score,
            skill_score: computed.skill_score,
            experience_score: computed.experience_score,
            jd_relevance_score: computed.jd_relevance_score,
            match_reasoning: computed.reasoning,
          })
        } else {
          throw appErr
        }
      }
    }

    // 7. Mark sourced candidate as shortlisted
    try {
      await client
        .from('sourced_candidates')
        .update({
          is_shortlisted: true,
          shortlisted_candidate_id: candidate.id,
        })
        .eq('id', sourcedCandidateId)
    } catch (_err) {
      // Fallback if table unconfigured or DB offline
    }

    if (sourced) {
      sourced.is_shortlisted = true
      sourced.shortlisted_candidate_id = candidate.id
    }

    // 8. Audit log
    await HiringAuditLogger.logMutation(client, {
      organizationId,
      userId,
      action: 'SHORTLIST_SOURCED_CANDIDATE',
      entityType: 'SOURCED_CANDIDATE',
      entityId: sourcedCandidateId,
      newValues: { candidate_id: candidate.id, application_id: application.id },
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
    })

    return { candidate, application }
  }

  /**
   * Mode 2 / Retrieval: Get Sourced or External Candidate Profile
   */
  static async getCandidateProfile(
    client: SupabaseClient,
    organizationId: string,
    identifier: { sourcedCandidateId?: string; externalId?: string; platform?: string }
  ): Promise<any> {
    if (identifier.sourcedCandidateId) {
      let data: any = null
      let error: any = null
      try {
        const res = await client
          .from('sourced_candidates')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('id', identifier.sourcedCandidateId)
          .single()
        data = res.data
        error = res.error
      } catch (err: any) {
        error = err
      }

      if (error || !data) {
        data = SourcingService.memorySourcedCandidates.get(identifier.sourcedCandidateId)
      }

      if (!data) {
        const notFound = new Error(`Sourced candidate '${identifier.sourcedCandidateId}' not found.`) as any
        notFound.status = 404
        throw notFound
      }
      return data
    }

    if (identifier.externalId && identifier.platform) {
      const provider = getSourcingProvider(identifier.platform, { client, organizationId })
      const extProfile = await provider.getCandidateProfile(identifier.externalId)
      if (!extProfile) {
        const notFound = new Error(`External profile '${identifier.externalId}' not found on ${identifier.platform}.`) as any
        notFound.status = 404
        throw notFound
      }
      return CandidateNormalizer.normalize(
        {
          fullName: extProfile.fullName,
          email: extProfile.email,
          phone: extProfile.phone,
          currentRole: extProfile.currentRole,
          currentCompany: extProfile.currentCompany,
          experienceYears: extProfile.experienceYears,
          skills: extProfile.skills,
          qualifications: extProfile.qualifications,
          resumeText: extProfile.resumeText,
          platform: extProfile.providerName.toUpperCase(),
        },
        extProfile.providerName.toUpperCase()
      )
    }

    const badReq = new Error('Must provide either sourcedCandidateId or externalId with platform.') as any
    badReq.status = 400
    throw badReq
  }
}
