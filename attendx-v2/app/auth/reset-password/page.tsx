'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle, ShieldCheck } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

const resetSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})

type ResetFormData = z.infer<typeof resetSchema>

export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()
  const [showPassword, setShowPassword] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetFormData>({
    resolver: zodResolver(resetSchema),
  })

  const onSubmit = async (data: ResetFormData) => {
    setServerError(null)

    if (!supabase) {
      setServerError('Authentication client is unavailable. Please check your Supabase configuration.')
      return
    }

    const { error } = await supabase.auth.updateUser({
      password: data.password,
    })

    if (error) {
      setServerError(error.message)
      return
    }

    setIsSuccess(true)
  }

  return (
    <div className="auth-page">
      <div className="auth-bg-orb auth-bg-orb-1" />
      <div className="auth-bg-orb auth-bg-orb-2" />

      <div className="auth-card">
        <div className="auth-logo-wrap">
          <div className="auth-logo-icon">
            <Image
              src="/logo.jpg"
              alt="AttendX Logo"
              width={64}
              height={64}
              style={{ borderRadius: '16px', objectFit: 'cover' }}
            />
          </div>
          <div>
            <h1 className="auth-title">Set New Password</h1>
            <p className="auth-subtitle">Create a strong password for your account</p>
          </div>
        </div>

        {isSuccess ? (
          <div className="empty-state" style={{ padding: 'var(--space-4) 0' }}>
            <div className="empty-state-icon" style={{ background: 'var(--success-light)' }}>
              <CheckCircle size={40} color="var(--success)" />
            </div>
            <h2 className="empty-state-title" style={{ color: 'var(--success)' }}>
              Password Updated!
            </h2>
            <p className="empty-state-body">
              Your password has been successfully updated. You can now log in with your new credentials.
            </p>
            <button
              onClick={() => router.push('/auth/login')}
              className="btn btn-primary btn-full"
              style={{ marginTop: 'var(--space-4)' }}
            >
              Sign In Now
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              {serverError && (
                <div className="alert alert-error" role="alert">
                  <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{serverError}</span>
                </div>
              )}

              <div className="input-group">
                <label htmlFor="password" className="input-label input-label-required">
                  New Password
                </label>
                <div className="input-wrap">
                  <Lock size={18} className="input-icon" aria-hidden="true" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    className={`input has-icon-left has-icon-right ${errors.password ? 'error' : ''}`}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="input-icon-right"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {errors.password && (
                  <span className="input-error" role="alert">
                    <AlertCircle size={14} /> {errors.password.message}
                  </span>
                )}
              </div>

              <div className="input-group">
                <label htmlFor="confirmPassword" className="input-label input-label-required">
                  Confirm New Password
                </label>
                <div className="input-wrap">
                  <Lock size={18} className="input-icon" aria-hidden="true" />
                  <input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    className={`input has-icon-left ${errors.confirmPassword ? 'error' : ''}`}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    {...register('confirmPassword')}
                  />
                </div>
                {errors.confirmPassword && (
                  <span className="input-error" role="alert">
                    <AlertCircle size={14} /> {errors.confirmPassword.message}
                  </span>
                )}
              </div>

              <button
                type="submit"
                id="update-password-submit"
                disabled={isSubmitting}
                className={`btn btn-primary btn-lg btn-full ${isSubmitting ? 'btn-loading' : ''}`}
              >
                {isSubmitting ? (
                  <>
                    <div className="btn-spinner" /> Updating password…
                  </>
                ) : (
                  <>
                    <ShieldCheck size={18} /> Update Password
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
