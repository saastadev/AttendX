// ============================================================
// AttendX v2 — Hiring Analytics & Insights Service
// Handles:
// - Funnel progression & conversion rate calculations
// - Bottleneck analysis (average duration per stage)
// - Candidate competency evaluation aggregates (Radar/Bar chart metrics)
// - AI Hiring Recommendations generator & persistence
// - Daily analytics snapshot builder
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { HiringAuditLogger } from './audit-logger.ts'

export interface AIRecommendation {
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
  requisition?: { id: string; title: string } | null
}

export interface FunnelStageMetric {
  stage: string
  label: string
  count: number
  conversionRate: number
  avgDurationDays: number
}

export interface FunnelAnalyticsResult {
  stages: FunnelStageMetric[]
  totalCandidates: number
  totalHires: number
  overallConversionRate: number
  timeToHireDays: number
}

export interface CandidateEvaluationRound {
  name: string
  date: string
  score: number
}

export interface CandidateEvaluationCompetency {
  name: string
  score: number
  target: number
}

export interface CandidateEvaluationProfile {
  id: string
  name: string
  initials: string
  avatarBg: string
  role: string
  experience: string
  lastInterviewDate: string
  overallScore: number
  badge: string
  rounds: CandidateEvaluationRound[]
  competencies: CandidateEvaluationCompetency[]
}

