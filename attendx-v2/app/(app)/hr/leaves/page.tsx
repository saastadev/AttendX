'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, XCircle, Clock, Search, Filter, CalendarDays } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth.store'
import { useToast } from '@/components/ui/Toast'

type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export default function HRLeavesPage() {
  const supabase = getSupabaseBrowserClient()
  const user = useAuthStore(s => s.user)
  const { success, error } = useToast()
  const qc = useQueryClient()

  const [statusFilter, setStatusFilter] = useState<LeaveStatus | 'ALL'>('PENDING')
  const [search, setSearch] = useState('')

  const { data: leaves, isLoading } = useQuery({
    queryKey: ['hr-leaves', user?.tenant?.id, statusFilter],
    queryFn: async () => {
      if (!user) return []
      let q = supabase
        .from('leaves')
        .select(`
          *,
          employee:profiles!employee_id(full_name, email),
          leave_type:leave_types(name, code, color)
        `)
        .eq('tenant_id', user.tenant.id)
        .order('applied_at', { ascending: false })
      if (statusFilter !== 'ALL') q = q.eq('status', statusFilter)
      const { data } = await q
      return data ?? []
    },
    enabled: !!user,
  })

  const approveMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'APPROVED' | 'REJECTED' }) => {
      const { error: err } = await supabase
        .from('leaves')
        .update({ status: action, reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
        .eq('id', id)
      if (err) throw err
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['hr-leaves'] })
      success(`Leave ${vars.action === 'APPROVED' ? 'approved' : 'rejected'} successfully`)
    },
    onError: (err: any) => error('Action failed', err.message),
  })

  const filtered = leaves?.filter((l: any) =>
    !search || l.employee?.full_name?.toLowerCase().includes(search.toLowerCase())
  )

  const pendingCount = leaves?.filter((l: any) => l.status === 'PENDING').length ?? 0

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Leave Management</h1>
          <p className="page-subtitle">Review and approve employee leave requests across the organization</p>
        </div>
        {pendingCount > 0 && (
          <span className="badge badge-pending" style={{ fontSize: '1rem', padding: '0.5rem 1rem' }}>
            {pendingCount} pending
          </span>
        )}
      </div>

      {/* Filters Row */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-6)', flexWrap: 'wrap' }}>
        <div className="tab-group">
          {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`tab-btn ${statusFilter === f ? 'tab-btn-active' : ''}`}
              id={`tab-hr-leaves-${f.toLowerCase()}`}
            >
              {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <div className="input-wrap" style={{ flex: 1, maxWidth: 280 }}>
          <Search size={16} className="input-icon" />
          <input
            type="text"
            className="input has-icon-left input-sm"
            placeholder="Search employee…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Leave Type</th>
                <th>Dates</th>
                <th>Days</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
                    <div className="skeleton skeleton-text" style={{ width: '50%', margin: '0 auto' }} />
                  </td>
                </tr>
              ) : filtered?.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                    No leave requests found
                  </td>
                </tr>
              ) : (
                filtered?.map((l: any) => (
                  <tr key={l.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="avatar avatar-sm">{l.employee?.full_name?.charAt(0) ?? '?'}</div>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{l.employee?.full_name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{l.employee?.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge" style={{
                        background: l.leave_type?.color ? `${l.leave_type.color}22` : undefined,
                        color: l.leave_type?.color ?? 'var(--text-primary)',
                        borderColor: l.leave_type?.color ?? 'var(--neu-border)',
                      }}>
                        {l.leave_type?.name ?? 'Leave'} ({l.leave_type?.code})
                      </span>
                    </td>
                    <td style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                      {l.start_date} → {l.end_date}
                    </td>
                    <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                      {l.total_days}d
                    </td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: '0.875rem' }} title={l.reason}>
                      {l.reason}
                    </td>
                    <td>
                      <span className={`badge ${
                        l.status === 'APPROVED' ? 'badge-approved' :
                        l.status === 'REJECTED' ? 'badge-rejected' : 'badge-pending'
                      }`}>
                        {l.status}
                      </span>
                    </td>
                    <td>
                      {l.status === 'PENDING' && (
                        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                          <button
                            onClick={() => approveMutation.mutate({ id: l.id, action: 'APPROVED' })}
                            disabled={approveMutation.isPending}
                            className="btn btn-success btn-xs btn-icon"
                            title="Approve"
                            id={`btn-approve-${l.id}`}
                          >
                            <CheckCircle size={16} />
                          </button>
                          <button
                            onClick={() => approveMutation.mutate({ id: l.id, action: 'REJECTED' })}
                            disabled={approveMutation.isPending}
                            className="btn btn-danger btn-xs btn-icon"
                            title="Reject"
                            id={`btn-reject-${l.id}`}
                          >
                            <XCircle size={16} />
                          </button>
                        </div>
                      )}
                      {l.status !== 'PENDING' && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
