'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import {
  Clock, Calendar, CheckCircle, AlertTriangle, MapPin, Camera,
  Users, UserCheck, UserX, Search, Filter, RefreshCw, Eye, Sparkles, Trash2
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth.store'
import { useToast } from '@/components/ui/Toast'
import { PageWrapper } from '@/components/ui/PageWrapper'
import { AnimatedValue } from '@/components/ui/AnimatedValue'
import type { AttendanceRecord } from '@/types/database'

export default function AttendanceHistoryPage() {
  const supabase = getSupabaseBrowserClient()
  const user = useAuthStore(s => s.user)
  const { success, error: toastError } = useToast()
  const queryClient = useQueryClient()

  const isPrivileged = ['SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'].includes(user?.role ?? 'EMPLOYEE')

  // Tab: 'workforce' (company-wide live board) vs 'my-log' (personal records)
  const [activeTab, setActiveTab] = useState<'workforce' | 'my-log'>(isPrivileged ? 'workforce' : 'my-log')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PRESENT' | 'COMPLETED' | 'ON_LEAVE' | 'ABSENT'>('ALL')
  const [selectedSelfie, setSelectedSelfie] = useState<{ recordId: string; url: string; name: string; time: string; target: 'clock_in' | 'clock_out' | 'both' } | null>(null)
  const [deletingRecord, setDeletingRecord] = useState<{ recordId: string; name: string; target: 'clock_in' | 'clock_out' | 'both' } | null>(null)

  // 1. Live Workforce Attendance Query (for Admin / HR / Manager)
  const { data: workforceData, isLoading: workforceLoading, refetch: refetchWorkforce, isFetching } = useQuery({
    queryKey: ['admin-live-attendance', user?.tenant?.id],
    queryFn: async () => {
      const res = await fetch('/api/admin/attendance')
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    enabled: isPrivileged,
    refetchInterval: 15 * 1000,
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

  // 3. Delete Selfie Mutation for Admins
  const deleteSelfieMutation = useMutation({
    mutationFn: async ({ recordId, target }: { recordId: string; target: 'clock_in' | 'clock_out' | 'both' }) => {
      const res = await fetch('/api/admin/attendance', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record_id: recordId, target }),
      })
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({ error: 'Failed to delete selfie' }))
        throw new Error(errJson.error)
      }
      return res.json()
    },
    onSuccess: (data) => {
      success(data.message || 'Selfie image deleted successfully')
      setDeletingRecord(null)
      setSelectedSelfie(null)
      refetchWorkforce()
      queryClient.invalidateQueries({ queryKey: ['admin-live-attendance'] })
    },
    onError: (err: Error) => {
      toastError(err.message || 'Failed to delete selfie')
    },
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
    <PageWrapper style={{ maxWidth: 1200, margin: '0 auto' }}>
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
          {isPrivileged && (
            <div style={{
              display: 'flex',
              background: 'var(--neu-bg-deep)',
              borderRadius: 'var(--radius-pill)',
              padding: 4,
              boxShadow: 'var(--shadow-inset-sm)',
            }}>
              <button
                type="button"
                onClick={() => setActiveTab('workforce')}
                className={`btn btn-sm ${activeTab === 'workforce' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ borderRadius: 'var(--radius-pill)' }}
              >
                <Users size={16} /> Workforce Board
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('my-log')}
                className={`btn btn-sm ${activeTab === 'my-log' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ borderRadius: 'var(--radius-pill)' }}
              >
                <Clock size={16} /> My Log
              </button>
            </div>
          )}

          <Link href="/attendance/checkin" className="btn btn-primary" id="btn-clockin-now">
            <Clock size={18} /> Clock In Now
          </Link>
        </div>
      </div>

      {activeTab === 'workforce' && isPrivileged ? (
        <div>
          {/* Workforce Stats Top Row */}
          <div className="grid-auto" style={{ marginBottom: 'var(--space-6)' }}>
            <div className="stat-card">
              <div className="stat-card-icon" style={{ background: 'var(--accent-light)' }}>
                <Users size={22} color="var(--accent)" />
              </div>
              <div className="stat-card-value">{stats.total}</div>
              <div className="stat-card-label">Total Active Staff</div>
            </div>

            <div className="stat-card">
              <div className="stat-card-icon" style={{ background: 'var(--success-light)' }}>
                <UserCheck size={22} color="var(--success)" />
              </div>
              <div className="stat-card-value" style={{ color: 'var(--success)' }}>
                {stats.present + stats.completed}
              </div>
              <div className="stat-card-label">Working / Completed Today</div>
            </div>

            <div className="stat-card">
              <div className="stat-card-icon" style={{ background: 'var(--warning-light)' }}>
                <AlertTriangle size={22} color="var(--warning)" />
              </div>
              <div className="stat-card-value" style={{ color: 'var(--warning)' }}>{stats.late}</div>
              <div className="stat-card-label">Late Arrivals</div>
            </div>

            <div className="stat-card">
              <div className="stat-card-icon" style={{ background: 'rgba(245, 158, 11, 0.15)' }}>
                <Calendar size={22} color="#D97706" />
              </div>
              <div className="stat-card-value" style={{ color: '#D97706' }}>{stats.on_leave}</div>
              <div className="stat-card-label">Approved Leave</div>
            </div>

            <div className="stat-card">
              <div className="stat-card-icon" style={{ background: 'var(--danger-light)' }}>
                <UserX size={22} color="var(--danger)" />
              </div>
              <div className="stat-card-value" style={{ color: 'var(--danger)' }}>{stats.absent}</div>
              <div className="stat-card-label">Not Clocked In</div>
            </div>
          </div>

          {/* Search + Status Filter Controls */}
          <div className="card neu-card" style={{ marginBottom: 'var(--space-6)', padding: 'var(--space-4)' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-4)',
              flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', gap: 'var(--space-3)', flex: 1, minWidth: 260 }}>
                <div className="input-wrap" style={{ flex: 1 }}>
                  <Search size={18} className="input-icon" />
                  <input
                    type="text"
                    className="input has-icon-left"
                    placeholder="Search by name, employee code, or department..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Filter size={16} color="var(--text-tertiary)" />
                  <select
                    className="input"
                    style={{ width: 140, padding: '0 12px' }}
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value as any)}
                  >
                    <option value="ALL">All Status</option>
                    <option value="PRESENT">Working / Late</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="ON_LEAVE">On Leave</option>
                    <option value="ABSENT">Absent</option>
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={() => refetchWorkforce()}
                className={`btn btn-secondary btn-sm ${isFetching ? 'btn-loading' : ''}`}
                style={{ height: 38 }}
              >
                <RefreshCw size={16} /> Refresh Stream
              </button>
            </div>
          </div>

          {/* Live Workforce Attendance Table */}
          <div className="card neu-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{
                    borderBottom: '1px solid var(--neu-border)',
                    background: 'var(--neu-bg-deep)',
                    fontSize: '0.75rem',
                    color: 'var(--text-tertiary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}>
                    <th style={{ padding: '14px 20px' }}>Employee</th>
                    <th style={{ padding: '14px 16px' }}>Code</th>
                    <th style={{ padding: '14px 16px' }}>Department</th>
                    <th style={{ padding: '14px 16px' }}>Status</th>
                    <th style={{ padding: '14px 16px' }}>Clock In</th>
                    <th style={{ padding: '14px 16px' }}>Clock Out</th>
                    <th style={{ padding: '14px 20px' }}>Verification & Selfie</th>
                  </tr>
                </thead>

                <tbody>
                  {workforceLoading ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
                        <div style={{ color: 'var(--text-tertiary)', fontSize: '0.9375rem' }}>
                          Loading live workforce stream...
                        </div>
                      </td>
                    </tr>
                  ) : workforceItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
                        <div style={{ color: 'var(--text-tertiary)', fontSize: '0.9375rem' }}>
                          No employee records match the current filter.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    workforceItems.map((emp: any) => {
                      const isWorkingNow = emp.liveStatus === 'PRESENT' || emp.liveStatus === 'LATE'
                      const isComplete = emp.liveStatus === 'COMPLETED'
                      const isOnLeave = emp.liveStatus === 'ON_LEAVE'
                      const selfieUrl = emp.attendance?.clock_in_selfie_url || emp.attendance?.clock_out_selfie_url

                      return (
                        <tr key={emp.user_id} style={{ borderBottom: '1px solid var(--neu-border)' }}>
                          {/* Employee Name & Avatar */}
                          <td style={{ padding: '14px 20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <div style={{
                                width: 38, height: 38, borderRadius: '50%', background: 'var(--accent-light)',
                                color: 'var(--accent)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.9375rem', overflow: 'hidden', flexShrink: 0
                              }}>
                                {emp.avatar_url ? (
                                  <img src={emp.avatar_url} alt={emp.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                  emp.full_name.charAt(0).toUpperCase()
                                )}
                              </div>
                              <div>
                                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9375rem' }}>
                                  {emp.full_name}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                                  {emp.email}
                                </div>
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

                          {/* Selfie + Verification Badge + DELETE button for Admins */}
                          <td style={{ padding: '14px 20px' }}>
                            {selfieUrl ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <button
                                  type="button"
                                  onClick={() => setSelectedSelfie({
                                    recordId: emp.attendance.id,
                                    url: selfieUrl,
                                    name: emp.full_name,
                                    time: emp.attendance.clock_in_at ? format(parseISO(emp.attendance.clock_in_at), 'h:mm a') : 'Today',
                                    target: emp.attendance.clock_in_selfie_url ? 'clock_in' : 'clock_out',
                                  })}
                                  title="Click to view full selfie"
                                  style={{
                                    border: '2px solid var(--accent)',
                                    padding: 0,
                                    borderRadius: 8,
                                    overflow: 'hidden',
                                    cursor: 'pointer',
                                    width: 40,
                                    height: 40,
                                    flexShrink: 0
                                  }}
                                >
                                  <img
                                    src={selfieUrl}
                                    alt="Selfie"
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  />
                                </button>

                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', flex: 1 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--accent)', fontWeight: 600 }}>
                                    <Camera size={12} /> Selfie Verified
                                  </div>
                                  {emp.attendance.clock_in_lat && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--success)', fontSize: '0.7rem' }}>
                                      <MapPin size={11} /> GPS Validated
                                    </div>
                                  )}
                                </div>

                                {/* DELETE Selfie Action Button */}
                                {isPrivileged && (
                                  <button
                                    type="button"
                                    onClick={() => setDeletingRecord({
                                      recordId: emp.attendance.id,
                                      name: emp.full_name,
                                      target: 'both',
                                    })}
                                    title="Delete recorded selfie image"
                                    style={{
                                      background: 'var(--danger-light)',
                                      color: 'var(--danger)',
                                      border: 'none',
                                      borderRadius: 8,
                                      padding: '6px 10px',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      fontSize: '0.75rem',
                                      fontWeight: 600,
                                    }}
                                  >
                                    <Trash2 size={13} /> Delete
                                  </button>
                                )}
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
        /* TAB 2: PERSONAL LOG */
        <div>
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
              <div className="stat-card-label">Total Hours Worked</div>
            </div>
          </div>

          <div className="card neu-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{
                    borderBottom: '1px solid var(--neu-border)',
                    background: 'var(--neu-bg-deep)',
                    fontSize: '0.75rem',
                    color: 'var(--text-tertiary)',
                    textTransform: 'uppercase',
                  }}>
                    <th style={{ padding: '14px 20px' }}>Date</th>
                    <th style={{ padding: '14px 16px' }}>Status</th>
                    <th style={{ padding: '14px 16px' }}>Clock In</th>
                    <th style={{ padding: '14px 16px' }}>Clock Out</th>
                    <th style={{ padding: '14px 16px' }}>Duration</th>
                    <th style={{ padding: '14px 20px' }}>Verification</th>
                  </tr>
                </thead>
                <tbody>
                  {personalLoading ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-tertiary)' }}>
                        Loading your log...
                      </td>
                    </tr>
                  ) : (records?.length ?? 0) === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-tertiary)' }}>
                        No personal attendance records found.
                      </td>
                    </tr>
                  ) : (
                    records!.map(r => (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--neu-border)' }}>
                        <td style={{ padding: '14px 20px', fontWeight: 600 }}>{r.date}</td>
                        <td>
                          <span className={`badge ${
                            r.status === 'PRESENT' ? 'badge-present' :
                            r.status === 'LATE' ? 'badge-warning' :
                            'badge-absent'
                          }`}>
                            {r.status}
                          </span>
                        </td>
                        <td>{r.clock_in_at ? format(parseISO(r.clock_in_at), 'h:mm a') : '—'}</td>
                        <td>{r.clock_out_at ? format(parseISO(r.clock_out_at), 'h:mm a') : '—'}</td>
                        <td>{r.work_minutes ? `${Math.floor(r.work_minutes / 60)}h ${r.work_minutes % 60}m` : '—'}</td>
                        <td>{r.clock_in_selfie_url ? '📷 Verified' : 'Manual'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Selfie Preview Modal */}
      {selectedSelfie && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }} onClick={() => setSelectedSelfie(null)}>
          <div style={{ background: 'var(--neu-bg)', borderRadius: 16, padding: 24, maxWidth: 440, width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{selectedSelfie.name}</h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Clocked in at {selectedSelfie.time}</p>
              </div>
              <button onClick={() => setSelectedSelfie(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <img src={selectedSelfie.url} alt="Selfie Verification" style={{ width: '100%', maxHeight: 360, objectFit: 'contain', borderRadius: 12, marginBottom: 16 }} />

            {isPrivileged && (
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button
                  className="btn"
                  style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}
                  onClick={() => {
                    setDeletingRecord({ recordId: selectedSelfie.recordId, name: selectedSelfie.name, target: selectedSelfie.target })
                  }}
                >
                  <Trash2 size={16} /> Delete Selfie Photo
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingRecord && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1050, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{ background: 'var(--neu-bg)', borderRadius: 16, padding: 24, maxWidth: 420, width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <AlertTriangle size={24} color="var(--danger)" />
              <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>Delete Selfie Photo?</h3>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 20 }}>
              Are you sure you want to delete the recorded selfie photo for <strong>{deletingRecord.name}</strong>? The file will be removed from storage and attendance verification.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setDeletingRecord(null)}
                disabled={deleteSelfieMutation.isPending}
              >
                Cancel
              </button>
              <button
                className="btn"
                style={{ background: 'var(--danger)', color: 'white' }}
                onClick={() => deleteSelfieMutation.mutate({ recordId: deletingRecord.recordId, target: deletingRecord.target })}
                disabled={deleteSelfieMutation.isPending}
              >
                {deleteSelfieMutation.isPending ? 'Deleting...' : 'Delete Image'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  )
}
