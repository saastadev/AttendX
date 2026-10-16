// ============================================================
// AttendX v2 — REST API: /api/hiring/candidates
// GET: List candidates with skill filtering, search, and role-based CTC masking
// POST: Create candidate with duplicate email/phone prevention
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient, isDevMockSupabase } from '@/lib/supabase/server'
import { CandidateService } from '@/lib/hiring/candidate-service'

export async function GET(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'
    ], request)

    const { searchParams } = new URL(request.url)
    const filters = {
      search: searchParams.get('search') || undefined,
      skill: searchParams.get('skill') || undefined,
      source: searchParams.get('source') || undefined,
      location: searchParams.get('location') || undefined,
      min_experience: searchParams.get('min_experience') ? Number(searchParams.get('min_experience')) : undefined,
      page: searchParams.get('page') ? Number(searchParams.get('page')) : undefined,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined,
      role: caller.role,
    }

    if (isDevMockSupabase()) {
      const { mockHiringStore } = await import('@/lib/hiring/mock-store')
      return NextResponse.json(mockHiringStore.listCandidates(caller.tenantId, filters))
    }

    const serviceClient = getSupabaseServiceClient()
    const result = await CandidateService.list(serviceClient, caller.tenantId, filters)
    return NextResponse.json(result)
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
    if (!body.first_name?.trim() || !body.last_name?.trim()) {
      return NextResponse.json(
        { error: 'first_name and last_name are required' },
        { status: 400 }
      )
    }

    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1'
    const userAgent = request.headers.get('user-agent') || 'AttendX-Client'

    if (isDevMockSupabase()) {
      const { mockHiringStore } = await import('@/lib/hiring/mock-store')
      mockHiringStore.ensureTenantSeeded(caller.tenantId)
      const newCand = {
        id: `cand-${Date.now()}`,
        organization_id: caller.tenantId,
        first_name: body.first_name.trim(),
        last_name: body.last_name.trim(),
        full_name: `${body.first_name.trim()} ${body.last_name.trim()}`,
        email: body.email?.trim().toLowerCase() || null,
        phone: body.phone?.trim() || null,
        current_company: body.current_company || null,
        current_designation: body.current_designation || null,
        total_experience_years: body.total_experience_years || 0,
        location: body.location || null,
        source: body.source || 'CAREER_SITE',
        skills: (body.skills || []).map((s: any) => typeof s === 'string' ? s : s.skill_name),
        created_at: new Date().toISOString(),
      }
      mockHiringStore.candidates.unshift(newCand)
      return NextResponse.json({ success: true, data: newCand }, { status: 201 })
    }

    const serviceClient = getSupabaseServiceClient()
    const candidate = await CandidateService.create(
      serviceClient,
      caller.tenantId,
      caller.userId,
      body,
      { ip, userAgent }
    )
    return NextResponse.json({ success: true, data: candidate }, { status: 201 })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
