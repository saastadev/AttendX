'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Mail, MessageSquare, Send, CheckCircle2, Clock,
  Eye, RefreshCcw, Plus, Sparkles, Filter, ChevronRight, AlertCircle
} from 'lucide-react'
import { PageWrapper } from '@/components/ui/PageWrapper'
import { useToast } from '@/components/ui/Toast'

interface OutreachMessageItem {
  id: string
  recipient: string
  candidate_name: string
  channel: string
  subject: string | null
  status: string
  sent_at: string
  opened_at?: string | null
  replied_at?: string | null
}

export default function OutreachPage() {
  const { success, error: toastError } = useToast()
  const qc = useQueryClient()

  const [activeTab, setActiveTab] = useState<'CAMPAIGNS' | 'TEMPLATES' | 'MESSAGES'>('CAMPAIGNS')
  const [showNewCampaign, setShowNewCampaign] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null)

  // Fetch campaigns
  const { data: campaignData, isLoading: campaignsLoading, isError: campaignsError, refetch: refetchCampaigns } = useQuery({
    queryKey: ['hiring-outreach-campaigns'],
    queryFn: async () => {
      const res = await fetch('/api/hiring/outreach/campaigns')
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to load campaigns')
      }
      return res.json()
    }
  })

  // Fetch templates
  const { data: templateData, isLoading: templatesLoading, isError: templatesError, refetch: refetchTemplates } = useQuery({
    queryKey: ['hiring-outreach-templates'],
    queryFn: async () => {
      const res = await fetch('/api/hiring/outreach/templates')
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to load templates')
      }
      return res.json()
    }
  })

  // Fetch real persisted outreach messages (Decision 3)
  const { data: messagesData, isLoading: messagesLoading, isError: messagesError, refetch: refetchMessages } = useQuery({
    queryKey: ['hiring-outreach-messages'],
    queryFn: async () => {
      const res = await fetch('/api/hiring/outreach/messages')
      if (!res.ok) throw new Error('Failed to load outreach messages')
      return res.json()
    }
  })

  const campaigns = campaignData?.campaigns || []
  const templates = templateData?.templates || []

  // Auto-select first template on load
  useEffect(() => {
    if (!selectedTemplate && templates.length > 0) {
      setSelectedTemplate(templates[0])
    }
  }, [templates, selectedTemplate])

  // Real outreach messages from database
  const messagesList: OutreachMessageItem[] = (messagesData?.data || messagesData?.messages || []).map((msg: any) => ({
    id: msg.id,
    recipient: msg.recipient || msg.candidate?.email || 'N/A',
    candidate_name: msg.candidate ? `${msg.candidate.first_name || ''} ${msg.candidate.last_name || ''}`.trim() : (msg.recipient || 'Candidate'),
    channel: msg.channel || 'EMAIL',
    subject: msg.subject || null,
    status: msg.status || 'SENT',
    sent_at: msg.sent_at ? new Date(msg.sent_at).toLocaleString() : (msg.created_at ? new Date(msg.created_at).toLocaleString() : 'N/A'),
    opened_at: msg.opened_at,
    replied_at: msg.replied_at,
  }))

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'REPLIED':
        return { bg: 'rgba(16, 185, 129, 0.15)', text: '#059669', label: 'Replied' }
      case 'OPENED':
        return { bg: 'rgba(6, 182, 212, 0.15)', text: '#0891B2', label: 'Opened' }
      case 'DELIVERED':
        return { bg: 'rgba(245, 158, 11, 0.15)', text: '#D97706', label: 'Delivered' }
      default:
        return { bg: 'var(--neu-bg-deep)', text: 'var(--text-tertiary)', label: 'Sent' }
    }
  }

  return (
    <PageWrapper style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 64 }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '1.75rem', fontWeight: 800 }}>AI Outreach & Engagement</h1>
          <p className="page-subtitle" style={{ color: 'var(--text-secondary)' }}>
            Personalized candidate outreach campaigns, dynamic templates, and response tracking.
          </p>
        </div>
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
          Campaigns
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
          Templates
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
          Delivery & Responses
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
            {campaignsLoading ? (
              <div className="card" style={{ padding: 40, textAlign: 'center', gridColumn: '1 / -1', color: 'var(--text-tertiary)' }}>
                Loading campaigns…
              </div>
            ) : campaignsError ? (
              <div className="card" style={{ padding: 40, textAlign: 'center', gridColumn: '1 / -1', borderRadius: 16, background: 'var(--neu-base)', boxShadow: 'var(--elev-1)', color: 'var(--text-tertiary)' }}>
                <AlertCircle size={36} color="var(--danger)" style={{ margin: '0 auto 12px' }} />
                <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>Failed to load campaigns</div>
                <p style={{ fontSize: '0.875rem', marginTop: 4, color: 'var(--danger)' }}>Could not retrieve campaigns from storage.</p>
                <button onClick={() => refetchCampaigns()} className="btn btn-primary" style={{ marginTop: 14, fontSize: '0.85rem', padding: '8px 16px' }}>Retry</button>
              </div>
            ) : campaigns.length === 0 ? (
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
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{camp.total_targeted ?? 0}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>Targeted</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent)' }}>{camp.total_sent ?? 0}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>Sent</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#06B6D4' }}>{camp.total_opened ?? 0}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>Opened</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#10B981' }}>{camp.total_replied ?? 0}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>Replied</div>
                    </div>
                  </div>

                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Channels: {(camp.channels || ['EMAIL']).join(', ')}
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
            {templatesLoading ? (
              <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading templates…</div>
            ) : templatesError ? (
              <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)', borderRadius: 14, background: 'var(--neu-base)', boxShadow: 'var(--elev-1)' }}>
                <AlertCircle size={32} color="var(--danger)" style={{ margin: '0 auto 8px' }} />
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Failed to load templates</div>
                <button onClick={() => refetchTemplates()} className="btn btn-primary" style={{ marginTop: 10, fontSize: '0.8rem', padding: '6px 12px' }}>Retry</button>
              </div>
            ) : templates.length === 0 ? (
              <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)', borderRadius: 14, background: 'var(--neu-base)', boxShadow: 'var(--elev-1)' }}>No templates configured</div>
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
                  Subject: <i>{tpl.subject || 'SMS Direct Message'}</i>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(tpl.variables || []).map((v: string, i: number) => (
                    <span key={i} style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', background: 'var(--neu-bg-deep)', padding: '2px 6px', borderRadius: 6, color: 'var(--accent)' }}>
                      {`{{${v}}}`}
                    </span>
                  ))}
                </div>
              </div>
            )))}
          </div>

          {/* Template Preview */}
          <div className="card" style={{
            padding: 24,
            borderRadius: 16,
            background: 'var(--neu-base)',
            boxShadow: 'var(--elev-1)',
          }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
              Template Live Preview
            </h3>
            {selectedTemplate ? (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Subject</label>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
                    {selectedTemplate.subject || 'Direct SMS'}
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Message Body</label>
                  <div style={{
                    background: 'var(--neu-bg-deep)',
                    padding: 16,
                    borderRadius: 12,
                    fontSize: '0.85rem',
                    color: 'var(--text-primary)',
                    lineHeight: 1.6,
                    marginTop: 6,
                    whiteSpace: 'pre-wrap',
                  }}>
                    {selectedTemplate.body_template}
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
          <div className="card neu-table-desktop" style={{
            borderRadius: 16,
            background: 'var(--neu-base)',
            boxShadow: 'var(--elev-1)',
            overflow: 'hidden',
          }}>
            {messagesLoading ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)' }}>
                Loading outreach communications…
              </div>
            ) : messagesError ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)' }}>
                <AlertCircle size={36} color="var(--danger)" style={{ margin: '0 auto 12px' }} />
                <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Failed to load outreach messages
                </div>
                <p style={{ fontSize: '0.875rem', marginTop: 4, color: 'var(--danger)' }}>
                  Could not retrieve logged communications from storage.
                </p>
                <button
                  onClick={() => refetchMessages()}
                  className="btn btn-primary"
                  style={{ marginTop: 14, fontSize: '0.85rem', padding: '8px 16px' }}
                >
                  Retry
                </button>
              </div>
            ) : messagesList.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)' }}>
                <MessageSquare size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
                <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  No outreach messages logged yet
                </div>
                <p style={{ fontSize: '0.875rem', marginTop: 4 }}>
                  Messages dispatched to candidates will appear here with delivery and read receipts.
                </p>
              </div>
            ) : (
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
                  {messagesList.map((msg) => {
                    const badge = getStatusBadge(msg.status)
                    return (
                      <tr key={msg.id} style={{ borderBottom: '1px solid rgba(128,128,180,0.08)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {msg.candidate_name}
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
                          {msg.sent_at}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Mobile Cards View */}
          {messagesList.length > 0 && (
            <div className="neu-cards-mobile">
              {messagesList.map((msg) => {
                const badge = getStatusBadge(msg.status)
                return (
                  <div key={msg.id} className="neu-mobile-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                          {msg.candidate_name}
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
                      {msg.subject || 'Direct SMS Notification'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                      Sent: {msg.sent_at}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </PageWrapper>
  )
}
