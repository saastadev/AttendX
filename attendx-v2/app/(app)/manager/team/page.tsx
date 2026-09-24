'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import {
  Users,
  Clock,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  UserX,
  Search,
  Building2,
  Navigation,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useAuthStore } from '@/store/auth.store'
import { PageWrapper } from '@/components/ui/PageWrapper'
import { ManagerRouteMapModal } from '@/components/location/ManagerRouteMapModal'

export default function ManagerTeamPage() {
  const user = useAuthStore(s => s.user)
  const role = user?.role || 'EMPLOYEE'
  const isPrivilegedRole = ['ADMIN', 'SUPERADMIN', 'HR'].includes(role)

  const [scopeFilter, setScopeFilter] = useState<'all' | 'direct'>(isPrivilegedRole ? 'all' : 'direct')
  const [selectedEmployeeForRoute, setSelectedEmployeeForRoute] = useState<{ id: string; name: string } | null>(null)
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PRESENT' | 'NOT_CLOCKED_IN'>('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // Fetch authoritative manager team dataset (team roster, today's attendance, user presence, pending leaves)
  const { data: teamData, isLoading } = useQuery({
    queryKey: ['manager-team-data', user?.id, user?.tenant?.id || (user as any)?.tenant_id, scopeFilter],
    queryFn: async () => {
      const res = await fetch(`/api/manager/team?scope=${scopeFilter}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to load team data')
      }
      return res.json()
    },
    enabled: !!user,
    refetchInterval: 15 * 1000,
  })

  const teamMembers = teamData?.teamMembers || []
  const myAttendance = teamData?.myAttendance || null
  const pendingLeaves = teamData?.pendingLeaves || []
  const metrics = teamData?.metrics || {
    totalMembers: 0,
    directReports: 0,
    teamPresent: 0,
    presentToday: 0,
    notClockedIn: 0,
    isUserPresent: false,
    totalPresent: 0,
    pendingLeaves: 0,
  }

  const isUserPresent = metrics.isUserPresent || !!(myAttendance?.isClockedIn)
  const totalPresent = metrics.totalPresent ?? metrics.presentToday ?? 0
  const totalMembersCount = metrics.totalMembers ?? teamMembers.length
  const notClockedInCount = metrics.notClockedIn ?? Math.max(0, totalMembersCount - totalPresent)

  // Filter team members according to status & search query
  const filteredMembers = teamMembers.filter((m: any) => {
    // Status filter
    if (statusFilter === 'PRESENT' && !m.is_present_today) return false
    if (statusFilter === 'NOT_CLOCKED_IN' && m.is_present_today) return false

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      const name = m.profile?.full_name?.toLowerCase() || ''
      const email = m.profile?.email?.toLowerCase() || ''
      const code = m.employee_code?.toLowerCase() || ''
      const dept = m.department_name?.toLowerCase() || ''
      return name.includes(q) || email.includes(q) || code.includes(q) || dept.includes(q)
    }

    return true
  })

  return (
    <PageWrapper style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">My Team</h1>
          <p className="page-subtitle">Monitor team members' real-time attendance, punches, and pending requests</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          <Link href="/attendance/checkin" className="btn btn-secondary">
            <Clock size={18} /> Clock In / Out
          </Link>
        </div>
      </div>

      {/* Personal Attendance Status Banner */}
      {isUserPresent ? (
        <div
          className="card"
          style={{
            marginBottom: 'var(--space-6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.09), rgba(108, 99, 255, 0.05))',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            padding: 'var(--space-4) var(--space-5)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <div
              style={{
                width: 40, height: 40, borderRadius: '50%',
                background: 'var(--success-light)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--success)', flexShrink: 0,
              }}
            >
              <CheckCircle size={22} />
            </div>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9375rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                You are Clocked In Today
                <span className="badge badge-present">Active Present</span>
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                {myAttendance?.clockInAt
                  ? `Clocked in at ${format(parseISO(myAttendance.clockInAt), 'h:mm a')}`
                  : 'Clocked in today'}
                {myAttendance?.method ? ` via ${myAttendance.method.replace('_', ' ')}` : ''}
                {myAttendance?.clockOutAt ? ` · Clocked out at ${format(parseISO(myAttendance.clockOutAt), 'h:mm a')}` : ' · Shift in Progress'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
              Listed in Team Roster & counted in Present Today
            </span>
          </div>
        </div>
      ) : (
        <div
          className="card"
          style={{
            marginBottom: 'var(--space-6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
            background: 'var(--neu-bg-deep)',
            border: '1px solid rgba(128, 128, 180, 0.15)',
            padding: 'var(--space-3) var(--space-4)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Clock size={20} color="var(--text-tertiary)" />
            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              You have not clocked in yet today.
            </div>
          </div>
          <Link href="/attendance/checkin" className="btn btn-sm btn-primary">
            Clock In Now <ArrowRight size={14} />
          </Link>
        </div>
      )}

      {/* Stats - 4 clear cards for Total, Present, Not Clocked In, and Pending Leaves */}
      <div className="grid-auto" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: 'var(--accent-light)' }}>
            <Users size={22} color="var(--accent)" />
          </div>
          <div className="stat-card-value">{totalMembersCount}</div>
          <div className="stat-card-label">
            {scopeFilter === 'all' ? 'Total Team Members' : 'Direct Reports & Self'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: 'var(--success-light)' }}>
            <CheckCircle size={22} color="var(--success)" />
          </div>
          <div className="stat-card-value">{totalPresent}</div>
          <div className="stat-card-label">
            Present Today
            {isUserPresent && (
              <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-tertiary)' }}>
                Includes You
              </span>
            )}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: 'rgba(239, 68, 68, 0.12)' }}>
            <UserX size={22} color="var(--error, #ef4444)" />
          </div>
          <div className="stat-card-value">{notClockedInCount}</div>
          <div className="stat-card-label">Not Clocked In</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: 'var(--warning-light)' }}>
            <AlertTriangle size={22} color="var(--warning)" />
          </div>
          <div className="stat-card-value">{pendingLeaves?.length ?? 0}</div>
          <div className="stat-card-label">Pending Leaves</div>
        </div>
      </div>

      {/* Main Content Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 'var(--space-6)' }}>
        {/* Team Members List */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0 }}>Team Members</h2>

            {/* Scope Toggle for Admins/HR */}
            {isPrivilegedRole && (
              <div style={{ display: 'flex', gap: 6, background: 'var(--neu-bg-deep)', padding: 4, borderRadius: 'var(--radius-md)' }}>
                <button
                  type="button"
                  onClick={() => setScopeFilter('all')}
                  className={`btn btn-xs ${scopeFilter === 'all' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                >
                  <Building2 size={13} /> Entire Team ({metrics.totalMembers ?? teamMembers.length})
                </button>
                <button
                  type="button"
                  onClick={() => setScopeFilter('direct')}
                  className={`btn btn-xs ${scopeFilter === 'direct' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                >
                  <Users size={13} /> Direct Reports ({metrics.directReports ?? 0})
                </button>
              </div>
            )}
          </div>

          {/* Search and Status Filters */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
                <Search size={16} color="var(--text-tertiary)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Search by name, code, email, or dept..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="input"
                  style={{ width: '100%', paddingLeft: 36, height: 38, fontSize: '0.875rem' }}
                />
              </div>

              {/* Status Filter Chips */}
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setStatusFilter('ALL')}
                  className={`btn btn-sm ${statusFilter === 'ALL' ? 'btn-secondary' : 'btn-ghost'}`}
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: statusFilter === 'ALL' ? 700 : 500,
                    borderRadius: '9999px',
                    padding: '6px 14px',
                  }}
                >
                  All ({teamMembers.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('PRESENT')}
                  className={`btn btn-sm ${statusFilter === 'PRESENT' ? 'btn-secondary' : 'btn-ghost'}`}
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: statusFilter === 'PRESENT' ? 700 : 500,
                    borderRadius: '9999px',
                    padding: '6px 14px',
                    color: statusFilter === 'PRESENT' ? 'var(--success)' : 'inherit',
                  }}
                >
                  Present ({totalPresent})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('NOT_CLOCKED_IN')}
                  className={`btn btn-sm ${statusFilter === 'NOT_CLOCKED_IN' ? 'btn-secondary' : 'btn-ghost'}`}
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: statusFilter === 'NOT_CLOCKED_IN' ? 700 : 500,
                    borderRadius: '9999px',
                    padding: '6px 14px',
                    color: statusFilter === 'NOT_CLOCKED_IN' ? 'var(--error, #ef4444)' : 'inherit',
                  }}
                >
                  Not Clocked In ({notClockedInCount})
                </button>
              </div>
            </div>
          </div>

          {/* Members List Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {isLoading ? (
              [1, 2, 3].map(i => <div key={i} className="card skeleton" style={{ height: 76 }} />)
            ) : filteredMembers.length === 0 ? (
              <div className="card" style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                <Users size={40} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--text-primary)', marginBottom: 4 }}>
                  No members match current filter
                </div>
                <div style={{ fontSize: '0.8125rem' }}>
                  {searchQuery ? 'Try clearing your search query' : 'No attendance entries found for this category'}
                </div>
              </div>
            ) : (
              filteredMembers.map((m: any) => {
                const todayIn = m.todayAttendance?.[0] || null
                return (
                  <div
                    key={m.id}
                    className="card"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-4)',
                      borderLeft: m.is_self
                        ? '3px solid var(--accent)'
                        : m.is_present_today
                        ? '3px solid var(--success)'
                        : '3px solid rgba(128, 128, 180, 0.2)',
                    }}
                  >
                    {m.profile?.avatar_url ? (
                      <img
                        src={m.profile.avatar_url}
                        alt={m.profile?.full_name || 'Member'}
                        className="avatar avatar-md"
                        style={{ objectFit: 'cover' }}
                      />
                    ) : (
                      <div className="avatar avatar-md">
                        {m.profile?.full_name?.charAt(0) ?? '?'}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span>{m.profile?.full_name}</span>
                        {m.is_self && (
                          <span
                            className="badge badge-accent"
                            style={{
                              fontSize: '0.6875rem',
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              fontWeight: 600,
                            }}
                          >
                            You
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', marginTop: 2 }} className="truncate">
                        {m.profile?.email} · {m.employee_code} · {m.department_name}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {m.is_present_today && todayIn?.clock_in_at ? (
                        <>
                          <span className="badge badge-present">Present</span>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 4 }}>
                            In at {format(parseISO(todayIn.clock_in_at), 'h:mm a')}
                            {todayIn.clock_out_at ? ` · Out at ${format(parseISO(todayIn.clock_out_at), 'h:mm a')}` : ' · Active'}
                          </div>
                        </>
                      ) : (
                        <>
                          <span className="badge badge-absent">Not Clocked In</span>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 4 }}>
                            No check-in today
                          </div>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedEmployeeForRoute({ id: m.id, name: m.profile?.full_name || 'Employee' })}
                        className="btn btn-ghost btn-xs"
                        style={{ fontSize: '0.75rem', marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        title="View GPS Route Telemetry"
                      >
                        <Navigation size={12} /> View Route
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Pending Leaves Panel */}
        <div>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: 'var(--space-4)' }}>Pending Leave Requests</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {isLoading ? (
              [1, 2].map(i => <div key={i} className="card skeleton" style={{ height: 88 }} />)
            ) : pendingLeaves?.length === 0 ? (
              <div className="card" style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: 'var(--space-6)' }}>
                <CheckCircle size={32} color="var(--success)" style={{ margin: '0 auto 8px' }} />
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>No pending leave requests</div>
                <div style={{ fontSize: '0.8125rem', marginTop: 4 }}>All team leave requests are up to date</div>
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

      <ManagerRouteMapModal
        employeeId={selectedEmployeeForRoute?.id || null}
        employeeName={selectedEmployeeForRoute?.name || ''}
        isOpen={!!selectedEmployeeForRoute}
        onClose={() => setSelectedEmployeeForRoute(null)}
      />
    </PageWrapper>
  )
}
