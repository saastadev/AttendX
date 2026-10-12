// ============================================================
// AttendX v2 — Onboarding Service
// Handles:
// - Onboarding process tracking & completion percentage calculation
// - Document verification (Verify, Reject, Request Re-upload)
// - Onboarding tasks checklist (IT, HR, Admin, Orientation)
// - "Convert to Employee" CTA linking candidate to employees table
// - Stage transition to ONBOARDED with atomic audit & funnel logs
// ============================================================

import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { HiringStateMachine } from './state-machine.ts'
import { HiringAuditLogger } from './audit-logger.ts'
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

export interface JoiningReadinessDocument {
  id: string
  document_type: string
  document_name: string
  status: string
}

export interface JoiningReadinessTask {
  id: string
  task_name: string
  category: string
  status: string
}

export interface JoiningReadinessResult {
  ready: boolean
  total_required_documents: number
  verified_required_documents: number
  unverified_documents: JoiningReadinessDocument[]
  total_required_tasks: number
  completed_required_tasks: number
  incomplete_tasks: JoiningReadinessTask[]
  reasons: string[]
}

export class JoiningReadinessError extends Error {
  public readonly status = 400
  public readonly code = 'JOINING_READINESS_INCOMPLETE'
  public readonly readiness: JoiningReadinessResult

