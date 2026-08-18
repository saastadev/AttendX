'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { CalendarDays, Plus, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth.store'
import type { Leave, LeaveBalance, LeaveType } from '@/types/database'

export default function LeavePage() {
  const supabase = getSupabaseBrowserClient()
  const user = useAuthStore(s => s.user)

  // Fetch Leave Balances
  const { data: balances, isLoading: balancesLoading } = useQuery<LeaveBalance[]>({
    queryKey: ['leave-balances', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data } = await supabase
        .from('leave_balances')
        .select('*, leave_type:leave_types(*)')
        .eq('employee_id', user.id)
        .eq('year', new Date().getFullYear())
      return data ?? []
    },
    enabled: !!user,
  })

  // Fetch Leave History
  const { data: leaves, isLoading: leavesLoading } = useQuery<Leave[]>({
    queryKey: ['my-leaves', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data } = await supabase
        .from('leaves')
        .select('*, leave_type:leave_types(*)')
        .eq('employee_id', user.id)
        .order('created_at', { ascending: false })
      return data ?? []
    },
    enabled: !!user,
  })

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Leave Management</h1>
          <p className="page-subtitle">Track your leave entitlements and submit leave requests</p>
        </div>

        <Link href="/leave/apply" className="btn btn-primary" id="btn-apply-leave">
          <Plus size={18} /> Apply for Leave
        </Link>
      </div>

      {/* Leave Balances Grid */}
      <h2 style={{ fontSize: '1.25rem', marginBottom: 'var(--space-4)' }}>Leave Entitlements ({new Date().getFullYear()})</h2>

      <div className="grid-auto" style={{ marginBottom: 'var(--space-8)' }}>
        {balancesLoading ? (
          <div className="card"><div className="skeleton skeleton-text" style={{ width: '60%' }} /></div>
        ) : balances?.length === 0 ? (
          <div className="card" style={{ gridColumn: '1 / -1', color: 'var(--text-tertiary)' }}>
            No leave balances assigned for this year
          </div>
        ) : (
          balances?.map(b => {
            const lt = (b as any).leave_type as LeaveType
            const available = b.entitled_days - b.used_days - (b.pending_days ?? 0)
            const usedPct = b.entitled_days > 0 ? Math.round((b.used_days / b.entitled_days) * 100) : 0

            return (
              <div key={b.id} className="card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem' }}>
                    {lt?.name ?? 'Leave'}
                  </div>
                  <span className="badge badge-accent">{lt?.code ?? 'LV'}</span>
                </div>

                <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
                  {available} <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-tertiary)' }}>/ {b.entitled_days} days left</span>
                </div>

                <div className="progress-track progress-track-sm" style={{ marginTop: 'var(--space-3)' }}>
                  <div
                    className="progress-bar"
                    style={{
                      width: `${usedPct}%`,
                      background: lt?.color ? `linear-gradient(90deg, ${lt.color}, ${lt.color}dd)` : undefined,
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 8 }}>
                  <span>Used: {b.used_days} days</span>
                  <span>Pending: {b.pending_days ?? 0} days</span>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Leave Application History */}
      <h2 style={{ fontSize: '1.25rem', marginBottom: 'var(--space-4)' }}>Leave Application History</h2>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Dates</th>
                <th>Days</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Applied On</th>
              </tr>
            </thead>
            <tbody>
              {leavesLoading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
                    <div className="skeleton skeleton-text" style={{ width: '40%', margin: '0 auto' }} />
                  </td>
                </tr>
              ) : leaves?.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-tertiary)' }}>
                    No leave requests submitted yet
                  </td>
                </tr>
              ) : (
                leaves?.map(l => {
                  const lt = (l as any).leave_type as LeaveType
                  const badgeClass =
                    l.status === 'APPROVED' ? 'badge-approved' :
                    l.status === 'REJECTED' ? 'badge-rejected' :
                    l.status === 'PENDING'  ? 'badge-pending' : 'badge-neutral'

                  return (
                    <tr key={l.id}>
                      <td>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {lt?.name ?? 'Leave'}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                        {l.start_date} → {l.end_date}
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        {l.total_days} {l.total_days === 1 ? 'day' : 'days'}
                      </td>
                      <td style={{ maxWidth: 240 }} className="truncate" title={l.reason}>
                        {l.reason}
                      </td>
                      <td>
                        <span className={`badge ${badgeClass}`}>
                          {l.status}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
                        {new Date(l.applied_at || l.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
