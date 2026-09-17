'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bell, X, CheckCheck, Award, Trophy, Star, Info,
  Calendar, ArrowRight, ExternalLink
} from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { useAuthStore } from '@/store/auth.store'
import { useToast } from '@/components/ui/Toast'
import type { Notification } from '@/types/database'

const SPRING_GENTLE = { type: 'spring' as const, stiffness: 350, damping: 30 }

const NOTIF_ICONS: Record<string, { icon: any; color: string; bg: string }> = {
  RECOGNITION_RECEIVED: { icon: Trophy, color: '#EC4899', bg: 'rgba(236, 72, 153, 0.15)' },
  BADGE_EARNED:         { icon: Award,  color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)' },
  LEAVE_APPROVED:       { icon: CheckCheck, color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)' },
  LEAVE_REJECTED:       { icon: Info,   color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)' },
  ANNOUNCEMENT:         { icon: Star,   color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)' },
  REVIEW_REMINDER:      { icon: Calendar, color: '#6366F1', bg: 'rgba(99, 102, 241, 0.15)' },
  SYSTEM:               { icon: Info,   color: '#6B7280', bg: 'rgba(107, 114, 128, 0.15)' },
}

interface NotificationFlyoutPanelProps {
  open: boolean
  onClose: () => void
}

