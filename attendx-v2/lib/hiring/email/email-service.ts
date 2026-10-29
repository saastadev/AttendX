// ============================================================
// AttendX v2 — Hiring Module: Server-Side Email Service
// Orchestrates Handlebars rendering, recipient validation,
// idempotency guards, and provider dispatch (Zero Fabrication).
// ============================================================

import { EmailProviderFactory, type SendEmailResult } from '../email-provider.ts'
import {
  EmailTemplateService,
  type InterviewTemplateKey,
  type InterviewTemplateData,
  type RenderedTemplateResult,
} from './email-template-service.ts'

export interface DispatchInterviewEmailInput {
  interviewId: string
  organizationId: string
  recipientEmail: string
  templateKey?: InterviewTemplateKey
  templateData?: Partial<InterviewTemplateData>
  customSubject?: string
  customBody?: string
  isDraft?: boolean
  idempotencyKey?: string
}

export interface DispatchEmailResponse {
  success: boolean
  messageId: string
  deliveryStatus: string
  provider: string
  simulationStatus: 'REAL' | 'SIMULATED'
  renderedSubject: string
  renderedBody: string
  recipient: string
  error?: string
}

// Basic RFC 5322 regex for recipient email validation
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/

// Sent record for in-memory idempotency check (keyed by interviewId + action)
const sentIdempotencyRegistry = new Map<string, { timestamp: number; messageId: string }>()
const IDEMPOTENCY_WINDOW_MS = 60 * 1000 // 60 seconds duplicate protection

export class EmailService {
  /**
   * Validates a recipient email address
   */
  static validateEmail(email: string): boolean {
    if (!email || typeof email !== 'string') return false
    return EMAIL_REGEX.test(email.trim())
  }

  /**
   * Renders and dispatches an interview email with idempotency and Zero Fabrication
   */
  static async sendInterviewEmail(
    input: DispatchInterviewEmailInput
  ): Promise<DispatchEmailResponse> {
    const {
      interviewId,
      recipientEmail,
      templateKey,
      templateData,
      customSubject,
      customBody,
      isDraft = false,
      idempotencyKey,
    } = input

    // 1. Validate recipient email
    if (!this.validateEmail(recipientEmail)) {
      throw new Error(`Invalid candidate email address: '${recipientEmail}'`)
    }

    // 2. Render content via Handlebars or use custom previewed content
    let subject = customSubject || ''
    let body = customBody || ''
    let htmlBody = ''

    if (templateKey && templateData && (!subject || !body)) {
      const rendered: RenderedTemplateResult = EmailTemplateService.render(
        templateKey,
        templateData
      )
      if (!subject) subject = rendered.subject
      if (!body) body = rendered.body
      htmlBody = rendered.htmlBody
    } else if (body) {
      htmlBody = EmailTemplateService.wrapHtml(body, subject)
    }

    if (!subject || !subject.trim()) {
      throw new Error('Interview email subject cannot be empty.')
    }
    if (!body || !body.trim()) {
      throw new Error('Interview email body cannot be empty.')
    }

    // 3. Idempotency Check (Prevent duplicate sends within window unless it's a draft)
    const idempotencyId = idempotencyKey || `interview-${interviewId}-${subject.slice(0, 30)}`
    if (!isDraft) {
      const existing = sentIdempotencyRegistry.get(idempotencyId)
      if (existing && Date.now() - existing.timestamp < IDEMPOTENCY_WINDOW_MS) {
        return {
          success: true,
          messageId: existing.messageId,
          deliveryStatus: 'PENDING_DELIVERY',
          provider: 'idempotent_cached',
          simulationStatus: 'SIMULATED',
          renderedSubject: subject,
          renderedBody: body,
          recipient: recipientEmail,
        }
      }
    }

    // 4. Dispatch via Email Provider
    const emailProvider = EmailProviderFactory.getProvider()
    const sender = process.env.EMAIL_FROM_ADDRESS || process.env.ATTENDX_EMAIL_FROM || 'AttendX Hiring <onboarding@resend.dev>'

    const sendResult: SendEmailResult = await emailProvider.sendEmail({
      to: recipientEmail,
      subject,
      text: body,
      html: htmlBody || undefined,
      from: sender,
      isDraft,
    })

    // 5. Register idempotency on non-draft send
    if (!isDraft && sendResult.success) {
      sentIdempotencyRegistry.set(idempotencyId, {
        timestamp: Date.now(),
        messageId: sendResult.messageId,
      })
    }

    return {
      success: sendResult.success,
      messageId: sendResult.messageId,
      deliveryStatus: sendResult.status,
      provider: sendResult.provider,
      simulationStatus: sendResult.simulationStatus,
      renderedSubject: subject,
      renderedBody: body,
      recipient: recipientEmail,
      error: sendResult.error,
    }
  }

