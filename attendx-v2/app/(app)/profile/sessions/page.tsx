'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Laptop, Smartphone, Shield, LogOut, Globe, Clock, CheckCircle } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useToast } from '@/components/ui/Toast'
import { EmptyState } from '@/components/ui/EmptyState'
import { STAGGER_CONTAINER, STAGGER_ITEM } from '@/components/ui/MotionConfig'

export default function ActiveSessionsPage() {
  const { success, error: toastError } = useToast()
  const qc = useQueryClient()

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['active-sessions'],
    queryFn: async () => {
      const res = await fetch('/api/sessions')
      if (!res.ok) throw new Error('Failed to load active sessions')
      const json = await res.json()
      return json.sessions as any[]
    },
  })

  const revokeMutation = useMutation({
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
    onSuccess: (revokedId) => {
      qc.invalidateQueries({ queryKey: ['active-sessions'] })
      success('Session revoked successfully')
    },
    onError: (err: any) => {
      toastError('Revocation failed', err.message)
    },
  })

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Active Devices & Sessions</h1>
          <p className="page-subtitle">Manage and revoke active sessions connected to your account</p>
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {[1, 2, 3].map(i => <div key={i} className="neu-card skeleton" style={{ height: 90 }} />)}
        </div>
      ) : !sessions || sessions.length === 0 ? (
        <EmptyState
          variant="generic"
          title="Current Session Active"
          body="Your current browser session is active and secure."
        />
      ) : (
        <motion.div variants={STAGGER_CONTAINER} initial="hidden" animate="visible" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {sessions.map((s: any) => {
            const isMobile = s.user_agent?.toLowerCase().includes('mobile')
            const Icon = isMobile ? Smartphone : Laptop

            return (
              <motion.div key={s.id} variants={STAGGER_ITEM} className="neu-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: 'var(--accent-light)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Icon size={20} color="var(--accent)" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9375rem', marginBottom: 2 }}>
                      {s.device_name || (isMobile ? 'Mobile Browser' : 'Desktop Browser')}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span><Globe size={12} style={{ display: 'inline', marginRight: 4 }} />{s.ip_address || 'Current Location'}</span>
                      <span>•</span>
                      <span><Clock size={12} style={{ display: 'inline', marginRight: 4 }} />Last active: {s.last_active ? format(parseISO(s.last_active), 'MMM d, HH:mm') : 'Now'}</span>
                    </div>
                  </div>
                </div>

                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={() => revokeMutation.mutate(s.id)}
                  disabled={revokeMutation.isPending}
                  className="btn btn-danger btn-sm"
                  id={`btn-revoke-session-${s.id}`}
                >
                  <LogOut size={14} /> Revoke
                </motion.button>
              </motion.div>
            )
          })}
        </motion.div>
      )}
    </div>
  )
}
