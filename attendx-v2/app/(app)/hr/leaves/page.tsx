'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle, XCircle, Clock, Search, Filter, CalendarDays,
  AlertTriangle, ShieldCheck, Info, Layers, UserCheck
} from 'lucide-react'
import { format, parseISO, isWithinInterval, areIntervalsOverlapping } from 'date-fns'
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
  const [activeTab, setActiveTab] = useState<'requests' | 'quotas'>('requests')

  const effectiveTenantId =
    user?.tenant?.id ||
    (user as any)?.app_metadata?.tenant_id ||
    (user as any)?.profile?.tenant_id ||
    '11111111-0000-0000-0000-000000000001'

  // 1. Fetch Leave Requests
  const { data: leaves, isLoading } = useQuery({
    queryKey: ['hr-leaves', effectiveTenantId, statusFilter],
    queryFn: async () => {
      let q = supabase
        .from('leaves')
        .select('*, leave_type:leave_types(name, code, color)')
        .eq('tenant_id', effectiveTenantId)
        .order('applied_at', { ascending: false })

      if (statusFilter !== 'ALL') q = q.eq('status', statusFilter)
      const { data: rawLeaves } = await q
      if (!rawLeaves || rawLeaves.length === 0) return []

      const empIds = [...new Set(rawLeaves.map((l: any) => l.employee_id))]
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', empIds)

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]))

      return rawLeaves.map((l: any) => ({
        ...l,
        employee: profileMap.get(l.employee_id) || { full_name: 'Employee', email: '' },
      }))
    },
  })

  // 2. Fetch Leave Policy Quotas
  const { data: leaveTypes } = useQuery({
    queryKey: ['hr-leave-types', effectiveTenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('leave_types')
        .select('*')
        .eq('tenant_id', effectiveTenantId)
        .order('name')
      return data || []
    },
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

  // 3. Overlapping Leave Conflict Detection
  const pendingOrApprovedLeaves = (leaves || []).filter((l: any) => l.status === 'PENDING' || l.status === 'APPROVED')
  const overlappingWarnings: Array<{ employeeA: string; employeeB: string; start: string; end: string }> = []

  for (let i = 0; i < pendingOrApprovedLeaves.length; i++) {
    for (let j = i + 1; j < pendingOrApprovedLeaves.length; j++) {
      const l1 = pendingOrApprovedLeaves[i]
      const l2 = pendingOrApprovedLeaves[j]
      if (l1.employee_id !== l2.employee_id && l1.start_date && l1.end_date && l2.start_date && l2.end_date) {
        try {
          const overlap = areIntervalsOverlapping(
            { start: parseISO(l1.start_date), end: parseISO(l1.end_date) },
            { start: parseISO(l2.start_date), end: parseISO(l2.end_date) },
            { inclusive: true }
          )
          if (overlap) {
            overlappingWarnings.push({
              employeeA: l1.employee?.full_name || 'Team Member 1',
              employeeB: l2.employee?.full_name || 'Team Member 2',
              start: l1.start_date > l2.start_date ? l1.start_date : l2.start_date,
              end: l1.end_date < l2.end_date ? l1.end_date : l2.end_date,
            })
          }
        } catch (dateErr) {
          console.warn('[HR Leaves] Overlap calculation warning:', dateErr)
        }
      }
    }
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 className="page-title">Company-wide Leave Management</h1>
          <p className="page-subtitle">Department leave calendars, policy quotas, and overlapping coverage intelligence.</p>
        </div>
        {pendingCount > 0 && (
          <span className="badge badge-pending" style={{ fontSize: '0.9375rem', padding: '6px 14px' }}>
            {pendingCount} pending review
          </span>
        )}
      </div>

      {/* Overlapping Leave Warning Alert (if any) */}
      {overlappingWarnings.length > 0 && (
        <div
          className="neu-card"
          style={{
            borderLeft: '4px solid #F59E0B',
            background: 'rgba(245, 158, 11, 0.08)',
            marginBottom: 'var(--space-6)',
            padding: '16px 20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <AlertTriangle size={18} color="#F59E0B" />
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Overlapping Leave Alert Detected ({overlappingWarnings.length})
            </h3>
          </div>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
            Multiple team members have concurrent time-off scheduled in the same period. Review coverage before approving:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {overlappingWarnings.slice(0, 3).map((w, idx) => (
              <div key={idx} style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                • <strong>{w.employeeA}</strong> and <strong>{w.employeeB}</strong> overlap between <strong>{w.start}</strong> and <strong>{w.end}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Cards: Leave Policy Quotas Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        {leaveTypes?.map(lt => (
          <div key={lt.id} className="neu-card" style={{ padding: '16px 18px', borderTop: `3px solid ${lt.color || 'var(--accent)'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                {lt.code}
              </span>
              <span className="badge" style={{ background: `${lt.color || '#6366f1'}22`, color: lt.color || '#6366f1', fontSize: '0.75rem' }}>
                {lt.is_paid ? 'Paid' : 'Unpaid'}
              </span>
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {lt.days_per_year} <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)' }}>days/yr</span>
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              {lt.name}
            </div>
          </div>
        ))}
      </div>

      {/* Filters Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)', flexWrap: 'wrap' }}>
        <div className="tab-group">
          {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`tab-btn ${statusFilter === f ? 'tab-btn-active' : ''}`}
              id={`tab-hr-leaves-${f.toLowerCase()}`}
            >
              {f === 'ALL' ? 'All Requests' : f.charAt(0) + f.slice(1).toLowerCase()}
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
      <div className="neu-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', fontSize: '0.875rem' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Employee</th>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Leave Type</th>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Dates & Duration</th>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Reason</th>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Status</th>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
                    <div className="skeleton skeleton-text" style={{ width: '50%', margin: '0 auto' }} />
                  </td>
                </tr>
              ) : filtered?.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                    No leave requests found
                  </td>
                </tr>
              ) : (
                filtered?.map((l: any) => (
                  <tr key={l.id} style={{ borderBottom: '1px solid rgba(128,128,180,0.06)' }}>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="avatar avatar-sm">{l.employee?.full_name?.charAt(0) ?? '?'}</div>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{l.employee?.full_name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{l.employee?.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span className="badge" style={{
                        background: l.leave_type?.color ? `${l.leave_type.color}22` : undefined,
                        color: l.leave_type?.color ?? 'var(--text-primary)',
                        borderColor: l.leave_type?.color ?? 'var(--neu-border)',
                      }}>
                        {l.leave_type?.name ?? 'Leave'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                      <div>{l.start_date} → {l.end_date}</div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent)' }}>{l.total_days} day(s)</span>
                    </td>
                    <td style={{ padding: '14px 16px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: '0.875rem' }} title={l.reason}>
                      {l.reason}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span className={`badge ${
                        l.status === 'APPROVED' ? 'badge-approved' :
                        l.status === 'REJECTED' ? 'badge-rejected' : 'badge-pending'
                      }`}>
                        {l.status}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {l.status === 'PENDING' ? (
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
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Reviewed</span>
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
