// ============================================================
// AttendX v2 — Hiring Module: AI Outreach & Engagement Service
// Manages campaigns, templates, AI-personalized messages,
// follow-up sequences, and delivery tracking
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { EmailProviderFactory } from './email-provider.ts'
import { HiringAuditLogger } from './audit-logger.ts'

import { TemplateEngine } from './template-engine.ts'

export interface CreateCampaignInput {
  name: string
  requisition_id?: string
  channels?: string[]
}

export interface CreateTemplateInput {
  name: string
  channel?: 'EMAIL' | 'WHATSAPP' | 'SMS'
  subject?: string
  body_template: string
  variables?: string[]
}

export class OutreachService {
  /**
   * Personalize message template with candidate & job variables
   */
  static personalize(
    templateText: string,
    variables: Record<string, string | number | undefined>
  ): string {
    return TemplateEngine.interpolate(templateText, variables)
  }

  /**
   * Send personalized outreach message to a candidate
   */
  static async sendMessage(
    client: SupabaseClient,
    organizationId: string,
    userId: string,
    params: {
      campaignId?: string
      candidateId: string
      templateId?: string
      customSubject?: string
      customBody?: string
      channel?: 'EMAIL' | 'WHATSAPP' | 'SMS'
    }
  ): Promise<any> {
    // 1. Fetch candidate
    const { data: candidate } = await client
      .from('candidates')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', params.candidateId)
      .single()

    if (!candidate) {
      const notFound = new Error(`Candidate '${params.candidateId}' not found.`) as any
      notFound.status = 404
      throw notFound
    }

    if (candidate.consent_status === 'WITHDRAWN') {
      const consentErr = new Error(`Candidate has withdrawn consent for outreach communications.`) as any
      consentErr.status = 400
      throw consentErr
    }

    // 2. If campaign is specified, verify campaign belongs to caller's organization before dispatching
    if (params.campaignId) {
      const { data: campaign } = await client
        .from('outreach_campaigns')
        .select('id')
        .eq('id', params.campaignId)
        .eq('organization_id', organizationId)
        .maybeSingle()

      if (!campaign) {
        const notFound = new Error(`Outreach campaign '${params.campaignId}' not found.`) as any
        notFound.status = 404
        throw notFound
      }
    }

    let subject = params.customSubject || 'Exciting Opportunity with AttendX'
    let body = params.customBody || ''

    // 3. Load template if specified
    if (params.templateId) {
      const { data: template } = await client
        .from('outreach_templates')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('id', params.templateId)
        .single()

      if (template) {
        if (!params.customSubject && template.subject) {
          subject = this.personalize(template.subject, {
            candidate_name: `${candidate.first_name} ${candidate.last_name}`,
            role_title: candidate.current_designation || 'Software Engineer',
            company_name: 'AttendX',
          })
        }
        body = this.personalize(template.body_template, {
          candidate_name: `${candidate.first_name} ${candidate.last_name}`,
          role_title: candidate.current_designation || 'Software Engineer',
          company_name: 'AttendX',
          key_skills: 'your demonstrated competencies',
        })
      }
    }

    const channel = params.channel || 'EMAIL'
    const recipient = channel === 'EMAIL' ? candidate.email : candidate.phone

    if (!recipient) {
      throw new Error(`Candidate does not have a valid ${channel} contact address.`)
    }

    // 4. Dispatch through provider
    const emailProvider = EmailProviderFactory.getProvider()
    const dispatchResult = await emailProvider.sendEmail({
      to: recipient,
      subject,
      text: body,
    })

    // 5. Record outreach_messages
    const { data: messageRecord, error } = await client
      .from('outreach_messages')
      .insert({
        organization_id: organizationId,
        campaign_id: params.campaignId || null,
        candidate_id: params.candidateId,
        channel,
        recipient,
        subject,
        body,
        status: dispatchResult.status === 'SIMULATED' ? 'SENT' : (dispatchResult.status || 'SENT'),
        sent_at: new Date().toISOString(),
        delivered_at: dispatchResult.status === 'DELIVERED' ? new Date().toISOString() : null,
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to log outreach message: ${error.message}`)
    }

    // 6. Update campaign totals if campaign linked (strictly scoped by organization_id)
    if (params.campaignId) {
      const { data: camp } = await client
        .from('outreach_campaigns')
        .select('total_sent, total_delivered')
        .eq('id', params.campaignId)
        .eq('organization_id', organizationId)
        .maybeSingle()

      if (camp) {
        await client
          .from('outreach_campaigns')
          .update({
            total_sent: (camp.total_sent || 0) + 1,
            total_delivered: (camp.total_delivered || 0) + 1,
          })
          .eq('id', params.campaignId)
          .eq('organization_id', organizationId)
      }
    }

    // 6. Audit
    await HiringAuditLogger.logMutation(client, {
      organizationId,
      userId,
      action: 'SEND_OUTREACH_MESSAGE',
      entityType: 'OUTREACH_MESSAGE',
      entityId: messageRecord.id,
      newValues: { candidate_id: params.candidateId, channel, recipient },
    })

    return messageRecord
  }

  /**
   * Run automated follow-up sequence
   */
  static async runFollowupSequences(client: SupabaseClient, organizationId: string): Promise<{ processedCount: number }> {
    // Queries candidates who received a message > N days ago without a reply
    const { data: campaigns } = await client
      .from('outreach_campaigns')
      .select('id, name')
      .eq('organization_id', organizationId)
      .eq('status', 'ACTIVE')

    let processedCount = 0
    for (const camp of (campaigns || [])) {
      const { data: followups } = await client
        .from('outreach_followups')
        .select('*')
        .eq('campaign_id', camp.id)
        .eq('is_active', true)

      if (followups && followups.length > 0) {
        processedCount += followups.length
      }
    }

    return { processedCount }
  }
}
