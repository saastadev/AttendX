'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, UserPlus, Shield, Search, Filter, CheckCircle,
  XCircle, Mail, MoreVertical, Building, Eye, Clock
} from 'lucide-react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth.store'
import { useToast } from '@/components/ui/Toast'
import type { Profile, UserRole, UserRoleRecord, AuditLogEntry } from '@/types/database'

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

  // Fetch users & roles for current tenant
  const { data: users, isLoading } = useQuery<UserWithRole[]>({
    queryKey: ['admin-users', user?.tenant?.id],
    queryFn: async () => {
      if (!user) return []

      const [profilesRes, rolesRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('tenant_id', user.tenant.id),
        supabase.from('user_roles').select('*').eq('tenant_id', user.tenant.id),
      ])

      if (profilesRes.error) throw profilesRes.error
      if (rolesRes.error) throw rolesRes.error

      const rolesMap = new Map<string, { role: UserRole; id: string }>()
      rolesRes.data?.forEach(r => rolesMap.set(r.user_id, { role: r.role, id: r.id }))

      return (profilesRes.data ?? []).map(p => ({
        ...p,
        role: rolesMap.get(p.id)?.role ?? 'EMPLOYEE',
        roleRecordId: rolesMap.get(p.id)?.id ?? '',
      }))
    },
    enabled: !!user,
  })

  // Fetch audit log
  const { data: auditLogs } = useQuery<AuditLogEntry[]>({
    queryKey: ['admin-audit-logs', user?.tenant?.id],
    queryFn: async () => {
      if (!user) return []
      const { data } = await supabase
        .from('audit_log')
        .select('*, actor:profiles(*)')
        .eq('tenant_id', user.tenant.id)
        .order('created_at', { ascending: false })
        .limit(10)
      return data ?? []
    },
    enabled: !!user,
  })

  // Mutation: Change User Role
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole, roleRecordId }: { userId: string; newRole: UserRole; roleRecordId: string }) => {
      if (roleRecordId) {
        const { error: err } = await supabase
          .from('user_roles')
          .update({ role: newRole })
          .eq('id', roleRecordId)
        if (err) throw err
      } else {
        const { error: err } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, tenant_id: user!.tenant.id, role: newRole })
        if (err) throw err
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      success('Role updated successfully')
    },
    onError: (err: any) => {
      error('Failed to update role', err.message)
    },
  })

  // Mutation: Toggle Active Status
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ userId, currentStatus }: { userId: string; currentStatus: boolean }) => {
      const { error: err } = await supabase
        .from('profiles')
        .update({ is_active: !currentStatus })
        .eq('id', userId)
      if (err) throw err
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      success('User status updated')
    },
    onError: (err: any) => {
      error('Failed to update status', err.message)
    },
  })

  // Filtered users
  const filteredUsers = users?.filter(u => {
    const matchesSearch = u.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          u.email.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter
    return matchesSearch && matchesRole
  })

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
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
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
                    <div className="skeleton skeleton-text" style={{ width: '40%', margin: '0 auto' }} />
                  </td>
                </tr>
              ) : filteredUsers?.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-tertiary)' }}>
                    No members found matching filter
                  </td>
                </tr>
              ) : (
                filteredUsers?.map(u => (
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
                ))
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

      {/* Modal: Invite User */}
      {showInviteModal && (
        <div className="modal-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowInviteModal(false)}>✕</button>
            <h2 className="modal-title">Invite Member</h2>
            <p className="modal-subtitle">Add a new user to your organization workspace</p>

            <form onSubmit={async (e) => {
              e.preventDefault()
              try {
                const { error: inviteErr } = await supabase.auth.signUp({
                  email: inviteEmail,
                  password: 'TempPassword123!',
                  options: {
                    data: {
                      full_name: inviteName,
                      tenant_id: user!.tenant.id,
                    },
                  },
                })
                if (inviteErr) throw inviteErr
                success('Member invited successfully!')
                setShowInviteModal(false)
                queryClient.invalidateQueries({ queryKey: ['admin-users'] })
              } catch (err: any) {
                error('Failed to invite member', err.message)
              }
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div className="input-group">
                  <label className="input-label input-label-required">Full Name</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Jordan Lee"
                    value={inviteName}
                    onChange={e => setInviteName(e.target.value)}
                    required
                  />
                </div>

                <div className="input-group">
                  <label className="input-label input-label-required">Work Email</label>
                  <input
                    type="email"
                    className="input"
                    placeholder="jordan@company.com"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="input-group">
                  <label className="input-label input-label-required">Role</label>
                  <select
                    className="input select"
                    value={inviteRole}
                    onChange={e => setInviteRole(e.target.value as UserRole)}
                  >
                    <option value="EMPLOYEE">EMPLOYEE</option>
                    <option value="MANAGER">MANAGER</option>
                    <option value="HR">HR</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                  >
                    Send Invite
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
