// ============================================================
// AttendX v2 — Hiring Module: Handlebars Email Template Service
// Compiles, validates, and renders safe email templates for
// candidate interview scheduling, rescheduling, and cancellation.
// Strictly adheres to Zero Fabrication and safe escaping.
// ============================================================

import Handlebars from 'handlebars'
import fs from 'fs'
import path from 'path'

export type InterviewTemplateKey =
  | 'interview-round-1'
  | 'interview-round-2'
  | 'interview-round-3'
  | 'interview-rescheduled'
  | 'interview-cancelled'
  | 'offer-letter'
  | 'offer-letter-email'

export interface InterviewTemplateData {
  candidateName: string
  companyName: string
  jobTitle: string
  roundName: string
  interviewDate?: string
  interviewTime?: string
  timezone?: string
  duration?: number | string
  interviewerNames?: string
  interviewAgenda?: string
  meetingUrl?: string
  recruiterName: string
  rescheduleReason?: string
  cancelReason?: string
  designation?: string
  department?: string
  totalCtcFormatted?: string
  fixedSalaryFormatted?: string
  variableSalaryFormatted?: string
  bonusFormatted?: string
  joiningDateFormatted?: string
  workMode?: string
  workLocation?: string
  portalUrl?: string
  expiresAtFormatted?: string
  offerNumber?: string
  [key: string]: any
}

export interface RenderedTemplateResult {
  templateKey: InterviewTemplateKey
  subject: string
  body: string
  htmlBody: string
}

// Canonical Subject lines for each template
export const TEMPLATE_SUBJECTS: Record<InterviewTemplateKey, string> = {
  'interview-round-1': 'Interview Invitation — Round 1: Introduction — {{jobTitle}}',
  'interview-round-2': 'Interview Invitation — Round 2: Coding Assessment — {{jobTitle}}',
  'interview-round-3': 'Interview Invitation — Round 3: Technical & HR — {{jobTitle}}',
  'interview-rescheduled': 'Interview Rescheduled: {{roundName}} — {{jobTitle}}',
  'interview-cancelled': 'Interview Cancelled: {{roundName}} — {{jobTitle}}',
  'offer-letter': 'Formal Employment Offer — {{jobTitle}} — {{companyName}}',
  'offer-letter-email': 'Your Employment Offer — {{companyName}}',
}


