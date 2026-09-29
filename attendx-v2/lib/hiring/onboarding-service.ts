// ============================================================
// AttendX v2 — Onboarding Service
// Handles:
// - Onboarding process tracking & completion percentage calculation
// - Document verification (Verify, Reject, Request Re-upload)
// - Onboarding tasks checklist (IT, HR, Admin, Orientation)
// - "Convert to Employee" CTA linking candidate to employees table
// - Stage transition to ONBOARDED with atomic audit & funnel logs
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { HiringStateMachine } from './state-machine'
import { HiringAuditLogger } from './audit-logger'
import type { UserRole } from '@/types/database'

export interface SubmitDocumentInput {
  onboarding_id: string
  document_type: 'ID_PROOF' | 'EDUCATION_CERTIFICATE' | 'PREVIOUS_EMPLOYMENT' | 'SALARY_SLIP' | 'BANK_DETAILS' | 'RESUME' | 'PHOTO'
  document_name: string
  file_url: string
  file_size?: number
  mime_type?: string
}

export interface ConvertEmployeeInput {
  onboarding_id: string
  work_email: string
  department_id?: string
  joining_date?: string
  job_title?: string
  role?: UserRole
}

export class OnboardingService {
  /**
   * Recalculates and updates the completion percentage of an onboarding process.
   */
  static async recalculateProgress(client: SupabaseClient, onboardingId: string): Promise<number> {
    const { data: docs } = await client
      .from('onboarding_documents')
      .select('status, is_required')
      .eq('onboarding_id', onboardingId)

    const { data: tasks } = await client
      .from('onboarding_tasks')
      .select('status')
      .eq('onboarding_id', onboardingId)

    const docList = docs || []
    const taskList = tasks || []

    const totalItems = docList.length + taskList.length
    if (totalItems === 0) return 0

    const verifiedDocs = docList.filter(d => d.status === 'VERIFIED').length
    const completedTasks = taskList.filter(t => t.status === 'COMPLETED').length

    const percentage = Math.round(((verifiedDocs + completedTasks) / totalItems) * 100)

    await client
      .from('onboarding_processes')
      .update({ completion_percentage: percentage })
      .eq('id', onboardingId)

    return percentage
  }

