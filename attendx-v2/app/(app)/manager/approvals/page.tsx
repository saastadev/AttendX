'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { CheckCircle, XCircle, CalendarDays, Clock, AlertTriangle, Filter } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth.store'
import { useToast } from '@/components/ui/Toast'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageWrapper } from '@/components/ui/PageWrapper'
import { STAGGER_CONTAINER, STAGGER_ITEM } from '@/components/ui/MotionConfig'

type ApprovalType = 'ALL' | 'LEAVE' | 'CORRECTION'

export default function ManagerApprovalsPage() {
  const supabase = getSupabaseBrowserClient()
  const user = useAuthStore(s => s.user)
  const { success, error } = useToast()
  const qc = useQueryClient()
  const [activeType, setActiveType] = useState<ApprovalType>('ALL')

  // Fetch team employee IDs
  const { data: teamIds } = useQuery({
    queryKey: ['team-ids', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data } = await supabase.from('employees').select('id').eq('manager_id', user.id)
      return data?.map((e: any) => e.id) ?? []
    },
    enabled: !!user,
  })

  // Pending leave requests from team
  const { data: pendingLeaves, isLoading: leavesLoading } = useQuery({
    queryKey: ['manager-pending-leaves', user?.id, teamIds],
    queryFn: async () => {
      if (!teamIds?.length) return []
      const { data } = await supabase
        .from('leaves')
        .select('*, employee:profiles!employee_id(full_name, email), leave_type:leave_types(name, color)')
        .in('employee_id', teamIds)
        .eq('status', 'PENDING')
        .order('applied_at', { ascending: true })
      return data ?? []
    },
    enabled: !!teamIds,
  })

  // Pending attendance corrections from team
  const { data: pendingCorrections, isLoading: correctionsLoading } = useQuery({
    queryKey: ['manager-pending-corrections', user?.id, teamIds],
    queryFn: async () => {
      if (!teamIds?.length) return []
      const { data } = await supabase
        .from('attendance_corrections')
        .select('*, employee:profiles!employee_id(full_name)')
        .in('employee_id', teamIds)
        .eq('status', 'PENDING')
        .order('created_at', { ascending: true })
      return data ?? []
    },
    enabled: !!teamIds,
  })

  const leaveMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'APPROVED' | 'REJECTED' }) => {
      const { error: err } = await supabase.from('leaves')
        .update({ status: action, reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
        .eq('id', id)
      if (err) throw err
    },
    onSuccess: (_, { action }) => {
      qc.invalidateQueries({ queryKey: ['manager-pending-leaves'] })
      success(`Leave ${action === 'APPROVED' ? 'approved ✓' : 'rejected'}`)
    },
    onError: (err: any) => error('Action failed', err.message),
  })

  const correctionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'APPROVED' | 'REJECTED' }) => {
      const { error: err } = await supabase.from('attendance_corrections')
        .update({ status: action, reviewed_by: user?.id })
        .eq('id', id)
      if (err) throw err
    },
    onSuccess: (_, { action }) => {
      qc.invalidateQueries({ queryKey: ['manager-pending-corrections'] })
      success(`Correction ${action === 'APPROVED' ? 'approved ✓' : 'rejected'}`)
    },
    onError: (err: any) => error('Action failed', err.message),
  })

  const totalPending = (pendingLeaves?.length ?? 0) + (pendingCorrections?.length ?? 0)
  const isLoading = leavesLoading || correctionsLoading

  return (
    <PageWrapper style={{ maxWidth: 860, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Approvals</h1>
          <p className="page-subtitle">
            {totalPending > 0 ? `${totalPending} request${totalPending > 1 ? 's' : ''} awaiting your decision` : 'Queue is clear — great job!'}
          </p>
        </div>
        {totalPending > 0 && (
          <span className="badge badge-pending" style={{ fontSize: '1rem', padding: '8px 16px' }}>
            {totalPending} pending
          </span>
        )}
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
                    onClick={() => leaveMutation.mutate({ id: l.id, action: 'APPROVED' })}
                    disabled={leaveMutation.isPending}
                    className="btn btn-success btn-sm"
                    id={`btn-approve-leave-${l.id}`}
                  >
                    <CheckCircle size={16} /> Approve
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.94 }}
                    onClick={() => leaveMutation.mutate({ id: l.id, action: 'REJECTED' })}
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
    </PageWrapper>
  )
}
