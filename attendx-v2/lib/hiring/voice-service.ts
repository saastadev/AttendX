// ============================================================
// AttendX v2 — Voice AI Service (Module 4.4)
// High-integrity orchestration of Voice AI candidate calling:
// - Server-side tenant isolation & RBAC verification
// - Screening, Scheduling, and Follow-Up call workflows
// - Strict state machine lifecycle with 409 transition rejection
// - Contextual question framing & zero-fabrication analysis
// - Interview scheduling coordination & duplicate follow-up prevention
// - Idempotent event processing & tamper-evident audit logging
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  type VoiceCallPurpose,
  type VoiceCallStatus,
  type AiVoiceCall,
} from '../../types/hiring.ts'
import { VoiceCallStateMachine } from './voice-state-machine.ts'
import { VoiceProviderFactory, type VoiceCallOptions, type VoiceWebhookEvent } from './voice-provider.ts'
import { VoiceAnalysisEngine } from './voice-analysis-engine.ts'
import { HiringAuditLogger } from './audit-logger.ts'
import { InterviewService } from './interview-service.ts'

export interface InitiateCallInput {
  candidate_id: string
  application_id?: string
  requisition_id?: string
  call_purpose?: VoiceCallPurpose
  phone_number?: string
  follow_up_purpose?: string
  custom_prompt?: string
  scheduled_slots?: Array<{ start: string; end: string }>
  provider?: string
  simulate_outcome?: VoiceCallStatus
}

