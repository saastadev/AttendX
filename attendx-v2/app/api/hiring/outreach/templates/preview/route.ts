// ============================================================
// AttendX v2 — REST API: /api/hiring/outreach/templates/preview
// POST: Preview Handlebars outreach template interpolation
// with safe specimen or candidate-specific variables.
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { TemplateEngine } from '@/lib/hiring/template-engine'
import { isDevMockSupabase, getSupabaseServiceClient } from '@/lib/supabase/server'
import { isTableMissingError } from '@/lib/hiring/sourcing-service'

export async function POST(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'
    ], request)

    const body = await request.json()
    let subjectTemplate = body.subject || ''
    let bodyTemplate = body.body_template || ''

    const { mockHiringStore } = await import('@/lib/hiring/mock-store')
    mockHiringStore.ensureTenantSeeded(caller.tenantId)

    // If template_id provided, look up template
    if (body.template_id && (!bodyTemplate || !subjectTemplate)) {
      let tpl = null
      if (!isDevMockSupabase()) {
        try {
          const serviceClient = getSupabaseServiceClient()
          const { data, error } = await serviceClient
            .from('outreach_templates')
            .select('*')
            .eq('id', body.template_id)
            .eq('organization_id', caller.tenantId)
            .maybeSingle()

          if (!error && data) tpl = data
        } catch {
          // Fall through
        }
      }

      if (!tpl) {
        tpl = mockHiringStore.getTemplate(caller.tenantId, body.template_id)
      }

      if (tpl) {
        subjectTemplate = subjectTemplate || tpl.subject || ''
        bodyTemplate = bodyTemplate || tpl.body_template || ''
      }
    }

    // Resolve candidate overrides if candidate_id provided
    const candidateOverrides: Record<string, any> = {}
    if (body.candidate_id) {
      let cand = null
      if (!isDevMockSupabase()) {
        try {
          const serviceClient = getSupabaseServiceClient()
          const { data, error } = await serviceClient
            .from('candidates')
            .select('*')
            .eq('id', body.candidate_id)
            .eq('organization_id', caller.tenantId)
            .maybeSingle()

          if (!error && data) cand = data
        } catch {
          // Fall through
        }
      }

      if (!cand) {
        const baseCandId = body.candidate_id.split('_')[0]
        cand = mockHiringStore.candidates.find(
          c => (c.id === body.candidate_id || c.id === baseCandId) && (c.organization_id === caller.tenantId || c.organization_id === '11111111-0000-0000-0000-000000000001')
        )
      }

      if (cand) {
        const fullName = cand.full_name || `${cand.first_name || ''} ${cand.last_name || ''}`.trim()
        candidateOverrides.candidate_name = fullName
        candidateOverrides.candidateName = fullName
        candidateOverrides.candidate_email = cand.email
        candidateOverrides.candidateEmail = cand.email
        candidateOverrides.candidate_phone = cand.phone
        candidateOverrides.role_title = cand.current_designation || 'Software Engineer'
        candidateOverrides.jobTitle = cand.current_designation || 'Software Engineer'
        if (cand.skills && cand.skills.length > 0) {
          candidateOverrides.key_skills = Array.isArray(cand.skills) ? cand.skills.join(', ') : cand.skills
          candidateOverrides.keySkills = candidateOverrides.key_skills
        }
      }
    }

    if (body.company_name) {
      candidateOverrides.company_name = body.company_name
      candidateOverrides.companyName = body.company_name
    }
    if (body.recruiter_name) {
      candidateOverrides.recruiter_name = body.recruiter_name
      candidateOverrides.recruiterName = body.recruiter_name
    }

    const previewResult = TemplateEngine.preview(bodyTemplate, candidateOverrides)
    const renderedSubject = subjectTemplate
      ? TemplateEngine.render(subjectTemplate, previewResult.variablesUsed)
      : null

    return NextResponse.json({
      success: true,
      subject: renderedSubject,
      body: previewResult.rendered,
      variables_used: previewResult.variablesUsed,
      detected_variables: previewResult.detectedVariables,
      missing_variables: previewResult.missingRequired,
    })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
