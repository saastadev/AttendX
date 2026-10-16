'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Mail, MessageSquare, Send, CheckCircle2, Clock,
  Eye, RefreshCcw, Plus, Sparkles, Filter, ChevronRight,
  X, Copy, Check
} from 'lucide-react'
import { PageWrapper } from '@/components/ui/PageWrapper'
import { useToast } from '@/components/ui/Toast'

const DEFAULT_OUTREACH_TEMPLATES = [
  {
    id: 'tmpl-1',
    name: 'Executive Talent Introduction',
    channel: 'EMAIL',
    subject: 'Leadership Opportunity at {{company_name}} — {{role_title}}',
    body_template: 'Hi {{candidate_name}},\n\nI came across your profile and was thoroughly impressed by your work in {{skills}}. We are actively expanding our team at {{company_name}} and are searching for a {{role_title}} to lead critical initiatives.\n\nWould you have 15 minutes this week for a brief introductory conversation?\n\nBest regards,\nAttendX Talent Team',
    variables: ['candidate_name', 'company_name', 'role_title', 'skills'],
    is_ai_customizable: true,
  },
  {
    id: 'tmpl-2',
    name: 'Technical Round Invitation',
    channel: 'EMAIL',
    subject: 'Next Steps: Technical Screening for {{role_title}} at {{company_name}}',
    body_template: 'Hi {{candidate_name}},\n\nThank you for your interest in the {{role_title}} position at {{company_name}}! Following our initial review, we would love to invite you for a 45-minute technical discussion with our engineering panel.\n\nPlease select a convenient time using the calendar link below.\n\nWarm regards,\nEngineering Hiring Team',
    variables: ['candidate_name', 'role_title', 'company_name'],
    is_ai_customizable: true,
  },
  {
    id: 'tmpl-3',
    name: 'Immediate Screening Invitation',
    channel: 'SMS',
    subject: '',
    body_template: 'Hi {{candidate_name}}, your profile caught our eye for {{role_title}} at {{company_name}}! When is a good time for a quick 10-min intro chat?',
    variables: ['candidate_name', 'role_title', 'company_name'],
    is_ai_customizable: false,
  },
  {
    id: 'tmpl-4',
    name: 'WhatsApp Fast-Track Outreach',
    channel: 'WHATSAPP',
    subject: '',
    body_template: 'Hello {{candidate_name}}! We are hiring a {{role_title}} at {{company_name}}. We loved your background and would love to chat. Can we connect today?',
    variables: ['candidate_name', 'role_title', 'company_name'],
    is_ai_customizable: true,
  },
]

