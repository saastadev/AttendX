'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Users, Search, TrendingUp, TrendingDown, AlertTriangle, Filter } from 'lucide-react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth.store'
import { PageWrapper } from '@/components/ui/PageWrapper'
import { AnimatedValue } from '@/components/ui/AnimatedValue'

export default function HREmployeesPage() {
  const supabase = getSupabaseBrowserClient()
  const user = useAuthStore(s => s.user)
  const [search, setSearch] = useState('')

  const { data: employees, isLoading } = useQuery({
    queryKey: ['hr-employees', user?.tenant?.id],
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

  const filtered = employees?.filter((e: any) =>
    !search || e.profile?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    e.profile?.email?.toLowerCase().includes(search.toLowerCase()) ||
    e.employee_code?.toLowerCase().includes(search.toLowerCase())
  )

  const totalActive = employees?.filter((e: any) => e.profile?.is_active).length ?? 0
  const highRisk = employees?.filter((e: any) => e.attrition?.[0]?.risk_level === 'HIGH').length ?? 0

  return (
    <PageWrapper style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Employee Directory</h1>
          <p className="page-subtitle">Manage all employees, view profiles, and track attrition risk signals</p>
        </div>
      </div>

      {/* Summary */}
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
      <div className="input-wrap" style={{ maxWidth: 360, marginBottom: 'var(--space-4)' }}>
        <Search size={16} className="input-icon" />
        <input
          type="text"
          className="input has-icon-left"
          placeholder="Search by name, email, or code…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Desktop Table (>= 769px) */}
      <div className="neu-table-desktop card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Code</th>
                <th>Employment Type</th>
                <th>Status</th>
                <th>Attrition Risk</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
                    <div className="skeleton skeleton-text" style={{ width: '50%', margin: '0 auto' }} />
                  </td>
                </tr>
              ) : filtered?.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                    No employees found
                  </td>
                </tr>
              ) : (
                filtered?.map((e: any) => {
                  const risk = e.attrition?.[0]
                  const riskBadge = risk?.risk_level === 'HIGH' ? 'badge-rejected' :
                    risk?.risk_level === 'MEDIUM' ? 'badge-pending' :
                    risk?.risk_level === 'LOW' ? 'badge-approved' : 'badge-neutral'
                  return (
                    <tr key={e.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className="avatar avatar-sm">{e.profile?.full_name?.charAt(0) ?? '?'}</div>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{e.profile?.full_name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{e.profile?.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-neutral">{e.employee_code}</span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                        {e.employment_type?.replace('_', ' ')}
                      </td>
                      <td>
                        <span className={`badge ${e.profile?.is_active ? 'badge-present' : 'badge-absent'}`}>
                          {e.profile?.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        {risk ? (
                          <span className={`badge ${riskBadge}`}>
                            {risk.risk_level} ({Math.round(risk.score * 100)}%)
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-tertiary)', fontSize: '0.8125rem' }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card List (< 769px) */}
      <div className="neu-cards-mobile">
        {isLoading ? (
          <div className="neu-mobile-card" style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--text-tertiary)' }}>
            Loading employees…
          </div>
        ) : filtered?.length === 0 ? (
          <div className="neu-mobile-card" style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--text-tertiary)' }}>
            No employees found
          </div>
        ) : (
          filtered?.map((e: any) => {
            const risk = e.attrition?.[0]
            const riskBadge = risk?.risk_level === 'HIGH' ? 'badge-rejected' :
              risk?.risk_level === 'MEDIUM' ? 'badge-pending' :
              risk?.risk_level === 'LOW' ? 'badge-approved' : 'badge-neutral'

            return (
              <div key={e.id} className="neu-mobile-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="avatar avatar-sm">{e.profile?.full_name?.charAt(0) ?? '?'}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-primary)' }}>
                        {e.profile?.full_name || 'Employee'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                        {e.profile?.email}
                      </div>
                    </div>
                  </div>
                  <span className={`badge ${e.profile?.is_active ? 'badge-present' : 'badge-absent'}`}>
                    {e.profile?.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8125rem', paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                  <div>
                    <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginRight: 4 }}>Code:</span>
                    <span className="badge badge-neutral" style={{ padding: '1px 6px' }}>{e.employee_code}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginRight: 4 }}>Type:</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{e.employment_type?.replace('_', ' ')}</span>
                  </div>
                </div>

                {risk && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>Attrition Risk:</span>
                    <span className={`badge ${riskBadge}`}>
                      {risk.risk_level} ({Math.round(risk.score * 100)}%)
                    </span>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </PageWrapper>
  )
}
