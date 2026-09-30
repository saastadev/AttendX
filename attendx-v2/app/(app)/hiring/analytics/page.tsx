'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp, Users, Clock, CheckCircle2, Award, BarChart2
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

const CANDIDATES: CandidateProfile[] = [
  {
    id: 'aarav-sharma',
    name: 'Aarav Sharma',
    initials: 'AS',
    avatarBg: '#5B5BF5',
    role: 'Backend Lead',
    experience: '7 yrs experience',
    lastInterviewDate: '28 Sep 2026',
    overallScore: 84,
    badge: 'Interview Rounds',
    rounds: [
      { name: 'Screening', date: '18 Sep', score: 78 },
      { name: 'Technical R1', date: '22 Sep', score: 85 },
      { name: 'Technical R2', date: '25 Sep', score: 88 },
      { name: 'Culture', date: '28 Sep', score: 80 },
    ],
    competencies: [
      { name: 'Technical Skills', score: 88, target: 75 },
      { name: 'Communication', score: 82, target: 70 },
      { name: 'Problem Solving', score: 85, target: 72 },
      { name: 'Culture Fit', score: 80, target: 80 },
      { name: 'System Design', score: 86, target: 70 },
    ],
  },
  {
    id: 'meera-iyer',
    name: 'Meera Iyer',
    initials: 'MI',
    avatarBg: '#059669',
    role: 'Senior Full-Stack',
    experience: '6 yrs experience',
    lastInterviewDate: '24 Sep 2026',
    overallScore: 91,
    badge: 'Interview Rounds',
    rounds: [
      { name: 'Screening', date: '15 Sep', score: 88 },
      { name: 'Technical R1', date: '19 Sep', score: 92 },
      { name: 'Technical R2', date: '22 Sep', score: 95 },
      { name: 'Culture', date: '24 Sep', score: 89 },
    ],
    competencies: [
      { name: 'Technical Skills', score: 95, target: 75 },
      { name: 'Communication', score: 90, target: 70 },
      { name: 'Problem Solving', score: 92, target: 72 },
      { name: 'Culture Fit', score: 88, target: 80 },
      { name: 'System Design', score: 90, target: 70 },
    ],
  },
  {
    id: 'rohan-verma',
    name: 'Rohan Verma',
    initials: 'RV',
    avatarBg: '#F59E0B',
    role: 'DevOps Engineer',
    experience: '5 yrs experience',
    lastInterviewDate: '29 Sep 2026',
    overallScore: 72,
    badge: 'Interview Rounds',
    rounds: [
      { name: 'Screening', date: '20 Sep', score: 68 },
      { name: 'Technical R1', date: '24 Sep', score: 74 },
      { name: 'Technical R2', date: '27 Sep', score: 70 },
      { name: 'Culture', date: '29 Sep', score: 76 },
    ],
    competencies: [
      { name: 'Technical Skills', score: 74, target: 75 },
      { name: 'Communication', score: 70, target: 70 },
      { name: 'Problem Solving', score: 72, target: 72 },
      { name: 'Culture Fit', score: 75, target: 80 },
      { name: 'System Design', score: 69, target: 70 },
    ],
  },
  {
    id: 'sneha-reddy',
    name: 'Sneha Reddy',
    initials: 'SR',
    avatarBg: '#EC4899',
    role: 'Frontend Engineer',
    experience: '4.5 yrs experience',
    lastInterviewDate: '26 Sep 2026',
    overallScore: 86,
    badge: 'Interview Rounds',
    rounds: [
      { name: 'Screening', date: '17 Sep', score: 82 },
      { name: 'Technical R1', date: '21 Sep', score: 88 },
      { name: 'Technical R2', date: '24 Sep', score: 85 },
      { name: 'Culture', date: '26 Sep', score: 89 },
    ],
    competencies: [
      { name: 'Technical Skills', score: 89, target: 75 },
      { name: 'Communication', score: 88, target: 70 },
      { name: 'Problem Solving', score: 85, target: 72 },
      { name: 'Culture Fit', score: 84, target: 80 },
      { name: 'System Design', score: 86, target: 70 },
    ],
  },
  {
    id: 'karan-patel',
    name: 'Karan Patel',
    initials: 'KP',
    avatarBg: '#EF4444',
    role: 'Backend Lead',
    experience: '5 yrs experience',
    lastInterviewDate: '30 Sep 2026',
    overallScore: 58,
    badge: 'Interview Rounds',
    rounds: [
      { name: 'Screening', date: '22 Sep', score: 62 },
      { name: 'Technical R1', date: '26 Sep', score: 56 },
      { name: 'Technical R2', date: '28 Sep', score: 54 },
      { name: 'Culture', date: '30 Sep', score: 60 },
    ],
    competencies: [
      { name: 'Technical Skills', score: 58, target: 75 },
      { name: 'Communication', score: 55, target: 70 },
      { name: 'Problem Solving', score: 60, target: 72 },
      { name: 'Culture Fit', score: 62, target: 80 },
      { name: 'System Design', score: 55, target: 70 },
    ],
  },
]

function getScoreColor(score: number): string {
  if (score >= 80) return '#10B981'
  if (score >= 65) return '#F59E0B'
  return '#EF4444'
}

