// ============================================================
// AttendX v2 — REST API: /api/hiring/voice/call
// POST: Initiate an automated Voice AI screening call to a candidate
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { VoiceProviderFactory } from '@/lib/hiring/voice-provider'
import { HiringAuditLogger } from '@/lib/hiring/audit-logger'

export async function POST(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'
    ], request)

    const body = await request.json()
    const { candidate_id, requisition_id, call_purpose, phone_number } = body

    if (!candidate_id) {
      return NextResponse.json({ error: 'candidate_id is required' }, { status: 400 })
    }

    const serviceClient = getSupabaseServiceClient()

    // Retrieve candidate
    const { data: candidate, error: cErr } = await serviceClient
      .from('candidates')
      .select('id, full_name, phone, email')
      .eq('id', candidate_id)
      .eq('organization_id', caller.tenantId)
      .single()

    if (cErr || !candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
    }

    const candidatePhone = phone_number || candidate.phone
    if (!candidatePhone) {
      return NextResponse.json({ error: 'Candidate does not have a valid phone number' }, { status: 400 })
    }

    // Retrieve requisition if provided
    let requisitionTitle = 'Open Position'
    if (requisition_id) {
      const { data: req } = await serviceClient
        .from('job_requisitions')
        .select('title')
        .eq('id', requisition_id)
        .eq('organization_id', caller.tenantId)
        .maybeSingle()
      if (req?.title) requisitionTitle = req.title
    }

    const voiceProvider = VoiceProviderFactory.getProvider()
    const callResult = await voiceProvider.initiateCall({
      candidateId: candidate.id,
      candidateName: candidate.full_name,
      candidatePhone,
      requisitionId: requisition_id,
      requisitionTitle,
      organizationId: caller.tenantId,
      callPurpose: call_purpose || 'SCREENING',
    })

    // Insert record in ai_voice_calls
    const { data: voiceCall, error: insertErr } = await serviceClient
      .from('ai_voice_calls')
      .insert({
        organization_id: caller.tenantId,
        candidate_id: candidate.id,
        requisition_id: requisition_id || null,
        call_provider: voiceProvider.name,
        provider_call_id: callResult.providerCallId,
        phone_number: candidatePhone,
        call_purpose: call_purpose || 'SCREENING',
        status: callResult.status,
      })
      .select()
      .single()

    if (insertErr) throw insertErr

    await HiringAuditLogger.log(serviceClient, {
      organization_id: caller.tenantId,
      user_id: caller.userId,
      action: 'VOICE_CALL_INITIATED',
      entity_type: 'ai_voice_calls',
      entity_id: voiceCall.id,
      new_values: {
        provider: voiceProvider.name,
        phone_number: candidatePhone,
        call_purpose: call_purpose || 'SCREENING',
      },
    })

    return NextResponse.json({
      success: true,
      call: voiceCall,
      provider: voiceProvider.name,
    })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
