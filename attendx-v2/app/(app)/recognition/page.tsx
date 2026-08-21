'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Star, Award, Heart, Zap, Users, Crown, Trophy, Plus, Search } from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth.store'
import { useToast } from '@/components/ui/Toast'
import { PageWrapper } from '@/components/ui/PageWrapper'

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

  // Leaderboard
  const { data: leaderboard, isLoading: lbLoading } = useQuery({
    queryKey: ['recognition-leaderboard', user?.tenant?.id],
    queryFn: async () => {
      if (!user) return []
      const { data } = await supabase
        .from('recognition_leaderboard')
        .select('*')
        .eq('tenant_id', user.tenant.id)
        .order('total_points', { ascending: false })
        .limit(10)
      return data ?? []
    },
    enabled: !!user,
  })

  // Recent recognition feed
  const { data: feed, isLoading: feedLoading } = useQuery({
    queryKey: ['recognition-feed', user?.tenant?.id],
    queryFn: async () => {
      if (!user) return []
      const { data } = await supabase
        .from('recognition_events')
        .select('*, giver:profiles!giver_id(full_name), receiver:profiles!receiver_id(full_name), category:recognition_categories(*)')
        .eq('tenant_id', user.tenant.id)
        .order('created_at', { ascending: false })
        .limit(20)
      return data ?? []
    },
    enabled: !!user,
  })

  // Categories
  const { data: categories } = useQuery({
    queryKey: ['recognition-categories', user?.tenant?.id],
    queryFn: async () => {
      if (!user) return []
      const { data } = await supabase
        .from('recognition_categories')
        .select('*')
        .eq('tenant_id', user.tenant.id)
      return data ?? []
    },
    enabled: !!user,
  })

  // Search profiles for recipient
  const { data: searchResults } = useQuery({
    queryKey: ['profile-search', recipientSearch, user?.tenant?.id],
    queryFn: async () => {
      if (!recipientSearch.trim() || recipientSearch.length < 2 || !user) return []
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('tenant_id', user.tenant.id)
        .neq('id', user.id)
        .ilike('full_name', `%${recipientSearch}%`)
        .limit(5)
      return data ?? []
    },
    enabled: !!user && recipientSearch.length >= 2,
  })

  const giveMutation = useMutation({
    mutationFn: async () => {
      if (!user || !selectedRecipient || !selectedCategory || !message.trim()) {
        throw new Error('Please fill all fields')
      }
      const cat = (categories as any[])?.find(c => c.id === selectedCategory)
      const { error: err } = await supabase.from('recognition_events').insert({
        tenant_id: user.tenant.id,
        giver_id: user.id,
        receiver_id: selectedRecipient.id,
        category_id: selectedCategory,
        message,
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
    <PageWrapper style={{ maxWidth: 1100, margin: '0 auto' }}>
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
              [1, 2, 3].map(i => <div key={i} className="card skeleton" style={{ height: 100 }} />)
            ) : feed?.length === 0 ? (
              <div className="empty-state">
                <Award size={48} color="var(--text-tertiary)" />
                <h3>No recognitions yet</h3>
                <p>Be the first to celebrate a teammate!</p>
              </div>
            ) : (
              feed?.map((r: any) => {
                const IconComp = ICON_COMPONENT[r.category?.icon] ?? Star
                return (
                  <div key={r.id} className="card" style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start' }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: '50%',
                      background: r.category?.color ? `${r.category.color}22` : 'var(--accent-light)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <IconComp size={20} color={r.category?.color ?? 'var(--accent)'} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                        {r.giver?.full_name} recognized {r.receiver?.full_name}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 8, fontStyle: 'italic' }}>
                        "{r.message}"
                      </div>
                      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                        <span className="badge badge-accent">{r.category?.name}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                          +{r.points} pts · {formatDistanceToNow(parseISO(r.created_at), { addSuffix: true })}
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
              [1,2,3,4,5].map(i => (
                <div key={i} style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--neu-bg-deep)', display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                  <div className="skeleton" style={{ width: 24, height: 24 }} />
                  <div className="skeleton skeleton-text" style={{ flex: 1 }} />
                </div>
              ))
            ) : leaderboard?.length === 0 ? (
              <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                No leaderboard data yet
              </div>
            ) : (
              leaderboard?.map((row: any, idx: number) => (
                <div key={row.user_id} style={{
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
        <div className="modal-backdrop" onClick={() => setShowGiveModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2 className="modal-title">Give Recognition</h2>
              <button className="modal-close" onClick={() => setShowGiveModal(false)}>×</button>
            </div>

            <div className="form-section">
              {/* Recipient Search */}
              <div className="input-group">
                <label className="input-label input-label-required">Recognize</label>
                {selectedRecipient ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                    padding: 'var(--space-3)', background: 'var(--accent-light)',
                    borderRadius: 'var(--radius-md)',
                  }}>
                    <div className="avatar avatar-sm">{selectedRecipient.full_name.charAt(0)}</div>
                    <span style={{ fontWeight: 600, flex: 1 }}>{selectedRecipient.full_name}</span>
                    <button
                      className="btn btn-secondary btn-xs"
                      onClick={() => { setSelectedRecipient(null); setRecipientSearch('') }}
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="input-wrap">
                    <Search size={18} className="input-icon" />
                    <input
                      type="text"
                      className="input has-icon-left"
                      placeholder="Search colleague by name…"
                      value={recipientSearch}
                      onChange={e => setRecipientSearch(e.target.value)}
                    />
                    {searchResults && searchResults.length > 0 && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                        background: 'var(--neu-bg)', border: '1px solid var(--neu-border)',
                        borderRadius: 'var(--radius-md)', overflow: 'hidden',
                        boxShadow: 'var(--shadow-lg)',
                      }}>
                        {searchResults.map((p: any) => (
                          <div
                            key={p.id}
                            onClick={() => { setSelectedRecipient(p); setRecipientSearch('') }}
                            style={{
                              padding: 'var(--space-3) var(--space-4)',
                              cursor: 'pointer',
                              display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                              transition: 'background var(--anim-fast)',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--neu-bg-deep)')}
                            onMouseLeave={e => (e.currentTarget.style.background = '')}
                          >
                            <div className="avatar avatar-sm">{p.full_name.charAt(0)}</div>
                            <span style={{ fontWeight: 600 }}>{p.full_name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Category */}
              <div className="input-group">
                <label className="input-label input-label-required">Recognition Category</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                  {(categories as any[])?.map(cat => {
                    const IconComp = ICON_COMPONENT[cat.icon] ?? Star
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategory(cat.id)}
                        style={{
                          padding: 'var(--space-3)',
                          borderRadius: 'var(--radius-md)',
                          border: `2px solid ${selectedCategory === cat.id ? cat.color : 'var(--neu-border)'}`,
                          background: selectedCategory === cat.id ? `${cat.color}22` : 'var(--neu-bg-deep)',
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                          fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)',
                          transition: 'all var(--anim-fast)',
                        }}
                      >
                        <IconComp size={16} color={cat.color} />
                        {cat.name}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Message */}
              <div className="input-group">
                <label className="input-label input-label-required">Personal Message</label>
                <textarea
                  className="input textarea"
                  placeholder="Tell them why they deserve this recognition…"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={3}
                />
              </div>

              <button
                onClick={() => giveMutation.mutate()}
                disabled={giveMutation.isPending || !selectedRecipient || !selectedCategory || !message.trim()}
                className={`btn btn-primary btn-block ${giveMutation.isPending ? 'btn-loading' : ''}`}
                id="btn-submit-recognition"
              >
                <Award size={18} /> {giveMutation.isPending ? 'Sending…' : 'Send Recognition 🎉'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  )
}
