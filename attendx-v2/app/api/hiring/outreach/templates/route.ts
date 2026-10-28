// ============================================================
// AttendX v2 — REST API: /api/hiring/outreach/templates
// GET: List outreach email & messaging templates (Tenant Scoped)
// POST: Create customizable message template with Handlebars variables
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient, isDevMockSupabase } from '@/lib/supabase/server'
import { isTableMissingError } from '@/lib/hiring/sourcing-service'
import { TemplateEngine } from '@/lib/hiring/template-engine'

export async function GET(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller(['HR'], request)

    if (!isDevMockSupabase()) {
      try {
        const serviceClient = getSupabaseServiceClient()
        const { data, error } = await serviceClient
          .from('outreach_templates')
          .select('*')
          .eq('organization_id', caller.tenantId)
          .order('created_at', { ascending: false })

        if (error && !isTableMissingError(error)) {
          throw error
        }

        if (data && data.length > 0) {
          return NextResponse.json({ success: true, data, templates: data })
        }
      } catch (dbErr: any) {
        if (!isTableMissingError(dbErr)) {
          console.error('[TemplatesAPI] DB fetch warning:', dbErr)
        }
      }
    }

    // Fallback to high-fidelity mock store
    const { mockHiringStore } = await import('@/lib/hiring/mock-store')
    mockHiringStore.ensureTenantSeeded(caller.tenantId)
    const templates = mockHiringStore.listTemplates(caller.tenantId)
    return NextResponse.json({ success: true, data: templates, templates })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}

export async function POST(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller(['HR'], request)

    const body = await request.json()
    if (!body.name?.trim() || !body.body_template?.trim()) {
      return NextResponse.json({ error: 'name and body_template are required' }, { status: 400 })
    }

    const channel = body.channel || 'EMAIL'
    const variables = Array.isArray(body.variables) && body.variables.length > 0
      ? body.variables
      : TemplateEngine.extractVariables(`${body.body_template} ${body.subject || ''}`)

    if (!isDevMockSupabase()) {
      try {
        const serviceClient = getSupabaseServiceClient()
        const { data: template, error } = await serviceClient
          .from('outreach_templates')
          .insert({
            organization_id: caller.tenantId,
            name: body.name.trim(),
            channel,
            subject: body.subject || null,
            body_template: body.body_template.trim(),
            variables,
            is_ai_customizable: body.is_ai_customizable !== false,
          })
          .select()
          .single()

        if (error && !isTableMissingError(error)) {
          throw error
        }

        if (template) {
          return NextResponse.json({ success: true, template, data: template }, { status: 201 })
        }
      } catch (dbErr: any) {
        if (!isTableMissingError(dbErr)) {
          throw dbErr
        }
      }
    }

    // Fallback to high-fidelity mock store
    const { mockHiringStore } = await import('@/lib/hiring/mock-store')
    mockHiringStore.ensureTenantSeeded(caller.tenantId)
    const template = mockHiringStore.createTemplate(caller.tenantId, {
      name: body.name.trim(),
      channel,
      subject: body.subject || null,
      body_template: body.body_template.trim(),
      variables,
      is_ai_customizable: body.is_ai_customizable !== false,
    })

    return NextResponse.json({ success: true, template, data: template }, { status: 201 })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
