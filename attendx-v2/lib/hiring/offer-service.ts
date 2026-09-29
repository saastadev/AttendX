// ============================================================
// AttendX v2 — Offer Service & Portal Token Management
// Handles:
// - Job offer creation and total CTC calculation
// - Secure single-use 7-day token generation for Candidate Portal
// - Candidate offer acceptance & e-acknowledgment tracking
// - Stage transition: SELECTED -> OFFER_RELEASED -> OFFER_FINAL_ACCEPTED
// - Auto-initialization of Onboarding Process & Tasks upon acceptance
// ============================================================

import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { HiringStateMachine } from './state-machine'
import { HiringAuditLogger } from './audit-logger'
import { EmailProviderFactory } from './email-provider'
import { TemplateEngine } from './template-engine'
import type { UserRole } from '@/types/database'

export interface CreateOfferInput {
  application_id: string
  candidate_id: string
  designation: string
  department_id?: string
  fixed_salary: number
  variable_salary?: number
  bonus?: number
  work_location?: string
  work_mode?: 'REMOTE' | 'ONSITE' | 'HYBRID'
  reporting_manager_id?: string
  joining_date: string
  probation_months?: number
  benefits?: string[]
  terms_and_conditions?: string
}

export interface CandidateResponseInput {
  token: string
  decision: 'ACCEPT' | 'DECLINE'
  decline_reason?: string
  e_ack_name?: string
  ip_address?: string
  user_agent?: string
}

