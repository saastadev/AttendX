// ============================================================
// AttendX v2 — REST API: /api/hiring/interviews/[id]/invitation
// GET: Preview rendered Handlebars email invitation template
// POST: Dispatch or save interview invitation email (Zero Fabrication)
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient, isDevMockSupabase } from '@/lib/supabase/server'
import { mockHiringStore } from '@/lib/hiring/mock-store'
import { EmailTemplateService, InterviewTemplateKey, InterviewTemplateData } from '@/lib/hiring/email/email-template-service'
import { EmailService } from '@/lib/hiring/email/email-service'
import { getStructuredRoundConfig } from '@/lib/hiring/interview-rounds'
import { isTableMissingError } from '@/lib/hiring/sourcing-service'

async function resolveInterviewDetails(tenantId: string, interviewId: string) {
  if (isDevMockSupabase()) {
    const interview = mockHiringStore.interviews.find(i => i.id === interviewId && (i.organization_id === tenantId || !tenantId))
    if (!interview) return null
    const app = mockHiringStore.applications.find(a => a.id === interview.application_id)
    const cand = app ? mockHiringStore.candidates.find(c => c.id === app.candidate_id) : null
    const req = app ? mockHiringStore.requisitions.find(r => r.id === app.requisition_id) : null
    return {
      interview,
      application: app,
      candidate: cand,
      requisition: req,
    }
  }

  try {
    const serviceClient = getSupabaseServiceClient()
    const { data: interview, error } = await serviceClient
      .from('interviews')
      .select(`
        *,
        candidate:candidates(*),
        application:job_applications(*, requisition:job_requisitions(*))
      `)
      .eq('organization_id', tenantId)
      .eq('id', interviewId)
      .single()

    if (error || !interview) {
      if (isTableMissingError(error)) {
        const mockInt = mockHiringStore.interviews.find(i => i.id === interviewId && (i.organization_id === tenantId || !tenantId))
        if (mockInt) {
          const app = mockHiringStore.applications.find(a => a.id === mockInt.application_id)
          const cand = app ? mockHiringStore.candidates.find(c => c.id === app.candidate_id) : null
          const req = app ? mockHiringStore.requisitions.find(r => r.id === app.requisition_id) : null
          return { interview: mockInt, application: app, candidate: cand, requisition: req }
        }
      }
      return null
    }

    return {
      interview,
      application: interview.application,
      candidate: interview.candidate,
      requisition: interview.application?.requisition,
    }
  } catch (err: any) {
    if (isTableMissingError(err)) {
      const mockInt = mockHiringStore.interviews.find(i => i.id === interviewId && (i.organization_id === tenantId || !tenantId))
      if (mockInt) {
        const app = mockHiringStore.applications.find(a => a.id === mockInt.application_id)
        const cand = app ? mockHiringStore.candidates.find(c => c.id === app.candidate_id) : null
        const req = app ? mockHiringStore.requisitions.find(r => r.id === app.requisition_id) : null
        return { interview: mockInt, application: app, candidate: cand, requisition: req }
      }
    }
    return null
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'
    ], request)

    const details = await resolveInterviewDetails(caller.tenantId, id)
    if (!details || !details.interview) {
      return NextResponse.json({ error: 'Interview not found' }, { status: 404 })
    }

    const { interview, candidate, requisition } = details
    const roundNumber = interview.round_number || 1
    const roundConfig = getStructuredRoundConfig(roundNumber)

    // Parse URL query parameters to support template previews (e.g., round-1, round-2, round-3, rescheduled, cancelled)
    const url = new URL(request.url)
    const requestedTemplate = url.searchParams.get('template_key') as InterviewTemplateKey | null
    const templateKey: InterviewTemplateKey =
      requestedTemplate && ['interview-round-1', 'interview-round-2', 'interview-round-3', 'interview-rescheduled', 'interview-cancelled'].includes(requestedTemplate)
        ? requestedTemplate
        : EmailTemplateService.getTemplateKeyForRound(roundNumber)

    const timezone = interview.timezone || 'Asia/Kolkata'
    const formatted = EmailTemplateService.formatDateTime(interview.scheduled_start, timezone)

    const startDate = new Date(interview.scheduled_start)
    const durationMinutes = interview.scheduled_end
      ? Math.round((new Date(interview.scheduled_end).getTime() - startDate.getTime()) / 60000)
      : roundConfig.default_duration_minutes

    const candidateName = candidate
      ? `${candidate.first_name || ''} ${candidate.last_name || ''}`.trim() || 'Candidate'
      : 'Candidate'

    const jobTitle = requisition?.title || 'Open Position'
    const companyName = 'AttendX'
    const meetingUrl = interview.meeting_link || 'Link will be provided before interview'
    const agendaText = roundConfig.default_agenda.map(item => `• ${item}`).join('\n')

    const templateData: InterviewTemplateData = {
      candidateName,
      companyName,
      jobTitle,
      roundName: roundConfig.title,
      interviewDate: formatted.dateStr,
      interviewTime: formatted.timeStr,
      timezone,
      duration: durationMinutes,
      interviewerNames: 'AttendX Interview Panel',
      interviewAgenda: agendaText,
      meetingUrl,
      recruiterName: 'HR Team',
      rescheduleReason: interview.reschedule_reason || '',
      cancelReason: interview.cancel_reason || '',
    }

    const rendered = EmailTemplateService.render(templateKey, templateData)

    return NextResponse.json({
      success: true,
      data: {
        interview_id: id,
        recipient: candidate?.email || null,
        candidate_name: candidateName,
        round_number: roundNumber,
        round_title: roundConfig.title,
        template_key: templateKey,
        subject: rendered.subject,
        body: rendered.body,
        html_body: rendered.htmlBody,
        meeting_url: interview.meeting_link,
        status: interview.invitation_status || (process.env.SENDGRID_API_KEY ? 'PENDING_DELIVERY' : 'PENDING_CONFIGURATION'),
        has_real_credentials: Boolean(process.env.SENDGRID_API_KEY),
      }
    })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'
    ], request)

    const details = await resolveInterviewDetails(caller.tenantId, id)
    if (!details || !details.interview) {
      return NextResponse.json({ error: 'Interview not found' }, { status: 404 })
    }

    const { interview, candidate, requisition } = details
    const recipientEmail = candidate?.email

    if (!recipientEmail) {
      return NextResponse.json(
        { error: 'Candidate email address is missing. Cannot send interview invitation.' },
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const subject = body.subject || `Interview Invitation: ${requisition?.title || 'AttendX'}`
    const emailBody = body.body || `Your interview is scheduled.`
    const isDraft = Boolean(body.is_draft)
    const idempotencyKey = body.idempotency_key

    const sendResult = await EmailService.sendInterviewEmail({
      interviewId: id,
      organizationId: caller.tenantId,
      recipientEmail,
      customSubject: subject,
      customBody: emailBody,
      isDraft,
      idempotencyKey,
    })

    // Update interview invitation status in local model
    interview.invitation_status = sendResult.deliveryStatus
    interview.invitation_subject = sendResult.renderedSubject
    interview.invitation_body = sendResult.renderedBody
    interview.updated_at = new Date().toISOString()

    // If Supabase table exists, try persisting
    try {
      const serviceClient = getSupabaseServiceClient()
      await serviceClient
        .from('interviews')
        .update({
          notes: (interview.notes ? interview.notes + '\n' : '') + `Invitation Status: ${sendResult.deliveryStatus} (MsgID: ${sendResult.messageId})`,
        })
        .eq('id', id)
        .eq('organization_id', caller.tenantId)
    } catch {
      // Non-fatal table fallback
    }

    return NextResponse.json({
      success: true,
      data: {
        interview_id: id,
        recipient: recipientEmail,
        delivery_status: sendResult.deliveryStatus,
        provider_message_id: sendResult.messageId,
        is_simulated: sendResult.simulationStatus === 'SIMULATED',
        simulation_status: sendResult.simulationStatus,
        has_real_credentials: Boolean(process.env.SENDGRID_API_KEY),
      }
    })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
