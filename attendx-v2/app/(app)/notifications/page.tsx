'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, BellOff, Check, CheckCheck, AlertCircle, Info, Star, Calendar, Award, Trophy, ArrowRight } from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth.store'
import { useToast } from '@/components/ui/Toast'
import { PageWrapper } from '@/components/ui/PageWrapper'
import { EmptyState } from '@/components/ui/EmptyState'
import type { Notification } from '@/types/database'

const ICON_MAP: Record<string, React.ReactNode> = {
  LEAVE_APPROVED:       <CheckCheck size={18} color="var(--success)" />,
  LEAVE_REJECTED:       <AlertCircle size={18} color="var(--danger)" />,
  ANNOUNCEMENT:         <Star size={18} color="var(--warning)" />,
  REVIEW_REMINDER:      <Calendar size={18} color="var(--accent)" />,
  RECOGNITION_RECEIVED: <Trophy size={18} color="#EC4899" />,
  BADGE_EARNED:         <Award size={18} color="var(--warning)" />,
  SYSTEM:               <Info size={18} color="var(--text-tertiary)" />,
}

export default function NotificationsPage() {
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()
  const user = useAuthStore(s => s.user)
  const { success, error } = useToast()
  const qc = useQueryClient()
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  const { data: notifications, isLoading } = useQuery<Notification[]>({
    queryKey: ['notifications', user?.id, filter],
    queryFn: async () => {
      if (!user) return []
      try {
        const res = await fetch(`/api/notifications?filter=${filter}`, { credentials: 'same-origin' })
        if (res.ok) {
          const json = await res.json()
          if (Array.isArray(json.notifications)) return json.notifications
        }
      } catch (apiErr) {
        console.warn('[Notifications] API fetch fallback to Supabase client', apiErr)
      }

      try {
        let q = supabase
          .from('notifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50)
        if (filter === 'unread') q = q.eq('is_read', false)
        const { data, error } = await q
        if (error) return []
        return data ?? []
      } catch {
        return []
      }
    },
    enabled: !!user,
    retry: false,
  })

  const unreadCount = notifications?.filter(n => !n.is_read).length ?? 0

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      if (!user) return
      try {
        const res = await fetch('/api/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markAllRead: true }),
        })
        if (res.ok) return
      } catch {}

      const { error: err } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('is_read', false)
      if (err) throw err
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notifications-panel'] })
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      success('All notifications marked as read')
    },
    onError: (err: any) => error('Failed to mark as read', err.message),
  })

  const markReadMutation = useMutation({
    mutationFn: async (notifId: string) => {
      try {
        const res = await fetch('/api/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: notifId }),
        })
        if (res.ok) return
      } catch {}

      const { error: err } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', notifId)
      if (err) throw err
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notifications-panel'] })
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
    onError: (err: any) => error('Failed to mark as read', err.message),
  })

  const handleItemClick = (n: Notification) => {
    if (!n.is_read) {
      markReadMutation.mutate(n.id)
    }
    const target = n.deep_link || (n.type === 'RECOGNITION_RECEIVED' ? '/recognition' : null)
    if (target) {
      router.push(target)
    }
  }

  return (
    <PageWrapper style={{ maxWidth: 760, margin: '0 auto' }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-subtitle">
            {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : "You're all caught up!"}

          </p>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
            className="btn btn-secondary"
            id="btn-mark-all-read"
          >
            <CheckCheck size={18} /> Mark All Read
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="tab-group" style={{ marginBottom: 'var(--space-6)' }}>
        {(['all', 'unread'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`tab-btn ${filter === f ? 'tab-btn-active' : ''}`}
            id={`tab-notif-${f}`}
          >
            {f === 'all' ? 'All' : `Unread${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
          </button>
        ))}
      </div>

      {/* Notifications List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {isLoading ? (
          [1, 2, 3].map(i => (
            <div key={i} className="card" style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <div className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton skeleton-text" style={{ width: '70%', marginBottom: 8 }} />
                <div className="skeleton skeleton-text" style={{ width: '40%' }} />
              </div>
            </div>
          ))
        ) : notifications?.length === 0 ? (
          <EmptyState
            variant="notifications"
            title="All caught up!"
            body="You have no notifications right now. Check back later."
          />
        ) : (
          notifications?.map(n => (
            <div
              key={n.id}
              className={`card notification-item ${!n.is_read ? 'notification-unread' : ''}`}
              style={{
                display: 'flex',
                gap: 'var(--space-4)',
                alignItems: 'flex-start',
                cursor: 'pointer',
                transition: 'all var(--anim-fast)',
              }}
              onClick={() => handleItemClick(n)}
              role="button"
              aria-label={n.is_read ? 'Notification (read)' : 'Mark as read'}
            >
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: n.type === 'RECOGNITION_RECEIVED' ? 'rgba(236, 72, 153, 0.15)' : 'var(--neu-bg-deep)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {ICON_MAP[n.type] ?? ICON_MAP.SYSTEM}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  marginBottom: 4,
                }}>
                  <span style={{
                    fontWeight: n.is_read ? 600 : 700,
                    color: 'var(--text-primary)',
                    fontSize: '0.9375rem',
                  }}>
                    {n.title}
                  </span>
                  {Boolean((n.data as any)?.points) && (
                    <span style={{
                      background: 'linear-gradient(135deg, #EC4899, #8B5CF6)',
                      color: 'white',
                      fontSize: '0.6875rem',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: 12,
                      flexShrink: 0,
                    }}>
                      +{(n.data as any).points} pts
                    </span>
                  )}
                </div>
                {n.body && (
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
                    {n.body}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    {formatDistanceToNow(parseISO(n.created_at), { addSuffix: true })}
                  </span>
                  {(n.deep_link || n.type === 'RECOGNITION_RECEIVED') && (
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: n.type === 'RECOGNITION_RECEIVED' ? '#EC4899' : 'var(--accent)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}>
                      {n.type === 'RECOGNITION_RECEIVED' ? 'View on Kudos Leaderboard' : 'View Details'} <ArrowRight size={12} />
                    </span>
                  )}
                </div>
              </div>

              {!n.is_read && (
                <div style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: 'var(--accent)', flexShrink: 0, marginTop: 6,
                }} />
              )}
            </div>
          ))
        )}
      </div>
    </PageWrapper>
  )
}