export class AnalyticsService {
  /**
   * Calculates hiring funnel progression, conversion rates, and time-in-stage metrics.
   */
  static async getFunnelMetrics(
    client: SupabaseClient,
    organizationId: string
  ): Promise<FunnelAnalyticsResult> {
    const STAGE_ORDER = [
      { stage: 'SOURCED', label: 'Sourced' },
      { stage: 'APPLIED', label: 'Applied' },
      { stage: 'SHORTLISTED', label: 'Shortlisted' },
      { stage: 'INTERVIEW', label: 'Interview' },
      { stage: 'SELECTED', label: 'Selected' },
      { stage: 'OFFER_RELEASED', label: 'Offer Released' },
      { stage: 'ONBOARDED', label: 'Onboarded' },
    ]

    // Fetch applications
    const { data: apps } = await client
      .from('job_applications')
      .select('id, stage, applied_at, created_at, updated_at')
      .eq('organization_id', organizationId)

    const allApps = apps || []
    const totalCandidates = allApps.length

    // Stage counts
    const stageCounts: Record<string, number> = {}
    for (const s of STAGE_ORDER) {
      stageCounts[s.stage] = 0
    }

    for (const app of allApps) {
      if (stageCounts[app.stage] !== undefined) {
        stageCounts[app.stage]++
      }
    }

    // Cumulative progression count (if at stage N, candidate passed through stages 1..N-1)
    const cumulativeCounts: Record<string, number> = {}
    let runningTotal = 0
    for (let i = STAGE_ORDER.length - 1; i >= 0; i--) {
      const stageName = STAGE_ORDER[i].stage
      runningTotal += stageCounts[stageName] || 0
      cumulativeCounts[stageName] = runningTotal
    }

    // Fetch funnel events for time-in-stage calculations
    const { data: funnelEvents } = await client
      .from('hiring_funnel_events')
      .select('application_id, from_stage, to_stage, created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true })

    const events = funnelEvents || []

    // Stage duration estimations
    const durationsPerStage: Record<string, number[]> = {}
    for (const s of STAGE_ORDER) {
      durationsPerStage[s.stage] = []
    }

    // Map app events
    const appEvents: Record<string, typeof events> = {}
    for (const ev of events) {
      if (!appEvents[ev.application_id]) appEvents[ev.application_id] = []
      appEvents[ev.application_id].push(ev)
    }

    for (const appId in appEvents) {
      const history = appEvents[appId]
      for (let i = 0; i < history.length - 1; i++) {
        const current = history[i]
        const next = history[i + 1]
        const durationHours = (new Date(next.created_at).getTime() - new Date(current.created_at).getTime()) / (1000 * 3600)
        const durationDays = durationHours / 24
        if (durationsPerStage[current.to_stage]) {
          durationsPerStage[current.to_stage].push(durationDays)
        }
      }
    }

    const firstCount = Math.max(cumulativeCounts[STAGE_ORDER[0].stage] || 0, totalCandidates, 0)

    const stageMetrics: FunnelStageMetric[] = STAGE_ORDER.map((item, idx) => {
      const count = cumulativeCounts[item.stage] || 0
      const prevCount = idx === 0 ? firstCount : (cumulativeCounts[STAGE_ORDER[idx - 1].stage] || 0)
      const conversionRate = (prevCount > 0 && count > 0) ? Math.min(100, Math.round((count / prevCount) * 100)) : 0

      const stageDurations = durationsPerStage[item.stage] || []
      const avgDurationDays = stageDurations.length > 0
        ? Math.round((stageDurations.reduce((a, b) => a + b, 0) / stageDurations.length) * 10) / 10
        : 0

      return {
        stage: item.stage,
        label: item.label,
        count,
        conversionRate,
        avgDurationDays,
      }
    })

    const totalHires = cumulativeCounts['ONBOARDED'] || stageCounts['ONBOARDED'] || 0
    const overallConversion = totalCandidates > 0 ? Math.round((totalHires / totalCandidates) * 100) : 0
    const timeToHire = stageMetrics.reduce((sum, s) => sum + s.avgDurationDays, 0)

    return {
      stages: stageMetrics,
      totalCandidates,
      totalHires,
      overallConversionRate: overallConversion,
      timeToHireDays: Math.round(timeToHire * 10) / 10,
    }
  }

  /**
   * Aggregate candidate competency evaluation scores (Radar / Competency Profile).
   * Returns empty array if no evaluations exist (Zero Fabrication).
   */
  static async getCompetencyScores(client: SupabaseClient, organizationId: string) {
    const { data: evaluations } = await client
      .from('candidate_evaluations')
      .select('technical_score, communication_score, problem_solving_score, culture_fit_score, overall_score')
      .eq('organization_id', organizationId)

    const evals = evaluations || []
    if (evals.length === 0) {
      return []
    }

    const avg = (field: keyof typeof evals[0]) => {
      const vals = evals.map(e => Number(e[field]) || 0).filter(v => v > 0)
      return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
    }

    return [
      { subject: 'Technical Skills', score: avg('technical_score'), benchmark: 75 },
      { subject: 'Communication', score: avg('communication_score'), benchmark: 70 },
      { subject: 'Problem Solving', score: avg('problem_solving_score'), benchmark: 72 },
      { subject: 'Culture Fit', score: avg('culture_fit_score'), benchmark: 80 },
      { subject: 'Overall Rating', score: avg('overall_score'), benchmark: 75 },
    ]
  }

  /**
   * Retrieves authentic candidate evaluation profiles for the hiring analytics dashboard.
   * Returns empty array if no evaluations exist (Zero Fabrication).
   */
  static async getCandidateEvaluationProfiles(
    client: SupabaseClient,
    organizationId: string
  ): Promise<CandidateEvaluationProfile[]> {
    const { data: evaluations, error } = await client
      .from('candidate_evaluations')
      .select(`
        *,
        candidate:candidates!candidate_id(id, first_name, last_name, email, total_experience_years),
        application:job_applications!application_id(id, stage, requisition:job_requisitions!requisition_id(id, title)),
        interview:interviews!interview_id(id, round_number, round_type, title, scheduled_start)
      `)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })

    if (error || !evaluations || evaluations.length === 0) {
      return []
    }

    const AVATAR_COLORS = ['#5B5BF5', '#059669', '#F59E0B', '#EC4899', '#6366F1', '#14B8A6']

    const candidateMap = new Map<string, typeof evaluations>()
    for (const ev of evaluations) {
      const cId = ev.candidate_id
      if (!candidateMap.has(cId)) {
        candidateMap.set(cId, [])
      }
      candidateMap.get(cId)!.push(ev)
    }

    const profiles: CandidateEvaluationProfile[] = []
    let colorIdx = 0

