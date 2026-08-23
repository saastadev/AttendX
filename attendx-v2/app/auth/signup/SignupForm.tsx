'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, Eye, EyeOff, User, Building2, UserPlus, AlertCircle, CheckCircle, ShieldAlert, Mail } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { SPRING_GENTLE, SPRING_STIFF, STAGGER_CONTAINER, STAGGER_ITEM } from '@/components/ui/MotionConfig'

const inviteSignupSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})

type InviteSignupFormData = z.infer<typeof inviteSignupSchema>

interface InviteData {
  valid: boolean
  email: string
  tenant_name: string
  role: string
  accent_color?: string
}

export default function SignupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [verifying, setVerifying] = useState(true)
  const [inviteData, setInviteData] = useState<InviteData | null>(null)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)
  const [resolvedToken, setResolvedToken] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<InviteSignupFormData>({
    resolver: zodResolver(inviteSignupSchema),
  })

  // Verify invitation token on mount
  useEffect(() => {
    let raw = ''
    if (typeof window !== 'undefined') {
      raw = new URLSearchParams(window.location.search).get('token') || ''
    }
    if (!raw && searchParams) {
      raw = searchParams.get('token') || ''
    }

    const cleanToken = raw ? raw.replace(/[\s\r\n]+/g, '').trim() : null
    setResolvedToken(cleanToken)

    if (!cleanToken) {
      setVerifying(false)
      return
    }

    async function checkToken(t: string) {
      try {
        const res = await fetch(`/api/auth/invite/verify?token=${encodeURIComponent(t)}`)
        const data = await res.json()
        setVerifying(false)

        if (!res.ok || !data.valid) {
          setVerifyError(data.error || 'Invitation is invalid, expired, or has already been used.')
          return
        }

        setInviteData(data)
      } catch (err) {
        setVerifying(false)
        setVerifyError('Failed to verify invitation. Please check your internet connection.')
      }
    }

    checkToken(cleanToken)
  }, [searchParams])

  const onSubmit = async (data: InviteSignupFormData) => {
    if (!resolvedToken) return
    setSubmitError(null)

    try {
      const res = await fetch('/api/auth/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: resolvedToken,
          password: data.password,
          full_name: data.fullName,
        }),
      })

      const result = await res.json()
      if (!res.ok || !result.success) {
        setSubmitError(result.error || 'Failed to complete registration.')
        return
      }

      setIsSuccess(true)
    } catch (err: any) {
      setSubmitError('Unable to reach server. Please try again.')
    }
  }

  // State 1: Verifying token
  if (verifying) {
    return (
      <div className="auth-form-card" style={{ width: '100%', maxWidth: 460, textAlign: 'center', padding: '3rem 1rem' }}>
        <div className="loading-spinner" style={{ margin: '0 auto 16px' }} />
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem' }}>Verifying your secure invitation…</p>
      </div>
    )
  }

  // State 2: No token provided (Public registration blocked)
  if (!resolvedToken) {
    return (
      <motion.div
        className="auth-form-card"
        variants={STAGGER_CONTAINER}
        initial="hidden"
        animate="visible"
        style={{ width: '100%', maxWidth: 460 }}
      >
        <motion.div variants={STAGGER_ITEM} style={{ textAlign: 'center', padding: '1rem 0' }}>
          <div style={{
            width: 60, height: 60, borderRadius: '50%', background: 'var(--danger-light)',
            color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <ShieldAlert size={32} />
          </div>

          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 10, color: 'var(--text-primary)' }}>
            Invitation Required
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 28 }}>
            Public self-registration is permanently disabled. To join an organization on AttendX, you must receive a cryptographically signed invitation link from your Administrator or HR team.
          </p>

          <Link href="/auth/login" className="btn btn-primary btn-block" style={{ height: 48, fontSize: '1rem' }}>
            Go to Sign In
          </Link>
        </motion.div>
      </motion.div>
    )
  }

  // State 3: Invalid or expired token
  if (verifyError || !inviteData) {
    return (
      <motion.div
        className="auth-form-card"
        variants={STAGGER_CONTAINER}
        initial="hidden"
        animate="visible"
        style={{ width: '100%', maxWidth: 460 }}
      >
        <motion.div variants={STAGGER_ITEM} style={{ textAlign: 'center', padding: '1rem 0' }}>
          <div style={{
            width: 60, height: 60, borderRadius: '50%', background: 'var(--danger-light)',
            color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <AlertCircle size={32} />
          </div>

          <h1 style={{ fontSize: '1.375rem', fontWeight: 800, marginBottom: 10, color: 'var(--text-primary)' }}>
            Invalid Invitation
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 28 }}>
            {verifyError || 'This invitation token is invalid, expired, or has already been used.'}
          </p>

          <Link href="/auth/login" className="btn btn-primary btn-block" style={{ height: 48, fontSize: '1rem' }}>
            Return to Sign In
          </Link>
        </motion.div>
      </motion.div>
    )
  }

  // State 4: Registration successful
  if (isSuccess) {
    return (
      <motion.div
        className="auth-form-card"
        variants={STAGGER_CONTAINER}
        initial="hidden"
        animate="visible"
        style={{ width: '100%', maxWidth: 460 }}
      >
        <motion.div variants={STAGGER_ITEM} style={{ textAlign: 'center', padding: '1rem 0' }}>
          <div style={{
            width: 60, height: 60, borderRadius: '50%', background: 'var(--success-light)',
            color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <CheckCircle size={32} />
          </div>

          <h1 style={{ fontSize: '1.375rem', fontWeight: 800, marginBottom: 10, color: 'var(--text-primary)' }}>
            Account Created!
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 28 }}>
            Your account for <strong>{inviteData.tenant_name}</strong> has been successfully registered. You can now log in with your credentials.
          </p>

          <Link href="/auth/login" className="btn btn-primary btn-block" style={{ height: 48, fontSize: '1rem' }}>
            Sign In to Workspace
          </Link>
        </motion.div>
      </motion.div>
    )
  }

  // State 5: Active Registration Form with Token Verification
  return (
    <motion.div
      className="auth-form-card"
      variants={STAGGER_CONTAINER}
      initial="hidden"
      animate="visible"
      style={{ width: '100%', maxWidth: 460 }}
    >
      {/* Brand & Organization Banner */}
      <motion.div variants={STAGGER_ITEM} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: 'linear-gradient(135deg, var(--accent), var(--brand-cyan))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'var(--elev-accent)', flexShrink: 0,
        }}>
          <Building2 size={24} color="white" />
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.125rem', color: 'var(--text-primary)' }}>
            {inviteData.tenant_name}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
            Invited as <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{inviteData.role}</span>
          </div>
        </div>
      </motion.div>

      <motion.h1 variants={STAGGER_ITEM} style={{ fontSize: 'var(--text-2xl)', marginBottom: 6, fontFamily: 'var(--font-display)', fontWeight: 800 }}>
        You&apos;ve been invited to join {inviteData.tenant_name}
      </motion.h1>
      <motion.p variants={STAGGER_ITEM} style={{ color: 'var(--text-tertiary)', marginBottom: 24, fontSize: 'var(--text-sm)' }}>
        Complete your account setup to join your team.
      </motion.p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <motion.div variants={STAGGER_ITEM} className="form-section">
          {/* Submit Error */}
          <AnimatePresence>
            {submitError && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                role="alert"
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '12px 14px', background: 'var(--danger-light)',
                  borderRadius: 10, borderLeft: '3px solid var(--danger)',
                  marginBottom: 16,
                }}
              >
                <AlertCircle size={18} color="var(--danger)" style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: '0.875rem', color: 'var(--danger-dark)' }}>{submitError}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Email (Locked / Read-only) */}
          <div className="input-group">
            <label className="input-label" htmlFor="invitedEmail">Work Email</label>
            <div className="input-wrap">
              <Mail size={18} className="input-icon" aria-hidden="true" />
              <input
                id="invitedEmail"
                type="email"
                className="input has-icon-left"
                value={inviteData.email}
                disabled
                style={{ opacity: 0.7, background: 'var(--bg-card-hover)', cursor: 'not-allowed' }}
              />
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
              Email address is locked to this invitation.
            </p>
          </div>

          {/* Full Name */}
          <div className="input-group">
            <label className="input-label" htmlFor="fullName">Full Name</label>
            <div className="input-wrap">
              <User size={18} className="input-icon" aria-hidden="true" />
              <input
                id="fullName"
                type="text"
                className="input has-icon-left"
                placeholder="Sarah Connor"
                {...register('fullName')}
                aria-invalid={!!errors.fullName}
              />
            </div>
            {errors.fullName && <p style={{ color: 'var(--danger)', fontSize: '0.8125rem', marginTop: 2 }}>{errors.fullName.message}</p>}
          </div>

          {/* Password */}
          <div className="input-group">
            <label className="input-label" htmlFor="password">Set Password</label>
            <div className="input-wrap">
              <Lock size={18} className="input-icon" aria-hidden="true" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="input has-icon-left"
                style={{ paddingRight: 44 }}
                placeholder="••••••••"
                {...register('password')}
                aria-invalid={!!errors.password}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                style={{
                  position: 'absolute', right: 12, background: 'none', border: 'none',
                  cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.password && <p style={{ color: 'var(--danger)', fontSize: '0.8125rem', marginTop: 2 }}>{errors.password.message}</p>}
          </div>

          {/* Confirm Password */}
          <div className="input-group">
            <label className="input-label" htmlFor="confirmPassword">Confirm Password</label>
            <div className="input-wrap">
              <Lock size={18} className="input-icon" aria-hidden="true" />
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                className="input has-icon-left"
                style={{ paddingRight: 44 }}
                placeholder="••••••••"
                {...register('confirmPassword')}
                aria-invalid={!!errors.confirmPassword}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(v => !v)}
                style={{
                  position: 'absolute', right: 12, background: 'none', border: 'none',
                  cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.confirmPassword && <p style={{ color: 'var(--danger)', fontSize: '0.8125rem', marginTop: 2 }}>{errors.confirmPassword.message}</p>}
          </div>

          <motion.button
            type="submit"
            disabled={isSubmitting}
            className={`btn btn-primary btn-block ${isSubmitting ? 'btn-loading' : ''}`}
            style={{ height: 50, fontSize: '1rem', marginTop: 8 }}
            whileTap={{ scale: 0.98 }}
            transition={SPRING_STIFF}
          >
            {!isSubmitting && <UserPlus size={18} aria-hidden="true" />}
            {isSubmitting ? 'Creating Account…' : 'Complete Registration'}
          </motion.button>

          <p style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-tertiary)', marginTop: 16 }}>
            Already have an account?{' '}
            <Link href="/auth/login" style={{ color: 'var(--accent)', fontWeight: 600 }}>
              Sign In
            </Link>
          </p>
        </motion.div>
      </form>
    </motion.div>
  )
}
