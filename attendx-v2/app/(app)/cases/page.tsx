'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MessageSquare, Plus, Search, AlertCircle, Clock, CheckCircle, ChevronRight } from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth.store'
import { useToast } from '@/components/ui/Toast'
import { PageWrapper } from '@/components/ui/PageWrapper'
import { EmptyState } from '@/components/ui/EmptyState'

const PRIORITY_BADGE: Record<string, string> = {
  LOW: 'badge-neutral', MEDIUM: 'badge-pending', HIGH: 'badge-rejected', URGENT: 'badge-absent',
}
const STATUS_BADGE: Record<string, string> = {
  OPEN: 'badge-accent', IN_PROGRESS: 'badge-pending', RESOLVED: 'badge-approved', CLOSED: 'badge-neutral',
}

export default function CasesPage() {
  const supabase = getSupabaseBrowserClient()
  const user = useAuthStore(s => s.user)
  const { success, error } = useToast()
  const qc = useQueryClient()
  const router = useRouter()

  const [showCreate, setShowCreate] = useState(false)
  const [newSubject, setNewSubject] = useState('')
  const [newBody, setNewBody] = useState('')
  const [newPriority, setNewPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>('MEDIUM')

  const { data: cases, isLoading } = useQuery({
    queryKey: ['my-cases', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data } = await supabase
        .from('cases')
        .select('*, reporter:profiles!reporter_id(full_name), assignee:profiles!assignee_id(full_name)')
        .eq('tenant_id', user.tenant.id)
        .or(`reporter_id.eq.${user.id},assignee_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
      return data ?? []
    },
    enabled: !!user,
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated')
      if (!newSubject.trim()) throw new Error('Subject is required')
      if (!newBody.trim()) throw new Error('Description is required')

      const { error: err } = await supabase.from('cases').insert({
        tenant_id: user.tenant.id,
        reporter_id: user.id,
        subject: newSubject,
        description: newBody,
        priority: newPriority,
        status: 'OPEN',
      })
      if (err) throw err
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-cases'] })
      success('Case created successfully!')
      setShowCreate(false)
      setNewSubject('')
      setNewBody('')
      setNewPriority('MEDIUM')
    },
    onError: (err: any) => error('Failed to create case', err.message),
  })

  const openCount = cases?.filter((c: any) => c.status === 'OPEN' || c.status === 'IN_PROGRESS').length ?? 0

  return (
    <PageWrapper style={{ maxWidth: 960, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Support Cases</h1>
          <p className="page-subtitle">Raise HR and IT support tickets. {openCount > 0 ? `${openCount} open case${openCount > 1 ? 's' : ''}.` : 'All cases resolved.'}</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn btn-primary" id="btn-new-case">
          <Plus size={18} /> New Case
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {isLoading ? (
          [1, 2, 3].map(i => <div key={i} className="card skeleton" style={{ height: 96 }} />)
        ) : cases?.length === 0 ? (
          <EmptyState
            variant="cases"
            title="No support cases found"
            body="Submit a case to get help from HR or IT support."
            action={
              <button onClick={() => setShowCreate(true)} className="btn btn-primary" style={{ marginTop: 12 }}>
                Create New Case
              </button>
            }
          />
        ) : (
          cases?.map((c: any) => (
            <div
              key={c.id}
              className="card card-hover"
              style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)', cursor: 'pointer' }}
              onClick={() => router.push(`/cases/${c.id}`)}
              role="button"
            >
              <div style={{
                width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                background: c.status === 'OPEN' ? 'var(--accent-light)' : c.status === 'RESOLVED' ? 'var(--success-light)' : 'var(--neu-bg-deep)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {c.status === 'RESOLVED' || c.status === 'CLOSED'
                  ? <CheckCircle size={18} color="var(--success)" />
                  : c.status === 'IN_PROGRESS'
                  ? <Clock size={18} color="var(--warning)" />
                  : <AlertCircle size={18} color="var(--accent)" />}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 6 }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9375rem' }}>{c.subject}</div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <span className={`badge ${PRIORITY_BADGE[c.priority] ?? 'badge-neutral'}`}>{c.priority}</span>
                    <span className={`badge ${STATUS_BADGE[c.status] ?? 'badge-neutral'}`}>{c.status.replace('_', ' ')}</span>
                  </div>
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.description}
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-4)', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                  <span>Reported by {c.reporter?.full_name ?? 'you'}</span>
                  {c.assignee && <span>· Assigned to {c.assignee.full_name}</span>}
                  <span>· {formatDistanceToNow(parseISO(c.created_at), { addSuffix: true })}</span>
                </div>
              </div>

              <ChevronRight size={18} color="var(--text-tertiary)" style={{ flexShrink: 0, marginTop: 4 }} />
            </div>
          ))
        )}
      </div>

      {/* Create Case Modal */}
      {showCreate && (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h2 className="modal-title">New Support Case</h2>
              <button className="modal-close" onClick={() => setShowCreate(false)}>×</button>
            </div>

            <div className="form-section">
              <div className="input-group">
                <label className="input-label input-label-required">Subject</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Brief description of your issue…"
                  value={newSubject}
                  onChange={e => setNewSubject(e.target.value)}
                />
              </div>

              <div className="input-group">
                <label className="input-label input-label-required">Priority</label>
                <select
                  className="input select"
                  value={newPriority}
                  onChange={e => setNewPriority(e.target.value as any)}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>

              <div className="input-group">
                <label className="input-label input-label-required">Description</label>
                <textarea
                  className="input textarea"
                  placeholder="Describe the issue in detail…"
                  value={newBody}
                  onChange={e => setNewBody(e.target.value)}
                  rows={5}
                />
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button
                  className={`btn btn-primary ${createMutation.isPending ? 'btn-loading' : ''}`}
                  style={{ flex: 1 }}
                  onClick={() => createMutation.mutate()}
                  disabled={createMutation.isPending}
                  id="btn-submit-case"
                >
                  <MessageSquare size={18} /> {createMutation.isPending ? 'Creating…' : 'Submit Case'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  )
}
