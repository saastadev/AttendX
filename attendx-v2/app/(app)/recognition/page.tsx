'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Star, Award, Heart, Zap, Users, Crown, Trophy, Plus, Search } from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { useAuthStore } from '@/store/auth.store'
import { useToast } from '@/components/ui/Toast'
import { PageWrapper } from '@/components/ui/PageWrapper'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

const ICON_COMPONENT: Record<string, React.ComponentType<any>> = {
  users: Users, lightbulb: Star, heart: Heart, zap: Zap, crown: Crown, star: Star, award: Award, trophy: Trophy,
}

export default function RecognitionPage() {
  const user = useAuthStore(s => s.user)
  const supabase = getSupabaseBrowserClient()
  const { success, error } = useToast()
  const qc = useQueryClient()

  const [showGiveModal, setShowGiveModal] = useState(false)
  const [recipientSearch, setRecipientSearch] = useState('')
  const [selectedRecipient, setSelectedRecipient] = useState<any>(null)
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [message, setMessage] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | 'received' | 'given'>('all')

  const myUserId = user?.id || (user as any)?.profile?.id

  // Fetch authoritative recognition dataset (categories, colleagues, feed, leaderboard, myStats)
  const { data: recData, isLoading, refetch } = useQuery({
    queryKey: ['recognition-data', myUserId, user?.tenant?.id || (user as any)?.tenant_id],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = {}
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }
      const res = await fetch('/api/recognition', { headers, credentials: 'include' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to load recognition data')
      }
      return res.json()
    },
    enabled: !!user,
  })

  const feedLoading = isLoading
  const lbLoading = isLoading
  const leaderboard = recData?.leaderboard || []
  const feed = recData?.feed || []
  const categories = recData?.categories || []
  const allColleagues = recData?.colleagues || []
  const rawStats = recData?.myStats || {
    total_points: 0,
    recognitions_received: 0,
    recognitions_given: 0,
    rank: null,
  }

  // Filtered colleague search results
  const searchResults = (allColleagues || []).filter((p: any) =>
    !recipientSearch.trim() ||
    p.full_name?.toLowerCase().includes(recipientSearch.toLowerCase()) ||
    p.email?.toLowerCase().includes(recipientSearch.toLowerCase()) ||
    p.department_name?.toLowerCase().includes(recipientSearch.toLowerCase()) ||
    p.employee_code?.toLowerCase().includes(recipientSearch.toLowerCase())
  )

  const isReceivedItem = (r: any) =>
    Boolean(myUserId && r.receiver_id === myUserId) ||
    Boolean(user?.profile?.id && r.receiver_id === user.profile.id) ||
    r.is_received === true

  const isGivenItem = (r: any) =>
    Boolean(myUserId && r.giver_id === myUserId) ||
    Boolean(user?.profile?.id && r.giver_id === user.profile.id) ||
    r.is_given === true

  const receivedCount = (feed || []).filter(isReceivedItem).length
  const givenCount = (feed || []).filter(isGivenItem).length

  const displayedFeed = (feed || []).filter((r: any) => {
    if (activeTab === 'received') return isReceivedItem(r)
    if (activeTab === 'given') return isGivenItem(r)
    return true
  })

  const myLbEntry = (leaderboard || []).find((row: any) =>
    (myUserId && (row.user_id === myUserId || row.employee_id === myUserId)) ||
    (user?.profile?.id && (row.user_id === user.profile.id || row.employee_id === user.profile.id))
  )

  const displayPoints = rawStats.total_points || myLbEntry?.total_points || (feed || []).filter(isReceivedItem).reduce((s: number, r: any) => s + (r.points || 0), 0)
  const displayRank = rawStats.rank || myLbEntry?.rank || '-'
  const displayReceived = rawStats.recognitions_received || myLbEntry?.recognitions_received || receivedCount
  const displayGiven = rawStats.recognitions_given ?? givenCount

  const giveMutation = useMutation({
    mutationFn: async () => {
      if (!user || !selectedRecipient || !selectedCategory || !message.trim()) {
        throw new Error('Please fill all fields')
      }

      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const res = await fetch('/api/recognition', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          receiver_id: selectedRecipient.id,
          category_id: selectedCategory,
          note: message.trim(),
        }),
      })

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.error || 'Failed to send recognition')
      }

      return res.json()
    },
    onSuccess: (resData: any) => {
      success(resData?.message || 'Recognition sent! 🎉')
      setShowGiveModal(false)
      setSelectedRecipient(null)
      setSelectedCategory('')
      setMessage('')
      setRecipientSearch('')
      qc.invalidateQueries({ queryKey: ['recognition-data'] })
      qc.invalidateQueries({ queryKey: ['recognition-points'] })
      qc.invalidateQueries({ queryKey: ['latest-recognition-received'] })
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notifications-panel'] })
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      refetch()
    },
    onError: (err: any) => error('Failed to send recognition', err.message),
  })

  const safeFormatDistance = (isoString?: string) => {
    if (!isoString) return 'recently'
    try {
      return formatDistanceToNow(parseISO(isoString), { addSuffix: true })
    } catch {
      return 'recently'
    }
  }

  return (
    <PageWrapper style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: 'var(--space-5)' }}>
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

      {/* Personal Employee Recognition Spotlight */}
      <div
        className="card"
        style={{
          marginBottom: 'var(--space-6)',
          padding: 'var(--space-5)',
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(236, 72, 153, 0.10))',
          border: '1px solid rgba(99, 102, 241, 0.25)',
          borderRadius: 'var(--radius-xl)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', minWidth: 240 }}>
          <div
            style={{
              width: 52, height: 52, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent), #EC4899)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: '1.25rem', fontWeight: 800,
              boxShadow: '0 8px 20px rgba(99, 102, 241, 0.3)',
              flexShrink: 0,
            }}
          >
            {user?.profile?.full_name?.charAt(0) || 'U'}
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', fontWeight: 700 }}>
              Your Recognition Standing
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {user?.profile?.full_name || 'Team Member'}
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              {user?.role} · {user?.tenant?.name || 'Workspace'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{
            background: 'var(--neu-bg-deep)',
            padding: '10px 16px',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid rgba(255,255,255,0.06)',
            textAlign: 'center',
            minWidth: 96,
          }}>
            <div style={{ fontSize: '1.375rem', fontWeight: 800, color: '#F59E0B', fontFamily: 'var(--font-display)' }}>
              {displayPoints}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>Points Earned</div>
          </div>

          <div style={{
            background: 'var(--neu-bg-deep)',
            padding: '10px 16px',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid rgba(255,255,255,0.06)',
            textAlign: 'center',
            minWidth: 96,
          }}>
            <div style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--font-display)' }}>
              #{displayRank}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>Leaderboard Rank</div>
          </div>

          <div style={{
            background: 'var(--neu-bg-deep)',
            padding: '10px 16px',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid rgba(255,255,255,0.06)',
            textAlign: 'center',
            minWidth: 96,
          }}>
            <div style={{ fontSize: '1.375rem', fontWeight: 800, color: '#10B981', fontFamily: 'var(--font-display)' }}>
              {displayReceived}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>Kudos Received</div>
          </div>

          <div style={{
            background: 'var(--neu-bg-deep)',
            padding: '10px 16px',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid rgba(255,255,255,0.06)',
            textAlign: 'center',
            minWidth: 96,
          }}>
            <div style={{ fontSize: '1.375rem', fontWeight: 800, color: '#0EA5E9', fontFamily: 'var(--font-display)' }}>
              {displayGiven}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>Kudos Given</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
        {/* Feed */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ fontSize: '1.125rem', margin: 0, fontWeight: 700, color: 'var(--text-primary)' }}>Recognition Wall</h2>
            <div style={{ display: 'flex', gap: 4, background: 'var(--neu-bg-deep)', padding: 3, borderRadius: 'var(--radius-pill)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                style={{
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-pill)',
                  border: 'none',
                  background: activeTab === 'all' ? 'var(--accent)' : 'transparent',
                  color: activeTab === 'all' ? '#fff' : 'var(--text-secondary)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                All Activity ({feed?.length || 0})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('received')}
                style={{
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-pill)',
                  border: 'none',
                  background: activeTab === 'received' ? 'var(--accent)' : 'transparent',
                  color: activeTab === 'received' ? '#fff' : 'var(--text-secondary)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                Received by Me ({receivedCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('given')}
                style={{
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-pill)',
                  border: 'none',
                  background: activeTab === 'given' ? 'var(--accent)' : 'transparent',
                  color: activeTab === 'given' ? '#fff' : 'var(--text-secondary)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                Given by Me ({givenCount})
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {feedLoading ? (
              [1, 2, 3].map(i => <div key={`feed-skeleton-${i}`} className="card skeleton" style={{ height: 100 }} />)
            ) : displayedFeed.length === 0 ? (
              <div className="empty-state" style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
                <Award size={48} color="var(--text-tertiary)" />
                <h3 style={{ marginTop: 12, fontSize: '1rem' }}>
                  {activeTab === 'received' ? "No recognitions received yet" : activeTab === 'given' ? "You haven't given recognitions yet" : "No recognitions yet"}
                </h3>
                <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
                  {activeTab === 'received' ? "Keep up the great work and celebrate teammates to build community!" : "Be the first to celebrate a teammate's hard work and win!"}
                </p>
                {activeTab !== 'received' && (
                  <button onClick={() => setShowGiveModal(true)} className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>
                    <Plus size={16} /> Give Kudos Now
                  </button>
                )}
              </div>
            ) : (
              displayedFeed.map((r: any, idx: number) => {
                const IconComp = ICON_COMPONENT[r.category?.icon] ?? Star
                const isForMe = r.receiver_id === user?.id || r.is_received
                const isByMe = r.giver_id === user?.id || r.is_given

                return (
                  <div
                    key={`feed-item-${r.id || idx}-${idx}`}
                    className="card"
                    style={{
                      display: 'flex',
                      gap: 'var(--space-4)',
                      alignItems: 'flex-start',
                      background: isForMe ? 'linear-gradient(135deg, rgba(236, 72, 153, 0.08), var(--neu-base))' : undefined,
                      border: isForMe ? '1px solid rgba(236, 72, 153, 0.25)' : undefined,
                    }}
                  >
                    <div style={{
                      width: 44, height: 44, borderRadius: '50%',
                      background: r.category?.color ? `${r.category.color}22` : 'var(--accent-light)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <IconComp size={20} color={r.category?.color ?? 'var(--accent)'} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                          {r.giver?.full_name || 'Team Member'} {isByMe && <span style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>(You)</span>} recognized {r.receiver?.full_name || 'Colleague'} {isForMe && <span style={{ fontSize: '0.75rem', color: '#EC4899', fontWeight: 800 }}>(You!)</span>}
                        </div>
                        {isForMe && (
                          <span style={{ fontSize: '0.6875rem', padding: '2px 8px', borderRadius: 12, background: 'rgba(236, 72, 153, 0.15)', color: '#EC4899', fontWeight: 700 }}>
                            Awarded to You
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 8, fontStyle: 'italic' }}>
                        "{r.note || r.message || 'Great work!'}"
                      </div>
                      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                        <span className="badge badge-accent">{r.category?.name || 'Recognition'}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                          +{r.points || 10} pts · {safeFormatDistance(r.created_at)}
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
          <h2 style={{ fontSize: '1.125rem', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: 'var(--text-primary)' }}>
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
              (leaderboard || []).map((row: any, idx: number) => {
                const isCurrentUser = row.user_id === user?.id || row.employee_id === user?.id
                return (
                  <div
                    key={`kudos-lb-row-${idx}-${row.employee_id || row.user_id || row.id || idx}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                      padding: 'var(--space-3) var(--space-4)',
                      borderBottom: '1px solid var(--neu-bg-deep)',
                      background: isCurrentUser
                        ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.18), rgba(236, 72, 153, 0.12))'
                        : idx === 0
                        ? 'linear-gradient(135deg, var(--warning)11, transparent)'
                        : undefined,
                      borderLeft: isCurrentUser ? '3px solid var(--accent)' : undefined,
                    }}
                  >
                    <div style={{
                      fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem',
                      width: 28, textAlign: 'center',
                      color: idx < 3 ? ['var(--warning)','var(--text-secondary)','#cd7f32'][idx] : 'var(--text-tertiary)',
                    }}>
                      {idx + 1}
                    </div>
                    <div className="avatar avatar-sm">{(row.full_name ?? '?').charAt(0)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9375rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.full_name}</span>
                        {isCurrentUser && (
                          <span style={{ fontSize: '0.6875rem', fontWeight: 800, padding: '1px 6px', borderRadius: 10, background: 'var(--accent)', color: '#fff' }}>
                            You
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                        {row.recognitions_received ?? row.recognition_count ?? 0} kudos received
                      </div>
                    </div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--accent)' }}>
                      {row.total_points}
                    </div>
                  </div>
                )
              })
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
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{selectedRecipient.full_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                        {selectedRecipient.employee_code} · {selectedRecipient.department_name} · {selectedRecipient.email}
                      </div>
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
                        placeholder="Search colleague by name, email, or department…"
                        value={recipientSearch}
                        onChange={e => setRecipientSearch(e.target.value)}
                        style={{ width: '100%', paddingLeft: 38 }}
                      />
                    </div>

                    {/* Quick-pick colleague list */}
                    <div style={{
                      maxHeight: 200,
                      overflowY: 'auto',
                      background: 'var(--neu-bg-deep, #141724)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--neu-border, rgba(255,255,255,0.1))',
                    }}>
                      {searchResults.length === 0 ? (
                        <div style={{ padding: 14, fontSize: '0.8125rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                          No colleagues found
                        </div>
                      ) : (
                        searchResults.map((p: any, idx: number) => (
                          <div
                            key={`colleague-pick-${p.id || idx}-${idx}`}
                            onClick={() => { setSelectedRecipient(p); setRecipientSearch('') }}
                            style={{
                              padding: '10px 12px',
                              cursor: 'pointer',
                              display: 'flex', alignItems: 'center', gap: 10,
                              borderBottom: '1px solid rgba(255,255,255,0.05)',
                              transition: 'background 0.15s ease',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.2)')}
                            onMouseLeave={e => (e.currentTarget.style.background = '')}
                          >
                            <div style={{
                              width: 32, height: 32, borderRadius: '50%',
                              background: 'var(--accent)', color: '#fff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '0.8rem', fontWeight: 700, flexShrink: 0
                            }}>
                              {p.full_name.charAt(0)}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{p.full_name}</span>
                                <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: 4, background: 'rgba(99,102,241,0.15)', color: 'var(--accent)' }}>
                                  {p.department_name}
                                </span>
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {p.employee_code} · {p.email}
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
    </PageWrapper>
  )
}
