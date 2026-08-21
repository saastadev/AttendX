'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ShieldOff } from 'lucide-react'
import type { Metadata } from 'next'

export default function UnauthorizedPage() {
  return (
    <motion.main
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem',
        textAlign: 'center',
        background: 'var(--neu-bg)',
      }}
    >
      <div style={{ maxWidth: '28rem' }}>
        <div style={{
          width: 72, height: 72, borderRadius: 20, margin: '0 auto 1.5rem',
          background: 'rgba(239,68,68,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ShieldOff size={34} color="#DC2626" />
        </div>

        <p style={{
          fontSize: '0.75rem',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--text-tertiary)',
          marginBottom: '0.75rem',
        }}>
          Error 403
        </p>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(1.5rem, 4vw, 2rem)',
          fontWeight: 800,
          color: 'var(--text-primary)',
          letterSpacing: '-0.025em',
          marginBottom: '0.75rem',
        }}>
          You don&apos;t have access to this area
        </h1>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1.75rem' }}>
          This section is limited to specific roles in your organization. If you
          believe you should have access, ask an administrator to review your role.
        </p>
        <Link
          href="/dashboard"
          className="btn btn-primary"
        >
          Back to Dashboard
        </Link>
      </div>
    </motion.main>
  )
}
