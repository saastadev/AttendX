'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import {
  Briefcase, Search, Mail, Video, CheckCircle2,
  TrendingUp, Users, ArrowRight, UserPlus, Clock,
  FileCheck, Shield, Sparkles, Building2
} from 'lucide-react'
import { PageWrapper } from '@/components/ui/PageWrapper'
import { useAuthStore } from '@/store/auth.store'

interface HiringSummary {
  totalRequisitions: number
  activeCandidates: number
  inInterview: number
  offersReleased: number
  onboarded: number
}

export default function HiringHubPage() {
  const user = useAuthStore(s => s.user)

  // Fetch requisitions
  const { data: reqData, isLoading: reqsLoading } = useQuery({
    queryKey: ['hiring-requisitions-summary'],
    queryFn: async () => {
      const res = await fetch('/api/hiring/requisitions')
      if (!res.ok) return { requisitions: [] }
      return res.json()
    }
  })

  // Fetch applications
  const { data: appData, isLoading: appsLoading } = useQuery({
    queryKey: ['hiring-applications-summary'],
    queryFn: async () => {
      const res = await fetch('/api/hiring/applications?limit=100')
      if (!res.ok) return { applications: [] }
      return res.json()
    }
  })

  const requisitions = reqData?.requisitions || []
  const applications = appData?.applications || []

  const stats: HiringSummary = {
    totalRequisitions: requisitions.length,
    activeCandidates: applications.filter((a: any) => !['REJECTED', 'WITHDRAWN', 'ONBOARDED'].includes(a.stage)).length,
    inInterview: applications.filter((a: any) => ['SHORTLISTED', 'INTERVIEW', 'SELECTED'].includes(a.stage)).length,
    offersReleased: applications.filter((a: any) => ['OFFER_RELEASED', 'OFFER_FINAL_ACCEPTED'].includes(a.stage)).length,
    onboarded: applications.filter((a: any) => a.stage === 'ONBOARDED').length,
  }

  const submodules = [
    {
      title: '1. Applications & Pipeline',
      description: 'Review candidate applications, view AI match scores, filter by skill relevance, and schedule interviews.',
      href: '/hiring/applications',
      icon: Briefcase,
      color: '#4F46E5',
      badge: `${stats.activeCandidates} Active`,
    },
    {
      title: '2. AI Sourcing',
      description: 'Search internal talent pools, LinkedIn, and GitHub profiles with automated bias-free match evaluation.',
      href: '/hiring/sourcing',
      icon: Search,
      color: '#06B6D4',
      badge: 'Multi-platform',
    },
    {
      title: '3. Outreach & Engagement',
      description: 'Create multi-channel outreach campaigns with customizable email and SMS templates and open/reply tracking.',
      href: '/hiring/outreach',
      icon: Mail,
      color: '#10B981',
      badge: 'Automated',
    },
    {
      title: '4. Interview Status & Screening',
      description: 'Track candidate round progression, multi-interviewer scorecards, AI screening summaries, and select hires.',
      href: '/hiring/interview-status',
      icon: Video,
      color: '#F59E0B',
      badge: `${stats.inInterview} In Rounds`,
    },
    {
      title: '5. Automated Onboarding & Offers',
      description: 'Release official offers with 7-day candidate portal links, verify submitted documents, and convert to employees.',
      href: '/hiring/onboard',
      icon: FileCheck,
      color: '#8B5CF6',
      badge: `${stats.offersReleased} Released`,
    },
    {
      title: '6. Analytics & Insights',
      description: 'Analyze hiring funnel conversion rates, stage bottlenecks, time-to-hire, and proactive AI pipeline recommendations.',
      href: '/hiring/analytics',
      icon: TrendingUp,
      color: '#EC4899',
      badge: 'Real-time',
    },
  ]

  return (
    <PageWrapper style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 48 }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 32 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--accent-light)',
              color: 'var(--accent)',
              fontSize: '0.75rem',
              fontWeight: 700,
              padding: '4px 10px',
              borderRadius: 20,
              letterSpacing: '0.04em',
              textTransform: 'uppercase'
            }}>
              <Sparkles size={14} /> Multi-Tenant Hiring Suite
            </span>
          </div>
          <h1 className="page-title" style={{ fontSize: '1.85rem', fontWeight: 800 }}>Hiring & Talent Acquisition</h1>
          <p className="page-subtitle" style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
            Orchestrate sourcing, voice screening, structured interviews, digital offers, and employee conversion.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link href="/hiring/applications" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <UserPlus size={16} /> View Applications
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: 16,
        marginBottom: 32,
      }}>
        <div className="card" style={{ padding: '20px 24px', background: 'var(--neu-base)', boxShadow: 'var(--elev-1)', borderRadius: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-tertiary)' }}>Open Roles</span>
            <Building2 size={20} color="var(--accent)" />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            {reqsLoading ? '—' : stats.totalRequisitions}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>Active Job Requisitions</div>
        </div>

        <div className="card" style={{ padding: '20px 24px', background: 'var(--neu-base)', boxShadow: 'var(--elev-1)', borderRadius: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-tertiary)' }}>Active Pipeline</span>
            <Users size={20} color="#06B6D4" />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            {appsLoading ? '—' : stats.activeCandidates}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>Candidates across stages</div>
        </div>

        <div className="card" style={{ padding: '20px 24px', background: 'var(--neu-base)', boxShadow: 'var(--elev-1)', borderRadius: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-tertiary)' }}>In Interview</span>
            <Clock size={20} color="#F59E0B" />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            {appsLoading ? '—' : stats.inInterview}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>Screenings & Panels</div>
        </div>

        <div className="card" style={{ padding: '20px 24px', background: 'var(--neu-base)', boxShadow: 'var(--elev-1)', borderRadius: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-tertiary)' }}>Offers & Onboarding</span>
            <FileCheck size={20} color="#8B5CF6" />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            {appsLoading ? '—' : stats.offersReleased}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>Released / In verification</div>
        </div>

        <div className="card" style={{ padding: '20px 24px', background: 'var(--neu-base)', boxShadow: 'var(--elev-1)', borderRadius: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-tertiary)' }}>Hired & Onboarded</span>
            <CheckCircle2 size={20} color="#10B981" />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            {appsLoading ? '—' : stats.onboarded}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>Converted to employees</div>
        </div>
      </div>

      {/* Sub-Modules Grid */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>
          Hiring Sub-Modules
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}>
          {submodules.map((m) => {
            const Icon = m.icon
            return (
              <Link
                key={m.href}
                href={m.href}
                className="card card-hover"
                style={{
                  padding: 24,
                  borderRadius: 18,
                  textDecoration: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: 'var(--elev-1)',
                  background: 'var(--neu-base)',
                  transition: 'all 0.2s ease',
                  border: '1px solid rgba(255,255,255,0.4)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                    <div style={{
                      width: 48,
                      height: 48,
                      borderRadius: 14,
                      background: `${m.color}15`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Icon size={24} color={m.color} />
                    </div>
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: 12,
                      background: 'var(--neu-bg-deep)',
                      color: 'var(--text-secondary)',
                    }}>
                      {m.badge}
                    </span>
                  </div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                    {m.title}
                  </h3>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {m.description}
                  </p>
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  color: m.color,
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  marginTop: 20,
                }}>
                  Open Sub-Module <ArrowRight size={14} />
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Active Requisitions Quick List */}
      <div className="card" style={{ padding: 24, borderRadius: 18, background: 'var(--neu-base)', boxShadow: 'var(--elev-1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Active Job Requisitions</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Departments actively looking for talent</p>
          </div>
          <Link href="/hiring/applications" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent)' }}>
            View All Pipeline →
          </Link>
        </div>

        {reqsLoading ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading requisitions…</div>
        ) : requisitions.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)' }}>
            No requisitions found. Create your first job requisition to start sourcing candidates.
          </div>
        ) : (
          <>
            <div className="neu-table-desktop" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(128,128,180,0.15)', color: 'var(--text-tertiary)' }}>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Role</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Department</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Location</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Positions</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {requisitions.slice(0, 5).map((r: any) => (
                    <tr key={r.id} style={{ borderBottom: '1px solid rgba(128,128,180,0.08)' }}>
                      <td style={{ padding: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{r.title}</td>
                      <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{typeof r.department === 'object' ? r.department?.name : r.department}</td>
                      <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{r.location} ({r.work_mode})</td>
                      <td style={{ padding: '12px', color: 'var(--text-primary)' }}>{r.open_positions}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 12,
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          background: r.status === 'OPEN' ? 'rgba(16, 185, 129, 0.15)' : 'var(--neu-bg-deep)',
                          color: r.status === 'OPEN' ? '#059669' : 'var(--text-tertiary)',
                        }}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="neu-cards-mobile">
              {requisitions.slice(0, 5).map((r: any) => (
                <div key={r.id} className="neu-mobile-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{r.title}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                        {typeof r.department === 'object' ? r.department?.name : r.department}
                      </div>
                    </div>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: 12,
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      background: r.status === 'OPEN' ? 'rgba(16, 185, 129, 0.15)' : 'var(--neu-bg-deep)',
                      color: r.status === 'OPEN' ? '#059669' : 'var(--text-tertiary)',
                    }}>
                      {r.status}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)', borderTop: '1px solid rgba(128,128,180,0.08)', paddingTop: 8 }}>
                    <span>{r.location} ({r.work_mode})</span>
                    <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{r.open_positions} open</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </PageWrapper>
  )
}