    for (const [candId, evals] of candidateMap.entries()) {
      const latest = evals[0]
      const cand = latest.candidate
      if (!cand) continue

      const firstName = cand.first_name || ''
      const lastName = cand.last_name || ''
      const fullName = `${firstName} ${lastName}`.trim() || 'Anonymous Candidate'
      const initials = `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase() || 'C'
      const roleTitle = latest.application?.requisition?.title || 'Applicant'
      const experienceStr = `${cand.total_experience_years || 0} yrs experience`

      const interviewDate = latest.interview?.scheduled_start || latest.created_at
      const formattedDate = interviewDate ? new Date(interviewDate).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      }) : '—'

      const rounds: CandidateEvaluationRound[] = evals.map(e => ({
        name: e.interview?.title || (e.interview?.round_type ? `${e.interview.round_type} Round` : 'Interview'),
        date: e.interview?.scheduled_start ? new Date(e.interview.scheduled_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—',
        score: Math.round(Number(e.overall_score) || 0),
      }))

      const avgScore = (field: keyof typeof latest) => {
        const scores = evals.map(e => Number(e[field]) || 0).filter(s => s > 0)
        return scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
      }

      const competencies: CandidateEvaluationCompetency[] = [
        { name: 'Technical Skills', score: avgScore('technical_score'), target: 75 },
        { name: 'Communication', score: avgScore('communication_score'), target: 70 },
        { name: 'Problem Solving', score: avgScore('problem_solving_score'), target: 72 },
        { name: 'Culture Fit', score: avgScore('culture_fit_score'), target: 80 },
        { name: 'Overall Rating', score: avgScore('overall_score'), target: 75 },
      ]

      const overall = Math.round(Number(latest.overall_score) || avgScore('overall_score'))

      profiles.push({
        id: candId,
        name: fullName,
        initials,
        avatarBg: AVATAR_COLORS[colorIdx % AVATAR_COLORS.length],
        role: roleTitle,
        experience: experienceStr,
        lastInterviewDate: formattedDate,
        overallScore: overall,
        badge: latest.recommendation ? latest.recommendation.replace('_', ' ') : 'Evaluated',
        rounds,
        competencies,
      })

      colorIdx++
    }

    return profiles
  }

  /**
   * Retrieve stored algorithmic AI Recommendations for hiring pipeline optimization.
   * Returns empty array if none stored in database (Zero Fabrication).
   */
  static async getAIRecommendations(
    client: SupabaseClient,
    organizationId: string
  ): Promise<AIRecommendation[]> {
    const { data: storedRecs, error: fetchErr } = await client
      .from('hiring_ai_recommendations')
      .select('*, requisition:job_requisitions!requisition_id(id, title)')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })

    if (fetchErr) {
      throw new Error(`Database error querying recommendations: ${fetchErr.message}`)
    }

    if (storedRecs && storedRecs.length > 0) {
      return storedRecs as AIRecommendation[]
    }

    return []
  }

  /**
   * Generates and synchronizes data-driven hiring recommendations derived strictly from live tenant data.
   * Zero-Fabrication Charter:
   * - BOTTLENECK: Derived from hiring_funnel_events durations (threshold: avgDurationDays >= 3.0 & count >= 2).
   * - SOURCING_GAP: Derived from sourcing_searches & sourced_candidates match scores (threshold: candidates >= 2 & avgMatchScore < 65%).
   * - CANDIDATE_NEXT_STEP: Derived from candidate_evaluations & job_applications (threshold: score >= 80 or STRONG_HIRE, in INTERVIEW stage).
   * - SALARY_BENCHMARK: Explicitly unsupported (no authentic compensation dataset; returns 0 recommendations).
   * Returns empty array if no criteria met.
   */
  static async generateAndSyncRecommendations(
    client: SupabaseClient,
    organizationId: string
  ): Promise<AIRecommendation[]> {
    // 1. Fetch existing pending recommendations to prevent duplicates
    const { data: existingRecs, error: checkErr } = await client
      .from('hiring_ai_recommendations')
      .select('id, recommendation_type, requisition_id, title, description, status')
      .eq('organization_id', organizationId)
      .eq('status', 'PENDING')

    if (checkErr) {
      throw new Error(`Database error checking pending recommendations: ${checkErr.message}`)
    }

    const pending = existingRecs || []
    const toInsert: Array<{
      organization_id: string
      requisition_id?: string | null
      recommendation_type: 'BOTTLENECK' | 'SOURCING_GAP' | 'CANDIDATE_NEXT_STEP'
      title: string
      description: string
      impact_score: number
      status: 'PENDING'
      model_name: string
      model_version: string
    }> = []

    // ----------------------------------------------------
    // Category 1: BOTTLENECK
    // ----------------------------------------------------
    const funnelMetrics = await this.getFunnelMetrics(client, organizationId)
    for (const stage of funnelMetrics.stages) {
      if (stage.count >= 2 && stage.avgDurationDays >= 3.0) {
        const title = `High Duration Bottleneck in ${stage.label} Stage`
        const alreadyExists = pending.some(
          r => r.recommendation_type === 'BOTTLENECK' && r.title.includes(stage.label)
        )
        if (!alreadyExists) {
          const impactScore = Math.min(99, Math.round(50 + (stage.avgDurationDays * 10)))
          toInsert.push({
            organization_id: organizationId,
            requisition_id: null,
            recommendation_type: 'BOTTLENECK',
            title,
            description: `Candidates spend an average of ${stage.avgDurationDays} days in the ${stage.label} stage (${stage.count} transitions recorded). Streamlining reviewer turnaround or automated screening could reduce time-to-hire.`,
            impact_score: impactScore,
            status: 'PENDING',
            model_name: 'attendx-funnel-analyzer-v1',
            model_version: '1.0',
          })
        }
      }
    }

    // ----------------------------------------------------
    // Category 2: SOURCING_GAP
    // ----------------------------------------------------
    const { data: searches } = await client
      .from('sourcing_searches')
      .select('id, requisition_id, requisition:job_requisitions!requisition_id(id, title)')
      .eq('organization_id', organizationId)

    if (searches && searches.length > 0) {
      const distinctReqIds = Array.from(new Set(searches.map(s => s.requisition_id).filter(Boolean))) as string[]

      for (const reqId of distinctReqIds) {
        const { data: candidates } = await client
          .from('sourced_candidates')
          .select('id, match_score')
          .eq('organization_id', organizationId)
          .eq('requisition_id', reqId)

        if (candidates && candidates.length >= 2) {
          const validScores = candidates.map(c => Number(c.match_score) || 0)
          const avgScore = validScores.reduce((a, b) => a + b, 0) / validScores.length

          if (avgScore < 65) {
            const reqSearch = searches.find(s => s.requisition_id === reqId)
            const reqTitle = (reqSearch?.requisition as any)?.title || 'Open Requisition'
            const alreadyExists = pending.some(
              r => r.recommendation_type === 'SOURCING_GAP' && r.requisition_id === reqId
            )
            if (!alreadyExists) {
              const impactScore = Math.max(50, Math.min(95, Math.round(100 - avgScore)))
              toInsert.push({
                organization_id: organizationId,
                requisition_id: reqId,
                recommendation_type: 'SOURCING_GAP',
                title: `Low Sourcing Match Relevance for ${reqTitle}`,
                description: `Average match score across ${candidates.length} sourced candidate(s) for "${reqTitle}" is ${Math.round(avgScore)}% (target ≥ 65%). Consider broadening search filters or refining required skill criteria.`,
                impact_score: impactScore,
                status: 'PENDING',
                model_name: 'attendx-sourcing-gap-engine-v1',
                model_version: '1.0',
              })
            }
          }
        }
      }
    }

    // ----------------------------------------------------
    // Category 3: CANDIDATE_NEXT_STEP
    // ----------------------------------------------------
    const { data: evaluations } = await client
      .from('candidate_evaluations')
      .select(`
        id,
        overall_score,
        recommendation,
        application_id,
        candidate:candidates!candidate_id(id, first_name, last_name),
        application:job_applications!application_id(id, stage, requisition_id, requisition:job_requisitions!requisition_id(id, title))
      `)
      .eq('organization_id', organizationId)

    if (evaluations && evaluations.length > 0) {
      for (const ev of evaluations) {
        const score = Number(ev.overall_score) || 0
        const rec = ev.recommendation || ''
        const app = ev.application as any
        const cand = ev.candidate as any

        if ((score >= 80 || rec === 'STRONG_HIRE') && app?.stage === 'INTERVIEW' && cand) {
          const candName = `${cand.first_name || ''} ${cand.last_name || ''}`.trim() || 'Candidate'
          const reqTitle = app.requisition?.title || 'Position'
          const reqId = app.requisition_id

          const alreadyExists = pending.some(
            r => r.recommendation_type === 'CANDIDATE_NEXT_STEP' &&
                 (r.description?.includes(candName) || r.title?.includes(candName))
          )

          if (!alreadyExists) {
            const impactScore = Math.min(99, Math.round(score > 0 ? score : 85))
            toInsert.push({
              organization_id: organizationId,
              requisition_id: reqId || null,
              recommendation_type: 'CANDIDATE_NEXT_STEP',
              title: `Advance ${candName} for ${reqTitle}`,
              description: `${candName} achieved an overall score of ${Math.round(score)}% (${rec ? rec.replace('_', ' ') : 'Recommended'}) in evaluations for "${reqTitle}". Candidate is ready to be fast-tracked to offer or next round.`,
              impact_score: impactScore,
              status: 'PENDING',
              model_name: 'attendx-candidate-promotion-v1',
              model_version: '1.0',
            })
          }
        }
      }
    }

    // ----------------------------------------------------
    // Category 4: SALARY_BENCHMARK
    // Explicitly unsupported: No market compensation dataset in AttendX DB.
    // Zero rows generated (Zero Fabrication).
    // ----------------------------------------------------

    // Insert newly identified recommendations
    if (toInsert.length > 0) {
      const { error: insertErr } = await client
        .from('hiring_ai_recommendations')
        .insert(toInsert)
      if (insertErr) {
        throw new Error(`Database error inserting recommendations: ${insertErr.message}`)
      }
    }

    return this.getAIRecommendations(client, organizationId)
  }

  /**
   * Reviews an AI hiring recommendation (ACCEPT or REJECT) with authoritative caller identity and audit logging.
   * Fails closed with 404 if recommendation does not exist or belongs to another tenant.
   */
  static async reviewRecommendation(
    client: SupabaseClient,
    params: {
      organizationId: string
      recommendationId: string
      reviewerId: string
      status: 'ACCEPTED' | 'REJECTED' | 'PENDING'
      reviewNotes?: string | null
      ipAddress?: string | null
      userAgent?: string | null
    }
  ): Promise<AIRecommendation> {
    if (!['ACCEPTED', 'REJECTED', 'PENDING'].includes(params.status)) {
      const err: any = new Error('Invalid status. Allowed values: ACCEPTED, REJECTED, PENDING')
      err.status = 400
      throw err
    }

    // 1. Fetch current recommendation with strict tenant isolation
    const { data: existing, error: fetchErr } = await client
      .from('hiring_ai_recommendations')
      .select('id, organization_id, status, review_notes')
      .eq('id', params.recommendationId)
      .eq('organization_id', params.organizationId)
      .single()

    if (fetchErr || !existing) {
      const err: any = new Error('Recommendation not found')
      err.status = 404
      throw err
    }

    const oldStatus = existing.status
    const oldNotes = existing.review_notes
    const reviewedAt = new Date().toISOString()
    const updatedNotes = params.reviewNotes !== undefined ? params.reviewNotes : oldNotes

    // 2. Perform authoritative update
    const { data: updated, error: updateErr } = await client
      .from('hiring_ai_recommendations')
      .update({
        status: params.status,
        review_notes: updatedNotes,
        reviewed_by: params.reviewerId,
        reviewed_at: reviewedAt,
      })
      .eq('id', params.recommendationId)
      .eq('organization_id', params.organizationId)
      .select('*, requisition:job_requisitions!requisition_id(id, title)')
      .single()

    if (updateErr || !updated) {
      const err: any = new Error(updateErr?.message || 'Failed to update recommendation')
      err.status = 500
      throw err
    }

    // 3. Record audit log entry
    await HiringAuditLogger.logMutation(client, {
      organizationId: params.organizationId,
      userId: params.reviewerId,
      action: 'RECOMMENDATION_REVIEWED',
      entityType: 'HIRING_AI_RECOMMENDATION',
      entityId: params.recommendationId,
      oldValues: {
        status: oldStatus,
        review_notes: oldNotes,
      },
      newValues: {
        status: params.status,
        review_notes: updatedNotes,
        reviewed_by: params.reviewerId,
        reviewed_at: reviewedAt,
      },
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    })

    return updated as AIRecommendation
  }
}
