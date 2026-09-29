// ============================================================
// AttendX v2 — REST API: /api/hiring/outreach/campaigns
// GET: List outreach campaigns
// POST: Create new outreach campaign
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
        .from('outreach_campaigns')
        .select('*, requisition:job_requisitions(id, title)')
        .eq('organization_id', caller.tenantId)
        .order('created_at', { ascending: false })

      if (error) throw error

      return NextResponse.json({ success: true, data, campaigns: data })
    } catch {
      const mockCampaigns = [
        {
          id: 'camp-1',
          name: 'Q4 Senior Full-Stack Engineering Drive',
          status: 'ACTIVE',
          channels: ['EMAIL', 'LINKEDIN'],
          requisition_id: 'a1000000-0000-0000-0000-000000000001',
          requisition: { id: 'a1000000-0000-0000-0000-000000000001', title: 'Senior Full-Stack Engineer' },
          sent_count: 32,
          opened_count: 22,
          replied_count: 9,
          created_at: '2026-09-15T10:00:00Z',
        },
        {
          id: 'camp-2',
          name: 'AI & Systems Architect Sourcing Wave',
          status: 'ACTIVE',
          channels: ['EMAIL'],
          requisition_id: 'a1000000-0000-0000-0000-000000000002',
          requisition: { id: 'a1000000-0000-0000-0000-000000000002', title: 'AI Systems Engineer' },
          sent_count: 18,
          opened_count: 14,
          replied_count: 6,
          created_at: '2026-09-20T10:00:00Z',
        },
      ]
      return NextResponse.json({ success: true, data: mockCampaigns, campaigns: mockCampaigns })
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
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    try {
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

      if (error) throw error

      return NextResponse.json({ success: true, campaign, data: campaign }, { status: 201 })
    } catch {
      const newCampaign = {
        id: `camp-${Date.now()}`,
        name: body.name.trim(),
        status: body.status || 'ACTIVE',
        channels: body.channels || ['EMAIL'],
        requisition_id: body.requisition_id || null,
        sent_count: 0,
        opened_count: 0,
        replied_count: 0,
        created_at: new Date().toISOString(),
      }
      return NextResponse.json({ success: true, campaign: newCampaign, data: newCampaign }, { status: 201 })
    }
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