// Embedded template fallback strings to ensure resilient execution across bundling modes
const FALLBACK_TEMPLATES: Record<InterviewTemplateKey, string> = {
  'interview-round-1': `Hello {{candidateName}},

Thank you for your interest in the {{jobTitle}} position at {{companyName}}.

We are pleased to invite you to {{roundName}}. This introductory conversation is an opportunity to learn more about your background, discuss the role, and answer any questions you may have about AttendX.

Interview Details:
• Round: {{roundName}}
• Date: {{interviewDate}}
• Time: {{interviewTime}} ({{timezone}})
• Duration: {{duration}} minutes
• Interviewer(s): {{interviewerNames}}
• Meeting Link: {{meetingUrl}}

Agenda:
{{interviewAgenda}}

Instructions:
• Please confirm your availability by replying to this email.
• If the scheduled time is not convenient, please let us know your preferred availability window.
• Please join the Google Meet link 2-3 minutes prior to the scheduled start time.

We look forward to speaking with you!

Best regards,
{{recruiterName}}
{{companyName}} — Talent Acquisition Team`,

  'interview-round-2': `Hello {{candidateName}},

Congratulations on progressing to the next stage of our evaluation process for the {{jobTitle}} position at {{companyName}}.

We are pleased to invite you to {{roundName}}. This hands-on session will evaluate problem-solving, algorithms, and practical engineering skills relevant to our technology stack.

Interview Details:
• Round: {{roundName}}
• Date: {{interviewDate}}
• Time: {{interviewTime}} ({{timezone}})
• Duration: {{duration}} minutes
• Interviewer(s): {{interviewerNames}}
• Meeting Link: {{meetingUrl}}

Agenda:
{{interviewAgenda}}

Preparation & Instructions:
• Environment: Please ensure a stable internet connection and a quiet environment.
• Tools: You may use your preferred code editor, IDE, or terminal.
• Collaboration: Be prepared to share your screen and explain your architectural and algorithmic thought process while coding.
• Questions: There will be dedicated time at the end to discuss our technical architecture and engineering practices.

If you have any questions or require an adjustment to the timing, please reply to this email promptly.

Best regards,
{{recruiterName}}
{{companyName}} — Engineering Hiring Team`,

  'interview-round-3': `Hello {{candidateName}},

Thank you for your continued engagement and great performance throughout our evaluations for the {{jobTitle}} position at {{companyName}}.

We are delighted to invite you to {{roundName}}. This final discussion covers system architecture, production design experience, behavioral leadership, and mutual organizational alignment.

Interview Details:
• Round: {{roundName}}
• Date: {{interviewDate}}
• Time: {{interviewTime}} ({{timezone}})
• Duration: {{duration}} minutes
• Interviewer(s): {{interviewerNames}}
• Meeting Link: {{meetingUrl}}

Agenda:
{{interviewAgenda}}

Discussion Topics:
• High-level distributed systems design, data architecture, and scalability
• Production troubleshooting, reliability engineering, and observability
• Cross-functional leadership, ownership, and core values alignment
• Role expectations, compensation structure, notice period, and next steps

Please confirm your attendance by replying to this email. We look forward to meeting with you!

Best regards,
{{recruiterName}}
{{companyName}} — Talent Acquisition & Leadership`,

  'interview-rescheduled': `Hello {{candidateName}},

Please be advised that your upcoming interview for the {{jobTitle}} position at {{companyName}} has been rescheduled.

Updated Interview Details:
• Round: {{roundName}}
• New Date: {{interviewDate}}
• New Time: {{interviewTime}} ({{timezone}})
• Duration: {{duration}} minutes
• Interviewer(s): {{interviewerNames}}
• Meeting Link: {{meetingUrl}}
{{#if rescheduleReason}}

Reason for Reschedule:
{{rescheduleReason}}
{{/if}}

Please reply to this email to confirm that the new schedule works for you. If you need an alternative time slot, kindly reply with your preferred availability.

We appreciate your flexibility and apologize for any inconvenience caused.

Best regards,
{{recruiterName}}
{{companyName}} — Talent Acquisition Team`,

  'interview-cancelled': `Hello {{candidateName}},

This email is to notify you that your scheduled {{roundName}} for the {{jobTitle}} position at {{companyName}} has been cancelled.
{{#if cancelReason}}

Reason for Cancellation:
{{cancelReason}}
{{/if}}

If you have any questions or would like to discuss next steps, please feel free to reply directly to this message.

Thank you for your understanding and interest in {{companyName}}.

Best regards,
{{recruiterName}}
{{companyName}} — Talent Acquisition Team`,

  'offer-letter': `Formal Employment Offer: {{jobTitle}}
Dear {{candidateName}},
We are pleased to extend an offer of employment for the position of {{jobTitle}} in the {{department}} department at {{companyName}}.
Total CTC: {{totalCtcFormatted}}
Joining Date: {{joiningDateFormatted}}
Work Mode: {{workMode}} ({{workLocation}})
Candidate Portal: {{portalUrl}}
Valid until: {{expiresAtFormatted}}`,

  'offer-letter-email': `Dear {{candidateName}},

We are delighted to extend a formal offer of employment to join {{companyName}} as {{jobTitle}}!

OFFER SUMMARY:
• Role / Designation: {{jobTitle}}
• Department: {{department}}
• Annual Total CTC: {{totalCtcFormatted}}
• Target Joining Date: {{joiningDateFormatted}}
• Work Mode & Location: {{workMode}} ({{workLocation}})

To review your official appointment agreement and confirm your digital acceptance, please visit your secure portal:
{{portalUrl}}

This link is valid for 7 calendar days until {{expiresAtFormatted}}.

Warm regards,
{{recruiterName}}
{{companyName}} — Talent Acquisition Team`,
}

