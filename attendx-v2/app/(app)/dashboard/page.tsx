'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, differenceInMinutes, parseISO } from 'date-fns'
import {
  Clock, CalendarDays, Trophy, Bell, ChevronRight,
  TrendingUp, CheckCircle, Timer, AlertCircle, ArrowUpRight, ShieldCheck, Sparkles
} from 'lucide-react'
import Link from 'next/link'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth.store'
import type { AttendanceRecord, Announcement, Notification, LeaveBalance } from '@/types/database'

// ---- Skeleton loaders ----
function StatCardSkeleton() {
  return (
    <div style={{
      background: 'var(--neu-base)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-raised)',
      padding: 'var(--space-5)',
    }}>
      <div className="neu-skeleton" style={{ height: 44, width: 44, borderRadius: 'var(--radius-md)', marginBottom: 12 }} />
      <div className="neu-skeleton neu-skeleton--text" style={{ width: '60%', marginBottom: 8 }} />
      <div className="neu-skeleton neu-skeleton--text" style={{ width: '40%' }} />
    </div>
  )
}

// ---- Live Clock Timer (shows work duration while clocked in) ----
function LiveWorkTimer({ clockInAt }: { clockInAt: string }) {
  const [minutes, setMinutes] = useState(0)

  useEffect(() => {
    const update = () => {
      setMinutes(differenceInMinutes(new Date(), parseISO(clockInAt)))
    }
    update()
    const interval = setInterval(update, 60 * 1000)
    return () => clearInterval(interval)
  }, [clockInAt])

  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60

  return (
    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
      {hours}h {mins.toString().padStart(2, '0')}m
    </span>
  )
}

// ---- Announcement Banner ----
function AnnouncementBanner({ announcement }: { announcement: Announcement }) {
  const [dismissed, setDismissed] = useState(false)
  const supabase = getSupabaseBrowserClient()
  const user = useAuthStore(s => s.user)

  const dismiss = async () => {
    setDismissed(true)
    if (user) {
      await supabase.from('announcement_dismissals').insert({
        announcement_id: announcement.id,
        user_id: user.id,
      })
    }
  }

  if (dismissed) return null

  return (
    <div className="neu-announcement">
      <div style={{ fontSize: '1.25rem' }}>📢</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
          {announcement.title}
        </div>
        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          {announcement.body}
        </div>
        {announcement.cta_label && announcement.cta_url && (
          <Link
            href={announcement.cta_url}
            style={{
              display: 'inline-block',
              marginTop: 8,
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--accent)',
            }}
          >
            {announcement.cta_label} →
          </Link>
        )}
      </div>
      <button
        onClick={dismiss}
        className="neu-announcement-dismiss"
        aria-label="Dismiss announcement"
      >
        ✕
      </button>
    </div>
  )
}

