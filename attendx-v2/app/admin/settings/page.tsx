'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Building, Palette, Sliders, Save, CheckCircle, Shield, Sparkles } from 'lucide-react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth.store'
import { useToast } from '@/components/ui/Toast'
import { PageWrapper } from '@/components/ui/PageWrapper'

export default function AdminSettingsPage() {
  const supabase = getSupabaseBrowserClient()
  const user = useAuthStore(s => s.user)
  const { success, error } = useToast()
  const queryClient = useQueryClient()

  const [appName, setAppName] = useState(user?.tenant?.app_name ?? 'AttendX')
  const [accentColor, setAccentColor] = useState(user?.tenant?.accent_color ?? '#4F46E5')
  const [logoUrl, setLogoUrl] = useState(user?.tenant?.logo_url ?? '/logo.jpg')

  const [features, setFeatures] = useState({
    copilot: user?.tenant?.features?.copilot ?? true,
    face_checkin: user?.tenant?.features?.face_checkin ?? true,
    skill_gap: user?.tenant?.features?.skill_gap ?? true,
    attrition_scoring: user?.tenant?.features?.attrition_scoring ?? true,
    recognition: user?.tenant?.features?.recognition ?? true,
    cases: user?.tenant?.features?.cases ?? true,
  })

  useEffect(() => {
    if (user?.tenant) {
      setAppName(user.tenant.app_name ?? 'AttendX')
      setAccentColor(user.tenant.accent_color ?? '#4F46E5')
      setLogoUrl(user.tenant.logo_url ?? '/logo.jpg')
      if (user.tenant.features) {
        setFeatures(user.tenant.features)
      }
    }
  }, [user])

  // Save Settings Mutation
  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      if (!user?.tenant?.id) throw new Error('No tenant found')

      const { error: err } = await supabase
        .from('tenants')
        .update({
          app_name: appName,
          accent_color: accentColor,
          logo_url: logoUrl,
          features: features,
        })
        .eq('id', user.tenant.id)

      if (err) throw err
    },
    onSuccess: () => {
      // Update DOM accent color dynamically
      document.documentElement.style.setProperty('--accent', accentColor)
      success('Organization branding updated!')
    },
    onError: (err: any) => {
      error('Failed to save settings', err.message)
    },
  })

  return (
    <PageWrapper style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Organization & Branding</h1>
          <p className="page-subtitle">Customize workspace appearance, tenant brand, and AI features</p>
        </div>
        <button
          onClick={() => saveSettingsMutation.mutate()}
          disabled={saveSettingsMutation.isPending}
          className={`btn btn-primary ${saveSettingsMutation.isPending ? 'btn-loading' : ''}`}
          id="btn-save-settings"
        >
          <Save size={18} /> {saveSettingsMutation.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        {/* Workspace Identity */}
        <div className="card">
          <h2 style={{ fontSize: '1.25rem', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Building size={20} color="var(--accent)" /> Identity & Branding
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div className="input-group">
              <label className="input-label">App Title / Workspace Name</label>
              <input
                type="text"
                className="input"
                value={appName}
                onChange={e => setAppName(e.target.value)}
                placeholder="AttendX Tech"
              />
            </div>

            <div className="input-group">
              <label className="input-label">Primary Accent Color</label>
              <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                <input
                  type="color"
                  value={accentColor}
                  onChange={e => setAccentColor(e.target.value)}
                  style={{
                    width: 48, height: 48, borderRadius: 'var(--radius-md)',
                    border: 'none', cursor: 'pointer', background: 'none'
                  }}
                />
                <input
                  type="text"
                  className="input"
                  value={accentColor}
                  onChange={e => setAccentColor(e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">Logo URL</label>
              <input
                type="text"
                className="input"
                value={logoUrl}
                onChange={e => setLogoUrl(e.target.value)}
                placeholder="/logo.jpg"
              />
            </div>
          </div>
        </div>

        {/* Feature Flags */}
        <div className="card">
          <h2 style={{ fontSize: '1.25rem', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={20} color="var(--accent)" /> Feature Modules & AI Flags
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {[
              { key: 'copilot', label: 'HR Copilot AI Agent', desc: 'Enable natural language HR queries and policy assistant' },
              { key: 'face_checkin', label: 'Selfie + Geofence Verification', desc: 'Require visual check-in with GPS location validation' },
              { key: 'attrition_scoring', label: 'AI Attrition Risk Scoring', desc: 'Predict turnover risk using work and leave patterns' },
              { key: 'skill_gap', label: 'Semantic Skill Gap Vector Search', desc: 'Match employee capabilities using pgvector' },
              { key: 'recognition', label: 'Peer Recognition & Leaderboard', desc: 'Allow employees to award recognition points and badges' },
              { key: 'cases', label: 'HR Case Management & SLAs', desc: 'Track employee grievance and inquiry cases' },
            ].map(item => (
              <div key={item.key} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: 'var(--space-4)', background: 'var(--neu-bg-deep)', borderRadius: 'var(--radius-lg)'
              }}>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.label}</div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>{item.desc}</div>
                </div>

                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={(features as any)[item.key]}
                    onChange={e => setFeatures({ ...features, [item.key]: e.target.checked })}
                  />
                  <div className="toggle-track">
                    <div className="toggle-thumb" />
                  </div>
                </label>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageWrapper>
  )
}
