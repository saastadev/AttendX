'use client'

import { motion } from 'framer-motion'
import { SPRING_GENTLE } from './MotionConfig'

type Variant =
  | 'leaves' | 'attendance' | 'notifications' | 'recognition'
  | 'cases' | 'performance' | 'team' | 'onboarding' | 'generic'

interface EmptyStateProps {
  variant?: Variant
  title: string
  body?: string
  action?: React.ReactNode
}

/* ---- SVG Illustrations (inline, no external fetch) ---- */
const ILLUSTRATIONS: Record<Variant, React.ReactNode> = {
  leaves: (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <circle cx="60" cy="60" r="56" fill="var(--success-light)" />
      <rect x="38" y="72" width="44" height="5" rx="2.5" fill="var(--success)" opacity="0.3" />
      <rect x="44" y="82" width="32" height="5" rx="2.5" fill="var(--success)" opacity="0.2" />
      <path d="M60 28 C60 28 40 42 40 58 C40 68.5 49.5 77 60 77 C70.5 77 80 68.5 80 58 C80 42 60 28 60 28Z"
        fill="var(--success)" opacity="0.85" />
      <path d="M60 40 C60 40 50 50 50 58 C50 64 54.5 69 60 69" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  ),
  attendance: (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <circle cx="60" cy="60" r="56" fill="var(--accent-light)" />
      <circle cx="60" cy="60" r="32" stroke="var(--accent)" strokeWidth="3" strokeDasharray="8 4" strokeLinecap="round" opacity="0.4" />
      <circle cx="60" cy="60" r="24" fill="var(--accent)" opacity="0.12" />
      <path d="M60 44 L60 62 L72 68" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="60" cy="60" r="3" fill="var(--accent)" />
    </svg>
  ),
  notifications: (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <circle cx="60" cy="60" r="56" fill="var(--warning-light)" />
      <path d="M60 32 C49 32 40 41 40 52 L40 72 L34 80 L86 80 L80 72 L80 52 C80 41 71 32 60 32Z"
        fill="var(--warning)" opacity="0.8" />
      <path d="M53 80 C53 83.3 56.1 86 60 86 C63.9 86 67 83.3 67 80" stroke="var(--warning-dark)" strokeWidth="2.5" fill="none" />
      <circle cx="78" cy="34" r="8" fill="var(--success)" />
      <path d="M74 34 L77 37 L82 31" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  recognition: (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <circle cx="60" cy="60" r="56" fill="var(--warning-light)" />
      <path d="M60 28 L66 46 L86 46 L70 58 L76 76 L60 64 L44 76 L50 58 L34 46 L54 46 Z"
        fill="var(--warning)" opacity="0.9" />
      <path d="M52 85 L68 85" stroke="var(--warning-dark)" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
      <path d="M56 85 L56 92 L64 92 L64 85" fill="var(--warning)" opacity="0.4" />
    </svg>
  ),
  cases: (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <circle cx="60" cy="60" r="56" fill="var(--info-light)" />
      <rect x="34" y="40" width="52" height="44" rx="6" fill="var(--info)" opacity="0.15" />
      <rect x="34" y="40" width="52" height="44" rx="6" stroke="var(--info)" strokeWidth="2.5" />
      <path d="M44 58 L76 58 M44 68 L68 68" stroke="var(--info)" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="46" y="33" width="8" height="14" rx="4" fill="var(--info)" />
      <rect x="66" y="33" width="8" height="14" rx="4" fill="var(--info)" />
    </svg>
  ),
  performance: (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <circle cx="60" cy="60" r="56" fill="var(--accent-light)" />
      <polyline points="36,80 52,60 64,68 80,44" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="52" cy="60" r="4" fill="var(--accent)" />
      <circle cx="64" cy="68" r="4" fill="var(--accent)" />
      <circle cx="80" cy="44" r="5" fill="var(--accent)" />
      <path d="M78 32 L92 32 L92 46" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  team: (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <circle cx="60" cy="60" r="56" fill="var(--accent-light)" />
      <circle cx="60" cy="50" r="14" fill="var(--accent)" opacity="0.8" />
      <path d="M36 88 C36 75 47 66 60 66 C73 66 84 75 84 88" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.7" />
      <circle cx="36" cy="52" r="10" fill="var(--accent)" opacity="0.45" />
      <path d="M18 82 C18 72 26 65 36 65" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.45" />
      <circle cx="84" cy="52" r="10" fill="var(--accent)" opacity="0.45" />
      <path d="M102 82 C102 72 94 65 84 65" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.45" />
    </svg>
  ),
  onboarding: (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <circle cx="60" cy="60" r="56" fill="var(--accent-light)" />
      <path d="M40 45 L60 30 L80 45 L80 80 L40 80 Z" fill="var(--accent)" opacity="0.2" stroke="var(--accent)" strokeWidth="3" strokeLinejoin="round" />
      <polyline points="50,60 58,68 72,52" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  generic: (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <circle cx="60" cy="60" r="56" fill="var(--neu-bg-deep)" />
      <rect x="38" y="36" width="44" height="52" rx="6" stroke="var(--text-muted)" strokeWidth="2.5" fill="none" strokeDasharray="6 4" />
      <path d="M48 56 L72 56 M48 66 L64 66" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
      <circle cx="60" cy="44" r="5" fill="var(--text-muted)" opacity="0.5" />
    </svg>
  ),
}

export function EmptyState({ variant = 'generic', title, body, action }: EmptyStateProps) {
  return (
    <motion.div
      className="empty-state"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={SPRING_GENTLE}
    >
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 4, ease: 'easeInOut', repeat: Infinity }}
        aria-hidden="true"
      >
        {ILLUSTRATIONS[variant]}
      </motion.div>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', color: 'var(--text-primary)' }}>
        {title}
      </h3>
      {body && (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', maxWidth: 360 }}>{body}</p>
      )}
      {action && <div>{action}</div>}
    </motion.div>
  )
}
