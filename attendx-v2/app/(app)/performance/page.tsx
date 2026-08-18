'use client'

import { useQuery } from '@tanstack/react-query'
import { TrendingUp, Target, Star, ChevronRight, Clock, CheckCircle, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth.store'

export default function PerformancePage() {
  const supabase = getSupabaseBrowserClient()
  const user = useAuthStore(s => s.user)

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

  const completedGoals = goals?.filter((g: any) => g.status === 'COMPLETED').length ?? 0
  const totalGoals = goals?.length ?? 0
  const goalPct = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
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
              return (
                <div key={g.id} style={{
                  padding: 'var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--neu-bg-deep)',
                  marginBottom: 'var(--space-3)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9375rem' }}>{g.title}</div>
                    <span className={`badge ${badgeClass}`}>{g.status}</span>
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', marginBottom: 10 }}>
                    Due: {g.due_date ? format(parseISO(g.due_date), 'MMM d, yyyy') : 'No deadline'}
                  </div>
                  <div className="progress-track progress-track-sm">
                    <div className="progress-bar" style={{ width: `${pct}%` }} />
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 4 }}>
                    {pct}% complete
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
