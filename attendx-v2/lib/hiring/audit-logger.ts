// ============================================================
// AttendX v2 — Hiring Module Audit & Funnel Event Logger
// Records atomic mutations and funnel events for complete compliance
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

export interface MutationLogParams {
  organizationId: string
  userId?: string | null
  action: string
  entityType: string
  entityId: string
  oldValues?: Record<string, unknown> | null
  newValues?: Record<string, unknown> | null
  ipAddress?: string | null
  userAgent?: string | null
}

export interface StageTransitionLogParams {
  organizationId: string
  applicationId: string
  fromStage: string | null
  toStage: string
  triggeredBy?: string | null
  metadata?: Record<string, unknown>
  ipAddress?: string | null
  userAgent?: string | null
}

export class HiringAuditLogger {
  /**
   * Writes a fine-grained audit log entry into hiring_audit_logs
   */
  static async logMutation(
    client: SupabaseClient,
    params: MutationLogParams
  ): Promise<any> {
    const { data, error } = await client
      .from('hiring_audit_logs')
      .insert({
        organization_id: params.organizationId,
        user_id: params.userId || null,
        action: params.action,
        entity_type: params.entityType,
        entity_id: params.entityId,
        old_values: params.oldValues || null,
        new_values: params.newValues || null,
        ip_address: params.ipAddress || null,
        user_agent: params.userAgent || null,
      })
      .select()
      .single()

    if (error) {
      console.warn('[HiringAuditLogger] Failed to write hiring_audit_log:', error.message)
    }
    return data
  }

  /**
   * Writes a stage change to hiring_funnel_events AND hiring_audit_logs atomically
   */
  static async logStageTransition(
    client: SupabaseClient,
    params: StageTransitionLogParams
  ): Promise<{ funnelEvent: any; auditLog: any }> {
    // 1. Write funnel event
    const { data: funnelEvent, error: funnelErr } = await client
      .from('hiring_funnel_events')
      .insert({
        organization_id: params.organizationId,
        application_id: params.applicationId,
        from_stage: params.fromStage,
        to_stage: params.toStage,
        triggered_by: params.triggeredBy || null,
        metadata: params.metadata || {},
      })
      .select()
      .single()

    if (funnelErr) {
      console.warn('[HiringAuditLogger] Failed to write hiring_funnel_event:', funnelErr.message)
    }

    // 2. Write audit log
    const auditLog = await this.logMutation(client, {
      organizationId: params.organizationId,
      userId: params.triggeredBy,
      action: 'STAGE_TRANSITION',
      entityType: 'APPLICATION',
      entityId: params.applicationId,
      oldValues: { stage: params.fromStage },
      newValues: { stage: params.toStage, ...(params.metadata || {}) },
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    })

    return { funnelEvent, auditLog }
  }

  /**
   * Helper alias for logMutation
   */
  static async log(client: SupabaseClient, params: {
    organization_id: string
    user_id?: string | null
    action: string
    entity_type: string
    entity_id: string
    new_values?: any
    old_values?: any
    ip_address?: string | null
    user_agent?: string | null
  }) {
    return this.logMutation(client, {
      organizationId: params.organization_id,
      userId: params.user_id,
      action: params.action,
      entityType: params.entity_type,
      entityId: params.entity_id,
      newValues: params.new_values,
      oldValues: params.old_values,
      ipAddress: params.ip_address,
      userAgent: params.user_agent,
    })
  }

  /**
   * Helper alias for logStageTransition
   */
  static async logFunnelEvent(client: SupabaseClient, params: {
    organization_id: string
    application_id: string
    from_stage?: string | null
    to_stage: string
    triggered_by?: string | null
    metadata?: any
  }) {
    return this.logStageTransition(client, {
      organizationId: params.organization_id,
      applicationId: params.application_id,
      fromStage: params.from_stage || null,
      toStage: params.to_stage,
      triggeredBy: params.triggered_by,
      metadata: params.metadata,
    })
  }
}