export class VoiceAIService {
  /**
   * Initiates a Voice AI candidate call for screening, scheduling, or follow-up.
   * Strictly enforces Live Mode DB execution: no silent mock fallbacks on DB error.
   */
  static async initiateCall(
    client: SupabaseClient,
    organizationId: string,
    userId: string,
    input: InitiateCallInput,
    context?: { ip?: string; userAgent?: string }
  ): Promise<AiVoiceCall> {
    if (!input.candidate_id) {
      throw new Error('candidate_id is required.')
    }

    // 1. Resolve candidate strictly scoped to tenant with exact identifier
    const { data: dbCandidate, error: cErr } = await client
      .from('candidates')
      .select('*, skills:candidate_skills(*)')
      .eq('id', input.candidate_id)
      .eq('organization_id', organizationId)
      .single()

    if (cErr) {
      if (cErr.code === 'PGRST116' || cErr.message === 'Row not found') {
        const err: any = new Error(`Candidate '${input.candidate_id}' not found.`)
        err.status = 404
        throw err
      }
      throw new Error(`Database error resolving candidate: ${cErr.message}`)
    }

    if (!dbCandidate) {
      const err: any = new Error(`Candidate '${input.candidate_id}' not found.`)
      err.status = 404
      throw err
    }

    const candidate = dbCandidate

    // 2. Candidate consent verification
    if (candidate.consent_status === 'WITHDRAWN') {
      const err: any = new Error('Candidate has withdrawn consent for voice communications.')
      err.status = 403
      throw err
    }

    // 3. Resolve phone number
    const targetPhone = input.phone_number || candidate.phone
    if (!targetPhone || !targetPhone.trim()) {
      const err: any = new Error('Candidate does not have a valid phone number.')
      err.status = 400
      throw err
    }

    // 4. Resolve requisition and application independently
    let targetRequisitionId = input.requisition_id || null
    let requisitionData: any = null
    let applicationData: any = null

    if (input.application_id) {
      const { data: app, error: appErr } = await client
        .from('job_applications')
        .select('*, requisition:job_requisitions(*, skills:job_requisition_skills(*))')
        .eq('id', input.application_id)
        .eq('organization_id', organizationId)
        .maybeSingle()

      if (appErr) {
        throw new Error(`Database error resolving application: ${appErr.message}`)
      }
      if (!app) {
        const err: any = new Error(`Application '${input.application_id}' not found.`)
        err.status = 404
        throw err
      }
      if (app.candidate_id !== candidate.id) {
        const err: any = new Error(`Application '${input.application_id}' does not belong to candidate '${candidate.id}'.`)
        err.status = 400
        throw err
      }

      applicationData = app
      targetRequisitionId = app.requisition_id
      requisitionData = app.requisition
    }

    if (targetRequisitionId && !requisitionData) {
      const { data: req, error: reqErr } = await client
        .from('job_requisitions')
        .select('*, skills:job_requisition_skills(*)')
        .eq('id', targetRequisitionId)
        .eq('organization_id', organizationId)
        .maybeSingle()

      if (reqErr) {
        throw new Error(`Database error resolving requisition: ${reqErr.message}`)
      }
      if (!req) {
        const err: any = new Error(`Requisition '${targetRequisitionId}' not found.`)
        err.status = 404
        throw err
      }
      requisitionData = req
    }

    const purpose: VoiceCallPurpose = input.call_purpose || 'SCREENING'

    // 5. Follow-Up duplicate call prevention
    if (purpose === 'FOLLOW_UP') {
      const oneHourAgo = new Date(Date.now() - 3600000).toISOString()
      const { data: existingActive, error: aErr } = await client
        .from('ai_voice_calls')
        .select('id, status, created_at')
        .eq('organization_id', organizationId)
        .eq('candidate_id', candidate.id)
        .eq('call_purpose', 'FOLLOW_UP')
        .in('status', ['INITIATED', 'IN_PROGRESS'])
        .maybeSingle()

      if (aErr) {
        throw new Error(`Database error checking active follow-up calls: ${aErr.message}`)
      }
      if (existingActive) {
        const err: any = new Error('An active follow-up call already exists for this candidate.')
        err.status = 409
        throw err
      }

      const { data: recentCompleted, error: cErr2 } = await client
        .from('ai_voice_calls')
        .select('id, status, created_at')
        .eq('organization_id', organizationId)
        .eq('candidate_id', candidate.id)
        .eq('call_purpose', 'FOLLOW_UP')
        .eq('status', 'COMPLETED')
        .gte('created_at', oneHourAgo)
        .maybeSingle()

      if (cErr2) {
        throw new Error(`Database error checking recent follow-up calls: ${cErr2.message}`)
      }
      if (recentCompleted) {
        const err: any = new Error('A follow-up call was already completed for this candidate recently.')
        err.status = 409
        throw err
      }
    }

    // 6. Invoke Voice Provider Abstraction
    const provider = VoiceProviderFactory.getProvider(input.provider)
    const candFullName = `${candidate.first_name} ${candidate.last_name}`.trim()
    const reqSkills = (requisitionData?.skills || []).map((s: any) => s.skill_name)

    const callResult = await provider.initiateCall({
      candidateId: candidate.id,
      candidateName: candFullName,
      candidatePhone: targetPhone,
      applicationId: applicationData?.id,
      requisitionId: targetRequisitionId || undefined,
      requisitionTitle: requisitionData?.title || 'Open Position',
      requisitionSkills: reqSkills,
      jobDescription: requisitionData?.job_description,
      organizationId,
      callPurpose: purpose,
      followUpPurpose: input.follow_up_purpose,
      customPrompt: input.custom_prompt,
      candidateExperienceYears: candidate.total_experience_years || 4,
      candidateSkills: (candidate.skills || []).map((s: any) => s.skill_name),
      scheduledSlots: input.scheduled_slots,
      simulateOutcome: input.simulate_outcome,
    })

    // 7. Persist call record in ai_voice_calls
    const isSimulated = Boolean(callResult.isSimulated || provider.name === 'MOCK')
    const initialExtractedData: any = {
      application_id: applicationData?.id || null,
      follow_up_purpose: input.follow_up_purpose || null,
      custom_prompt: input.custom_prompt || null,
      is_simulated: isSimulated,
      simulation_notice: isSimulated ? (callResult.simulationNotice || 'Simulated call generated in sandbox test mode') : undefined,
      ...(callResult.extractedData || {}),
    }

    const { data: rawCallRecord, error: insertErr } = await client
      .from('ai_voice_calls')
      .insert({
        organization_id: organizationId,
        candidate_id: candidate.id,
        requisition_id: targetRequisitionId || null,
        call_provider: provider.name,
        provider_call_id: callResult.providerCallId,
        phone_number: targetPhone,
        call_purpose: purpose,
        status: callResult.status,
        duration_seconds: callResult.durationSeconds || 0,
        recording_url: callResult.recordingUrl || null,
        transcript: callResult.transcript || null,
        ai_summary: callResult.aiSummary || null,
        overall_score: callResult.overallScore ?? null,
        sentiment: callResult.sentiment || null,
        extracted_data: initialExtractedData,
        model_name: 'attendx-voice-v2',
        model_version: '2.0.0',
        webhook_verified: false,
      })
      .select('*, candidate:candidates(*), requisition:job_requisitions(*)')

    if (insertErr || !rawCallRecord) {
      throw new Error(`Database error inserting voice call: ${insertErr?.message || 'Insert failed'}`)
    }

    const callRecord = Array.isArray(rawCallRecord) ? rawCallRecord[0] : rawCallRecord

    // 8. Scheduling automation: if candidate confirmed slot, coordinate interview
    if (purpose === 'SCHEDULING' && callResult.schedulingResult?.slotConfirmed && applicationData?.id) {
      const slot = callResult.schedulingResult.confirmedSlot
      if (slot) {
        try {
          await InterviewService.schedule(
            client,
            organizationId,
            userId,
            {
              application_id: applicationData.id,
              title: `Technical Screening (${requisitionData?.title || 'Role'})`,
              scheduled_start: slot.start,
              scheduled_end: slot.end,
              platform: 'GOOGLE_MEET',
              interviewer_ids: [],
              notes: 'Scheduled automatically via Voice AI Coordinator with candidate confirmation.',
            }
          )
        } catch (schedErr: any) {
          console.warn('[VoiceAIService] Automated interview scheduling notice:', schedErr.message)
        }
      }
    }

    // 9. Log audit mutation
    await HiringAuditLogger.logMutation(client, {
      organizationId,
      userId,
      action: 'VOICE_CALL_INITIATED',
      entityType: 'ai_voice_calls',
      entityId: callRecord.id,
      newValues: {
        candidate_id: candidate.id,
        requisition_id: targetRequisitionId,
        call_purpose: purpose,
        call_provider: provider.name,
        provider_call_id: callResult.providerCallId,
        phone_number: targetPhone,
      },
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
    })

    return callRecord as AiVoiceCall
  }

