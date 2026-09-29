// ============================================================
// AttendX v2 — Hiring Module: Requisition Service
// Handles Requisitions CRUD, status workflow, skills, and cloning
// Tenant-scoped strictly by organization_id
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { HiringAuditLogger } from './audit-logger'
import type { JobRequisition, RequisitionStatus, RequisitionPriority, EmploymentType, DocumentMode } from '../../types/hiring'

export interface CreateRequisitionInput {
  requisition_code: string
  title: string
  department_id?: string | null
  designation_id?: string | null
  hiring_manager_id?: string | null
  recruiter_id?: string | null
  status?: RequisitionStatus
  priority?: RequisitionPriority
  openings_count?: number
  location?: string | null
  employment_type?: EmploymentType
  min_experience_years?: number | null
  max_experience_years?: number | null
  min_salary?: number | null
  max_salary?: number | null
  job_description?: string | null
  total_rounds?: number
  google_form_url?: string | null
  document_mode?: DocumentMode
  skills?: Array<{ skill_name: string; is_required?: boolean; weight?: number; min_experience_years?: number }>
}

export interface UpdateRequisitionInput extends Partial<CreateRequisitionInput> {
  filled_count?: number
}

export interface RequisitionFilterParams {
  status?: string
  department_id?: string
  priority?: string
  recruiter_id?: string
  search?: string
  page?: number
  limit?: number
}

export class RequisitionService {
  /**
   * List requisitions for an organization with optional filters & pagination
   */
  static async list(
    client: SupabaseClient,
    organizationId: string,
    filters: RequisitionFilterParams = {}
  ): Promise<{ data: JobRequisition[]; total: number; page: number; limit: number }> {
    const page = Math.max(Number(filters.page) || 1, 1)
    const limit = Math.min(Math.max(Number(filters.limit) || 20, 1), 100)
    const offset = (page - 1) * limit

    let query = client
      .from('job_requisitions')
      .select(`
        *,
        department:departments(id, name),
        designation:designations(id, name),
        skills:job_requisition_skills(*)
      `, { count: 'exact' })
      .eq('organization_id', organizationId)

    if (filters.status && filters.status !== 'ALL') {
      query = query.eq('status', filters.status)
    }
    if (filters.department_id) {
      query = query.eq('department_id', filters.department_id)
    }
    if (filters.priority) {
      query = query.eq('priority', filters.priority)
    }
    if (filters.recruiter_id) {
      query = query.eq('recruiter_id', filters.recruiter_id)
    }
    if (filters.search) {
      query = query.or(`title.ilike.%${filters.search}%,requisition_code.ilike.%${filters.search}%`)
    }

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1)

    const { data, count, error } = await query

    if (error) {
      throw new Error(`Failed to list requisitions: ${error.message}`)
    }

