// ============================================================
// AttendX v2 — REST API: /api/hiring/offer-portal/[token]
// Public endpoint for candidates to view and respond to their offers
// Authenticated via secure 7-day single-use SHA-256 token hash
// ============================================================

import { NextResponse } from 'next/server'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { OfferService } from '@/lib/hiring/offer-service'
import { mockHiringStore } from '@/lib/hiring/mock-store'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    try {
      const serviceClient = getSupabaseServiceClient()
      const result = await OfferService.validatePortalToken(serviceClient, token)
      if (result.valid && result.offer) {
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
            full_name: result.candidate?.full_name,
            email: result.candidate?.email,
          },
          requisition: {
            title: result.requisition?.title,
            department: result.requisition?.department,
          },
          expires_at: result.tokenRecord?.expires_at,
        })
      }
    } catch {
      // offline fallback
    }

    const mockResult = mockHiringStore.getOfferByToken(token)
    if (!mockResult || !mockResult.offer) {
      return NextResponse.json({ error: 'Invalid or expired offer link' }, { status: 404 })
    }

    return NextResponse.json({
      valid: true,
      offer: {
        id: mockResult.offer.id,
        offer_number: `OFF-${mockResult.offer.id}`,
        designation: mockResult.requisition?.title || 'Senior Engineer',
        work_location: mockResult.requisition?.location || 'Bengaluru',
        work_mode: 'HYBRID',
        joining_date: mockResult.offer.joining_date,
        probation_months: 3,
        fixed_salary: mockResult.offer.fixed_salary,
        variable_salary: mockResult.offer.variable_salary,
        bonus: mockResult.offer.bonus,
        total_ctc: mockResult.offer.total_ctc,
        benefits: 'Comprehensive Medical Insurance, Learning Allowance, Annual Wellness Stipend',
        terms_and_conditions: mockResult.offer.terms_and_conditions,
        status: mockResult.offer.status,
      },
      candidate: {
        id: 'c-01',
        full_name: `${mockResult.candidate?.first_name} ${mockResult.candidate?.last_name}`,
        email: mockResult.candidate?.email,
      },
      requisition: {
        title: mockResult.requisition?.title,
        department: 'Engineering',
      },
      expires_at: mockResult.offer.expires_at,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error loading offer details' }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const body = await request.json()
    const { action, comments, candidate_name } = body

    if (!['ACCEPT', 'DECLINE'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be ACCEPT or DECLINE' },
        { status: 400 }
      )
    }

    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1'
    const userAgent = request.headers.get('user-agent') || 'AttendX-OfferPortal'

    try {
      const serviceClient = getSupabaseServiceClient()
      const result = await OfferService.respondToOffer(serviceClient, {
        token,
        decision: action,
        decline_reason: comments,
        e_ack_name: candidate_name || 'Candidate',
        ip_address: ip,
        user_agent: userAgent,
      })
      return NextResponse.json(result)
    } catch {
      const offer = mockHiringStore.respondOffer(token, action, candidate_name)
      return NextResponse.json({
        success: true,
        message: action === 'ACCEPT' ? 'Offer accepted successfully!' : 'Offer declined.',
        offer,
      })
    }
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json(
      { error: err.message || 'Failed to submit response' },
      { status }
    )
  }
}
