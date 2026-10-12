// ============================================================
// AttendX v2 — REST API: /api/hiring/offer-portal/[token]
// Public endpoint for candidates to view and respond to their offers
// Authenticated via secure 7-day single-use SHA-256 token hash
// ============================================================

import { NextResponse } from 'next/server'
import { getSupabaseServiceClient, isDevMockSupabase } from '@/lib/supabase/server'
import { OfferService } from '@/lib/hiring/offer-service'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    if (isDevMockSupabase()) {
      const { mockHiringStore } = await import('@/lib/hiring/mock-store')
      const mockData = mockHiringStore.getOfferByToken(token)
      if (!mockData || !mockData.offer) {
        return NextResponse.json({ error: 'Invalid or expired offer link' }, { status: 404 })
      }
      return NextResponse.json({
        valid: true,
        offer: {
          id: mockData.offer.id,
          offer_number: mockData.offer.offer_number || 'OFF-2026-001',
          designation: mockData.offer.designation,
          work_location: mockData.offer.work_location || 'Bengaluru, India',
          work_mode: mockData.offer.work_mode || 'HYBRID',
          joining_date: mockData.offer.joining_date,
          probation_months: mockData.offer.probation_months || 3,
          fixed_salary: mockData.offer.fixed_salary,
          variable_salary: mockData.offer.variable_salary,
          bonus: mockData.offer.bonus,
          total_ctc: mockData.offer.total_ctc,
          benefits: mockData.offer.benefits || ['Health Insurance', 'PF', 'Stock Options'],
          terms_and_conditions: mockData.offer.terms_and_conditions || 'Standard employment agreement.',
          status: mockData.offer.status,
        },
        candidate: {
          id: mockData.candidate?.id,
          full_name: `${mockData.candidate?.first_name || ''} ${mockData.candidate?.last_name || ''}`.trim() || 'Candidate',
          email: mockData.candidate?.email,
        },
        requisition: {
          title: mockData.requisition?.title,
          department: mockData.requisition?.department || 'Engineering',
        },
        expires_at: mockData.offer.expires_at || new Date(Date.now() + 7 * 86400000).toISOString(),
      })
    }

    const serviceClient = getSupabaseServiceClient()
    const result = await OfferService.validatePortalToken(serviceClient, token)

    if (!result.valid || !result.offer) {
      return NextResponse.json({ error: result.error || 'Invalid or expired offer link' }, { status: 404 })
    }

    const candidateFullName = result.candidate
      ? `${result.candidate.first_name || ''} ${result.candidate.last_name || ''}`.trim()
      : 'Candidate'

    return NextResponse.json({
      valid: true,
      offer: {
        id: result.offer.id,
        offer_number: result.offer.offer_number,
        designation: result.offer.designation,
        work_location: result.offer.work_location,
        work_mode: result.offer.work_mode,
        joining_date: result.offer.joining_date,
        probation_months: result.offer.probation_months,
        fixed_salary: result.offer.fixed_salary,
        variable_salary: result.offer.variable_salary,
        bonus: result.offer.bonus,
        total_ctc: result.offer.total_ctc,
        benefits: result.offer.benefits,
        terms_and_conditions: result.offer.terms_and_conditions,
        status: result.offer.status,
      },
      candidate: {
        id: result.candidate?.id,
        full_name: candidateFullName,
        email: result.candidate?.email,
      },
      requisition: {
        title: result.requisition?.title,
        department: result.requisition?.department,
      },
      expires_at: result.tokenRecord?.expires_at,
    })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Error loading offer details' }, { status })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const body = await request.json()
    const action = body.action || body.decision
    const comments = body.comments || body.decline_reason
    const candidateName = body.candidate_name || body.e_ack_name || 'Candidate'

    if (!['ACCEPT', 'DECLINE'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be ACCEPT or DECLINE' },
        { status: 400 }
      )
    }

    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1'
    const userAgent = request.headers.get('user-agent') || 'AttendX-OfferPortal'

    if (isDevMockSupabase()) {
      const { mockHiringStore } = await import('@/lib/hiring/mock-store')
      const mockResult = mockHiringStore.respondOffer(token, action, candidateName)
      return NextResponse.json(mockResult)
    }

    const serviceClient = getSupabaseServiceClient()
    const result = await OfferService.respondToOffer(serviceClient, {
      token,
      decision: action,
      decline_reason: comments,
      e_ack_name: candidateName,
      ip_address: ip,
      user_agent: userAgent,
    })

    return NextResponse.json(result)
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json(
      { error: err.message || 'Failed to submit response' },
      { status }
    )
  }
}