    return {
      data: (data || []) as JobRequisition[],
      total: count || 0,
      page,
      limit,
    }
  }

  /**
   * Get single requisition by ID within organization
   */
  static async getById(
    client: SupabaseClient,
    organizationId: string,
    id: string
  ): Promise<JobRequisition> {
    const { data, error } = await client
      .from('job_requisitions')
      .select(`
        *,
        department:departments(id, name),
        designation:designations(id, name),
        skills:job_requisition_skills(*)
      `)
      .eq('organization_id', organizationId)
      .eq('id', id)
      .single()

    if (error || !data) {
      const notFoundErr = new Error(`Requisition '${id}' not found`) as any
      notFoundErr.status = 404
      throw notFoundErr
    }

    return data as JobRequisition
  }

  /**
   * Create a new requisition with skills
   */
  static async create(
    client: SupabaseClient,
    organizationId: string,
    userId: string,
    input: CreateRequisitionInput,
    context?: { ip?: string; userAgent?: string }
  ): Promise<JobRequisition> {
    // 1. Insert requisition
    const { data: requisition, error } = await client
      .from('job_requisitions')
      .insert({
        organization_id: organizationId,
        requisition_code: input.requisition_code.trim().toUpperCase(),
        title: input.title.trim(),
        department_id: input.department_id || null,
        designation_id: input.designation_id || null,
        hiring_manager_id: input.hiring_manager_id || null,
        recruiter_id: input.recruiter_id || null,
        status: input.status || 'DRAFT',
        priority: input.priority || 'MEDIUM',
        openings_count: input.openings_count || 1,
        location: input.location || null,
        employment_type: input.employment_type || 'FULL_TIME',
        min_experience_years: input.min_experience_years || 0,
        max_experience_years: input.max_experience_years || 0,
        min_salary: input.min_salary || null,
        max_salary: input.max_salary || null,
        job_description: input.job_description || null,
        total_rounds: input.total_rounds || 3,
        google_form_url: input.google_form_url || null,
        document_mode: input.document_mode || 'NATIVE',
      })
      .select()
      .single()

    if (error || !requisition) {
      if (error?.code === '23505') {
        const conflictErr = new Error(`Requisition code '${input.requisition_code}' already exists for this organization.`) as any
        conflictErr.status = 409
        throw conflictErr
      }
      throw new Error(`Failed to create requisition: ${error?.message}`)
    }

    // 2. Insert skills if specified
    if (input.skills && input.skills.length > 0) {
      const skillsToInsert = input.skills.map(s => ({
        organization_id: organizationId,
        requisition_id: requisition.id,
        skill_name: s.skill_name.trim(),
        is_required: s.is_required !== false,
        weight: s.weight || 1,
        min_experience_years: s.min_experience_years || 0,
      }))
      await client.from('job_requisition_skills').insert(skillsToInsert)
    }

    // 3. Log audit event
    await HiringAuditLogger.logMutation(client, {
      organizationId,
      userId,
      action: 'CREATE',
      entityType: 'REQUISITION',
      entityId: requisition.id,
      newValues: requisition as unknown as Record<string, unknown>,
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
    })

    return this.getById(client, organizationId, requisition.id)
  }

  /**
   * Update an existing requisition
   */
  static async update(
    client: SupabaseClient,
    organizationId: string,
    id: string,
    userId: string,
    input: UpdateRequisitionInput,
    context?: { ip?: string; userAgent?: string }
  ): Promise<JobRequisition> {
    const existing = await this.getById(client, organizationId, id)

    const updatePayload: Record<string, any> = {}
    if (input.title !== undefined) updatePayload.title = input.title.trim()
    if (input.status !== undefined) updatePayload.status = input.status
    if (input.priority !== undefined) updatePayload.priority = input.priority
    if (input.openings_count !== undefined) updatePayload.openings_count = input.openings_count
    if (input.filled_count !== undefined) updatePayload.filled_count = input.filled_count
    if (input.location !== undefined) updatePayload.location = input.location
    if (input.employment_type !== undefined) updatePayload.employment_type = input.employment_type
    if (input.department_id !== undefined) updatePayload.department_id = input.department_id
    if (input.designation_id !== undefined) updatePayload.designation_id = input.designation_id
    if (input.hiring_manager_id !== undefined) updatePayload.hiring_manager_id = input.hiring_manager_id
    if (input.recruiter_id !== undefined) updatePayload.recruiter_id = input.recruiter_id
    if (input.min_experience_years !== undefined) updatePayload.min_experience_years = input.min_experience_years
    if (input.max_experience_years !== undefined) updatePayload.max_experience_years = input.max_experience_years
    if (input.min_salary !== undefined) updatePayload.min_salary = input.min_salary
    if (input.max_salary !== undefined) updatePayload.max_salary = input.max_salary
    if (input.job_description !== undefined) updatePayload.job_description = input.job_description
    if (input.total_rounds !== undefined) updatePayload.total_rounds = input.total_rounds
    if (input.google_form_url !== undefined) updatePayload.google_form_url = input.google_form_url
    if (input.document_mode !== undefined) updatePayload.document_mode = input.document_mode

    const { data: updated, error } = await client
      .from('job_requisitions')
      .update(updatePayload)
      .eq('organization_id', organizationId)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to update requisition: ${error.message}`)
    }

    await HiringAuditLogger.logMutation(client, {
      organizationId,
      userId,
      action: 'UPDATE',
      entityType: 'REQUISITION',
      entityId: id,
      oldValues: existing as unknown as Record<string, unknown>,
      newValues: updated as unknown as Record<string, unknown>,
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
    })

    return this.getById(client, organizationId, id)
  }

  /**
   * Clone a requisition into DRAFT status
   */
  static async clone(
    client: SupabaseClient,
    organizationId: string,
    id: string,
    userId: string,
    context?: { ip?: string; userAgent?: string }
  ): Promise<JobRequisition> {
    const original = await this.getById(client, organizationId, id)

    // Generate unique cloned code
    const randomSuffix = Math.floor(100 + Math.random() * 900)
    const clonedCode = `${original.requisition_code}-COPY-${randomSuffix}`

    return this.create(
      client,
      organizationId,
      userId,
      {
        requisition_code: clonedCode,
        title: `${original.title} (Clone)`,
        department_id: original.department_id,
        designation_id: original.designation_id,
        hiring_manager_id: original.hiring_manager_id,
        recruiter_id: original.recruiter_id,
        status: 'DRAFT',
        priority: original.priority,
        openings_count: original.openings_count,
        location: original.location,
        employment_type: original.employment_type,
        min_experience_years: original.min_experience_years,
        max_experience_years: original.max_experience_years,
        min_salary: original.min_salary,
        max_salary: original.max_salary,
        job_description: original.job_description,
        total_rounds: original.total_rounds,
        document_mode: original.document_mode,
        skills: (original.skills || []).map(s => ({
          skill_name: s.skill_name,
          is_required: s.is_required,
          weight: s.weight,
          min_experience_years: s.min_experience_years ?? undefined,
        })),
      },
      context
    )
  }

  /**
   * Add a skill to a requisition
   */
  static async addSkill(
    client: SupabaseClient,
    organizationId: string,
    requisitionId: string,
    skillName: string,
    weight: number = 1,
    isRequired: boolean = true,
    minExperienceYears: number = 0
  ) {
    const { data, error } = await client
      .from('job_requisition_skills')
      .insert({
        organization_id: organizationId,
        requisition_id: requisitionId,
        skill_name: skillName.trim(),
        weight,
        is_required: isRequired,
        min_experience_years: minExperienceYears,
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to add requisition skill: ${error.message}`)
    }
    return data
  }

  /**
   * Remove a skill from a requisition
   */
  static async removeSkill(
    client: SupabaseClient,
    organizationId: string,
    requisitionId: string,
    skillId: string
  ) {
    const { error } = await client
      .from('job_requisition_skills')
      .delete()
      .eq('organization_id', organizationId)
      .eq('requisition_id', requisitionId)
      .eq('id', skillId)

    if (error) {
      throw new Error(`Failed to delete requisition skill: ${error.message}`)
    }
    return { success: true }
  }
}
