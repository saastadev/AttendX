'use client'

import { useState, useEffect } from 'react'
import SignupForm from './SignupForm'

export default function SignupPage() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem', background: 'var(--neu-bg)' }}>
      {mounted ? (
        <SignupForm />
      ) : (
        <div className="auth-form-card" style={{ width: '100%', maxWidth: 460, textAlign: 'center', padding: '3rem 1rem' }}>
          <div className="loading-spinner" style={{ margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem' }}>Loading secure invitation…</p>
        </div>
      )}
    </div>
  )
}