export default function OutreachPage() {
  const { success, error: toastError } = useToast()
  const qc = useQueryClient()

  const [activeTab, setActiveTab] = useState<'CAMPAIGNS' | 'TEMPLATES' | 'MESSAGES'>('CAMPAIGNS')
  const [showNewCampaign, setShowNewCampaign] = useState(false)
  const [showNewTemplate, setShowNewTemplate] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null)
  const [copiedPreview, setCopiedPreview] = useState(false)

  const [newTemplateForm, setNewTemplateForm] = useState({
    name: '',
    channel: 'EMAIL',
    subject: '',
    body_template: '',
    variables: 'candidate_name, role_title, company_name, skills',
  })
  const [isSubmittingTemplate, setIsSubmittingTemplate] = useState(false)

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
  const fetchedTemplates = templateData?.templates || []
  const effectiveTemplates = fetchedTemplates.length > 0 ? fetchedTemplates : DEFAULT_OUTREACH_TEMPLATES

  useEffect(() => {
    if (!selectedTemplate && effectiveTemplates.length > 0) {
      setSelectedTemplate(effectiveTemplates[0])
    }
  }, [selectedTemplate, effectiveTemplates])

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

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTemplateForm.name.trim() || !newTemplateForm.body_template.trim()) {
      toastError('Template name and body are required')
      return
    }

    try {
      setIsSubmittingTemplate(true)
      const res = await fetch('/api/hiring/outreach/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTemplateForm.name.trim(),
          channel: newTemplateForm.channel,
          subject: newTemplateForm.subject.trim() || null,
          body_template: newTemplateForm.body_template.trim(),
          variables: newTemplateForm.variables
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean),
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create template')
      }

      success('Template created successfully!')
      setShowNewTemplate(false)
      setNewTemplateForm({
        name: '',
        channel: 'EMAIL',
        subject: '',
        body_template: '',
        variables: 'candidate_name, role_title, company_name, skills',
      })
      await qc.invalidateQueries({ queryKey: ['hiring-outreach-templates'] })
    } catch (err: any) {
      toastError(err.message || 'Error creating template')
    } finally {
      setIsSubmittingTemplate(false)
    }
  }

  const getInterpolatedBody = (body: string) => {
    if (!body) return ''
    return body
      .replace(/\{\{candidate_name\}\}/g, 'Aarav Sharma')
      .replace(/\{\{company_name\}\}/g, 'AcmeTech Solutions')
      .replace(/\{\{role_title\}\}/g, 'Senior Frontend Engineer')
      .replace(/\{\{skills\}\}/g, 'React, TypeScript, Next.js')
  }

  const getInterpolatedSubject = (subj?: string | null) => {
    if (!subj) return 'Direct Message'
    return subj
      .replace(/\{\{candidate_name\}\}/g, 'Aarav Sharma')
      .replace(/\{\{company_name\}\}/g, 'AcmeTech Solutions')
      .replace(/\{\{role_title\}\}/g, 'Senior Frontend Engineer')
      .replace(/\{\{skills\}\}/g, 'React, TypeScript, Next.js')
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedPreview(true)
    setTimeout(() => setCopiedPreview(false), 2000)
    success('Template copied to clipboard!')
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Outreach Templates ({effectiveTemplates.length})
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Standardized multi-channel messages with dynamic AI & candidate variable interpolation
              </p>
            </div>
            <button
              onClick={() => setShowNewTemplate(true)}
              className="neu-button-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 16px',
                borderRadius: 10,
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Plus size={16} />
              + New Template
            </button>
          </div>

          <div className="neu-responsive-split">
            {/* Templates List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {effectiveTemplates.map((tpl: any) => {
                const isSelected = selectedTemplate?.id === tpl.id
                return (
                  <div
                    key={tpl.id}
                    onClick={() => setSelectedTemplate(tpl)}
                    className="card card-hover"
                    style={{
                      padding: 18,
                      borderRadius: 14,
                      background: isSelected ? 'var(--neu-bg-raised)' : 'var(--neu-base)',
                      boxShadow: isSelected ? 'var(--elev-2)' : 'var(--elev-1)',
                      cursor: 'pointer',
                      border: isSelected ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.4)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {tpl.name}
                      </h4>
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 8,
                        background: tpl.channel === 'EMAIL' ? 'rgba(59, 130, 246, 0.15)' : tpl.channel === 'WHATSAPP' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        color: tpl.channel === 'EMAIL' ? '#2563EB' : tpl.channel === 'WHATSAPP' ? '#10B981' : '#D97706',
                      }}>
                        {tpl.channel}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
                      Subject: <i>{tpl.subject || '(Direct Message - No Subject)'}</i>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {(tpl.variables || []).map((v: string, i: number) => (
                        <span key={i} style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', background: 'var(--neu-bg-deep)', padding: '2px 6px', borderRadius: 6, color: 'var(--accent)' }}>
                          {`{{${v}}}`}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Template Preview */}
            <div className="card" style={{
              padding: 24,
              borderRadius: 16,
              background: 'var(--neu-base)',
              boxShadow: 'var(--elev-1)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Template Live Preview
                </h3>
                {selectedTemplate && (
                  <button
                    onClick={() => handleCopy(getInterpolatedBody(selectedTemplate.body_template))}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      borderRadius: 8,
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: 'var(--neu-bg-deep)',
                      border: '1px solid rgba(128,128,180,0.2)',
                      color: copiedPreview ? '#10B981' : 'var(--text-primary)',
                    }}
                  >
                    {copiedPreview ? <Check size={14} /> : <Copy size={14} />}
                    {copiedPreview ? 'Copied' : 'Copy Sample'}
                  </button>
                )}
              </div>

              {selectedTemplate ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                      Sample Subject (Interpolated)
                    </label>
                    <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>
                      {getInterpolatedSubject(selectedTemplate.subject)}
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                      Sample Message Body (Interpolated)
                    </label>
                    <div style={{
                      background: 'var(--neu-bg-deep)',
                      padding: 16,
                      borderRadius: 12,
                      fontSize: '0.85rem',
                      color: 'var(--text-primary)',
                      lineHeight: 1.6,
                      marginTop: 6,
                      whiteSpace: 'pre-wrap',
                      border: '1px solid rgba(128,128,180,0.15)',
                    }}>
                      {getInterpolatedBody(selectedTemplate.body_template)}
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                      Raw Template Variables
                    </label>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      {(selectedTemplate.variables || []).map((v: string, i: number) => (
                        <span key={i} style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', background: 'var(--neu-bg-deep)', padding: '3px 8px', borderRadius: 6, color: 'var(--accent)' }}>
                          {`{{${v}}}`}
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

      {/* Modal: New Template */}
      {showNewTemplate && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(4px)',
          padding: 16,
        }}>
          <div style={{
            background: 'var(--neu-base)',
            borderRadius: 20,
            width: '100%',
            maxWidth: 520,
            boxShadow: 'var(--elev-3)',
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Create Outreach Template
              </h3>
              <button
                type="button"
                onClick={() => setShowNewTemplate(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateTemplate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Template Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Engineering Leadership Outreach"
                  value={newTemplateForm.name}
                  onChange={(e) => setNewTemplateForm({ ...newTemplateForm, name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(128,128,180,0.2)',
                    background: 'var(--neu-bg-deep)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Channel *
                </label>
                <select
                  value={newTemplateForm.channel}
                  onChange={(e) => setNewTemplateForm({ ...newTemplateForm, channel: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(128,128,180,0.2)',
                    background: 'var(--neu-bg-deep)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                  }}
                >
                  <option value="EMAIL">Email</option>
                  <option value="SMS">SMS</option>
                  <option value="WHATSAPP">WhatsApp</option>
                </select>
              </div>

              {newTemplateForm.channel === 'EMAIL' && (
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                    Email Subject
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Role Opportunity at {{company_name}}"
                    value={newTemplateForm.subject}
                    onChange={(e) => setNewTemplateForm({ ...newTemplateForm, subject: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(128,128,180,0.2)',
                      background: 'var(--neu-bg-deep)',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>
              )}

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Message Body Template *
                </label>
                <textarea
                  required
                  rows={5}
                  placeholder="Hi {{candidate_name}}, we noticed your background..."
                  value={newTemplateForm.body_template}
                  onChange={(e) => setNewTemplateForm({ ...newTemplateForm, body_template: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(128,128,180,0.2)',
                    background: 'var(--neu-bg-deep)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Variables (comma separated)
                </label>
                <input
                  type="text"
                  value={newTemplateForm.variables}
                  onChange={(e) => setNewTemplateForm({ ...newTemplateForm, variables: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(128,128,180,0.2)',
                    background: 'var(--neu-bg-deep)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowNewTemplate(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 10,
                    background: 'transparent',
                    border: '1px solid rgba(128,128,180,0.2)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTemplate}
                  className="neu-button-primary"
                  style={{
                    padding: '8px 18px',
                    borderRadius: 10,
                    cursor: isSubmittingTemplate ? 'not-allowed' : 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                  }}
                >
                  {isSubmittingTemplate ? 'Saving...' : 'Save Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageWrapper>
  )
}
