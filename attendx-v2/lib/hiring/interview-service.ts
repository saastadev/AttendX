// ============================================================
// AttendX v2 — Hiring Module: Interview Scheduling Service
// Conflict detection, meeting generation, ICS invites,
// and automated candidate communication
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { MeetingProviderFactory, IcsCalendarGenerator } from './meeting-provider'
import { EmailProviderFactory, TwilioWhatsAppSmsProvider } from './email-provider'
import { HiringAuditLogger } from './audit-logger'
import type { Interview, InterviewRoundType, InterviewPlatform, InterviewStatus } from '../../types/hiring'

export interface ScheduleInterviewInput {
  application_id: string
  round_number?: number
  round_type?: InterviewRoundType
  title: string
  scheduled_start: string
  scheduled_end: string
  timezone?: string
  platform: InterviewPlatform
  custom_meeting_link?: string
  interviewer_ids: string[]
  notes?: string
}

export class InterviewService {
  /**
   * Detects schedule conflicts across assigned interviewers
   */
  static async detectConflicts(
    client: SupabaseClient,
    organizationId: string,
    interviewerIds: string[],
    startIso: string,
    endIso: string,
    excludeInterviewId?: string
  ): Promise<{ hasConflict: boolean; conflictingInterviews: any[] }> {
    let query = client
      .from('interviews')
      .select('id, title, scheduled_start, scheduled_end, interviewer_ids')
      .eq('organization_id', organizationId)
      .eq('status', 'SCHEDULED')
      // Overlap: existing.start < new.end AND existing.end > new.start
      .lt('scheduled_start', endIso)
      .gt('scheduled_end', startIso)

    if (excludeInterviewId) {
      query = query.neq('id', excludeInterviewId)
    }

    const { data: overlapping } = await query

    const conflicting: any[] = []
    if (overlapping && overlapping.length > 0) {
      for (const item of overlapping) {
        const itemInterviewers = Array.isArray(item.interviewer_ids) ? item.interviewer_ids : []
        const hasSharedInterviewer = interviewerIds.some(id => itemInterviewers.includes(id))
        if (hasSharedInterviewer) {
          conflicting.push(item)
        }
      }
    }

    return {
      hasConflict: conflicting.length > 0,
      conflictingInterviews: conflicting,
    }
  }

  /**
   * Schedule interview with automatic meeting generation, ICS attachment, and communication
   */
  static async schedule(
    client: SupabaseClient,
    organizationId: string,
    userId: string,
    input: ScheduleInterviewInput,
    context?: { ip?: string; userAgent?: string }
  ): Promise<Interview> {
    // 1. Fetch application and candidate details
    const { data: application, error: appErr } = await client
      .from('job_applications')
      .select(`
        *,
        candidate:candidates(*),
        requisition:job_requisitions(id, title, requisition_code)
      `)
      .eq('organization_id', organizationId)
      .eq('id', input.application_id)
      .single()

    if (appErr || !application) {
      throw new Error(`Application '${input.application_id}' not found.`)
    }

    // 2. Check for interviewer conflicts
    const conflictCheck = await this.detectConflicts(
      client,
      organizationId,
      input.interviewer_ids,
      input.scheduled_start,
      input.scheduled_end
    )

    if (conflictCheck.hasConflict) {
      const conflictErr = new Error(
        `Interviewer scheduling conflict detected. One or more interviewers are booked for another interview at this time.`
      ) as any
      conflictErr.status = 409
      conflictErr.conflicts = conflictCheck.conflictingInterviews
      throw conflictErr
    }

    // 3. Generate meeting link via meeting provider
    const meetingProvider = MeetingProviderFactory.getProvider(input.platform)
    const meetingResult = await meetingProvider.createMeeting({
      title: input.title,
      scheduledStart: input.scheduled_start,
      scheduledEnd: input.scheduled_end,
      timezone: input.timezone || 'UTC',
      attendeeEmails: [application.candidate?.email].filter(Boolean),
      platform: input.platform,
      customLink: input.custom_meeting_link,
    })

    // 4. Create interview record
    const { data: interview, error: insertErr } = await client
      .from('interviews')
      .insert({
        organization_id: organizationId,
        application_id: input.application_id,
        candidate_id: application.candidate_id,
        round_number: input.round_number || 1,
        round_type: input.round_type || 'TECHNICAL',
        title: input.title.trim(),
        scheduled_start: input.scheduled_start,
        scheduled_end: input.scheduled_end,
        timezone: input.timezone || 'UTC',
        platform: input.platform,
        meeting_link: meetingResult.joinUrl,
        meeting_provider_event_id: meetingResult.providerEventId,
        interviewer_ids: input.interviewer_ids,
        status: 'SCHEDULED',
        notes: input.notes || null,
        decision: 'PENDING',
      })
      .select()
      .single()

    if (insertErr || !interview) {
      throw new Error(`Failed to schedule interview: ${insertErr?.message}`)
    }

    // 5. Automatic Candidate Communication (Email + SMS/WhatsApp Stub)
    if (application.candidate?.email && application.candidate.consent_status !== 'WITHDRAWN') {
      const candidateEmail = application.candidate.email
      const candidateName = `${application.candidate.first_name} ${application.candidate.last_name}`
      const roleTitle = application.requisition?.title || 'Applied Position'

      const icsContent = IcsCalendarGenerator.generate({
        uid: interview.id,
        title: `${input.title} - ${roleTitle} Interview`,
        description: `Interview round with AttendX for ${roleTitle}.\nJoin link: ${meetingResult.joinUrl}`,
        location: meetingResult.joinUrl,
        startTime: input.scheduled_start,
        endTime: input.scheduled_end,
        organizerEmail: 'hiring@attendx.io',
        attendeeEmail: candidateEmail,
      })

      const emailSubject = `Interview Scheduled: ${roleTitle} (${input.title})`
      const emailBody = `
Dear ${candidateName},

Your interview for the ${roleTitle} position has been scheduled.

Details:
• Round: ${input.round_type || 'Technical'} (Round ${input.round_number || 1})
• Date & Time: ${new Date(input.scheduled_start).toLocaleString('en-US', { timeZone: input.timezone || 'UTC' })} (${input.timezone || 'UTC'})
• Platform: ${input.platform}
• Meeting Link: ${meetingResult.joinUrl}

A calendar invitation (.ics) is attached to this email for your convenience.

Best regards,
The AttendX Talent Acquisition Team
      `.trim()

      const emailProvider = EmailProviderFactory.getProvider()
      await emailProvider.sendEmail({
        to: candidateEmail,
        subject: emailSubject,
        text: emailBody,
        attachments: [
          {
            filename: 'interview-invite.ics',
            content: Buffer.from(icsContent).toString('base64'),
            contentType: 'text/calendar; charset=utf-8; method=REQUEST',
          },
        ],
      })

      // Send SMS notification if phone is present
      if (application.candidate.phone) {
        const smsProvider = new TwilioWhatsAppSmsProvider()
        await smsProvider.sendSms({
          to: application.candidate.phone,
          message: `Hi ${candidateName}, your ${roleTitle} interview is confirmed for ${new Date(input.scheduled_start).toLocaleDateString()}. Check your email for the join link.`,
        })
      }

      // Log outreach message
      await client.from('outreach_messages').insert({
        organization_id: organizationId,
        candidate_id: application.candidate_id,
        channel: 'EMAIL',
        recipient: candidateEmail,
        subject: emailSubject,
        body: emailBody,
        status: 'DELIVERED',
        sent_at: new Date().toISOString(),
        delivered_at: new Date().toISOString(),
      })
    }

    // 6. Audit
    await HiringAuditLogger.logMutation(client, {
      organizationId,
      userId,
      action: 'SCHEDULE_INTERVIEW',
      entityType: 'INTERVIEW',
      entityId: interview.id,
      newValues: interview as unknown as Record<string, unknown>,
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
    })

    return interview as Interview
  }