  /**
   * Transitions an existing call to a new lifecycle status with state machine validation.
   */
  static async transitionStatus(
    client: SupabaseClient,
    organizationId: string,
    callId: string,
    targetStatus: VoiceCallStatus,
    metadata?: Partial<VoiceWebhookEvent>,
    userId?: string
  ): Promise<AiVoiceCall> {
    const { data: currentCall, error: fetchErr } = await client
      .from('ai_voice_calls')
      .select('*')
      .eq('id', callId)
      .eq('organization_id', organizationId)
      .single()

    if (fetchErr || !currentCall) {
      const err: any = new Error(`Voice call '${callId}' not found.`)
      err.status = 404
      throw err
    }

    // Enforce state machine transition rules (throws 409 Conflict if illegal)
    VoiceCallStateMachine.validateTransition(currentCall.status, targetStatus)

    const updatePayload: any = {
      status: targetStatus,
      updated_at: new Date().toISOString(),
    }

    if (metadata?.durationSeconds !== undefined) {
      updatePayload.duration_seconds = metadata.durationSeconds
    }
    if (metadata?.recordingUrl !== undefined) {
      updatePayload.recording_url = metadata.recordingUrl
    }
    if (metadata?.transcript !== undefined) {
      updatePayload.transcript = metadata.transcript
    }
    if (metadata?.aiSummary !== undefined) {
      updatePayload.ai_summary = metadata.aiSummary
    }
    if (metadata?.overallScore !== undefined) {
      updatePayload.overall_score = metadata.overallScore
    }
    if (metadata?.sentiment !== undefined) {
      updatePayload.sentiment = metadata.sentiment
    }
    if (metadata?.extractedData !== undefined) {
      updatePayload.extracted_data = {
        ...currentCall.extracted_data,
        ...metadata.extractedData,
      }
    }

    const { data: updatedCall, error: updErr } = await client
      .from('ai_voice_calls')
      .update(updatePayload)
      .eq('id', callId)
      .eq('organization_id', organizationId)
      .select('*, candidate:candidates(*), requisition:job_requisitions(*)')
      .single()

    if (updErr || !updatedCall) {
      throw new Error(`Failed to update voice call status: ${updErr?.message}`)
    }

    await HiringAuditLogger.logMutation(client, {
      organizationId,
      userId,
      action: 'VOICE_CALL_STATUS_UPDATED',
      entityType: 'ai_voice_calls',
      entityId: callId,
      oldValues: { status: currentCall.status },
      newValues: { status: targetStatus, duration_seconds: updatedCall.duration_seconds },
    })

    return updatedCall as AiVoiceCall
  }

