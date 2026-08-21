'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, Lock, Eye, EyeOff, User, Building2, UserPlus, AlertCircle, CheckCircle } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/hooks/useAuth'
import { SPRING_GENTLE, SPRING_STIFF, STAGGER_CONTAINER, STAGGER_ITEM } from '@/components/ui/MotionConfig'

const signupSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Enter a valid work email address'),
  companyCode: z.string().min(3, 'Company code is required (e.g. acme)'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})

type SignupFormData = z.infer<typeof signupSchema>

/* ---- Hero Section matching login page ---- */
function SignupHero() {
  return (
    <div className="auth-hero" role="complementary" aria-label="AttendX signup hero">
      <div className="gradient-mesh" aria-hidden="true" />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <h2 className="auth-hero-title">Join Your Team<br/>on AttendX</h2>
        <p className="auth-hero-subtitle">
          Seamless workforce management, attendance tracking, and HR features in one modern app.
        </p>
      </div>
    </div>
  )
}

export default function SignupPage() {
  const router = useRouter()
  const { signUp } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
  })

  const onSubmit = async (data: SignupFormData) => {
    setServerError(null)
    const { error } = await signUp(data.email, data.password, data.fullName, data.companyCode.toLowerCase())

    if (error) {
      setServerError(error)
      return
    }

    setIsSuccess(true)
  }

  return (
    <div className="auth-shell">
      <SignupHero />

      <div className="auth-form-panel">
        <motion.div
          className="auth-form-card"
          variants={STAGGER_CONTAINER}
          initial="hidden"
          animate="visible"
          style={{ width: '100%', maxWidth: 460 }}
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
            Create an Account
          </motion.h1>
          <motion.p variants={STAGGER_ITEM} style={{ color: 'var(--text-tertiary)', marginBottom: 24, fontSize: 'var(--text-sm)' }}>
            Join your organization on AttendX
          </motion.p>

          {isSuccess ? (
            <motion.div variants={STAGGER_ITEM} style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', background: 'var(--success-light)',
                color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <CheckCircle size={32} />
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>
                Check your inbox!
              </h2>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', lineHeight: 1.6, marginBottom: 24 }}>
                We&apos;ve sent a verification link to your email. Click the link to complete registration.
              </p>
              <Link href="/auth/login" className="btn btn-primary btn-block" style={{ height: 48 }}>
                Back to Sign In
              </Link>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} noValidate>
              <motion.div variants={STAGGER_ITEM} className="form-section">
                {/* Server Error */}
                <AnimatePresence>
                  {serverError && (
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
                      <span style={{ fontSize: '0.875rem', color: 'var(--danger-dark)' }}>{serverError}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Full Name */}
                <div className="input-group">
                  <label className="input-label" htmlFor="fullName">Full Name</label>
                  <div className="input-wrap">
                    <User size={18} className="input-icon" aria-hidden="true" />
                    <input
                      id="fullName"
                      type="text"
                      className="input has-icon-left"
                      placeholder="Alex Morgan"
                      {...register('fullName')}
                      aria-invalid={!!errors.fullName}
                    />
                  </div>
                  {errors.fullName && <p style={{ color: 'var(--danger)', fontSize: '0.8125rem', marginTop: 2 }}>{errors.fullName.message}</p>}
                </div>

                {/* Company Code */}
                <div className="input-group">
                  <label className="input-label" htmlFor="companyCode">Company Code</label>
                  <div className="input-wrap">
                    <Building2 size={18} className="input-icon" aria-hidden="true" />
                    <input
                      id="companyCode"
                      type="text"
                      className="input has-icon-left"
                      placeholder="acme-tech"
                      {...register('companyCode')}
                      aria-invalid={!!errors.companyCode}
                    />
                  </div>
                  {errors.companyCode && <p style={{ color: 'var(--danger)', fontSize: '0.8125rem', marginTop: 2 }}>{errors.companyCode.message}</p>}
                </div>

                {/* Email */}
                <div className="input-group">
                  <label className="input-label" htmlFor="email">Work Email</label>
                  <div className="input-wrap">
                    <Mail size={18} className="input-icon" aria-hidden="true" />
                    <input
                      id="email"
                      type="email"
                      className="input has-icon-left"
                      placeholder="alex@company.com"
                      {...register('email')}
                      aria-invalid={!!errors.email}
                    />
                  </div>
                  {errors.email && <p style={{ color: 'var(--danger)', fontSize: '0.8125rem', marginTop: 2 }}>{errors.email.message}</p>}
                </div>

                {/* Password */}
                <div className="input-group">
                  <label className="input-label" htmlFor="password">Password</label>
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
                  {isSubmitting ? 'Registering…' : 'Register Account'}
                </motion.button>

                <p style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-tertiary)', marginTop: 16 }}>
                  Already have an account?{' '}
                  <Link href="/auth/login" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                    Sign In
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

export default function SignupPage() {
  return (
    <div className="auth-shell">
      <AuthHero />
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
        <h2 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-display)', fontWeight: 800 }}>Join AttendX</h2>
        <p style={{ fontSize: '0.8125rem', opacity: 0.85, marginTop: 4 }}>Create your workforce profile</p>
      </div>
      <div className="auth-form-panel">
        <SignupForm />
      </div>
    </div>
  )
}
