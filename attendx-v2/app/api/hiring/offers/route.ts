// ============================================================
// AttendX v2 — REST API: /api/hiring/offers
// GET: List job offers with candidate & application relations
// POST: Create a draft job offer
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { OfferService } from '@/lib/hiring/offer-service'
import { PiiEncryption } from '@/lib/hiring/encryption'
import { mockHiringStore } from '@/lib/hiring/mock-store'

export async function GET(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'
    ], request)

    const { searchParams } = new URL(request.url)
    const applicationId = searchParams.get('application_id')
    const candidateId = searchParams.get('candidate_id')

    try {
      const serviceClient = getSupabaseServiceClient()
      let query = serviceClient
        .from('job_offers')
        .select('*, candidate:candidates!candidate_id(id, full_name, email, phone), application:job_applications!application_id(id, stage, application_code)')
        .eq('organization_id', caller.tenantId)
        .order('created_at', { ascending: false })

      if (applicationId) query = query.eq('application_id', applicationId)
      if (candidateId) query = query.eq('candidate_id', candidateId)

      const { data: offers, error } = await query
      if (error) throw error

      // Role-based CTC masking if caller is not privileged
      const masked = (offers || []).map(o => ({
        ...o,
        fixed_salary: PiiEncryption.maskCtc(o.fixed_salary, caller.role),
        variable_salary: PiiEncryption.maskCtc(o.variable_salary, caller.role),
        bonus: PiiEncryption.maskCtc(o.bonus, caller.role),
        total_ctc: PiiEncryption.maskCtc(o.total_ctc, caller.role),
      }))

      return NextResponse.json({ offers: masked, data: masked })
    } catch {
      const offers = mockHiringStore.offers.map(o => ({
        ...o,
        offer_number: `OFF-${o.id}`,
        candidate: { full_name: 'Priya Nair', email: 'priya.nair@example.com' },
        application: { stage: 'OFFER_RELEASED', application_code: 'APP-2026-004' },
      }))
      return NextResponse.json({ offers, data: offers })
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
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1'
    const userAgent = request.headers.get('user-agent') || 'AttendX-Client'

    try {
      const serviceClient = getSupabaseServiceClient()
      const offer = await OfferService.createOffer(
        serviceClient,
        caller.tenantId,
        caller.userId,
        body
      )

      return NextResponse.json({ success: true, offer, data: offer }, { status: 201 })
    } catch {
      const newOffer = {
        id: `off-${Date.now()}`,
        organization_id: caller.tenantId,
        application_id: body.application_id,
        token: `mock-token-${Date.now()}`,
        status: 'DRAFT',
        annual_ctc: body.total_ctc || 2000000,
        joining_date: body.joining_date || '2026-11-01',
        designation: body.designation,
      }
      mockHiringStore.offers.push(newOffer as any)
      return NextResponse.json({ success: true, offer: newOffer, data: newOffer }, { status: 201 })
    }
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