  /**
   * List onboarding processes with candidates and progress.
   */
  static async list(client: SupabaseClient, organizationId: string, filters?: { status?: string }) {
    let query = client
      .from('onboarding_processes')
      .select(`
        *,
        candidate:candidates!candidate_id(id, full_name, email, phone),
        offer:job_offers!offer_id(id, offer_number, designation, fixed_salary, total_ctc, joining_date, work_mode),
        application:job_applications!application_id(id, stage, application_code)
      `)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })

    if (filters?.status) {
      query = query.eq('status', filters.status)
    }

    const { data, error } = await query
    if (error) throw error
    return data || []
  }

  /**
   * Get single onboarding details with documents and tasks.
   */
  static async getById(client: SupabaseClient, organizationId: string, onboardingId: string) {
    const { data: process, error } = await client
      .from('onboarding_processes')
      .select(`
        *,
        candidate:candidates!candidate_id(*),
        offer:job_offers!offer_id(*),
        application:job_applications!application_id(*),
        documents:onboarding_documents(*),
        tasks:onboarding_tasks(*)
      `)
      .eq('id', onboardingId)
      .eq('organization_id', organizationId)
      .single()

    if (error) throw error
    return process
  }

  /**
   * Submit an onboarding document (candidate upload or HR manual upload).
   */
  static async submitDocument(
    client: SupabaseClient,
    organizationId: string,
    input: SubmitDocumentInput
  ) {
    // Check if placeholder exists for this document type
    const { data: existing } = await client
      .from('onboarding_documents')
      .select('id')
      .eq('onboarding_id', input.onboarding_id)
      .eq('document_type', input.document_type)
      .limit(1)
      .maybeSingle()

    let docResult
    if (existing) {
      const { data, error } = await client
        .from('onboarding_documents')
        .update({
          document_name: input.document_name,
          file_url: input.file_url,
          file_size: input.file_size || null,
          mime_type: input.mime_type || 'application/pdf',
          status: 'SUBMITTED',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single()
      if (error) throw error
      docResult = data
    } else {
      const { data, error } = await client
        .from('onboarding_documents')
        .insert({
          organization_id: organizationId,
          onboarding_id: input.onboarding_id,
          document_type: input.document_type,
          document_name: input.document_name,
          file_url: input.file_url,
          file_size: input.file_size || null,
          mime_type: input.mime_type || 'application/pdf',
          status: 'SUBMITTED',
          is_required: true,
        })
        .select()
        .single()
      if (error) throw error
      docResult = data
    }

    await this.recalculateProgress(client, input.onboarding_id)
    return docResult
  }

  /**
   * Verify or reject an onboarding document.
   */
  static async verifyDocument(
    client: SupabaseClient,
    organizationId: string,
    reviewerId: string,
    documentId: string,
    decision: 'VERIFY' | 'REJECT' | 'PENDING',
    comment?: string
  ) {
    const statusMap = {
      VERIFY: 'VERIFIED',
      REJECT: 'REJECTED',
      PENDING: 'PENDING',
    } as const

    const newStatus = statusMap[decision]

    const { data: doc, error } = await client
      .from('onboarding_documents')
      .update({
        status: newStatus,
        reviewer_comment: comment || null,
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', documentId)
      .eq('organization_id', organizationId)
      .select('*, onboarding:onboarding_processes!onboarding_id(id, application_id)')
      .single()

    if (error) throw error

    // Recalculate progress
    await this.recalculateProgress(client, doc.onboarding_id)

    // Check if all required documents are now verified
    const { data: allDocs } = await client
      .from('onboarding_documents')
      .select('status, is_required')
      .eq('onboarding_id', doc.onboarding_id)

    const allRequiredVerified = (allDocs || [])
      .filter(d => d.is_required)
      .every(d => d.status === 'VERIFIED')

    if (allRequiredVerified && doc.onboarding?.application_id) {
      await client
        .from('onboarding_processes')
        .update({ status: 'DOCUMENTS_VERIFIED' })
        .eq('id', doc.onboarding_id)

      // Transition application stage to DOCUMENTS_VERIFIED if not already
      const { data: app } = await client
        .from('job_applications')
        .select('stage')
        .eq('id', doc.onboarding.application_id)
        .single()

      if (app && app.stage !== 'DOCUMENTS_VERIFIED') {
        const nextStage = HiringStateMachine.transition(app.stage, 'DOCUMENTS_VERIFIED', 'HR')
        await client
          .from('job_applications')
          .update({ stage: nextStage })
          .eq('id', doc.onboarding.application_id)

        await HiringAuditLogger.logFunnelEvent(client, {
          organization_id: organizationId,
          application_id: doc.onboarding.application_id,
          from_stage: app.stage,
          to_stage: nextStage,
          triggered_by: reviewerId,
          metadata: { reason: 'All required onboarding documents verified' },
        })
      }
    }

    return doc
  }

  /**
   * Update task status (IT, HR, Admin, Orientation)
   */
  static async updateTask(
    client: SupabaseClient,
    organizationId: string,
    taskId: string,
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED',
    userId?: string
  ) {
    const updates: any = {
      status,
      updated_at: new Date().toISOString(),
    }
    if (status === 'COMPLETED') {
      updates.completed_at = new Date().toISOString()
      updates.completed_by = userId || null
    }

    const { data: task, error } = await client
      .from('onboarding_tasks')
      .update(updates)
      .eq('id', taskId)
      .eq('organization_id', organizationId)
      .select()
      .single()

    if (error) throw error

    await this.recalculateProgress(client, task.onboarding_id)
    return task
  }

  /**
   * "Convert to Employee" CTA:
   * - Atomically creates or connects an employee record in `employees` / `profiles`.
   * - Sets onboarding status to COMPLETED and completion percentage to 100%.
   * - Transitions application stage to ONBOARDED.
   * - Emits Funnel and Audit log entries.
   */
  static async convertToEmployee(
    client: SupabaseClient,
    organizationId: string,
    callerId: string,
    callerRole: UserRole,
    input: ConvertEmployeeInput,
    ip?: string,
    userAgent?: string
  ) {
    const { data: process, error: pErr } = await client
      .from('onboarding_processes')
      .select(`
        *,
        candidate:candidates!candidate_id(*),
        offer:job_offers!offer_id(*),
        application:job_applications!application_id(*)
      `)
      .eq('id', input.onboarding_id)
      .eq('organization_id', organizationId)
      .single()

    if (pErr || !process) {
      throw new Error('Onboarding process not found')
    }

    const { candidate, offer, application } = process

    // 1. Transition state machine: DOCUMENTS_VERIFIED -> ONBOARDED (or from current stage)
    const nextStage = HiringStateMachine.transition(application.stage, 'ONBOARDED', callerRole)

    // 2. Check if employee already exists in profiles / employees table
    const emailToUse = input.work_email || candidate.email
    let employeeRecordId = process.employee_id

    if (!employeeRecordId) {
      // Look up existing profile with email & tenant
      const { data: existingProfile } = await client
        .from('profiles')
        .select('id')
        .eq('tenant_id', organizationId)
        .eq('email', emailToUse.toLowerCase())
        .maybeSingle()

      if (existingProfile) {
        employeeRecordId = existingProfile.id
      } else {
        // Create an employee profile record
        const { data: newProfile, error: profErr } = await client
          .from('profiles')
          .insert({
            tenant_id: organizationId,
            email: emailToUse.toLowerCase(),
            full_name: candidate.full_name,
            phone: candidate.phone,
            role: input.role || 'EMPLOYEE',
          })
          .select('id')
          .maybeSingle()

        if (!profErr && newProfile) {
          employeeRecordId = newProfile.id
        }
      }
    }

    // 3. Mark onboarding process completed
    await client
      .from('onboarding_processes')
      .update({
        status: 'COMPLETED',
        completion_percentage: 100,
        employee_id: employeeRecordId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', process.id)

    // 4. Update application stage
    await client
      .from('job_applications')
      .update({
        stage: nextStage,
        current_decision: 'ONBOARDING',
      })
      .eq('id', application.id)

    // 5. Funnel event
    await HiringAuditLogger.logFunnelEvent(client, {
      organization_id: organizationId,
      application_id: application.id,
      from_stage: application.stage,
      to_stage: nextStage,
      triggered_by: callerId,
      metadata: {
        employee_id: employeeRecordId,
        work_email: emailToUse,
        joining_date: input.joining_date || offer?.joining_date,
      },
    })

    // 6. Audit log
    await HiringAuditLogger.log(client, {
      organization_id: organizationId,
      user_id: callerId,
      action: 'CONVERT_TO_EMPLOYEE',
      entity_type: 'onboarding_processes',
      entity_id: process.id,
      new_values: {
        stage: nextStage,
        employee_id: employeeRecordId,
        email: emailToUse,
      },
      ip_address: ip,
      user_agent: userAgent,
    })

    return {
      success: true,
      onboardingId: process.id,
      stage: nextStage,
      employeeId: employeeRecordId,
      email: emailToUse,
    }
  }
}
