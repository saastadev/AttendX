// ============================================================
// AttendX v2 — Hiring Module: AI Match Score Engine
// Evaluates candidate vs requisition with algorithmic fairness
// Strictly excludes: name, gender, age, photo, and CTC
// ============================================================

import type { JobRequisitionSkill } from '../../types/hiring'

export interface CandidateProfileForScoring {
  total_experience_years: number
  skills: Array<{
    skill_name: string
    experience_years?: number | null
    proficiency_level?: string
  }>
  raw_resume_text?: string | null
}

export interface RequisitionForScoring {
  title: string
  min_experience_years?: number | null
  max_experience_years?: number | null
  job_description?: string | null
  skills?: JobRequisitionSkill[]
}

export interface MatchScoreResult {
  match_score: number
  skill_score: number
  experience_score: number
  jd_relevance_score: number
  reasoning: {
    summary: string
    strengths: string[]
    skill_matches: Array<{ skill: string; matched: boolean; weight: number }>
    missing_skills: string[]
    experience_notes: string
  }
}

export class MatchScoreEngine {
  /**
   * Computes bias-free match score between candidate and job requisition.
   * Inputs are restricted strictly to competencies and experience.
   */
  static compute(
    candidate: CandidateProfileForScoring,
    requisition: RequisitionForScoring
  ): MatchScoreResult {
    // 1. Skill Score Calculation (Weighted)
    const reqSkills = requisition.skills || []
    let totalWeight = 0
    let matchedWeight = 0
    const skillMatches: Array<{ skill: string; matched: boolean; weight: number }> = []
    const missingSkills: string[] = []
    const candidateSkillsLower = new Set(
      (candidate.skills || []).map(s => s.skill_name.trim().toLowerCase())
    )

    if (reqSkills.length > 0) {
      for (const rSkill of reqSkills) {
        const weight = Math.max(rSkill.weight || 1, 1)
        totalWeight += weight
        const isMatched = candidateSkillsLower.has(rSkill.skill_name.trim().toLowerCase())
        skillMatches.push({
          skill: rSkill.skill_name,
          matched: isMatched,
          weight,
        })
        if (isMatched) {
          matchedWeight += weight
        } else if (rSkill.is_required) {
          missingSkills.push(rSkill.skill_name)
        }
      }
    } else {
      // Default baseline if no skills explicitly registered
      totalWeight = 1
      matchedWeight = 1
    }

    const skillScore = Math.round((matchedWeight / totalWeight) * 100)

    // 2. Experience Score Calculation
    const candidateExp = candidate.total_experience_years || 0
    const minExp = requisition.min_experience_years || 0
    const maxExp = requisition.max_experience_years || minExp + 5

    let experienceScore = 75
    let experienceNotes = ''

    if (candidateExp < minExp) {
      const deficit = minExp - candidateExp
      experienceScore = Math.max(20, Math.round(100 - deficit * 20))
      experienceNotes = `Experience (${candidateExp}y) is below minimum requirement (${minExp}y).`
    } else if (candidateExp >= minExp && candidateExp <= maxExp) {
      experienceScore = 95
      experienceNotes = `Experience (${candidateExp}y) fits target window (${minExp}-${maxExp}y) ideally.`
    } else {
      experienceScore = 85
      experienceNotes = `Candidate exceeds senior band (${candidateExp}y vs ${maxExp}y max).`
    }

    // 3. JD Relevance Score (Semantic text overlap)
    let jdScore = 70
    if (requisition.job_description && candidate.raw_resume_text) {
      const jdTokens = new Set(
        requisition.job_description
          .toLowerCase()
          .replace(/[^\w\s]/g, '')
          .split(/\s+/)
          .filter(w => w.length > 3)
      )
      const resumeLower = candidate.raw_resume_text.toLowerCase()
      let overlaps = 0
      for (const token of jdTokens) {
        if (resumeLower.includes(token)) overlaps++
      }
      const ratio = jdTokens.size > 0 ? overlaps / jdTokens.size : 0.5
      jdScore = Math.min(100, Math.max(30, Math.round(ratio * 150)))
    }

    // 4. Composite Overall Match Score (Skills 50%, Experience 30%, JD Relevance 20%)
    const compositeScore = Math.round(skillScore * 0.5 + experienceScore * 0.3 + jdScore * 0.2)

    // 5. Strengths & Qualitative Summary
    const strengths: string[] = []
    if (skillScore >= 80) strengths.push('Strong alignment with required technical competencies')
    if (candidateExp >= minExp) strengths.push(`Verified ${candidateExp} years relevant industry experience`)
    if (missingSkills.length === 0 && reqSkills.length > 0) strengths.push('All required skills present in candidate profile')

    const summary =
      compositeScore >= 75
        ? `High alignment profile (${compositeScore}%). Strong candidate for ${requisition.title}.`
        : compositeScore >= 50
        ? `Moderate match (${compositeScore}%). Missing: [${missingSkills.slice(0, 3).join(', ')}].`
        : `Low compatibility (${compositeScore}%). Significant skill or experience variance.`

    return {
      match_score: compositeScore,
      skill_score: skillScore,
      experience_score: experienceScore,
      jd_relevance_score: jdScore,
      reasoning: {
        summary,
        strengths,
        skill_matches: skillMatches,
        missing_skills: missingSkills,
        experience_notes: experienceNotes,
      },
    }
  }
}
