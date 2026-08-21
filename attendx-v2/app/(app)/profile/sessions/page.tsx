'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Laptop, Smartphone, Shield, LogOut, Globe, Clock, CheckCircle2, AlertTriangle, Monitor } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useToast } from '@/components/ui/Toast'
import { EmptyState } from '@/components/ui/EmptyState'
import { STAGGER_CONTAINER, STAGGER_ITEM } from '@/components/ui/MotionConfig'
import type { ActiveSession } from '@/types/database'

export default function ActiveSessionsPage() {
  const { success, error: toastError } = useToast()
  const qc = useQueryClient()

  const { data: sessions, isLoading } = useQuery<ActiveSession[]>({
    queryKey: ['active-sessions'],
    queryFn: async () => {
      const res = await fetch('/api/sessions')
      if (!res.ok) throw new Error('Failed to load active sessions')
      const json = await res.json()
      return json.sessions as ActiveSession[]
    },
  })

  // Revoke single session
  const revokeSingleMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await fetch('/api/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to revoke session')
      }
      return sessionId
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['active-sessions'] })
      success('Session revoked successfully.')
    },
    onError: (err: any) => {
      toastError('Revocation failed', err.message)
    },
  })

  // Revoke all other sessions
  const revokeOthersMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/sessions/revoke-others', {
        method: 'POST',
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to revoke other sessions')
      }
      return res.json()
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['active-sessions'] })
      success(data.message || 'All other sessions have been revoked.')
    },
    onError: (err: any) => {
      toastError('Revocation failed', err.message)
    },
  })

  const otherSessionsCount = (sessions || []).filter(s => !s.is_current).length

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '1.5rem 1rem' }}>
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Active Devices & Sessions
          </h1>
          <p className="page-subtitle" style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Monitor active sign-ins and immediately terminate unauthorized access.
          </p>
        </div>

        {otherSessionsCount > 0 && (
          <button
            onClick={() => revokeOthersMutation.mutate()}
            disabled={revokeOthersMutation.isPending}
            className="btn btn-secondary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', border: '1px solid var(--border-color)', padding: '0.5rem 1rem', borderRadius: '0.75rem', fontSize: '0.8125rem' }}
          >
            <LogOut size={14} className="text-amber-500" />
            <span>Revoke Other Devices ({otherSessionsCount})</span>
          </button>
        )}
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="neu-card skeleton" style={{ height: 90, borderRadius: 16 }} />
          ))}
        </div>
      ) : !sessions || sessions.length === 0 ? (
        <EmptyState
          variant="generic"
          title="Current Session Active"
          body="Your current browser session is active and protected by end-to-end encryption."
        />
      ) : (
        <motion.div variants={STAGGER_CONTAINER} initial="hidden" animate="visible" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {sessions.map((s) => {
            const isMobile = s.user_agent?.toLowerCase().includes('mobile') || s.user_agent?.toLowerCase().includes('iphone') || s.user_agent?.toLowerCase().includes('android')
            const Icon = isMobile ? Smartphone : (s.os?.includes('mac') || s.os?.includes('Windows') ? Laptop : Monitor)

            return (
              <motion.div
                key={s.id}
                variants={STAGGER_ITEM}
                className="neu-card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--space-4)',
                  padding: '1rem 1.25rem',
                  borderRadius: 16,
                  border: s.is_current ? '1.5px solid var(--accent, #10b981)' : '1px solid var(--border-color, #334155)',
                  background: s.is_current ? 'rgba(16, 185, 129, 0.04)' : 'inherit',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: s.is_current ? 'rgba(16, 185, 129, 0.15)' : 'var(--accent-light, rgba(99, 102, 241, 0.1))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Icon size={20} color={s.is_current ? 'var(--accent, #10b981)' : '#6366f1'} />
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9375rem' }}>
                        {s.device_name || (isMobile ? 'Mobile Browser' : 'Desktop Browser')}
                      </span>
                      {s.is_current && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          fontSize: '0.6875rem', fontWeight: 600, padding: '2px 8px', borderRadius: 9999,
                          background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)',
                        }}>
                          <CheckCircle2 size={10} />
                          Current Device
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary, #94a3b8)', display: 'flex', alignItems: 'center', gap: 8, marginTop: '0.25rem', flexWrap: 'wrap' }}>
                      <span>{s.browser || 'Browser'} on {s.os || 'OS'}</span>
                      <span>•</span>
                      <span><Globe size={12} style={{ display: 'inline', marginRight: 4 }} />{s.ip_address || 'Current IP'}{s.city ? ` (${s.city})` : ''}</span>
                      <span>•</span>
                      <span><Clock size={12} style={{ display: 'inline', marginRight: 4 }} />Last active: {s.last_active ? format(parseISO(s.last_active), 'MMM d, HH:mm') : 'Now'}</span>
                    </div>
                  </div>
                </div>

                {!s.is_current && (
                  <motion.button
                    whileTap={{ scale: 0.94 }}
                    onClick={() => revokeSingleMutation.mutate(s.id)}
                    disabled={revokeSingleMutation.isPending}
                    className="btn btn-danger btn-sm"
                    style={{ flexShrink: 0, padding: '0.4rem 0.85rem', borderRadius: 10, fontSize: '0.75rem' }}
                    id={`btn-revoke-session-${s.id}`}
                  >
                    {revokeSingleMutation.isPending ? 'Revoking...' : 'Revoke'}
                  </motion.button>
                )}
              </motion.div>
            )
          })}
        </motion.div>
      )}
    </div>
  )
}