// Required variables per template key
export const REQUIRED_TEMPLATE_VARIABLES: Record<InterviewTemplateKey, (keyof InterviewTemplateData)[]> = {
  'interview-round-1': [
    'candidateName',
    'companyName',
    'jobTitle',
    'roundName',
    'interviewDate',
    'interviewTime',
    'timezone',
    'duration',
    'interviewerNames',
    'interviewAgenda',
    'meetingUrl',
    'recruiterName',
  ],
  'interview-round-2': [
    'candidateName',
    'companyName',
    'jobTitle',
    'roundName',
    'interviewDate',
    'interviewTime',
    'timezone',
    'duration',
    'interviewerNames',
    'interviewAgenda',
    'meetingUrl',
    'recruiterName',
  ],
  'interview-round-3': [
    'candidateName',
    'companyName',
    'jobTitle',
    'roundName',
    'interviewDate',
    'interviewTime',
    'timezone',
    'duration',
    'interviewerNames',
    'interviewAgenda',
    'meetingUrl',
    'recruiterName',
  ],
  'interview-rescheduled': [
    'candidateName',
    'companyName',
    'jobTitle',
    'roundName',
    'interviewDate',
    'interviewTime',
    'timezone',
    'duration',
    'interviewerNames',
    'meetingUrl',
    'recruiterName',
  ],
  'interview-cancelled': [
    'candidateName',
    'companyName',
    'jobTitle',
    'roundName',
    'recruiterName',
  ],
  'offer-letter': [
    'candidateName',
    'companyName',
    'jobTitle',
  ],
  'offer-letter-email': [
    'candidateName',
    'companyName',
    'jobTitle',
  ],
}


export class EmailTemplateService {
  private static compiledTemplates: Map<string, Handlebars.TemplateDelegate> = new Map()
  private static compiledSubjects: Map<string, Handlebars.TemplateDelegate> = new Map()

  /**
   * Normalizes incoming variables, bridging snake_case to camelCase
   */
  static normalizeVariables(data: Record<string, any>): InterviewTemplateData {
    return {
      candidateName: (data.candidateName ?? data.candidate_name ?? '').toString().trim(),
      companyName: (data.companyName ?? data.company_name ?? 'AttendX').toString().trim(),
      jobTitle: (data.jobTitle ?? data.job_title ?? data.designation ?? '').toString().trim(),
      roundName: (data.roundName ?? data.round_name ?? '').toString().trim(),
      interviewDate: (data.interviewDate ?? data.interview_date ?? '').toString().trim(),
      interviewTime: (data.interviewTime ?? data.interview_time ?? '').toString().trim(),
      timezone: (data.timezone ?? 'Asia/Kolkata').toString().trim(),
      duration: data.duration ?? data.default_duration_minutes ?? 20,
      interviewerNames: (data.interviewerNames ?? data.interviewer_names ?? 'AttendX Hiring Panel').toString().trim(),
      interviewAgenda: (data.interviewAgenda ?? data.interview_agenda ?? '').toString().trim(),
      meetingUrl: (data.meetingUrl ?? data.meeting_url ?? '').toString().trim(),
      recruiterName: (data.recruiterName ?? data.recruiter_name ?? 'AttendX Talent Acquisition').toString().trim(),
      rescheduleReason: (data.rescheduleReason ?? data.reschedule_reason ?? '').toString().trim(),
      cancelReason: (data.cancelReason ?? data.cancel_reason ?? '').toString().trim(),
      ...data,
    }
  }

  /**
   * Formats a start timestamp into human-readable date and time using an explicit timezone
   */
  static formatDateTime(
    isoString: string,
    timezone: string = 'Asia/Kolkata'
  ): { dateStr: string; timeStr: string } {
    const date = new Date(isoString)
    if (isNaN(date.getTime())) {
      return { dateStr: isoString, timeStr: '' }
    }

    try {
      const dateStr = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(date)

      const timeStr = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(date)

      return { dateStr, timeStr }
    } catch {
      // Fallback if invalid timezone provided
      return {
        dateStr: date.toDateString(),
        timeStr: date.toTimeString().slice(0, 5),
      }
    }
  }

