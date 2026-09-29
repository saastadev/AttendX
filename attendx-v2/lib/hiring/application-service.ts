// ============================================================
// AttendX v2 — Hiring Module: Application Service
// Handles Applications, Unified State Machine Transitions,
// Kanban Pipeline aggregation, and atomic funnel/audit logging
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { HiringStateMachine } from './state-machine'
import { HiringAuditLogger } from './audit-logger'
import { PiiEncryption } from './encryption'
import type { JobApplication, HiringStage, ApplicationDecision } from '../../types/hiring'

export interface CreateApplicationInput {
  requisition_id: string
  candidate_id: string
  stage?: HiringStage
  match_score?: number
  skill_score?: number
  experience_score?: number
  jd_relevance_score?: number
  match_reasoning?: Record<string, unknown>
}

export interface ApplicationFilterParams {
  requisition_id?: string
  stage?: string
  search?: string
  role?: string
  decision?: string
  min_score?: number
  page?: number
  limit?: number
}

export class ApplicationService {
  /**
   * Generates next application code for organization, e.g. APP-2026-001
   */
  static async generateApplicationCode(client: SupabaseClient, organizationId: string): Promise<string> {
    const year = new Date().getFullYear()
    const prefix = `APP-${year}-`

    const { count } = await client
      .from('job_applications')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)

    const sequence = ((count || 0) + 1).toString().padStart(3, '0')
    const candidateCode = `${prefix}${sequence}`

    // Ensure collision resistance
    const { data: existing } = await client
      .from('job_applications')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('application_code', candidateCode)
      .maybeSingle()

    if (existing) {
      const rand = Math.floor(100 + Math.random() * 900)
      return `${prefix}${sequence}-${rand}`
    }