  /**
   * Renders and dispatches an employment offer letter email with idempotency and Zero Fabrication
   */
  static async sendOfferEmail(
    input: {
      offerId: string
      organizationId: string
      recipientEmail: string
      candidateName: string
      designation: string
      companyName?: string
      department?: string
      totalCtc?: number
      fixedSalary?: number
      variableSalary?: number
      bonus?: number
      joiningDate?: string
      workMode?: string
      workLocation?: string
      portalUrl?: string
      expiresAt?: string
      isDraft?: boolean
      idempotencyKey?: string
    }
  ): Promise<DispatchEmailResponse> {
    const {
      offerId,
      recipientEmail,
      candidateName,
      designation,
      companyName = 'AttendX Inc.',
      department = 'Engineering',
      totalCtc = 0,
      fixedSalary = 0,
      variableSalary = 0,
      bonus = 0,
      joiningDate = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      workMode = 'HYBRID',
      workLocation = 'Bangalore Hub',
      portalUrl = '',
      expiresAt = new Date(Date.now() + 7 * 86400000).toISOString(),
      isDraft = false,
      idempotencyKey,
    } = input

    // 1. Validate recipient email
    if (!this.validateEmail(recipientEmail)) {
      throw new Error(`Invalid candidate email address: '${recipientEmail}'`)
    }

    // 2. Render content via Handlebars OfferTemplateService
    const { OfferTemplateService } = await import('./offer-template-service.ts')
    const rendered = OfferTemplateService.renderOfferEmail({
      companyName,
      candidateName,
      candidateEmail: recipientEmail,
      offerNumber: `OFF-${offerId.slice(0, 8)}`,
      designation,
      department,
      fixedSalary,
      variableSalary,
      bonus,
      totalCtc,
      joiningDate,
      workMode,
      workLocation,
      portalUrl,
      expiresAt,
    })

    const subject = rendered.subject
    const body = rendered.body
    const htmlBody = rendered.htmlBody || EmailTemplateService.wrapHtml(body, subject)

    // 3. Idempotency Check
    const idempotencyId = idempotencyKey || `offer-${offerId}-release`
    if (!isDraft) {
      const existing = sentIdempotencyRegistry.get(idempotencyId)
      if (existing && Date.now() - existing.timestamp < IDEMPOTENCY_WINDOW_MS) {
        return {
          success: true,
          messageId: existing.messageId,
          deliveryStatus: 'PENDING_DELIVERY',
          provider: 'idempotent_cached',
          simulationStatus: 'SIMULATED',
          renderedSubject: subject,
          renderedBody: body,
          recipient: recipientEmail,
        }
      }
    }

    // 4. Dispatch via Email Provider (Zero Fabrication)
    const emailProvider = EmailProviderFactory.getProvider()
    const sender = process.env.EMAIL_FROM_ADDRESS || process.env.ATTENDX_EMAIL_FROM || 'AttendX Hiring <onboarding@resend.dev>'

    const sendResult: SendEmailResult = await emailProvider.sendEmail({
      to: recipientEmail,
      subject,
      text: body,
      html: htmlBody || undefined,
      from: sender,
      isDraft,
    })

    // 5. Register idempotency
    if (!isDraft && sendResult.success) {
      sentIdempotencyRegistry.set(idempotencyId, {
        timestamp: Date.now(),
        messageId: sendResult.messageId,
      })
    }

    return {
      success: sendResult.success,
      messageId: sendResult.messageId,
      deliveryStatus: sendResult.status,
      provider: sendResult.provider,
      simulationStatus: sendResult.simulationStatus,
      renderedSubject: subject,
      renderedBody: body,
      recipient: recipientEmail,
      error: sendResult.error,
    }
  }

  /**
   * Clears the idempotency cache (useful for testing)
   */
  static clearIdempotencyCache(): void {
    sentIdempotencyRegistry.clear()
  }
}

