'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Mail, MessageSquare, Send, CheckCircle2, Clock,
  Eye, RefreshCcw, Plus, Sparkles, Filter, ChevronRight, X, ExternalLink
} from 'lucide-react'
import { PageWrapper } from '@/components/ui/PageWrapper'
import { useToast } from '@/components/ui/Toast'
import { TemplateEngine } from '@/lib/hiring/template-engine'

export default function OutreachPage() {
  const { success, error: toastError } = useToast()
  const qc = useQueryClient()

  const [activeTab, setActiveTab] = useState<'CAMPAIGNS' | 'TEMPLATES' | 'MESSAGES'>('CAMPAIGNS')
  const [showNewCampaign, setShowNewCampaign] = useState(false)
  const [showDispatchModal, setShowDispatchModal] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null)
  const [previewMode, setPreviewMode] = useState<'RENDERED' | 'RAW'>('RENDERED')

  // Campaign Form State
  const [campaignForm, setCampaignForm] = useState({
    name: '',
    requisition_id: '',
    channels: ['EMAIL'],
    status: 'ACTIVE',
    total_targeted: 10,
  })

  // Dispatch Message Form State
  const [dispatchForm, setDispatchForm] = useState({
    candidate_id: '',
    campaign_id: '',
    channel: 'EMAIL',
    subject: '',
    body: '',
  })

  // 1. Fetch campaigns
  const { data: campaignData, isLoading: campaignsLoading } = useQuery({
    queryKey: ['hiring-outreach-campaigns'],
    queryFn: async () => {
      const res = await fetch('/api/hiring/outreach/campaigns')
      if (!res.ok) return { campaigns: [] }
      return res.json()
    }
  })

  // 2. Fetch templates
  const { data: templateData, isLoading: templatesLoading } = useQuery({
    queryKey: ['hiring-outreach-templates'],
    queryFn: async () => {
      const res = await fetch('/api/hiring/outreach/templates')
      if (!res.ok) return { templates: [] }
      return res.json()
    }
  })

  // 3. Fetch authoritative delivery & response messages
  const { data: messagesData, isLoading: messagesLoading } = useQuery({
    queryKey: ['hiring-outreach-messages'],
    queryFn: async () => {
      const res = await fetch('/api/hiring/outreach/messages')
      if (!res.ok) return { messages: [] }
      return res.json()
    }
  })

  // 4. Fetch requisitions for campaign selector
  const { data: reqData } = useQuery({
    queryKey: ['hiring-requisitions-select'],
    queryFn: async () => {
      const res = await fetch('/api/hiring/requisitions')
      if (!res.ok) return { data: [] }
      return res.json()
    }
  })

  // 5. Fetch candidates for message dispatch
  const { data: candData } = useQuery({
    queryKey: ['hiring-candidates-select'],
    queryFn: async () => {
      const res = await fetch('/api/hiring/candidates')
      if (!res.ok) return { data: [] }
      return res.json()
    }
  })

  const campaigns = campaignData?.campaigns || campaignData?.data || []
  const templates = templateData?.templates || templateData?.data || []
  const messages = messagesData?.messages || messagesData?.data || []
  const requisitions = reqData?.data || reqData?.requisitions || []
  const candidates = candData?.data || candData?.candidates || []

  // Auto-select initial template if none selected
  useEffect(() => {
    if (templates.length > 0 && !selectedTemplate) {
      setSelectedTemplate(templates[0])
    }
  }, [templates, selectedTemplate])

  // Create Campaign Mutation
  const createCampaignMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/hiring/outreach/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campaignForm),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create campaign')
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hiring-outreach-campaigns'] })
      setShowNewCampaign(false)
      setCampaignForm({
        name: '',
        requisition_id: '',
        channels: ['EMAIL'],
        status: 'ACTIVE',
        total_targeted: 10,
      })
      success('Outreach campaign created and persisted!')
    },
    onError: (err: any) => {
      toastError(err.message || 'Failed to create campaign')
    }
  })

  // Dispatch Outreach Message Mutation
  const dispatchMessageMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/hiring/outreach/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_id: dispatchForm.candidate_id,
          campaign_id: dispatchForm.campaign_id || undefined,
          template_id: selectedTemplate?.id || undefined,
          channel: dispatchForm.channel || selectedTemplate?.channel || 'EMAIL',
          subject: dispatchForm.subject || undefined,
          body: dispatchForm.body || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to dispatch message')
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hiring-outreach-messages'] })
      qc.invalidateQueries({ queryKey: ['hiring-outreach-campaigns'] })
      setShowDispatchModal(false)
      success('Outreach message dispatched and tracked in Delivery & Responses!')
    },
    onError: (err: any) => {
      toastError(err.message || 'Message dispatch failed')
    }
  })

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'REPLIED':
        return { bg: 'rgba(16, 185, 129, 0.15)', text: '#059669', label: 'Replied' }
      case 'OPENED':
        return { bg: 'rgba(6, 182, 212, 0.15)', text: '#0891B2', label: 'Opened' }
      case 'DELIVERED':
        return { bg: 'rgba(245, 158, 11, 0.15)', text: '#D97706', label: 'Delivered' }
      case 'SENT':
        return { bg: 'rgba(79, 70, 229, 0.15)', text: '#4F46E5', label: 'Sent' }
      case 'PENDING':
      case 'PENDING_DELIVERY':
        return { bg: 'var(--neu-bg-deep)', text: 'var(--text-tertiary)', label: 'Pending Delivery' }
      case 'FAILED':
      case 'BOUNCED':
        return { bg: 'rgba(239, 68, 68, 0.15)', text: '#DC2626', label: 'Failed' }
      default:
        return { bg: 'var(--neu-bg-deep)', text: 'var(--text-tertiary)', label: status }
    }
  }

  // Handlebars Live Preview computation for specimen candidate
  const specimenPreview = selectedTemplate
    ? TemplateEngine.preview(selectedTemplate.body_template, {
        company_name: 'AttendX Enterprise',
        companyName: 'AttendX Enterprise',
        recruiter_name: 'Carol HR',
        recruiterName: 'Carol HR',
      })
    : null

  const renderedSubject = (selectedTemplate && selectedTemplate.subject)
    ? TemplateEngine.render(selectedTemplate.subject, specimenPreview?.variablesUsed || {})
    : null

  return (
    <PageWrapper style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 64 }}>
      {/* Header */}
      <div className="page-header" style={{
        marginBottom: 24,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16
      }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '1.75rem', fontWeight: 800 }}>Email Outreach & Engagement</h1>
          <p className="page-subtitle" style={{ color: 'var(--text-secondary)' }}>
            Personalized candidate outreach campaigns, dynamic templates, and response tracking.
          </p>
        </div>
        <button
          onClick={() => setShowNewCampaign(true)}
          className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 12, fontWeight: 700 }}
        >
          <Plus size={18} /> New Campaign
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, borderBottom: '1px solid rgba(128,128,180,0.15)', paddingBottom: 12 }}>
        <button
          onClick={() => setActiveTab('CAMPAIGNS')}
          style={{
            background: activeTab === 'CAMPAIGNS' ? 'var(--accent)' : 'transparent',
            color: activeTab === 'CAMPAIGNS' ? '#fff' : 'var(--text-secondary)',
            border: 'none',
            padding: '8px 18px',
            borderRadius: 12,
            fontWeight: 700,
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          Campaigns ({campaigns.length})
        </button>
        <button
          onClick={() => setActiveTab('TEMPLATES')}
          style={{
            background: activeTab === 'TEMPLATES' ? 'var(--accent)' : 'transparent',
            color: activeTab === 'TEMPLATES' ? '#fff' : 'var(--text-secondary)',
            border: 'none',
            padding: '8px 18px',
            borderRadius: 12,
            fontWeight: 700,
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          Templates ({templates.length})
        </button>
        <button
          onClick={() => setActiveTab('MESSAGES')}
          style={{
            background: activeTab === 'MESSAGES' ? 'var(--accent)' : 'transparent',
            color: activeTab === 'MESSAGES' ? '#fff' : 'var(--text-secondary)',
            border: 'none',
            padding: '8px 18px',
            borderRadius: 12,
            fontWeight: 700,
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          Delivery & Responses ({messages.length})
        </button>
      </div>

      {/* Tab 1: Campaigns */}
      {activeTab === 'CAMPAIGNS' && (
        <div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 20,
          }}>
            {campaigns.length === 0 ? (
              <div className="card" style={{
                padding: 40,
                textAlign: 'center',
                gridColumn: '1 / -1',
                borderRadius: 16,
                background: 'var(--neu-base)',
                boxShadow: 'var(--elev-1)',
                color: 'var(--text-tertiary)',
              }}>
                <Mail size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
                <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>No active campaigns</div>
                <p style={{ fontSize: '0.875rem', marginTop: 4 }}>Default outreach templates are configured and ready for dispatch.</p>
                <button
                  onClick={() => setShowNewCampaign(true)}
                  className="btn btn-primary"
                  style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Plus size={16} /> Create First Campaign
                </button>
              </div>
            ) : (
              campaigns.map((camp: any) => (
                <div
                  key={camp.id}
                  className="card"
                  style={{
                    padding: 24,
                    borderRadius: 16,
                    background: 'var(--neu-base)',
                    boxShadow: 'var(--elev-1)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                    <div>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{camp.name}</h3>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: 4 }}>
                        Role: {camp.requisition?.title || 'General Hiring'}
                      </div>
                    </div>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: 10,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      background: camp.status === 'ACTIVE' ? 'rgba(16, 185, 129, 0.15)' : 'var(--neu-bg-deep)',
                      color: camp.status === 'ACTIVE' ? '#059669' : 'var(--text-tertiary)',
                    }}>
                      {camp.status}
                    </span>
                  </div>

                  {/* Funnel Metrics */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 8,
                    background: 'var(--neu-bg-deep)',
                    padding: 12,
                    borderRadius: 12,
                    textAlign: 'center',
                    marginBottom: 16,
                  }}>
                    <div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{camp.total_targeted || 0}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>Targeted</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent)' }}>{camp.total_sent || 0}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>Sent</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#06B6D4' }}>{camp.total_opened || 0}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>Opened</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#10B981' }}>{camp.total_replied || 0}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>Replied</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      Channels: {(camp.channels || ['EMAIL']).join(', ')}
                    </div>
                    <button
                      onClick={() => {
                        setDispatchForm(prev => ({ ...prev, campaign_id: camp.id }))
                        setActiveTab('TEMPLATES')
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--accent)',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      Use Template <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Templates */}
      {activeTab === 'TEMPLATES' && (
        <div className="neu-responsive-split">
          {/* Templates List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {templates.length === 0 ? (
              <div className="card" style={{ padding: 24, textAlign: 'center', borderRadius: 14, color: 'var(--text-tertiary)' }}>
                No templates configured.
              </div>
            ) : (
              templates.map((tpl: any) => (
                <div
                  key={tpl.id}
                  onClick={() => setSelectedTemplate(tpl)}
                  className="card card-hover"
                  style={{
                    padding: 18,
                    borderRadius: 14,
                    background: selectedTemplate?.id === tpl.id ? 'var(--neu-bg-raised)' : 'var(--neu-base)',
                    boxShadow: 'var(--elev-1)',
                    cursor: 'pointer',
                    border: selectedTemplate?.id === tpl.id ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.4)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {tpl.name}
                    </h4>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: 'var(--neu-bg-deep)', color: 'var(--text-secondary)' }}>
                      {tpl.channel}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
                    Subject: <i>{tpl.subject || 'Direct Message'}</i>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(tpl.variables || []).map((v: string, i: number) => (
                      <span key={i} style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', background: 'var(--neu-bg-deep)', padding: '2px 6px', borderRadius: 6, color: 'var(--accent)' }}>
                        {`{{${v}}}`}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Template Live Preview */}
          <div className="card" style={{
            padding: 24,
            borderRadius: 16,
            background: 'var(--neu-base)',
            boxShadow: 'var(--elev-1)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Template Live Preview
              </h3>
              {selectedTemplate && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ display: 'flex', background: 'var(--neu-bg-deep)', padding: 3, borderRadius: 8, gap: 4 }}>
                    <button
                      onClick={() => setPreviewMode('RENDERED')}
                      style={{
                        background: previewMode === 'RENDERED' ? 'var(--neu-base)' : 'transparent',
                        color: previewMode === 'RENDERED' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                        border: 'none',
                        borderRadius: 6,
                        padding: '4px 8px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Rendered
                    </button>
                    <button
                      onClick={() => setPreviewMode('RAW')}
                      style={{
                        background: previewMode === 'RAW' ? 'var(--neu-base)' : 'transparent',
                        color: previewMode === 'RAW' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                        border: 'none',
                        borderRadius: 6,
                        padding: '4px 8px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Raw (Handlebars)
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      setDispatchForm(prev => ({
                        ...prev,
                        candidate_id: candidates[0]?.id || '',
                        channel: selectedTemplate.channel || 'EMAIL',
                        subject: selectedTemplate.subject || '',
                        body: selectedTemplate.body_template || '',
                      }))
                      setShowDispatchModal(true)
                    }}
                    className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: '0.8rem' }}
                  >
                    <Send size={14} /> Dispatch Message
                  </button>
                </div>
              )}
            </div>

            {selectedTemplate ? (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Subject</label>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
                    {previewMode === 'RENDERED'
                      ? (renderedSubject || selectedTemplate.subject || 'Direct SMS')
                      : (selectedTemplate.subject || 'Direct SMS')}
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                      Message Body {previewMode === 'RENDERED' && <span style={{ color: 'var(--accent)', textTransform: 'none' }}>(Interpolated with Handlebars)</span>}
                    </label>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                      Channel: <b>{selectedTemplate.channel}</b>
                    </span>
                  </div>
                  <div style={{
                    background: 'var(--neu-bg-deep)',
                    padding: 16,
                    borderRadius: 12,
                    fontSize: '0.85rem',
                    color: 'var(--text-primary)',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                  }}>
                    {previewMode === 'RENDERED'
                      ? (specimenPreview?.rendered || selectedTemplate.body_template)
                      : selectedTemplate.body_template}
                  </div>
                </div>

                {/* Detected Handlebars Variables */}
                <div style={{ marginTop: 16 }}>
                  <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                    Supported Template Variables
                  </label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(selectedTemplate.variables || []).map((v: string, i: number) => (
                      <span key={i} style={{ fontSize: '0.72rem', background: 'var(--neu-bg-raised)', padding: '3px 8px', borderRadius: 8, color: 'var(--text-primary)', border: '1px solid rgba(128,128,180,0.15)' }}>
                        <code>{`{{${v}}}`}</code>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
                Select a template from the left to view body and interpolated variables.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Delivery & Responses */}
      {activeTab === 'MESSAGES' && (
        <>
          {messages.length === 0 ? (
            <div className="card" style={{
              padding: 40,
              textAlign: 'center',
              borderRadius: 16,
              background: 'var(--neu-base)',
              boxShadow: 'var(--elev-1)',
              color: 'var(--text-tertiary)',
            }}>
              <MessageSquare size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>No outreach records found</div>
              <p style={{ fontSize: '0.875rem', marginTop: 4 }}>Outreach messages dispatched to candidates will appear here with live delivery status.</p>
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="card neu-table-desktop" style={{
                borderRadius: 16,
                background: 'var(--neu-base)',
                boxShadow: 'var(--elev-1)',
                overflow: 'hidden',
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--neu-bg-deep)', borderBottom: '1px solid rgba(128,128,180,0.15)', color: 'var(--text-tertiary)', fontSize: '0.78rem', textTransform: 'uppercase' }}>
                      <th style={{ padding: '12px 16px', fontWeight: 700 }}>Candidate</th>
                      <th style={{ padding: '12px 16px', fontWeight: 700 }}>Recipient / Channel</th>
                      <th style={{ padding: '12px 16px', fontWeight: 700 }}>Subject</th>
                      <th style={{ padding: '12px 16px', fontWeight: 700 }}>Status</th>
                      <th style={{ padding: '12px 16px', fontWeight: 700 }}>Sent At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {messages.map((msg: any) => {
                      const badge = getStatusBadge(msg.status)
                      const sentFormatted = msg.sent_at ? new Date(msg.sent_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : 'Pending'
                      return (
                        <tr key={msg.id} style={{ borderBottom: '1px solid rgba(128,128,180,0.08)' }}>
                          <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {msg.candidate_name || msg.candidate?.full_name || 'Candidate'}
                          </td>
                          <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                            {msg.recipient} ({msg.channel})
                          </td>
                          <td style={{ padding: '12px 16px', color: 'var(--text-primary)' }}>
                            {msg.subject || 'Direct SMS Notification'}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{
                              padding: '3px 8px',
                              borderRadius: 10,
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              background: badge.bg,
                              color: badge.text,
                            }}>
                              {badge.label}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                            {sentFormatted}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards View */}
              <div className="neu-cards-mobile">
                {messages.map((msg: any) => {
                  const badge = getStatusBadge(msg.status)
                  const sentFormatted = msg.sent_at ? new Date(msg.sent_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : 'Pending'
                  return (
                    <div key={msg.id} className="neu-mobile-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                            {msg.candidate_name || msg.candidate?.full_name || 'Candidate'}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                            {msg.recipient} • {msg.channel}
                          </div>
                        </div>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 10,
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          background: badge.bg,
                          color: badge.text,
                        }}>
                          {badge.label}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', borderTop: '1px solid rgba(128,128,180,0.08)', paddingTop: 8 }}>
                        {msg.subject || 'Direct Notification'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                        Sent: {sentFormatted}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* Create New Campaign Modal */}
      {showNewCampaign && (
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
          padding: 16,
        }}>
          <div className="card" style={{
            width: '100%',
            maxWidth: 520,
            background: 'var(--neu-base)',
            boxShadow: 'var(--elev-4)',
            borderRadius: 20,
            padding: 24,
            maxHeight: '90vh',
            overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Create Outreach Campaign
              </h3>
              <button
                onClick={() => setShowNewCampaign(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Campaign Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Q4 Cloud Architects Outreach"
                  value={campaignForm.name}
                  onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(128,128,180,0.2)',
                    background: 'var(--neu-bg-raised)',
                    fontSize: '0.875rem',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Target Requisition / Role
                </label>
                <select
                  value={campaignForm.requisition_id}
                  onChange={(e) => setCampaignForm({ ...campaignForm, requisition_id: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(128,128,180,0.2)',
                    background: 'var(--neu-bg-raised)',
                    fontSize: '0.875rem',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">General Hiring Outreach</option>
                  {requisitions.map((r: any) => (
                    <option key={r.id} value={r.id}>{r.title} ({r.requisition_code || 'REQ'})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                    Channels
                  </label>
                  <select
                    value={campaignForm.channels[0] || 'EMAIL'}
                    onChange={(e) => setCampaignForm({ ...campaignForm, channels: [e.target.value] })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(128,128,180,0.2)',
                      background: 'var(--neu-bg-raised)',
                      fontSize: '0.875rem',
                      color: 'var(--text-primary)',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="EMAIL">Email</option>
                    <option value="SMS">SMS</option>
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="LINKEDIN">LinkedIn (Mock)</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                    Initial Status
                  </label>
                  <select
                    value={campaignForm.status}
                    onChange={(e) => setCampaignForm({ ...campaignForm, status: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(128,128,180,0.2)',
                      background: 'var(--neu-bg-raised)',
                      fontSize: '0.875rem',
                      color: 'var(--text-primary)',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="DRAFT">Draft</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Estimated Targeted Candidates
                </label>
                <input
                  type="number"
                  value={campaignForm.total_targeted}
                  onChange={(e) => setCampaignForm({ ...campaignForm, total_targeted: Number(e.target.value) })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(128,128,180,0.2)',
                    background: 'var(--neu-bg-raised)',
                    fontSize: '0.875rem',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => setShowNewCampaign(false)}
                  className="btn btn-secondary"
                  disabled={createCampaignMutation.isPending}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => createCampaignMutation.mutate()}
                  disabled={createCampaignMutation.isPending || !campaignForm.name.trim()}
                  className="btn btn-primary"
                >
                  {createCampaignMutation.isPending ? 'Saving Campaign…' : 'Create Campaign'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dispatch Outreach Message Modal */}
      {showDispatchModal && selectedTemplate && (
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
          padding: 16,
        }}>
          <div className="card" style={{
            width: '100%',
            maxWidth: 580,
            background: 'var(--neu-base)',
            boxShadow: 'var(--elev-4)',
            borderRadius: 20,
            padding: 24,
            maxHeight: '90vh',
            overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Dispatch Outreach Message
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Template: <b>{selectedTemplate.name}</b> ({selectedTemplate.channel})
                </p>
              </div>
              <button
                onClick={() => setShowDispatchModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Select Eligible Candidate *
                </label>
                <select
                  value={dispatchForm.candidate_id}
                  onChange={(e) => setDispatchForm({ ...dispatchForm, candidate_id: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(128,128,180,0.2)',
                    background: 'var(--neu-bg-raised)',
                    fontSize: '0.875rem',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">Choose candidate...</option>
                  {candidates.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name || `${c.first_name || ''} ${c.last_name || ''}`} — {c.email} ({c.current_designation || 'Software Engineer'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Link to Campaign (Optional)
                </label>
                <select
                  value={dispatchForm.campaign_id}
                  onChange={(e) => setDispatchForm({ ...dispatchForm, campaign_id: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(128,128,180,0.2)',
                    background: 'var(--neu-bg-raised)',
                    fontSize: '0.875rem',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">No campaign link</option>
                  {campaigns.map((camp: any) => (
                    <option key={camp.id} value={camp.id}>{camp.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Subject Line
                </label>
                <input
                  type="text"
                  value={dispatchForm.subject || selectedTemplate.subject || ''}
                  onChange={(e) => setDispatchForm({ ...dispatchForm, subject: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(128,128,180,0.2)',
                    background: 'var(--neu-bg-raised)',
                    fontSize: '0.85rem',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Rendered Preview
                </label>
                <div style={{
                  background: 'var(--neu-bg-deep)',
                  padding: 12,
                  borderRadius: 10,
                  fontSize: '0.82rem',
                  color: 'var(--text-primary)',
                  maxHeight: 140,
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                }}>
                  {specimenPreview?.rendered || selectedTemplate.body_template}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowDispatchModal(false)}
                  className="btn btn-secondary"
                  disabled={dispatchMessageMutation.isPending}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => dispatchMessageMutation.mutate()}
                  disabled={dispatchMessageMutation.isPending || !dispatchForm.candidate_id}
                  className="btn btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Send size={14} />
                  {dispatchMessageMutation.isPending ? 'Dispatching…' : 'Confirm & Dispatch'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  )
}
