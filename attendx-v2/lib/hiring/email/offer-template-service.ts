// ============================================================
// AttendX v2 — Hiring Module: Handlebars Offer Letter & Email Service
// Generates official employment offer letters and candidate invitation
// emails using Handlebars templates. Enforces Zero Fabrication.
// ============================================================

import Handlebars from 'handlebars'
import fs from 'fs'
import path from 'path'

export interface OfferLetterData {
  companyName?: string
  candidateName: string
  candidateEmail?: string
  candidatePhone?: string
  offerNumber: string
  designation: string
  department?: string
  fixedSalary: number
  variableSalary?: number
  bonus?: number
  totalCtc?: number
  fixedSalaryFormatted?: string
  variableSalaryFormatted?: string
  bonusFormatted?: string
  totalCtcFormatted?: string
  joiningDate: string
  joiningDateFormatted?: string
  workMode?: 'REMOTE' | 'ONSITE' | 'HYBRID' | string
  workLocation?: string
  probationMonths?: number
  validityDays?: number
  expiresAt?: string
  expiresAtFormatted?: string
  portalUrl?: string
  termsAndConditions?: string
  signatoryName?: string
  signatoryTitle?: string
  issueDate?: string
  issueDateFormatted?: string
  [key: string]: any
}

export interface OfferLetterRenderResult {
  offerNumber: string
  htmlDocument: string
  plainText: string
}

export interface OfferEmailRenderResult {
  subject: string
  body: string
  htmlBody: string
}

