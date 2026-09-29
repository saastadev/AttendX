// ============================================================
// AttendX v2 — Hiring Module: AI Sourcing Service
// Executes multi-platform sourcing searches and converts
// shortlisted prospects into pipeline applications
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { SourcingAggregator, type SourcingCriteria } from './sourcing-provider'
import { CandidateService } from './candidate-service'
import { ApplicationService } from './application-service'
import { HiringAuditLogger } from './audit-logger'

export class SourcingService {
  /**
   * Execute multi-platform sourcing search and persist results
   */
  static async executeSearch(
    client: SupabaseClient,
    organizationId: string,
    userId: string,
    criteria: SourcingCriteria & { searchTitle: string; platforms?: string[] }
  ): Promise<{ search: any; candidates: any[] }> {
    const platforms = criteria.platforms || ['internal_db', 'linkedin', 'github']

    // 1. Create sourcing_searches row
    const { data: searchRecord, error: searchErr } = await client
      .from('sourcing_searches')
      .insert({
        organization_id: organizationId,
        requisition_id: criteria.requisitionId || null,
        search_title: criteria.searchTitle,
        platforms,
        skills_filter: criteria.skills,
        min_experience: criteria.minExperience || 0,
        max_experience: criteria.maxExperience || null,
        location: criteria.location || null,
        status: 'RUNNING',
        executed_by: userId,
      })
      .select()
      .single()

    if (searchErr || !searchRecord) {
      throw new Error(`Failed to initialize sourcing search: ${searchErr?.message}`)
    }

    // 2. Execute search aggregator
    const sourcedProfiles = await SourcingAggregator.searchAcrossPlatforms(
      client,
      organizationId,
      criteria,
      platforms
    )

    // 3. Persist into sourced_candidates
    const rowsToInsert = sourcedProfiles.map(p => ({
      organization_id: organizationId,
      search_id: searchRecord.id,
      requisition_id: criteria.requisitionId || null,
      external_id: p.externalId || null,
      platform: p.platform,
      full_name: p.fullName,
      email: p.email || null,
      phone: p.phone || null,
      profile_url: p.profileUrl || null,
      current_role: p.currentRole,
      current_company: p.currentCompany,
      experience_years: p.experienceYears,
      skills: p.skills,
      match_score: p.matchScore,
      skill_score: p.skillScore,
      experience_score: p.experienceScore,
      role_score: p.roleScore,
      ai_reasoning: p.aiReasoning,
      is_shortlisted: false,
    }))

    let insertedRows: any[] = []
    if (rowsToInsert.length > 0) {
      const { data: inserted, error: insertErr } = await client
        .from('sourced_candidates')
        .insert(rowsToInsert)
        .select()

      if (!insertErr && inserted) {
        insertedRows = inserted
      }
    }

    // 4. Update search status
    await client
      .from('sourcing_searches')
      .update({
        status: 'COMPLETED',
        total_results_count: insertedRows.length,
      })
      .eq('id', searchRecord.id)

    return {
      search: searchRecord,
      candidates: insertedRows,
    }
  }

  /**
   * Shortlist a sourced candidate into a real candidate and application
   * AI Safety: Human trigger required to execute shortlisting
   */
  static async shortlistCandidate(
    client: SupabaseClient,
    organizationId: string,
    userId: string,
    sourcedCandidateId: string,
    requisitionId: string,
    context?: { ip?: string; userAgent?: string }
  ): Promise<{ candidate: any; application: any }> {
    // 1. Fetch sourced candidate
    const { data: sourced, error: fetchErr } = await client
      .from('sourced_candidates')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', sourcedCandidateId)
      .single()

    if (fetchErr || !sourced) {
      throw new Error(`Sourced candidate '${sourcedCandidateId}' not found.`)
    }

    // 2. Split name
    const nameParts = (sourced.full_name || 'Candidate').trim().split(/\s+/)
    const firstName = nameParts[0] || 'Unknown'
    const lastName = nameParts.slice(1).join(' ') || 'Candidate'

    // 3. Create or find existing candidate
    let candidate = await CandidateService.findDuplicate(
      client,
      organizationId,
      sourced.email,
      sourced.phone
    )

    if (!candidate) {
      const skillsArray = Array.isArray(sourced.skills) ? sourced.skills : []
      candidate = await CandidateService.create(
        client,
        organizationId,
        userId,
        {
          first_name: firstName,
          last_name: lastName,
          email: sourced.email,
          phone: sourced.phone,
          current_company: sourced.current_company,
          current_designation: sourced.current_role,
          total_experience_years: sourced.experience_years,
          source: sourced.platform,
          skills: skillsArray.map((s: string) => ({ skill_name: s })),
        },
        context
      )
    }

    // 4. Create application in SHORTLISTED stage
    const application = await ApplicationService.create(
      client,
      organizationId,
      userId,
      {
        requisition_id: requisitionId,
        candidate_id: candidate.id,
        stage: 'SHORTLISTED',
        match_score: sourced.match_score || 80,
        skill_score: sourced.skill_score || 80,
        experience_score: sourced.experience_score || 80,
        jd_relevance_score: sourced.role_score || 80,
        match_reasoning: sourced.ai_reasoning || {},
      },
      context
    )

    // 5. Mark sourced candidate as shortlisted
    await client
      .from('sourced_candidates')
      .update({
        is_shortlisted: true,
        shortlisted_candidate_id: candidate.id,
      })
      .eq('id', sourcedCandidateId)

    // 6. Audit
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
}
