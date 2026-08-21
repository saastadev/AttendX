'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Star, Award, Heart, Zap, Users, Crown, Trophy, Plus, Search } from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth.store'
import { useToast } from '@/components/ui/Toast'

const ICON_COMPONENT: Record<string, React.ComponentType<any>> = {
  users: Users, lightbulb: Star, heart: Heart, zap: Zap, crown: Crown,
}

export default function RecognitionPage() {
  const supabase = getSupabaseBrowserClient()
  const user = useAuthStore(s => s.user)
  const { success, error } = useToast()
  const qc = useQueryClient()

  const [showGiveModal, setShowGiveModal] = useState(false)
  const [recipientSearch, setRecipientSearch] = useState('')
  const [selectedRecipient, setSelectedRecipient] = useState<any>(null)
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [message, setMessage] = useState('')

  const effectiveTenantId =
    user?.tenant?.id ||
    (user as any)?.app_metadata?.tenant_id ||
    (user as any)?.profile?.tenant_id ||
    '11111111-0000-0000-0000-000000000001'

  // Leaderboard
  const { data: leaderboard, isLoading: lbLoading } = useQuery({
    queryKey: ['recognition-leaderboard', effectiveTenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('recognition_leaderboard')
        .select('*')
        .eq('tenant_id', effectiveTenantId)
        .order('total_points', { ascending: false })
        .limit(10)
      return data ?? []
    },
    enabled: !!effectiveTenantId,
  })

  // Recent recognition feed
  const { data: feed, isLoading: feedLoading } = useQuery({
    queryKey: ['recognition-feed', effectiveTenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('recognition_events')
        .select('*, giver:profiles!giver_id(full_name), receiver:profiles!receiver_id(full_name), category:recognition_categories(*)')
        .eq('tenant_id', effectiveTenantId)
        .order('created_at', { ascending: false })
        .limit(20)
      return data ?? []
    },
    enabled: !!effectiveTenantId,
  })

  // Categories
  const { data: categories } = useQuery({
    queryKey: ['recognition-categories', effectiveTenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('recognition_categories')
        .select('*')
        .eq('tenant_id', effectiveTenantId)
      return data ?? []
    },
    enabled: !!effectiveTenantId,
  })

  // All team colleagues in current tenant
  const { data: allColleagues } = useQuery({
    queryKey: ['colleagues-list', effectiveTenantId, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('tenant_id', effectiveTenantId)
        .neq('id', user?.id || '')
      return data ?? []
    },
    enabled: !!effectiveTenantId,
  })

  // Filtered colleague search results
  const searchResults = (allColleagues || []).filter((p: any) =>
    !recipientSearch.trim() ||
    p.full_name?.toLowerCase().includes(recipientSearch.toLowerCase()) ||
    p.email?.toLowerCase().includes(recipientSearch.toLowerCase())
  )

  const giveMutation = useMutation({
    mutationFn: async () => {
      if (!user || !selectedRecipient || !selectedCategory || !message.trim()) {
        throw new Error('Please fill all fields')
      }
      const cat = (categories as any[])?.find(c => c.id === selectedCategory)
      const { error: err } = await supabase.from('recognition_events').insert({
        tenant_id: effectiveTenantId,
        giver_id: user.id,
        receiver_id: selectedRecipient.id,
        category_id: selectedCategory,
        note: message,
        points: cat?.points ?? 10,
      })
      if (err) throw err
    },
    onSuccess: () => {
      success('Recognition sent! 🎉')
      setShowGiveModal(false)
      setSelectedRecipient(null)
      setSelectedCategory('')
      setMessage('')
      setRecipientSearch('')
      qc.invalidateQueries({ queryKey: ['recognition-feed'] })
      qc.invalidateQueries({ queryKey: ['recognition-leaderboard'] })
    },
    onError: (err: any) => error('Failed to send recognition', err.message),
  })

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Recognition & Kudos</h1>
          <p className="page-subtitle">Celebrate your teammates' achievements and build a culture of appreciation</p>
        </div>
        <button
          onClick={() => setShowGiveModal(true)}
          className="btn btn-primary"
          id="btn-give-recognition"
        >
          <Plus size={18} /> Give Kudos
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
        {/* Feed */}
        <div>
          <h2 style={{ fontSize: '1.125rem', marginBottom: 'var(--space-4)' }}>Recent Recognition</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {feedLoading ? (
              [1, 2, 3].map(i => <div key={`feed-skeleton-${i}`} className="card skeleton" style={{ height: 100 }} />)
            ) : feed?.length === 0 ? (
              <div className="empty-state">
                <Award size={48} color="var(--text-tertiary)" />
                <h3>No recognitions yet</h3>
                <p>Be the first to celebrate a teammate!</p>
              </div>
            ) : (
              feed?.map((r: any, idx: number) => {
                const IconComp = ICON_COMPONENT[r.category?.icon] ?? Star
                return (
                  <div key={`feed-item-${r.id || idx}-${idx}`} className="card" style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start' }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: '50%',
                      background: r.category?.color ? `${r.category.color}22` : 'var(--accent-light)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <IconComp size={20} color={r.category?.color ?? 'var(--accent)'} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                        {r.giver?.full_name || 'Team Member'} recognized {r.receiver?.full_name || 'Colleague'}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 8, fontStyle: 'italic' }}>
                        "{r.note || r.message || 'Great work!'}"
                      </div>
                      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                        <span className="badge badge-accent">{r.category?.name || 'Recognition'}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                          +{r.points || 10} pts · {formatDistanceToNow(parseISO(r.created_at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Leaderboard */}
        <div>
          <h2 style={{ fontSize: '1.125rem', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Trophy size={18} color="var(--warning)" /> Kudos Leaderboard
          </h2>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {lbLoading ? (
              [1, 2, 3, 4, 5].map(i => (
                <div key={`lb-skeleton-${i}`} style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--neu-bg-deep)', display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                  <div className="skeleton" style={{ width: 24, height: 24 }} />
                  <div className="skeleton skeleton-text" style={{ flex: 1 }} />
                </div>
              ))
            ) : leaderboard?.length === 0 ? (
              <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                No leaderboard data yet
              </div>
            ) : (
              (leaderboard || []).map((row: any, idx: number) => (
                <div
                  key={`kudos-lb-row-${idx}-${row.employee_id || row.user_id || row.id || idx}`}
                  style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                  padding: 'var(--space-3) var(--space-4)',
                  borderBottom: '1px solid var(--neu-bg-deep)',
                  background: idx === 0 ? 'linear-gradient(135deg, var(--warning)11, transparent)' : undefined,
                }}>
                  <div style={{
                    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem',
                    width: 28, textAlign: 'center',
                    color: idx < 3 ? ['var(--warning)','var(--text-secondary)','#cd7f32'][idx] : 'var(--text-tertiary)',
                  }}>
                    {idx + 1}
                  </div>
                  <div className="avatar avatar-sm">{(row.full_name ?? '?').charAt(0)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9375rem' }}>{row.full_name}</div>
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--accent)' }}>
                    {row.total_points}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Give Kudos Modal */}
      {showGiveModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowGiveModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--space-4)',
          }}
        >
          <div
            className="modal"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: 520,
              width: '100%',
              background: 'var(--neu-base, #1e2235)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: 'var(--shadow-raised-lg)',
              padding: 'var(--space-6)',
            }}
          >
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <h2 className="modal-title" style={{ fontSize: '1.25rem', fontWeight: 700 }}>Give Recognition</h2>
              <button
                className="modal-close"
                onClick={() => setShowGiveModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '1.5rem' }}
              >
                ×
              </button>
            </div>

            <div className="form-section" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {/* Recipient Selection */}
              <div className="input-group">
                <label className="input-label input-label-required" style={{ fontWeight: 600, marginBottom: 6, display: 'block' }}>
                  Select Colleague
                </label>
                {selectedRecipient ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                    padding: 'var(--space-3)', background: 'var(--accent-light, rgba(99,102,241,0.15))',
                    borderRadius: 'var(--radius-md)',
                  }}>
                    <div className="avatar avatar-sm" style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                      {selectedRecipient.full_name.charAt(0)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{selectedRecipient.full_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{selectedRecipient.email}</div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      onClick={() => { setSelectedRecipient(null); setRecipientSearch('') }}
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div className="input-wrap" style={{ position: 'relative' }}>
                      <Search size={18} className="input-icon" style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-tertiary)' }} />
                      <input
                        type="text"
                        className="input has-icon-left"
                        placeholder="Search colleague by name…"
                        value={recipientSearch}
                        onChange={e => setRecipientSearch(e.target.value)}
                        style={{ width: '100%', paddingLeft: 38 }}
                      />
                    </div>

                    {/* Quick-pick colleague list */}
                    <div style={{
                      maxHeight: 160,
                      overflowY: 'auto',
                      background: 'var(--neu-bg-deep, #141724)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--neu-border, rgba(255,255,255,0.1))',
                    }}>
                      {searchResults.length === 0 ? (
                        <div style={{ padding: 12, fontSize: '0.8125rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                          No colleagues found
                        </div>
                      ) : (
                        searchResults.map((p: any, idx: number) => (
                          <div
                            key={`colleague-pick-${p.id || idx}-${idx}`}
                            onClick={() => { setSelectedRecipient(p); setRecipientSearch('') }}
                            style={{
                              padding: '8px 12px',
                              cursor: 'pointer',
                              display: 'flex', alignItems: 'center', gap: 10,
                              borderBottom: '1px solid rgba(255,255,255,0.05)',
                              transition: 'background 0.15s ease',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.2)')}
                            onMouseLeave={e => (e.currentTarget.style.background = '')}
                          >
                            <div style={{
                              width: 28, height: 28, borderRadius: '50%',
                              background: '#6366f1', color: '#fff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '0.75rem', fontWeight: 700,
                            }}>
                              {p.full_name.charAt(0)}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{p.full_name}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {p.email}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Category Badges */}
              <div className="input-group">
                <label className="input-label input-label-required" style={{ fontWeight: 600, marginBottom: 6, display: 'block' }}>
                  Pick a Badge / Category
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                  {(categories as any[])?.map((cat, idx: number) => {
                    const IconComp = ICON_COMPONENT[cat.icon] ?? Star
                    const isSelected = selectedCategory === cat.id
                    return (
                      <button
                        key={`cat-badge-${cat.id || idx}-${idx}`}
                        type="button"
                        onClick={() => setSelectedCategory(cat.id)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 'var(--radius-md)',
                          border: `2px solid ${isSelected ? (cat.color || '#6366f1') : 'rgba(255,255,255,0.1)'}`,
                          background: isSelected ? `${cat.color || '#6366f1'}25` : 'var(--neu-bg-deep, #141724)',
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 8,
                          fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)',
                          transition: 'all 0.15s ease',
                          textAlign: 'left',
                        }}
                      >
                        <IconComp size={18} color={cat.color || '#6366f1'} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ lineHeight: 1.2 }}>{cat.name}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>+{cat.points} pts</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Message */}
              <div className="input-group">
                <label className="input-label input-label-required" style={{ fontWeight: 600, marginBottom: 6, display: 'block' }}>
                  Praise Note
                </label>
                <textarea
                  className="input textarea"
                  placeholder="Tell them why they deserve this recognition…"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={3}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)', resize: 'vertical' }}
                />
              </div>

              <button
                onClick={() => giveMutation.mutate()}
                disabled={giveMutation.isPending || !selectedRecipient || !selectedCategory || !message.trim()}
                className={`btn btn-primary btn-block ${giveMutation.isPending ? 'btn-loading' : ''}`}
                id="btn-submit-recognition"
                style={{ padding: '12px 16px', fontSize: '0.9375rem', fontWeight: 700, width: '100%', marginTop: 8 }}
              >
                <Award size={18} /> {giveMutation.isPending ? 'Sending…' : 'Send Recognition 🎉'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
