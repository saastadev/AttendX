'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, Sparkles, Filter, CheckCircle2, Globe,
  Code, Database, UserCheck, ArrowRight,
  ExternalLink, Briefcase, MapPin, Award
} from 'lucide-react'
import { PageWrapper } from '@/components/ui/PageWrapper'
import { useToast } from '@/components/ui/Toast'

export default function SourcingPage() {
  const { success, error: toastError } = useToast()
  const qc = useQueryClient()

  // Sourcing parameters
  const [selectedReqId, setSelectedReqId] = useState('')
  const [platform, setPlatform] = useState('INTERNAL_DB')
  const [skillsInput, setSkillsInput] = useState('React, TypeScript, Node.js')
  const [minExp, setMinExp] = useState(2)
  const [location, setLocation] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [activeSearchId, setActiveSearchId] = useState<string | null>(null)

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

  // Run Search Mutation
  const searchMutation = useMutation({
    mutationFn: async () => {
      const skillsArray = skillsInput
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)

      const res = await fetch('/api/hiring/sourcing/searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requisition_id: selectedReqId || undefined,
          platform,
          skills: skillsArray,
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
      success(`Found ${data.candidates?.length || 0} matching candidates from ${platform}`)
    },
    onError: (err: any) => {
      toastError(err.message || 'Sourcing search failed')
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
    },
    onError: (err: any) => {
      toastError(err.message || 'Failed to shortlist candidate')
    }
  })

  const getPlatformIcon = (plat: string) => {
    switch (plat?.toUpperCase()) {
      case 'GITHUB':
        return <Code size={16} />
      case 'LINKEDIN':
        return <Globe size={16} color="#0077b5" />
      default:
        return <Database size={16} color="var(--accent)" />
    }
  }

  return (
    <PageWrapper style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 64 }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 28 }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '1.75rem', fontWeight: 800 }}>AI Sourcing & Talent Discovery</h1>
          <p className="page-subtitle" style={{ color: 'var(--text-secondary)' }}>
            Search candidate pools across platforms with algorithmic bias-free match evaluation.
          </p>
        </div>
      </div>

      {/* Sourcing Builder Card */}
      <div className="card" style={{
        padding: 24,
        borderRadius: 18,
        background: 'var(--neu-base)',
        boxShadow: 'var(--elev-1)',
        marginBottom: 32,
      }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={18} color="var(--accent)" /> Search Parameters & Target Role
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
              <option key={r.id} value={r.id}>{r.title} ({typeof r.department === 'object' ? r.department?.name : r.department})</option>
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
              <option value="INTERNAL_DB">Internal Talent Pool & Database</option>
              <option value="LINKEDIN">LinkedIn Talent Search (Provider Stub)</option>
              <option value="GITHUB">GitHub Developer Sourcing (Provider Stub)</option>
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
              placeholder="e.g. Bangalore, Remote, Pune"
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
        <div style={{ marginBottom: 20 }}>
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

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => searchMutation.mutate()}
            disabled={searchMutation.isPending}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px' }}
          >
            <Search size={16} />
            {searchMutation.isPending ? 'Searching Candidates…' : 'Execute AI Search'}
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
              Sorted by bias-free algorithmic match score
            </span>
          )}
        </div>

        {searchResults.length === 0 ? (
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
              No sourcing search executed yet
            </div>
            <p style={{ fontSize: '0.875rem', marginTop: 4 }}>
              Select target requisition and click "Execute AI Search" to find qualified candidates.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
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
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
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
                          {getPlatformIcon(cand.platform)} {cand.platform}
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
                      <Sparkles size={12} /> {Math.round(cand.match_score)}%
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 14, fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 14 }}>
                    <span>Experience: <b>{cand.experience_years} yrs</b></span>
                    {cand.email && <span>Email: {cand.email}</span>}
                  </div>

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
                      View Source <ExternalLink size={12} />
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
                  ) : (
                    <button
                      onClick={() => {
                        const targetReq = selectedReqId || (requisitions[0]?.id)
                        if (!targetReq) {
                          toastError('Please select a target requisition to shortlist candidate')
                          return
                        }
                        shortlistMutation.mutate({
                          sourcedCandidateId: cand.id,
                          reqId: targetReq,
                        })
                      }}
                      className="btn btn-primary"
                      style={{ fontSize: '0.78rem', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <UserCheck size={14} /> Shortlist Candidate
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
