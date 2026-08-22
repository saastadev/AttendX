'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, ArrowLeft, Send, CheckCircle, AlertCircle } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/hooks/useAuth'
import { SPRING_GENTLE, SPRING_STIFF, STAGGER_CONTAINER, STAGGER_ITEM } from '@/components/ui/MotionConfig'

const forgotSchema = z.object({
  email: z.string().email('Enter a valid work email address'),
})

type ForgotFormData = z.infer<typeof forgotSchema>

function ForgotHero() {
  return (
    <div className="auth-hero" role="complementary" aria-label="AttendX forgot password hero">
      <div className="gradient-mesh" aria-hidden="true" />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <h2 className="auth-hero-title">Reset Your Password<br/>Securely</h2>
        <p className="auth-hero-subtitle">
          Enter your email to receive a password reset link and regain access to your account.
        </p>
      </div>
    </div>
  )
}

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [sentEmail, setSentEmail] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotFormData>({
    resolver: zodResolver(forgotSchema),
  })

  const onSubmit = async (data: ForgotFormData) => {
    setServerError(null)
    const { error } = await resetPassword(data.email)

    if (error) {
      setServerError(error)
      return
    }

    setSentEmail(data.email)
    setIsSubmitted(true)
  }

  return (
    <div className="auth-shell">
      <ForgotHero />
      <div className="auth-hero-mobile mobile-only" style={{ display: 'none' }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
          boxShadow: '0 4px 16px rgba(0,0,0,0.1)'
        }}>
          <svg width="24" height="24" viewBox="0 0 36 36" fill="none">
            <rect x="6" y="4" width="24" height="28" rx="4" fill="white" fillOpacity="0.9"/>
            <rect x="10" y="10" width="10" height="2" rx="1" fill="#4F46E5"/>
            <rect x="10" y="15" width="16" height="2" rx="1" fill="#4F46E5"/>
            <rect x="10" y="20" width="12" height="2" rx="1" fill="#4F46E5"/>
          </svg>
        </div>
        <h2 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-display)', fontWeight: 800 }}>Reset Password</h2>
        <p style={{ fontSize: '0.8125rem', opacity: 0.85, marginTop: 4 }}>AttendX Security</p>
      </div>

      <div className="auth-form-panel">
        <motion.div
          className="auth-form-card"
          variants={STAGGER_CONTAINER}
          initial="hidden"
          animate="visible"
          style={{ width: '100%', maxWidth: 440 }}
        >
          {/* Logo mark */}
          <motion.div variants={STAGGER_ITEM} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
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
            Forgot password?
          </motion.h1>
          <motion.p variants={STAGGER_ITEM} style={{ color: 'var(--text-tertiary)', marginBottom: 24, fontSize: 'var(--text-sm)' }}>
            We&apos;ll send you instructions to reset your password.
          </motion.p>

          {isSubmitted ? (
            <motion.div variants={STAGGER_ITEM} style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', background: 'var(--success-light)',
                color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <CheckCircle size={32} />
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>
                Reset link sent
              </h2>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', lineHeight: 1.6, marginBottom: 24 }}>
                We sent a password reset link to <strong>{sentEmail}</strong>.
              </p>
              <Link href="/auth/login" className="btn btn-primary btn-block" style={{ height: 48 }}>
                Back to Sign In
              </Link>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} noValidate>
              <motion.div variants={STAGGER_ITEM} className="form-section">
                {serverError && (
                  <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '12px 14px', background: 'var(--danger-light)',
                    borderRadius: 10, borderLeft: '3px solid var(--danger)',
                    marginBottom: 16,
                  }}>
                    <AlertCircle size={18} color="var(--danger)" style={{ flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: '0.875rem', color: 'var(--danger-dark)' }}>{serverError}</span>
                  </div>
                )}

                <div className="input-group">
                  <label className="input-label" htmlFor="email">Work Email</label>
                  <div className="input-wrap">
                    <Mail size={18} className="input-icon" aria-hidden="true" />
                    <input
                      id="email"
                      type="email"
                      className="input has-icon-left"
                      placeholder="you@company.com"
                      {...register('email')}
                      aria-invalid={!!errors.email}
                    />
                  </div>
                  {errors.email && <p style={{ color: 'var(--danger)', fontSize: '0.8125rem', marginTop: 2 }}>{errors.email.message}</p>}
                </div>

                <motion.button
                  type="submit"
                  disabled={isSubmitting}
                  className={`btn btn-primary btn-block ${isSubmitting ? 'btn-loading' : ''}`}
                  style={{ height: 50, fontSize: '1rem', marginTop: 8 }}
                  whileTap={{ scale: 0.98 }}
                  transition={SPRING_STIFF}
                >
                  {!isSubmitting && <Send size={18} aria-hidden="true" />}
                  {isSubmitting ? 'Sending Link…' : 'Send Reset Link'}
                </motion.button>

                <p style={{ textAlign: 'center', fontSize: '0.875rem', marginTop: 16 }}>
                  <Link href="/auth/login" style={{ color: 'var(--text-tertiary)', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
                    <ArrowLeft size={16} /> Back to Sign In
                  </Link>
                </p>
              </motion.div>
            </form>
          )}
        </motion.div>
      </div>
    </div>
  )
}
