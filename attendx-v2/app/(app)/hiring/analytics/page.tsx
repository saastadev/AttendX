'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp, Users, Clock, CheckCircle2, Award, BarChart2,
  Sparkles, AlertTriangle, UserCheck, Check, X, Search
} from 'lucide-react'
import { PageWrapper } from '@/components/ui/PageWrapper'

interface InterviewRound {
  name: string
  date: string
  score: number
}

interface CompetencyScore {
  name: string
  score: number
  target: number
}

interface CandidateProfile {
  id: string
  name: string
  initials: string
  avatarBg: string
  role: string
  experience: string
  lastInterviewDate: string
  overallScore: number
  badge: string
  rounds: InterviewRound[]
  competencies: CompetencyScore[]
}

interface AIRecommendationItem {
  id: string
  organization_id: string
  requisition_id?: string | null
  recommendation_type: 'BOTTLENECK' | 'SOURCING_GAP' | 'SALARY_BENCHMARK' | 'CANDIDATE_NEXT_STEP'
  title: string
  description: string
  impact_score: number
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED'
  review_notes?: string | null
  reviewed_by?: string | null
  reviewed_at?: string | null
  created_at: string
  requisition?: { id: string; title: string } | null
}

function getCategoryBadgeStyle(type?: string | null) {
  const safeType = String(type || 'RECOMMENDATION').toUpperCase()
  switch (safeType) {
    case 'BOTTLENECK':
    case 'BOTTLENECK_OPTIMIZATION':
      return {
        label: 'Bottleneck Alert',
        icon: <AlertTriangle size={13} />,
        bg: 'rgba(239, 68, 68, 0.10)',
        color: '#DC2626',
        border: 'rgba(239, 68, 68, 0.25)',
      }
    case 'SOURCING_GAP':
    case 'SOURCING_EXPANSION':
      return {
        label: 'Sourcing Gap',
        icon: <Search size={13} />,
        bg: 'rgba(99, 102, 241, 0.10)',
        color: '#6366F1',
        border: 'rgba(99, 102, 241, 0.25)',
      }
    case 'CANDIDATE_NEXT_STEP':
      return {
        label: 'Candidate Next Step',
        icon: <UserCheck size={13} />,
        bg: 'rgba(16, 185, 129, 0.10)',
        color: '#059669',
        border: 'rgba(16, 185, 129, 0.25)',
      }
    case 'SALARY_BENCHMARK':
      return {
        label: 'Salary Benchmark',
        icon: <Sparkles size={13} />,
        bg: 'rgba(245, 158, 11, 0.10)',
        color: '#D97706',
        border: 'rgba(245, 158, 11, 0.25)',
      }
    default:
      return {
        label: safeType.replace(/_/g, ' '),
        icon: <Sparkles size={13} />,
        bg: 'rgba(100, 116, 139, 0.10)',
        color: '#475569',
        border: 'rgba(100, 116, 139, 0.25)',
      }
  }
}

function getScoreColor(score: number): string {
  if (score >= 80) return '#10B981'
  if (score >= 65) return '#F59E0B'
  return '#EF4444'
}

