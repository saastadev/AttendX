'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, Lock, Eye, EyeOff, LogIn, AlertCircle, CheckCircle } from 'lucide-react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { SPRING_GENTLE, SPRING_BOUNCY, SPRING_STIFF, STAGGER_CONTAINER, STAGGER_ITEM } from '@/components/ui/MotionConfig'

/* ---- CSS 3D Animated Hero ---- */
function AuthHero() {
  return (
    <div className="auth-hero" role="complementary" aria-label="AttendX hero">
      {/* Animated gradient mesh background */}
      <div className="gradient-mesh" aria-hidden="true" />

      {/* Floating 3D card stack (pure CSS 3D) */}
      <div aria-hidden="true" style={{
        position: 'relative', width: 260, height: 280,
        perspective: 800, marginBottom: '1.5rem',
      }}>
        {/* Back card */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(255,255,255,0.12)',
          backdropFilter: 'blur(8px)',
          borderRadius: 24,
          border: '1px solid rgba(255,255,255,0.2)',
          transform: 'perspective(800px) rotateX(8deg) rotateY(-12deg) translateZ(-30px)',
          animation: 'hero-float-back 6s ease-in-out infinite',
          boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
        }}>
          <div style={{ padding: 24, opacity: 0.6 }}>
            <div style={{ height: 10, background: 'rgba(255,255,255,0.5)', borderRadius: 999, marginBottom: 12, width: '70%' }} />
            <div style={{ height: 8, background: 'rgba(255,255,255,0.35)', borderRadius: 999, marginBottom: 8, width: '85%' }} />
            <div style={{ height: 8, background: 'rgba(255,255,255,0.25)', borderRadius: 999, width: '60%' }} />
          </div>
        </div>

        {/* Front card */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(255,255,255,0.18)',
          backdropFilter: 'blur(16px)',
          borderRadius: 24,
          border: '1px solid rgba(255,255,255,0.35)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5), 0 32px 80px rgba(0,0,0,0.25)',
          transform: 'perspective(800px) rotateX(8deg) rotateY(-12deg) translateZ(20px)',
          animation: 'hero-float-front 6s ease-in-out infinite',
          overflow: 'hidden',
        }}>
          {/* Inner refraction highlight */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 1,
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
          }} />

          <div style={{ padding: 28 }}>
            {/* Avatar + name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'linear-gradient(135deg, rgba(255,255,255,0.9), rgba(255,255,255,0.5))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.125rem', fontWeight: 800, color: '#4F46E5',
              }}>A</div>
              <div>
                <div style={{ height: 12, background: 'rgba(255,255,255,0.9)', borderRadius: 999, width: 100, marginBottom: 6 }} />
                <div style={{ height: 8,  background: 'rgba(255,255,255,0.5)', borderRadius: 999, width: 70 }} />
              </div>
            </div>

            {/* Status rows */}
            {[
              { label: 'Clock In', color: '#10B981', pct: '100%' },
              { label: 'Leave',    color: '#F59E0B', pct: '60%' },
              { label: 'Goals',    color: 'rgba(255,255,255,0.7)', pct: '80%' },
            ].map(row => (
              <div key={row.label} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ height: 8, background: 'rgba(255,255,255,0.7)', borderRadius: 999, width: 60 }} />
                  <div style={{ height: 8, background: 'rgba(255,255,255,0.4)', borderRadius: 999, width: 30 }} />
                </div>
                <div style={{ height: 5, background: 'rgba(255,255,255,0.15)', borderRadius: 999 }}>
                  <div style={{ height: '100%', borderRadius: 999, width: row.pct, background: row.color, transition: 'width 1s ease' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hero text */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <h2 className="auth-hero-title">Your Workforce,<br/>Intelligently Managed</h2>
        <p className="auth-hero-subtitle">
          Clock in, manage leave, track performance — all in one beautifully crafted platform.
        </p>
      </div>

      {/* Floating stat bubbles */}
      {[
        { label: '12k+ Employees', top: '18%', left: '5%',  delay: '0s' },
        { label: '99.9% Uptime',   top: '72%', right: '5%', delay: '1.4s' },
        { label: 'PWA Offline',    top: '48%', left: '0%',  delay: '0.7s' },
      ].map(b => (
        <div key={b.label} aria-hidden="true" style={{
          position: 'absolute', top: b.top, left: b.left, right: (b as any).right,
          background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.25)',
          borderRadius: 999, padding: '6px 16px',
          fontSize: '0.8125rem', fontWeight: 600, color: 'white',
          animation: `float 4s ${b.delay} ease-in-out infinite`,
          whiteSpace: 'nowrap',
        }}>
          {b.label}
        </div>
      ))}

      <style>{`
        @keyframes hero-float-front {
          0%,100% { transform: perspective(800px) rotateX(8deg) rotateY(-12deg) translateZ(20px) translateY(0); }
          50%      { transform: perspective(800px) rotateX(8deg) rotateY(-12deg) translateZ(20px) translateY(-12px); }
        }
        @keyframes hero-float-back {
          0%,100% { transform: perspective(800px) rotateX(8deg) rotateY(-12deg) translateZ(-30px) translateY(0); }
          50%      { transform: perspective(800px) rotateX(8deg) rotateY(-12deg) translateZ(-30px) translateY(-6px); }
        }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
      `}</style>
    </div>
  )
}

