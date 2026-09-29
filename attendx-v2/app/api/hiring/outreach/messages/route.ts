// ============================================================
// AttendX v2 — REST API: /api/hiring/outreach/messages
// GET: List logged outreach communications & response tracking
// POST: Dispatch AI-personalized outreach message
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { OutreachService } from '@/lib/hiring/outreach-service'

export async function GET(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'
    ], request)

    const { searchParams } = new URL(request.url)
    const candidateId = searchParams.get('candidate_id') || undefined
    const campaignId = searchParams.get('campaign_id') || undefined

    const serviceClient = getSupabaseServiceClient()
    let query = serviceClient
      .from('outreach_messages')
      .select('*, candidate:candidates(id, first_name, last_name, email)')
      .eq('organization_id', caller.tenantId)

    if (candidateId) {
      query = query.eq('candidate_id', candidateId)
    }
    if (campaignId) {
      query = query.eq('campaign_id', campaignId)
    }

    query = query.order('created_at', { ascending: false })

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
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
    if (!body.candidate_id) {
      return NextResponse.json({ error: 'candidate_id is required' }, { status: 400 })
    }

    const serviceClient = getSupabaseServiceClient()
    const message = await OutreachService.sendMessage(
      serviceClient,
      caller.tenantId,
      caller.userId,
      {
        campaignId: body.campaign_id,
        candidateId: body.candidate_id,
        templateId: body.template_id,
        customSubject: body.subject,
        customBody: body.body,
        channel: body.channel || 'EMAIL',
      }
    )

    return NextResponse.json({ success: true, data: message }, { status: 201 })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
