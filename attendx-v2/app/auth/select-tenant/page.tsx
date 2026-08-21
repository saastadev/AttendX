'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Building2, Check, ArrowRight, ShieldCheck, Loader2 } from 'lucide-react'
import type { AvailableTenant, GetAvailableTenantsResponse, TenantSwitchResponse } from '@/types/database'

export default function SelectTenantPage() {
  const router = useRouter()
  const [tenants, setTenants] = useState<AvailableTenant[]>([])
  const [loading, setLoading] = useState(true)
  const [switchingId, setSwitchingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadTenants() {
      try {
        const res = await fetch('/api/auth/tenants')
        if (!res.ok) {
          throw new Error('Failed to load available organizations.')
        }
        const data: GetAvailableTenantsResponse = await res.json()
        setTenants(data.tenants || [])
        if (!data.tenants || data.tenants.length === 0) {
          setError('No active organization memberships found for this account.')
        }
      } catch (err: any) {
        setError(err.message || 'Unable to connect to service.')
      } finally {
        setLoading(false)
      }
    }
    loadTenants()
  }, [])

  async function handleSelectTenant(tenantId: string) {
    setSwitchingId(tenantId)
    setError('')

    try {
      const res = await fetch('/api/auth/tenant/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_tenant_id: tenantId }),
      })

      const data: TenantSwitchResponse = await res.json()

      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to switch organization.')
        setSwitchingId(null)
        return
      }

      // Hard redirect to clear any in-memory state and load the new tenant context
      window.location.href = data.redirect_url || '/dashboard'
    } catch {
      setError('An unexpected error occurred while switching organizations.')
      setSwitchingId(null)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950 text-slate-100">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Select Organization</h1>
            <p className="text-sm text-slate-400">Choose a workspace to continue</p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
            <p className="text-sm">Loading verified organizations...</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tenants.map((tenant) => {
              const isSwitching = switchingId === tenant.tenant_id
              return (
                <button
                  key={tenant.tenant_id}
                  onClick={() => handleSelectTenant(tenant.tenant_id)}
                  disabled={switchingId !== null}
                  className={`w-full p-4 rounded-xl border text-left transition-all flex items-center justify-between group ${
                    tenant.is_current
                      ? 'border-indigo-500/50 bg-indigo-500/10 text-white'
                      : 'border-slate-800 bg-slate-900/50 hover:bg-slate-800 hover:border-slate-700 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300 font-bold text-xs uppercase border border-slate-700">
                      {tenant.tenant_name.slice(0, 2)}
                    </div>
                    <div>
                      <div className="font-semibold text-sm flex items-center gap-2">
                        {tenant.tenant_name}
                        {tenant.is_current && (
                          <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded font-mono">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        Role: {tenant.role}
                      </div>
                    </div>
                  </div>

                  <div>
                    {isSwitching ? (
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                    ) : tenant.is_current ? (
                      <Check className="w-4 h-4 text-indigo-400" />
                    ) : (
                      <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-slate-200 transition-colors" />
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        <div className="mt-8 pt-4 border-t border-slate-800/80 text-center">
          <p className="text-xs text-slate-500">
            AttendX Multi-Tenant Context Isolation &bull; Fail-Closed Security
          </p>
        </div>
      </motion.div>
    </div>
  )
}