export default function HiringAnalyticsPage() {
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)
  const [recFilter, setRecFilter] = useState<'ALL' | 'PENDING' | 'ACCEPTED' | 'REJECTED'>('ALL')
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})
  const [submittingRecId, setSubmittingRecId] = useState<string | null>(null)

  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: ['hiring-analytics-funnel'],
    queryFn: async () => {
      const res = await fetch('/api/hiring/analytics/funnel')
      if (!res.ok) return { funnel: null, candidateProfiles: [] }
      return res.json()
    },
  })

  const { data: recsData, isLoading: recsLoading, refetch: refetchRecs } = useQuery({
    queryKey: ['hiring-ai-recommendations'],
    queryFn: async () => {
      const res = await fetch('/api/hiring/analytics/recommendations')
      if (!res.ok) return { recommendations: [] }
      return res.json()
    },
  })

  const funnel = analyticsData?.funnel
  const candidateProfiles: CandidateProfile[] = analyticsData?.candidateProfiles || []
  const selectedCandidate = candidateProfiles.find(c => c.id === selectedCandidateId) || candidateProfiles[0] || null

  const rawRecommendations: AIRecommendationItem[] = recsData?.recommendations || []
  const pendingCount = rawRecommendations.filter(r => r.status === 'PENDING').length
  const filteredRecs = rawRecommendations.filter(r => {
    if (recFilter === 'ALL') return true
    return r.status === recFilter
  })

  const handleReview = async (id: string, status: 'ACCEPTED' | 'REJECTED') => {
    setSubmittingRecId(id)
    try {
      const res = await fetch(`/api/hiring/analytics/recommendations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          review_notes: reviewNotes[id] || '',
        }),
      })
      if (res.ok) {
        await refetchRecs()
      }
    } catch (e) {
      console.error('Failed to review recommendation:', e)
    } finally {
      setSubmittingRecId(null)
    }
  }

  return (
    <PageWrapper className="w-full max-w-full" style={{ maxWidth: 1280, margin: '0 auto' }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title" style={{ fontSize: 'clamp(1.35rem, 4vw, 1.75rem)', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
            Hiring Analytics & AI Insights
          </h1>
          <p className="page-subtitle" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Real-time funnel conversion rates, stage bottleneck identification, candidate competency scores, and predictive recommendations.
          </p>
        </div>
      </div>

      {/* Top Metrics Banner */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {/* Total Applicants */}
        <div
          className="card neu-analytics-metric-card"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-tertiary)' }}>Total Applicants</span>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(99, 102, 241, 0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={18} color="#6366F1" />
            </div>
          </div>
          <div style={{ fontSize: '1.9rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>
            {analyticsLoading ? '—' : (funnel?.totalCandidates ?? 0)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 6 }}>Across all active requisitions</div>
        </div>

        {/* Successful Hires */}
        <div
          className="card neu-analytics-metric-card"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-tertiary)' }}>Successful Hires</span>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(16, 185, 129, 0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={18} color="#10B981" />
            </div>
          </div>
          <div style={{ fontSize: '1.9rem', fontWeight: 800, color: '#10B981', lineHeight: 1.1 }}>
            {analyticsLoading ? '—' : (funnel?.totalHires ?? 0)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 6 }}>Completed onboarding</div>
        </div>

        {/* Overall Conversion */}
        <div
          className="card neu-analytics-metric-card"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-tertiary)' }}>Overall Conversion</span>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(6, 182, 212, 0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={18} color="#06B6D4" />
            </div>
          </div>
          <div style={{ fontSize: '1.9rem', fontWeight: 800, color: '#06B6D4', lineHeight: 1.1 }}>
            {analyticsLoading ? '—' : `${funnel?.overallConversionRate ?? 0}%`}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 6 }}>Sourced to Hired ratio</div>
        </div>

        {/* Avg Time to Hire */}
        <div
          className="card neu-analytics-metric-card"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-tertiary)' }}>Avg Time to Hire</span>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(245, 158, 11, 0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={18} color="#F59E0B" />
            </div>
          </div>
          <div style={{ fontSize: '1.9rem', fontWeight: 800, color: '#F59E0B', lineHeight: 1.1 }}>
            {analyticsLoading ? '—' : `${funnel?.timeToHireDays ?? 0} days`}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 6 }}>Median requisition cycle</div>
        </div>
      </div>

      {/* AI Recommendations & Bottleneck Alerts Section */}
      <div
        className="card"
        style={{
          background: 'var(--neu-base)',
          boxShadow: 'var(--elev-1)',
          borderRadius: 22,
          padding: '24px 26px',
          border: '1px solid rgba(226, 232, 240, 0.7)',
          marginBottom: 24,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: 'rgba(99, 102, 241, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Sparkles size={16} color="#6366F1" />
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                AI Hiring Recommendations & Bottleneck Alerts
              </h2>
            </div>
            <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
              Data-driven pipeline optimizations derived strictly from live funnel latency, sourcing match quality, and candidate interview scorecards.
            </p>
          </div>

          {/* Filter pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {(['ALL', 'PENDING', 'ACCEPTED', 'REJECTED'] as const).map(f => (
              <button
                key={f}
                onClick={() => setRecFilter(f)}
                type="button"
                style={{
                  padding: '6px 12px',
                  borderRadius: 10,
                  fontSize: '0.75rem',
                  fontWeight: recFilter === f ? 700 : 500,
                  background: recFilter === f ? '#5B5BF5' : 'rgba(241, 245, 249, 0.8)',
                  color: recFilter === f ? '#FFFFFF' : 'var(--text-secondary)',
                  border: recFilter === f ? 'none' : '1px solid rgba(226, 232, 240, 0.8)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
                {f === 'PENDING' && pendingCount > 0 && (
                  <span style={{
                    marginLeft: 6,
                    padding: '1px 5px',
                    borderRadius: 999,
                    background: recFilter === f ? 'rgba(255,255,255,0.3)' : '#F59E0B',
                    color: '#FFFFFF',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                  }}>
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* List of recommendations or authentic empty state */}
        {recsLoading ? (
          <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Analyzing hiring pipeline signals...
          </div>
        ) : filteredRecs.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '36px 20px',
              textAlign: 'center',
              background: 'rgba(248, 250, 252, 0.5)',
              borderRadius: 16,
              border: '1px dashed rgba(203, 213, 225, 0.8)',
            }}
          >
            <Sparkles size={32} style={{ marginBottom: 10, opacity: 0.35, color: '#6366F1' }} />
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {recFilter === 'ALL' ? 'No Recommendations at this time' : `No ${recFilter.toLowerCase()} recommendations`}
            </div>
            <p style={{ fontSize: '0.8rem', marginTop: 4, lineHeight: 1.4, maxWidth: 440, color: 'var(--text-secondary)' }}>
              {recFilter === 'ALL'
                ? 'Pipeline health is nominal with no stage latency bottlenecks or sourcing deficits exceeding action thresholds. Recommendations are generated automatically when authentic data triggers are met.'
                : `There are currently no recommendations with status "${recFilter}".`}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {filteredRecs.map(rec => {
              const status = rec.status ?? 'PENDING'
              const isPending = status === 'PENDING'
              const badgeStyle = getCategoryBadgeStyle(rec.recommendation_type)
              const hasImpactScore = rec.impact_score !== null && rec.impact_score !== undefined && !isNaN(Number(rec.impact_score))
              const impactScore = hasImpactScore ? Number(rec.impact_score) : null

              return (
                <div
                  key={rec.id}
                  style={{
                    background: 'var(--neu-bg-raised, #FFFFFF)',
                    border: '1px solid rgba(226, 232, 240, 0.8)',
                    borderRadius: 16,
                    padding: '18px 20px',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      {/* Category Badge */}
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '4px 10px',
                          borderRadius: 8,
                          fontSize: '0.725rem',
                          fontWeight: 700,
                          background: badgeStyle.bg,
                          color: badgeStyle.color,
                          border: `1px solid ${badgeStyle.border}`,
                        }}
                      >
                        {badgeStyle.icon}
                        {badgeStyle.label}
                      </span>

                      {/* Status Badge */}
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          background:
                            status === 'ACCEPTED' ? 'rgba(16, 185, 129, 0.12)' :
                            status === 'REJECTED' ? 'rgba(239, 68, 68, 0.10)' :
                            'rgba(245, 158, 11, 0.12)',
                          color:
                            status === 'ACCEPTED' ? '#059669' :
                            status === 'REJECTED' ? '#DC2626' :
                            '#D97706',
                        }}
                      >
                        {status}
                      </span>

                      {/* Impact Score Pill */}
                      {hasImpactScore && impactScore !== null ? (
                        <span
                          style={{
                            fontSize: '0.725rem',
                            fontWeight: 700,
                            color: impactScore >= 80 ? '#059669' : '#D97706',
                            background: 'rgba(241, 245, 249, 0.9)',
                            padding: '3px 8px',
                            borderRadius: 6,
                          }}
                        >
                          Impact Score: {Math.round(impactScore)}/100
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: '0.725rem',
                            fontWeight: 600,
                            color: 'var(--text-tertiary, #64748B)',
                            background: 'rgba(241, 245, 249, 0.9)',
                            padding: '3px 8px',
                            borderRadius: 6,
                          }}
                        >
                          No impact score available
                        </span>
                      )}
                    </div>

                    <span style={{ fontSize: '0.725rem', color: 'var(--text-tertiary)' }}>
                      Detected {rec.created_at ? new Date(rec.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date unavailable'}
                    </span>
                  </div>

                  <div>
                    <h4 style={{ fontSize: '0.975rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>
                      {rec.title}
                    </h4>
                    <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
                      {rec.description}
                    </p>
                  </div>

                  {/* Review Notes & Action Controls */}
                  {isPending ? (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 12,
                        paddingTop: 10,
                        borderTop: '1px solid rgba(241, 245, 249, 0.9)',
                      }}
                    >
                      <input
                        type="text"
                        placeholder="Add review notes (optional)..."
                        value={reviewNotes[rec.id] || ''}
                        onChange={e => setReviewNotes(prev => ({ ...prev, [rec.id]: e.target.value }))}
                        style={{
                          flex: '1 1 240px',
                          padding: '7px 12px',
                          fontSize: '0.8rem',
                          borderRadius: 8,
                          border: '1px solid rgba(203, 213, 225, 0.8)',
                          background: '#FFFFFF',
                          outline: 'none',
                        }}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                          type="button"
                          disabled={submittingRecId === rec.id}
                          onClick={() => handleReview(rec.id, 'ACCEPTED')}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '7px 14px',
                            borderRadius: 8,
                            fontSize: '0.775rem',
                            fontWeight: 700,
                            background: '#10B981',
                            color: '#FFFFFF',
                            border: 'none',
                            cursor: 'pointer',
                            opacity: submittingRecId === rec.id ? 0.6 : 1,
                          }}
                        >
                          <Check size={14} />
                          Accept
                        </button>
                        <button
                          type="button"
                          disabled={submittingRecId === rec.id}
                          onClick={() => handleReview(rec.id, 'REJECTED')}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '7px 14px',
                            borderRadius: 8,
                            fontSize: '0.775rem',
                            fontWeight: 600,
                            background: 'transparent',
                            color: 'var(--text-secondary)',
                            border: '1px solid rgba(203, 213, 225, 0.8)',
                            cursor: 'pointer',
                            opacity: submittingRecId === rec.id ? 0.6 : 1,
                          }}
                        >
                          <X size={14} />
                          Reject
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        paddingTop: 8,
                        borderTop: '1px solid rgba(241, 245, 249, 0.9)',
                        fontSize: '0.75rem',
                        color: 'var(--text-tertiary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 8,
                      }}
                    >
                      <span>
                        Reviewed on {rec.reviewed_at ? new Date(rec.reviewed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </span>
                      {rec.review_notes && (
                        <span style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                          Notes: &ldquo;{rec.review_notes}&rdquo;
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Master-Detail Candidate Grid — Equal Height & Perfectly Aligned Bottom */}
      <div className="neu-analytics-grid">
        {/* Left Column: Candidate Profiles Card */}
        <div
          className="card"
          style={{
            background: 'var(--neu-base)',
            boxShadow: 'var(--elev-1)',
            borderRadius: 22,
            padding: '24px 20px 18px 20px',
            border: '1px solid rgba(226, 232, 240, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
          }}
        >
          {/* Header */}
          <div style={{ marginBottom: 16, paddingLeft: 4, paddingRight: 4 }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
              Candidate Profiles
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              Interview performance, dates and scores for each candidate. Select a profile to see the detail.
            </p>
          </div>

          {/* Candidate Items List — Stretches evenly */}
          {candidateProfiles.length === 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '48px 16px',
              textAlign: 'center',
              color: 'var(--text-secondary)',
              flex: 1,
            }}>
              <Users size={32} style={{ marginBottom: 12, opacity: 0.4, color: '#6366F1' }} />
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                No Candidate Evaluations Yet
              </div>
              <p style={{ fontSize: '0.8rem', marginTop: 4, lineHeight: 1.4, maxWidth: 260 }}>
                Candidate interview scorecards and competency profiles will appear here once evaluations are submitted.
              </p>
            </div>
          ) : (
            <div
              className="neu-analytics-candidate-list"
              style={{
                justifyContent: 'flex-start',
                gap: 8,
                marginBottom: 14,
              }}
            >
              {candidateProfiles.map(candidate => {
                const isSelected = candidate.id === selectedCandidate?.id
                const scoreColor = getScoreColor(candidate.overallScore)

                return (
                  <div
                    key={candidate.id}
                    onClick={() => setSelectedCandidateId(candidate.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setSelectedCandidateId(candidate.id)
                      }
                    }}
                    className="neu-analytics-candidate-item"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      borderRadius: 14,
                      background: isSelected ? 'rgba(91, 91, 245, 0.04)' : 'var(--neu-bg-raised, #F8FAFC)',
                      border: isSelected ? '2px solid #5B5BF5' : '1px solid rgba(226, 232, 240, 0.8)',
                      boxShadow: isSelected
                        ? '0 4px 14px rgba(91, 91, 245, 0.14)'
                        : '0 1px 3px rgba(0, 0, 0, 0.03)',
                      cursor: 'pointer',
                      transition: 'all 0.18s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                      {/* Initials Avatar */}
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          background: candidate.avatarBg || '#5B5BF5',
                          color: '#FFFFFF',
                          fontWeight: 700,
                          fontSize: '0.9rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.2)',
                        }}
                      >
                        {candidate.initials}
                      </div>

                      {/* Info */}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.925rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {candidate.name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {candidate.role} · Interviewed {candidate.lastInterviewDate}
                        </div>
                      </div>
                    </div>

                    {/* Score */}
                    <div
                      style={{
                        fontSize: '1.2rem',
                        fontWeight: 800,
                        color: scoreColor,
                        paddingLeft: 10,
                        flexShrink: 0,
                      }}
                    >
                      {candidate.overallScore}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Bottom Footer to match right panel legend line */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: 14,
              minHeight: 40,
              borderTop: '1px solid rgba(226, 232, 240, 0.7)',
              fontSize: '0.75rem',
              color: 'var(--text-tertiary)',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Users size={14} color="#6366F1" />
              <span>{candidateProfiles.length} active candidate{candidateProfiles.length === 1 ? '' : 's'} evaluated</span>
            </div>
            <span>Benchmark: 75% target</span>
          </div>
        </div>

        {/* Right Column: Candidate Detail Card */}
        <div
          className="card"
          style={{
            background: 'var(--neu-base)',
            boxShadow: 'var(--elev-1)',
            borderRadius: 22,
            padding: '24px 26px 18px 26px',
            border: '1px solid rgba(226, 232, 240, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
          }}
        >
          {!selectedCandidate ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              padding: '64px 20px',
              height: '100%',
              minHeight: 400,
              color: 'var(--text-secondary)',
            }}>
              <Award size={48} style={{ marginBottom: 16, opacity: 0.35, color: '#6366F1' }} />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                No Candidate Evaluation Selected
              </h3>
              <p style={{ fontSize: '0.825rem', marginTop: 8, maxWidth: 360, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                When candidate interview evaluations are recorded, select a profile from the left panel to inspect round-by-round scores and competency alignment.
              </p>
            </div>
          ) : (
            <>
              {/* Header section with Candidate info & overall score */}
              <div className="neu-candidate-detail-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: '1 1 auto' }}>
                  <div
                    style={{
                      width: 50,
                      height: 50,
                      borderRadius: '50%',
                      background: selectedCandidate.avatarBg || '#5B5BF5',
                      color: '#FFFFFF',
                      fontWeight: 800,
                      fontSize: '1.15rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.25)',
                    }}
                  >
                    {selectedCandidate.initials}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <h2 style={{ fontSize: 'clamp(1.1rem, 3vw, 1.3rem)', fontWeight: 800, color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}>
                      {selectedCandidate.name}
                    </h2>
                    <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginTop: 3 }}>
                      {selectedCandidate.role} · {selectedCandidate.experience}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 10px',
                          borderRadius: 12,
                          background: 'rgba(91, 91, 245, 0.12)',
                          color: '#5B5BF5',
                          fontSize: '0.725rem',
                          fontWeight: 700,
                        }}
                      >
                        {selectedCandidate.badge}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Performance Score Badge */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div
                    style={{
                      fontSize: 'clamp(1.8rem, 4vw, 2.4rem)',
                      fontWeight: 800,
                      color: getScoreColor(selectedCandidate.overallScore),
                      lineHeight: 1,
                    }}
                  >
                    {selectedCandidate.overallScore}
                  </div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginTop: 4 }}>
                    Performance score
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
                    Last interview: {selectedCandidate.lastInterviewDate}
                  </div>
                </div>
              </div>

              {/* Section 1: Score by interview round */}
              <div style={{ marginTop: 16, marginBottom: 18 }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
                  Score by interview round
                </h3>
                <p style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginBottom: 14 }}>
                  Each bar is one round, with its date below.
                </p>

                {/* Vertical Bar Chart */}
                {(!selectedCandidate.rounds || selectedCandidate.rounds.length === 0) ? (
                  <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.825rem' }}>
                    No interview round scores recorded for this candidate yet.
                  </div>
                ) : (
                  <div className="neu-chart-scroll-wrapper">
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${selectedCandidate.rounds.length}, minmax(76px, 1fr))`,
                        minWidth: 340,
                        gap: 14,
                        alignItems: 'end',
                        paddingTop: 6,
                        paddingBottom: 2,
                      }}
                    >
                      {selectedCandidate.rounds.map((round, idx) => {
                        const barColor = getScoreColor(round.score)
                        const barHeightPct = Math.min(100, Math.max(20, round.score))

                        return (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            {/* Score Label on top */}
                            <span
                              style={{
                                fontSize: '0.875rem',
                                fontWeight: 700,
                                color: barColor,
                              }}
                            >
                              {round.score}
                            </span>

                            {/* Bar Pillar in capsule track */}
                            <div
                              style={{
                                width: '100%',
                                maxWidth: 44,
                                height: 88,
                                background: 'var(--neu-bg-deep, #F1F5F9)',
                                borderRadius: 10,
                                display: 'flex',
                                alignItems: 'flex-end',
                                justifyContent: 'center',
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  width: '100%',
                                  height: `${barHeightPct}%`,
                                  background: barColor,
                                  borderRadius: '8px 8px 6px 6px',
                                  transition: 'height 0.4s ease, background-color 0.3s ease',
                                }}
                              />
                            </div>

                            {/* Round name & date */}
                            <div style={{ textAlign: 'center', marginTop: 2 }}>
                              <div style={{ fontSize: '0.775rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                                {round.name}
                              </div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: 1, whiteSpace: 'nowrap' }}>
                                {round.date}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Section 2: Candidate Competency Matrix */}
              <div style={{ marginTop: 14, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      background: 'rgba(99, 102, 241, 0.12)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Award size={15} color="#6366F1" />
                  </div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                    Candidate Competency Matrix
                  </h3>
                </div>
                <p style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.4 }}>
                  Evaluation scores aggregated across technical and culture interviews vs organization benchmarks. The dark tick marks the target for each competency.
                </p>

                {(!selectedCandidate.competencies || selectedCandidate.competencies.length === 0) ? (
                  <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.825rem' }}>
                    No competency scores recorded for this candidate yet.
                  </div>
                ) : (
                  <div className="neu-chart-scroll-wrapper">
                    <div style={{ minWidth: 440, display: 'flex', flexDirection: 'column', gap: 11, paddingBottom: 4 }}>
                      {selectedCandidate.competencies.map((comp, idx) => {
                        const barColor = getScoreColor(comp.score)
                        const isAboveTarget = comp.score >= comp.target

                        return (
                          <div
                            key={idx}
                            className="neu-competency-row"
                          >
                            {/* Competency Name */}
                            <div className="neu-competency-name">
                              {comp.name}
                            </div>

                            {/* Progress Track with Target Tick */}
                            <div className="neu-competency-track">
                              {/* Filled Progress Bar */}
                              <div
                                style={{
                                  width: `${Math.min(100, comp.score)}%`,
                                  height: '100%',
                                  background: barColor,
                                  borderRadius: 5,
                                  transition: 'width 0.4s ease',
                                }}
                              />

                              {/* Target Dark Tick Mark */}
                              <div
                                title={`Target benchmark: ${comp.target}%`}
                                style={{
                                  position: 'absolute',
                                  left: `${comp.target}%`,
                                  top: -3,
                                  bottom: -3,
                                  width: 2,
                                  background: '#334155',
                                  borderRadius: 1,
                                  zIndex: 2,
                                }}
                              />
                            </div>

                            {/* Score / Target Label */}
                            <div className="neu-competency-score">
                              <b style={{ color: isAboveTarget ? '#10B981' : '#F59E0B', fontWeight: 700 }}>
                                {comp.score}%
                              </b>
                              <span style={{ color: 'var(--text-tertiary)', marginLeft: 4 }}>/ {comp.target}%</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Color Legend Footer — Aligned with Left Panel Footer */}
              <div className="neu-chart-scroll-wrapper" style={{ borderTop: '1px solid rgba(226, 232, 240, 0.7)', marginTop: 16, paddingTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, minWidth: 320, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                    <div style={{ width: 11, height: 11, borderRadius: 3, background: '#10B981' }} />
                    <span style={{ whiteSpace: 'nowrap' }}>80 and above</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                    <div style={{ width: 11, height: 11, borderRadius: 3, background: '#F59E0B' }} />
                    <span style={{ whiteSpace: 'nowrap' }}>65 to 79</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                    <div style={{ width: 11, height: 11, borderRadius: 3, background: '#EF4444' }} />
                    <span style={{ whiteSpace: 'nowrap' }}>Below 65</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </PageWrapper>
  )
}
