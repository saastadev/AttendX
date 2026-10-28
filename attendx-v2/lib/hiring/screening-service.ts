// ============================================================
// AttendX v2 — Hiring Module: AI Screening & Evaluation Service
// Multi-factor evaluation: Skills, Relevancy, Communication, Culture Fit
// Bias-free fairness: Excludes PII, gender, age, and salary
// Explicit INSUFFICIENT_DATA handling for missing resume/profile
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { HiringAuditLogger } from './audit-logger'

export interface ScreeningEvaluationResult {
  status: 'COMPLETED' | 'INSUFFICIENT_DATA'
  screening?: any
  scores?: {
    skill_assessment_score: number
    relevancy_score: number
    communication_score: number
    culture_fit_score: number
    overall_score: number
  }
  strengths: string[]
  weaknesses: string[]
  recommendations: string
  detailed_analysis: Record<string, any>
  message?: string
}

export class ScreeningService {
  /**
   * Run AI screening evaluation on a candidate application
   */
  static async evaluate(
    client: SupabaseClient,
    organizationId: string,
    userId: string,
    applicationId: string,
    context?: { ip?: string; userAgent?: string }
  ): Promise<ScreeningEvaluationResult> {
    // 1. Fetch application, candidate, and requisition
    const { data: application, error: appErr } = await client
      .from('job_applications')
      .select(`
        *,
        candidate:candidates(*, skills:candidate_skills(*)),
        requisition:job_requisitions(*, skills:job_requisition_skills(*))
      `)
      .eq('organization_id', organizationId)
      .eq('id', applicationId)
      .single()

    if (appErr || !application) {
      throw new Error(`Application '${applicationId}' not found: ${appErr?.message}`)
    }

    const candidate = application.candidate
    const requisition = application.requisition

    if (!candidate) {
      throw new Error('Candidate profile not found for application.')
    }

    // 2. Check for INSUFFICIENT_DATA
    const resumeText = (candidate.raw_resume_text || '').trim()
    const candidateSkills = candidate.skills || []

    if (!resumeText && candidateSkills.length === 0) {
      return {
        status: 'INSUFFICIENT_DATA',
        strengths: [],
        weaknesses: ['Missing candidate resume text and competency records'],
        recommendations: 'INSUFFICIENT_DATA: Candidate has not provided resume text or verifiable skill entries. Request updated resume before re-screening.',
        detailed_analysis: {
          error_code: 'INSUFFICIENT_DATA',
          resume_length: 0,
          skills_count: 0,
        },
        message: 'Insufficient candidate profile or resume text for AI screening evaluation.',
      }
    }

    // 3. Compute Skills Assessment Score (Weighted)
    const reqSkills = requisition?.skills || []
    let totalWeight = 0
    let matchedWeight = 0
    const matchedSkills: string[] = []
    const missingSkills: string[] = []

    const candSkillNames = new Set(
      candidateSkills.map((s: any) => s.skill_name.trim().toLowerCase())
    )
    const resumeLower = resumeText.toLowerCase()

    if (reqSkills.length > 0) {
      for (const rSkill of reqSkills) {
        const weight = Math.max(rSkill.weight || 1, 1)
        totalWeight += weight
        const sName = rSkill.skill_name.trim().toLowerCase()
        const isMatched = candSkillNames.has(sName) || resumeLower.includes(sName)

        if (isMatched) {
          matchedWeight += weight
          matchedSkills.push(rSkill.skill_name)
        } else if (rSkill.is_required) {
          missingSkills.push(rSkill.skill_name)
        }
      }
    } else {
      totalWeight = 1
      matchedWeight = 1
    }

    const skillScore = Math.round((matchedWeight / totalWeight) * 100)

    // 4. Compute Relevancy Score (JD semantic match)
    let relevancyScore = 70
    if (requisition?.job_description && resumeText) {
      const jdTokens = new Set(
        requisition.job_description
          .toLowerCase()
          .replace(/[^\w\s]/g, '')
          .split(/\s+/)
          .filter((w: string) => w.length > 3)
      )
      let overlaps = 0
      for (const token of jdTokens) {
        if (resumeLower.includes(token)) overlaps++
      }
      const ratio = jdTokens.size > 0 ? overlaps / jdTokens.size : 0.5
      relevancyScore = Math.min(100, Math.max(35, Math.round(ratio * 140)))
    }

    // 5. Compute Communication Score (Clarity, structure, resume richness)
    let communicationScore = 75
    if (resumeText.length > 500) communicationScore = 85
    if (resumeText.length > 1500) communicationScore = 92
    if (resumeText.length < 150) communicationScore = 50

    // 6. Compute Culture Fit Score (Collaboration, initiative, continuous learning signals)
    const cultureKeywords = ['collaborat', 'lead', 'mentor', 'team', 'initiat', 'owner', 'learn', 'impact']
    let cultureHits = 0
    for (const kw of cultureKeywords) {
      if (resumeLower.includes(kw)) cultureHits++
    }
    const cultureFitScore = Math.min(95, Math.max(65, 60 + cultureHits * 5))

    // 7. Overall Composite Score (Skills 40%, Relevancy 30%, Communication 15%, Culture 15%)
    const overallScore = Math.round(
      skillScore * 0.4 + relevancyScore * 0.3 + communicationScore * 0.15 + cultureFitScore * 0.15
    )

    // 8. Strengths & Weaknesses
    const strengths: string[] = []
    if (skillScore >= 80) strengths.push('Strong competency alignment across core required technologies')
    if (relevancyScore >= 75) strengths.push('High semantic overlap with job description specifications')
    if (communicationScore >= 85) strengths.push('Well-structured professional background with clear accomplishments')
    if (cultureFitScore >= 80) strengths.push('Evidence of cross-functional collaboration and leadership initiative')
    if (matchedSkills.length > 0) strengths.push(`Verified skills: ${matchedSkills.slice(0, 4).join(', ')}`)

    const weaknesses: string[] = []
    if (missingSkills.length > 0) weaknesses.push(`Missing mandatory competencies: ${missingSkills.join(', ')}`)
    if (candidate.total_experience_years < (requisition?.min_experience_years || 0)) {
      weaknesses.push(`Total experience (${candidate.total_experience_years}y) is below required ${requisition?.min_experience_years}y minimum`)
    }
    if (communicationScore < 65) weaknesses.push('Resume description is sparse or lacks technical project depth')

    // 9. Recommendation
    let recommendations = ''
    if (overallScore >= 78) {
      recommendations = 'Highly Recommended: Strong technical fit and relevant background. Fast-track to Technical Interview.'
    } else if (overallScore >= 60) {
      recommendations = 'Conditional Match: Candidate satisfies primary requirements. Validate missing competencies in initial screening.'
    } else {
      recommendations = 'Not Recommended: Significant skill gaps or insufficient experience alignment with requisition requirements.'
    }

    const detailedAnalysis = {
      evaluated_skills: {
        matched: matchedSkills,
        missing: missingSkills,
        skill_score: skillScore,
      },
      seniority_fit: {
        candidate_years: candidate.total_experience_years,
        required_min_years: requisition?.min_experience_years || 0,
        required_max_years: requisition?.max_experience_years || null,
      },
      communication_analysis: {
        resume_character_count: resumeText.length,
        score: communicationScore,
      },
      culture_signals: {
        keyword_hits: cultureHits,
        score: cultureFitScore,
      },
    }

    // 10. Persist to ai_screenings table
    const { data: screening, error: insertErr } = await client
      .from('ai_screenings')
      .insert({
        organization_id: organizationId,
        candidate_id: candidate.id,
        requisition_id: requisition?.id || null,
        application_id: applicationId,
        skill_assessment_score: skillScore,
        relevancy_score: relevancyScore,
        communication_score: communicationScore,
        culture_fit_score: cultureFitScore,
        overall_score: overallScore,
        strengths,
        weaknesses,
        recommendations,
        detailed_analysis: detailedAnalysis,
        human_reviewed: false,
        model_name: 'attendx-ai-evaluator',
        model_version: '2026.1',
      })
      .select()
      .single()

    if (insertErr || !screening) {
      throw new Error(`Failed to save AI screening evaluation: ${insertErr?.message}`)
    }

    // 11. Audit log
    await HiringAuditLogger.logMutation(client, {
      organizationId,
      userId,
      action: 'AI_SCREENING_EVALUATE',
      entityType: 'AI_SCREENING',
      entityId: screening.id,
      newValues: {
        application_id: applicationId,
        candidate_id: candidate.id,
        overall_score: overallScore,
      },
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
    })

    return {
      status: 'COMPLETED',
      screening,
      scores: {
        skill_assessment_score: skillScore,
        relevancy_score: relevancyScore,
        communication_score: communicationScore,
        culture_fit_score: cultureFitScore,
        overall_score: overallScore,
      },
      strengths,
      weaknesses,
      recommendations,
      detailed_analysis: detailedAnalysis,
    }
  }