export function NotificationFlyoutPanel({ open, onClose }: NotificationFlyoutPanelProps) {
  const router = useRouter()
  const user = useAuthStore(s => s.user)
  const qc = useQueryClient()
  const { success, error: toastError } = useToast()
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const panelRef = useRef<HTMLDivElement>(null)

  // Fetch live notifications
  const { data: notifications = [], isLoading, refetch } = useQuery<Notification[]>({
    queryKey: ['notifications-panel', user?.id, filter],
    queryFn: async () => {
      if (!user) return []
      try {
        const res = await fetch(`/api/notifications?filter=${filter}`, { credentials: 'same-origin' })
        if (res.ok) {
          const json = await res.json()
          if (Array.isArray(json.notifications)) return json.notifications
        }
      } catch (e) {
        console.warn('[NotificationPanel] fetch error:', e)
      }
      return []
    },
    enabled: open && !!user,
    refetchInterval: open ? 6000 : false,
  })

  // Close on Escape or click outside
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onPointerDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [open, onClose])

  // Mark all as read mutation
  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      })
      if (!res.ok) throw new Error('Failed to mark all as read')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notifications-panel'] })
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      refetch()
      success('All notifications marked as read')
    },
    onError: (err: any) => toastError('Error', err.message),
  })

  // Mark individual notification as read
  const markSingleReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notifications-panel'] })
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })

  const handleNotificationClick = (notif: Notification) => {
    if (!notif.is_read) {
      markSingleReadMutation.mutate(notif.id)
    }
    onClose()
    if (notif.deep_link) {
      router.push(notif.deep_link)
    } else if (notif.type === 'RECOGNITION_RECEIVED') {
      router.push('/recognition')
    }
  }

  const unreadTotal = notifications.filter(n => !n.is_read).length

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Subtle backdrop overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 998,
              background: 'rgba(0, 0, 0, 0.25)',
              backdropFilter: 'blur(2px)',
            }}
          />

          {/* Floating Slide-out Notification Panel */}
          <motion.div
            ref={panelRef}
            className="neu-notif-flyout"
            initial={{ opacity: 0, x: -20, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -20, scale: 0.96 }}
            transition={SPRING_GENTLE}
          >
            {/* Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--neu-bg, #14182b)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Bell size={18} color="var(--accent, #6366F1)" />
                <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Notifications
                </h3>
                {unreadTotal > 0 && (
                  <span style={{
                    background: 'linear-gradient(135deg, #EC4899, #8B5CF6)',
                    color: 'white',
                    fontSize: '0.6875rem',
                    fontWeight: 800,
                    padding: '2px 7px',
                    borderRadius: 12,
                  }}>
                    {unreadTotal} new
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {unreadTotal > 0 && (
                  <button
                    onClick={() => markAllReadMutation.mutate()}
                    title="Mark all as read"
                    className="neu-btn neu-btn--ghost neu-btn--sm"
                    style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                  >
                    <CheckCheck size={14} /> Mark Read
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="neu-btn neu-btn--ghost neu-btn--icon neu-btn--sm"
                  aria-label="Close notification panel"
                  style={{ width: 28, height: 28 }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Filter Tabs */}
            <div style={{
              display: 'flex',
              gap: 8,
              padding: '10px 16px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
              background: 'var(--neu-bg-deep, #101424)',
            }}>
              <button
                onClick={() => setFilter('all')}
                style={{
                  padding: '4px 12px',
                  borderRadius: 12,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: filter === 'all' ? 'var(--accent, #6366F1)' : 'transparent',
                  color: filter === 'all' ? 'white' : 'var(--text-tertiary)',
                  transition: 'all 0.15s ease',
                }}
              >
                All
              </button>
              <button
                onClick={() => setFilter('unread')}
                style={{
                  padding: '4px 12px',
                  borderRadius: 12,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: filter === 'unread' ? 'var(--accent, #6366F1)' : 'transparent',
                  color: filter === 'unread' ? 'white' : 'var(--text-tertiary)',
                  transition: 'all 0.15s ease',
                }}
              >
                Unread {unreadTotal > 0 ? `(${unreadTotal})` : ''}
              </button>
            </div>

            {/* List */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              maxHeight: 420,
              padding: '8px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}>
              {isLoading ? (
                <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
                  Loading notifications…
                </div>
              ) : notifications.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%',
                    background: 'rgba(99, 102, 241, 0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 12px',
                  }}>
                    <Bell size={24} color="var(--accent)" />
                  </div>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem', marginBottom: 4 }}>
                    {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', lineHeight: 1.4 }}>
                    When colleagues give you kudos or send updates, they will appear here.
                  </div>
                </div>
              ) : (
                notifications.map((n) => {
                  const conf = NOTIF_ICONS[n.type] || NOTIF_ICONS.SYSTEM
                  const IconComp = conf.icon
                  const isKudos = n.type === 'RECOGNITION_RECEIVED'

                  return (
                    <div
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      style={{
                        padding: '12px',
                        borderRadius: 14,
                        background: !n.is_read
                          ? isKudos
                            ? 'linear-gradient(135deg, rgba(236, 72, 153, 0.12), rgba(139, 92, 246, 0.12))'
                            : 'var(--neu-bg, rgba(255,255,255,0.04))'
                          : 'transparent',
                        border: !n.is_read ? '1px solid rgba(236, 72, 153, 0.3)' : '1px solid rgba(255,255,255,0.03)',
                        display: 'flex',
                        gap: 12,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {/* Icon */}
                      <div style={{
                        width: 38, height: 38, borderRadius: 12,
                        background: conf.bg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <IconComp size={18} color={conf.color} />
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          gap: 6, marginBottom: 2,
                        }}>
                          <div style={{
                            fontWeight: n.is_read ? 600 : 700,
                            fontSize: '0.85rem',
                            color: isKudos ? '#F472B6' : 'var(--text-primary)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {n.title}
                          </div>
                          {!n.is_read && (
                            <span style={{
                              width: 7, height: 7, borderRadius: '50%',
                              background: '#EC4899', flexShrink: 0,
                            }} />
                          )}
                        </div>

                        {n.body && (
                          <div style={{
                            fontSize: '0.78rem',
                            color: 'var(--text-secondary)',
                            lineHeight: 1.4,
                            marginBottom: 4,
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                          }}>
                            {n.body}
                          </div>
                        )}

                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          marginTop: 4,
                        }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                            {formatDistanceToNow(parseISO(n.created_at), { addSuffix: true })}
                          </span>
                          {isKudos && (
                            <span style={{
                              fontSize: '0.7rem', color: '#EC4899', fontWeight: 700,
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                            }}>
                              View Kudos <ArrowRight size={10} />
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '12px 16px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'var(--neu-bg, #14182b)',
              textAlign: 'center',
            }}>
              <Link
                href="/notifications"
                onClick={onClose}
                style={{
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: 'var(--accent, #6366F1)',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                Open Full Notifications Page <ExternalLink size={12} />
              </Link>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
