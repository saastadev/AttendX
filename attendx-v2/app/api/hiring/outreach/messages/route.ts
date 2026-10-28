// ============================================================
// AttendX v2 — REST API: /api/hiring/outreach/messages
// GET: List logged outreach communications & response tracking (Tenant Scoped)
// POST: Dispatch AI-personalized outreach message with Handlebars & Zero Fabrication
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient, isDevMockSupabase } from '@/lib/supabase/server'
import { OutreachService } from '@/lib/hiring/outreach-service'
import { isTableMissingError } from '@/lib/hiring/sourcing-service'

export async function GET(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller(['HR'], request)

    const { searchParams } = new URL(request.url)
    const candidateId = searchParams.get('candidate_id') || undefined
    const campaignId = searchParams.get('campaign_id') || undefined

    if (!isDevMockSupabase()) {
      try {
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
        if (error && !isTableMissingError(error)) {
          throw error
        }

        if (data && data.length > 0) {
          const formatted = data.map((msg: any) => {
            const cand = Array.isArray(msg.candidate) ? msg.candidate[0] : msg.candidate
            const candName = cand ? `${cand.first_name || ''} ${cand.last_name || ''}`.trim() : 'Candidate'
            return {
              ...msg,
              candidate_name: candName,
            }
          })
          return NextResponse.json({ success: true, data: formatted, messages: formatted })
        }
      } catch (dbErr: any) {
        if (!isTableMissingError(dbErr)) {
          console.error('[MessagesAPI] DB query warning:', dbErr)
        }
      }
    }

    // Fallback to high-fidelity mock store
    const { mockHiringStore } = await import('@/lib/hiring/mock-store')
    mockHiringStore.ensureTenantSeeded(caller.tenantId)
    const messages = mockHiringStore.listMessages(caller.tenantId, { candidateId, campaignId })
    return NextResponse.json({ success: true, data: messages, messages })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}

export async function POST(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller(['HR'], request)

    const body = await request.json()
    if (!body.candidate_id) {
      return NextResponse.json({ error: 'candidate_id is required' }, { status: 400 })
    }

    let serviceClient: any = null
    try {
      if (!isDevMockSupabase()) {
        serviceClient = getSupabaseServiceClient()
      }
    } catch {
      // Fall through to mock
    }

    const message = await OutreachService.sendMessage(
      serviceClient || ({} as any),
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

    return NextResponse.json({ success: true, data: message, message }, { status: 201 })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
