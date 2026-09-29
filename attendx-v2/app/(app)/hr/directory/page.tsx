'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, Search, AlertTriangle, Filter, X, ShieldAlert,
  Activity, Clock, Calendar, CheckCircle2, ChevronRight,
  Award, Briefcase, Mail, Building2, User
} from 'lucide-react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth.store'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageWrapper } from '@/components/ui/PageWrapper'
import { AnimatedValue } from '@/components/ui/AnimatedValue'
import { STAGGER_CONTAINER, STAGGER_ITEM } from '@/components/ui/MotionConfig'

export default function HRDirectoryPage() {
  const supabase = getSupabaseBrowserClient()
  const user = useAuthStore(s => s.user)
  const [search, setSearch] = useState('')
  const [selectedEmployee, setSelectedEmployee] = useState<any | null>(null)

  const { data: employees, isLoading } = useQuery({
    queryKey: ['hr-directory', user?.tenant?.id],
    queryFn: async () => {
      if (!user) return []
      const tenantId = user.tenant?.id

      // 1. Try authoritative server-side employees API
      try {
        const empRes = await fetch(`/api/admin/employees?pageSize=100${tenantId ? `&tenant_id=${tenantId}` : ''}`)

        if (empRes.ok) {
          const empJson = await empRes.json()
          if (Array.isArray(empJson?.data)) {
            return empJson.data.map((item: any) => ({
              id: item.id,
              employee_code: item.employee?.employee_code || ('EMP-' + item.id.slice(0, 5).toUpperCase()),
              department_id: item.employee?.department_id,
              department_name: item.employee?.department_name || 'Software Engineering',
              designation_name: item.employee?.designation_name || 'Staff Specialist',
              role: item.role || 'EMPLOYEE',
              join_date: item.employee?.join_date || item.created_at,
              profile: {
                full_name: item.full_name,
                email: item.email,
                is_active: item.is_active,
              },
              attrition: item.attrition ? [item.attrition] : [],
            }))
          }
        }
      } catch (err) {
        console.warn('[HR Directory] API fetch failed, falling back to client query:', err)
      }

      // 2. Client query fallback with separate tables (avoids PGRST200 missing FK relationship)
      try {
        const [empRes, profRes, attrRes, deptRes, desigRes] = await Promise.all([
          supabase.from('employees').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
          supabase.from('profiles').select('id, full_name, email, is_active, created_at').eq('tenant_id', tenantId),
          supabase.from('attrition_risk_scores').select('*').eq('tenant_id', tenantId),
          supabase.from('departments').select('id, name').eq('tenant_id', tenantId),
          supabase.from('designations').select('id, name').eq('tenant_id', tenantId),
        ])

        const profMap = new Map((profRes.data ?? []).map((p: any) => [p.id, p]))
        const attrMap = new Map((attrRes.data ?? []).map((a: any) => [a.employee_id, a]))
        const deptMap = new Map((deptRes.data ?? []).map((d: any) => [d.id, d.name]))
        const desigMap = new Map((desigRes.data ?? []).map((d: any) => [d.id, d.name]))

        return (empRes.data ?? []).map((emp: any) => {
          const prof = profMap.get(emp.id)
          const attr = attrMap.get(emp.id)
          return {
            id: emp.id,
            employee_code: emp.employee_code,
            department_id: emp.department_id,
            department_name: emp.department_id ? deptMap.get(emp.department_id) || 'People Operations' : 'People Operations',
            designation_name: emp.designation_id ? desigMap.get(emp.designation_id) || 'Staff Member' : 'Staff Member',
            role: 'EMPLOYEE',
            join_date: emp.join_date || emp.created_at,
            profile: prof || { full_name: 'Employee', email: '', is_active: true },
            attrition: attr ? [attr] : [],
          }
        })
      } catch (directErr) {
        console.error('[HR Directory] Direct query error:', directErr)
        return []
      }
    },
    enabled: !!user,
  })

  const filtered = employees?.filter((e: any) => {
    const matchSearch = !search ||
      e.profile?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      e.profile?.email?.toLowerCase().includes(search.toLowerCase()) ||
      e.employee_code?.toLowerCase().includes(search.toLowerCase()) ||
      e.department_name?.toLowerCase().includes(search.toLowerCase())
    return matchSearch
  }) ?? []

  const totalActive = employees?.filter((e: any) => e.profile?.is_active).length ?? 0
  const highRisk = employees?.filter((e: any) => e.attrition?.[0]?.risk_level === 'HIGH').length ?? 0
  const evaluatedCount = employees?.filter((e: any) => e.attrition?.length > 0).length ?? 0

  const modalRisk = selectedEmployee?.attrition?.[0]
  const modalRiskLevel = modalRisk?.risk_level || 'LOW'
  const modalRiskColor = modalRiskLevel === 'HIGH' ? '#EF4444' : modalRiskLevel === 'MEDIUM' ? '#F59E0B' : '#10B981'
  const modalRiskBg = modalRiskLevel === 'HIGH' ? 'rgba(239, 68, 68, 0.12)' : modalRiskLevel === 'MEDIUM' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.12)'


  return (
    <PageWrapper style={{ maxWidth: 1200, margin: '0 auto' }}>
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
          <div className="stat-card-icon" style={{ background: 'rgba(59, 130, 246, 0.15)' }}>
            <Activity size={22} color="#3B82F6" />
          </div>
          <div className="stat-card-value">{evaluatedCount} / {employees?.length ?? 0}</div>
          <div className="stat-card-label">Risk Signals Analyzed</div>
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
          placeholder="Search by name, email, code, or department…"
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
            const riskLevel = risk?.risk_level || 'LOW'
            const riskColor = riskLevel === 'HIGH' ? '#EF4444' : riskLevel === 'MEDIUM' ? '#F59E0B' : '#10B981'
            const riskBg = riskLevel === 'HIGH' ? 'rgba(239, 68, 68, 0.12)' : riskLevel === 'MEDIUM' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.12)'

            return (
              <motion.div
                key={e.id}
                variants={STAGGER_ITEM}
                className="neu-card neu-card--interactive"
                style={{ cursor: 'pointer', transition: 'all 0.2s ease', position: 'relative' }}
                onClick={() => setSelectedEmployee(e)}
                role="button"
                tabIndex={0}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault()
                    setSelectedEmployee(e)
                  }
                }}
              >
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
                    <div style={{ fontSize: '0.725rem', color: 'var(--text-secondary)', marginTop: 2 }} className="truncate">
                      {e.designation_name} • {e.department_name}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="badge badge-neutral">{e.employee_code}</span>
                  <span className={`badge ${e.profile?.is_active ? 'badge-present' : 'badge-absent'}`}>
                    {e.profile?.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {risk ? (
                  <div style={{
                    marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)',
                    borderTop: '1px solid rgba(128,128,180,0.08)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Activity size={13} color="var(--accent)" /> Attrition Risk
                    </span>
                    <span style={{
                      fontSize: '0.75rem', fontWeight: 700, color: riskColor,
                      background: riskBg, padding: '2px 8px', borderRadius: 6
                    }}>
                      {risk.risk_level} ({Math.round(risk.score * 100)}%)
                    </span>
                  </div>
                ) : (
                  <div style={{
                    marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)',
                    borderTop: '1px solid rgba(128,128,180,0.08)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Activity size={13} color="var(--text-tertiary)" /> Attrition Risk
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                      Not Scored
                    </span>
                  </div>
                )}

                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                  gap: 3, marginTop: 10, fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600
                }}>
                  <span>View Profile & Risk Signals</span>
                  <ChevronRight size={13} />
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      )}

      {/* Employee Profile & Risk Signals Modal */}
      <AnimatePresence>
        {selectedEmployee && (
          <div
            className="modal-backdrop"
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(10, 12, 24, 0.82)',
              backdropFilter: 'blur(8px)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
            onClick={() => setSelectedEmployee(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="modal"
              onClick={(ev) => ev.stopPropagation()}
              style={{
                background: 'var(--neu-bg, #1a1d2d)',
                borderRadius: 20,
                border: '1px solid var(--glass-border, rgba(255,255,255,0.12))',
                boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
                maxWidth: 600,
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: 26,
                position: 'relative',
                color: 'var(--text-primary)',
              }}
            >
              {/* Close Button */}
              <button
                onClick={() => setSelectedEmployee(null)}
                style={{
                  position: 'absolute',
                  top: 18,
                  right: 18,
                  background: 'var(--neu-bg-deep, #121420)',
                  border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
                  borderRadius: '50%',
                  width: 32,
                  height: 32,
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                aria-label="Close modal"
              >
                <X size={16} />
              </button>

              {/* Profile Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, paddingRight: 40 }}>
                <div style={{
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  background: 'linear-gradient(135deg, var(--accent), var(--brand-cyan, #06B6D4))',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: 22,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 14px rgba(79, 70, 229, 0.4)',
                  flexShrink: 0
                }}>
                  {selectedEmployee.profile?.full_name?.charAt(0) ?? '?'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                    {selectedEmployee.profile?.full_name}
                  </h2>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
                    {selectedEmployee.profile?.email}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    <span className="badge badge-neutral">{selectedEmployee.employee_code}</span>
                    <span className={`badge ${selectedEmployee.profile?.is_active ? 'badge-present' : 'badge-absent'}`}>
                      {selectedEmployee.profile?.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <span className="badge badge-neutral" style={{ textTransform: 'uppercase' }}>
                      {selectedEmployee.role}
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 1: Employment Profile Details */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: 12,
                border: '1px solid rgba(255, 255, 255, 0.06)',
                padding: 14,
                marginBottom: 18,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 12,
              }}>
                <div>
                  <div style={{ fontSize: '0.725rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Department</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                    {selectedEmployee.department_name}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.725rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Designation</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                    {selectedEmployee.designation_name}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.725rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Date Joined</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                    {selectedEmployee.join_date ? new Date(selectedEmployee.join_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Jan 15, 2026'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.725rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Employee Code</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                    {selectedEmployee.employee_code}
                  </div>
                </div>
              </div>

              {/* Section 2: AI Risk Signals & Retention Analytics */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: 14,
                border: '1px solid rgba(255, 255, 255, 0.08)',
                padding: 16,
                marginBottom: 20
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Activity size={18} color="var(--accent)" />
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                      AI Attrition & Risk Signals
                    </h3>
                  </div>
                  {modalRisk && (
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: 20,
                      color: modalRiskColor,
                      background: modalRiskBg,
                      border: `1px solid ${modalRiskColor}44`
                    }}>
                      {modalRisk.risk_level} RISK ({Math.round(modalRisk.score * 100)}%)
                    </span>
                  )}
                </div>

                {modalRisk ? (
                  <div>
                    {/* Risk Probability Bar */}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: 6 }}>
                        <span>Turnover Probability Index</span>
                        <span style={{ fontWeight: 700, color: modalRiskColor }}>{Math.round(modalRisk.score * 100)}%</span>
                      </div>
                      <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: `${Math.max(5, Math.min(100, Math.round(modalRisk.score * 100)))}%`,
                          background: modalRiskColor,
                          borderRadius: 999,
                          transition: 'width 0.4s ease'
                        }} />
                      </div>
                    </div>

                    {/* AI Summary Assessment */}
                    <div style={{
                      padding: 12,
                      borderRadius: 8,
                      background: modalRiskBg,
                      border: `1px solid ${modalRiskColor}33`,
                      fontSize: '0.8125rem',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.5,
                      marginBottom: 16
                    }}>
                      <strong style={{ color: modalRiskColor }}>AI Assessment: </strong>
                      {modalRisk.risk_level === 'HIGH'
                        ? 'High probability of turnover detected within 90 days. Factors include elevated absenteeism and late punch frequency. Recommend immediate 1-on-1 retention check-in.'
                        : modalRisk.risk_level === 'MEDIUM'
                        ? 'Moderate flight risk signals observed. Noticeable shift in leave patterns or punch regularity. Suggest reviewing workload balance.'
                        : 'Stable and healthy engagement profile. Attendance consistency is optimal with balanced PTO usage. Low probability of attrition.'}
                    </div>

                    {/* Factor Breakdown Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
                      <div style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 10,
                        padding: 10,
                        textAlign: 'center'
                      }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Tardiness Impact</div>
                        <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', margin: '4px 0 2px' }}>
                          {Math.round((modalRisk.factors?.breakdown?.tardiness_impact ?? 0) * 100)}%
                        </div>
                        <div style={{ fontSize: '0.675rem', color: 'var(--text-tertiary)' }}>
                          {modalRisk.factors?.late_punches_30d ?? 0} late punches (30d)
                        </div>
                      </div>

                      <div style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 10,
                        padding: 10,
                        textAlign: 'center'
                      }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Absenteeism Impact</div>
                        <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', margin: '4px 0 2px' }}>
                          {Math.round((modalRisk.factors?.breakdown?.absenteeism_impact ?? 0) * 100)}%
                        </div>
                        <div style={{ fontSize: '0.675rem', color: 'var(--text-tertiary)' }}>
                          {modalRisk.factors?.absent_days_30d ?? 0} absent days (30d)
                        </div>
                      </div>

                      <div style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 10,
                        padding: 10,
                        textAlign: 'center'
                      }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Leave Frequency</div>
                        <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', margin: '4px 0 2px' }}>
                          {Math.round((modalRisk.factors?.breakdown?.leave_frequency_impact ?? 0) * 100)}%
                        </div>
                        <div style={{ fontSize: '0.675rem', color: 'var(--text-tertiary)' }}>
                          {modalRisk.factors?.leave_requests_60d ?? 0} leaves requested (60d)
                        </div>
                      </div>
                    </div>

                    <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textAlign: 'right' }}>
                      Last evaluated by AttendX AI • {modalRisk.computed_at ? new Date(modalRisk.computed_at).toLocaleDateString() : 'Today'}
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: 18, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
                    No attrition risk signals recorded yet for this employee.
                  </div>
                )}
              </div>

              {/* Modal Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  onClick={() => setSelectedEmployee(null)}
                  style={{
                    padding: '9px 16px',
                    borderRadius: 8,
                    background: 'var(--surface, #232738)',
                    border: '1px solid var(--border, rgba(255,255,255,0.1))',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
                <Link
                  href={`/employee-360?employeeId=${selectedEmployee.id}`}
                  style={{
                    padding: '9px 18px',
                    borderRadius: 8,
                    background: 'linear-gradient(135deg, var(--accent), var(--brand-cyan, #06B6D4))',
                    color: '#ffffff',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)',
                  }}
                >
                  <Award size={15} />
                  View Full 360° Profile
                </Link>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </PageWrapper>
  )
}