  /**
   * Loads template text from filesystem or fallback
   */
  private static loadTemplateSource(templateKey: InterviewTemplateKey): string {
    try {
      const templatePath = path.join(
        process.cwd(),
        'lib',
        'hiring',
        'email',
        'templates',
        `${templateKey}.hbs`
      )
      if (fs.existsSync(templatePath)) {
        return fs.readFileSync(templatePath, 'utf8')
      }
    } catch {
      // Ignore fs read errors and use embedded fallback
    }

    return FALLBACK_TEMPLATES[templateKey] || ''
  }

  /**
   * Compiles template body and caches the delegate
   */
  private static getTemplateDelegate(templateKey: InterviewTemplateKey): Handlebars.TemplateDelegate {
    if (!this.compiledTemplates.has(templateKey)) {
      const source = this.loadTemplateSource(templateKey)
      if (!source) {
        throw new Error(`Email template source not found for key: '${templateKey}'`)
      }
      this.compiledTemplates.set(templateKey, Handlebars.compile(source))
    }
    return this.compiledTemplates.get(templateKey)!
  }

  /**
   * Compiles template subject and caches the delegate
   */
  private static getSubjectDelegate(templateKey: InterviewTemplateKey): Handlebars.TemplateDelegate {
    if (!this.compiledSubjects.has(templateKey)) {
      const subjectSource = TEMPLATE_SUBJECTS[templateKey]
      if (!subjectSource) {
        throw new Error(`Email template subject not configured for key: '${templateKey}'`)
      }
      this.compiledSubjects.set(templateKey, Handlebars.compile(subjectSource))
    }
    return this.compiledSubjects.get(templateKey)!
  }

  /**
   * Validates required variables for a template key.
   * Throws an Error if any required variable is missing, null, undefined, or empty string.
   */
  static validateVariables(
    templateKey: InterviewTemplateKey,
    variables: Record<string, any>
  ): void {
    const required = REQUIRED_TEMPLATE_VARIABLES[templateKey]
    if (!required) {
      throw new Error(`Unknown interview template key: '${templateKey}'`)
    }

    const missing: string[] = []
    for (const key of required) {
      const val = variables[key]
      if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) {
        missing.push(key as string)
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `Failed to render email template '${templateKey}'. Missing required variables: [${missing.join(
          ', '
        )}]`
      )
    }
  }

  /**
   * Renders the template subject and body with strict validation and safe HTML escaping
   */
  static render(
    templateKey: InterviewTemplateKey,
    rawData: Record<string, any>
  ): RenderedTemplateResult {
    const normalized = this.normalizeVariables(rawData)

    // Strict validation — fail-closed before rendering
    this.validateVariables(templateKey, normalized)

    const subjectDelegate = this.getSubjectDelegate(templateKey)
    const bodyDelegate = this.getTemplateDelegate(templateKey)

    const subject = subjectDelegate(normalized).trim()
    const body = bodyDelegate(normalized).trim()

    // Generate safe HTML representation with paragraph breaks and escaped characters
    const htmlBody = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${Handlebars.escapeExpression(subject)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 24px; }
    .card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; max-width: 600px; margin: 0 auto; }
    .header { font-size: 18px; font-weight: 600; color: #0f172a; margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px; }
    .content { font-size: 14px; white-space: pre-wrap; word-break: break-word; color: #334155; }
    .footer { margin-top: 24px; font-size: 12px; color: #64748b; border-top: 1px solid #f1f5f9; padding-top: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">${Handlebars.escapeExpression(subject)}</div>
    <div class="content">${body}</div>
    <div class="footer">AttendX Hiring Platform — Candidate Communication</div>
  </div>
</body>
</html>`

    return {
      templateKey,
      subject,
      body,
      htmlBody,
    }
  }

  /**
   * Helper to resolve template key for a round number
   */
  static getTemplateKeyForRound(roundNumber: number): InterviewTemplateKey {
    switch (Number(roundNumber)) {
      case 1:
        return 'interview-round-1'
      case 2:
        return 'interview-round-2'
      case 3:
      default:
        return 'interview-round-3'
    }
  }
}

export { OfferTemplateService } from './offer-template-service.ts'

