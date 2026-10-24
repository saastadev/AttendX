// ============================================================
// AttendX v2 — REST API: /api/hiring/outreach/campaigns
// GET: List outreach campaigns
// POST: Create new outreach campaign
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient, isDevMockSupabase } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller(['HR'], request)

    if (isDevMockSupabase()) {
      const { mockHiringStore } = await import('@/lib/hiring/mock-store')
      const campaigns = mockHiringStore.listCampaigns(caller.tenantId)
      return NextResponse.json({ success: true, data: campaigns, campaigns })
    }

    const serviceClient = getSupabaseServiceClient()
    const { data, error } = await serviceClient
      .from('outreach_campaigns')
      .select('*, requisition:job_requisitions(id, title)')
      .eq('organization_id', caller.tenantId)
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    const campaigns = data || []
    return NextResponse.json({ success: true, data: campaigns, campaigns })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}

export async function POST(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller(['HR'], request)

    const body = await request.json()
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    if (isDevMockSupabase()) {
      const newCampaign = {
        id: `camp-${Date.now()}`,
        organization_id: caller.tenantId,
        requisition_id: body.requisition_id || null,
        name: body.name.trim(),
        channels: body.channels || ['EMAIL'],
        status: body.status || 'DRAFT',
        sent_count: 0,
        opened_count: 0,
        replied_count: 0,
        response_rate: 0,
        created_at: new Date().toISOString(),
      }
      return NextResponse.json({ success: true, campaign: newCampaign, data: newCampaign }, { status: 201 })
    }

    const serviceClient = getSupabaseServiceClient()
    const { data: campaign, error } = await serviceClient
      .from('outreach_campaigns')
      .insert({
        organization_id: caller.tenantId,
        requisition_id: body.requisition_id || null,
        name: body.name.trim(),
        channels: body.channels || ['EMAIL'],
        status: body.status || 'DRAFT',
        created_by: caller.userId,
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true, campaign, data: campaign }, { status: 201 })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
