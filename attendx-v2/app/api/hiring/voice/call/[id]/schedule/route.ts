// ============================================================
// AttendX v2 — REST API: /api/hiring/voice/call/[id]/schedule
// POST: Coordinate and schedule an interview confirmed during Voice AI call
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { InterviewService } from '@/lib/hiring/interview-service'
import { VoiceAIService } from '@/lib/hiring/voice-service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: callId } = await params
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'
    ], request)

    if (!callId) {
      return NextResponse.json({ error: 'Call ID is required' }, { status: 400 })
    }

    const body = await request.json()
    const { scheduled_start, scheduled_end, platform, title, interviewer_ids, notes } = body

    if (!scheduled_start || !scheduled_end) {
      return NextResponse.json({ error: 'scheduled_start and scheduled_end are required' }, { status: 400 })
    }

    const serviceClient = getSupabaseServiceClient()
    const callRecord = await VoiceAIService.getCallById(
      serviceClient,
      caller.tenantId,
      callId
    )

    let applicationId = callRecord.extracted_data?.application_id

    // Fallback: look up application if not in extracted_data
    if (!applicationId && callRecord.candidate_id && callRecord.requisition_id) {
      const { data: app } = await serviceClient
        .from('job_applications')
        .select('id')
        .eq('candidate_id', callRecord.candidate_id)
        .eq('requisition_id', callRecord.requisition_id)
        .eq('organization_id', caller.tenantId)
        .maybeSingle()

      if (app) {
        applicationId = app.id
      }
    }

    if (!applicationId) {
      return NextResponse.json({
        error: 'Cannot schedule interview: no matching job application found for this call'
      }, { status: 400 })
    }

    const interview = await InterviewService.schedule(
      serviceClient,
      caller.tenantId,
      caller.userId,
      {
        application_id: applicationId,
        title: title || `Interview (${callRecord.requisition?.title || 'Open Role'})`,
        scheduled_start,
        scheduled_end,
        platform: platform || 'GOOGLE_MEET',
        interviewer_ids: interviewer_ids || [],
        notes: notes || 'Scheduled via Voice AI Coordinator',
      }
    )

    return NextResponse.json({
      success: true,
      interview,
    })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