export class OfferService {
  /**
   * Hashes a raw token using SHA-256 for secure DB storage.
   */
  static hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex')
  }

  /**
   * Generates a cryptographically random portal token (raw string + SHA-256 hash).
   */
  static generatePortalToken(): { rawToken: string; tokenHash: string } {
    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = this.hashToken(rawToken)
    return { rawToken, tokenHash }
  }

  /**
   * Generates an authoritative offer number formatted as OFF-YYYYMM-XXXX
   */
  static generateOfferNumber(): string {
    const d = new Date()
    const yyyymm = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
    const rand = Math.floor(1000 + Math.random() * 9000)
    return `OFF-${yyyymm}-${rand}`
  }

  /**
   * Create a job offer record in DRAFT or PENDING_APPROVAL status.
   */
  static async createOffer(
    client: SupabaseClient,
    organizationId: string,
    callerId: string,
    input: CreateOfferInput
  ) {
    const fixed = Number(input.fixed_salary) || 0
    const variable = Number(input.variable_salary) || 0
    const bonus = Number(input.bonus) || 0
    const totalCtc = fixed + variable + bonus

    const offerNumber = this.generateOfferNumber()

    const { data: offer, error } = await client
      .from('job_offers')
      .insert({
        organization_id: organizationId,
        application_id: input.application_id,
        candidate_id: input.candidate_id,
        offer_number: offerNumber,
        designation: input.designation,
        department_id: input.department_id || null,
        fixed_salary: fixed,
        variable_salary: variable,
        bonus: bonus,
        total_ctc: totalCtc,
        work_location: input.work_location || 'Headquarters',
        work_mode: input.work_mode || 'HYBRID',
        reporting_manager_id: input.reporting_manager_id || null,
        joining_date: input.joining_date,
        probation_months: input.probation_months ?? 3,
        benefits: input.benefits || [],
        terms_and_conditions: input.terms_and_conditions || 'Standard company employment terms apply.',
        approval_status: 'APPROVED',
        status: 'DRAFT',
      })
      .select()
      .single()

    if (error) throw error

    await HiringAuditLogger.log(client, {
      organization_id: organizationId,
      user_id: callerId,
      action: 'OFFER_CREATED',
      entity_type: 'job_offers',
      entity_id: offer.id,
      new_values: { offer_number: offerNumber, total_ctc: totalCtc, designation: input.designation },
    })

    return offer
  }

  /**
   * Release an offer: generates 7-day candidate portal link, transitions application to OFFER_RELEASED,
   * and emails candidate their portal access link.
   */
  static async releaseOffer(
    client: SupabaseClient,
    organizationId: string,
    callerId: string,
    callerRole: UserRole,
    offerId: string,
    portalBaseUrl: string = 'http://localhost:3000',
    ip?: string,
    userAgent?: string
  ) {
    const { data: offer, error: fetchErr } = await client
      .from('job_offers')
      .select('*, candidate:candidates!candidate_id(id, full_name, email, phone), application:job_applications!application_id(id, stage, application_code)')
      .eq('id', offerId)
      .eq('organization_id', organizationId)
      .single()

    if (fetchErr || !offer) throw new Error('Offer not found')

    // 1. Generate single-use 7-day portal token
    const { rawToken, tokenHash } = this.generatePortalToken()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const { error: tokenErr } = await client
      .from('offer_portal_tokens')
      .insert({
        organization_id: organizationId,
        application_id: offer.application_id,
        token_hash: tokenHash,
        purpose: 'FINAL_OFFER',
        expires_at: expiresAt,
        ip_address: ip,
        user_agent: userAgent,
      })

    if (tokenErr) throw tokenErr

    // 2. Mark offer status as SENT
    await client
      .from('job_offers')
      .update({
        status: 'SENT',
        sent_at: new Date().toISOString(),
      })
      .eq('id', offerId)

    // 3. Transition application state: SELECTED -> OFFER_RELEASED
    const currentStage = offer.application.stage
    const nextStage = HiringStateMachine.transition(currentStage, 'OFFER_RELEASED', callerRole)

    await client
      .from('job_applications')
      .update({ stage: nextStage })
      .eq('id', offer.application_id)

    // Funnel event
    await HiringAuditLogger.logFunnelEvent(client, {
      organization_id: organizationId,
      application_id: offer.application_id,
      from_stage: currentStage,
      to_stage: nextStage,
      triggered_by: callerId,
      metadata: { offer_id: offerId, offer_number: offer.offer_number },
    })

    // Audit log
    await HiringAuditLogger.log(client, {
      organization_id: organizationId,
      user_id: callerId,
      action: 'OFFER_RELEASED',
      entity_type: 'job_offers',
      entity_id: offerId,
      new_values: { status: 'SENT', stage: nextStage, expires_at: expiresAt },
      ip_address: ip,
      user_agent: userAgent,
    })

    // 4. Send notification email to candidate
    const portalUrl = `${portalBaseUrl}/offer-portal/${rawToken}`
    if (offer.candidate?.email) {
      const emailProvider = EmailProviderFactory.getProvider()
      const emailBody = TemplateEngine.render(
        'Dear {{candidate_name}},\n\nWe are delighted to extend an offer for the position of {{designation}} at AttendX!\n\nPlease review your formal offer letter and confirm your decision by visiting your secure candidate portal:\n{{portal_url}}\n\nThis secure link is valid for 7 days (until {{expires_at}}).\n\nWarm regards,\nTalent Acquisition Team',
        {
          candidate_name: offer.candidate.full_name,
          designation: offer.designation,
          portal_url: portalUrl,
          expires_at: new Date(expiresAt).toLocaleDateString(),
        }
      )

      await emailProvider.sendEmail({
        to: offer.candidate.email,
        subject: `Job Offer: ${offer.designation} at AttendX`,
        text: emailBody,
      })
    }

    return {
      offerId,
      status: 'SENT',
      portalUrl,
      rawToken,
      expiresAt,
    }
  }

  /**
   * Validates a candidate portal raw token.
   * Checks hash match, expiry, revocation, and use status.
   */
  static async validatePortalToken(client: SupabaseClient, rawToken: string) {
    if (!rawToken || rawToken.length < 16) {
      return { valid: false, error: 'Invalid token format' }
    }

    const tokenHash = this.hashToken(rawToken)

    const { data: tokenRecord, error } = await client
      .from('offer_portal_tokens')
      .select('*, application:job_applications!application_id(*, candidate:candidates!candidate_id(*), requisition:job_requisitions!requisition_id(*))')
      .eq('token_hash', tokenHash)
      .single()

    if (error || !tokenRecord) {
      return { valid: false, error: 'Offer link not found or has been replaced' }
    }

    if (tokenRecord.revoked_at) {
      return { valid: false, error: 'This offer link has been revoked. Please contact HR.' }
    }

    if (tokenRecord.used_at) {
      return { valid: false, error: 'This offer link has already been used.' }
    }

    const now = new Date()
    const expiresAt = new Date(tokenRecord.expires_at)
    if (now > expiresAt) {
      return { valid: false, error: 'This offer link has expired. Please contact HR for a new link.' }
    }

    // Retrieve active offer for this application
    const { data: offer } = await client
      .from('job_offers')
      .select('*')
      .eq('application_id', tokenRecord.application_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    return {
      valid: true,
      tokenRecord,
      offer,
      candidate: tokenRecord.application?.candidate,
      requisition: tokenRecord.application?.requisition,
      application: tokenRecord.application,
    }
  }

  /**
   * Candidate submits ACCEPT or DECLINE via portal.
   * - If ACCEPT: sets e_ack, marks offer ACCEPTED, transitions to OFFER_FINAL_ACCEPTED,
   *   initializes onboarding checklist and required document placeholders.
   * - If DECLINE: records decline_reason, transitions to OFFER_FINAL_DECLINED.
   */
  static async respondToOffer(
    client: SupabaseClient,
    input: CandidateResponseInput
  ) {
    const validation = await this.validatePortalToken(client, input.token)
    if (!validation.valid || !validation.tokenRecord || !validation.offer) {
      throw new Error(validation.error || 'Invalid or expired offer token')
    }

    const { tokenRecord, offer, application, candidate } = validation
    const orgId = tokenRecord.organization_id

    const nowIso = new Date().toISOString()

    if (input.decision === 'ACCEPT') {
      // 1. Mark token used
      await client
        .from('offer_portal_tokens')
        .update({
          used_at: nowIso,
          ip_address: input.ip_address,
          user_agent: input.user_agent,
        })
        .eq('id', tokenRecord.id)

      // 2. Mark offer accepted
      await client
        .from('job_offers')
        .update({
          status: 'ACCEPTED',
          accepted_at: nowIso,
          e_ack_name: input.e_ack_name || candidate.full_name,
          e_ack_timestamp: nowIso,
          e_ack_ip: input.ip_address || '127.0.0.1',
        })
        .eq('id', offer.id)

      // 3. Transition state machine: OFFER_RELEASED -> OFFER_FINAL_ACCEPTED
      const nextStage = HiringStateMachine.transition(application.stage, 'OFFER_FINAL_ACCEPTED', 'EMPLOYEE')
      await client
        .from('job_applications')
        .update({ stage: nextStage })
        .eq('id', application.id)

      await HiringAuditLogger.logFunnelEvent(client, {
        organization_id: orgId,
        application_id: application.id,
        from_stage: application.stage,
        to_stage: nextStage,
        metadata: { decision: 'ACCEPT', ack_name: input.e_ack_name },
      })

      // 4. Auto-initialize onboarding process
      const { data: onboarding } = await client
        .from('onboarding_processes')
        .insert({
          organization_id: orgId,
          application_id: application.id,
          candidate_id: candidate.id,
          offer_id: offer.id,
          status: 'IN_PROGRESS',
          completion_percentage: 10,
          target_completion_date: offer.joining_date,
        })
        .select()
        .single()

      if (onboarding) {
        // Seed default required documents
        const requiredDocs = [
          { type: 'ID_PROOF', name: 'Government Photo ID (Passport / Aadhaar / Driver License)' },
          { type: 'EDUCATION_CERTIFICATE', name: 'Highest Degree Certificate' },
          { type: 'PREVIOUS_EMPLOYMENT', name: 'Relieving / Experience Letter' },
          { type: 'SALARY_SLIP', name: 'Last 3 Months Salary Slips' },
          { type: 'BANK_DETAILS', name: 'Cancelled Cheque or Bank Passbook Copy' },
        ]

        for (const doc of requiredDocs) {
          await client.from('onboarding_documents').insert({
            organization_id: orgId,
            onboarding_id: onboarding.id,
            document_type: doc.type,
            document_name: doc.name,
            status: 'NOT_SUBMITTED',
            is_required: true,
          })
        }

        // Seed initial onboarding tasks
        const defaultTasks = [
          { category: 'HR', name: 'Background Verification Check', desc: 'Verify candidate educational and employment history.' },
          { category: 'IT', name: 'Provision Email & Workstation', desc: 'Setup company Google Workspace email and laptop dispatch.' },
          { category: 'ADMIN', name: 'Generate ID Card & Access Badge', desc: 'Create employee biometric access and corporate badge.' },
          { category: 'ORIENTATION', name: 'Welcome & Team Introduction', desc: 'Schedule 1:1 manager sync and team welcome meeting.' },
        ]

        for (const task of defaultTasks) {
          await client.from('onboarding_tasks').insert({
            organization_id: orgId,
            onboarding_id: onboarding.id,
            category: task.category,
            task_name: task.name,
            description: task.desc,
            status: 'PENDING',
          })
        }
      }

      await HiringAuditLogger.log(client, {
        organization_id: orgId,
        action: 'OFFER_ACCEPTED',
        entity_type: 'job_offers',
        entity_id: offer.id,
        new_values: { stage: nextStage, ack_name: input.e_ack_name },
        ip_address: input.ip_address,
        user_agent: input.user_agent,
      })

      return { success: true, decision: 'ACCEPT', nextStage }
    } else {
      // DECLINE
      await client
        .from('offer_portal_tokens')
        .update({
          used_at: nowIso,
          ip_address: input.ip_address,
          user_agent: input.user_agent,
        })
        .eq('id', tokenRecord.id)

      await client
        .from('job_offers')
        .update({
          status: 'DECLINED',
          declined_at: nowIso,
          decline_reason: input.decline_reason || 'Candidate declined offer terms.',
        })
        .eq('id', offer.id)

      const nextStage = HiringStateMachine.transition(application.stage, 'OFFER_FINAL_DECLINED', 'EMPLOYEE')
      await client
        .from('job_applications')
        .update({ stage: nextStage })
        .eq('id', application.id)

      await HiringAuditLogger.logFunnelEvent(client, {
        organization_id: orgId,
        application_id: application.id,
        from_stage: application.stage,
        to_stage: nextStage,
        metadata: { decision: 'DECLINE', reason: input.decline_reason },
      })

      return { success: true, decision: 'DECLINE', nextStage }
    }
  }
}
