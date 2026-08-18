'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Users, Search, AlertTriangle, Filter } from 'lucide-react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth.store'
import { EmptyState } from '@/components/ui/EmptyState'
import { STAGGER_CONTAINER, STAGGER_ITEM } from '@/components/ui/MotionConfig'

export default function HRDirectoryPage() {
  const supabase = getSupabaseBrowserClient()
  const user = useAuthStore(s => s.user)
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('ALL')

  const { data: employees, isLoading } = useQuery({
    queryKey: ['hr-directory', user?.tenant?.id],
    queryFn: async () => {
      if (!user) return []
      const { data } = await supabase
        .from('employees')
        .select(`
          *,
          profile:profiles(full_name, email, is_active),
          attrition:attrition_risk_scores(score, risk_level)
        `)
        .eq('tenant_id', user.tenant.id)
        .order('created_at', { ascending: false })
      return data ?? []
    },
    enabled: !!user,
  })

  const filtered = employees?.filter((e: any) => {
    const matchSearch = !search ||
      e.profile?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      e.profile?.email?.toLowerCase().includes(search.toLowerCase()) ||
      e.employee_code?.toLowerCase().includes(search.toLowerCase())
    return matchSearch
  }) ?? []

  const totalActive = employees?.filter((e: any) => e.profile?.is_active).length ?? 0
  const highRisk = employees?.filter((e: any) => e.attrition?.[0]?.risk_level === 'HIGH').length ?? 0

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Employee Directory</h1>
          <p className="page-subtitle">Search and manage all employees, view profiles and risk signals</p>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid-auto" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: 'var(--accent-light)' }}>
            <Users size={22} color="var(--accent)" />
          </div>
          <div className="stat-card-value">{totalActive}</div>
          <div className="stat-card-label">Active Employees</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: 'var(--danger-light)' }}>
            <AlertTriangle size={22} color="var(--danger)" />
          </div>
          <div className="stat-card-value">{highRisk}</div>
          <div className="stat-card-label">High Attrition Risk</div>
        </div>
      </div>

      {/* Search */}
      <div className="searchbar" style={{ maxWidth: 400, marginBottom: 'var(--space-5)' }}>
        <Search size={16} color="var(--text-tertiary)" aria-hidden="true" />
        <input
          type="search"
          placeholder="Search by name, email, or code…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search employees"
        />
      </div>

      {/* Employee Grid */}
      {isLoading ? (
        <div className="grid-auto">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="neu-card" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <div className="skeleton" style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton skeleton-text" style={{ width: '70%', marginBottom: 8 }} />
                <div className="skeleton skeleton-text" style={{ width: '50%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState variant="team" title="No employees found" body={search ? `No results for "${search}"` : 'Employee records will appear here once added to the system.'} />
      ) : (
        <motion.div
          variants={STAGGER_CONTAINER} initial="hidden" animate="visible"
          className="grid-auto"
        >
          {filtered.map((e: any) => {
            const risk = e.attrition?.[0]
            const riskColor = risk?.risk_level === 'HIGH' ? 'var(--danger)' : risk?.risk_level === 'MEDIUM' ? 'var(--warning)' : 'var(--success)'
            return (
              <motion.div key={e.id} variants={STAGGER_ITEM} className="neu-card neu-card--interactive">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                  <div className="avatar avatar-md" style={{ flexShrink: 0 }}>
                    {e.profile?.full_name?.charAt(0) ?? '?'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9375rem' }} className="truncate">
                      {e.profile?.full_name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }} className="truncate">
                      {e.profile?.email}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="badge badge-neutral">{e.employee_code}</span>
                  <span className={`badge ${e.profile?.is_active ? 'badge-present' : 'badge-absent'}`}>
                    {e.profile?.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {risk && (
                  <div style={{
                    marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)',
                    borderTop: '1px solid rgba(128,128,180,0.08)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Attrition Risk</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: riskColor }}>
                      {risk.risk_level} ({Math.round(risk.score * 100)}%)
                    </span>
                  </div>
                )}
              </motion.div>
            )
          })}
        </motion.div>
      )}
    </div>
  )
}
