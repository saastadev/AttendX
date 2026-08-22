'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, UserPlus, Shield, Search, CheckCircle,
  Clock, KeyRound, UserCheck, UserX, Calendar, AlertCircle
} from 'lucide-react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth.store'
import { useToast } from '@/components/ui/Toast'
import { PageWrapper } from '@/components/ui/PageWrapper'
import type { Profile, UserRole, AuditLogEntry } from '@/types/database'

interface UserWithRole extends Profile {
  role: UserRole
  roleRecordId: string
  departmentName?: string
  designationName?: string
}

export default function AdminUsersPage() {
  const supabase = getSupabaseBrowserClient()
  const user = useAuthStore(s => s.user)
  const { success, error } = useToast()
  const queryClient = useQueryClient()

  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('ALL')
  const [showInviteModal, setShowInviteModal] = useState(false)

  // Invite Form State
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState<UserRole>('EMPLOYEE')

  // Extra invite state
  const [inviteResult, setInviteResult] = useState<{ employee_code: string; temp_password?: string } | null>(null)

  // Fetch users via secure server API route
  const { data: usersResponse, isLoading } = useQuery<{ data: UserWithRole[]; count: number }>({
    queryKey: ['admin-users', user?.tenant?.id],
    queryFn: async () => {
      if (!user) return { data: [], count: 0 }
      const res = await fetch('/api/admin/employees')
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    enabled: !!user,
    retry: false,
  })

  // Flatten join for display
  const users: UserWithRole[] = (usersResponse?.data ?? []).map((p: any) => ({
    ...p,
    role: p.role ?? 'EMPLOYEE',
    roleRecordId: '',
  }))

  // Fetch audit log
  const { data: auditLogs } = useQuery<AuditLogEntry[]>({
    queryKey: ['admin-audit-logs', user?.tenant?.id],
    queryFn: async () => {
      if (!user) return []
      const { data } = await supabase
        .from('audit_log')
        .select('*')
        .eq('tenant_id', user.tenant.id)
        .order('created_at', { ascending: false })
        .limit(10)
      return (data as any) ?? []
    },
    enabled: !!user,
    retry: false,
  })

  // Mutation: Change User Role — server API validates caller role from DB
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: UserRole; roleRecordId: string }) => {
      const res = await fetch('/api/admin/employees', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_user_id: userId, new_role: newRole }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(e.error)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      queryClient.invalidateQueries({ queryKey: ['admin-audit-logs'] })
      success('Role updated successfully')
    },
    onError: (err: any) => error('Failed to update role', err.message),
  })

  // Mutation: Toggle Active Status — server API validates caller role from DB
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ userId, currentStatus }: { userId: string; currentStatus: boolean }) => {
      const res = await fetch('/api/admin/employees', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_user_id: userId, is_active: !currentStatus }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(e.error)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      queryClient.invalidateQueries({ queryKey: ['admin-audit-logs'] })
      success('User status updated')
    },
    onError: (err: any) => error('Failed to update status', err.message),
  })

  // Filtered users
  const filteredUsers = users?.filter(u => {
    const matchesSearch = u.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          u.email.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter
    return matchesSearch && matchesRole
  })

  // Today at a Glance (from admin_attendance_glance RPC via server route)
  const { data: glanceData, isLoading: glanceLoading } = useQuery<Record<string, number>>({
    queryKey: ['admin-attendance-glance', user?.tenant?.id],
    queryFn: async () => {
      if (!user) return {}
      const res = await fetch('/api/admin/glance')
      if (!res.ok) return {}
      const { glance } = await res.json()
      return glance ?? {}
    },
    enabled: !!user,
    retry: false,
    refetchInterval: 30 * 1000,
  })

  return (
    <PageWrapper style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">User & Access Management</h1>
          <p className="page-subtitle">Manage workspace members, roles, and security permissions</p>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="btn btn-primary"
          id="btn-invite-user"
        >
          <UserPlus size={18} /> Invite Member
        </button>
      </div>

      {/* Today at a Glance — Attendance Overview */}
      <div className="card" style={{ marginBottom: 'var(--space-6)', padding: 'var(--space-5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-4)' }}>
          <Clock size={18} color="var(--accent)" />
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Today at a Glance</h2>
          {glanceLoading && <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginLeft: 4 }}>Loading…</span>}
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 'var(--space-3)',
        }}>
          {[
            { key: 'PRESENT',   label: 'Working Now',   color: 'var(--success)',  bg: 'var(--success-light)',  Icon: UserCheck },
            { key: 'COMPLETED', label: 'Completed',     color: 'var(--accent)',   bg: 'var(--accent-light)',   Icon: CheckCircle },
            { key: 'ON_LEAVE',  label: 'On Leave',      color: '#F59E0B',         bg: 'rgba(245,158,11,0.1)',  Icon: Calendar },
            { key: 'ABSENT',    label: 'Not Clocked In',color: 'var(--danger)',   bg: 'var(--error-light)',    Icon: UserX },
            { key: 'TOTAL',     label: 'Total Active',  color: 'var(--text-secondary)', bg: 'var(--neu-bg-deep)', Icon: Users },
          ].map(({ key, label, color, bg, Icon }) => (
            <div key={key} style={{
              background: bg, borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-3)', textAlign: 'center',
            }}>
              <Icon size={20} color={color} style={{ marginBottom: 6 }} aria-hidden="true" />
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color, lineHeight: 1 }}>
                {glanceLoading ? '—' : (glanceData?.[key] ?? 0)}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid-auto" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: 'var(--accent-light)' }}>
            <Users size={22} color="var(--accent)" />
          </div>
          <div className="stat-card-value">{users?.length ?? 0}</div>
          <div className="stat-card-label">Total Workspace Members</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: 'var(--success-light)' }}>
            <CheckCircle size={22} color="var(--success)" />
          </div>
          <div className="stat-card-value">{users?.filter(u => u.is_active).length ?? 0}</div>
          <div className="stat-card-label">Active Users</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: 'var(--info-light)' }}>
            <Shield size={22} color="var(--info)" />
          </div>
          <div className="stat-card-value">{users?.filter(u => ['ADMIN', 'HR', 'MANAGER'].includes(u.role)).length ?? 0}</div>
          <div className="stat-card-label">Admins & Managers</div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="card" style={{ marginBottom: 'var(--space-6)', padding: 'var(--space-4)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="searchbar" style={{ flex: 1 }}>
            <Search size={18} color="var(--text-tertiary)" />
            <input
              type="text"
              placeholder="Search by name or email…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              id="search-users-input"
            />
          </div>

          <div className="tabs">
            {['ALL', 'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'].map(r => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={`tab-item ${roleFilter === r ? 'active' : ''}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 'var(--space-8)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Today's Attendance</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
                    <div className="skeleton skeleton-text" style={{ width: '40%', margin: '0 auto' }} />
                  </td>
                </tr>
              ) : filteredUsers?.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-tertiary)' }}>
                    No members found matching filter
                  </td>
                </tr>
              ) : (
                filteredUsers?.map(u => {
                  const att = (glanceData as any)?.items?.find((i: any) => i.user_id === u.id)?.attendance

                  return (
                    <tr key={u.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                          <div className="avatar avatar-md">
                            {u.full_name.charAt(0)}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{u.full_name}</div>
                            <div style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <select
                          value={u.role}
                          onChange={(e) => updateRoleMutation.mutate({
                            userId: u.id,
                            newRole: e.target.value as UserRole,
                            roleRecordId: u.roleRecordId,
                          })}
                          className="input select"
                          style={{ padding: '6px 12px', fontSize: '0.8125rem', width: 'auto' }}
                        >
                          <option value="EMPLOYEE">EMPLOYEE</option>
                          <option value="MANAGER">MANAGER</option>
                          <option value="HR">HR</option>
                          <option value="ADMIN">ADMIN</option>
                          <option value="SUPERADMIN">SUPERADMIN</option>
                        </select>
                      </td>
                      {/* Today's Attendance Column */}
                      <td>
                        {att?.clock_in_at && !att?.clock_out_at ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="badge badge-present" style={{ fontSize: '0.75rem' }}>
                              🟢 Working Now
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              ({new Date(att.clock_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                            </span>
                          </div>
                        ) : att?.clock_out_at ? (
                          <span className="badge" style={{ background: 'var(--accent-light)', color: 'var(--accent)', fontSize: '0.75rem' }}>
                            ✓ Completed
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
                            ⚪ Not Clocked In
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${u.is_active ? 'badge-approved' : 'badge-rejected'}`}>
                          {u.is_active ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)' }}>
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <button
                          onClick={() => toggleActiveMutation.mutate({ userId: u.id, currentStatus: u.is_active })}
                          className={`btn btn-sm ${u.is_active ? 'btn-ghost' : 'btn-secondary'}`}
                          style={{ fontSize: '0.8125rem' }}
                        >
                          {u.is_active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit Log Stream */}
      <div className="card">
        <h2 style={{ fontSize: '1.25rem', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={20} color="var(--accent)" /> Audit Log Stream
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {auditLogs?.length === 0 ? (
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>No recent audit activity recorded</p>
          ) : (
            auditLogs?.map(log => (
              <div key={log.id} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--neu-bg-deep)',
                borderRadius: 'var(--radius-lg)',
                fontSize: '0.875rem',
              }}>
                <div>
                  <strong style={{ color: 'var(--text-primary)' }}>{log.action}</strong>
                  <span style={{ color: 'var(--text-tertiary)', marginLeft: 8 }}>
                    by {(log as any).actor?.full_name ?? 'System'}
                  </span>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  {new Date(log.created_at).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal: Provision Member — uses secure server API (no client signUp) */}
      {showInviteModal && (
        <div className="modal-overlay" onClick={() => { setShowInviteModal(false); setInviteResult(null) }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <button className="modal-close" onClick={() => { setShowInviteModal(false); setInviteResult(null) }}>✕</button>
            <h2 className="modal-title">Provision Employee</h2>
            <p className="modal-subtitle">Creates an active account — employee can log in immediately</p>

            {inviteResult ? (
              /* Success screen — show credentials to admin */ 
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
                <div style={{
                  background: 'var(--success-light)', borderRadius: 'var(--radius-lg)',
                  padding: 'var(--space-4)', border: '1px solid rgba(16,185,129,0.25)'
                }}>
                  <div style={{ fontWeight: 700, color: 'var(--success)', marginBottom: 8 }}>✅ Account provisioned!</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div><strong>Employee Code:</strong> {inviteResult.employee_code}</div>
                    {inviteResult.temp_password && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <KeyRound size={14} color="var(--warning)" />
                        <strong>Temp Password:</strong>
                        <code style={{
                          background: 'var(--neu-bg-deep)', padding: '2px 8px', borderRadius: 6,
                          fontFamily: 'monospace', fontSize: '0.85rem'
                        }}>{inviteResult.temp_password}</code>
                      </div>
                    )}
                    <div style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--warning)' }}>
                      ⚠️ Share this password securely (once). It will not be shown again.
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => { setShowInviteModal(false); setInviteResult(null); setInviteName(''); setInviteEmail(''); setInviteRole('EMPLOYEE') }}
                  className="btn btn-primary"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={async (e) => {
                e.preventDefault()
                try {
                  const res = await fetch('/api/admin/employees', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      email: inviteEmail,
                      full_name: inviteName,
                      role: inviteRole,
                    }),
                  })
                  const data = await res.json()
                  if (!res.ok) throw new Error(data.error ?? 'Failed to provision')
                  setInviteResult({ employee_code: data.employee_code, temp_password: data.temp_password })
                  queryClient.invalidateQueries({ queryKey: ['admin-users'] })
                  queryClient.invalidateQueries({ queryKey: ['admin-audit-logs'] })
                } catch (err: any) {
                  error('Failed to provision member', err.message)
                }
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
                  <div className="input-group">
                    <label className="input-label input-label-required">Full Name</label>
                    <input
                      type="text" className="input" placeholder="Jordan Lee"
                      value={inviteName} onChange={e => setInviteName(e.target.value)}
                      id="provision-full-name" required
                    />
                  </div>
                  <div className="input-group">
                    <label className="input-label input-label-required">Work Email</label>
                    <input
                      type="email" className="input" placeholder="jordan@company.com"
                      value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                      id="provision-email" required
                    />
                  </div>
                  <div className="input-group">
                    <label className="input-label input-label-required">Role</label>
                    <select
                      className="input select" value={inviteRole}
                      onChange={e => setInviteRole(e.target.value as UserRole)}
                      id="provision-role"
                    >
                      <option value="EMPLOYEE">EMPLOYEE</option>
                      <option value="MANAGER">MANAGER</option>
                      <option value="HR">HR</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                    <button type="button" onClick={() => setShowInviteModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>Cancel</button>
                    <button type="submit" className="btn btn-primary" style={{ flex: 1 }} id="provision-submit-btn">Provision Account</button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </PageWrapper>
  )
}
