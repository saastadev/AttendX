'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Clock, Calendar, CheckCircle, AlertTriangle, MapPin, Camera, ChevronLeft, ChevronRight } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth.store'
import type { AttendanceRecord } from '@/types/database'

export default function AttendanceHistoryPage() {
  const supabase = getSupabaseBrowserClient()
  const user = useAuthStore(s => s.user)

  // Fetch Attendance Records
  const { data: records, isLoading } = useQuery<AttendanceRecord[]>({
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

  // Summary Metrics
  const totalDays = records?.length ?? 0
  const presentDays = records?.filter(r => r.status === 'PRESENT' || r.status === 'LATE').length ?? 0
  const lateDays = records?.filter(r => r.status === 'LATE').length ?? 0
  const totalWorkMinutes = records?.reduce((sum, r) => sum + (r.work_minutes ?? 0), 0) ?? 0
  const totalWorkHours = (totalWorkMinutes / 60).toFixed(1)

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Attendance Log & History</h1>
          <p className="page-subtitle">View your daily clock-in records, working hours, and verification details</p>
        </div>

        <Link href="/attendance/checkin" className="btn btn-primary" id="btn-clock-in-nav">
          <Clock size={18} /> Clock In / Out
        </Link>
      </div>

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
              {isLoading ? (
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
                          <Camera size={14} color="var(--accent)" />
                          <MapPin size={14} color="var(--success)" />
                          <span>{r.method ?? 'SELFIE_GPS'}</span>
                        </div>
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
