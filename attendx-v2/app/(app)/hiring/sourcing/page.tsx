'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, Sparkles, Filter, CheckCircle2, Globe,
  Code, Database, UserCheck, ArrowRight,
  ExternalLink, Briefcase, MapPin, Award,
  Share2, RefreshCw, Layers, AlertCircle
} from 'lucide-react'
import { PageWrapper } from '@/components/ui/PageWrapper'
import { useToast } from '@/components/ui/Toast'

export default function SourcingPage() {
  const { success, error: toastError } = useToast()
  const qc = useQueryClient()

  // Sourcing parameters
  const [selectedReqId, setSelectedReqId] = useState('')
  const [platform, setPlatform] = useState('ALL_MOCK')
  const [skillsInput, setSkillsInput] = useState('React, TypeScript, Node.js')
  const [qualificationsInput, setQualificationsInput] = useState('')
  const [minExp, setMinExp] = useState(2)
  const [location, setLocation] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [activeSearchId, setActiveSearchId] = useState<string | null>(null)
  const [providerStatuses, setProviderStatuses] = useState<Record<string, any> | null>(null)

  // Mode 1 state
  const [targetPlatforms, setTargetPlatforms] = useState<string[]>(['LINKEDIN', 'INDEED'])
  const [publishedJobs, setPublishedJobs] = useState<any[]>([])
  const [syncSummary, setSyncSummary] = useState<{ syncedCount: number; message?: string } | null>(null)

  // Requisitions query
  const { data: reqData } = useQuery({
    queryKey: ['hiring-requisitions-sourcing'],
    queryFn: async () => {
      const res = await fetch('/api/hiring/requisitions')
      if (!res.ok) return { requisitions: [] }
      return res.json()
    }
  })

  const requisitions = reqData?.requisitions || []
  const openRequisitions = requisitions.filter((r: any) => r.status === 'OPEN')
  const selectedReqObj = requisitions.find((r: any) => r.id === selectedReqId)
  const isSelectedReqEligible = Boolean(selectedReqObj && selectedReqObj.status === 'OPEN')

  // Sourcing history query (Decision 2)
  const { data: searchesData, isLoading: isLoadingSearches, isError: isErrorSearches } = useQuery({
    queryKey: ['hiring-sourcing-latest-search'],
    queryFn: async () => {
      const res = await fetch('/api/hiring/sourcing/searches?limit=1')
      if (!res.ok) throw new Error('Failed to load sourcing history')
      return res.json()
    }
  })

  // Auto-select first active eligible requisition (Decision 1 & Defect 1 Fix)
  useEffect(() => {
    if (!selectedReqId && requisitions.length > 0) {
      const firstActive = requisitions.find((r: any) => r.status === 'OPEN')?.id || requisitions[0]?.id
      if (firstActive) {
        setSelectedReqId(firstActive)
        const req = requisitions.find((r: any) => r.id === firstActive)
        if (req?.skills?.length) {
          setSkillsInput(req.skills.map((s: any) => s.skill_name || s).join(', '))
        }
      }
    }
  }, [requisitions, selectedReqId])

  // Mode 2: Run Recruiter Candidate Discovery Mutation
  const searchMutation = useMutation({
    mutationFn: async () => {
      const skillsArray = skillsInput
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)

      const platforms = platform === 'ALL_MOCK'
        ? ['linkedin', 'indeed']
        : [platform.toLowerCase()]

      const qualifications = qualificationsInput
        .split(',')
        .map(q => q.trim())
        .filter(Boolean)

      const res = await fetch('/api/hiring/sourcing/searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requisition_id: selectedReqId || undefined,
          platforms,
          skills: skillsArray,
          qualifications: qualifications.length > 0 ? qualifications : undefined,
          min_experience: Number(minExp),
          location: location || undefined,
        })
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Search failed')
      }
      return res.json()
    },
    onSuccess: (data) => {
      setSearchResults(data.candidates || [])
      setActiveSearchId(data.search?.id || null)
      if (data.providerStatuses) {
        setProviderStatuses(data.providerStatuses)
      }
      success(`Discovered ${data.candidates?.length || 0} candidate(s) via ${platform}`)
    },
    onError: (err: any) => {
      toastError(err.message || 'Sourcing search failed')
    }
  })

  // Restore latest persisted search results on mount (Decision 2)
  useEffect(() => {
    const latestList = searchesData?.searches || searchesData?.data || []
    if (latestList.length > 0 && searchResults.length === 0 && !searchMutation.isPending) {
      const latest = latestList[0]
      const candidates = latest?.candidates || latest?.sourced_candidates || []
      if (candidates.length) {
        setSearchResults(candidates)
        setActiveSearchId(latest.id)
      }
    }
  }, [searchesData, searchResults.length, searchMutation.isPending])

  // Mode 1: Publish Job Requisition to External Boards
  const publishMutation = useMutation({
    mutationFn: async (reqId: string) => {
      const res = await fetch('/api/hiring/sourcing/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requisition_id: reqId,
          platforms: targetPlatforms.length > 0 ? targetPlatforms : ['LINKEDIN', 'INDEED'],
        })
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Job posting publication failed')
      }
      return res.json()
    },
    onSuccess: (data) => {
      setPublishedJobs(data.publications || [])
      success(`Job successfully published to external job boards (Mock Mode)!`)
    },
    onError: (err: any) => {
      toastError(err.message || 'Failed to publish job')
    }
  })

  // Mode 1: Synchronize External Applicants into Pipeline
  const syncMutation = useMutation({
    mutationFn: async (reqId: string) => {
      const res = await fetch('/api/hiring/sourcing/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requisition_id: reqId,
          platforms: targetPlatforms.length > 0 ? targetPlatforms : ['LINKEDIN', 'INDEED'],
        })
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Applicant sync failed')
      }
      return res.json()
    },
    onSuccess: (data) => {
      setSyncSummary({ syncedCount: data.synced_count, message: data.message })
      success(`Synchronized ${data.synced_count} applicant(s) into Candidate Pipeline!`)
      qc.invalidateQueries({ queryKey: ['hiring-applications'] })
    },
    onError: (err: any) => {
      toastError(err.message || 'Failed to sync applicants')
    }
  })

  // Shortlist Candidate Mutation
  const shortlistMutation = useMutation({
    mutationFn: async ({ sourcedCandidateId, reqId }: { sourcedCandidateId: string; reqId: string }) => {
      const res = await fetch('/api/hiring/sourcing/shortlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourced_candidate_id: sourcedCandidateId,
          requisition_id: reqId,
        })
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Shortlisting failed')
      }
      return res.json()
    },
    onSuccess: (data, variables) => {
      setSearchResults(prev =>
        prev.map(c => c.id === variables.sourcedCandidateId ? { ...c, is_shortlisted: true } : c)
      )
      success('Candidate shortlisted into hiring pipeline!')
      qc.invalidateQueries({ queryKey: ['hiring-applications-list'] })
      qc.invalidateQueries({ queryKey: ['hiring-applications'] })
      qc.invalidateQueries({ queryKey: ['hiring-sourcing-latest-search'] })
    },
    onError: (err: any) => {
      toastError(err.message || 'Failed to shortlist candidate')
    }
  })

  const getPlatformIcon = (plat: string) => {
    switch (plat?.toUpperCase()) {
      case 'LINKEDIN':
        return <Globe size={15} color="#0077b5" />
      case 'INDEED':
        return <Briefcase size={15} color="#2164f3" />
      default:
        return <Database size={15} color="var(--accent)" />
    }
  }

  return (
    <PageWrapper style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 64 }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 28 }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '1.75rem', fontWeight: 800 }}>AI Sourcing & Talent Acquisition</h1>
          <p className="page-subtitle" style={{ color: 'var(--text-secondary)' }}>
            Dual-Mode Sourcing: Job Board Distribution + Candidate Discovery across LinkedIn and Indeed (Mock Mode).
          </p>
        </div>
      </div>

      {/* Mode 1 Card: Job Board Posting & Applicant Sync */}
      <div className="card" style={{
        padding: 24,
        borderRadius: 18,
        background: 'var(--neu-base)',
        boxShadow: 'var(--elev-1)',
        marginBottom: 24,
        border: '1px solid rgba(33, 100, 243, 0.2)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
            <Share2 size={18} color="#2164f3" /> Mode 1: Job Board Posting & Applicant Sync
          </h3>
          <span style={{
            fontSize: '0.72rem',
            padding: '2px 8px',
            borderRadius: 6,
            background: 'rgba(33, 100, 243, 0.1)',
            color: '#2164f3',
            fontWeight: 700
          }}>
            SIMULATED MOCK ADAPTERS
          </span>
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
          Publish open requisitions to simulated LinkedIn and Indeed job boards, then ingest incoming applicants automatically into the AttendX hiring pipeline.
        </p>

        {/* Platform Selection */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Target Job Boards:</span>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={targetPlatforms.includes('LINKEDIN')}
              onChange={(e) => {
                if (e.target.checked) setTargetPlatforms([...targetPlatforms, 'LINKEDIN'])
                else setTargetPlatforms(targetPlatforms.filter(p => p !== 'LINKEDIN'))
              }}
            />
            LinkedIn
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={targetPlatforms.includes('INDEED')}
              onChange={(e) => {
                if (e.target.checked) setTargetPlatforms([...targetPlatforms, 'INDEED'])
                else setTargetPlatforms(targetPlatforms.filter(p => p !== 'INDEED'))
              }}
            />
            Indeed
          </label>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <select
            value={selectedReqId}
            onChange={(e) => {
              setSelectedReqId(e.target.value)
              const req = requisitions.find((r: any) => r.id === e.target.value)
              if (req?.skills?.length) {
                setSkillsInput(req.skills.map((s: any) => s.skill_name || s).join(', '))
              }
            }}
            style={{
              padding: '9px 12px',
              borderRadius: 12,
              border: '1px solid rgba(128,128,180,0.2)',
              background: 'var(--neu-bg-raised)',
              fontSize: '0.875rem',
              color: 'var(--text-primary)',
              minWidth: 260,
            }}
          >
            <option value="">Select Target Requisition</option>
            {requisitions.map((r: any) => (
              <option key={r.id} value={r.id} disabled={r.status !== 'OPEN'}>
                {r.title} ({r.requisition_code || r.id.slice(0, 8)}){r.status !== 'OPEN' ? ` [${r.status} - Ineligible]` : ''}
              </option>
            ))}
          </select>

          <button
            onClick={() => {
              if (!selectedReqId) {
                toastError('Please select a target requisition first.')
                return
              }
              publishMutation.mutate(selectedReqId)
            }}
            disabled={publishMutation.isPending || !selectedReqId}
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', fontSize: '0.85rem' }}
          >
            <Share2 size={15} />
            {publishMutation.isPending ? 'Publishing…' : 'Publish to LinkedIn & Indeed'}
          </button>

          <button
            onClick={() => {
              if (!selectedReqId) {
                toastError('Please select a target requisition first.')
                return
              }
              syncMutation.mutate(selectedReqId)
            }}
            disabled={syncMutation.isPending || !selectedReqId}
            className="btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 16px',
              fontSize: '0.85rem',
              background: 'var(--neu-bg-raised)',
              border: '1px solid rgba(128,128,180,0.2)',
              color: 'var(--text-primary)'
            }}
          >
            <RefreshCw size={15} className={syncMutation.isPending ? 'animate-spin' : ''} />
            {syncMutation.isPending ? 'Syncing Applicants…' : 'Sync External Applicants'}
          </button>
        </div>

        {/* Publication evidence */}
        {publishedJobs.length > 0 && (
          <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: 'var(--neu-bg-deep)', fontSize: '0.82rem' }}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>Live Mock Publications:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {publishedJobs.map((p, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)' }}>
                  {getPlatformIcon(p.platform || p.providerName)}
                  <span><b>{p.platform || p.providerName}</b>: {p.jobPostingId}</span>
                  <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 2 }}>
                    View Posting URL <ExternalLink size={12} />
                  </a>
                  <span style={{ fontSize: '0.7rem', background: 'rgba(16, 185, 129, 0.15)', color: '#059669', padding: '1px 6px', borderRadius: 4 }}>
                    STATUS: {p.status} [MOCK]
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sync Summary */}
        {syncSummary && (
          <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: 'rgba(16, 185, 129, 0.1)', color: '#059669', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={16} />
            <span>{syncSummary.message || `Successfully ingested ${syncSummary.syncedCount} applicants into the pipeline.`}</span>
          </div>
        )}
      </div>

      {/* Mode 2: Sourcing Builder Card */}
      <div className="card" style={{
        padding: 24,
        borderRadius: 18,
        background: 'var(--neu-base)',
        boxShadow: 'var(--elev-1)',
        marginBottom: 32,
      }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={18} color="var(--accent)" /> Mode 2: Recruiter Candidate Discovery
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 16 }}>
          {/* Target Requisition */}
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              Target Job Requisition
            </label>
            <select
              value={selectedReqId}
              onChange={(e) => {
                setSelectedReqId(e.target.value)
                const req = requisitions.find((r: any) => r.id === e.target.value)
                if (req?.skills?.length) {
                  setSkillsInput(req.skills.map((s: any) => s.skill_name || s).join(', '))
                }
              }}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 12,
                border: '1px solid rgba(128,128,180,0.2)',
                background: 'var(--neu-bg-raised)',
                fontSize: '0.875rem',
                color: 'var(--text-primary)',
              }}
            >
              <option value="">Select Requisition (Optional)</option>
              {requisitions.map((r: any) => (
                <option key={r.id} value={r.id}>{r.title} ({r.requisition_code || r.id.slice(0, 8)})</option>
              ))}
            </select>
          </div>

          {/* Sourcing Platform */}
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              Sourcing Channel / Provider
            </label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 12,
                border: '1px solid rgba(128,128,180,0.2)',
                background: 'var(--neu-bg-raised)',
                fontSize: '0.875rem',
                color: 'var(--text-primary)',
              }}
            >
              <option value="ALL_MOCK">All External Platforms (LinkedIn + Indeed Mock)</option>
              <option value="LINKEDIN">LinkedIn Talent Search (Mock Provider)</option>
              <option value="INDEED">Indeed Resume Search (Mock Provider)</option>
              <option value="INTERNAL_DB">Internal Talent Pool & Database</option>
            </select>
          </div>

          {/* Min Experience */}
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              Min Experience: <b>{minExp} yrs</b>
            </label>
            <input
              type="range"
              min="0"
              max="15"
              step="1"
              value={minExp}
              onChange={(e) => setMinExp(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent)', marginTop: 8 }}
            />
          </div>

          {/* Location */}
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              Location Preference
            </label>
            <input
              type="text"
              placeholder="e.g. Bengaluru, Remote, Hyderabad"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 12,
                border: '1px solid rgba(128,128,180,0.2)',
                background: 'var(--neu-bg-raised)',
                fontSize: '0.875rem',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>

        {/* Required Skills Input */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
            Keywords / Core Skills (Comma-separated)
          </label>
          <input
            type="text"
            value={skillsInput}
            onChange={(e) => setSkillsInput(e.target.value)}
            placeholder="e.g. Next.js, PostgreSQL, Docker, Redis"
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid rgba(128,128,180,0.2)',
              background: 'var(--neu-bg-raised)',
              fontSize: '0.875rem',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {/* Required Qualifications Input */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
            Required Qualifications / Degrees (Comma-separated, optional)
          </label>
          <input
            type="text"
            value={qualificationsInput}
            onChange={(e) => setQualificationsInput(e.target.value)}
            placeholder="e.g. B.Tech, M.S. Computer Science, Ph.D."
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid rgba(128,128,180,0.2)',
              background: 'var(--neu-bg-raised)',
              fontSize: '0.875rem',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => searchMutation.mutate()}
            disabled={searchMutation.isPending}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px' }}
          >
            <Search size={16} />
            {searchMutation.isPending ? 'Searching Candidates…' : 'Execute Recruiter Search'}
          </button>
        </div>
      </div>

      {/* Results Section */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Ranked Sourced Candidates {searchResults.length > 0 && `(${searchResults.length})`}
          </h2>
          {searchResults.length > 0 && (
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Evaluated strictly in candidate-role context without demographic bias
            </span>
          )}
        </div>

        {isLoadingSearches ? (
          <div className="card" style={{
            padding: 48,
            textAlign: 'center',
            borderRadius: 18,
            background: 'var(--neu-base)',
            boxShadow: 'var(--elev-1)',
            color: 'var(--text-tertiary)',
          }}>
            <RefreshCw size={32} className="animate-spin" color="var(--accent)" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Loading persisted sourcing results…
            </div>
          </div>
        ) : searchResults.length === 0 ? (
          <div className="card" style={{
            padding: 48,
            textAlign: 'center',
            borderRadius: 18,
            background: 'var(--neu-base)',
            boxShadow: 'var(--elev-1)',
            color: 'var(--text-tertiary)',
          }}>
            <Search size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {isErrorSearches ? 'Unable to load previous sourcing searches' : 'No sourcing search executed yet'}
            </div>
            <p style={{ fontSize: '0.875rem', marginTop: 4 }}>
              {isErrorSearches
                ? 'Could not connect to sourcing storage. You can still select a requisition and execute a new search.'
                : 'Select target requisition and click "Execute Recruiter Search" to find qualified candidates across LinkedIn and Indeed.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 20 }}>
            {searchResults.map((cand) => (
              <div
                key={cand.id}
                className="card"
                style={{
                  padding: 22,
                  borderRadius: 16,
                  background: 'var(--neu-base)',
                  boxShadow: 'var(--elev-1)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  border: cand.is_shortlisted ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(255,255,255,0.4)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                          {cand.full_name}
                        </h3>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: '0.72rem',
                          background: 'var(--neu-bg-deep)',
                          padding: '2px 8px',
                          borderRadius: 10,
                          color: 'var(--text-secondary)'
                        }}>
                          {getPlatformIcon(cand.platform)} {cand.platform} [MOCK]
                        </span>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                        {cand.current_role} at <b>{cand.current_company || 'Undisclosed'}</b>
                      </div>
                    </div>

                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 10px',
                      borderRadius: 14,
                      fontSize: '0.85rem',
                      fontWeight: 800,
                      background: cand.match_score >= 75 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                      color: cand.match_score >= 75 ? '#059669' : '#D97706',
                    }}>
                      <Sparkles size={12} /> {Math.round(cand.match_score)}% Match
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 14, fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 10 }}>
                    <span>Experience: <b>{cand.experience_years} yrs</b></span>
                    {cand.email && <span>Email: {cand.email}</span>}
                  </div>

                  {/* Qualifications tags */}
                  {((cand.raw_profile?.qualifications || cand.qualifications || []).length > 0) && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                      {(cand.raw_profile?.qualifications || cand.qualifications).map((qual: string, i: number) => (
                        <span
                          key={i}
                          style={{
                            background: 'rgba(59, 130, 246, 0.1)',
                            color: '#2563eb',
                            padding: '2px 8px',
                            borderRadius: 6,
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            border: '1px solid rgba(59, 130, 246, 0.2)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <Award size={11} /> {qual}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Skills tags */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                    {(cand.skills || []).map((skill: string, i: number) => (
                      <span
                        key={i}
                        style={{
                          background: 'var(--neu-bg-raised)',
                          padding: '3px 8px',
                          borderRadius: 8,
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          color: 'var(--text-secondary)',
                          border: '1px solid rgba(128,128,180,0.15)',
                        }}
                      >
                        {skill}
                      </span>
                    ))}
                  </div>

                  {/* AI Reasoning quote */}
                  {cand.ai_reasoning?.reasoning && (
                    <div style={{
                      background: 'var(--neu-bg-deep)',
                      padding: '10px 12px',
                      borderRadius: 10,
                      fontSize: '0.75rem',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.4,
                      marginBottom: 16,
                    }}>
                      💡 <i>{cand.ai_reasoning.reasoning}</i>
                    </div>
                  )}
                </div>

                <div style={{ borderTop: '1px solid rgba(128,128,180,0.1)', paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {cand.profile_url ? (
                    <a
                      href={cand.profile_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: '0.78rem', color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      View Profile <ExternalLink size={12} />
                    </a>
                  ) : <span />}

                  {cand.is_shortlisted ? (
                    <span style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      color: '#059669',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                    }}>
                      <CheckCircle2 size={16} /> Shortlisted to Pipeline
                    </span>
                  ) : openRequisitions.length === 0 ? (
                    <span style={{
                      fontSize: '0.78rem',
                      color: 'var(--text-tertiary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}>
                      <AlertCircle size={14} /> No active OPEN requisitions available to shortlist into
                    </span>
                  ) : !isSelectedReqEligible ? (
                    <span style={{
                      fontSize: '0.78rem',
                      color: 'var(--text-tertiary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}>
                      <AlertCircle size={14} /> Select an active OPEN requisition to shortlist
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        if (!isSelectedReqEligible || !selectedReqId) {
                          toastError('Selected requisition is not active or eligible for shortlisting')
                          return
                        }
                        shortlistMutation.mutate({
                          sourcedCandidateId: cand.id,
                          reqId: selectedReqId,
                        })
                      }}
                      disabled={shortlistMutation.isPending || !isSelectedReqEligible}
                      className="btn btn-primary"
                      style={{ fontSize: '0.78rem', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <UserCheck size={14} /> {shortlistMutation.isPending ? 'Shortlisting…' : 'Shortlist Candidate'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageWrapper>
  )
}