  /**
   * List interviews with filters
   */
  static async list(
    client: SupabaseClient,
    organizationId: string,
    filters: {
      application_id?: string
      candidate_id?: string
      status?: string
      from_date?: string
      to_date?: string
    } = {}
  ): Promise<Interview[]> {
    let query = client
      .from('interviews')
      .select(`
        *,
        candidate:candidates(id, first_name, last_name, email, phone),
        application:job_applications(id, application_code, stage),
        evaluations:candidate_evaluations(*)
      `)
      .eq('organization_id', organizationId)

    if (filters.application_id) {
      query = query.eq('application_id', filters.application_id)
    }
    if (filters.candidate_id) {
      query = query.eq('candidate_id', filters.candidate_id)
    }
    if (filters.status && filters.status !== 'ALL') {
      query = query.eq('status', filters.status)
    }
    if (filters.from_date) {
      query = query.gte('scheduled_start', filters.from_date)
    }
    if (filters.to_date) {
      query = query.lte('scheduled_end', filters.to_date)
    }

    query = query.order('scheduled_start', { ascending: true })

    const { data, error } = await query
    if (error) {
      throw new Error(`Failed to list interviews: ${error.message}`)
    }

    return (data || []) as Interview[]
  }

  /**
   * Update interview status (e.g. COMPLETED, NO_SHOW, CANCELLED, RESCHEDULED)
   */
  static async updateStatus(
    client: SupabaseClient,
    organizationId: string,
    interviewId: string,
    userId: string,
    status: InterviewStatus,
    options?: { notes?: string; decision?: 'PENDING' | 'PASS' | 'FAIL' | 'ON_HOLD'; decisionReason?: string },
    context?: { ip?: string; userAgent?: string }
  ): Promise<Interview> {
    const updatePayload: Record<string, any> = { status }
    if (options?.notes) updatePayload.notes = options.notes
    if (options?.decision) {
      updatePayload.decision = options.decision
      updatePayload.decided_by = userId
      updatePayload.decided_at = new Date().toISOString()
      if (options.decisionReason) updatePayload.decision_reason = options.decisionReason
    }

    const { data: updated, error } = await client
      .from('interviews')
      .update(updatePayload)
      .eq('organization_id', organizationId)
      .eq('id', interviewId)
      .select()
      .single()

    if (error || !updated) {
      throw new Error(`Failed to update interview: ${error?.message}`)
    }

    await HiringAuditLogger.logMutation(client, {
      organizationId,
      userId,
      action: 'UPDATE_INTERVIEW_STATUS',
      entityType: 'INTERVIEW',
      entityId: interviewId,
      newValues: updatePayload,
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
    })

    return updated as Interview
  }
}
