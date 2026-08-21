'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { CheckCircle, XCircle, CalendarDays, Clock, AlertTriangle, Filter, RefreshCcw } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth.store'
import { useToast } from '@/components/ui/Toast'
import { EmptyState } from '@/components/ui/EmptyState'
import { STAGGER_CONTAINER, STAGGER_ITEM } from '@/components/ui/MotionConfig'

type ApprovalType = 'ALL' | 'LEAVE' | 'CORRECTION'

export default function ManagerApprovalsPage() {
  const supabase = getSupabaseBrowserClient()
  const user = useAuthStore(s => s.user)
  const { success, error } = useToast()
  const qc = useQueryClient()
  const [activeType, setActiveType] = useState<ApprovalType>('ALL')

  const effectiveTenantId =
    user?.tenant?.id ||
    (user as any)?.app_metadata?.tenant_id ||
    (user as any)?.profile?.tenant_id ||
    '11111111-0000-0000-0000-000000000001'

  // Fetch pending approvals from authoritative backend API
  const { data: approvalsData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['manager-approvals', user?.id, effectiveTenantId],
    queryFn: async () => {
      // 1. Try server API with explicit Bearer token first
      try {
        const { data: sessData } = await supabase.auth.getSession()
        const headers: Record<string, string> = {}
        if (sessData?.session?.access_token) {
          headers['Authorization'] = `Bearer ${sessData.session.access_token}`
        }

        const res = await fetch('/api/manager/approvals', { headers, credentials: 'include' })
        if (res.ok) {
          const json = await res.json()
          return {
            leaves: json.leaves || [],
            corrections: json.corrections || [],
            totalPending: json.totalPending || 0,
          }
        }
      } catch (e) {
        console.warn('[Approvals] Server API fetch error, falling back to browser query:', e)
      }

      // 2. Direct browser fallback
      const { data: rawLeaves } = await supabase
        .from('leaves')
        .select('*, leave_types(name, code, color)')
        .eq('status', 'PENDING')
        .order('applied_at', { ascending: false })

      const { data: rawCorrections } = await supabase
        .from('attendance_corrections')
        .select('*')
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false })

      const allEmpIds = [
        ...new Set([
          ...(rawLeaves || []).map((l: any) => l.employee_id),
          ...(rawCorrections || []).map((c: any) => c.employee_id),
        ]),
      ]

      let profileMap = new Map<string, any>()
      if (allEmpIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', allEmpIds)
        profileMap = new Map((profiles || []).map((p: any) => [p.id, p]))
      }

      const leaves = (rawLeaves || []).map((l: any) => ({
        ...l,
        leave_type: l.leave_types || { name: 'Leave', color: '#6366f1' },
        employee: profileMap.get(l.employee_id) || { full_name: 'Employee', email: '' },
      }))

      const corrections = (rawCorrections || []).map((c: any) => ({
        ...c,
        employee: profileMap.get(c.employee_id) || { full_name: 'Employee', email: '' },
      }))

      return {
        leaves,
        corrections,
        totalPending: leaves.length + corrections.length,
      }
    },
    enabled: true,
    refetchInterval: 4000, // Live poll every 4s for new requests
  })

  const pendingLeaves = approvalsData?.leaves ?? []
  const pendingCorrections = approvalsData?.corrections ?? []
  const totalPending = approvalsData?.totalPending ?? 0

  const leaveMutation = useMutation({
    mutationFn: async ({ id, action, leave }: { id: string; action: 'APPROVED' | 'REJECTED'; leave?: any }) => {
      // 1. Try server decision API with Bearer token
      const { data: sessData } = await supabase.auth.getSession()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (sessData?.session?.access_token) {
        headers['Authorization'] = `Bearer ${sessData.session.access_token}`
      }

      const res = await fetch(`/api/manager/approvals/${id}`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ type: 'LEAVE', action }),
      })

      if (!res.ok) {
        // Direct browser fallback
        const { error: err } = await supabase.from('leaves')
          .update({ status: action, reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
          .eq('id', id)
        if (err) throw err
      }
    },
    onSuccess: (_, { action }) => {
      qc.invalidateQueries({ queryKey: ['manager-approvals'] })
      qc.invalidateQueries({ queryKey: ['leave-balances'] })
      qc.invalidateQueries({ queryKey: ['my-leaves'] })
      success(`Leave ${action === 'APPROVED' ? 'approved ✓' : 'rejected'}`)
    },
    onError: (err: any) => error('Action failed', err.message),
  })

  const correctionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'APPROVED' | 'REJECTED' }) => {
      const { data: sessData } = await supabase.auth.getSession()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (sessData?.session?.access_token) {
        headers['Authorization'] = `Bearer ${sessData.session.access_token}`
      }

      const res = await fetch(`/api/manager/approvals/${id}`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ type: 'CORRECTION', action }),
      })

      if (!res.ok) {
        const { error: err } = await supabase.from('attendance_corrections')
          .update({ status: action, reviewed_by: user?.id })
          .eq('id', id)
        if (err) throw err
      }
    },
    onSuccess: (_, { action }) => {
      qc.invalidateQueries({ queryKey: ['manager-approvals'] })
      success(`Correction ${action === 'APPROVED' ? 'approved ✓' : 'rejected'}`)
    },
    onError: (err: any) => error('Action failed', err.message),
  })

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Approvals</h1>
          <p className="page-subtitle">
            {totalPending > 0 ? `${totalPending} request${totalPending > 1 ? 's' : ''} awaiting your decision` : 'Queue is clear — great job!'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <button
            onClick={() => refetch()}
            className={`btn btn-secondary btn-sm ${isFetching ? 'btn-loading' : ''}`}
            id="btn-refresh-approvals"
            title="Refresh queue"
          >
            <RefreshCcw size={14} className={isFetching ? 'anim-spin' : ''} /> Refresh
          </button>
          {totalPending > 0 && (
            <span className="badge badge-pending" style={{ fontSize: '0.9375rem', padding: '6px 14px' }}>
              {totalPending} pending
            </span>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="tab-group" style={{ marginBottom: 'var(--space-6)' }}>
        {(['ALL', 'LEAVE', 'CORRECTION'] as const).map(t => (
          <button
            key={t}
            onClick={() => setActiveType(t)}
            className={`tab-btn ${activeType === t ? 'tab-btn-active' : ''}`}
            id={`tab-approvals-${t.toLowerCase()}`}
          >
            {t === 'ALL' ? `All (${totalPending})` : t === 'LEAVE' ? `Leave (${pendingLeaves?.length ?? 0})` : `Corrections (${pendingCorrections?.length ?? 0})`}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {[1,2,3].map(i => <div key={i} className="neu-card skeleton" style={{ height: 110 }} />)}
        </div>
      ) : totalPending === 0 ? (
        <EmptyState
          variant="team"
          title="Queue is clear!"
          body="All leave requests and attendance corrections from your team have been reviewed."
        />
      ) : (
        <motion.div
          variants={STAGGER_CONTAINER} initial="hidden" animate="visible"
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
        >
          {/* Pending Leaves */}
          {(activeType === 'ALL' || activeType === 'LEAVE') && pendingLeaves?.map((l: any) => (
            <motion.div key={l.id} variants={STAGGER_ITEM} className="neu-card" style={{ borderLeft: '3px solid var(--accent)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
                <div className="avatar avatar-md" style={{ flexShrink: 0 }}>{l.employee?.full_name?.charAt(0) ?? '?'}</div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{l.employee?.full_name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span className="badge badge-accent"><CalendarDays size={12} /> {l.leave_type?.name}</span>
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                      {l.start_date} → {l.end_date} ({l.total_days}d)
                    </span>
                  </div>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', marginBottom: 0 }} className="line-clamp-2">{l.reason}</p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>
                  <motion.button
                    whileTap={{ scale: 0.94 }}
                    onClick={() => leaveMutation.mutate({ id: l.id, action: 'APPROVED', leave: l })}
                    disabled={leaveMutation.isPending}
                    className="btn btn-success btn-sm"
                    id={`btn-approve-leave-${l.id}`}
                  >
                    <CheckCircle size={16} /> Approve
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.94 }}
                    onClick={() => leaveMutation.mutate({ id: l.id, action: 'REJECTED', leave: l })}
                    disabled={leaveMutation.isPending}
                    className="btn btn-danger btn-sm"
                    id={`btn-reject-leave-${l.id}`}
                  >
                    <XCircle size={16} /> Reject
                  </motion.button>
                </div>
              </div>
            </motion.div>
          ))}

          {/* Pending Corrections */}
          {(activeType === 'ALL' || activeType === 'CORRECTION') && pendingCorrections?.map((c: any) => (
            <motion.div key={c.id} variants={STAGGER_ITEM} className="neu-card" style={{ borderLeft: '3px solid var(--warning)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
                <div className="avatar avatar-md" style={{ flexShrink: 0 }}>{c.employee?.full_name?.charAt(0) ?? '?'}</div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{c.employee?.full_name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span className="badge badge-pending"><Clock size={12} /> Attendance Correction</span>
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                      {c.date ? format(parseISO(c.date), 'MMM d, yyyy') : '—'}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)' }} className="line-clamp-2">{c.reason}</p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>
                  <motion.button whileTap={{ scale: 0.94 }}
                    onClick={() => correctionMutation.mutate({ id: c.id, action: 'APPROVED' })}
                    disabled={correctionMutation.isPending}
                    className="btn btn-success btn-sm" id={`btn-approve-corr-${c.id}`}>
                    <CheckCircle size={16} /> Approve
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.94 }}
                    onClick={() => correctionMutation.mutate({ id: c.id, action: 'REJECTED' })}
                    disabled={correctionMutation.isPending}
                    className="btn btn-danger btn-sm" id={`btn-reject-corr-${c.id}`}>
                    <XCircle size={16} /> Reject
                  </motion.button>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  )
}