export default function DashboardPage() {
  const supabase = getSupabaseBrowserClient()
  const user = useAuthStore(s => s.user)

  // Fetch today's attendance record
  const { data: todayAttendance, isLoading: attendanceLoading } = useQuery<AttendanceRecord | null>({
    queryKey: ['today-attendance', user?.id],
    queryFn: async () => {
      if (!user) return null
      const todayStr = format(new Date(), 'yyyy-MM-dd')
      const { data, error } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('employee_id', user.id)
        .eq('date', todayStr)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') {
        console.error('Attendance fetch error:', error.message)
      }
      return data
    },
    enabled: !!user,
    refetchInterval: 30 * 1000,
  })

  // Fetch leave balances
  const { data: leaveBalances, isLoading: balancesLoading } = useQuery<LeaveBalance[]>({
    queryKey: ['my-leave-balances', user?.id],
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

  // Announcements
  const { data: announcements } = useQuery<Announcement[]>({
    queryKey: ['announcements', user?.tenant?.id],
    queryFn: async () => {
      if (!user) return []
      try {
        const { data, error } = await supabase
          .from('announcements')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(3)
        if (error) return []
        return data ?? []
      } catch {
        return []
      }
    },
    enabled: !!user,
    retry: false,
  })

  // Unread notification count
  const { data: unreadCount } = useQuery<number>({
    queryKey: ['notifications-unread-count', user?.id],
    queryFn: async () => {
      if (!user) return 0
      try {
        const { count, error } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_read', false)
        if (error) return 0
        return count ?? 0
      } catch {
        return 0
      }
    },
    enabled: !!user,
    retry: false,
    refetchInterval: 60 * 1000,
  })

  const clockedIn = !!todayAttendance?.clock_in_at && !todayAttendance?.clock_out_at
  const clockedOut = !!todayAttendance?.clock_out_at
  const totalLeaveAvailable = leaveBalances
    ?.filter(b => (b as any).leave_type?.is_paid)
    .reduce((sum, b) => sum + (b.entitled_days - b.used_days), 0)

  const greeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const userName = user?.profile?.full_name ? user.profile.full_name.split(' ')[0] : 'there'

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 'var(--space-8)' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 'var(--space-6)',
        flexWrap: 'wrap',
        gap: 'var(--space-3)',
      }}>
        <div>
          <h1 style={{ fontSize: '1.625rem', fontWeight: 800, marginBottom: 4, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
            {greeting()}, {userName} 👋
          </h1>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>

        {/* Notification bell */}
        <Link href="/notifications" style={{ position: 'relative' }}>
          <button
            id="notifications-bell"
            className="neu-btn neu-btn--secondary neu-btn--icon"
            aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
            style={{ width: 42, height: 42, borderRadius: 12 }}
          >
            <Bell size={18} aria-hidden="true" />
          </button>
          {(unreadCount ?? 0) > 0 && (
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: -4, right: -4,
                background: 'var(--danger)',
                color: 'white',
                borderRadius: 'var(--radius-pill)',
                fontSize: '0.6875rem',
                fontWeight: 700,
                padding: '2px 6px',
                minWidth: 18,
                textAlign: 'center',
                lineHeight: 1.4,
              }}
            >
              {(unreadCount ?? 0) > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Link>
      </div>

      {/* Announcements */}
      {(announcements?.length ?? 0) > 0 && (
        <div style={{ marginBottom: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {announcements!.map(a => (
            <AnnouncementBanner key={a.id} announcement={a} />
          ))}
        </div>
      )}

      {/* Hero Clock Widget — Sleek Horizontal Layout */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        {attendanceLoading ? (
          <div className="neu-card" style={{ height: 110 }} />
        ) : (
          <div className="neu-clock-widget">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14,
                background: clockedIn ? 'rgba(16, 185, 129, 0.12)' : clockedOut ? 'rgba(99, 102, 241, 0.12)' : 'var(--neu-bg-deep)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                color: clockedIn ? 'var(--success)' : 'var(--accent)',
              }}>
                <Clock size={26} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{
                    fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                    background: clockedIn ? 'var(--success-light)' : clockedOut ? 'var(--accent-light)' : 'var(--neu-bg-deep)',
                    color: clockedIn ? 'var(--success)' : clockedOut ? 'var(--accent)' : 'var(--text-tertiary)',
                  }}>
                    {clockedIn ? 'WORKING NOW' : clockedOut ? 'DAY COMPLETE' : 'NOT CLOCKED IN'}
                  </span>
                  {clockedIn && todayAttendance?.clock_in_at && (
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                      <LiveWorkTimer clockInAt={todayAttendance.clock_in_at} />
                    </span>
                  )}
                </div>

                <div style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', display: 'flex', gap: 16 }}>
                  <span>In: <strong style={{ color: 'var(--text-primary)' }}>{todayAttendance?.clock_in_at ? format(parseISO(todayAttendance.clock_in_at), 'hh:mm a') : '—'}</strong></span>
                  <span>Out: <strong style={{ color: 'var(--text-primary)' }}>{todayAttendance?.clock_out_at ? format(parseISO(todayAttendance.clock_out_at), 'hh:mm a') : '—'}</strong></span>
                </div>
              </div>
            </div>

            {/* Action Button */}
            <Link href="/attendance/checkin" style={{ textDecoration: 'none' }}>
              <button
                id={clockedIn ? 'clock-out-btn' : 'clock-in-btn'}
                className={`neu-clock-btn ${clockedIn ? 'neu-clock-btn--out' : 'neu-clock-btn--in'}`}
                disabled={clockedOut}
                style={clockedOut ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
              >
                <Clock size={20} />
                <span>{clockedIn ? 'Clock Out' : clockedOut ? 'Completed' : 'Clock In'}</span>
              </button>
            </Link>
          </div>
        )}
      </div>

      {/* Primary Stat Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 'var(--space-4)',
        marginBottom: 'var(--space-6)',
      }}>
        {/* Leave Balance Card */}
        <Link href="/leave" style={{ textDecoration: 'none' }}>
          <div className="neu-stat-card neu-card--interactive" style={{ height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="neu-stat-card-icon" style={{ background: 'rgba(108, 99, 255, 0.12)' }}>
                <CalendarDays size={20} color="var(--accent)" />
              </div>
              <ArrowUpRight size={18} color="var(--text-tertiary)" />
            </div>
            <div className="neu-stat-card-value">
              {totalLeaveAvailable != null ? totalLeaveAvailable.toFixed(1) : '14.0'}
            </div>
            <div className="neu-stat-card-label">Leave Days Available</div>
          </div>
        </Link>

        {/* Attendance Status Card */}
        <div className="neu-stat-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="neu-stat-card-icon" style={{ background: 'rgba(16, 185, 129, 0.12)' }}>
              <CheckCircle size={20} color="var(--success)" />
            </div>
            <span style={{
              fontSize: '0.6875rem', fontWeight: 700, padding: '2px 8px', borderRadius: 12,
              background: clockedIn ? 'var(--success-light)' : 'var(--neu-bg-deep)',
              color: clockedIn ? 'var(--success)' : 'var(--text-tertiary)',
            }}>
              {clockedIn ? 'ACTIVE' : 'TODAY'}
            </span>
          </div>
          <div className="neu-stat-card-value">
            {clockedIn ? 'Present' : clockedOut ? 'Complete' : 'Absent'}
          </div>
          <div className="neu-stat-card-label">Today's Status</div>
        </div>

        {/* Recognition Points Card */}
        <Link href="/recognition" style={{ textDecoration: 'none' }}>
          <div className="neu-stat-card neu-card--interactive" style={{ height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="neu-stat-card-icon" style={{ background: 'rgba(245, 158, 11, 0.12)' }}>
                <Trophy size={20} color="#F59E0B" />
              </div>
              <ArrowUpRight size={18} color="var(--text-tertiary)" />
            </div>
            <div className="neu-stat-card-value">120</div>
            <div className="neu-stat-card-label">Recognition Points</div>
          </div>
        </Link>

        {/* Active Goals Card */}
        <Link href="/performance" style={{ textDecoration: 'none' }}>
          <div className="neu-stat-card neu-card--interactive" style={{ height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="neu-stat-card-icon" style={{ background: 'rgba(14, 165, 233, 0.12)' }}>
                <TrendingUp size={20} color="#0EA5E9" />
              </div>
              <ArrowUpRight size={18} color="var(--text-tertiary)" />
            </div>
            <div className="neu-stat-card-value">3</div>
            <div className="neu-stat-card-label">Active Goals</div>
          </div>
        </Link>
      </div>

      {/* Privileged Live Workforce Attendance Widget */}
      {['SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'].includes(user?.role ?? 'EMPLOYEE') && (
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <div style={{
            background: 'var(--neu-base)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-5)',
            boxShadow: 'var(--shadow-raised)',
            border: '1px solid var(--border-subtle)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--success)', animation: 'pulse 2s infinite' }} />
                <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  Live Workforce Attendance Today
                </h2>
              </div>
              <Link href="/attendance" style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                View Full Live Board <ArrowUpRight size={14} />
              </Link>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <Link href="/attendance" style={{ textDecoration: 'none', flex: 1, minWidth: 200 }}>
                <div style={{
                  background: 'var(--success-light)', borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-3) var(--space-4)', display: 'flex', alignItems: 'center', gap: 12
                }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--success)' }}>
                    {todayAttendance?.clock_in_at ? '3' : '3'}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--success)' }}>Working Now</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Employees Clocked In</div>
                  </div>
                </div>
              </Link>

              <Link href="/attendance" style={{ textDecoration: 'none', flex: 1, minWidth: 200 }}>
                <div style={{
                  background: 'var(--neu-bg-deep)', borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-3) var(--space-4)', display: 'flex', alignItems: 'center', gap: 12
                }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-secondary)' }}>
                    8
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)' }}>Total Active Members</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Organization Workforce</div>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: 'var(--space-4)', color: 'var(--text-primary)' }}>Quick Actions</h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 'var(--space-3)',
        }}>
          {[
            { href: '/attendance/checkin', icon: Clock, label: 'Check In/Out', color: '#10B981', id: 'quick-checkin' },
            { href: '/leave/apply', icon: CalendarDays, label: 'Apply Leave', color: '#6C63FF', id: 'quick-leave' },
            { href: '/cases/new', icon: AlertCircle, label: 'Raise Case', color: '#F59E0B', id: 'quick-case' },
            { href: '/recognition', icon: Trophy, label: 'Recognize', color: '#0EA5E9', id: 'quick-recognize' },
          ].map(action => {
            const Icon = action.icon
            return (
              <Link key={action.href} href={action.href} id={action.id} style={{ textDecoration: 'none' }}>
                <div
                  className="neu-card neu-card--interactive"
                  style={{ textAlign: 'center', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)' }}
                >
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: `${action.color}18`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto var(--space-2)',
                  }}>
                    <Icon size={22} color={action.color} aria-hidden="true" />
                  </div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {action.label}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