/* ---- Login Form ---- */
function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = getSupabaseBrowserClient()
  const next = searchParams.get('next') ?? '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})

  function validate() {
    const errs: typeof fieldErrors = {}
    if (!email.trim()) errs.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Enter a valid email'
    if (!password) errs.password = 'Password is required'
    else if (password.length < 8) errs.password = 'Password must be at least 8 characters'
    return errs
  }

  async function doSignIn(targetEmail: string, targetPw: string) {
    const cleanEmail = targetEmail.trim()
    setFieldErrors({})
    setError('')
    setLoading(true)

    const { error: authErr } = await supabase.auth.signInWithPassword({ email: cleanEmail, password: targetPw })
    setLoading(false)

    if (authErr) {
      setError(authErr.message)
      return
    }

    router.push(next)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setFieldErrors(errs); return }
    await doSignIn(email, password)
  }

  return (
    <motion.div
      className="auth-form-card"
      variants={STAGGER_CONTAINER}
      initial="hidden"
      animate="visible"
    >
      {/* Logo mark */}
      <motion.div variants={STAGGER_ITEM} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: 'linear-gradient(135deg, var(--accent), var(--brand-cyan))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'var(--elev-accent)', flexShrink: 0,
        }}>
          <svg width="24" height="24" viewBox="0 0 36 36" fill="none" aria-hidden="true">
            <rect x="6" y="4" width="24" height="28" rx="4" fill="white" fillOpacity="0.9"/>
            <rect x="10" y="10" width="10" height="2" rx="1" fill="var(--accent)"/>
            <rect x="10" y="15" width="16" height="2" rx="1" fill="var(--accent)"/>
            <rect x="10" y="20" width="12" height="2" rx="1" fill="var(--accent)"/>
          </svg>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.125rem', color: 'var(--text-primary)' }}>
            AttendX
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Workforce Platform</div>
        </div>
      </motion.div>

      <motion.h1 variants={STAGGER_ITEM} style={{ fontSize: 'var(--text-2xl)', marginBottom: 6, fontFamily: 'var(--font-display)', fontWeight: 800 }}>
        Welcome back
      </motion.h1>
      <motion.p variants={STAGGER_ITEM} style={{ color: 'var(--text-tertiary)', marginBottom: 28, fontSize: 'var(--text-sm)' }}>
        Sign in to your workspace
      </motion.p>

      <form onSubmit={handleSubmit} noValidate>
        <motion.div variants={STAGGER_ITEM} className="form-section">
          {/* Error banner */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8 }}
                transition={SPRING_GENTLE}
                role="alert"
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '12px 14px',
                  background: 'var(--danger-light)', borderRadius: 10,
                  border: '1px solid rgba(var(--danger-rgb), 0.2)',
                  borderLeft: '3px solid var(--danger)',
                }}
              >
                <AlertCircle size={18} color="var(--danger)" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
                <span style={{ fontSize: '0.875rem', color: 'var(--danger-dark)', lineHeight: 1.5 }}>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Email */}
          <div className="input-group">
            <label className="input-label" htmlFor="login-email">Work Email</label>
            <div className="input-wrap">
              <Mail size={18} className="input-icon" aria-hidden="true" />
              <input
                id="login-email"
                type="email"
                className="input has-icon-left"
                placeholder="you@company.com"
                value={email}
                onChange={e => { setEmail(e.target.value); setFieldErrors(p => ({ ...p, email: undefined })) }}
                autoComplete="email"
                aria-describedby={fieldErrors.email ? 'login-email-err' : undefined}
                aria-invalid={!!fieldErrors.email}
              />
            </div>
            <AnimatePresence>
              {fieldErrors.email && (
                <motion.p id="login-email-err" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  style={{ color: 'var(--danger)', fontSize: '0.8125rem', marginTop: 2 }}>
                  {fieldErrors.email}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* Password */}
          <div className="input-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="input-label" htmlFor="login-password">Password</label>
              <Link href="/auth/forgot-password" style={{ fontSize: '0.8125rem', color: 'var(--accent)', fontWeight: 500 }}>
                Forgot?
              </Link>
            </div>
            <div className="input-wrap">
              <Lock size={18} className="input-icon" aria-hidden="true" />
              <input
                id="login-password"
                type={showPw ? 'text' : 'password'}
                className="input has-icon-left"
                style={{ paddingRight: 44 }}
                placeholder="••••••••"
                value={password}
                onChange={e => { setPassword(e.target.value); setFieldErrors(p => ({ ...p, password: undefined })) }}
                autoComplete="current-password"
                aria-describedby={fieldErrors.password ? 'login-pw-err' : undefined}
                aria-invalid={!!fieldErrors.password}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                style={{
                  position: 'absolute', right: 12, background: 'none', border: 'none',
                  cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <AnimatePresence>
              {fieldErrors.password && (
                <motion.p id="login-pw-err" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  style={{ color: 'var(--danger)', fontSize: '0.8125rem', marginTop: 2 }}>
                  {fieldErrors.password}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          <motion.button
            type="submit"
            disabled={loading}
            className={`btn btn-primary btn-block ${loading ? 'btn-loading' : ''}`}
            style={{ height: 52, fontSize: '1rem' }}
            whileTap={{ scale: 0.98 }}
            transition={SPRING_STIFF}
          >
            {!loading && <LogIn size={18} aria-hidden="true" />}
            {loading ? 'Signing in…' : 'Sign In'}
          </motion.button>

          <p style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-tertiary)' }}>
            Don&apos;t have an account?{' '}
            <Link href="/auth/signup" style={{ color: 'var(--accent)', fontWeight: 600 }}>
              Sign up
            </Link>
          </p>

          {/* Quick Demo Login Credentials */}
          <div style={{
            marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-subtle)',
          }}>
            <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Quick Demo Accounts (Password: Password123!)
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[
                { role: 'Super Admin', email: 'superadmin@acme-tech.com' },
                { role: 'Admin', email: 'admin@acme-tech.com' },
                { role: 'HR', email: 'hr@acme-tech.com' },
                { role: 'Employee', email: 'employee@acme-tech.com' },
                { role: 'Sridhar', email: 'hitlergaripellam05@gmail.com' },
              ].map(demo => (
                <button
                  key={demo.email}
                  type="button"
                  onClick={() => {
                    setEmail(demo.email)
                    setPassword('Password123!')
                    doSignIn(demo.email, 'Password123!')
                  }}
                  style={{
                    fontSize: '0.75rem',
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-card-hover)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  {demo.role}
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      </form>
    </motion.div>
  )
}

/* This wraps the part that uses useSearchParams in Suspense */
function LoginFormWithSuspense() {
  return (
    <Suspense fallback={<div className="loading-spinner" aria-label="Loading form…" />}>
      <LoginForm />
    </Suspense>
  )
}

export default function LoginPage() {
  return (
    <div className="auth-shell">
      <AuthHero />
      <div className="auth-form-panel">
        <LoginFormWithSuspense />
      </div>
    </div>
  )
}