  constructor(message: string, readiness: JoiningReadinessResult) {
    super(message)
    this.name = 'JoiningReadinessError'
    this.readiness = readiness
  }
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
      .select('status, is_required')
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
        candidate:candidates!candidate_id(id, first_name, last_name, email, phone),
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
    const formatted = (data || []).map((item: any) => ({
      ...item,
      candidate: item.candidate ? {
        ...item.candidate,
        full_name: `${item.candidate.first_name || ''} ${item.candidate.last_name || ''}`.trim(),
      } : null,
    }))
    return formatted
  }

  /**
   * Get single onboarding details with documents, tasks, and joining readiness evaluation.
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

    const readiness = await this.getJoiningReadiness(client, organizationId, onboardingId)

    return {
      ...process,
      readiness,
    }
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
   * Authoritatively evaluates candidate joining readiness.
   * Enforces:
   * 1. Every required onboarding document exists and has status VERIFIED.
   * 2. Every required onboarding task has status COMPLETED.
   * 3. Optional documents (is_required: false) do NOT block conversion.
   * 4. Optional tasks (is_required: false) do NOT block conversion.
   * 5. Missing / unverified / rejected / submitted required documents block conversion.
   * 6. Pending / in-progress / skipped required tasks block conversion.
   */
  static async getJoiningReadiness(
    client: SupabaseClient,
    organizationId: string,
    onboardingId: string
  ): Promise<JoiningReadinessResult> {
    // 1. Fetch documents
    const { data: docs, error: docErr } = await client
      .from('onboarding_documents')
      .select('id, document_type, document_name, status, is_required')
      .eq('onboarding_id', onboardingId)
      .eq('organization_id', organizationId)

    if (docErr) throw docErr

    // 2. Fetch tasks
    const { data: tasks, error: taskErr } = await client
      .from('onboarding_tasks')
      .select('id, task_name, category, status, is_required')
      .eq('onboarding_id', onboardingId)
      .eq('organization_id', organizationId)

    if (taskErr) throw taskErr

    const docList = docs || []
    const taskList = tasks || []

    const requiredDocs = docList.filter(d => d.is_required !== false)
    const verifiedDocs = requiredDocs.filter(d => d.status === 'VERIFIED')
    const unverifiedDocs: JoiningReadinessDocument[] = requiredDocs
      .filter(d => d.status !== 'VERIFIED')
      .map(d => ({
        id: d.id,
        document_type: d.document_type,
        document_name: d.document_name,
        status: d.status,
      }))

    const requiredTasks = taskList.filter(t => t.is_required !== false)
    const completedTasks = requiredTasks.filter(t => t.status === 'COMPLETED')
    const incompleteTasks: JoiningReadinessTask[] = requiredTasks
      .filter(t => t.status !== 'COMPLETED')
      .map(t => ({
        id: t.id,
        task_name: t.task_name,
        category: t.category,
        status: t.status,
      }))

    if (requiredDocs.length === 0) {
      unverifiedDocs.push({
        id: 'missing-required-documents',
        document_type: 'REQUIRED',
        document_name: 'Required onboarding documents',
        status: 'MISSING',
      })
    }

    if (requiredTasks.length === 0) {
      incompleteTasks.push({
        id: 'missing-required-tasks',
        task_name: 'Required onboarding tasks',
        category: 'GENERAL',
        status: 'MISSING',
      })
    }

    const ready = unverifiedDocs.length === 0 && incompleteTasks.length === 0

    const reasons: string[] = []
    if (unverifiedDocs.length > 0) {
      reasons.push(`${unverifiedDocs.length} required document(s) are unverified or missing.`)
    }
    if (incompleteTasks.length > 0) {
      reasons.push(`${incompleteTasks.length} required onboarding task(s) are incomplete.`)
    }

    return {
      ready,
      total_required_documents: requiredDocs.length,
      verified_required_documents: verifiedDocs.length,
      unverified_documents: unverifiedDocs,
      total_required_tasks: requiredTasks.length,
      completed_required_tasks: completedTasks.length,
      incomplete_tasks: incompleteTasks,
      reasons,
    }
  }

  /**
   * "Convert to Employee" CTA:
   * - Enforces Server-Side Joining Readiness Guard.
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
      const err: any = new Error('Onboarding process not found')
      err.status = 404
      throw err
    }

    const { candidate, offer, application } = process
    const emailToUse = input.work_email || candidate?.email

    // Idempotency: If process is already COMPLETED and employee linked, return cleanly
    if (process.status === 'COMPLETED' && process.employee_id) {
      return {
        success: true,
        already_completed: true,
        onboardingId: process.id,
        stage: application?.stage || 'ONBOARDED',
        employeeId: process.employee_id,
        email: emailToUse,
      }
    }

    // Server-Side Joining Readiness Guard
    const readiness = await this.getJoiningReadiness(client, organizationId, input.onboarding_id)
    if (!readiness.ready) {
      throw new JoiningReadinessError(
        `Cannot convert candidate to employee: joining readiness criteria not met (${readiness.reasons.join(' ')}).`,
        readiness
      )
    }

    // 1. Transition state machine: DOCUMENTS_VERIFIED / OFFER_FINAL_ACCEPTED -> ONBOARDED
    const nextStage = HiringStateMachine.transition(application?.stage || 'DOCUMENTS_VERIFIED', 'ONBOARDED', callerRole)

    // 2. Check if employee already exists in profiles / employees table
    let employeeRecordId = process.employee_id

    if (!employeeRecordId && emailToUse) {
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
        // Try creating auth user via admin API if available
        if (client.auth?.admin?.createUser) {
          try {
            const securePassword = 'TempPassword' + Math.random().toString(36).slice(-8) + '!'
            const { data: newAuthUser } = await client.auth.admin.createUser({
              email: emailToUse.toLowerCase(),
              password: securePassword,
              email_confirm: true,
              app_metadata: {
                tenant_id: organizationId,
                role: input.role || 'EMPLOYEE',
              },
              user_metadata: {
                full_name: `${candidate?.first_name || ''} ${candidate?.last_name || ''}`.trim() || 'Employee',
              },
            })
            if (newAuthUser?.user?.id) {
              employeeRecordId = newAuthUser.user.id
            }
          } catch {
            // Service admin auth not available or user exists
          }
        }

        if (!employeeRecordId) {
          employeeRecordId = crypto.randomUUID()
        }

        // Create profile and user_roles records
        await client
          .from('profiles')
          .upsert({
            id: employeeRecordId,
            tenant_id: organizationId,
            email: emailToUse.toLowerCase(),
            full_name: `${candidate?.first_name || ''} ${candidate?.last_name || ''}`.trim() || 'Employee',
            phone: candidate?.phone || null,
            is_active: true,
            onboarding_completed: true,
          })

        await client
          .from('user_roles')
          .upsert({
            user_id: employeeRecordId,
            tenant_id: organizationId,
            role: input.role || 'EMPLOYEE',
          }, { onConflict: 'user_id,tenant_id' })
      }
    }

    if (employeeRecordId) {
      // Ensure employee record exists in employees table
      const { data: existingEmp } = await client
        .from('employees')
        .select('id')
        .eq('id', employeeRecordId)
        .maybeSingle()

      if (!existingEmp) {
        const empCode = 'EMP-' + Math.floor(10000 + Math.random() * 90000)
        await client
          .from('employees')
          .insert({
            id: employeeRecordId,
            tenant_id: organizationId,
            employee_code: empCode,
            department_id: input.department_id || null,
            join_date: input.joining_date || offer?.joining_date || new Date().toISOString().split('T')[0],
            employment_type: 'FULL_TIME',
            status: 'ACTIVE',
          })
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
      .eq('organization_id', organizationId)

    // 4. Update application stage
    if (application?.id) {
      await client
        .from('job_applications')
        .update({
          stage: nextStage,
          current_decision: 'ONBOARDING',
        })
        .eq('id', application.id)
        .eq('organization_id', organizationId)

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
    }

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
      readiness,
    }
  }
}
