/* Global not-found page — branded 404 */
'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'

export default function NotFound() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      style={{
        minHeight: '100dvh',
        background: 'var(--neu-bg)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '2rem',
        gap: '1.5rem',
        textAlign: 'center',
      }}
    >
      {/* Subtle CSS 3D card tilt — no WebGL needed */}
      <div style={{
        width: 160, height: 160,
        background: 'var(--brand-gradient)',
        borderRadius: 32,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: 'var(--elev-accent)',
        transform: 'perspective(600px) rotateX(8deg) rotateY(-8deg)',
        animation: 'float 4s ease-in-out infinite',
        position: 'relative',
      }}>
        <svg width="72" height="72" viewBox="0 0 72 72" fill="none" aria-hidden="true">
          <text x="4" y="56" fontSize="60" fontWeight="800" fill="white" fontFamily="'Plus Jakarta Sans', sans-serif">
            4
          </text>
          <text x="43" y="56" fontSize="60" fontWeight="800" fill="rgba(255,255,255,0.45)" fontFamily="'Plus Jakarta Sans', sans-serif">
            04
          </text>
        </svg>
      </div>

      <div>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 6vw, 3.5rem)',
          fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8,
          letterSpacing: '-0.03em',
        }}>
          Page not found
        </h1>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '1.0625rem', maxWidth: 400, lineHeight: 1.7 }}>
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
          Let&apos;s get you back on track.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link href="/dashboard" className="btn btn-primary">
          Go to Dashboard
        </Link>
        <Link href="/auth/login" className="btn btn-secondary">
          Sign In
        </Link>
      </div>

      <style>{`
        @keyframes float { 0%,100%{transform:perspective(600px) rotateX(8deg) rotateY(-8deg) translateY(0)} 50%{transform:perspective(600px) rotateX(8deg) rotateY(-8deg) translateY(-10px)} }
      `}</style>
    </motion.div>
  )
}
