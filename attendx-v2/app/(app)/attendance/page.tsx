'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import {
  Clock, Calendar, CheckCircle, AlertTriangle, MapPin, Camera,
  Users, UserCheck, UserX, Search, Filter, RefreshCw, Eye, Sparkles
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth.store'
import type { AttendanceRecord } from '@/types/database'

export default function AttendanceHistoryPage() {
  const supabase = getSupabaseBrowserClient()
  const user = useAuthStore(s => s.user)
  const isPrivileged = ['SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'].includes(user?.role ?? 'EMPLOYEE')

  // Tab: 'workforce' (company-wide live board) vs 'my-log' (personal records)
  const [activeTab, setActiveTab] = useState<'workforce' | 'my-log'>(isPrivileged ? 'workforce' : 'my-log')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PRESENT' | 'COMPLETED' | 'ON_LEAVE' | 'ABSENT'>('ALL')
  const [selectedSelfie, setSelectedSelfie] = useState<{ url: string; name: string; time: string } | null>(null)

  // 1. Live Workforce Attendance Query (for Admin / HR / Manager)
  const { data: workforceData, isLoading: workforceLoading, refetch: refetchWorkforce, isFetching } = useQuery({
    queryKey: ['admin-live-attendance', user?.tenant?.id],
    queryFn: async () => {
      const res = await fetch('/api/admin/attendance')
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    enabled: isPrivileged,
    refetchInterval: 15 * 1000, // Live poll every 15s
  })

  // 2. Personal Attendance Records Query
  const { data: records, isLoading: personalLoading } = useQuery<AttendanceRecord[]>({
    queryKey: ['attendance-records', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('employee_id', user.id)
        .order('date', { ascending: false })
        .limit(31)
      return data ?? []
    },
    enabled: !!user,
  })

  // Filter workforce items
  const workforceItems = (workforceData?.items ?? []).filter((item: any) => {
    const matchesSearch =
      !searchTerm ||
      item.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.employee_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.department_name?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus =
      statusFilter === 'ALL' ? true :
      statusFilter === 'PRESENT' ? (item.liveStatus === 'PRESENT' || item.liveStatus === 'LATE') :
      item.liveStatus === statusFilter

    return matchesSearch && matchesStatus
  })

  const stats = workforceData?.stats ?? {
    total: 0,
    present: 0,
    completed: 0,
    late: 0,
    on_leave: 0,
    absent: 0,
  }

  // Summary Metrics for Personal Log
  const totalDays = records?.length ?? 0
  const presentDays = records?.filter(r => r.status === 'PRESENT' || r.status === 'LATE').length ?? 0
  const lateDays = records?.filter(r => r.status === 'LATE').length ?? 0
  const totalWorkMinutes = records?.reduce((sum, r) => sum + (r.work_minutes ?? 0), 0) ?? 0
  const totalWorkHours = (totalWorkMinutes / 60).toFixed(1)

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: 'var(--space-6)' }}>
        <div>
          <h1 className="page-title">Attendance & Workforce Monitor</h1>
          <p className="page-subtitle">
            {isPrivileged
              ? 'Real-time organization clock-in stream, GPS & selfie verifications, and personal history'
              : 'View your daily clock-in records, working hours, and verification details'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          {isPrivileged && activeTab === 'workforce' && (
            <button
              onClick={() => refetchWorkforce()}
              className="btn btn-secondary"
              title="Refresh attendance data"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} /> Refresh
            </button>
          )}
          <Link href="/attendance/checkin" className="btn btn-primary" id="btn-clock-in-nav">
            <Clock size={18} /> Clock In / Out
          </Link>
        </div>
      </div>

      {/* Privileged Tab Selector: Live Workforce vs Personal Log */}
      {isPrivileged && (
        <div style={{
          display: 'flex',
          gap: 'var(--space-2)',
          marginBottom: 'var(--space-6)',
          borderBottom: '1px solid var(--neu-bg-deep)',
          paddingBottom: 'var(--space-3)'
        }}>
          <button
            onClick={() => setActiveTab('workforce')}
            className={`btn ${activeTab === 'workforce' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <Users size={18} /> Live Workforce Board
            <span style={{
              background: activeTab === 'workforce' ? 'rgba(255,255,255,0.2)' : 'var(--accent-light)',
              color: activeTab === 'workforce' ? '#fff' : 'var(--accent)',
              borderRadius: 12, padding: '2px 8px', fontSize: '0.75rem', fontWeight: 700
            }}>
              {stats.present} Working Now
            </span>
          </button>

          <button
            onClick={() => setActiveTab('my-log')}
            className={`btn ${activeTab === 'my-log' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <Clock size={18} /> My Personal Clock-In Log
          </button>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 1: LIVE WORKFORCE BOARD (Admin / HR / Manager View)
          ───────────────────────────────────────────────────────────── */}
      {isPrivileged && activeTab === 'workforce' ? (
        <div>
          {/* Live Attendance Metric Cards */}
          <div className="grid-auto" style={{ marginBottom: 'var(--space-6)' }}>
            <div
              className="stat-card"
              style={{ cursor: 'pointer', border: statusFilter === 'PRESENT' ? '2px solid var(--success)' : undefined }}
              onClick={() => setStatusFilter(statusFilter === 'PRESENT' ? 'ALL' : 'PRESENT')}
            >
              <div className="stat-card-icon" style={{ background: 'var(--success-light)' }}>
                <UserCheck size={22} color="var(--success)" />
              </div>
              <div className="stat-card-value">{workforceLoading ? '—' : stats.present}</div>
              <div className="stat-card-label">Working Now (Clocked In)</div>
            </div>

            <div
              className="stat-card"
              style={{ cursor: 'pointer', border: statusFilter === 'COMPLETED' ? '2px solid var(--accent)' : undefined }}
              onClick={() => setStatusFilter(statusFilter === 'COMPLETED' ? 'ALL' : 'COMPLETED')}
            >
              <div className="stat-card-icon" style={{ background: 'var(--accent-light)' }}>
                <CheckCircle size={22} color="var(--accent)" />
              </div>
              <div className="stat-card-value">{workforceLoading ? '—' : stats.completed}</div>
              <div className="stat-card-label">Day Completed (Clocked Out)</div>
            </div>

            <div
              className="stat-card"
              style={{ cursor: 'pointer', border: statusFilter === 'ON_LEAVE' ? '2px solid #F59E0B' : undefined }}
              onClick={() => setStatusFilter(statusFilter === 'ON_LEAVE' ? 'ALL' : 'ON_LEAVE')}
            >
              <div className="stat-card-icon" style={{ background: 'rgba(245,158,11,0.12)' }}>
                <Calendar size={22} color="#F59E0B" />
              </div>
              <div className="stat-card-value">{workforceLoading ? '—' : stats.on_leave}</div>
              <div className="stat-card-label">On Approved Leave</div>
            </div>

            <div
              className="stat-card"
              style={{ cursor: 'pointer', border: statusFilter === 'ABSENT' ? '2px solid var(--danger)' : undefined }}
              onClick={() => setStatusFilter(statusFilter === 'ABSENT' ? 'ALL' : 'ABSENT')}
            >
              <div className="stat-card-icon" style={{ background: 'var(--error-light)' }}>
                <UserX size={22} color="var(--danger)" />
              </div>
              <div className="stat-card-value">{workforceLoading ? '—' : stats.absent}</div>
              <div className="stat-card-label">Not Clocked In Today</div>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="card" style={{ marginBottom: 'var(--space-6)', padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="searchbar" style={{ flex: 1 }}>
                <Search size={18} color="var(--text-tertiary)" />
                <input
                  type="text"
                  placeholder="Search employee by name, email, code, or department…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                {(['ALL', 'PRESENT', 'COMPLETED', 'ON_LEAVE', 'ABSENT'] as const).map(st => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`badge ${statusFilter === st ? 'badge-primary' : 'badge-neutral'}`}
                    style={{ cursor: 'pointer', padding: '6px 12px' }}
                  >
                    {st === 'ALL' ? 'All' : st === 'PRESENT' ? 'Working Now' : st === 'COMPLETED' ? 'Completed' : st === 'ON_LEAVE' ? 'On Leave' : 'Absent'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Live Attendance Stream Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{
              padding: 'var(--space-4) var(--space-6)',
              borderBottom: '1px solid var(--neu-bg-deep)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', animation: 'pulse 2s infinite' }} />
                <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Today&apos;s Workforce Attendance — {format(new Date(), 'MMMM d, yyyy')}</h2>
              </div>
              <span className="badge badge-neutral">{workforceItems.length} active employees</span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Code</th>
                    <th>Department</th>
                    <th>Today Status</th>
                    <th>Clock In</th>
                    <th>Clock Out</th>
                    <th>Selfie & Verification</th>
                  </tr>
                </thead>
                <tbody>
                  {workforceLoading ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
                        <div className="skeleton skeleton-text" style={{ width: '50%', margin: '0 auto' }} />
                      </td>
                    </tr>
                  ) : workforceItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-tertiary)' }}>
                        No employee records match the selected filter.
                      </td>
                    </tr>
                  ) : (
                    workforceItems.map((emp: any) => {
                      const isWorkingNow = emp.liveStatus === 'PRESENT' || emp.liveStatus === 'LATE'
                      const isComplete = emp.liveStatus === 'COMPLETED'
                      const isOnLeave = emp.liveStatus === 'ON_LEAVE'
                      const isAbsent = emp.liveStatus === 'ABSENT'

                      return (
                        <tr key={emp.user_id} style={{ background: isWorkingNow ? 'rgba(16,185,129,0.03)' : undefined }}>
                          {/* Name + Avatar */}
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{
                                width: 36, height: 36, borderRadius: '50%',
                                background: 'linear-gradient(135deg, var(--accent), var(--brand-cyan))',
                                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: 700, fontSize: '0.875rem'
                              }}>
                                {emp.full_name?.charAt(0)?.toUpperCase() ?? 'U'}
                              </div>
                              <div>
                                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{emp.full_name}</div>
                                <div style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>{emp.email}</div>
                              </div>
                            </div>
                          </td>

                          {/* Code */}
                          <td style={{ fontFamily: 'monospace', fontSize: '0.875rem', fontWeight: 600 }}>
                            {emp.employee_code}
                          </td>

                          {/* Department */}
                          <td>
                            <span className="badge badge-neutral">{emp.department_name}</span>
                          </td>

                          {/* Status */}
                          <td>
                            {isWorkingNow ? (
                              <span className="badge badge-present" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                                Working Now
                              </span>
                            ) : isComplete ? (
                              <span className="badge" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                                ✓ Completed
                              </span>
                            ) : isOnLeave ? (
                              <span className="badge" style={{ background: 'rgba(245,158,11,0.15)', color: '#D97706' }}>
                                🏖️ On Leave
                              </span>
                            ) : (
                              <span className="badge badge-absent">
                                ⚪ Not Clocked In
                              </span>
                            )}
                          </td>

                          {/* Clock In */}
                          <td style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                            {emp.attendance?.clock_in_at ? (
                              <div>
                                <div style={{ color: 'var(--success)' }}>
                                  {format(parseISO(emp.attendance.clock_in_at), 'h:mm:ss a')}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 400 }}>
                                  Today
                                </div>
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                            )}
                          </td>

                          {/* Clock Out */}
                          <td style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                            {emp.attendance?.clock_out_at ? (
                              format(parseISO(emp.attendance.clock_out_at), 'h:mm:ss a')
                            ) : isWorkingNow ? (
                              <span style={{ fontSize: '0.8125rem', color: 'var(--success)', fontStyle: 'italic' }}>
                                In Progress…
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                            )}
                          </td>

                          {/* Selfie + Verification Badge */}
                          <td>
                            {emp.attendance?.clock_in_selfie_url ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <button
                                  type="button"
                                  onClick={() => setSelectedSelfie({
                                    url: emp.attendance.clock_in_selfie_url,
                                    name: emp.full_name,
                                    time: format(parseISO(emp.attendance.clock_in_at), 'h:mm a')
                                  })}
                                  title="Click to view full clock-in selfie"
                                  style={{
                                    border: '2px solid var(--accent)',
                                    padding: 0,
                                    borderRadius: 8,
                                    overflow: 'hidden',
                                    cursor: 'pointer',
                                    width: 36,
                                    height: 36,
                                    flexShrink: 0
                                  }}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={emp.attendance.clock_in_selfie_url}
                                    alt="Selfie"
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  />
                                </button>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--accent)', fontWeight: 600 }}>
                                    <Camera size={12} /> Selfie Verified
                                  </div>
                                  {emp.attendance.clock_in_lat && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--success)', fontSize: '0.7rem' }}>
                                      <MapPin size={11} /> GPS Validated
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : emp.attendance ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-tertiary)', fontSize: '0.8125rem' }}>
                                <Clock size={14} /> Manual / Auto
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-tertiary)', fontSize: '0.8125rem' }}>—</span>
                            )}
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
      ) : (
        /* ─────────────────────────────────────────────────────────────
           TAB 2: PERSONAL ATTENDANCE LOG (For Employees + Personal view)
           ───────────────────────────────────────────────────────────── */
        <div>
          {/* Metric Cards */}
          <div className="grid-auto" style={{ marginBottom: 'var(--space-8)' }}>
            <div className="stat-card">
              <div className="stat-card-icon" style={{ background: 'var(--success-light)' }}>
                <CheckCircle size={22} color="var(--success)" />
              </div>
              <div className="stat-card-value">{presentDays}</div>
              <div className="stat-card-label">Days Present</div>
            </div>

            <div className="stat-card">
              <div className="stat-card-icon" style={{ background: 'var(--warning-light)' }}>
                <AlertTriangle size={22} color="var(--warning)" />
              </div>
              <div className="stat-card-value">{lateDays}</div>
              <div className="stat-card-label">Late Arrivals</div>
            </div>

            <div className="stat-card">
              <div className="stat-card-icon" style={{ background: 'var(--accent-light)' }}>
                <Clock size={22} color="var(--accent)" />
              </div>
              <div className="stat-card-value">{totalWorkHours}h</div>
              <div className="stat-card-label">Total Work Hours</div>
            </div>
          </div>

          {/* Attendance History Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: 'var(--space-4) var(--space-6)', borderBottom: '1px solid var(--neu-bg-deep)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.125rem' }}>Recent Attendance Records</h2>
              <span className="badge badge-neutral">{totalDays} entries</span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Clock In</th>
                    <th>Clock Out</th>
                    <th>Duration</th>
                    <th>Verification</th>
                  </tr>
                </thead>
                <tbody>
                  {personalLoading ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
                        <div className="skeleton skeleton-text" style={{ width: '40%', margin: '0 auto' }} />
                      </td>
                    </tr>
                  ) : records?.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-tertiary)' }}>
                        No attendance records found yet. Click &quot;Clock In&quot; to log your first attendance!
                      </td>
                    </tr>
                  ) : (
                    records?.map(r => {
                      const badgeClass =
                        r.status === 'PRESENT' ? 'badge-present' :
                        r.status === 'LATE'    ? 'badge-late' :
                        r.status === 'ABSENT'  ? 'badge-absent' : 'badge-neutral'

                      const hours = r.work_minutes ? Math.floor(r.work_minutes / 60) : 0
                      const mins = r.work_minutes ? r.work_minutes % 60 : 0

                      return (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {format(parseISO(r.date), 'EEE, MMM d, yyyy')}
                          </td>
                          <td>
                            <span className={`badge ${badgeClass}`}>{r.status}</span>
                          </td>
                          <td style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                            {r.clock_in_at ? format(parseISO(r.clock_in_at), 'h:mm a') : '—'}
                          </td>
                          <td style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                            {r.clock_out_at ? format(parseISO(r.clock_out_at), 'h:mm a') : '—'}
                          </td>
                          <td style={{ color: 'var(--text-secondary)' }}>
                            {r.work_minutes ? `${hours}h ${mins}m` : '—'}
                          </td>
                          <td>
                            {r.clock_in_selfie_url ? (
                              <button
                                type="button"
                                onClick={() => setSelectedSelfie({
                                  url: r.clock_in_selfie_url!,
                                  name: 'My Clock-In Selfie',
                                  time: format(parseISO(r.clock_in_at!), 'h:mm a')
                                })}
                                style={{
                                  border: 'none', background: 'none', cursor: 'pointer',
                                  display: 'flex', alignItems: 'center', gap: 6,
                                  color: 'var(--accent)', fontSize: '0.8125rem'
                                }}
                              >
                                <Camera size={14} /> View Selfie
                              </button>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
                                <Camera size={14} color="var(--accent)" />
                                <MapPin size={14} color="var(--success)" />
                                <span>{r.method ?? 'SELFIE_GPS'}</span>
                              </div>
                            )}
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
      )}

      {/* Selfie Preview Modal */}
      {selectedSelfie && (
        <div className="modal-overlay" onClick={() => setSelectedSelfie(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, textAlign: 'center' }}>
            <button className="modal-close" onClick={() => setSelectedSelfie(null)}>✕</button>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: 4 }}>
              📸 Clock-In Verification
            </h3>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem', marginBottom: 'var(--space-4)' }}>
              {selectedSelfie.name} • {selectedSelfie.time}
            </p>
            <div style={{
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
              border: '2px solid var(--border-subtle)',
              marginBottom: 'var(--space-4)'
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedSelfie.url}
                alt="Clock-in Selfie Preview"
                style={{ width: '100%', height: 'auto', display: 'block' }}
              />
            </div>
            <button onClick={() => setSelectedSelfie(null)} className="btn btn-secondary" style={{ width: '100%' }}>
              Close Preview
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

