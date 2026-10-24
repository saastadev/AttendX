// ============================================================
// AttendX v2 — REST API: /api/hiring/offers
// GET: List job offers with candidate & application relations
// POST: Create a draft job offer
// Zero Fabrication: Propagates authentic errors and database queries
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient, isDevMockSupabase } from '@/lib/supabase/server'
import { OfferService } from '@/lib/hiring/offer-service'
import { PiiEncryption } from '@/lib/hiring/encryption'

export async function GET(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller(['HR'], request)

    const { searchParams } = new URL(request.url)
    const applicationId = searchParams.get('application_id')
    const candidateId = searchParams.get('candidate_id')

    let offers: any[] = []

    if (isDevMockSupabase()) {
      const { mockHiringStore } = await import('@/lib/hiring/mock-store')
      let mockOffers = mockHiringStore.listOffers(caller.tenantId)
      if (applicationId) mockOffers = mockOffers.filter((o: any) => o.application_id === applicationId)
      if (candidateId) mockOffers = mockOffers.filter((o: any) => o.candidate_id === candidateId)
      offers = mockOffers
    } else {
      const serviceClient = getSupabaseServiceClient()
      let query = serviceClient
        .from('job_offers')
        .select('*, candidate:candidates!candidate_id(id, first_name, last_name, email, phone), application:job_applications!application_id(id, stage, application_code)')
        .eq('organization_id', caller.tenantId)
        .order('created_at', { ascending: false })

      if (applicationId) query = query.eq('application_id', applicationId)
      if (candidateId) query = query.eq('candidate_id', candidateId)

      const { data, error } = await query
      if (error) {
        throw error
      }
      offers = data || []
    }

    // Role-based CTC masking if caller is not privileged + presentation formatting
    const formatted = (offers || []).map(o => ({
      ...o,
      candidate: o.candidate ? {
        ...o.candidate,
        full_name: o.candidate.full_name || `${o.candidate.first_name || ''} ${o.candidate.last_name || ''}`.trim(),
      } : null,
      fixed_salary: PiiEncryption.maskCtc(o.fixed_salary, caller.role),
      variable_salary: PiiEncryption.maskCtc(o.variable_salary, caller.role),
      bonus: PiiEncryption.maskCtc(o.bonus, caller.role),
      total_ctc: PiiEncryption.maskCtc(o.total_ctc, caller.role),
    }))

    return NextResponse.json({ offers: formatted, data: formatted })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}

export async function POST(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller(['HR'], request)

    const body = await request.json()

    if (isDevMockSupabase()) {
      const { mockHiringStore } = await import('@/lib/hiring/mock-store')
      mockHiringStore.ensureTenantSeeded(caller.tenantId)
      const newOffer = {
        id: `off-${Date.now()}`,
        organization_id: caller.tenantId,
        application_id: body.application_id,
        token: `mock-token-${Date.now()}`,
        status: 'DRAFT',
        total_ctc: body.total_ctc || 1800000,
        fixed_salary: body.fixed_salary || 1500000,
        variable_salary: body.variable_salary || 150000,
        bonus: body.bonus || 150000,
        joining_date: body.joining_date || '2026-11-01',
        designation: body.designation || 'Engineer',
        terms_and_conditions: body.terms_and_conditions || 'Standard offer',
        created_at: new Date().toISOString(),
      }
      mockHiringStore.offers.unshift(newOffer)
      return NextResponse.json({ success: true, offer: newOffer, data: newOffer }, { status: 201 })
    }

    const serviceClient = getSupabaseServiceClient()
    const offer = await OfferService.createOffer(
      serviceClient,
      caller.tenantId,
      caller.userId,
      body
    )

    return NextResponse.json({ success: true, offer, data: offer }, { status: 201 })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
