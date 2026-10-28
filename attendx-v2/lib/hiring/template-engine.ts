// ============================================================
// AttendX v2 — Hiring Module: Handlebars Template Personalization Engine
// Compiles, validates, and renders safe email & messaging templates for
// candidate outreach campaigns, interview sequences, and status updates.
// Strictly adheres to Zero Fabrication and safe escaping.
// ============================================================

import Handlebars from 'handlebars'

export interface VariableValidationResult {
  isValid: boolean
  missing: string[]
  detected: string[]
}

export interface TemplatePreviewResult {
  rendered: string
  variablesUsed: Record<string, any>
  detectedVariables: string[]
  missingRequired: string[]
}

export class TemplateEngine {
  /**
   * Normalizes context keys to support both camelCase and snake_case seamlessly.
   * e.g. candidate_name <-> candidateName, role_title <-> jobTitle, etc.
   */
  static normalizeContext(variables: Record<string, any>): Record<string, any> {
    const ctx: Record<string, any> = { ...variables }

    const mappings: [string, string][] = [
      ['candidate_name', 'candidateName'],
      ['candidate_email', 'candidateEmail'],
      ['candidate_phone', 'candidatePhone'],
      ['role_title', 'jobTitle'],
      ['company_name', 'companyName'],
      ['recruiter_name', 'recruiterName'],
      ['interview_round', 'roundName'],
      ['interview_date', 'interviewDate'],
      ['interview_time', 'interviewTime'],
      ['meeting_link', 'meetingUrl'],
      ['key_skills', 'keySkills'],
    ]

    for (const [snake, camel] of mappings) {
      if (ctx[snake] !== undefined && ctx[camel] === undefined) {
        ctx[camel] = ctx[snake]
      } else if (ctx[camel] !== undefined && ctx[snake] === undefined) {
        ctx[snake] = ctx[camel]
      }
    }

    return ctx
  }

  /**
   * Extracts all unique {{placeholder}} variable names from a template string.
   */
  static extractVariables(templateText: string): string[] {
    if (!templateText) return []
    const matches = templateText.match(/{{\s*([a-zA-Z0-9_]+)\s*}}/g)
    if (!matches) return []
    const vars = matches.map(m => m.replace(/[{}]/g, '').trim())
    return Array.from(new Set(vars))
  }

  /**
   * Validates whether all required variables (or detected variables) are provided.
   */
  static validateVariables(
    templateText: string,
    variables: Record<string, any>,
    required?: string[]
  ): VariableValidationResult {
    const detected = this.extractVariables(templateText)
    const normalized = this.normalizeContext(variables)
    const toCheck = required && required.length > 0 ? required : detected

    const missing: string[] = []
    for (const v of toCheck) {
      const val = normalized[v]
      if (val === undefined || val === null || String(val).trim() === '') {
        missing.push(v)
      }
    }

    return {
      isValid: missing.length === 0,
      missing,
      detected,
    }
  }

  /**
   * Compiles and renders a template using Handlebars with safe escaping.
   * Falls back gracefully to regex replacement if syntax is non-standard.
   */
  static render(
    templateText: string,
    variables: Record<string, any>,
    options?: { escapeHtml?: boolean }
  ): string {
    if (!templateText) return ''
    const normalized = this.normalizeContext(variables)

    try {
      // Safe compilation with HTML escaping enabled by default
      const compiled = Handlebars.compile(templateText, {
        noEscape: options?.escapeHtml === false,
        strict: false,
      })
      return compiled(normalized)
    } catch {
      // Fallback to regex interpolation
      let result = templateText
      for (const [key, value] of Object.entries(normalized)) {
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi')
        result = result.replace(regex, String(value ?? ''))
      }
      return result
    }
  }

  /**
   * Alias for render (backwards compatibility with existing tests & services)
   */
  static interpolate(
    templateText: string,
    variables: Record<string, any>
  ): string {
    return this.render(templateText, variables)
  }

  /**
   * Generates a live preview using authentic specimen candidate values
   * merged with any caller-provided overrides.
   */
  static preview(
    templateText: string,
    specimenOverrides: Record<string, any> = {}
  ): TemplatePreviewResult {
    const defaultSpecimen = {
      candidate_name: 'Aarav Sharma',
      candidateName: 'Aarav Sharma',
      candidate_email: 'aarav.sharma@example.com',
      candidateEmail: 'aarav.sharma@example.com',
      candidate_phone: '+91 98765 43210',
      role_title: 'Senior Full-Stack Engineer',
      jobTitle: 'Senior Full-Stack Engineer',
      company_name: 'AttendX Enterprise',
      companyName: 'AttendX Enterprise',
      recruiter_name: 'Carol HR',
      recruiterName: 'Carol HR',
      key_skills: 'React, TypeScript, Next.js, and PostgreSQL RLS',
      keySkills: 'React, TypeScript, Next.js, and PostgreSQL RLS',
      interview_round: 'Round 1: Introductory Screening',
      roundName: 'Round 1: Introductory Screening',
      interview_date: '2026-10-15',
      interviewDate: '2026-10-15',
      interview_time: '14:00 IST',
      interviewTime: '14:00 IST',
      meeting_link: 'https://meet.google.com/abc-hiring-tech',
      meetingUrl: 'https://meet.google.com/abc-hiring-tech',
    }

    const merged = { ...defaultSpecimen, ...specimenOverrides }
    const detected = this.extractVariables(templateText)
    const validation = this.validateVariables(templateText, merged)

    const rendered = this.render(templateText, merged)

    return {
      rendered,
      variablesUsed: merged,
      detectedVariables: detected,
      missingRequired: validation.missing,
    }
  }
}
