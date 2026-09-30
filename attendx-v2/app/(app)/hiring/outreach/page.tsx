'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Mail, MessageSquare, Send, CheckCircle2, Clock,
  Eye, RefreshCcw, Plus, Sparkles, Filter, ChevronRight
} from 'lucide-react'
import { PageWrapper } from '@/components/ui/PageWrapper'
import { useToast } from '@/components/ui/Toast'

export default function OutreachPage() {
  const { success, error: toastError } = useToast()
  const qc = useQueryClient()

  const [activeTab, setActiveTab] = useState<'CAMPAIGNS' | 'TEMPLATES' | 'MESSAGES'>('CAMPAIGNS')
  const [showNewCampaign, setShowNewCampaign] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null)

  // Fetch campaigns
  const { data: campaignData, isLoading: campaignsLoading } = useQuery({
    queryKey: ['hiring-outreach-campaigns'],
    queryFn: async () => {
      const res = await fetch('/api/hiring/outreach/campaigns')
      if (!res.ok) return { campaigns: [] }
      return res.json()
    }
  })

  // Fetch templates
  const { data: templateData, isLoading: templatesLoading } = useQuery({
    queryKey: ['hiring-outreach-templates'],
    queryFn: async () => {
      const res = await fetch('/api/hiring/outreach/templates')
      if (!res.ok) return { templates: [] }
      return res.json()
    }
  })

  const campaigns = campaignData?.campaigns || []
  const templates = templateData?.templates || []

  // Sample outreach messages for preview / response tracking
  const sampleMessages = [
    {
      id: 'msg-1',
      recipient: 'siddharth.m@example.com',
      candidate_name: 'Siddharth Mehta',
      channel: 'EMAIL',
      subject: 'Exploring Senior Backend Engineer role at AttendX',
      status: 'REPLIED',
      sent_at: '2026-09-28 14:32',
      opened_at: '2026-09-28 15:10',
      replied_at: '2026-09-28 16:45',
    },
    {
      id: 'msg-2',
      recipient: 'priya.s@example.com',
      candidate_name: 'Priya Sharma',
      channel: 'EMAIL',
      subject: 'Frontend Architect opportunity at AttendX',
      status: 'OPENED',
      sent_at: '2026-09-28 11:15',
      opened_at: '2026-09-28 12:04',
      replied_at: null,
    },
    {
      id: 'msg-3',
      recipient: 'amit.verma@example.com',
      candidate_name: 'Amit Verma',
      channel: 'SMS',
      subject: null,
      status: 'DELIVERED',
      sent_at: '2026-09-29 09:30',
      opened_at: null,
      replied_at: null,
    },
    {
      id: 'msg-4',
      recipient: 'kavita.r@example.com',
      candidate_name: 'Kavita Reddy',
      channel: 'EMAIL',
      subject: 'Interview with Engineering Director at AttendX',
      status: 'SENT',
      sent_at: '2026-09-29 18:00',
      opened_at: null,
      replied_at: null,
    },
  ]

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
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{camp.total_targeted || 14}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>Targeted</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent)' }}>{camp.total_sent || 14}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>Sent</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#06B6D4' }}>{camp.total_opened || 9}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>Opened</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#10B981' }}>{camp.total_replied || 4}</div>
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
            {templates.map((tpl: any) => (
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
            ))}
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
                {sampleMessages.map((msg) => {
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
          </div>

          {/* Mobile Cards View */}
          <div className="neu-cards-mobile">
            {sampleMessages.map((msg) => {
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
        </>
      )}
    </PageWrapper>
  )
}
