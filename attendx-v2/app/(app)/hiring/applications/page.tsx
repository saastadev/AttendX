'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, Filter, Plus, Calendar, Video, Eye,
  CheckCircle2, Clock, X, ChevronRight, Sparkles,
  User, Briefcase, Phone, Mail, Award, AlertCircle
} from 'lucide-react'
import { PageWrapper } from '@/components/ui/PageWrapper'
import { useToast } from '@/components/ui/Toast'
import { useAuthStore } from '@/store/auth.store'

interface ApplicationItem {
  id: string
  application_code: string
  stage: string
  match_score: number
  skill_score: number
  experience_score: number
  jd_relevance_score: number
  match_reasoning?: any
  current_decision: string
  applied_at: string
  candidate: {
    id: string
    full_name: string
    email: string
    phone: string
    experience_years: number
    current_ctc?: string | number
    expected_ctc?: string | number
    skills?: string[]
    resume_text?: string
  }
  requisition: {
    id: string
    title: string
    department: string
    location: string
  }
}

export default function ApplicationsPage() {
  const user = useAuthStore(s => s.user)
  const { success, error: toastError } = useToast()
  const qc = useQueryClient()

  // Filter States
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRequisition, setSelectedRequisition] = useState('ALL')
  const [selectedStage, setSelectedStage] = useState('ALL')
  const [minScore, setMinScore] = useState(0)

  // Selection & Modal States
  const [selectedAppIds, setSelectedAppIds] = useState<string[]>([])
  const [schedulingApp, setSchedulingApp] = useState<ApplicationItem | null>(null)
  const [candidateDrawer, setCandidateDrawer] = useState<ApplicationItem | null>(null)
  const [activeTooltipId, setActiveTooltipId] = useState<string | null>(null)

  // Interview Schedule Form
  const [scheduleForm, setScheduleForm] = useState({
    title: '',
    round_type: 'TECHNICAL',
    platform: 'GOOGLE_MEET',
    scheduled_start: '',
    scheduled_end: '',
    duration_minutes: 45,
    timezone: 'UTC',
    notes: '',
  })

  // Queries
  const { data: reqData } = useQuery({
    queryKey: ['hiring-requisitions-filter'],
    queryFn: async () => {
      const res = await fetch('/api/hiring/requisitions')
      if (!res.ok) return { requisitions: [] }
      return res.json()
    }
  })

  const { data: appData, isLoading } = useQuery({
    queryKey: ['hiring-applications-list', selectedRequisition, selectedStage, minScore],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (selectedRequisition !== 'ALL') params.set('requisition_id', selectedRequisition)
      if (selectedStage !== 'ALL') params.set('stage', selectedStage)
      if (minScore > 0) params.set('min_score', String(minScore))
      params.set('limit', '100')

      const res = await fetch(`/api/hiring/applications?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load applications')
      return res.json()
    }
  })

  const applications: ApplicationItem[] = appData?.applications || []
  const requisitions = reqData?.requisitions || []

  // Filter by search term
  const filteredApps = useMemo(() => {
    if (!searchTerm.trim()) return applications
    const term = searchTerm.toLowerCase()
    return applications.filter(a =>
      a.candidate?.full_name?.toLowerCase().includes(term) ||
      a.candidate?.email?.toLowerCase().includes(term) ||
      a.requisition?.title?.toLowerCase().includes(term) ||
      a.application_code?.toLowerCase().includes(term)
    )
  }, [applications, searchTerm])

  // Bulk Selection Handlers
  const toggleSelectAll = () => {
    if (selectedAppIds.length === filteredApps.length) {
      setSelectedAppIds([])
    } else {
      setSelectedAppIds(filteredApps.map(a => a.id))
    }
  }

  const toggleSelectOne = (id: string) => {
    setSelectedAppIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  // Interview Schedule Mutation
  const scheduleMutation = useMutation({
    mutationFn: async () => {
      if (!schedulingApp) throw new Error('No candidate selected')
      if (!scheduleForm.scheduled_start) throw new Error('Start time is required')

      const start = new Date(scheduleForm.scheduled_start)
      const end = new Date(start.getTime() + scheduleForm.duration_minutes * 60 * 1000)

      const res = await fetch(`/api/hiring/applications/${schedulingApp.id}/move-to-interview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: scheduleForm.title || `${scheduleForm.round_type} Interview - ${schedulingApp.candidate.full_name}`,
          round_type: scheduleForm.round_type,
          platform: scheduleForm.platform,
          scheduled_start: start.toISOString(),
          scheduled_end: end.toISOString(),
          timezone: scheduleForm.timezone,
          notes: scheduleForm.notes,
        })
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to schedule interview')
      }
      return res.json()
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hiring-applications-list'] })
      success(`Interview scheduled successfully! Meeting link: ${data.interview?.meeting_link || 'Generated'}`)
      setSchedulingApp(null)
    },
    onError: (err: any) => {
      toastError(err.message || 'Scheduling failed')
    }
  })

  // Bulk Move Mutation
  const bulkMoveMutation = useMutation({
    mutationFn: async (targetStage: string) => {
      const res = await fetch('/api/hiring/applications/bulk-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_ids: selectedAppIds,
          action: 'TRANSITION_STAGE',
          target_stage: targetStage,
        })
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Bulk action failed')
      }
      return res.json()
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hiring-applications-list'] })
      success(`Successfully updated ${data.results?.length || selectedAppIds.length} candidate applications.`)
      setSelectedAppIds([])
    },
    onError: (err: any) => {
      toastError(err.message || 'Bulk transition failed')
    }
  })

  // Helper score color
  const getScoreColor = (score: number) => {
    if (score >= 75) return { bg: 'rgba(16, 185, 129, 0.15)', text: '#059669', border: 'rgba(16, 185, 129, 0.3)' }
    if (score >= 50) return { bg: 'rgba(245, 158, 11, 0.15)', text: '#D97706', border: 'rgba(245, 158, 11, 0.3)' }
    return { bg: 'rgba(239, 68, 68, 0.15)', text: '#DC2626', border: 'rgba(239, 68, 68, 0.3)' }
  }

  // Format currency
  const formatCurrency = (val: any) => {
    if (val === undefined || val === null) return '—'
    if (typeof val === 'string' && val.includes('Confidential')) return '🔒 Confidential'
    const num = Number(val)
    if (isNaN(num)) return String(val)
    return `₹${num.toLocaleString('en-IN')}`
  }

  return (
    <PageWrapper style={{ maxWidth: 1300, margin: '0 auto', paddingBottom: 64 }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '1.75rem', fontWeight: 800 }}>Candidate Applications</h1>
          <p className="page-subtitle" style={{ color: 'var(--text-secondary)' }}>
            Review applicants, inspect bias-free AI match scores, and move candidates into interview rounds.
          </p>
        </div>
        {selectedAppIds.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent)' }}>
              {selectedAppIds.length} selected
            </span>
            <button
              onClick={() => bulkMoveMutation.mutate('SHORTLISTED')}
              className="btn btn-secondary"
              style={{ fontSize: '0.85rem' }}
            >
              Shortlist Selected
            </button>
            <button
              onClick={() => {
                const firstSelected = applications.find(a => a.id === selectedAppIds[0])
                if (firstSelected) setSchedulingApp(firstSelected)
              }}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
            >
              <Calendar size={15} /> Move to Interview
            </button>
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <div className="card" style={{
        padding: '16px 20px',
        borderRadius: 16,
        background: 'var(--neu-base)',
        boxShadow: 'var(--elev-1)',
        marginBottom: 24,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 16,
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', flex: 1 }}>
          {/* Search Box */}
          <div style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            minWidth: 260,
            background: 'var(--neu-bg-raised)',
            borderRadius: 12,
            boxShadow: 'var(--elev-0)',
            padding: '0 12px',
          }}>
            <Search size={16} color="var(--text-tertiary)" />
            <input
              type="text"
              placeholder="Search by name, role, email…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                border: 'none',
                background: 'transparent',
                padding: '10px 8px',
                fontSize: '0.875rem',
                outline: 'none',
                width: '100%',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Requisition Filter */}
          <select
            value={selectedRequisition}
            onChange={(e) => setSelectedRequisition(e.target.value)}
            style={{
              padding: '9px 14px',
              borderRadius: 12,
              border: '1px solid rgba(128,128,180,0.2)',
              background: 'var(--neu-bg-raised)',
              fontSize: '0.875rem',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          >
            <option value="ALL">All Requisitions</option>
            {requisitions.map((r: any) => (
              <option key={r.id} value={r.id}>{r.title} ({typeof r.department === 'object' ? r.department?.name : r.department})</option>
            ))}
          </select>

          {/* Stage Filter */}
          <select
            value={selectedStage}
            onChange={(e) => setSelectedStage(e.target.value)}
            style={{
              padding: '9px 14px',
              borderRadius: 12,
              border: '1px solid rgba(128,128,180,0.2)',
              background: 'var(--neu-bg-raised)',
              fontSize: '0.875rem',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          >
            <option value="ALL">All Pipeline Stages</option>
            <option value="APPLIED">Applied</option>
            <option value="SHORTLISTED">Shortlisted</option>
            <option value="INTERVIEW">Interview</option>
            <option value="SELECTED">Selected</option>
            <option value="OFFER_RELEASED">Offer Released</option>
            <option value="DOCUMENTS_PENDING">Documents Pending</option>
            <option value="ONBOARDED">Onboarded</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>

        {/* Min Match Score Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-tertiary)' }}>
            Min Match: <b style={{ color: 'var(--accent)' }}>{minScore}%</b>
          </span>
          <input
            type="range"
            min="0"
            max="95"
            step="5"
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            style={{ width: 100, accentColor: 'var(--accent)' }}
          />
        </div>
      </div>

      {/* Applications Table */}
      <div className="card" style={{
        borderRadius: 18,
        background: 'var(--neu-base)',
        boxShadow: 'var(--elev-1)',
        overflow: 'hidden',
      }}>
        {isLoading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)' }}>
            Loading candidate applications…
          </div>
        ) : filteredApps.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)' }}>
            <Award size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>No applications found</div>
            <p style={{ fontSize: '0.875rem', marginTop: 4 }}>Adjust your search or filter parameters to view candidates.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{
                  background: 'var(--neu-bg-deep)',
                  borderBottom: '1px solid rgba(128,128,180,0.15)',
                  color: 'var(--text-tertiary)',
                  fontSize: '0.78rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}>
                  <th style={{ padding: '12px 16px', width: 40 }}>
                    <input
                      type="checkbox"
                      checked={selectedAppIds.length === filteredApps.length && filteredApps.length > 0}
                      onChange={toggleSelectAll}
                      style={{ accentColor: 'var(--accent)' }}
                    />
                  </th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Candidate</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Applied Role</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Match Score</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Experience</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Current / Expected CTC</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Stage</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredApps.map((app) => {
                  const scoreColor = getScoreColor(app.match_score)
                  const isSelected = selectedAppIds.includes(app.id)

                  return (
                    <tr
                      key={app.id}
                      style={{
                        borderBottom: '1px solid rgba(128,128,180,0.08)',
                        background: isSelected ? 'rgba(79, 70, 229, 0.04)' : 'transparent',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      <td style={{ padding: '14px 16px' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(app.id)}
                          style={{ accentColor: 'var(--accent)' }}
                        />
                      </td>

                      {/* Candidate Name & Contact */}
                      <td style={{ padding: '14px 16px' }}>
                        <div
                          onClick={() => setCandidateDrawer(app)}
                          style={{ cursor: 'pointer' }}
                        >
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            {app.candidate?.full_name}
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>
                              ({app.application_code})
                            </span>
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                            {app.candidate?.email} • {app.candidate?.phone || 'No phone'}
                          </div>
                        </div>
                      </td>

                      {/* Applied Role */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {app.requisition?.title || 'General Application'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                          {(() => { const d = app.requisition?.department; return typeof d === 'object' ? (d as any)?.name : d })()} • {app.requisition?.location}
                        </div>
                      </td>

                      {/* Match Score Badge with Popover breakdown */}
                      <td style={{ padding: '14px 16px', position: 'relative' }}>
                        <div
                          onMouseEnter={() => setActiveTooltipId(app.id)}
                          onMouseLeave={() => setActiveTooltipId(null)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '4px 10px',
                            borderRadius: 14,
                            fontSize: '0.82rem',
                            fontWeight: 800,
                            background: scoreColor.bg,
                            color: scoreColor.text,
                            border: `1px solid ${scoreColor.border}`,
                            cursor: 'help',
                          }}
                        >
                          <Sparkles size={12} />
                          {Math.round(app.match_score)}%
                        </div>

                        {/* Tooltip Breakdown */}
                        {activeTooltipId === app.id && (
                          <div style={{
                            position: 'absolute',
                            top: 40,
                            left: 16,
                            zIndex: 40,
                            background: 'var(--neu-bg-raised)',
                            boxShadow: 'var(--elev-3)',
                            borderRadius: 12,
                            padding: 12,
                            minWidth: 200,
                            border: '1px solid rgba(128,128,180,0.2)',
                            fontSize: '0.75rem',
                          }}>
                            <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>
                              AI Match Breakdown
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ color: 'var(--text-secondary)' }}>Skills Match (50%):</span>
                              <b style={{ color: 'var(--text-primary)' }}>{Math.round(app.skill_score)}%</b>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ color: 'var(--text-secondary)' }}>Experience (30%):</span>
                              <b style={{ color: 'var(--text-primary)' }}>{Math.round(app.experience_score)}%</b>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>JD Relevance (20%):</span>
                              <b style={{ color: 'var(--text-primary)' }}>{Math.round(app.jd_relevance_score)}%</b>
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Experience */}
                      <td style={{ padding: '14px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>
                        {app.candidate?.experience_years ? `${app.candidate.experience_years} yrs` : 'Entry Level'}
                      </td>

                      {/* Current / Expected CTC */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {formatCurrency(app.candidate?.expected_ctc)} <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>(Exp)</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {formatCurrency(app.candidate?.current_ctc)} (Cur)
                        </div>
                      </td>

                      {/* Stage Badge */}
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: 12,
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          background: app.stage === 'REJECTED'
                            ? 'rgba(239, 68, 68, 0.15)'
                            : app.stage === 'ONBOARDED'
                            ? 'rgba(16, 185, 129, 0.15)'
                            : 'rgba(79, 70, 229, 0.12)',
                          color: app.stage === 'REJECTED'
                            ? '#DC2626'
                            : app.stage === 'ONBOARDED'
                            ? '#059669'
                            : 'var(--accent)',
                        }}>
                          {app.stage.replace(/_/g, ' ')}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                          <button
                            onClick={() => setCandidateDrawer(app)}
                            title="View Profile & Resume"
                            style={{
                              background: 'var(--neu-bg-raised)',
                              border: 'none',
                              borderRadius: 8,
                              padding: '6px 8px',
                              cursor: 'pointer',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            onClick={() => {
                              setSchedulingApp(app)
                              setScheduleForm(prev => ({
                                ...prev,
                                title: `Technical Round - ${app.candidate?.full_name}`,
                              }))
                            }}
                            className="btn btn-primary"
                            style={{
                              padding: '5px 10px',
                              fontSize: '0.78rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Video size={13} /> Interview
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Interview Scheduling Modal */}
      {schedulingApp && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          backdropFilter: 'blur(4px)',
        }}>
          <div className="card" style={{
            width: '100%',
            maxWidth: 540,
            background: 'var(--neu-base)',
            boxShadow: 'var(--elev-4)',
            borderRadius: 20,
            padding: 28,
            maxHeight: '90vh',
            overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Schedule Interview
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                  Candidate: <b>{schedulingApp.candidate?.full_name}</b> ({schedulingApp.requisition?.title})
                </p>
              </div>
              <button
                onClick={() => setSchedulingApp(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
                  Interview Title
                </label>
                <input
                  type="text"
                  value={scheduleForm.title}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, title: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(128,128,180,0.2)',
                    background: 'var(--neu-bg-raised)',
                    fontSize: '0.875rem',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
                    Round Type
                  </label>
                  <select
                    value={scheduleForm.round_type}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, round_type: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(128,128,180,0.2)',
                      background: 'var(--neu-bg-raised)',
                      fontSize: '0.875rem',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <option value="HR">HR Screening</option>
                    <option value="TECHNICAL">Technical Round</option>
                    <option value="MANAGERIAL">Managerial Round</option>
                    <option value="FINAL">Final Leadership</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
                    Meeting Platform
                  </label>
                  <select
                    value={scheduleForm.platform}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, platform: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(128,128,180,0.2)',
                      background: 'var(--neu-bg-raised)',
                      fontSize: '0.875rem',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <option value="GOOGLE_MEET">Google Meet</option>
                    <option value="ZOOM">Zoom Meetings</option>
                    <option value="TEAMS">Microsoft Teams</option>
                    <option value="IN_PERSON">In Person (Office)</option>
                    <option value="PHONE">Phone Call</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
                    Date & Start Time
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduleForm.scheduled_start}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, scheduled_start: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(128,128,180,0.2)',
                      background: 'var(--neu-bg-raised)',
                      fontSize: '0.875rem',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
                    Duration (Mins)
                  </label>
                  <input
                    type="number"
                    min="15"
                    step="15"
                    value={scheduleForm.duration_minutes}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, duration_minutes: Number(e.target.value) })}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(128,128,180,0.2)',
                      background: 'var(--neu-bg-raised)',
                      fontSize: '0.875rem',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
                  Interviewer Notes & Preparation
                </label>
                <textarea
                  rows={3}
                  value={scheduleForm.notes}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, notes: e.target.value })}
                  placeholder="Topics to evaluate, specific architectural challenges…"
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(128,128,180,0.2)',
                    background: 'var(--neu-bg-raised)',
                    fontSize: '0.875rem',
                    color: 'var(--text-primary)',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{
                background: 'var(--neu-bg-deep)',
                padding: '12px 14px',
                borderRadius: 10,
                fontSize: '0.78rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.4,
              }}>
                ℹ️ Automatically generates video conference link, sends candidate email invitation, and generates standard calendar <code>.ics</code> event.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
              <button
                onClick={() => setSchedulingApp(null)}
                className="btn btn-secondary"
                disabled={scheduleMutation.isPending}
              >
                Cancel
              </button>
              <button
                onClick={() => scheduleMutation.mutate()}
                className="btn btn-primary"
                disabled={scheduleMutation.isPending}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {scheduleMutation.isPending ? 'Scheduling…' : 'Confirm & Send Invite'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Candidate Details Drawer */}
      {candidateDrawer && (
        <div style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 520,
          maxWidth: '100%',
          height: '100%',
          background: 'var(--neu-base)',
          boxShadow: 'var(--elev-4)',
          zIndex: 10000,
          padding: 28,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {candidateDrawer.candidate?.full_name}
                </h3>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                  Applied for <b>{candidateDrawer.requisition?.title}</b>
                </div>
              </div>
              <button
                onClick={() => setCandidateDrawer(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Match summary */}
            <div style={{
              background: 'var(--neu-bg-raised)',
              boxShadow: 'var(--elev-1)',
              borderRadius: 14,
              padding: 16,
              marginBottom: 20,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  AI Match Profile
                </span>
                <span style={{
                  fontSize: '0.9rem',
                  fontWeight: 800,
                  color: getScoreColor(candidateDrawer.match_score).text,
                }}>
                  {Math.round(candidateDrawer.match_score)}% Overall
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Skills: <b>{Math.round(candidateDrawer.skill_score)}%</b> | Experience: <b>{Math.round(candidateDrawer.experience_score)}%</b> | Relevancy: <b>{Math.round(candidateDrawer.jd_relevance_score)}%</b>
              </div>
            </div>

            {/* Candidate Metadata */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24, fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-secondary)' }}>
                <Mail size={16} color="var(--accent)" /> {candidateDrawer.candidate?.email}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-secondary)' }}>
                <Phone size={16} color="var(--accent)" /> {candidateDrawer.candidate?.phone || 'Not provided'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-secondary)' }}>
                <Briefcase size={16} color="var(--accent)" /> Experience: {candidateDrawer.candidate?.experience_years} years
              </div>
            </div>

            {/* Resume Text Snippet */}
            <div>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                Parsed Resume Content
              </h4>
              <div style={{
                background: 'var(--neu-bg-deep)',
                borderRadius: 12,
                padding: 14,
                fontSize: '0.8rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-secondary)',
                maxHeight: 260,
                overflowY: 'auto',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
              }}>
                {candidateDrawer.candidate?.resume_text || 'No resume text available for this candidate.'}
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid rgba(128,128,180,0.15)', paddingTop: 16, marginTop: 24, display: 'flex', gap: 10 }}>
            <button
              onClick={() => {
                setCandidateDrawer(null)
                setSchedulingApp(candidateDrawer)
              }}
              className="btn btn-primary"
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <Video size={16} /> Schedule Interview
            </button>
            <button
              onClick={() => setCandidateDrawer(null)}
              className="btn btn-secondary"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </PageWrapper>
  )
}
