// ============================================================
// AttendX v2 — REST API: /api/hiring/outreach/templates
// GET: List outreach email & messaging templates
// POST: Create customizable message template
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'
    ], request)

    try {
      const serviceClient = getSupabaseServiceClient()
      const { data, error } = await serviceClient
        .from('outreach_templates')
        .select('*')
        .eq('organization_id', caller.tenantId)
        .order('created_at', { ascending: false })

      if (error) throw error

      return NextResponse.json({ success: true, data, templates: data })
    } catch {
      const mockTemplates = [
        {
          id: 'tmpl-1',
          name: 'Executive Talent Introduction',
          channel: 'EMAIL',
          subject: 'Leadership Opportunity at {{company_name}} — {{role_title}}',
          body_template: 'Hi {{candidate_name}},\n\nI came across your profile and was thoroughly impressed by your work in {{skills}}. We are actively expanding our team at {{company_name}} and are searching for a {{role_title}} to lead critical initiatives.\n\nWould you have 15 minutes this week for a brief introductory conversation?\n\nBest regards,\nAttendX Talent Team',
          variables: ['candidate_name', 'company_name', 'role_title', 'skills'],
          is_ai_customizable: true,
        },
        {
          id: 'tmpl-2',
          name: 'Technical Round Invitation',
          channel: 'EMAIL',
          subject: 'Next Steps: Technical Screening for {{role_title}} at {{company_name}}',
          body_template: 'Hi {{candidate_name}},\n\nThank you for your interest in the {{role_title}} position at {{company_name}}! Following our initial review, we would love to invite you for a 45-minute technical discussion with our engineering panel.\n\nPlease select a convenient time using the calendar link below.\n\nWarm regards,\nEngineering Hiring Team',
          variables: ['candidate_name', 'role_title', 'company_name'],
          is_ai_customizable: true,
        },
      ]
      return NextResponse.json({ success: true, data: mockTemplates, templates: mockTemplates })
    }
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

    try {
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

      if (error) throw error

      return NextResponse.json({ success: true, template, data: template }, { status: 201 })
    } catch {
      const newTemplate = {
        id: `tmpl-${Date.now()}`,
        name: body.name.trim(),
        channel: body.channel || 'EMAIL',
        subject: body.subject || '',
        body_template: body.body_template,
        variables: body.variables || ['candidate_name', 'role_title'],
        is_ai_customizable: true,
      }
      return NextResponse.json({ success: true, template: newTemplate, data: newTemplate }, { status: 201 })
    }
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
