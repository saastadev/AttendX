// ============================================================
// AttendX v2 — Hiring Module: Assessment Service
// Handles:
// - Technical & cognitive assessment templates & question management
// - Candidate test-taking lifecycle (ASSIGNED -> IN_PROGRESS -> SUBMITTED / EVALUATED)
// - Server-side timer validation and anti-leak question delivery
// - Deterministic score calculation & passing threshold enforcement
// - Automatic application evaluation and audit event emission
// - Strictly tenant-isolated by authoritative organization_id
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { HiringAuditLogger } from './audit-logger.ts'
import type {
  Assessment,
  CandidateAssessment,
  AssessmentQuestion,
  CandidateAssessmentStatus,
} from '../../types/hiring'

export interface CreateAssessmentInput {
  requisition_id?: string | null
  title: string
  description?: string | null
  time_limit_minutes?: number
  passing_score?: number
  questions: AssessmentQuestion[]
  is_active?: boolean
}

export interface CandidateAssessmentSubmission {
  candidate_assessment_id: string
  answers: Record<string, number | string> // question_id -> selected option index or text
}

export interface AssessmentEvaluationResult {
  candidate_assessment_id: string
  status: CandidateAssessmentStatus
  score: number
  passing_score: number
  passed: boolean
  total_questions: number
  correct_count: number
  breakdown: Array<{
    question_id: string
    earned_points: number
    max_points: number
    is_correct: boolean
  }>
  submitted_at: string
}

export class AssessmentService {
  /**
   * Create a new assessment template tied to an organization (and optional requisition)
   */
  static async createAssessment(
    client: SupabaseClient,
    organizationId: string,
    userId: string,
    input: CreateAssessmentInput
  ): Promise<Assessment> {
    const { data, error } = await client
      .from('assessments')
      .insert({
        organization_id: organizationId,
        requisition_id: input.requisition_id || null,
        title: input.title,
        description: input.description || null,
        time_limit_minutes: input.time_limit_minutes ?? 45,
        passing_score: input.passing_score ?? 60.0,
        questions: input.questions || [],
        is_active: input.is_active ?? true,
      })
      .select()
      .single()

    if (error || !data) {
      throw new Error(`Failed to create assessment: ${error?.message}`)
    }

    await HiringAuditLogger.logMutation(client, {
      organizationId,
      userId,
      action: 'CREATE',
      entityType: 'ASSESSMENT',
      entityId: data.id,
      newValues: { title: data.title, passing_score: data.passing_score },
    })

    return data as Assessment
  }

  /**
   * Fetch an assessment by ID within the authoritative tenant.
   * If isCandidateContext is true, strips answer keys (correct_option_index, rubric_keywords)
   * to guarantee zero answer leakage to test-takers.
   */
  static async getAssessment(
    client: SupabaseClient,
    organizationId: string,
    assessmentId: string,
    isCandidateContext = false
  ): Promise<Assessment> {
    const { data, error } = await client
      .from('assessments')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', assessmentId)
      .single()

    if (error || !data) {
      const notFound = new Error(`Assessment '${assessmentId}' not found in tenant.`) as any
      notFound.status = 404
      throw notFound
    }

    if (isCandidateContext && Array.isArray(data.questions)) {
      // Strip correct answers from questions payload without mutating record
      const safeQuestions = data.questions.map((q: AssessmentQuestion) => {
        const { correct_option_index, rubric_keywords, ...safeQuestion } = q as any
        return safeQuestion
      })
      return {
        ...data,
        questions: safeQuestions,
      } as Assessment
    }

    return data as Assessment
  }

