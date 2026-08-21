'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log to monitoring in production — not console.error in prod
    if (process.env.NODE_ENV !== 'production') {
      console.error('[AttendX Error Boundary]', error)
    }
  }, [error])

  return (
    <html lang="en">
      <body style={{
        margin: 0, fontFamily: "'Inter', sans-serif",
        background: '#E8EBF2', minHeight: '100dvh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '2rem',
      }}>
        <div style={{
          maxWidth: 440, width: '100%',
          background: '#E8EBF2',
          borderRadius: 24,
          boxShadow: '12px 12px 30px #C2C6D6, -12px -12px 30px #FFFFFF',
          padding: '2.5rem',
          textAlign: 'center',
          animation: 'errFadeIn 0.5s cubic-bezier(0.22,1,0.36,1) both',
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20, margin: '0 auto 1.5rem',
            background: 'rgba(239,68,68,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'errPulse 2.5s ease-in-out infinite',
          }}>
            <AlertTriangle size={36} color="#DC2626" />
          </div>

          <h1 style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: '1.75rem', fontWeight: 800,
            color: '#1A1D2E', marginBottom: 12, letterSpacing: '-0.025em',
          }}>
            Something went wrong
          </h1>
          <p style={{ color: '#4A5272', lineHeight: 1.7, marginBottom: 24 }}>
            An unexpected error occurred. Your session and offline data are safe.
          </p>

          {/* Digest in dev only — never expose in production */}
          {process.env.NODE_ENV !== 'production' && error?.digest && (
            <pre style={{
              background: '#DDE0EA', borderRadius: 8, padding: '0.75rem',
              fontSize: '0.75rem', color: '#4A5272', overflow: 'auto',
              marginBottom: 24, textAlign: 'left',
            }}>
              {error.digest}
            </pre>
          )}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={reset}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                height: 44, padding: '0 20px', borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg, #4F46E5, #3730A3)',
                color: 'white', fontWeight: 600, fontSize: '0.9375rem', cursor: 'pointer',
                boxShadow: '0 4px 20px rgba(79,70,229,0.3)',
              }}
            >
              <RefreshCcw size={16} /> Try Again
            </button>
            <a
              href="/dashboard"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                height: 44, padding: '0 20px', borderRadius: 12,
                background: '#E8EBF2', color: '#1A1D2E',
                fontWeight: 600, fontSize: '0.9375rem',
                boxShadow: '4px 4px 10px #C2C6D6, -4px -4px 10px #FFFFFF',
                textDecoration: 'none',
              }}
            >
              <Home size={16} /> Dashboard
            </a>
          </div>
        </div>
        <style>{`
          @keyframes errFadeIn {
            from { opacity: 0; transform: translateY(24px) scale(0.97); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes errPulse {
            0%, 100% { transform: scale(1); }
            50%       { transform: scale(1.08); }
          }
        `}</style>
      </body>
    </html>
  )
}

