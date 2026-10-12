// ============================================================
// AttendX v2 — REST API: /api/hiring/outreach/templates
// GET: List outreach email & messaging templates
// POST: Create customizable message template
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient, isDevMockSupabase } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'
    ], request)

    if (isDevMockSupabase()) {
      const { mockHiringStore } = await import('@/lib/hiring/mock-store')
      const templates = mockHiringStore.listTemplates(caller.tenantId)
      return NextResponse.json({ success: true, data: templates, templates })
    }

    const serviceClient = getSupabaseServiceClient()
    const { data, error } = await serviceClient
      .from('outreach_templates')
      .select('*')
      .eq('organization_id', caller.tenantId)
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    const templates = data || []
    return NextResponse.json({ success: true, data: templates, templates })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}

export async function POST(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR'
    ], request)

    const body = await request.json()
    if (!body.name?.trim() || !body.body_template?.trim()) {
      return NextResponse.json({ error: 'name and body_template are required' }, { status: 400 })
    }

    if (isDevMockSupabase()) {
      const newTemplate = {
        id: `tmpl-${Date.now()}`,
        organization_id: caller.tenantId,
        name: body.name.trim(),
        channel: body.channel || 'EMAIL',
        subject: body.subject || null,
        body_template: body.body_template,
        variables: body.variables || ['candidate_name', 'role_title', 'company_name'],
        is_ai_customizable: body.is_ai_customizable !== false,
        created_at: new Date().toISOString(),
      }
      return NextResponse.json({ success: true, template: newTemplate, data: newTemplate }, { status: 201 })
    }

    const serviceClient = getSupabaseServiceClient()
    const { data: template, error } = await serviceClient
      .from('outreach_templates')
      .insert({
        organization_id: caller.tenantId,
        name: body.name.trim(),
        channel: body.channel || 'EMAIL',
        subject: body.subject || null,
        body_template: body.body_template,
        variables: body.variables || ['candidate_name', 'role_title', 'company_name'],
        is_ai_customizable: body.is_ai_customizable !== false,
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true, template, data: template }, { status: 201 })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
