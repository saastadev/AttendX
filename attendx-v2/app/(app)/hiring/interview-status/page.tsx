'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import {
  Video, CheckCircle2, XCircle, PhoneCall, Sparkles,
  Award, Clock, ArrowRight, UserCheck, UserX, MessageSquare,
  FileCheck, Shield, ChevronRight, ChevronDown, ChevronUp,
  Calendar, RotateCcw, AlertCircle, Headphones
} from 'lucide-react'
import { PageWrapper } from '@/components/ui/PageWrapper'
import { useToast } from '@/components/ui/Toast'

export default function InterviewStatusPage() {
  const { success, error: toastError } = useToast()
  const qc = useQueryClient()

  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null)
  const [activeVoiceCall, setActiveVoiceCall] = useState<any | null>(null)
  const [showTranscript, setShowTranscript] = useState<boolean>(false)

  // Fetch applications in interview or shortlisted stages
  const { data: appData, isLoading } = useQuery({
    queryKey: ['hiring-interview-applications'],
    queryFn: async () => {
      const res = await fetch('/api/hiring/applications?limit=50')
      if (!res.ok) return { applications: [] }
      return res.json()
    }
  })

  const applications = (appData?.applications || []).filter(
    (a: any) => ['SHORTLISTED', 'INTERVIEW', 'SELECTED', 'REJECTED'].includes(a.stage)
  )

  const activeApp = applications.find((a: any) => a.id === selectedApplicationId) || applications[0]

  const activeCandidateId = activeApp?.candidate?.id || activeApp?.candidate_id

  // Fetch voice calls for active candidate
  const { data: callsData, isLoading: isLoadingCalls } = useQuery({
    queryKey: ['candidate-voice-calls', activeCandidateId],
    queryFn: async () => {
      if (!activeCandidateId) return []
      const res = await fetch(`/api/hiring/voice/call?candidate_id=${activeCandidateId}`)
      if (!res.ok) return []
      const data = await res.json()
      return data.calls || data.data || []
    },
    enabled: !!activeCandidateId,
  })

  // Fetch interviews for active application
  const { data: appInterviews } = useQuery({
    queryKey: ['application-interviews', activeApp?.id],
    queryFn: async () => {
      if (!activeApp?.id) return []
      const res = await fetch(`/api/hiring/interviews?application_id=${activeApp.id}`)
      if (!res.ok) return []
      const data = await res.json()
      return data.interviews || data.data || []
    },
    enabled: !!activeApp?.id,
  })

  const latestCall = callsData?.[0] || activeVoiceCall

  // Transition Stage Mutation (Human Decision: Selected or Rejected)
  const stageMutation = useMutation({
    mutationFn: async ({ appId, targetStage }: { appId: string; targetStage: string }) => {
      const res = await fetch(`/api/hiring/applications/${appId}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_stage: targetStage,
          decision: targetStage === 'SELECTED' ? 'SELECTED' : 'REJECTED',
        })
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Stage transition failed')
      }
      return res.json()
    },
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ['hiring-interview-applications'] })
      success(
        vars.targetStage === 'SELECTED'
          ? 'Candidate marked as SELECTED! Ready for Offer generation.'
          : 'Candidate marked as REJECTED.'
      )
    },
    onError: (err: any) => {
      toastError(err.message || 'Action failed')
    }
  })

  // Voice AI Call Trigger Mutation (Screening, Scheduling, Follow-Up)
  const voiceCallMutation = useMutation({
    mutationFn: async ({ purpose }: { purpose: 'SCREENING' | 'SCHEDULING' | 'FOLLOW_UP' }) => {
      if (!activeCandidateId) throw new Error('No candidate selected')
      const res = await fetch('/api/hiring/voice/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_id: activeCandidateId,
          requisition_id: activeApp.requisition_id,
          application_id: activeApp.id,
          call_purpose: purpose,
          phone_number: activeApp.candidate?.phone,
        })
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to trigger voice call')
      }
      return res.json()
    },
    onSuccess: (data) => {
      setActiveVoiceCall(data.call)
      qc.invalidateQueries({ queryKey: ['candidate-voice-calls', activeCandidateId] })
      success(`Voice AI ${data.call?.call_purpose || 'call'} initiated via ${data.provider}!`)
    },
    onError: (err: any) => {
      toastError(err.message || 'Voice call initiation failed')
    }
  })

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '0s'
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return m > 0 ? `${m}m ${s}s` : `${s}s`
  }

  const scoreBreakdown = latestCall?.extracted_data?.score_breakdown

  return (
    <PageWrapper className="w-full max-w-full" style={{ maxWidth: 1280, margin: '0 auto' }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title" style={{ fontSize: 'clamp(1.35rem, 4vw, 1.75rem)', fontWeight: 800 }}>Interview Status & AI Screening</h1>
          <p className="page-subtitle" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Track multi-round interview progression, evaluator scorecards, automated voice calls, and record hiring decisions.
          </p>
        </div>
      </div>

      <div className="neu-interview-grid">
        {/* Candidates List Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, width: '100%' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            In-Progress Candidates ({applications.length})
          </h3>

          {isLoading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading candidates…</div>
          ) : applications.length === 0 ? (
            <div className="card neu-interview-card" style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>
              No candidates in interview stage currently.
            </div>
          ) : (
            <div className="neu-interview-candidates-list">
              {applications.map((app: any) => {
                const isSelected = (activeApp?.id === app.id)
                return (
                  <div
                    key={app.id}
                    onClick={() => {
                      setSelectedApplicationId(app.id)
                      setActiveVoiceCall(null)
                    }}
                    className="card card-hover neu-interview-candidate-item"
                    style={{
                      padding: 16,
                      borderRadius: 14,
                      background: isSelected ? 'var(--neu-bg-raised)' : 'var(--neu-base)',
                      boxShadow: 'var(--elev-1)',
                      cursor: 'pointer',
                      border: isSelected ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.4)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {app.candidate?.full_name}
                      </div>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 10,
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        flexShrink: 0,
                        background: app.stage === 'SELECTED'
                          ? 'rgba(16, 185, 129, 0.15)'
                          : app.stage === 'REJECTED'
                          ? 'rgba(239, 68, 68, 0.15)'
                          : 'rgba(79, 70, 229, 0.12)',
                        color: app.stage === 'SELECTED'
                          ? '#059669'
                          : app.stage === 'REJECTED'
                          ? '#DC2626'
                          : 'var(--accent)',
                      }}>
                        {app.stage}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Role: {app.requisition?.title}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Selected Candidate Detailed View */}
        {activeApp ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0, width: '100%' }}>
            {/* Candidate Header Card */}
            <div className="card neu-interview-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                <div style={{ minWidth: 0, flex: '1 1 240px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <h2 style={{ fontSize: 'clamp(1.15rem, 3.5vw, 1.4rem)', fontWeight: 800, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                      {activeApp.candidate?.full_name}
                    </h2>
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: 12,
                      background: 'rgba(79, 70, 229, 0.12)',
                      color: 'var(--accent)',
                      flexShrink: 0,
                    }}>
                      {activeApp.application_code}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: 4, wordBreak: 'break-word' }}>
                    Role: <b>{activeApp.requisition?.title}</b> ({typeof activeApp.requisition?.department === 'object' ? activeApp.requisition?.department?.name : activeApp.requisition?.department}) • Match Score: <b>{Math.round(activeApp.match_score)}%</b>
                  </div>
                </div>

                {/* Candidate Decision Actions */}
                <div className="neu-interview-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => stageMutation.mutate({ appId: activeApp.id, targetStage: 'REJECTED' })}
                    disabled={stageMutation.isPending || activeApp.stage === 'REJECTED'}
                    className="btn btn-secondary"
                    style={{ color: '#DC2626', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
                  >
                    <UserX size={15} /> Reject
                  </button>

                  <button
                    onClick={() => stageMutation.mutate({ appId: activeApp.id, targetStage: 'SELECTED' })}
                    disabled={stageMutation.isPending || activeApp.stage === 'SELECTED'}
                    className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
                  >
                    <UserCheck size={15} /> Mark Selected
                  </button>
                </div>
              </div>

              {/* Voice Calling Control Bar */}
              <div style={{
                marginTop: 18,
                padding: '12px 16px',
                borderRadius: 12,
                background: 'var(--neu-bg-deep)',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                border: '1px solid rgba(79, 70, 229, 0.15)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Headphones size={18} color="var(--accent)" />
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Voice AI Agents (Module 4.4):
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => voiceCallMutation.mutate({ purpose: 'SCREENING' })}
                    disabled={voiceCallMutation.isPending}
                    className="btn btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', padding: '6px 12px' }}
                    title="Initiate initial technical & profile screening call"
                  >
                    <PhoneCall size={14} color="var(--accent)" />
                    {voiceCallMutation.isPending ? 'Calling…' : 'Screening Call'}
                  </button>

                  <button
                    onClick={() => voiceCallMutation.mutate({ purpose: 'SCHEDULING' })}
                    disabled={voiceCallMutation.isPending}
                    className="btn btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', padding: '6px 12px' }}
                    title="Call candidate to coordinate and confirm interview slot"
                  >
                    <Calendar size={14} color="#059669" />
                    Schedule Call
                  </button>

                  <button
                    onClick={() => voiceCallMutation.mutate({ purpose: 'FOLLOW_UP' })}
                    disabled={voiceCallMutation.isPending}
                    className="btn btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', padding: '6px 12px' }}
                    title="Automated follow-up call with duplicate prevention"
                  >
                    <RotateCcw size={14} color="#D97706" />
                    Follow-Up Call
                  </button>
                </div>
              </div>

              {/* Round Progression Stepper */}
              <div style={{ marginTop: 24 }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 12 }}>
                  Interview Round Progress (Rounds Completed vs Total)
                </h4>
                <div className="neu-stepper-scroll">
                  {[
                    { round: 1, name: 'Round 1: HR Screening', done: true },
                    { round: 2, name: 'Round 2: Technical Deep-Dive', done: true },
                    { round: 3, name: 'Round 3: System Architecture', done: activeApp.stage === 'SELECTED' },
                    { round: 4, name: 'Round 4: Final Leadership', done: activeApp.stage === 'SELECTED' },
                  ].map((step, idx) => (
                    <div key={idx} className="neu-stepper-item">
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '10px 14px',
                        borderRadius: 12,
                        background: step.done ? 'rgba(16, 185, 129, 0.12)' : 'var(--neu-bg-deep)',
                        border: step.done ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid transparent',
                        whiteSpace: 'nowrap',
                      }}>
                        <div style={{
                          width: 22,
                          height: 22,
                          minWidth: 22,
                          borderRadius: '50%',
                          background: step.done ? '#10B981' : 'var(--text-tertiary)',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          flexShrink: 0,
                        }}>
                          {step.done ? '✓' : step.round}
                        </div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: step.done ? '#059669' : 'var(--text-secondary)' }}>
                          {step.name}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Voice Call Active Status / Results Panel */}
            {latestCall && (
              <div className="card neu-interview-card" style={{ border: '1px solid rgba(79, 70, 229, 0.25)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: 'rgba(79, 70, 229, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--accent)',
                    }}>
                      <PhoneCall size={18} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                          Voice AI Call — {latestCall.call_purpose || 'SCREENING'}
                        </h3>
                        {(latestCall.call_provider === 'MOCK' || latestCall.is_simulated || latestCall.extracted_data?.is_simulated) && (
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: 6,
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            background: 'rgba(234, 88, 12, 0.15)',
                            color: '#EA580C',
                            border: '1px solid rgba(234, 88, 12, 0.3)',
                            textTransform: 'uppercase',
                          }}>
                            Simulated Call
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Provider: <b>{latestCall.call_provider || 'AttendX Mock Telephony'}</b>
                        {(latestCall.call_provider === 'MOCK' || latestCall.is_simulated || latestCall.extracted_data?.is_simulated) && (
                          <span style={{ color: '#EA580C', marginLeft: 4 }}>(Sandbox Mode)</span>
                        )}
                        {' '}• Phone: <b>{latestCall.phone_number || activeApp.candidate?.phone}</b>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: 12,
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      background: latestCall.status === 'COMPLETED'
                        ? 'rgba(16, 185, 129, 0.15)'
                        : latestCall.status === 'IN_PROGRESS'
                        ? 'rgba(59, 130, 246, 0.15)'
                        : 'rgba(239, 68, 68, 0.15)',
                      color: latestCall.status === 'COMPLETED'
                        ? '#059669'
                        : latestCall.status === 'IN_PROGRESS'
                        ? '#2563EB'
                        : '#DC2626',
                    }}>
                      ● {latestCall.status}
                    </span>

                    {latestCall.duration_seconds > 0 && (
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: 12,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        background: 'var(--neu-bg-deep)',
                        color: 'var(--text-secondary)',
                      }}>
                        <Clock size={12} style={{ display: 'inline', marginRight: 4 }} />
                        {formatDuration(latestCall.duration_seconds)}
                      </span>
                    )}

                    {latestCall.sentiment && (
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: 12,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        background: latestCall.sentiment === 'POSITIVE'
                          ? 'rgba(16, 185, 129, 0.12)'
                          : latestCall.sentiment === 'NEGATIVE'
                          ? 'rgba(239, 68, 68, 0.12)'
                          : 'rgba(245, 158, 11, 0.12)',
                        color: latestCall.sentiment === 'POSITIVE'
                          ? '#059669'
                          : latestCall.sentiment === 'NEGATIVE'
                          ? '#DC2626'
                          : '#D97706',
                      }}>
                        Sentiment: {latestCall.sentiment}
                      </span>
                    )}
                  </div>
                </div>

                {/* Simulation Mode Notice */}
                {(latestCall.call_provider === 'MOCK' || latestCall.is_simulated || latestCall.extracted_data?.is_simulated) && (
                  <div style={{
                    background: 'rgba(234, 88, 12, 0.08)',
                    border: '1px solid rgba(234, 88, 12, 0.25)',
                    borderRadius: 8,
                    padding: '8px 12px',
                    marginBottom: 12,
                    fontSize: '0.75rem',
                    color: '#C2410C',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}>
                    <AlertCircle size={14} />
                    <span><b>Notice:</b> This call was generated in simulated sandbox test mode. Responses do not represent statements provided by the actual candidate. Real telephony execution remains <code>BLOCKED</code>.</span>
                  </div>
                )}

                {/* Grounded AI Call Summary */}
                {latestCall.ai_summary ? (
                  <div style={{
                    background: 'var(--neu-bg-deep)',
                    padding: 14,
                    borderRadius: 12,
                    fontSize: '0.82rem',
                    color: 'var(--text-primary)',
                    lineHeight: 1.6,
                    marginBottom: 14,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontWeight: 700, color: 'var(--accent)' }}>
                      <Sparkles size={15} /> Authentic AI Summary (Grounded in Transcript)
                    </div>
                    {latestCall.ai_summary}
                  </div>
                ) : (
                  <div style={{
                    background: 'var(--neu-bg-deep)',
                    padding: 12,
                    borderRadius: 12,
                    fontSize: '0.8rem',
                    color: 'var(--text-tertiary)',
                    marginBottom: 14,
                    fontStyle: 'italic',
                  }}>
                    No transcript available yet. Zero-fabrication policy active (summary & AI score withheld).
                  </div>
                )}

                {/* Extracted Candidate Information Badges */}
                {latestCall.extracted_data && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 8 }}>
                      {latestCall.call_provider === 'MOCK' || latestCall.is_simulated || latestCall.extracted_data?.is_simulated
                        ? 'Extracted Facts (Simulated Sandbox Dialogue)'
                        : 'Extracted Candidate Facts'}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {latestCall.extracted_data.noticePeriodDays != null && (
                        <span style={{ fontSize: '0.78rem', padding: '4px 10px', borderRadius: 8, background: 'var(--neu-bg-deep)', color: 'var(--text-secondary)' }}>
                          Notice Period: <b>{latestCall.extracted_data.noticePeriodDays} days</b>
                        </span>
                      )}
                      {latestCall.extracted_data.expectedSalary && (
                        <span style={{ fontSize: '0.78rem', padding: '4px 10px', borderRadius: 8, background: 'var(--neu-bg-deep)', color: 'var(--text-secondary)' }}>
                          Expected CTC: <b>{latestCall.extracted_data.expectedSalary}</b>
                        </span>
                      )}
                      {latestCall.extracted_data.currentSalary && (
                        <span style={{ fontSize: '0.78rem', padding: '4px 10px', borderRadius: 8, background: 'var(--neu-bg-deep)', color: 'var(--text-secondary)' }}>
                          Current CTC: <b>{latestCall.extracted_data.currentSalary}</b>
                        </span>
                      )}
                      {latestCall.extracted_data.yearsOfExperience != null && (
                        <span style={{ fontSize: '0.78rem', padding: '4px 10px', borderRadius: 8, background: 'var(--neu-bg-deep)', color: 'var(--text-secondary)' }}>
                          Experience: <b>{latestCall.extracted_data.yearsOfExperience} yrs</b>
                        </span>
                      )}
                      {latestCall.extracted_data.workModePreference && (
                        <span style={{ fontSize: '0.78rem', padding: '4px 10px', borderRadius: 8, background: 'var(--neu-bg-deep)', color: 'var(--text-secondary)' }}>
                          Work Mode: <b>{latestCall.extracted_data.workModePreference}</b>
                        </span>
                      )}
                      {latestCall.extracted_data.skillsMentioned?.length > 0 && (
                        <span style={{ fontSize: '0.78rem', padding: '4px 10px', borderRadius: 8, background: 'var(--neu-bg-deep)', color: 'var(--text-secondary)' }}>
                          Skills: <b>{latestCall.extracted_data.skillsMentioned.join(', ')}</b>
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Transcript Toggle & View */}
                {latestCall.transcript && (
                  <div style={{ marginTop: 12 }}>
                    <button
                      onClick={() => setShowTranscript(!showTranscript)}
                      className="btn btn-secondary"
                      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', padding: '6px 12px' }}
                    >
                      <MessageSquare size={14} />
                      {showTranscript ? 'Hide Call Transcript' : 'View Full Call Transcript'}
                      {showTranscript ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>

                    {showTranscript && (
                      <div style={{
                        marginTop: 10,
                        padding: 14,
                        borderRadius: 10,
                        background: 'var(--neu-bg-deep)',
                        border: '1px solid rgba(0,0,0,0.06)',
                        maxHeight: 280,
                        overflowY: 'auto',
                        fontSize: '0.8rem',
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'monospace',
                        color: 'var(--text-primary)',
                      }}>
                        {latestCall.transcript}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Scorecards & AI Summary Row */}
            <div className="neu-responsive-split" style={{ gap: 20 }}>
              {/* Evaluator Scorecard */}
              <div className="card neu-interview-card">
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Award size={18} color="var(--accent)" /> Interview Evaluation Scorecard
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Technical Architecture:</span>
                      <b style={{ color: 'var(--text-primary)' }}>88/100</b>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--neu-bg-deep)', overflow: 'hidden' }}>
                      <div style={{ width: '88%', height: '100%', background: 'var(--accent)' }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Problem Solving & Algorithms:</span>
                      <b style={{ color: 'var(--text-primary)' }}>85/100</b>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--neu-bg-deep)', overflow: 'hidden' }}>
                      <div style={{ width: '85%', height: '100%', background: '#06B6D4' }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>System Design & Scalability:</span>
                      <b style={{ color: 'var(--text-primary)' }}>92/100</b>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--neu-bg-deep)', overflow: 'hidden' }}>
                      <div style={{ width: '92%', height: '100%', background: '#10B981' }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Communication & Culture:</span>
                      <b style={{ color: 'var(--text-primary)' }}>90/100</b>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--neu-bg-deep)', overflow: 'hidden' }}>
                      <div style={{ width: '90%', height: '100%', background: '#F59E0B' }} />
                    </div>
                  </div>
                </div>

                <div style={{
                  background: 'var(--neu-bg-deep)',
                  padding: 12,
                  borderRadius: 12,
                  marginTop: 18,
                  fontSize: '0.8rem',
                  lineHeight: 1.5,
                  color: 'var(--text-secondary)',
                  wordBreak: 'break-word',
                  overflowWrap: 'break-word',
                }}>
                  <b>Evaluator Recommendation:</b> Strong Hire. Candidate has outstanding production experience in multi-tenant architectures and PostgreSQL indexing.
                </div>
              </div>

              {/* AI Voice 5-Dimension Scorecard */}
              <div className="card neu-interview-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sparkles size={18} color="#8B5CF6" /> AI Voice Screening Dimensions
                  </h3>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, background: 'var(--neu-bg-deep)', padding: '2px 8px', borderRadius: 8, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                    Overall: {latestCall?.overall_score != null ? `${Math.round(latestCall.overall_score)}/100` : 'Pending'}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Skill Relevance (30%):</span>
                      <b style={{ color: 'var(--text-primary)' }}>{scoreBreakdown?.skill_relevance?.score != null ? `${scoreBreakdown.skill_relevance.score}/100` : '—'}</b>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--neu-bg-deep)', overflow: 'hidden' }}>
                      <div style={{ width: `${scoreBreakdown?.skill_relevance?.score ?? 0}%`, height: '100%', background: '#8B5CF6' }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Role Fit (25%):</span>
                      <b style={{ color: 'var(--text-primary)' }}>{scoreBreakdown?.role_relevance?.score != null ? `${scoreBreakdown.role_relevance.score}/100` : '—'}</b>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--neu-bg-deep)', overflow: 'hidden' }}>
                      <div style={{ width: `${scoreBreakdown?.role_relevance?.score ?? 0}%`, height: '100%', background: '#3B82F6' }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Communication (20%):</span>
                      <b style={{ color: 'var(--text-primary)' }}>{scoreBreakdown?.communication?.score != null ? `${scoreBreakdown.communication.score}/100` : '—'}</b>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--neu-bg-deep)', overflow: 'hidden' }}>
                      <div style={{ width: `${scoreBreakdown?.communication?.score ?? 0}%`, height: '100%', background: '#10B981' }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Experience Fit (15%):</span>
                      <b style={{ color: 'var(--text-primary)' }}>{scoreBreakdown?.experience?.score != null ? `${scoreBreakdown.experience.score}/100` : '—'}</b>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--neu-bg-deep)', overflow: 'hidden' }}>
                      <div style={{ width: `${scoreBreakdown?.experience?.score ?? 0}%`, height: '100%', background: '#F59E0B' }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Availability Fit (10%):</span>
                      <b style={{ color: 'var(--text-primary)' }}>{scoreBreakdown?.availability_fit?.score != null ? `${scoreBreakdown.availability_fit.score}/100` : '—'}</b>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--neu-bg-deep)', overflow: 'hidden' }}>
                      <div style={{ width: `${scoreBreakdown?.availability_fit?.score ?? 0}%`, height: '100%', background: '#06B6D4' }} />
                    </div>
                  </div>
                </div>

                <div style={{
                  marginTop: 16,
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'rgba(245, 158, 11, 0.1)',
                  color: '#D97706',
                  fontSize: '0.72rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  wordBreak: 'break-word',
                  overflowWrap: 'break-word',
                }}>
                  <Shield size={14} style={{ flexShrink: 0 }} /> AI drafts & summarizes. Human recruiter must trigger hiring stage changes.
                </div>
              </div>
            </div>

            {/* Next Step Banner if Selected */}
            {activeApp.stage === 'SELECTED' && (
              <div className="card neu-selected-banner">
                <div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                    🎉 Candidate Selected! Next Step: Offer & Onboarding
                  </h4>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 2, wordBreak: 'break-word' }}>
                    Generate formal job offer, release candidate portal link, and collect onboarding documents.
                  </p>
                </div>
                <Link
                  href="/hiring/onboard"
                  className="btn btn-primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}
                >
                  <FileCheck size={16} /> Go to Onboard & Release Offer <ArrowRight size={15} />
                </Link>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </PageWrapper>
  )
}
