'use client'

import { useState } from 'react'
import { useAuthStore } from '@/store/auth.store'
import { useAuth } from '@/hooks/useAuth'
import { useTheme } from '@/hooks/useTheme'
import { useToast } from '@/components/ui/Toast'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  User, Mail, Phone, Building, Shield, Calendar,
  Sun, Moon, Eye, LogOut, CheckCircle, Save
} from 'lucide-react'
import { PageWrapper } from '@/components/ui/PageWrapper'

export default function ProfilePage() {
  const user = useAuthStore(s => s.user)
  const { signOut } = useAuth()
  const { theme, toggleTheme, toggleContrast, contrast } = useTheme()
  const { success, error } = useToast()
  const supabase = getSupabaseBrowserClient()

  const [phone, setPhone] = useState(user?.profile?.phone ?? '')
  const [isSaving, setIsSaving] = useState(false)

  const handleSavePhone = async () => {
    if (!user) return
    setIsSaving(true)
    try {
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ phone, updated_at: new Date().toISOString() })
        .eq('id', user.id)

      if (updateErr) throw updateErr
      success('Profile updated successfully!')
    } catch (err: any) {
      error('Failed to update phone number', err.message)
    } finally {
      setIsSaving(false)
    }
  }

  if (!user) return null

  return (
    <PageWrapper style={{ maxWidth: 860, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">My Profile</h1>
          <p className="page-subtitle">Manage your account information and preferences</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        {/* Profile Card Header */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
          <div className="avatar avatar-2xl">
            {user.profile.full_name.charAt(0)}
          </div>

          <div style={{ flex: 1, minWidth: 200 }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: 4 }}>{user.profile.full_name}</h2>
            <div style={{ color: 'var(--text-tertiary)', fontSize: '0.9375rem', marginBottom: 12 }}>
              {user.email}
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <span className={`badge badge-${user.role.toLowerCase()}`}>
                {user.role}
              </span>
              <span className="badge badge-approved">
                {user.tenant?.name ?? 'Organization'}
              </span>
            </div>
          </div>
        </div>

        {/* Account Details */}
        <div className="card">
          <h2 style={{ fontSize: '1.25rem', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <User size={20} color="var(--accent)" /> Personal Details
          </h2>

          <div className="form-section">
            <div className="form-row">
              <div className="input-group">
                <label className="input-label">Full Name</label>
                <div className="input-wrap">
                  <User size={18} className="input-icon" />
                  <input type="text" className="input has-icon-left" value={user.profile.full_name} disabled />
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">Work Email</label>
                <div className="input-wrap">
                  <Mail size={18} className="input-icon" />
                  <input type="email" className="input has-icon-left" value={user.email} disabled />
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="input-group">
                <label className="input-label">Phone Number</label>
                <div className="input-wrap">
                  <Phone size={18} className="input-icon" />
                  <input
                    type="tel"
                    className="input has-icon-left"
                    placeholder="+1 (555) 000-0000"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                  />
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">Organization Code</label>
                <div className="input-wrap">
                  <Building size={18} className="input-icon" />
                  <input type="text" className="input has-icon-left" value={user.tenant?.slug ?? 'acme'} disabled />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
              <button
                onClick={handleSavePhone}
                disabled={isSaving}
                className={`btn btn-primary ${isSaving ? 'btn-loading' : ''}`}
              >
                <Save size={18} /> {isSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>

        {/* Preferences */}
        <div className="card">
          <h2 style={{ fontSize: '1.25rem', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sun size={20} color="var(--accent)" /> Display & Theme Preferences
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: 'var(--space-4)', background: 'var(--neu-bg-deep)', borderRadius: 'var(--radius-lg)'
            }}>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Dark Mode Theme</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
                  Switch between Neumorphic Light and Soft Dark mode
                </div>
              </div>

              <button onClick={toggleTheme} className="btn btn-secondary btn-icon">
                {theme === 'dark' ? <Sun size={20} color="var(--warning)" /> : <Moon size={20} color="var(--accent)" />}
              </button>
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: 'var(--space-4)', background: 'var(--neu-bg-deep)', borderRadius: 'var(--radius-lg)'
            }}>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>High Contrast Mode</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
                  Increase contrast for enhanced accessibility
                </div>
              </div>

              <button onClick={toggleContrast} className="btn btn-secondary btn-sm">
                {contrast === 'high' ? 'High' : 'Normal'}
              </button>
            </div>
          </div>
        </div>

        {/* Security & Logout */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1.125rem' }}>Account Action</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)' }}>Sign out of your active session on this device</div>
            </div>

            <button onClick={signOut} className="btn btn-danger">
              <LogOut size={18} /> Sign Out
            </button>
          </div>
        </div>
      </div>
    </PageWrapper>
  )
}
