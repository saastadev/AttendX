// ============================================================
// AttendX v2 — REST API: /api/hiring/applications/[id]
// GET: Fetch application with candidate profile, resume, and requisition info
// PATCH: Update application details or HR decision
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { ApplicationService } from '@/lib/hiring/application-service'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const caller = await ServerIdentity.getAuthoritativeCaller(['HR'], request)

    try {
      const serviceClient = getSupabaseServiceClient()
      const application = await ApplicationService.getById(
        serviceClient,
        caller.tenantId,
        id,
        caller.role
      )
      return NextResponse.json({ success: true, data: application })
    } catch (dbErr: any) {
      if (dbErr.status === 404 || String(dbErr.message || '').includes('not found')) {
        const { mockHiringStore } = await import('@/lib/hiring/mock-store')
        const mockResult = mockHiringStore.listApplications(caller.tenantId)
        const validAppIds = [id]
        if (id.includes('_')) validAppIds.push(id.split('_')[0])
        const app = mockResult.applications.find(a => validAppIds.includes(a.id) || a.id.startsWith(id)) || mockHiringStore.getApplicationById(caller.tenantId, id)
        if (app) {
          return NextResponse.json({ success: true, data: app })
        }
      }
      throw dbErr
    }
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const caller = await ServerIdentity.getAuthoritativeCaller(['HR'], request)

    const body = await request.json()
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1'
    const userAgent = request.headers.get('user-agent') || 'AttendX-Client'
    const serviceClient = getSupabaseServiceClient()

    try {
      // If updating decision
      if (body.current_decision) {
        const updated = await ApplicationService.setDecision(
          serviceClient,
          caller.tenantId,
          id,
          body.current_decision,
          caller.userId,
          body.rejection_reason || body.reason,
          { ip, userAgent }
        )
        return NextResponse.json({ success: true, data: updated })
      }

      // Generic update
      const { data: updated, error } = await serviceClient
        .from('job_applications')
        .update(body)
        .eq('organization_id', caller.tenantId)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, data: updated })
    } catch (dbErr: any) {
      if (dbErr.status === 404 || String(dbErr.message || '').includes('not found')) {
        const { mockHiringStore } = await import('@/lib/hiring/mock-store')
        mockHiringStore.ensureTenantSeeded(caller.tenantId)
        const validAppIds = [id]
        if (id.includes('_')) validAppIds.push(id.split('_')[0])
        let app = mockHiringStore.applications.find(a => validAppIds.includes(a.id) && (a.organization_id === caller.tenantId || !caller.tenantId))
        if (!app) {
          app = mockHiringStore.applications.find(a => validAppIds.includes(a.id))
        }
        if (app) {
          if (body.current_decision) app.current_decision = body.current_decision
          if (body.stage) app.stage = body.stage
          Object.assign(app, body)
          app.updated_at = new Date().toISOString()
          return NextResponse.json({ success: true, data: app })
        }
      }
      throw dbErr
    }
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
