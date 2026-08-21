'use client'

import { useState, useEffect, useRef } from 'react'
import { Building2, Check, ChevronDown, Loader2, Shield } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import type { AvailableTenant, GetAvailableTenantsResponse, TenantSwitchResponse } from '@/types/database'

export function TenantSwitcher() {
  const [tenants, setTenants] = useState<AvailableTenant[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [switchingId, setSwitchingId] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function fetchTenants() {
      try {
        const res = await fetch('/api/auth/tenants')
        if (res.ok) {
          const data: GetAvailableTenantsResponse = await res.json()
          setTenants(data.tenants || [])
        }
      } catch {
        // Non-blocking
      }
    }
    fetchTenants()
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const currentTenant = tenants.find((t) => t.is_current) || tenants[0] || {
    tenant_id: '11111111-0000-0000-0000-000000000001',
    tenant_name: 'Acme Technologies',
    role: 'ADMIN',
  }

  async function switchTenant(tenantId: string) {
    if (tenantId === currentTenant?.tenant_id || switchingId) return
    setSwitchingId(tenantId)

    try {
      const res = await fetch('/api/auth/tenant/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_tenant_id: tenantId }),
      })

      const data: TenantSwitchResponse = await res.json()
      if (res.ok && data.success) {
        const targetTenant = tenants.find(t => t.tenant_id === tenantId)
        if (targetTenant) {
          const prevUser = useAuthStore.getState().user
          if (prevUser) {
            useAuthStore.getState().setUser({
              ...prevUser,
              role: (data.role as any) || targetTenant.role || prevUser.role,
              tenant: {
                ...prevUser.tenant,
                id: targetTenant.tenant_id,
                name: targetTenant.tenant_name,
                slug: targetTenant.tenant_slug,
              } as any,
            })
          }
        }
        window.location.href = data.redirect_url || '/admin/users'
      } else {
        setSwitchingId(null)
      }
    } catch {
      setSwitchingId(null)
    }
  }

  return (
    <div style={{ position: 'relative', width: '100%' }} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={switchingId !== null}
        aria-label="Switch organization"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '8px 12px',
          borderRadius: 'var(--radius-md, 10px)',
          background: 'var(--neu-bg-deep, #141724)',
          border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
          color: 'var(--text-primary, #fff)',
          fontSize: '0.8125rem',
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: 'var(--elev-0)',
          textAlign: 'left',
          transition: 'all 0.15s ease',
        }}
      >
        <div style={{
          width: 24, height: 24, borderRadius: 6,
          background: 'linear-gradient(135deg, var(--accent, #6366f1), var(--brand-cyan, #06b6d4))',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
        }}>
          <Building2 size={13} color="white" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '0.8125rem', fontWeight: 600,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }}>
            {currentTenant?.tenant_name || 'Organization'}
          </div>
          <div style={{
            fontSize: '0.6875rem', color: 'var(--accent, #6366f1)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }}>
            {currentTenant?.role || 'Member'}
          </div>
        </div>
        {switchingId ? (
          <Loader2 size={14} className="anim-spin" color="var(--accent, #6366f1)" />
        ) : (
          <ChevronDown size={14} color="var(--text-tertiary, #94a3b8)" />
        )}
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            width: '100%',
            minWidth: 220,
            background: 'var(--neu-bg, #1a1d2d)',
            border: '1px solid var(--glass-border, rgba(255,255,255,0.12))',
            borderRadius: 12,
            boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
            zIndex: 300,
            padding: 4,
            overflow: 'hidden',
          }}
        >
          <div style={{
            padding: '6px 10px',
            fontSize: '0.6875rem',
            fontWeight: 700,
            color: 'var(--text-tertiary, #94a3b8)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            borderBottom: '1px solid rgba(255,255,255,0.06)'
          }}>
            Switch Workspace
          </div>

          <div style={{ maxHeight: 220, overflowY: 'auto', padding: '4px 0' }}>
            {tenants.map((tenant, idx) => {
              const isSelected = tenant.tenant_id === currentTenant?.tenant_id
              const isSwitchingThis = switchingId === tenant.tenant_id

              return (
                <button
                  key={`tenant-opt-${tenant.tenant_id || idx}-${idx}`}
                  onClick={() => switchTenant(tenant.tenant_id)}
                  disabled={switchingId !== null}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: isSelected ? 'rgba(99,102,241,0.12)' : 'transparent',
                    border: 'none',
                    borderRadius: 8,
                    color: isSelected ? 'var(--text-primary, #fff)' : 'var(--text-secondary, #cbd5e1)',
                    cursor: 'pointer',
                    transition: 'background 0.1s ease',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tenant.tenant_name}
                    </div>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary, #94a3b8)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                      <Shield size={10} color="var(--success, #10b981)" />
                      {tenant.role}
                    </div>
                  </div>

                  {isSwitchingThis ? (
                    <Loader2 size={14} className="anim-spin" color="var(--accent, #6366f1)" />
                  ) : isSelected ? (
                    <Check size={14} color="var(--accent, #6366f1)" />
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
