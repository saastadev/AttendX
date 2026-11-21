'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { 
  ShieldCheck, 
  Lock, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  Circle, 
  AlertCircle, 
  ArrowRight,
} from 'lucide-react'

export default function OnboardingPage() {
  const router = useRouter()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Real-time password criteria verification
  const criteria = useMemo(() => [
    { label: 'At least 10 characters', met: newPassword.length >= 10 },
    { label: 'One uppercase letter (A-Z)', met: /[A-Z]/.test(newPassword) },
    { label: 'One lowercase letter (a-z)', met: /[a-z]/.test(newPassword) },
    { label: 'One numeric digit (0-9)', met: /[0-9]/.test(newPassword) },
    { label: 'One special symbol (!@#$%...)', met: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPassword) },
  ], [newPassword])

  const allCriteriaMet = useMemo(() => criteria.every(c => c.met), [criteria])
  const passwordsMatch = useMemo(() => newPassword.length > 0 && newPassword === confirmPassword, [newPassword, confirmPassword])
  const canSubmit = allCriteriaMet && passwordsMatch && !isSubmitting

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const res = await fetch('/api/auth/first-login-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        setErrorMessage(data.error || 'Failed to update password. Please check requirements.')
        setIsSubmitting(false)
        return
      }

      setSuccessMessage('Password established successfully! Redirecting to your workspace...')
      setTimeout(() => {
        router.push(data.redirect_url || '/dashboard')
        router.refresh()
      }, 1200)
    } catch {
      setErrorMessage('Network error occurred. Please check your connection and try again.')
      setIsSubmitting(false)
    }
  }

  const field = (
    id: string,
    label: string,
    value: string,
    setValue: (v: string) => void,
    shown: boolean,
    setShown: (v: boolean) => void,
  ) => (
    <div className="input-group">
      <label className="input-label" htmlFor={id}>{label}</label>
      <div className="input-wrap">
        <Lock size={18} className="input-icon" aria-hidden="true" />
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          className="input has-icon-left"
          style={{ paddingRight: 52, height: 52 }}
          // new-password: browsers offer a fresh password instead of
          // silently filling the old one (which React wouldn't see).
          autoComplete="new-password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onInput={(e) => setValue((e.target as HTMLInputElement).value)}
          required
        />
        <button
          type="button"
          onClick={() => setShown(!shown)}
          aria-label={shown ? 'Hide password' : 'Show password'}
          style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 0, color: 'var(--text-tertiary)', cursor: 'pointer',
          }}
        >
          {shown ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--neu-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'calc(24px + env(safe-area-inset-top, 0px)) 16px 24px' }}>
      <div className="auth-form-card" style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'linear-gradient(135deg, var(--accent), var(--brand-cyan))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--elev-accent)', flexShrink: 0,
          }}>
            <ShieldCheck size={22} color="white" aria-hidden="true" />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.125rem', color: 'var(--text-primary)' }}>AttendX</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Workforce Platform</div>
          </div>
        </div>

        <p className="auth-form-eyebrow">ONE LAST STEP</p>
        <h1 className="auth-form-heading">Set your own password.</h1>
        <p className="auth-form-intro">
          You signed in with a one-time password. Choose your own to open your workspace.
        </p>

        {errorMessage && (
          <div role="alert" style={{
            display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', marginBottom: 16,
            borderRadius: 'var(--radius-md)', background: 'var(--danger-light)', border: '1px solid var(--danger)',
          }}>
            <AlertCircle size={18} color="var(--danger)" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
            <span style={{ fontSize: '0.875rem', color: 'var(--danger-dark)', lineHeight: 1.5 }}>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div role="status" style={{
            display: 'flex', gap: 10, alignItems: 'center', padding: '12px 14px', marginBottom: 16,
            borderRadius: 'var(--radius-md)', background: 'var(--success-light)', border: '1px solid var(--success)',
          }}>
            <CheckCircle2 size={18} color="var(--success)" aria-hidden="true" />
            <span style={{ fontSize: '0.875rem', color: 'var(--success-dark)', fontWeight: 600 }}>{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-section">
            {field('new-password', 'New password', newPassword, setNewPassword, showPassword, setShowPassword)}
            {field('confirm-password', 'Confirm new password', confirmPassword, setConfirmPassword, showConfirmPassword, setShowConfirmPassword)}

            <ul aria-label="Password requirements" style={{ listStyle: 'none', padding: 0, margin: '4px 0 0', display: 'grid', gap: 8 }}>
              {[...criteria, { label: 'Both passwords match', met: passwordsMatch }].map((c) => (
                <li key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', color: c.met ? 'var(--success-dark)' : 'var(--text-tertiary)' }}>
                  {c.met
                    ? <CheckCircle2 size={16} color="var(--success)" aria-hidden="true" />
                    : <Circle size={16} aria-hidden="true" />}
                  <span>{c.label}<span className="sr-only">{c.met ? ' (done)' : ' (not yet)'}</span></span>
                </li>
              ))}
            </ul>

            <button
              type="submit"
              disabled={!canSubmit}
              className={`btn btn-primary btn-block ${isSubmitting ? 'btn-loading' : ''}`}
              style={{ height: 56, fontSize: '1rem', borderRadius: 'var(--radius-lg)', marginTop: 8, gap: 8 }}
            >
              {isSubmitting ? 'Saving…' : (<>Save and continue <ArrowRight size={18} aria-hidden="true" /></>)}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
