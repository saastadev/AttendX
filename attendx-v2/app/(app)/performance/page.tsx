'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TrendingUp, Target, Star, ChevronRight, ChevronDown, Clock, CheckCircle, AlertTriangle, Info } from 'lucide-react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth.store'
import { PageWrapper } from '@/components/ui/PageWrapper'
import { AnimatedValue } from '@/components/ui/AnimatedValue'
import { EmptyState } from '@/components/ui/EmptyState'

export default function PerformancePage() {
  const supabase = getSupabaseBrowserClient()
  const user = useAuthStore(s => s.user)
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null)

  const { data: cycles, isLoading: cyclesLoading } = useQuery({
    queryKey: ['performance-cycles', user?.tenant?.id],
    queryFn: async () => {
      if (!user) return []
      const { data } = await supabase
        .from('performance_cycles')
        .select('*')
        .eq('tenant_id', user.tenant.id)
        .order('start_date', { ascending: false })
      return data ?? []
    },
    enabled: !!user,
  })

  const { data: goals, isLoading: goalsLoading } = useQuery({
    queryKey: ['my-goals', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data } = await supabase
        .from('goals')
        .select('*')
        .eq('employee_id', user.id)
        .order('created_at', { ascending: false })
      return data ?? []
    },
    enabled: !!user,
  })

  const { data: selfReviews, isLoading: reviewsLoading } = useQuery({
    queryKey: ['my-self-reviews', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data } = await supabase
        .from('self_reviews')
        .select('*, performance_cycle:performance_cycles(*)')
        .eq('employee_id', user.id)
        .order('created_at', { ascending: false })
      return data ?? []
    },
    enabled: !!user,
  })

  const { data: aiPerfData, isLoading: aiPerfLoading } = useQuery({
    queryKey: ['ai-performance-intelligence', user?.id, user?.tenant?.id],
    queryFn: async () => {
      const res = await fetch('/api/performance/intelligence')
      if (!res.ok) return null
      return res.json()
    },
    enabled: !!user,
  })

  const completedGoals = goals?.filter((g: any) => g.status === 'COMPLETED').length ?? 0
  const totalGoals = goals?.length ?? 0
  const goalPct = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0

  return (
    <PageWrapper style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Performance</h1>
          <p className="page-subtitle">Track your goals, review cycles, and performance trajectory</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid-auto" style={{ marginBottom: 'var(--space-8)' }}>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: 'var(--accent-light)' }}>
            <Target size={22} color="var(--accent)" />
          </div>
          <div className="stat-card-value">{completedGoals} / {totalGoals}</div>
          <div className="stat-card-label">Goals Completed</div>
          <div className="progress-track progress-track-sm" style={{ marginTop: 'var(--space-3)' }}>
            <div className="progress-bar" style={{ width: `${goalPct}%` }} />
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: 'var(--success-light)' }}>
            <CheckCircle size={22} color="var(--success)" />
          </div>
          <div className="stat-card-value">{selfReviews?.length ?? 0}</div>
          <div className="stat-card-label">Self-Reviews Submitted</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: 'var(--warning-light)' }}>
            <TrendingUp size={22} color="var(--warning)" />
          </div>
          <div className="stat-card-value">{cycles?.length ?? 0}</div>
          <div className="stat-card-label">Active Review Cycles</div>
        </div>
      </div>

      <div className="neu-responsive-split">
        {/* Active Cycles */}
        <div className="card">
          <h2 style={{ fontSize: '1.125rem', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={18} color="var(--accent)" /> Review Cycles
          </h2>
          {cyclesLoading ? (
            <div className="skeleton skeleton-text" style={{ width: '70%' }} />
          ) : cycles?.length === 0 ? (
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>No review cycles found</p>
          ) : (
            cycles?.map((c: any) => {
              const badgeClass = c.status === 'ACTIVE' ? 'badge-present' : c.status === 'CLOSED' ? 'badge-neutral' : 'badge-pending'
              return (
                <div key={c.id} style={{
                  padding: 'var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--neu-bg-deep)',
                  marginBottom: 'var(--space-3)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{c.name}</div>
                    <span className={`badge ${badgeClass}`}>{c.status}</span>
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span>Self-review deadline: {format(parseISO(c.self_review_deadline), 'MMM d, yyyy')}</span>
                    <span>Manager deadline: {format(parseISO(c.manager_review_deadline), 'MMM d, yyyy')}</span>
                  </div>

                  {/* Has the user submitted a self-review for this cycle? */}
                  {(() => {
                    const submitted = selfReviews?.find((sr: any) => sr.cycle_id === c.id)
                    return submitted ? (
                      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', color: 'var(--success)' }}>
                        <CheckCircle size={14} /> Self-review submitted
                      </div>
                    ) : c.status === 'ACTIVE' ? (
                      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', color: 'var(--warning)' }}>
                        <AlertTriangle size={14} /> Self-review pending
                      </div>
                    ) : null
                  })()}
                </div>
              )
            })
          )}
        </div>

        {/* Goals */}
        <div className="card">
          <h2 style={{ fontSize: '1.125rem', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Target size={18} color="var(--accent)" /> My Goals
          </h2>
          {goalsLoading ? (
            <div className="skeleton skeleton-text" style={{ width: '70%' }} />
          ) : goals?.length === 0 ? (
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>No goals set yet. Goals will appear here once your manager creates the review cycle.</p>
          ) : (
            goals?.map((g: any) => {
              const badgeClass = g.status === 'COMPLETED' ? 'badge-approved' : g.status === 'AT_RISK' ? 'badge-rejected' : 'badge-pending'
              const pct = Math.min(100, g.progress_pct ?? 0)
              const isExpanded = expandedGoalId === g.id

              return (
                <div
                  key={g.id}
                  onClick={() => setExpandedGoalId(isExpanded ? null : g.id)}
                  style={{
                    padding: 'var(--space-4)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--neu-bg-deep)',
                    marginBottom: 'var(--space-3)',
                    cursor: 'pointer',
                    border: isExpanded ? '1px solid var(--accent)' : '1px solid transparent',
                    transition: 'all 0.15s ease',
                  }}
                  className="goal-card-item"
                  title="Click to view full SMART target details"
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                      {isExpanded ? <ChevronDown size={16} color="var(--accent)" /> : <ChevronRight size={16} color="var(--text-tertiary)" />}
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9375rem' }}>{g.title}</span>
                    </div>
                    <span className={`badge ${badgeClass}`}>{g.status}</span>
                  </div>

                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', marginBottom: 10, paddingLeft: 22 }}>
                    Due: {g.due_date ? format(parseISO(g.due_date), 'MMM d, yyyy') : 'No deadline'} · Weight: {g.weight ?? 100}%
                  </div>

                  <div className="progress-track progress-track-sm" style={{ marginLeft: 22 }}>
                    <div className="progress-bar" style={{ width: `${pct}%` }} />
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 4 }}>
                    {pct}% complete
                  </div>

                  {/* Expanded SMART Goal Details (AI_PERF_TC_020) */}
                  {isExpanded && (
                    <div style={{
                      marginTop: 12,
                      paddingTop: 12,
                      borderTop: '1px solid rgba(255,255,255,0.08)',
                      paddingLeft: 22,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      fontSize: '0.8125rem',
                      color: 'var(--text-secondary)',
                    }}>
                      {g.description && (
                        <div>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Description: </span>
                          <span>{g.description}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <div>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Target Metric: </span>
                          <span>{g.target_metric || 'Completion'}</span>
                        </div>
                        <div>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Target Value: </span>
                          <span>{g.target_value ?? '100%'}</span>
                        </div>
                        <div>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Actual Value: </span>
                          <span>{g.actual_value ?? '0'}</span>
                        </div>
                      </div>
                      <div style={{
                        marginTop: 4,
                        padding: '6px 10px',
                        borderRadius: 6,
                        background: 'rgba(99,102,241,0.08)',
                        color: 'var(--text-tertiary)',
                        fontSize: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}>
                        <Info size={14} color="var(--accent)" />
                        <span>Source: Manager Quarterly Review Assignment (Direct Target)</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Continuous Performance Monitoring Dashboard (AI_PERF_TC_007 - AI_PERF_TC_011, 013, 017) */}
      <div className="card" style={{ marginTop: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h2 style={{ fontSize: '1.125rem', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={18} color="var(--accent)" /> Continuous Performance Monitoring
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
              Real-time multi-dimensional tracking across KPIs, goal delivery, productivity, and stakeholder feedback
            </p>
          </div>
          <span className="badge badge-accent">5 Dimensions Active</span>
        </div>

        {aiPerfLoading ? (
          <div className="skeleton" style={{ height: 120, borderRadius: 'var(--radius-md)' }} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)' }}>
            {(aiPerfData?.continuous_monitoring || []).map((m: any) => (
              <div
                key={m.dimension}
                id={`monitoring-${m.dimension.toLowerCase()}`}
                style={{
                  background: 'var(--neu-bg-deep)',
                  padding: 'var(--space-3) var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 4 }}>
                  {m.dimension_label}
                </div>
                <div style={{ fontSize: '1.375rem', fontWeight: 800, color: m.has_data ? 'var(--text-primary)' : 'var(--text-tertiary)', marginBottom: 2 }}>
                  {m.has_data && m.value !== null ? m.value : 'No Data'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                  {m.details}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI Goal Recommendations (AI_PERF_TC_001 - AI_PERF_TC_006, 012, 016, 020) */}
      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h2 style={{ fontSize: '1.125rem', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Star size={18} color="#F59E0B" /> AI Goal Recommendations
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
              Suggested SMART goals covering KPIs, KRAs, OKRs, Department Goals, and Individual Development Plans
            </p>
          </div>
          <span className="badge badge-neutral">5 Types Suggested</span>
        </div>

        {aiPerfLoading ? (
          <div className="skeleton skeleton-text" style={{ width: '80%' }} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {(aiPerfData?.recommendations || []).map((rec: any) => (
              <div
                key={rec.id}
                id={`ai-goal-rec-${rec.type.toLowerCase()}`}
                className="goal-card-item"
                style={{
                  background: 'var(--neu-bg-deep)',
                  padding: 'var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div>
                    <span className="badge badge-accent" style={{ fontSize: '0.7rem', marginRight: 8 }}>
                      {rec.type_label}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-primary)' }}>
                      {rec.title}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--accent)' }}>
                    Weight: {rec.weight}%
                  </span>
                </div>

                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '4px 0 8px' }}>
                  {rec.description}
                </p>

                <div style={{ display: 'flex', gap: 16, fontSize: '0.8125rem', flexWrap: 'wrap', marginBottom: 8 }}>
                  <div>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Target Metric: </span>
                    <span style={{ color: 'var(--accent)' }}>{rec.target_metric}</span>
                  </div>
                  <div>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Target Value: </span>
                    <span style={{ color: 'var(--accent)' }}>{rec.target_value}</span>
                  </div>
                </div>

                {/* Recommendation Basis (AI_PERF_TC_020) */}
                <div
                  className="rec-basis-block"
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(99,102,241,0.08)',
                    borderLeft: '3px solid var(--accent)',
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Info size={14} color="var(--accent)" style={{ flexShrink: 0 }} />
                  <div>
                    <span style={{ fontWeight: 700, color: 'var(--accent)' }}>Recommendation Basis: </span>
                    <span>{rec.basis}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageWrapper>
  )
}