  /**
   * List assessments for an organization
   */
  static async listAssessments(
    client: SupabaseClient,
    organizationId: string,
    requisitionId?: string
  ): Promise<Assessment[]> {
    let query = client
      .from('assessments')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })

    if (requisitionId) {
      query = query.eq('requisition_id', requisitionId)
    }

    const { data, error } = await query
    if (error) {
      throw new Error(`Failed to list assessments: ${error.message}`)
    }

    return (data || []) as Assessment[]
  }

  /**
   * Assign an assessment to a candidate & application
   */
  static async assignAssessment(
    client: SupabaseClient,
    organizationId: string,
    userId: string,
    params: {
      assessmentId: string
      candidateId: string
      applicationId?: string
    }
  ): Promise<CandidateAssessment> {
    // 1. Verify assessment exists in tenant
    const assessment = await this.getAssessment(client, organizationId, params.assessmentId)

    // 2. Insert candidate_assessments record
    const { data, error } = await client
      .from('candidate_assessments')
      .insert({
        organization_id: organizationId,
        assessment_id: assessment.id,
        candidate_id: params.candidateId,
        application_id: params.applicationId || null,
        status: 'ASSIGNED',
        answers: {},
        ai_evaluation: {},
      })
      .select()
      .single()

    if (error || !data) {
      throw new Error(`Failed to assign assessment: ${error?.message}`)
    }

    await HiringAuditLogger.logMutation(client, {
      organizationId,
      userId,
      action: 'ASSIGN',
      entityType: 'CANDIDATE_ASSESSMENT',
      entityId: data.id,
      newValues: { assessment_id: assessment.id, candidate_id: params.candidateId },
    })

    return data as CandidateAssessment
  }

  /**
   * Start a candidate assessment session.
   * Transitions status from ASSIGNED -> IN_PROGRESS and records started_at timestamp.
   */
  static async startAssessment(
    client: SupabaseClient,
    organizationId: string,
    candidateAssessmentId: string
  ): Promise<{
    candidateAssessment: CandidateAssessment
    assessment: Assessment
    timeLimitMinutes: number
    timeRemainingSeconds: number
  }> {
    const { data: record, error } = await client
      .from('candidate_assessments')
      .select('*, assessment:assessments(*)')
      .eq('organization_id', organizationId)
      .eq('id', candidateAssessmentId)
      .single()

    if (error || !record) {
      const notFound = new Error(`Candidate assessment '${candidateAssessmentId}' not found.`) as any
      notFound.status = 404
      throw notFound
    }

    const assessment = record.assessment as Assessment
    if (!assessment) {
      throw new Error('Associated assessment template not found.')
    }

    let startedAt = record.started_at ? new Date(record.started_at) : new Date()

    if (record.status === 'ASSIGNED') {
      const nowIso = new Date().toISOString()
      startedAt = new Date(nowIso)
      await client
        .from('candidate_assessments')
        .update({
          status: 'IN_PROGRESS',
          started_at: nowIso,
        })
        .eq('id', record.id)
      record.status = 'IN_PROGRESS'
      record.started_at = nowIso
    }

    // Calculate remaining seconds
    const timeLimitMinutes = assessment.time_limit_minutes || 45
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000))
    const totalAllowedSeconds = timeLimitMinutes * 60
    const timeRemainingSeconds = Math.max(0, totalAllowedSeconds - elapsedSeconds)

    // Strip answer keys from candidate payload
    const safeQuestions = (assessment.questions || []).map((q: AssessmentQuestion) => {
      const { correct_option_index, rubric_keywords, ...safe } = q as any
      return safe
    })

    return {
      candidateAssessment: record as CandidateAssessment,
      assessment: { ...assessment, questions: safeQuestions },
      timeLimitMinutes,
      timeRemainingSeconds,
    }
  }

  /**
   * Submit and evaluate candidate answers.
   * Validates time limits, calculates score against passing threshold,
   * updates candidate assessment & application records, and emits audit event.
   */
  static async submitAssessment(
    client: SupabaseClient,
    organizationId: string,
    submission: CandidateAssessmentSubmission,
    context?: { userId?: string; ip?: string; userAgent?: string }
  ): Promise<AssessmentEvaluationResult> {
    // 1. Fetch candidate assessment record with full assessment questions (including answer keys)
    const { data: record, error: fetchErr } = await client
      .from('candidate_assessments')
      .select('*, assessment:assessments(*)')
      .eq('organization_id', organizationId)
      .eq('id', submission.candidate_assessment_id)
      .single()

    if (fetchErr || !record) {
      const notFound = new Error(`Candidate assessment '${submission.candidate_assessment_id}' not found.`) as any
      notFound.status = 404
      throw notFound
    }

    if (record.status === 'EVALUATED' || record.status === 'SUBMITTED') {
      // Idempotent return if already evaluated
      return {
        candidate_assessment_id: record.id,
        status: record.status as CandidateAssessmentStatus,
        score: Number(record.score) || 0,
        passing_score: Number(record.assessment?.passing_score) || 60,
        passed: Boolean(record.passed),
        total_questions: Array.isArray(record.assessment?.questions) ? record.assessment.questions.length : 0,
        correct_count: record.ai_evaluation?.correct_count || 0,
        breakdown: record.ai_evaluation?.breakdown || [],
        submitted_at: record.submitted_at || record.created_at,
      }
    }

    const assessment = record.assessment as Assessment
    const questions: AssessmentQuestion[] = Array.isArray(assessment.questions) ? assessment.questions : []
    const passingScore = Number(assessment.passing_score) || 60.0

    // 2. Time validation (allow 2-minute network grace period)
    const startedAt = record.started_at ? new Date(record.started_at) : new Date(record.created_at)
    const elapsedSeconds = Math.floor((Date.now() - startedAt.getTime()) / 1000)
    const maxAllowedSeconds = (assessment.time_limit_minutes || 45) * 60 + 120 // 120s grace
    const isExpired = elapsedSeconds > maxAllowedSeconds

    // 3. Score calculation
    let totalPossiblePoints = 0
    let totalEarnedPoints = 0
    let correctCount = 0
    const breakdown: Array<{
      question_id: string
      earned_points: number
      max_points: number
      is_correct: boolean
    }> = []

    for (const q of questions) {
      const maxPts = q.points || 10
      totalPossiblePoints += maxPts
      const candidateAnswer = submission.answers[q.id]
      let isCorrect = false
      let earned = 0

      if (q.question_type === 'MULTIPLE_CHOICE') {
        const correctIndex = q.correct_option_index
        if (correctIndex !== undefined && Number(candidateAnswer) === Number(correctIndex)) {
          isCorrect = true
          earned = maxPts
          correctCount++
        }
      } else if (q.question_type === 'TEXT' || q.question_type === 'CODE') {
        // Keyword rubric evaluation
        const textAnswer = String(candidateAnswer || '').toLowerCase()
        const keywords = q.rubric_keywords || []
        if (keywords.length > 0) {
          const matchedKeywords = keywords.filter(k => textAnswer.includes(k.toLowerCase()))
          const ratio = matchedKeywords.length / keywords.length
          earned = Math.round(ratio * maxPts)
          isCorrect = ratio >= 0.5
          if (isCorrect) correctCount++
        } else if (textAnswer.trim().length > 20) {
          // Standard substantive response
          earned = Math.round(maxPts * 0.8)
          isCorrect = true
          correctCount++
        }
      }

      totalEarnedPoints += earned
      breakdown.push({
        question_id: q.id,
        earned_points: earned,
        max_points: maxPts,
        is_correct: isCorrect,
      })
    }

    const calculatedScore = totalPossiblePoints > 0
      ? Math.round((totalEarnedPoints / totalPossiblePoints) * 10000) / 100
      : 0
    const passed = !isExpired && calculatedScore >= passingScore
    const finalStatus: CandidateAssessmentStatus = isExpired ? 'EXPIRED' : 'EVALUATED'
    const nowIso = new Date().toISOString()

    const aiEvaluation = {
      summary: passed
        ? `Assessment passed with a score of ${calculatedScore}% (Passing threshold: ${passingScore}%).`
        : isExpired
        ? `Assessment expired due to exceeding time limit. Final score: ${calculatedScore}%.`
        : `Assessment score ${calculatedScore}% did not meet passing threshold of ${passingScore}%.`,
      correct_count: correctCount,
      total_questions: questions.length,
      earned_points: totalEarnedPoints,
      total_points: totalPossiblePoints,
      breakdown,
      evaluated_at: nowIso,
    }

    // 4. Update candidate_assessments record
    const { error: updateErr } = await client
      .from('candidate_assessments')
      .update({
        status: finalStatus,
        answers: submission.answers,
        score: calculatedScore,
        passed,
        ai_evaluation: aiEvaluation,
        submitted_at: nowIso,
        evaluated_at: nowIso,
      })
      .eq('id', record.id)

    if (updateErr) {
      throw new Error(`Failed to save assessment submission: ${updateErr.message}`)
    }

    // 5. If linked to job_applications, update application record
    if (record.application_id) {
      await client
        .from('job_applications')
        .update({
          updated_at: nowIso,
        })
        .eq('id', record.application_id)
    }

    // 6. Write immutable audit log
    await HiringAuditLogger.logMutation(client, {
      organizationId,
      userId: context?.userId || null,
      action: 'SUBMIT_ASSESSMENT',
      entityType: 'CANDIDATE_ASSESSMENT',
      entityId: record.id,
      oldValues: { status: record.status },
      newValues: {
        status: finalStatus,
        score: calculatedScore,
        passed,
        correct_count: correctCount,
      },
      ipAddress: context?.ip || null,
      userAgent: context?.userAgent || null,
    })

    return {
      candidate_assessment_id: record.id,
      status: finalStatus,
      score: calculatedScore,
      passing_score: passingScore,
      passed,
      total_questions: questions.length,
      correct_count: correctCount,
      breakdown,
      submitted_at: nowIso,
    }
  }
}
