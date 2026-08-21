'use client'

import { useQuery } from '@tanstack/react-query'
import { Users, Clock, CheckCircle, AlertTriangle, TrendingDown } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth.store'
import { PageWrapper } from '@/components/ui/PageWrapper'
import { AnimatedValue } from '@/components/ui/AnimatedValue'
import { EmptyState } from '@/components/ui/EmptyState'

export default function ManagerTeamPage() {
  const supabase = getSupabaseBrowserClient()
  const user = useAuthStore(s => s.user)

  // Fetch direct reports (employees where manager_id = current user)
  const { data: teamMembers, isLoading } = useQuery({
    queryKey: ['manager-team', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data } = await supabase
        .from('employees')
        .select(`
          *,
          profile:profiles(full_name, email, is_active),
          todayAttendance:attendance_records(status, clock_in_at, work_minutes)
        `)
        .eq('tenant_id', user.tenant.id)
        .eq('manager_id', user.id)
      return data ?? []
    },
    enabled: !!user,
  })

  // Fetch pending leaves from team
  const { data: pendingLeaves, isLoading: leavesLoading } = useQuery({
    queryKey: ['manager-pending-leaves', user?.id],
    queryFn: async () => {
      if (!user) return []
      // Get all employee IDs managed by this user
      const { data: myTeamIds } = await supabase
        .from('employees')
        .select('id')
        .eq('tenant_id', user.tenant.id)
        .eq('manager_id', user.id)

      const ids = myTeamIds?.map((e: any) => e.id) ?? []
      if (ids.length === 0) return []

      const { data } = await supabase
        .from('leaves')
        .select('*, employee:profiles!employee_id(full_name), leave_type:leave_types(name, color)')
        .in('employee_id', ids)
        .eq('status', 'PENDING')
        .order('applied_at', { ascending: false })
      return data ?? []
    },
    enabled: !!user,
  })

  const presentToday = teamMembers?.filter((m: any) =>
    m.todayAttendance?.some((a: any) =>
      a.clock_in_at && new Date(a.clock_in_at).toDateString() === new Date().toDateString()
    )
  ).length ?? 0

  return (
    <PageWrapper style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">My Team</h1>
          <p className="page-subtitle">Monitor your direct reports' attendance, performance, and pending requests</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid-auto" style={{ marginBottom: 'var(--space-8)' }}>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: 'var(--accent-light)' }}>
            <Users size={22} color="var(--accent)" />
          </div>
          <div className="stat-card-value">{teamMembers?.length ?? 0}</div>
          <div className="stat-card-label">Direct Reports</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: 'var(--success-light)' }}>
            <CheckCircle size={22} color="var(--success)" />
          </div>
          <div className="stat-card-value">{presentToday}</div>
          <div className="stat-card-label">Present Today</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: 'var(--warning-light)' }}>
            <AlertTriangle size={22} color="var(--warning)" />
          </div>
          <div className="stat-card-value">{pendingLeaves?.length ?? 0}</div>
          <div className="stat-card-label">Pending Leave Requests</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 'var(--space-6)' }}>
        {/* Team Members */}
        <div>
          <h2 style={{ fontSize: '1.125rem', marginBottom: 'var(--space-4)' }}>Team Members</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {isLoading ? (
              [1, 2, 3].map(i => <div key={i} className="card skeleton" style={{ height: 76 }} />)
            ) : teamMembers?.length === 0 ? (
              <div className="empty-state">
                <Users size={48} color="var(--text-tertiary)" />
                <h3>No direct reports yet</h3>
                <p>Employees assigned to you as manager will appear here</p>
              </div>
            ) : (
              teamMembers?.map((m: any) => {
                const todayIn = m.todayAttendance?.find((a: any) =>
                  a.clock_in_at && new Date(a.clock_in_at).toDateString() === new Date().toDateString()
                )
                return (
                  <div key={m.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                    <div className="avatar avatar-md">{m.profile?.full_name?.charAt(0) ?? '?'}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{m.profile?.full_name}</div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>{m.profile?.email} · {m.employee_code}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {todayIn ? (
                        <>
                          <span className="badge badge-present">Present</span>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 4 }}>
                            In at {format(parseISO(todayIn.clock_in_at), 'h:mm a')}
                          </div>
                        </>
                      ) : (
                        <span className="badge badge-absent">Not Clocked In</span>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Pending Leaves */}
        <div>
          <h2 style={{ fontSize: '1.125rem', marginBottom: 'var(--space-4)' }}>Pending Leave Requests</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {leavesLoading ? (
              [1, 2].map(i => <div key={i} className="card skeleton" style={{ height: 88 }} />)
            ) : pendingLeaves?.length === 0 ? (
              <div className="card" style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: 'var(--space-6)' }}>
                <CheckCircle size={32} color="var(--success)" style={{ margin: '0 auto 8px' }} />
                <div>No pending leave requests</div>
              </div>
            ) : (
              pendingLeaves?.map((l: any) => (
                <div key={l.id} className="card" style={{ borderLeft: '3px solid var(--warning)' }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{l.employee?.full_name}</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
                    {l.leave_type?.name} · {l.start_date} → {l.end_date} ({l.total_days}d)
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', marginBottom: 10 }} className="truncate">{l.reason}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    Applied: {format(parseISO(l.applied_at || l.created_at), 'MMM d, yyyy')}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </PageWrapper>
  )
}
