'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, BellOff, Check, CheckCheck, AlertCircle, Info, Star, Calendar } from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth.store'
import { useToast } from '@/components/ui/Toast'
import { PageWrapper } from '@/components/ui/PageWrapper'
import { EmptyState } from '@/components/ui/EmptyState'
import type { Notification } from '@/types/database'

const ICON_MAP: Record<string, React.ReactNode> = {
  LEAVE_APPROVED:  <CheckCheck size={18} color="var(--success)" />,
  LEAVE_REJECTED:  <AlertCircle size={18} color="var(--danger)" />,
  ANNOUNCEMENT:    <Star size={18} color="var(--warning)" />,
  REVIEW_REMINDER: <Calendar size={18} color="var(--accent)" />,
  SYSTEM:          <Info size={18} color="var(--text-tertiary)" />,
}

export default function NotificationsPage() {
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
      const { error: err } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('is_read', false)
      if (err) throw err
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      success('All notifications marked as read')
    },
    onError: (err: any) => error('Failed to mark as read', err.message),
  })

  const markReadMutation = useMutation({
    mutationFn: async (notifId: string) => {
      const { error: err } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', notifId)
      if (err) throw err
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
    onError: (err: any) => error('Failed to mark as read', err.message),
  })

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
                cursor: !n.is_read ? 'pointer' : 'default',
                transition: 'all var(--anim-fast)',
              }}
              onClick={() => {
                if (!n.is_read) markReadMutation.mutate(n.id)
              }}
              role="button"
              aria-label={n.is_read ? 'Notification (read)' : 'Mark as read'}
            >
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: 'var(--neu-bg-deep)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {ICON_MAP[n.type] ?? ICON_MAP.SYSTEM}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontWeight: n.is_read ? 500 : 700,
                  color: 'var(--text-primary)',
                  marginBottom: 4,
                  fontSize: '0.9375rem',
                }}>
                  {n.title}
                </div>
                {n.body && (
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
                    {n.body}
                  </div>
                )}
                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                  {formatDistanceToNow(parseISO(n.created_at), { addSuffix: true })}
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