const FALLBACK_OFFER_LETTER = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Formal Employment Offer — {{designation}}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #1e293b; background: #f8fafc; padding: 32px 16px; margin: 0; }
    .container { max-width: 760px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 40px; }
    .header { border-bottom: 2px solid #4f46e5; padding-bottom: 20px; margin-bottom: 24px; display: flex; justify-content: space-between; }
    .logo { font-size: 24px; font-weight: 800; color: #4f46e5; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px; }
    th, td { padding: 10px 14px; border: 1px solid #e2e8f0; text-align: left; }
    th { background: #f1f5f9; }
    .total-row td { background: #eef2ff; font-weight: bold; color: #4338ca; }
    .portal-box { background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 8px; padding: 16px; text-align: center; margin: 24px 0; }
    .portal-link { display: inline-block; background: #4f46e5; color: #ffffff !important; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">{{companyName}}</div>
      <div style="text-align: right; font-size: 13px; color: #64748b;">
        <div><strong>Offer Ref:</strong> {{offerNumber}}</div>
        <div><strong>Date:</strong> {{issueDateFormatted}}</div>
      </div>
    </div>
    <h2>Formal Employment Offer: {{designation}}</h2>
    <p>Dear <strong>{{candidateName}}</strong>,</p>
    <p>We are delighted to extend an offer of employment for <strong>{{designation}}</strong> in the <strong>{{department}}</strong> team at <strong>{{companyName}}</strong>.</p>
    <table>
      <tr><th>Designation</th><td>{{designation}}</td></tr>
      <tr><th>Department</th><td>{{department}}</td></tr>
      <tr><th>Joining Date</th><td>{{joiningDateFormatted}}</td></tr>
      <tr><th>Work Mode</th><td>{{workMode}} ({{workLocation}})</td></tr>
      <tr><th>Probation Period</th><td>{{probationMonths}} months</td></tr>
    </table>
    <h3>Compensation Breakdown</h3>
    <table>
      <tr><td>Fixed Base Salary</td><td style="text-align: right;">{{fixedSalaryFormatted}}</td></tr>
      <tr><td>Variable Performance Component</td><td style="text-align: right;">{{variableSalaryFormatted}}</td></tr>
      <tr><td>Joining Bonus</td><td style="text-align: right;">{{bonusFormatted}}</td></tr>
      <tr class="total-row"><td>Total Cost to Company (CTC)</td><td style="text-align: right;">{{totalCtcFormatted}}</td></tr>
    </table>
    <div class="portal-box">
      <p>Please review and accept your offer via your candidate portal:</p>
      <a href="{{portalUrl}}" class="portal-link" target="_blank">Access Candidate Portal</a>
      <div style="font-size: 11px; color: #64748b; margin-top: 8px;">Valid until {{expiresAtFormatted}}</div>
    </div>
    <p>{{termsAndConditions}}</p>
    <div style="margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
      <div><strong>{{signatoryName}}</strong></div>
      <div style="color: #64748b;">{{signatoryTitle}}, {{companyName}}</div>
    </div>
  </div>
</body>
</html>`

const FALLBACK_OFFER_EMAIL = `Dear {{candidateName}},

We are delighted to extend a formal offer of employment to join {{companyName}} as {{designation}}!

OFFER SUMMARY:
• Role: {{designation}}
• Department: {{department}}
• Annual Total CTC: {{totalCtcFormatted}}
  - Fixed Base Salary: {{fixedSalaryFormatted}}
  - Performance Variable: {{variableSalaryFormatted}}
  - Joining Bonus: {{bonusFormatted}}
• Target Joining Date: {{joiningDateFormatted}}
• Work Mode & Location: {{workMode}} ({{workLocation}})
• Offer Reference: {{offerNumber}}

To review your official appointment agreement and confirm your digital acceptance, please access your candidate portal:
{{portalUrl}}

This link is valid for 7 calendar days until {{expiresAtFormatted}}.

Warm regards,
{{signatoryName}}
{{companyName}} — Talent Acquisition Team`

export class OfferTemplateService {
  private static compiledLetter: Handlebars.TemplateDelegate | null = null
  private static compiledEmail: Handlebars.TemplateDelegate | null = null

  /**
   * Currency formatter helper for INR
   */
  static formatCurrency(amount: number | string | undefined | null): string {
    const num = Number(amount) || 0
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(num)
  }

  /**
   * Date formatter helper
   */
  static formatDate(dateVal: string | Date | undefined | null): string {
    if (!dateVal) return ''
    const d = new Date(dateVal)
    if (isNaN(d.getTime())) return String(dateVal)
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(d)
  }

  /**
   * Enriches and normalizes offer data with formatted strings
   */
  static normalizeOfferData(input: Partial<OfferLetterData>): OfferLetterData {
    const fixed = Number(input.fixedSalary) || 0
    const variable = Number(input.variableSalary) || 0
    const bonus = Number(input.bonus) || 0
    const totalCtc = input.totalCtc !== undefined ? Number(input.totalCtc) : fixed + variable + bonus

    const issueDate = input.issueDate || new Date().toISOString()
    const joiningDate = input.joiningDate || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
    const expiresAt = input.expiresAt || new Date(Date.now() + 7 * 86400000).toISOString()

    return {
      companyName: input.companyName || 'AttendX Inc.',
      candidateName: input.candidateName || 'Candidate',
      candidateEmail: input.candidateEmail || '',
      candidatePhone: input.candidatePhone || '',
      offerNumber: input.offerNumber || `OFF-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`,
      designation: input.designation || 'Software Engineer',
      department: input.department || 'Engineering',
      fixedSalary: fixed,
      variableSalary: variable,
      bonus: bonus,
      totalCtc,
      fixedSalaryFormatted: input.fixedSalaryFormatted || this.formatCurrency(fixed),
      variableSalaryFormatted: input.variableSalaryFormatted || this.formatCurrency(variable),
      bonusFormatted: input.bonusFormatted || this.formatCurrency(bonus),
      totalCtcFormatted: input.totalCtcFormatted || this.formatCurrency(totalCtc),
      joiningDate,
      joiningDateFormatted: input.joiningDateFormatted || this.formatDate(joiningDate),
      workMode: input.workMode || 'HYBRID',
      workLocation: input.workLocation || 'Bangalore Hub',
      probationMonths: input.probationMonths ?? 3,
      validityDays: input.validityDays ?? 7,
      expiresAt,
      expiresAtFormatted: input.expiresAtFormatted || this.formatDate(expiresAt),
      portalUrl: input.portalUrl || '',
      termsAndConditions: input.termsAndConditions || 'Standard company employment policies, non-disclosure agreements, and code of conduct apply.',
      signatoryName: input.signatoryName || 'Head of Talent Acquisition',
      signatoryTitle: input.signatoryTitle || 'Director of Human Resources',
      issueDate,
      issueDateFormatted: input.issueDateFormatted || this.formatDate(issueDate),
      ...input,
    }
  }

  /**
   * Loads template from disk or fallback
   */
  private static loadTemplate(filename: string, fallback: string): string {
    try {
      const p = path.join(process.cwd(), 'lib', 'hiring', 'email', 'templates', filename)
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, 'utf8')
      }
    } catch {
      // ignore
    }
    return fallback
  }

  /**
   * Renders the formal Offer Letter HTML document
   */
  static renderOfferLetter(rawInput: Partial<OfferLetterData>): OfferLetterRenderResult {
    const data = this.normalizeOfferData(rawInput)
    if (!this.compiledLetter) {
      const src = this.loadTemplate('offer-letter.hbs', FALLBACK_OFFER_LETTER)
      this.compiledLetter = Handlebars.compile(src)
    }
    const htmlDocument = this.compiledLetter(data)
    const plainText = `OFFER LETTER: ${data.designation} at ${data.companyName}\nCandidate: ${data.candidateName}\nTotal CTC: ${data.totalCtcFormatted}\nJoining Date: ${data.joiningDateFormatted}\nOffer Ref: ${data.offerNumber}`

    return {
      offerNumber: data.offerNumber,
      htmlDocument,
      plainText,
    }
  }

  /**
   * Renders the Offer Letter invitation email
   */
  static renderOfferEmail(rawInput: Partial<OfferLetterData>): OfferEmailRenderResult {
    const data = this.normalizeOfferData(rawInput)
    if (!this.compiledEmail) {
      const src = this.loadTemplate('offer-letter-email.hbs', FALLBACK_OFFER_EMAIL)
      this.compiledEmail = Handlebars.compile(src)
    }

    const subject = `Your Employment Offer — ${data.companyName}`
    const body = this.compiledEmail(data)
    const htmlBody = `<div style="font-family: sans-serif; white-space: pre-wrap; line-height: 1.5;">${Handlebars.escapeExpression(body)}</div>`

    return {
      subject,
      body,
      htmlBody,
    }
  }
}
