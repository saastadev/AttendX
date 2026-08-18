'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, Building2, Clock, CalendarDays, ShieldCheck, ArrowRight, Sparkles } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { useToast } from '@/components/ui/Toast'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { SPRING_GENTLE } from '@/components/ui/MotionConfig'

const STEPS = [
  { id: 1, title: 'Company Details', icon: Building2 },
  { id: 2, title: 'Shift & Hours', icon: Clock },
  { id: 3, title: 'Leave Types', icon: CalendarDays },
  { id: 4, title: 'Setup Complete', icon: ShieldCheck },
]

export default function OnboardingPage() {
  const router = useRouter()
  const user = useAuthStore(s => s.user)
  const { success, error: toastErr } = useToast()
  const supabase = getSupabaseBrowserClient()

  const [step, setStep] = useState(1)
  const [orgName, setOrgName] = useState(user?.tenant?.app_name || '')
  const [timezone, setTimezone] = useState('Asia/Kolkata')
  const [shiftStart, setShiftStart] = useState('09:00')
  const [shiftEnd, setShiftEnd] = useState('18:00')
  const [gracePeriod, setGracePeriod] = useState(15)
  const [loading, setLoading] = useState(false)

  async function handleFinish() {
    setLoading(true)
    try {
      if (user?.tenant?.id) {
        // Update tenant details
        await supabase.from('tenants').update({
          app_name: orgName,
          timezone: timezone,
        }).eq('id', user.tenant.id)

        // Mark onboarding complete in onboarding_state table
        await supabase.from('onboarding_state').upsert({
          tenant_id: user.tenant.id,
          user_id: user.id,
          step: 4,
          is_completed: true,
          completed_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })

        // Audit log event
        await supabase.from('audit_log').insert({
          tenant_id: user.tenant.id,
          actor_id: user.id,
          action: 'ONBOARDING_COMPLETED',
          table_name: 'onboarding_state',
        })
      }

      success('Onboarding complete! Welcome to AttendX.')
      router.push('/dashboard')
    } catch (err: any) {
      toastErr('Onboarding error', err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 680, margin: '2rem auto', padding: '0 1rem' }}>
      {/* Progress Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2.5rem', position: 'relative' }}>
        {STEPS.map((s) => {
          const Icon = s.icon
          const isActive = s.id === step
          const isDone = s.id < step
          return (
            <div key={s.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, zIndex: 1 }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: isDone ? 'var(--success)' : isActive ? 'var(--accent)' : 'var(--neu-bg-deep)',
                color: isDone || isActive ? 'white' : 'var(--text-tertiary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: isActive ? 'var(--elev-accent)' : 'var(--elev-0)',
                transition: 'all 0.3s ease',
              }}>
                {isDone ? <CheckCircle size={20} /> : <Icon size={20} />}
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: isActive ? 700 : 500, color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                {s.title}
              </span>
            </div>
          )
        })}
      </div>

      {/* Step Content */}
      <div className="neu-card" style={{ padding: '2rem' }}>
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={SPRING_GENTLE}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginBottom: 8 }}>Organization Profile</h2>
              <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>Configure your workspace name and timezone.</p>

              <div className="input-group">
                <label className="input-label">Workspace / Company Name</label>
                <input className="input" value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Acme Corp" />
              </div>

              <div className="input-group" style={{ marginTop: '1rem' }}>
                <label className="input-label">Default Timezone</label>
                <select className="input" value={timezone} onChange={e => setTimezone(e.target.value)}>
                  <option value="Asia/Kolkata">Asia/Kolkata (IST +5:30)</option>
                  <option value="America/New_York">America/New_York (EST -5:00)</option>
                  <option value="Europe/London">Europe/London (GMT +0:00)</option>
                  <option value="Asia/Singapore">Asia/Singapore (SGT +8:00)</option>
                </select>
              </div>

              <button className="btn btn-primary" style={{ marginTop: '1.5rem', width: '100%' }} onClick={() => setStep(2)}>
                Next: Shift Settings <ArrowRight size={16} />
              </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={SPRING_GENTLE}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginBottom: 8 }}>Default Shift & Grace Period</h2>
              <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>Set your standard work hours and late-check-in grace period.</p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="input-group">
                  <label className="input-label">Shift Start Time</label>
                  <input type="time" className="input" value={shiftStart} onChange={e => setShiftStart(e.target.value)} />
                </div>
                <div className="input-group">
                  <label className="input-label">Shift End Time</label>
                  <input type="time" className="input" value={shiftEnd} onChange={e => setShiftEnd(e.target.value)} />
                </div>
              </div>

              <div className="input-group" style={{ marginTop: '1rem' }}>
                <label className="input-label">Late Grace Period (Minutes)</label>
                <input type="number" className="input" value={gracePeriod} onChange={e => setGracePeriod(Number(e.target.value))} />
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                <button className="btn btn-secondary" onClick={() => setStep(1)}>Back</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setStep(3)}>Next: Leave Rules <ArrowRight size={16} /></button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={SPRING_GENTLE}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginBottom: 8 }}>Standard Leave Types</h2>
              <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>Your workspace will be pre-configured with the following annual entitlements.</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: '1.5rem' }}>
                {[
                  { name: 'Annual / Paid Leave', days: '14 Days / Year', desc: 'Standard paid annual leave' },
                  { name: 'Casual / Sick Leave', days: '7 Days / Year', desc: 'Short-term medical or personal leave' },
                  { name: 'Unpaid Leave', days: 'Unlimited', desc: 'Loss of pay leave' },
                ].map(lt => (
                  <div key={lt.name} style={{ padding: '12px 16px', background: 'var(--neu-bg-deep)', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{lt.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{lt.desc}</div>
                    </div>
                    <span className="badge badge-accent">{lt.days}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <button className="btn btn-secondary" onClick={() => setStep(2)}>Back</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setStep(4)}>Complete Setup <Sparkles size={16} /></button>
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div key="step4" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={SPRING_GENTLE} style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--success-light)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                <CheckCircle size={36} />
              </div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', marginBottom: 8 }}>Workspace Ready!</h2>
              <p style={{ color: 'var(--text-tertiary)', fontSize: '0.9375rem', marginBottom: '2rem', maxWidth: 440, margin: '0 auto 2rem' }}>
                Your organization profile, default shift schedule, and leave entitlements have been applied successfully.
              </p>

              <button className="btn btn-primary btn-block" style={{ height: 48, fontSize: '1rem' }} onClick={handleFinish} disabled={loading}>
                {loading ? 'Finalizing...' : 'Go to Dashboard'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
