'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import {
  Video, CheckCircle2, XCircle, PhoneCall, Sparkles,
  Award, Clock, ArrowRight, UserCheck, UserX, MessageSquare,
  FileCheck, Shield, ChevronRight
} from 'lucide-react'
import { PageWrapper } from '@/components/ui/PageWrapper'
import { useToast } from '@/components/ui/Toast'

export default function InterviewStatusPage() {
  const { success, error: toastError } = useToast()
  const qc = useQueryClient()

  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)
  const [activeVoiceCall, setActiveVoiceCall] = useState<any | null>(null)

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

  const activeApp = applications.find((a: any) => a.id === selectedCandidateId) || applications[0]

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

  // Voice AI Screening Trigger Mutation
  const voiceCallMutation = useMutation({
    mutationFn: async (candidateId: string) => {
      const res = await fetch('/api/hiring/voice/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_id: candidateId,
          call_purpose: 'SCREENING',
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
      success(`Voice screening call initiated via ${data.provider}!`)
    },
    onError: (err: any) => {
      toastError(err.message || 'Voice call initiation failed')
    }
  })

  return (
    <PageWrapper className="w-full max-w-full neu-mobile-safe-bottom" style={{ maxWidth: 1280, margin: '0 auto' }}>
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
                    onClick={() => setSelectedCandidateId(app.id)}
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

                {/* Actions: Selected, Rejected, Voice Call */}
                <div className="neu-interview-actions">
                  <button
                    onClick={() => voiceCallMutation.mutate(activeApp.candidate.id)}
                    disabled={voiceCallMutation.isPending}
                    className="btn btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
                  >
                    <PhoneCall size={15} color="var(--accent)" />
                    {voiceCallMutation.isPending ? 'Calling…' : 'Voice AI Screening'}
                  </button>

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

              {/* AI Voice & Screening Summary */}
              <div className="card neu-interview-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sparkles size={18} color="#8B5CF6" /> AI Screening Summary
                  </h3>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, background: 'var(--neu-bg-deep)', padding: '2px 8px', borderRadius: 8, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                    Claude 3.7 Sonnet
                  </span>
                </div>

                <div style={{
                  background: 'var(--neu-bg-deep)',
                  padding: 14,
                  borderRadius: 12,
                  fontSize: '0.82rem',
                  color: 'var(--text-primary)',
                  lineHeight: 1.6,
                  marginBottom: 14,
                  wordBreak: 'break-word',
                  overflowWrap: 'break-word',
                }}>
                  Candidate demonstrated deep practical domain expertise in Next.js 15 App Router, React 19 concurrent features, and Supabase Row-Level Security. Notice period is confirmed at 30 days (negotiable to 15 days).
                </div>

                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 6, wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                  <div>• <b>Identified Strengths:</b> High agency, system modeling, clean API design</div>
                  <div>• <b>Areas to Probe:</b> Experience with multi-region database failover</div>
                  <div>• <b>Voice Call Status:</b> Completed (Duration: 3m 15s, Sentiment: Positive)</div>
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