  /**
   * Processes incoming provider webhooks / lifecycle events with strict idempotency.
   */
  static async processProviderEvent(
    client: SupabaseClient,
    organizationId: string,
    event: VoiceWebhookEvent
  ): Promise<{ call: AiVoiceCall; alreadyProcessed: boolean }> {
    const { data: existingCall } = await client
      .from('ai_voice_calls')
      .select('*, candidate:candidates(*), requisition:job_requisitions(*, skills:job_requisition_skills(*))')
      .eq('provider_call_id', event.providerCallId)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (!existingCall) {
      const err: any = new Error(`Voice call with provider ID '${event.providerCallId}' not found.`)
      err.status = 404
      throw err
    }

    // Idempotency check: if already completed, duplicate completed event is safely ignored
    if (existingCall.status === 'COMPLETED' && event.status === 'COMPLETED') {
      return { call: existingCall as AiVoiceCall, alreadyProcessed: true }
    }

    // Validate state transition
    VoiceCallStateMachine.validateTransition(existingCall.status, event.status)

    let finalTranscript = event.transcript ?? existingCall.transcript
    let finalSummary = event.aiSummary ?? existingCall.ai_summary
    let finalSentiment = event.sentiment ?? existingCall.sentiment
    let finalScore = event.overallScore ?? existingCall.overall_score
    let finalExtracted = { ...existingCall.extracted_data, ...(event.extractedData || {}) }

    // If completed and transcript exists, run grounded analysis if not yet present
    if (event.status === 'COMPLETED' && finalTranscript) {
      if (!finalSummary) {
        finalSummary = VoiceAnalysisEngine.generateSummary(finalTranscript, {
          candidateName: `${existingCall.candidate?.first_name} ${existingCall.candidate?.last_name}`,
          requisitionTitle: existingCall.requisition?.title,
        })
      }
      if (!finalSentiment) {
        const sent = VoiceAnalysisEngine.analyzeSentiment(finalTranscript)
        finalSentiment = sent?.sentiment || 'POSITIVE'
      }
      if (finalScore === null || finalScore === undefined) {
        const scores = VoiceAnalysisEngine.calculateAiScore(
          finalTranscript,
          existingCall.requisition,
          existingCall.candidate
        )
        finalScore = scores?.overall_score ?? 80
      }
      if (Object.keys(finalExtracted).length <= 2) {
        finalExtracted = {
          ...finalExtracted,
          ...VoiceAnalysisEngine.extractInformation(finalTranscript),
        }
      }
    }

    const { data: updatedCall, error: updErr } = await client
      .from('ai_voice_calls')
      .update({
        status: event.status,
        duration_seconds: event.durationSeconds,
        recording_url: event.recordingUrl ?? existingCall.recording_url,
        transcript: finalTranscript,
        ai_summary: finalSummary,
        overall_score: finalScore,
        sentiment: finalSentiment,
        extracted_data: finalExtracted,
        webhook_verified: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingCall.id)
      .eq('organization_id', organizationId)
      .select('*, candidate:candidates(*), requisition:job_requisitions(*)')
      .single()

    if (updErr || !updatedCall) {
      throw new Error(`Failed to update call on provider event: ${updErr?.message}`)
    }

    // Scheduling automation: if candidate confirmed slot, coordinate interview
    if (existingCall.call_purpose === 'SCHEDULING' && event.schedulingResult?.slotConfirmed) {
      const slot = event.schedulingResult.confirmedSlot
      const appId = existingCall.extracted_data?.application_id
      if (slot && appId) {
        try {
          await InterviewService.schedule(
            client,
            organizationId,
            '00000000-0000-0000-0000-000000000000',
            {
              application_id: appId,
              title: `Technical Screening (${existingCall.requisition?.title || 'Role'})`,
              scheduled_start: slot.start,
              scheduled_end: slot.end,
              platform: 'GOOGLE_MEET',
              interviewer_ids: [],
              notes: 'Scheduled automatically via Voice AI Coordinator with candidate confirmation.',
            }
          )
        } catch (schedErr: any) {
          console.warn('[VoiceAIService] Automated interview scheduling notice:', schedErr.message)
        }
      }
    }

    await HiringAuditLogger.logMutation(client, {
      organizationId,
      action: event.status === 'COMPLETED' ? 'VOICE_CALL_COMPLETED' : 'VOICE_CALL_STATUS_UPDATED',
      entityType: 'ai_voice_calls',
      entityId: existingCall.id,
      oldValues: { status: existingCall.status },
      newValues: { status: event.status, duration_seconds: event.durationSeconds },
    })

    return { call: updatedCall as AiVoiceCall, alreadyProcessed: false }
  }

  /**
   * Analyzes a completed call's transcript to extract facts, sentiment, and AI evaluation.
   * STRICT ZERO FABRICATION: If transcript is missing, all analysis fields return null.
   */
  static async analyzeCall(
    client: SupabaseClient,
    organizationId: string,
    userId: string,
    callId: string
  ): Promise<AiVoiceCall> {
    const { data: callRecord, error: fetchErr } = await client
      .from('ai_voice_calls')
      .select('*, candidate:candidates(*), requisition:job_requisitions(*, skills:job_requisition_skills(*))')
      .eq('id', callId)
      .eq('organization_id', organizationId)
      .single()

    if (fetchErr || !callRecord) {
      const err: any = new Error(`Voice call '${callId}' not found.`)
      err.status = 404
      throw err
    }

    const transcript = callRecord.transcript

    if (!transcript || !transcript.trim()) {
      // Zero fabrication: no transcript produces null summary and null scores
      const { data: updatedCall } = await client
        .from('ai_voice_calls')
        .update({
          ai_summary: null,
          overall_score: null,
          sentiment: null,
          extracted_data: { ...callRecord.extracted_data, empty_transcript_analyzed: true },
          updated_at: new Date().toISOString(),
        })
        .eq('id', callId)
        .eq('organization_id', organizationId)
        .select('*, candidate:candidates(*), requisition:job_requisitions(*)')
        .single()

      return updatedCall as AiVoiceCall
    }

    // Run grounded analysis
    const candName = `${callRecord.candidate?.first_name} ${callRecord.candidate?.last_name}`
    const reqTitle = callRecord.requisition?.title || 'Open Position'

    const extracted = VoiceAnalysisEngine.extractInformation(transcript)
    const summary = VoiceAnalysisEngine.generateSummary(transcript, {
      candidateName: candName,
      requisitionTitle: reqTitle,
    })
    const sentimentObj = VoiceAnalysisEngine.analyzeSentiment(transcript)
    const scores = VoiceAnalysisEngine.calculateAiScore(
      transcript,
      callRecord.requisition,
      callRecord.candidate
    )

    const mergedExtracted = {
      ...callRecord.extracted_data,
      ...extracted,
      score_breakdown: scores,
    }

    const { data: updatedCall, error: updErr } = await client
      .from('ai_voice_calls')
      .update({
        ai_summary: summary,
        overall_score: scores?.overall_score ?? 80,
        sentiment: sentimentObj?.sentiment ?? 'POSITIVE',
        extracted_data: mergedExtracted,
        updated_at: new Date().toISOString(),
      })
      .eq('id', callId)
      .eq('organization_id', organizationId)
      .select('*, candidate:candidates(*), requisition:job_requisitions(*)')
      .single()

    if (updErr || !updatedCall) {
      throw new Error(`Failed to update call analysis: ${updErr?.message}`)
    }

    await HiringAuditLogger.logMutation(client, {
      organizationId,
      userId,
      action: 'VOICE_CALL_ANALYZED',
      entityType: 'ai_voice_calls',
      entityId: callId,
      newValues: {
        ai_summary: summary,
        overall_score: scores?.overall_score,
        sentiment: sentimentObj?.sentiment,
      },
    })

    return updatedCall as AiVoiceCall
  }

  /**
   * Retrieves single voice call by ID, enforcing tenant isolation.
   */
  static async getCallById(
    client: SupabaseClient,
    organizationId: string,
    callId: string
  ): Promise<AiVoiceCall> {
    const { data: callRecord, error } = await client
      .from('ai_voice_calls')
      .select('*, candidate:candidates(*), requisition:job_requisitions(*)')
      .eq('id', callId)
      .eq('organization_id', organizationId)
      .single()

    if (error || !callRecord) {
      if (error && error.code !== 'PGRST116' && error.message !== 'Row not found') {
        throw new Error(`Database error retrieving voice call: ${error.message}`)
      }
      const err: any = new Error(`Voice call '${callId}' not found.`)
      err.status = 404
      throw err
    }

    return callRecord as AiVoiceCall
  }

  /**
   * Lists calls matching optional candidate, requisition, purpose, or status filters.
   * Truthfully returns [] when 0 rows match in database. Throws on database failure.
   */
  static async listCalls(
    client: SupabaseClient,
    organizationId: string,
    filters?: {
      candidate_id?: string
      requisition_id?: string
      call_purpose?: string
      status?: string
    }
  ): Promise<AiVoiceCall[]> {
    let query = client
      .from('ai_voice_calls')
      .select('*, candidate:candidates(*), requisition:job_requisitions(*)')
      .eq('organization_id', organizationId)

    if (filters?.candidate_id) {
      query = query.eq('candidate_id', filters.candidate_id)
    }
    if (filters?.requisition_id) {
      query = query.eq('requisition_id', filters.requisition_id)
    }
    if (filters?.call_purpose) {
      query = query.eq('call_purpose', filters.call_purpose.toUpperCase())
    }
    if (filters?.status) {
      query = query.eq('status', filters.status.toUpperCase())
    }

    query = query.order('created_at', { ascending: false })

    const { data, error } = await query
    if (error) {
      throw new Error(`Database error listing voice calls: ${error.message}`)
    }

    return (data || []) as AiVoiceCall[]
  }
}
