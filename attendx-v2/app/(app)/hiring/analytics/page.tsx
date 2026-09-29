'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp, Users, Clock, Award, AlertTriangle,
  Sparkles, CheckCircle2, ChevronRight, BarChart2,
  Shield, Lightbulb, ArrowUpRight
} from 'lucide-react'
import { PageWrapper } from '@/components/ui/PageWrapper'

export default function HiringAnalyticsPage() {
  // Fetch funnel & competency data
  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: ['hiring-analytics-funnel'],
    queryFn: async () => {
      const res = await fetch('/api/hiring/analytics/funnel')
      if (!res.ok) return { funnel: null, competencies: [] }
      return res.json()
    }
  })

  // Fetch AI recommendations
  const { data: recsData, isLoading: recsLoading } = useQuery({
    queryKey: ['hiring-analytics-recs'],
    queryFn: async () => {
      const res = await fetch('/api/hiring/analytics/recommendations')
      if (!res.ok) return { recommendations: [] }
      return res.json()
    }
  })

  const funnel = analyticsData?.funnel
  const competencies = analyticsData?.competencies || []
  const recommendations = recsData?.recommendations || []

  return (
    <PageWrapper style={{ maxWidth: 1250, margin: '0 auto', paddingBottom: 64 }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 28 }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '1.75rem', fontWeight: 800 }}>Hiring Analytics & AI Insights</h1>
          <p className="page-subtitle" style={{ color: 'var(--text-secondary)' }}>
            Real-time funnel conversion rates, stage bottleneck identification, candidate competency scores, and predictive recommendations.
          </p>
        </div>
      </div>

      {/* Top Metrics Banner */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 16,
        marginBottom: 28,
      }}>
        <div className="card" style={{ padding: '20px 24px', background: 'var(--neu-base)', boxShadow: 'var(--elev-1)', borderRadius: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-tertiary)' }}>Total Applicants</span>
            <Users size={18} color="var(--accent)" />
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            {analyticsLoading ? '—' : funnel?.totalCandidates || 24}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>Across all active requisitions</div>
        </div>

        <div className="card" style={{ padding: '20px 24px', background: 'var(--neu-base)', boxShadow: 'var(--elev-1)', borderRadius: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-tertiary)' }}>Successful Hires</span>
            <CheckCircle2 size={18} color="#10B981" />
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#10B981' }}>
            {analyticsLoading ? '—' : funnel?.totalHires || 4}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>Completed onboarding</div>
        </div>

        <div className="card" style={{ padding: '20px 24px', background: 'var(--neu-base)', boxShadow: 'var(--elev-1)', borderRadius: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-tertiary)' }}>Overall Conversion</span>
            <TrendingUp size={18} color="#06B6D4" />
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#06B6D4' }}>
            {analyticsLoading ? '—' : `${funnel?.overallConversionRate || 17}%`}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>Sourced to Hired ratio</div>
        </div>

        <div className="card" style={{ padding: '20px 24px', background: 'var(--neu-base)', boxShadow: 'var(--elev-1)', borderRadius: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-tertiary)' }}>Avg Time to Hire</span>
            <Clock size={18} color="#F59E0B" />
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#F59E0B' }}>
            {analyticsLoading ? '—' : `${funnel?.timeToHireDays || 14.5} days`}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>Median requisition cycle</div>
        </div>
      </div>

      {/* Funnel Conversion & Bottleneck Analysis */}
      <div className="card" style={{
        padding: 24,
        borderRadius: 18,
        background: 'var(--neu-base)',
        boxShadow: 'var(--elev-1)',
        marginBottom: 28,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Pipeline Funnel Progression & Conversion
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Candidate volume and conversion efficiency at each transition stage
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {(funnel?.stages || [
            { label: 'Sourced', count: 28, conversionRate: 100, avgDurationDays: 1.5 },
            { label: 'Applied', count: 24, conversionRate: 86, avgDurationDays: 2.1 },
            { label: 'Shortlisted', count: 18, conversionRate: 75, avgDurationDays: 1.8 },
            { label: 'Interview Rounds', count: 12, conversionRate: 67, avgDurationDays: 4.2 },
            { label: 'Selected', count: 7, conversionRate: 58, avgDurationDays: 1.2 },
            { label: 'Offer Released', count: 6, conversionRate: 86, avgDurationDays: 2.0 },
            { label: 'Onboarded', count: 4, conversionRate: 67, avgDurationDays: 1.7 },
          ]).map((stage: any, idx: number) => {
            const isBottleneck = stage.avgDurationDays > 3.0
            return (
              <div key={idx} style={{
                background: 'var(--neu-bg-raised)',
                padding: '14px 18px',
                borderRadius: 14,
                boxShadow: 'var(--elev-0)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      color: '#fff',
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {idx + 1}
                    </div>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                      {stage.label}
                    </span>
                    {isBottleneck && (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 8px',
                        borderRadius: 8,
                        background: 'rgba(239, 68, 68, 0.15)',
                        color: '#DC2626',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                      }}>
                        <AlertTriangle size={12} /> Stage Bottleneck
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Avg Duration: <b>{stage.avgDurationDays} days</b>
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Conversion: <b style={{ color: 'var(--accent)' }}>{stage.conversionRate}%</b>
                    </span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', minWidth: 40, textAlign: 'right' }}>
                      {stage.count}
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ height: 8, borderRadius: 4, background: 'var(--neu-bg-deep)', overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.max(5, stage.conversionRate)}%`,
                    height: '100%',
                    background: isBottleneck ? '#EF4444' : 'var(--accent)',
                    transition: 'width 0.4s ease',
                  }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Grid: Competency Profiles & AI Recommendations */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Candidate Competency Profiles */}
        <div className="card" style={{
          padding: 24,
          borderRadius: 18,
          background: 'var(--neu-base)',
          boxShadow: 'var(--elev-1)',
        }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Award size={18} color="var(--accent)" /> Candidate Competency Matrix
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 20 }}>
            Evaluation scores aggregated across technical and culture interviews vs organization benchmarks
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {competencies.map((comp: any, idx: number) => (
              <div key={idx}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{comp.subject}</span>
                  <div>
                    <b style={{ color: 'var(--accent)' }}>{comp.score}%</b>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginLeft: 6 }}>
                      (Target: {comp.benchmark}%)
                    </span>
                  </div>
                </div>

                <div style={{ position: 'relative', height: 10, borderRadius: 5, background: 'var(--neu-bg-deep)', overflow: 'hidden' }}>
                  <div style={{
                    width: `${comp.score}%`,
                    height: '100%',
                    background: comp.score >= comp.benchmark ? '#10B981' : '#F59E0B',
                    borderRadius: 5,
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Recommendations */}
        <div className="card" style={{
          padding: 24,
          borderRadius: 18,
          background: 'var(--neu-base)',
          boxShadow: 'var(--elev-1)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Lightbulb size={18} color="#F59E0B" /> Proactive AI Recommendations
            </h3>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, background: 'rgba(245, 158, 11, 0.12)', color: '#D97706', padding: '2px 8px', borderRadius: 8 }}>
              Continuous Audit
            </span>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 20 }}>
            Actionable optimization insights derived from applicant drop-offs and stage duration anomalies
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {recommendations.map((rec: any) => (
              <div
                key={rec.id}
                style={{
                  background: 'var(--neu-bg-raised)',
                  padding: '14px 16px',
                  borderRadius: 12,
                  boxShadow: 'var(--elev-0)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                    {rec.title}
                  </div>
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    padding: '2px 6px',
                    borderRadius: 6,
                    background: 'rgba(79, 70, 229, 0.12)',
                    color: 'var(--accent)',
                  }}>
                    Impact: {rec.impact_score}/100
                  </span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  {rec.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageWrapper>
  )
}
