'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Star, Award, Heart, Zap, Users, Crown, Trophy, Plus, Search, Gift, CheckCircle2, Clock, Calendar } from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { useAuthStore } from '@/store/auth.store'
import { useToast } from '@/components/ui/Toast'
import { PageWrapper } from '@/components/ui/PageWrapper'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

const ICON_COMPONENT: Record<string, React.ComponentType<any>> = {
  users: Users, lightbulb: Star, heart: Heart, zap: Zap, crown: Crown, star: Star, award: Award, trophy: Trophy, gift: Gift,
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
  const [mainSection, setMainSection] = useState<'wall' | 'awards' | 'rewards'>('wall')

  const myUserId = user?.id || (user as any)?.profile?.id
  const activeTenantId = user?.tenant?.id || (user as any)?.tenant_id || (user as any)?.profile?.tenant_id || null

  // Reset selected recipient and search query when tenant context changes (Phase 6 requirement)
  useEffect(() => {
    setSelectedRecipient(null)
    setRecipientSearch('')
  }, [activeTenantId])

  // Fetch authoritative recognition dataset (categories, colleagues, feed, leaderboard, myStats)
  const { data: recData, isLoading, refetch } = useQuery({
    queryKey: ['recognition-data', myUserId, activeTenantId],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = {}
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }
      if (activeTenantId) {
        headers['x-tenant-id'] = activeTenantId
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

  // Fetch executive awards catalog & nominations (REC_TC_009 - REC_TC_019, REC_TC_028)
  const { data: awardsData, isLoading: awardsLoading, refetch: refetchAwards } = useQuery({
    queryKey: ['recognition-awards', activeTenantId],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = {}
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }
      if (activeTenantId) {
        headers['x-tenant-id'] = activeTenantId
      }
      const res = await fetch('/api/recognition/awards', { headers, credentials: 'include' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to load awards')
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
  // Peer-to-peer recognition categories (REC-002: 50, 100, 150, 200, 250 pts; excludes executive awards, AI_REC_TC_014)
  const peerCategories = (categories as any[])?.filter((c: any) => (c.points || 0) <= 250)
  const allColleagues = recData?.colleagues || []
  const rawStats = recData?.myStats || {
    total_points: 0,
    recognitions_received: 0,
    recognitions_given: 0,
    rank: null,
  }

  // Deduplicate colleagues strictly by authoritative ID (Phase 5: Prevent duplicate display results like David / david)
  const deduplicatedColleagues = useMemo(() => {
    const seenIds = new Set<string>()
    const list: any[] = []
    for (const p of (allColleagues || [])) {
      if (p?.id && !seenIds.has(p.id)) {
        seenIds.add(p.id)
        list.push(p)
      }
    }
    return list
  }, [allColleagues])

  // Filtered colleague search results (resilient to whitespace, case, tokens, name/email/department/code)
  const searchTokens = recipientSearch.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const searchResults = deduplicatedColleagues.filter((p: any) => {
    if (searchTokens.length === 0) return true
    const haystack = `${p.full_name || ''} ${p.email || ''} ${p.department_name || ''} ${p.employee_code || ''}`.toLowerCase()
    return searchTokens.every(token => haystack.includes(token))
  })

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
      if (activeTenantId) {
        headers['x-tenant-id'] = activeTenantId
      }

      const res = await fetch('/api/recognition', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          receiver_id: selectedRecipient.id,
          category_id: selectedCategory,
          note: message.trim(),
          tenant_id: activeTenantId,
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

  const approveNominationMutation = useMutation({
    mutationFn: async (nominationId: string) => {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
      if (activeTenantId) headers['x-tenant-id'] = activeTenantId

      const res = await fetch('/api/recognition/awards', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'approve', nomination_id: nominationId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to approve nomination')
      }
      return res.json()
    },
    onSuccess: () => {
      success('Nomination approved! Award points granted 🎉')
      refetchAwards()
      refetch()
    },
    onError: (err: any) => error('Approval failed', err.message),
  })

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

      {/* Navigation Switcher Tabs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 'var(--space-6)', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 'var(--space-3)', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setMainSection('wall')}
          className={`btn btn-sm ${mainSection === 'wall' ? 'btn-primary' : 'btn-outline'}`}
          id="tab-kudos-feed"
        >
          <Users size={16} /> Kudos & Feed
        </button>
        <button
          type="button"
          onClick={() => setMainSection('awards')}
          className={`btn btn-sm ${mainSection === 'awards' ? 'btn-primary' : 'btn-outline'}`}
          id="tab-awards-catalog"
        >
          <Trophy size={16} /> Awards & Nominations
        </button>
        <button
          type="button"
          onClick={() => setMainSection('rewards')}
          className={`btn btn-sm ${mainSection === 'rewards' ? 'btn-primary' : 'btn-outline'}`}
          id="tab-performance-rewards"
        >
          <Gift size={16} /> Performance Rewards
        </button>
      </div>

      {mainSection === 'wall' && (
        <>
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

      <div className="neu-recognition-grid">
        {/* Feed */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ fontSize: '1.125rem', margin: 0, fontWeight: 700, color: 'var(--text-primary)' }}>Recognition Wall</h2>
            <div style={{ display: 'flex', gap: 6, background: 'var(--neu-bg-deep)', padding: 4, borderRadius: 'var(--radius-pill)', border: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                style={{
                  minHeight: 44,
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-pill)',
                  border: 'none',
                  background: activeTab === 'all' ? 'var(--accent)' : 'transparent',
                  color: activeTab === 'all' ? '#fff' : 'var(--text-secondary)',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                All Activity ({feed?.length || 0})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('received')}
                style={{
                  minHeight: 44,
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-pill)',
                  border: 'none',
                  background: activeTab === 'received' ? 'var(--accent)' : 'transparent',
                  color: activeTab === 'received' ? '#fff' : 'var(--text-secondary)',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                Received by Me ({receivedCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('given')}
                style={{
                  minHeight: 44,
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-pill)',
                  border: 'none',
                  background: activeTab === 'given' ? 'var(--accent)' : 'transparent',
                  color: activeTab === 'given' ? '#fff' : 'var(--text-secondary)',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  WebkitTapHighlightColor: 'transparent',
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
      </>
      )}

      {/* Awards & Nominations Catalog Section (REC_TC_009 - REC_TC_014, REC_TC_028) */}
      {mainSection === 'awards' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* Header Card */}
          <div className="card" style={{
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(99, 102, 241, 0.08))',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            padding: 'var(--space-5)',
            borderRadius: 'var(--radius-xl)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(245, 158, 11, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Trophy size={24} color="#F59E0B" />
              </div>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Executive Awards & Period Honors
                </h2>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  Authoritative institutional awards governed by leadership nomination and committee approval
                </p>
              </div>
            </div>
          </div>

          {/* Monthly Awards (REC_TC_009) */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-3)' }}>
              <Calendar size={18} color="var(--accent)" />
              <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, margin: 0 }}>Monthly Awards (500 pts)</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--space-4)' }}>
              {(awardsData?.monthly_awards || [
                { id: 'award-m-01', name: 'Employee of the Month', points: 500, description: 'Highest performing team member of the calendar month.' },
                { id: 'award-m-02', name: 'Rising Star Award', points: 500, description: 'Most promising contributor with rapid learning and delivery.' },
                { id: 'award-m-03', name: 'Customer Champion Award', points: 500, description: 'Exemplary customer satisfaction and stakeholder service.' },
                { id: 'award-m-04', name: 'Team Player Award', points: 500, description: 'Outstanding peer collaboration and team enablement.' },
              ]).map((aw: any) => (
                <div
                  key={aw.id}
                  className="card award-catalog-card"
                  data-award-id={aw.id}
                  data-award-period="MONTHLY"
                  data-award-points={aw.points}
                  data-award-name={aw.name}
                  style={{
                    padding: 'var(--space-4)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 'var(--radius-lg)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <span className="badge badge-accent" style={{ fontSize: '0.6875rem' }}>MONTHLY</span>
                      <span style={{ fontSize: '0.875rem', fontWeight: 800, color: '#F59E0B' }}>+{aw.points} pts</span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '0.9375rem', marginBottom: 6, color: 'var(--text-primary)' }}>{aw.name}</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{aw.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quarterly Awards (REC_TC_010) */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-3)' }}>
              <Award size={18} color="#0EA5E9" />
              <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, margin: 0 }}>Quarterly Awards (750 pts)</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--space-4)' }}>
              {(awardsData?.quarterly_awards || [
                { id: 'award-q-01', name: 'Innovation Award', points: 750, description: 'Pioneering solution or process optimization delivering tangible impact.' },
                { id: 'award-q-02', name: 'Excellence in Delivery Award', points: 750, description: 'Flawless milestone execution and high-quality project turnaround.' },
                { id: 'award-q-03', name: 'Sales Achiever Award', points: 750, description: 'Target milestone overachievement and revenue acceleration.' },
                { id: 'award-q-04', name: 'Operational Excellence Award', points: 750, description: 'Unwavering systems reliability and operational rigor.' },
              ]).map((aw: any) => (
                <div
                  key={aw.id}
                  className="card award-catalog-card"
                  data-award-id={aw.id}
                  data-award-period="QUARTERLY"
                  data-award-points={aw.points}
                  data-award-name={aw.name}
                  style={{
                    padding: 'var(--space-4)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 'var(--radius-lg)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <span className="badge" style={{ background: 'rgba(14, 165, 233, 0.15)', color: '#0EA5E9', fontSize: '0.6875rem' }}>QUARTERLY</span>
                      <span style={{ fontSize: '0.875rem', fontWeight: 800, color: '#0EA5E9' }}>+{aw.points} pts</span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '0.9375rem', marginBottom: 6, color: 'var(--text-primary)' }}>{aw.name}</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{aw.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Annual Awards (REC_TC_011) */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-3)' }}>
              <Crown size={18} color="#EC4899" />
              <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, margin: 0 }}>Annual Awards (1000 pts)</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--space-4)' }}>
              {(awardsData?.annual_awards || [
                { id: 'award-a-01', name: 'Employee of the Year', points: 1000, description: 'Premier organizational contributor across performance and culture.' },
                { id: 'award-a-02', name: 'Leadership Excellence Award', points: 1000, description: 'Exemplary leadership, mentorship, and strategic impact.' },
                { id: 'award-a-03', name: 'Innovator of the Year', points: 1000, description: 'Transformational innovation adopted organization-wide.' },
                { id: 'award-a-04', name: 'Customer Delight Award', points: 1000, description: 'Exceptional long-term client trust and relationship stewardship.' },
                { id: 'award-a-05', name: 'Best Manager Award', points: 1000, description: 'Top team retention, growth, and empathetic people management.' },
                { id: 'award-a-06', name: 'Culture Champion Award', points: 1000, description: 'Inspiring adherence to core company values and ethics.' },
                { id: 'award-a-07', name: 'Top Performer Award', points: 1000, description: 'Sustained top-percentile KPI delivery throughout the year.' },
                { id: 'award-a-08', name: 'CEO Excellence Award', points: 1000, description: 'Executive board recognition for landmark enterprise contributions.' },
              ]).map((aw: any) => (
                <div
                  key={aw.id}
                  className="card award-catalog-card"
                  data-award-id={aw.id}
                  data-award-period="ANNUAL"
                  data-award-points={aw.points}
                  data-award-name={aw.name}
                  style={{
                    padding: 'var(--space-4)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 'var(--radius-lg)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <span className="badge" style={{ background: 'rgba(236, 72, 153, 0.15)', color: '#EC4899', fontSize: '0.6875rem' }}>ANNUAL</span>
                      <span style={{ fontSize: '0.875rem', fontWeight: 800, color: '#EC4899' }}>+{aw.points} pts</span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '0.9375rem', marginBottom: 6, color: 'var(--text-primary)' }}>{aw.name}</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{aw.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Awards & Nominations Activity Log (REC_TC_012 - REC_TC_014, REC_TC_028) */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={18} color="var(--accent)" />
                <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, margin: 0 }}>Executive Nominations & Awards Registry</h3>
              </div>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {awardsLoading ? (
                <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading nominations...</div>
              ) : (awardsData?.awards_and_nominations || []).length === 0 ? (
                <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                  No nominations recorded yet in this tenant.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'var(--neu-bg-deep)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                        <th style={{ padding: '12px 16px' }}>Nominee</th>
                        <th style={{ padding: '12px 16px' }}>Award</th>
                        <th style={{ padding: '12px 16px' }}>Points</th>
                        <th style={{ padding: '12px 16px' }}>Nominator</th>
                        <th style={{ padding: '12px 16px' }}>Reason</th>
                        <th style={{ padding: '12px 16px' }}>Status</th>
                        <th style={{ padding: '12px 16px' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(awardsData?.awards_and_nominations || []).map((row: any) => {
                        const canApprove = ['admin', 'manager', 'hr'].includes((user?.role || '').toLowerCase())
                        return (
                          <tr
                            key={row.id}
                            className="nomination-row"
                            data-nomination-id={row.id}
                            data-nomination-status={row.status}
                            style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                          >
                            <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>{row.nominee_name}</td>
                            <td style={{ padding: '12px 16px' }}>{row.award_name}</td>
                            <td style={{ padding: '12px 16px', fontWeight: 700, color: '#F59E0B' }}>+{row.points}</td>
                            <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{row.nominator_name}</td>
                            <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {row.reason}
                            </td>
                            <td style={{ padding: '12px 16px' }}>
                              <span
                                className={`badge ${row.status === 'APPROVED' ? 'badge-success' : 'badge-warning'}`}
                                style={{
                                  padding: '3px 8px',
                                  borderRadius: 12,
                                  fontSize: '0.6875rem',
                                  fontWeight: 700,
                                  background: row.status === 'APPROVED' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                  color: row.status === 'APPROVED' ? '#10B981' : '#F59E0B',
                                }}
                              >
                                {row.status}
                              </span>
                            </td>
                            <td style={{ padding: '12px 16px' }}>
                              {row.status === 'PENDING_APPROVAL' && canApprove && (
                                <button
                                  type="button"
                                  onClick={() => approveNominationMutation.mutate(row.id)}
                                  className="btn btn-sm btn-primary"
                                  disabled={approveNominationMutation.isPending}
                                  style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                                >
                                  Approve
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Performance Rewards Mapping Section (REC_TC_015 - REC_TC_019) */}
      {mainSection === 'rewards' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* Header */}
          <div className="card" style={{
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(99, 102, 241, 0.08))',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            padding: 'var(--space-5)',
            borderRadius: 'var(--radius-xl)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Gift size={24} color="#10B981" />
              </div>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Continuous Performance Reward Matrix
                </h2>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  Automated incentive linkages converting performance appraisal tiers directly into rewards and kudos points
                </p>
              </div>
            </div>
          </div>

          {/* Reward Tiers Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-4)' }}>
            {(awardsData?.reward_mappings || [
              { performance_level: 'Meets Expectations', reward_item: 'Appreciation Certificate', value_type: 'CERTIFICATE', points: 100 },
              { performance_level: 'Exceeds Expectations', reward_item: 'Gift Voucher', value_type: 'VOUCHER', points: 250 },
              { performance_level: 'Outstanding Performer', reward_item: 'Performance Bonus', value_type: 'BONUS', points: 500 },
              { performance_level: 'Employee of the Quarter', reward_item: 'Trophy + Voucher', value_type: 'TROPHY_VOUCHER', points: 750 },
              { performance_level: 'Employee of the Year', reward_item: 'Trophy + Cash Award + Additional Leave', value_type: 'COMPREHENSIVE_PACKAGE', points: 1000 },
            ]).map((rm: any, idx: number) => {
              const colors = ['#0EA5E9', '#8B5CF6', '#10B981', '#F59E0B', '#EC4899']
              const color = colors[idx % colors.length]
              return (
                <div
                  key={rm.performance_level}
                  className="card reward-mapping-card"
                  data-performance-level={rm.performance_level}
                  data-reward-item={rm.reward_item}
                  data-reward-points={rm.points}
                  style={{
                    padding: 'var(--space-5)',
                    border: `1px solid ${color}44`,
                    borderRadius: 'var(--radius-xl)',
                    background: `linear-gradient(135deg, ${color}11, var(--neu-base))`,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span className="badge" style={{ background: `${color}22`, color, fontWeight: 700, fontSize: '0.75rem' }}>
                        Tier {idx + 1}
                      </span>
                      <span style={{ fontSize: '1.125rem', fontWeight: 800, color, fontFamily: 'var(--font-display)' }}>
                        +{rm.points} pts
                      </span>
                    </div>

                    <h4 style={{ fontSize: '1.0625rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>
                      {rm.performance_level}
                    </h4>

                    <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
                      Entitled Reward: <strong style={{ color: 'var(--text-primary)' }}>{rm.reward_item}</strong>
                    </div>
                  </div>

                  <div style={{
                    paddingTop: 12,
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: '0.75rem',
                    color: 'var(--text-tertiary)',
                  }}>
                    <CheckCircle2 size={14} color={color} />
                    <span>Automatically credited upon review finalization</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

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
              maxHeight: '90vh',
              overflowY: 'auto',
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
                        id="recipient-search-input"
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
                            className="colleague-pick-item"
                            data-employee-id={p.id}
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

              {/* Category Selection & Visual Badge Grid */}
              <div className="input-group">
                <label
                  htmlFor="badge-category-select"
                  className="input-label input-label-required"
                  style={{ fontWeight: 600, marginBottom: 8, display: 'block' }}
                >
                  Pick a Badge / Category
                </label>

                {(!peerCategories || peerCategories.length === 0) ? (
                  <div
                    id="no-categories-message"
                    style={{
                      padding: 16,
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--neu-bg-deep, #141724)',
                      border: '1px dashed var(--neu-border, rgba(255,255,255,0.15))',
                      color: 'var(--text-tertiary)',
                      textAlign: 'center',
                      fontSize: '0.875rem',
                      marginBottom: 8,
                    }}
                  >
                    No recognition categories available.
                  </div>
                ) : (
                  <>
                    {/* Explicit Visible Dropdown Control */}
                    <select
                      id="badge-category-select"
                      className="input select"
                      aria-label="Pick a Badge / Category"
                      value={selectedCategory}
                      onChange={e => setSelectedCategory(e.target.value)}
                      style={{
                        width: '100%',
                        marginBottom: 10,
                        background: 'var(--neu-bg-deep, #141724)',
                        color: 'var(--text-primary)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--neu-border, rgba(255,255,255,0.1))',
                        padding: '10px 12px',
                        fontSize: '0.875rem',
                      }}
                      required
                    >
                      <option value="" disabled style={{ color: 'var(--text-tertiary)' }}>
                        Select a badge / category…
                      </option>
                      {(peerCategories as any[])?.map((cat: any) => (
                        <option
                          key={`cat-opt-${cat.id}`}
                          value={cat.id}
                          style={{ background: '#1e2235', color: '#fff' }}
                        >
                          {cat.name} (+{cat.points} pts)
                        </option>
                      ))}
                    </select>

                    {/* Visual Badge / Category Options Grid */}
                    <div
                      id="badge-category-grid"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
                        gap: 8,
                        maxHeight: 180,
                        overflowY: 'auto',
                      }}
                    >
                    {(peerCategories as any[]).map((cat: any, idx: number) => {
                      const IconComp = ICON_COMPONENT[cat.icon] ?? Star
                      const isSelected = selectedCategory === cat.id
                      const catColor = cat.color || '#6366f1'
                      return (
                        <button
                          key={`cat-badge-${cat.id || idx}-${idx}`}
                          type="button"
                          className={`badge-category-option ${isSelected ? 'selected' : ''}`}
                          data-category-id={cat.id}
                          data-category-name={cat.name}
                          data-category-points={cat.points}
                          onClick={() => setSelectedCategory(cat.id)}
                          style={{
                            padding: '8px 10px',
                            borderRadius: 'var(--radius-md)',
                            border: `1.5px solid ${isSelected ? catColor : 'rgba(255,255,255,0.08)'}`,
                            background: isSelected ? `${catColor}25` : 'var(--neu-bg-deep, #141724)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            fontWeight: 600,
                            fontSize: '0.8125rem',
                            color: isSelected ? '#fff' : 'var(--text-primary)',
                            transition: 'all 0.15s ease',
                            textAlign: 'left',
                            boxShadow: isSelected ? `0 0 10px ${catColor}35` : 'none',
                          }}
                        >
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: '50%',
                              background: `${catColor}20`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <IconComp size={16} color={catColor} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ lineHeight: 1.2, fontWeight: 700, fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {cat.name}
                            </div>
                            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: isSelected ? catColor : 'var(--text-tertiary)' }}>
                              +{cat.points} pts
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}

                {/* Selected Badge Visual Feedback (TC-REC-004) */}
                {selectedCategory && (() => {
                  const selectedCat = (peerCategories as any[])?.find((c: any) => c.id === selectedCategory)
                  if (!selectedCat) return null
                  const IconComp = ICON_COMPONENT[selectedCat.icon] ?? Star
                  const catColor = selectedCat.color || '#6366f1'
                  return (
                    <div
                      id="selected-badge-preview"
                      style={{
                        marginTop: 8,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-md)',
                        background: `${catColor}20`,
                        border: `1.5px solid ${catColor}`,
                      }}
                    >
                      <IconComp size={18} color={catColor} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                          {selectedCat.name}
                        </span>
                        <span style={{ marginLeft: 8, fontSize: '0.75rem', fontWeight: 600, color: catColor }}>
                          +{selectedCat.points} pts
                        </span>
                      </div>
                    </div>
                  )
                })()}
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