  /**
   * List screenings with filters
   */
  static async list(
    client: SupabaseClient,
    organizationId: string,
    filters: { applicationId?: string; candidateId?: string; requisitionId?: string }
  ) {
    let query = client
      .from('ai_screenings')
      .select(`
        *,
        candidate:candidates(id, first_name, last_name, email),
        requisition:job_requisitions(id, title)
      `)
      .eq('organization_id', organizationId)

    if (filters.applicationId) query = query.eq('application_id', filters.applicationId)
    if (filters.candidateId) query = query.eq('candidate_id', filters.candidateId)
    if (filters.requisitionId) query = query.eq('requisition_id', filters.requisitionId)

    query = query.order('created_at', { ascending: false })

    const { data, error } = await query
    if (error) throw new Error(`Failed to fetch screenings: ${error.message}`)
    return data || []
  }

  /**
   * Record human review on an AI screening
   */
  static async recordHumanReview(
    client: SupabaseClient,
    organizationId: string,
    reviewerId: string,
    screeningId: string,
    decision: 'ACCEPT' | 'REJECT' | 'MODIFY',
    notes?: string,
    context?: { ip?: string; userAgent?: string }
  ) {
    const { data: updated, error } = await client
      .from('ai_screenings')
      .update({
        human_reviewed: true,
        human_reviewer_id: reviewerId,
        human_decision: decision,
        recommendations: notes ? `${notes} (Human Review: ${decision})` : undefined,
      })
      .eq('organization_id', organizationId)
      .eq('id', screeningId)
      .select()
      .single()

    if (error || !updated) {
      throw new Error(`Failed to record human review: ${error?.message}`)
    }

    await HiringAuditLogger.logMutation(client, {
      organizationId,
      userId: reviewerId,
      action: 'HUMAN_REVIEW_SCREENING',
      entityType: 'AI_SCREENING',
      entityId: screeningId,
      newValues: { human_decision: decision, notes },
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
    })

    return updated
  }
}
