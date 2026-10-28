// ============================================================
// AttendX v2 — REST API: /api/hiring/interviews/[id]
// GET: Fetch interview details with candidate evaluations
// PATCH: Update status, interviewer notes, reschedule, cancel, or decisions
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient, isDevMockSupabase } from '@/lib/supabase/server'
import { InterviewService } from '@/lib/hiring/interview-service'
import { isTableMissingError } from '@/lib/hiring/sourcing-service'
import { EmailTemplateService, InterviewTemplateKey } from '@/lib/hiring/email/email-template-service'
import { EmailService } from '@/lib/hiring/email/email-service'
import { getStructuredRoundConfig } from '@/lib/hiring/interview-rounds'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const caller = await ServerIdentity.getAuthoritativeCaller(['HR'], request)

    if (isDevMockSupabase()) {
      const { mockHiringStore } = await import('@/lib/hiring/mock-store')
      const interviews = mockHiringStore.listInterviews(caller.tenantId)
      const found = interviews.find((i: any) => i.id === id)
      if (found) {
        return NextResponse.json({ success: true, data: found })
      }
      return NextResponse.json({ error: 'Interview not found' }, { status: 404 })
    }

    try {
      const serviceClient = getSupabaseServiceClient()
      const { data: interview, error } = await serviceClient
        .from('interviews')
        .select(`
          *,
          candidate:candidates(*),
          application:job_applications(*),
          evaluations:candidate_evaluations(*)
        `)
        .eq('organization_id', caller.tenantId)
        .eq('id', id)
        .single()

      if (error) {
        if (isTableMissingError(error)) {
          const { mockHiringStore } = await import('@/lib/hiring/mock-store')
          const interviews = mockHiringStore.listInterviews(caller.tenantId)
          const found = interviews.find((i: any) => i.id === id)
          if (found) return NextResponse.json({ success: true, data: found })
        }
        return NextResponse.json({ error: 'Interview not found' }, { status: 404 })
      }

      if (!interview) {
        return NextResponse.json({ error: 'Interview not found' }, { status: 404 })
      }

      return NextResponse.json({ success: true, data: interview })
    } catch (dbErr: any) {
      if (isTableMissingError(dbErr)) {
        const { mockHiringStore } = await import('@/lib/hiring/mock-store')
        const interviews = mockHiringStore.listInterviews(caller.tenantId)
        const found = interviews.find((i: any) => i.id === id)
        if (found) return NextResponse.json({ success: true, data: found })
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

    let updated: any = null

    if (isDevMockSupabase()) {
      const { mockHiringStore } = await import('@/lib/hiring/mock-store')
      if (body.status === 'RESCHEDULED' && (body.new_start || body.scheduled_start)) {
        updated = mockHiringStore.rescheduleInterview(
          caller.tenantId,
          id,
          body.new_start || body.scheduled_start,
          body.new_end || body.scheduled_end,
          body.reason || body.notes
        )
      } else if (body.status === 'CANCELLED') {
        updated = mockHiringStore.cancelInterview(caller.tenantId, id, body.reason || body.notes)
      } else {
        const interview = mockHiringStore.interviews.find(i => i.id === id)
        if (interview) {
          if (body.status) interview.status = body.status
          if (body.notes) interview.notes = body.notes
          if (body.decision) interview.decision = body.decision
          updated = interview
        } else {
          return NextResponse.json({ error: 'Interview not found' }, { status: 404 })
        }
      }
    } else {
      const serviceClient = getSupabaseServiceClient()
      updated = await InterviewService.updateStatus(
        serviceClient,
        caller.tenantId,
        id,
        caller.userId,
        body.status,
        {
          notes: body.notes,
          decision: body.decision,
          decisionReason: body.decision_reason,
          newStart: body.new_start || body.scheduled_start,
          newEnd: body.new_end || body.scheduled_end,
          reason: body.reason,
        },
        { ip, userAgent }
      )
    }

    // Optional email notification dispatch on reschedule or cancel if requested
    if (body.send_notification && updated && (body.status === 'RESCHEDULED' || body.status === 'CANCELLED')) {
      try {
        const { mockHiringStore } = await import('@/lib/hiring/mock-store')
        const app = mockHiringStore.applications.find(a => a.id === updated.application_id)
        const cand = app ? mockHiringStore.candidates.find(c => c.id === app.candidate_id) : null
        const req = app ? mockHiringStore.requisitions.find(r => r.id === app.requisition_id) : null

        if (cand?.email) {
          const templateKey: InterviewTemplateKey =
            body.status === 'RESCHEDULED' ? 'interview-rescheduled' : 'interview-cancelled'
          const formatted = EmailTemplateService.formatDateTime(
            updated.scheduled_start,
            updated.timezone || 'Asia/Kolkata'
          )
          const cfg = getStructuredRoundConfig(updated.round_number || 1)
          const templateData = {
            candidateName: `${cand.first_name || ''} ${cand.last_name || ''}`.trim() || 'Candidate',
            companyName: 'AttendX',
            jobTitle: req?.title || 'Open Position',
            roundName: cfg.title,
            interviewDate: formatted.dateStr,
            interviewTime: formatted.timeStr,
            timezone: updated.timezone || 'Asia/Kolkata',
            duration: 20,
            interviewerNames: 'AttendX Interview Panel',
            meetingUrl: updated.meeting_link || 'Link will be provided before interview',
            recruiterName: 'HR Team',
            rescheduleReason: body.reason || '',
            cancelReason: body.reason || '',
          }
          await EmailService.sendInterviewEmail({
            interviewId: id,
            organizationId: caller.tenantId,
            recipientEmail: cand.email,
            templateKey,
            templateData,
          })
        }
      } catch (notifyErr) {
        console.warn('[Interview Notification] Notification skipped or failed:', notifyErr)
      }
    }

    return NextResponse.json({ success: true, data: updated })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
