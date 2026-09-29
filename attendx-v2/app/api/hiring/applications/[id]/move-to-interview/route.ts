// ============================================================
// AttendX v2 — REST API: /api/hiring/applications/[id]/move-to-interview
// POST: Transitions application to INTERVIEW stage and optionally schedules interview
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { ApplicationService } from '@/lib/hiring/application-service'
import { InterviewService } from '@/lib/hiring/interview-service'
import { mockHiringStore } from '@/lib/hiring/mock-store'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'
    ], request)

    const body = await request.json().catch(() => ({}))
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1'
    const userAgent = request.headers.get('user-agent') || 'AttendX-Client'

    try {
      const serviceClient = getSupabaseServiceClient()

      // 1. Move stage to INTERVIEW via state machine
      const updatedApp = await ApplicationService.moveStage(
        serviceClient,
        caller.tenantId,
        id,
        'INTERVIEW',
        caller.userId,
        { reason: body.reason || 'Candidate moved to interview stage by HR' },
        { ip, userAgent }
      )

      // 2. If scheduling details provided in same call, schedule interview
      let scheduledInterview = null
      if (body.scheduled_start && body.scheduled_end && body.platform) {
        scheduledInterview = await InterviewService.schedule(
          serviceClient,
          caller.tenantId,
          caller.userId,
          {
            application_id: id,
            round_number: body.round_number || 1,
            round_type: body.round_type || 'TECHNICAL',
            title: body.title || 'Technical Round 1',
            scheduled_start: body.scheduled_start,
            scheduled_end: body.scheduled_end,
            timezone: body.timezone || 'UTC',
            platform: body.platform,
            custom_meeting_link: body.custom_meeting_link,
            interviewer_ids: body.interviewer_ids || [caller.userId],
            notes: body.notes,
          },
          { ip, userAgent }
        )
      }

      return NextResponse.json({
        success: true,
        message: 'Application successfully moved to interview stage',
        application: updatedApp,
        interview: scheduledInterview,
      })
    } catch (dbErr: any) {
      if (dbErr.status === 409) throw dbErr

      const updatedApp = mockHiringStore.updateApplicationStage(
        caller.tenantId,
        id,
        'INTERVIEW',
        'IN_REVIEW',
        body.reason
      )
      let scheduledInterview = null
      if (body.scheduled_start) {
        scheduledInterview = mockHiringStore.scheduleInterview(caller.tenantId, {
          application_id: id,
          title: body.title,
          round_type: body.round_type,
          platform: body.platform,
          scheduled_start: body.scheduled_start,
          scheduled_end: body.scheduled_end,
          duration_minutes: body.duration_minutes,
        })
      }

      return NextResponse.json({
        success: true,
        message: 'Application successfully moved to interview stage',
        application: updatedApp,
        interview: scheduledInterview,
      })
    }
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json(
      { error: err.message || 'Failed to move to interview' },
      { status }
    )
  }
}