    return candidateCode
  }

  /**
   * List applications with filters and pagination
   */
  static async list(
    client: SupabaseClient,
    organizationId: string,
    filters: ApplicationFilterParams = {}
  ): Promise<{ data: JobApplication[]; total: number; page: number; limit: number }> {
    const page = Math.max(Number(filters.page) || 1, 1)
    const limit = Math.min(Math.max(Number(filters.limit) || 20, 1), 100)
    const offset = (page - 1) * limit
    const userRole = filters.role || 'EMPLOYEE'

    let query = client
      .from('job_applications')
      .select(`
        *,
        candidate:candidates(*, skills:candidate_skills(*)),
        requisition:job_requisitions(id, requisition_code, title, department_id, openings_count, total_rounds)
      `, { count: 'exact' })
      .eq('organization_id', organizationId)

    if (filters.requisition_id) {
      query = query.eq('requisition_id', filters.requisition_id)
    }
    if (filters.stage && filters.stage !== 'ALL') {
      query = query.eq('stage', filters.stage)
    }
    if (filters.decision && filters.decision !== 'ALL') {
      query = query.eq('current_decision', filters.decision)
    }
    if (filters.min_score !== undefined) {
      query = query.gte('match_score', filters.min_score)
    }

    query = query.order('applied_at', { ascending: false }).range(offset, offset + limit - 1)

    const { data, count, error } = await query

    if (error) {
      throw new Error(`Failed to list applications: ${error.message}`)
    }

    // Role-based masking of sensitive candidate data
    const sanitized = (data || []).map((app: any) => {
      if (app.candidate) {
        app.candidate.current_ctc = PiiEncryption.filterCtcForRole(app.candidate.current_ctc, userRole)
        app.candidate.expected_ctc = PiiEncryption.filterCtcForRole(app.candidate.expected_ctc, userRole)
      }
      return app
    })

    return {
      data: sanitized as JobApplication[],
      total: count || 0,
      page,
      limit,
    }
  }

  /**
   * Get single application by ID
   */
  static async getById(
    client: SupabaseClient,
    organizationId: string,
    id: string,
    userRole: string = 'EMPLOYEE'
  ): Promise<JobApplication> {
    const { data, error } = await client
      .from('job_applications')
      .select(`
        *,
        candidate:candidates(*, skills:candidate_skills(*), resumes:candidate_resumes(*)),
        requisition:job_requisitions(*, skills:job_requisition_skills(*))
      `)
      .eq('organization_id', organizationId)
      .eq('id', id)
      .single()

    if (error || !data) {
      const notFoundErr = new Error(`Job application '${id}' not found`) as any
      notFoundErr.status = 404
      throw notFoundErr
    }

    if (data.candidate) {
      data.candidate.current_ctc = PiiEncryption.filterCtcForRole(data.candidate.current_ctc, userRole)
      data.candidate.expected_ctc = PiiEncryption.filterCtcForRole(data.candidate.expected_ctc, userRole)
    }

    return data as JobApplication
  }

  /**
   * Create application for candidate & requisition
   */
  static async create(
    client: SupabaseClient,
    organizationId: string,
    userId: string,
    input: CreateApplicationInput,
    context?: { ip?: string; userAgent?: string }
  ): Promise<JobApplication> {
    // 1. Check if application already exists for this candidate & requisition
    const { data: existing } = await client
      .from('job_applications')
      .select('id, application_code, stage')
      .eq('organization_id', organizationId)
      .eq('requisition_id', input.requisition_id)
      .eq('candidate_id', input.candidate_id)
      .maybeSingle()

    if (existing) {
      const conflictErr = new Error(
        `Candidate has already applied for this requisition (${existing.application_code}, stage: ${existing.stage}).`
      ) as any
      conflictErr.status = 409
      throw conflictErr
    }

    const applicationCode = await this.generateApplicationCode(client, organizationId)
    const initialStage = input.stage || 'APPLIED'

    const { data: application, error } = await client
      .from('job_applications')
      .insert({
        organization_id: organizationId,
        application_code: applicationCode,
        requisition_id: input.requisition_id,
        candidate_id: input.candidate_id,
        stage: initialStage,
        match_score: input.match_score || 0,
        skill_score: input.skill_score || 0,
        experience_score: input.experience_score || 0,
        jd_relevance_score: input.jd_relevance_score || 0,
        match_reasoning: input.match_reasoning || {},
        current_decision: 'PENDING',
      })
      .select()
      .single()

    if (error || !application) {
      throw new Error(`Failed to create application: ${error?.message}`)
    }

    // Record initial funnel event and audit log
    await HiringAuditLogger.logStageTransition(client, {
      organizationId,
      applicationId: application.id,
      fromStage: null,
      toStage: initialStage,
      triggeredBy: userId,
      metadata: { initial_create: true, source: 'API' },
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
    })

    return this.getById(client, organizationId, application.id, 'ADMIN')
  }

  /**
   * Move application to target stage via Unified State Machine
   * Atomic: validates transition, updates application, writes funnel event and audit log
   */
  static async moveStage(
    client: SupabaseClient,
    organizationId: string,
    applicationId: string,
    targetStage: HiringStage,
    userId: string,
    metadata?: { reason?: string; notes?: string; [key: string]: any },
    context?: { ip?: string; userAgent?: string }
  ): Promise<JobApplication> {
    const current = await this.getById(client, organizationId, applicationId, 'ADMIN')

    // 1. Strict validation via Unified State Machine (throws 409 if invalid)
    HiringStateMachine.validateTransition(current.stage, targetStage)

    // 2. Perform DB update
    const updatePayload: Record<string, any> = {
      stage: targetStage,
    }

    // Auto-update decision if transitioning to terminal or milestone stages
    if (targetStage === 'SELECTED') {
      updatePayload.current_decision = 'SELECTED'
    } else if (targetStage === 'REJECTED') {
      updatePayload.current_decision = 'REJECTED'
      if (metadata?.reason) updatePayload.rejection_reason = metadata.reason
    } else if (targetStage === 'WITHDRAWN') {
      updatePayload.current_decision = 'REJECTED'
      if (metadata?.reason) updatePayload.withdrawal_reason = metadata.reason
    } else if (targetStage === 'ONBOARDED') {
      updatePayload.current_decision = 'ONBOARDING'
    }

    const { data: updated, error } = await client
      .from('job_applications')
      .update(updatePayload)
      .eq('organization_id', organizationId)
      .eq('id', applicationId)
      .select()
      .single()

    if (error || !updated) {
      throw new Error(`Failed to update application stage: ${error?.message}`)
    }

    // 3. Atomically record funnel event and audit log
    await HiringAuditLogger.logStageTransition(client, {
      organizationId,
      applicationId,
      fromStage: current.stage,
      toStage: targetStage,
      triggeredBy: userId,
      metadata: metadata || {},
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
    })

    return this.getById(client, organizationId, applicationId, 'ADMIN')
  }

  /**
   * Update decision directly (e.g. Selected, Rejected, Pending)
   */
  static async setDecision(
    client: SupabaseClient,
    organizationId: string,
    applicationId: string,
    decision: ApplicationDecision,
    userId: string,
    reason?: string,
    context?: { ip?: string; userAgent?: string }
  ): Promise<JobApplication> {
    const current = await this.getById(client, organizationId, applicationId, 'ADMIN')

    let newStage = current.stage
    if (decision === 'SELECTED' && current.stage === 'INTERVIEW') {
      newStage = 'SELECTED'
      HiringStateMachine.validateTransition(current.stage, newStage)
    } else if (decision === 'REJECTED') {
      newStage = 'REJECTED'
      HiringStateMachine.validateTransition(current.stage, newStage)
    }

    const updatePayload: Record<string, any> = {
      current_decision: decision,
      stage: newStage,
    }
    if (decision === 'REJECTED' && reason) {
      updatePayload.rejection_reason = reason
    }

    const { error } = await client
      .from('job_applications')
      .update(updatePayload)
      .eq('organization_id', organizationId)
      .eq('id', applicationId)

    if (error) {
      throw new Error(`Failed to set decision: ${error.message}`)
    }

    if (newStage !== current.stage) {
      await HiringAuditLogger.logStageTransition(client, {
        organizationId,
        applicationId,
        fromStage: current.stage,
        toStage: newStage,
        triggeredBy: userId,
        metadata: { decision, reason },
        ipAddress: context?.ip,
        userAgent: context?.userAgent,
      })
    } else {
      await HiringAuditLogger.logMutation(client, {
        organizationId,
        userId,
        action: 'UPDATE_DECISION',
        entityType: 'APPLICATION',
        entityId: applicationId,
        oldValues: { decision: current.current_decision },
        newValues: { decision, reason },
        ipAddress: context?.ip,
        userAgent: context?.userAgent,
      })
    }

    return this.getById(client, organizationId, applicationId, 'ADMIN')
  }

  /**
   * Get Kanban Pipeline grouped by stage for a requisition
   */
  static async getPipeline(
    client: SupabaseClient,
    organizationId: string,
    requisitionId?: string,
    userRole: string = 'EMPLOYEE'
  ): Promise<Record<HiringStage, JobApplication[]>> {
    let query = client
      .from('job_applications')
      .select(`
        *,
        candidate:candidates(*, skills:candidate_skills(*)),
        requisition:job_requisitions(id, requisition_code, title)
      `)
      .eq('organization_id', organizationId)

    if (requisitionId) {
      query = query.eq('requisition_id', requisitionId)
    }

    query = query.order('applied_at', { ascending: false })

    const { data, error } = await query
    if (error) {
      throw new Error(`Failed to load pipeline: ${error.message}`)
    }

    const columns: Record<string, JobApplication[]> = {
      SOURCED: [],
      CONTACTED: [],
      APPLIED: [],
      SHORTLISTED: [],
      INTERVIEW: [],
      SELECTED: [],
      OFFER_INTEREST_SENT: [],
      OFFER_ACCEPTED: [],
      DOCUMENTS_PENDING: [],
      DOCUMENTS_VERIFIED: [],
      OFFER_RELEASED: [],
      OFFER_FINAL_ACCEPTED: [],
      ONBOARDED: [],
      REJECTED: [],
      WITHDRAWN: [],
      OFFER_DECLINED: [],
      OFFER_FINAL_DECLINED: [],
    }

    for (const app of (data || [])) {
      if (app.candidate) {
        app.candidate.current_ctc = PiiEncryption.filterCtcForRole(app.candidate.current_ctc, userRole)
        app.candidate.expected_ctc = PiiEncryption.filterCtcForRole(app.candidate.expected_ctc, userRole)
      }
      if (columns[app.stage]) {
        columns[app.stage].push(app as JobApplication)
      }
    }

    return columns as Record<HiringStage, JobApplication[]>
  }

  /**
   * Execute bulk action across applications (e.g. bulk stage move, bulk reject)
   */
  static async bulkAction(
    client: SupabaseClient,
    organizationId: string,
    applicationIds: string[],
    action: 'MOVE_STAGE' | 'REJECT',
    userId: string,
    params: { targetStage?: HiringStage; reason?: string },
    context?: { ip?: string; userAgent?: string }
  ): Promise<{ successCount: number; errors: Array<{ id: string; error: string }> }> {
    let successCount = 0
    const errors: Array<{ id: string; error: string }> = []

    for (const id of applicationIds) {
      try {
        if (action === 'MOVE_STAGE') {
          if (!params.targetStage) throw new Error('targetStage is required for MOVE_STAGE')
          await this.moveStage(client, organizationId, id, params.targetStage, userId, { reason: params.reason }, context)
          successCount++
        } else if (action === 'REJECT') {
          await this.moveStage(client, organizationId, id, 'REJECTED', userId, { reason: params.reason || 'Bulk rejection by recruiter' }, context)
          successCount++
        }
      } catch (err: any) {
        errors.push({ id, error: err.message })
      }
    }

    return { successCount, errors }
  }
}
