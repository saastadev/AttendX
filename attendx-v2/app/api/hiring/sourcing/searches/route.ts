// ============================================================
// AttendX v2 — REST API: /api/hiring/sourcing/searches
// GET: List previous sourcing searches
// POST: Execute multi-platform AI sourcing search
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { SourcingService, isTableMissingError } from '@/lib/hiring/sourcing-service'

export async function GET(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller(['HR'], request)

    const { searchParams } = new URL(request.url)
    const requisitionId = searchParams.get('requisition_id') || undefined

    const serviceClient = getSupabaseServiceClient()
    let query = serviceClient
      .from('sourcing_searches')
      .select('*, candidates:sourced_candidates(*)')
      .eq('organization_id', caller.tenantId)

    if (requisitionId) {
      query = query.eq('requisition_id', requisitionId)
    }

    query = query.order('created_at', { ascending: false })

    const { data, error } = await query
    if (error) {
      if (isTableMissingError(error)) {
        return NextResponse.json({ success: true, data: [], searches: [] })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [], searches: data || [] })
  } catch (err: any) {
    if (isTableMissingError(err)) {
      return NextResponse.json({ success: true, data: [], searches: [] })
    }
    console.error('[API /api/hiring/sourcing/searches GET] Error:', err.message || err)
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}

export async function POST(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller(['HR'], request)

    const body = await request.json()
    const roleTitle = body.role_title || 'Software Engineer'
    const skills = Array.isArray(body.skills) ? body.skills : ['React', 'TypeScript']
    const platform = body.platform || (body.platforms && body.platforms[0]) || 'LINKEDIN'

    const serviceClient = getSupabaseServiceClient()
    const result = await SourcingService.executeSearch(
      serviceClient,
      caller.tenantId,
      caller.userId,
      {
        searchTitle: body.search_title || `${roleTitle} Search`,
        requisitionId: body.requisition_id,
        roleTitle,
        skills,
        minExperience: body.min_experience,
        maxExperience: body.max_experience,
        location: body.location,
        qualifications: body.qualifications || (body.qualification ? [body.qualification] : undefined),
        qualification: body.qualification,
        limit: body.limit,
        offset: body.offset,
        platforms: body.platforms || [platform],
        simulateError: Boolean(body.simulate_error || body.simulateError),
        simulateRateLimit: Boolean(body.simulate_rate_limit || body.simulateRateLimit),
      }
    )

    return NextResponse.json({
      success: true,
      search: result.search,
      candidates: result.candidates,
      providerStatuses: result.providerStatuses,
      data: result,
    }, { status: 201 })
  } catch (err: any) {
    console.error('[API /api/hiring/sourcing/searches POST] Error:', err.message || err)
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