export default function HiringAnalyticsPage() {
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('aarav-sharma')

  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: ['hiring-analytics-funnel'],
    queryFn: async () => {
      const res = await fetch('/api/hiring/analytics/funnel')
      if (!res.ok) return { funnel: null }
      return res.json()
    },
  })

  const funnel = analyticsData?.funnel
  const selectedCandidate = CANDIDATES.find(c => c.id === selectedCandidateId) || CANDIDATES[0]

  return (
    <PageWrapper style={{ maxWidth: 1280, margin: '0 auto', paddingBottom: 40 }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
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
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {/* Total Applicants */}
        <div
          className="card"
          style={{
            padding: '20px 22px',
            background: 'var(--neu-base)',
            boxShadow: 'var(--elev-1)',
            borderRadius: 18,
            border: '1px solid rgba(226, 232, 240, 0.7)',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-tertiary)' }}>Total Applicants</span>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(99, 102, 241, 0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={18} color="#6366F1" />
            </div>
          </div>
          <div style={{ fontSize: '1.9rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>
            {analyticsLoading ? '—' : funnel?.totalCandidates || 28}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 6 }}>Across all active requisitions</div>
        </div>

        {/* Successful Hires */}
        <div
          className="card"
          style={{
            padding: '20px 22px',
            background: 'var(--neu-base)',
            boxShadow: 'var(--elev-1)',
            borderRadius: 18,
            border: '1px solid rgba(226, 232, 240, 0.7)',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-tertiary)' }}>Successful Hires</span>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(16, 185, 129, 0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={18} color="#10B981" />
            </div>
          </div>
          <div style={{ fontSize: '1.9rem', fontWeight: 800, color: '#10B981', lineHeight: 1.1 }}>
            {analyticsLoading ? '—' : funnel?.totalHires || 4}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 6 }}>Completed onboarding</div>
        </div>

        {/* Overall Conversion */}
        <div
          className="card"
          style={{
            padding: '20px 22px',
            background: 'var(--neu-base)',
            boxShadow: 'var(--elev-1)',
            borderRadius: 18,
            border: '1px solid rgba(226, 232, 240, 0.7)',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-tertiary)' }}>Overall Conversion</span>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(6, 182, 212, 0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={18} color="#06B6D4" />
            </div>
          </div>
          <div style={{ fontSize: '1.9rem', fontWeight: 800, color: '#06B6D4', lineHeight: 1.1 }}>
            {analyticsLoading ? '—' : `${funnel?.overallConversionRate || 14.3}%`}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 6 }}>Sourced to Hired ratio</div>
        </div>

        {/* Avg Time to Hire */}
        <div
          className="card"
          style={{
            padding: '20px 22px',
            background: 'var(--neu-base)',
            boxShadow: 'var(--elev-1)',
            borderRadius: 18,
            border: '1px solid rgba(226, 232, 240, 0.7)',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-tertiary)' }}>Avg Time to Hire</span>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(245, 158, 11, 0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={18} color="#F59E0B" />
            </div>
          </div>
          <div style={{ fontSize: '1.9rem', fontWeight: 800, color: '#F59E0B', lineHeight: 1.1 }}>
            {analyticsLoading ? '—' : `${funnel?.timeToHireDays || 14.5} days`}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 6 }}>Median requisition cycle</div>
        </div>
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
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 10,
              flex: 1,
              marginBottom: 14,
            }}
          >
            {CANDIDATES.map(candidate => {
              const isSelected = candidate.id === selectedCandidateId
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
                    flex: '1 1 auto',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {/* Initials Avatar */}
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        background: candidate.avatarBg,
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
                    <div>
                      <div style={{ fontSize: '0.925rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {candidate.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
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
                    }}
                  >
                    {candidate.overallScore}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Bottom Footer to match right panel legend line */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: 14,
              height: 40,
              borderTop: '1px solid rgba(226, 232, 240, 0.7)',
              fontSize: '0.75rem',
              color: 'var(--text-tertiary)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Users size={14} color="#6366F1" />
              <span>5 active candidates evaluated</span>
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
          {/* Header section with Candidate info & overall score */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              paddingBottom: 18,
              borderBottom: '1px solid rgba(226, 232, 240, 0.7)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: '50%',
                  background: selectedCandidate.avatarBg,
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

              <div>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}>
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
            <div style={{ textAlign: 'right' }}>
              <div
                style={{
                  fontSize: '2.4rem',
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
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${selectedCandidate.rounds.length}, 1fr)`,
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
                      <div style={{ fontSize: '0.775rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {round.name}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: 1 }}>
                        {round.date}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {selectedCandidate.competencies.map((comp, idx) => {
                const barColor = getScoreColor(comp.score)
                const isAboveTarget = comp.score >= comp.target

                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                    }}
                  >
                    {/* Competency Name */}
                    <div
                      style={{
                        width: 125,
                        fontSize: '0.825rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        flexShrink: 0,
                      }}
                    >
                      {comp.name}
                    </div>

                    {/* Progress Track with Target Tick */}
                    <div
                      style={{
                        position: 'relative',
                        flex: 1,
                        height: 9,
                        background: 'var(--neu-bg-deep, #E2E8F0)',
                        borderRadius: 5,
                      }}
                    >
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
                    <div
                      style={{
                        width: 82,
                        textAlign: 'right',
                        fontSize: '0.825rem',
                        flexShrink: 0,
                      }}
                    >
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

          {/* Color Legend Footer — Aligned with Left Panel Footer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: 20,
              paddingTop: 14,
              height: 40,
              borderTop: '1px solid rgba(226, 232, 240, 0.7)',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              marginTop: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 11, height: 11, borderRadius: 3, background: '#10B981' }} />
              <span>80 and above</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 11, height: 11, borderRadius: 3, background: '#F59E0B' }} />
              <span>65 to 79</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 11, height: 11, borderRadius: 3, background: '#EF4444' }} />
              <span>Below 65</span>
            </div>
          </div>
        </div>
      </div>
    </PageWrapper>
  )
}
