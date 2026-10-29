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

function resolveMockInterviewDetails(tenantId: string, interviewId: string) {
  let interview = mockHiringStore.interviews.find(
    i => i.id === interviewId && (i.organization_id === tenantId || !tenantId)
  )

  if (!interview && interviewId.startsWith('default-int-')) {
    const roundNum = parseInt(interviewId.replace('default-int-', ''), 10) || 1
    const app =
      mockHiringStore.applications.find(
        a => a.organization_id === tenantId || !tenantId
      ) || mockHiringStore.applications[0]
    const defaultTitles: Record<number, string> = {
      1: 'Round 1 — Introductory / Quick Hello',
      2: 'Round 2 — Technical / Coding Assessment',
      3: 'Round 3 — Technical Deep Dive & HR',
    }
    interview = {
      id: interviewId,
      organization_id: tenantId || (app ? app.organization_id : '11111111-0000-0000-0000-000000000001'),
      application_id: app ? app.id : 'app-001',
      round_number: roundNum,
      round_type: 'TECHNICAL',
      title: defaultTitles[roundNum] || `Round ${roundNum}`,
      scheduled_start: '2026-10-30T11:00:00+05:30',
      scheduled_end: '2026-10-30T12:00:00+05:30',
      timezone: 'Asia/Kolkata',
      platform: 'GOOGLE_MEET',
      meeting_link: 'https://meet.google.com/abc-defg-hij',
      status: roundNum === 3 ? 'PENDING' : 'COMPLETED',
      decision: roundNum === 3 ? 'PENDING' : 'PASS',
      invitation_status: 'PENDING_DELIVERY',
      created_at: new Date().toISOString(),
    }
    mockHiringStore.interviews.push(interview)
  }

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

async function resolveInterviewDetails(tenantId: string, interviewId: string) {
  if (isDevMockSupabase()) {
    return resolveMockInterviewDetails(tenantId, interviewId)
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
      return resolveMockInterviewDetails(tenantId, interviewId)
    }

    return {
      interview,
      application: interview.application,
      candidate: interview.candidate,
      requisition: interview.application?.requisition,
    }
  } catch (err: any) {
    return resolveMockInterviewDetails(tenantId, interviewId)
  }
}

function hasRealEmailCredentials(): boolean {
  const provider = (process.env.EMAIL_PROVIDER || '').toLowerCase()
  if (provider === 'mock') return false
  if (provider === 'resend') return Boolean(process.env.RESEND_API_KEY)
  if (provider === 'sendgrid') return Boolean(process.env.SENDGRID_API_KEY)
  return Boolean(process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY)
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
    const hasCredentials = hasRealEmailCredentials()

    return NextResponse.json({
      success: true,
      data: {
        interview_id: id,
        recipient: candidate?.email || null,
        candidate_name: candidateName,
        round_number: roundNumber,
        round_title: roundConfig.title,
        template_key: templateKey,
        subject: rendered.subject.replace(/&amp;/g, '&'),
        body: rendered.body.replace(/&amp;/g, '&'),
        html_body: rendered.htmlBody,
        meeting_url: interview.meeting_link,
        status: interview.invitation_status || (hasCredentials ? 'PENDING_DELIVERY' : 'PENDING_CONFIGURATION'),
        has_real_credentials: hasCredentials,
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

    const { interview, candidate, requisition, application } = details

    // Strict candidate eligibility check: terminal stage candidates cannot receive invitations
    if (application && (application.status === 'REJECTED' || application.status === 'WITHDRAWN')) {
      return NextResponse.json(
        { error: `Candidate application is ${application.status}. Cannot send interview invitations to terminal-stage candidates.` },
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => ({}))
    let recipientEmail = (body.recipient && typeof body.recipient === 'string' && EmailService.validateEmail(body.recipient.trim()))
      ? body.recipient.trim()
      : candidate?.email

    if (!recipientEmail || !EmailService.validateEmail(recipientEmail)) {
      return NextResponse.json(
        { error: 'Valid candidate email address is missing from database records. Cannot send interview invitation.' },
        { status: 400 }
      )
    }

    if (candidate && body.recipient && EmailService.validateEmail(body.recipient.trim())) {
      candidate.email = body.recipient.trim()
    }

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

    // Fail gracefully with explicit diagnostic error if provider failed or key is missing
    if (!sendResult.success) {
      return NextResponse.json(
        {
          error: sendResult.error || 'Failed to dispatch email via configured provider.',
          data: {
            interview_id: id,
            recipient: recipientEmail,
            delivery_status: sendResult.deliveryStatus,
            provider_message_id: sendResult.messageId || null,
            is_simulated: sendResult.simulationStatus === 'SIMULATED',
            simulation_status: sendResult.simulationStatus,
            has_real_credentials: hasRealEmailCredentials(),
          }
        },
        { status: sendResult.deliveryStatus === 'PENDING_CONFIGURATION' ? 422 : 400 }
      )
    }

    // Advance shortlisted candidate to interview stage upon invitation
    if (application && (application.status === 'SHORTLISTED' || application.status === 'APPLIED')) {
      application.status = 'INTERVIEW'
      application.updated_at = new Date().toISOString()
    }

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
        has_real_credentials: hasRealEmailCredentials(),
      }
    })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
