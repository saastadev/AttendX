'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, TrendingDown, TrendingUp, CalendarDays, Sparkles,
  AlertTriangle, Clock, Activity, ShieldAlert, CheckCircle2, RefreshCcw
} from 'lucide-react'
import { format, subDays, eachDayOfInterval } from 'date-fns'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth.store'
import { useToast } from '@/components/ui/Toast'

// --- Custom Pure SVG Area Chart (Turbopack-Safe & Ultra-Fast) ---
function AttendanceSvgChart({ data }: { data: Array<{ date: string; present: number; absent: number; late: number }> }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  if (!data || data.length === 0) {
    return (
      <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>
        No attendance data available
      </div>
    )
  }

  const width = 800
  const height = 220
  const padLeft = 40
  const padRight = 20
  const padTop = 20
  const padBottom = 30
  const chartW = width - padLeft - padRight
  const chartH = height - padTop - padBottom

  const maxVal = Math.max(...data.map(d => Math.max(d.present + d.late + d.absent, d.present, 5)), 8)

  const pointsPresent = data.map((d, i) => {
    const x = padLeft + (i / (data.length - 1)) * chartW
    const y = padTop + chartH - (d.present / maxVal) * chartH
    return { x, y, val: d.present, raw: d }
  })

  const pointsAbsent = data.map((d, i) => {
    const x = padLeft + (i / (data.length - 1)) * chartW
    const y = padTop + chartH - (d.absent / maxVal) * chartH
    return { x, y, val: d.absent }
  })

  const pointsLate = data.map((d, i) => {
    const x = padLeft + (i / (data.length - 1)) * chartW
    const y = padTop + chartH - (d.late / maxVal) * chartH
    return { x, y, val: d.late }
  })

  const makeSmoothLine = (pts: Array<{ x: number; y: number }>) => {
    if (pts.length === 0) return ''
    return pts.reduce((acc, p, i) => (i === 0 ? `M ${p.x},${p.y}` : `${acc} L ${p.x},${p.y}`), '')
  }

  const makeAreaPath = (pts: Array<{ x: number; y: number }>) => {
    if (pts.length === 0) return ''
    const line = makeSmoothLine(pts)
    const last = pts[pts.length - 1]
    const first = pts[0]
    const base = padTop + chartH
    return `${line} L ${last.x},${base} L ${first.x},${base} Z`
  }

  const activeItem = hoverIdx !== null && hoverIdx >= 0 && hoverIdx < data.length ? data[hoverIdx] : null
  const activePt = hoverIdx !== null && hoverIdx >= 0 && hoverIdx < pointsPresent.length ? pointsPresent[hoverIdx] : null

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Legend & Hover Display */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, fontSize: '0.8125rem' }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent)' }} /> Present
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--warning)' }} /> Late
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--danger)' }} /> Absent
          </span>
        </div>

        {activeItem && (
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', background: 'var(--neu-bg-raised)', padding: '2px 10px', borderRadius: 8, border: '1px solid rgba(128,128,180,0.15)' }}>
            {activeItem.date}: <span style={{ color: 'var(--accent)' }}>{activeItem.present} Present</span> • <span style={{ color: 'var(--warning)' }}>{activeItem.late} Late</span> • <span style={{ color: 'var(--danger)' }}>{activeItem.absent} Absent</span>
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: 'auto', overflow: 'visible' }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="presentGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="absentGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--danger)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--danger)" stopOpacity={0.01} />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
          const y = padTop + chartH * ratio
          const val = Math.round(maxVal * (1 - ratio))
          return (
            <g key={idx}>
              <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="rgba(128,128,180,0.08)" strokeDasharray="3 3" />
              <text x={padLeft - 8} y={y + 4} textAnchor="end" fontSize="10" fill="var(--text-tertiary)">{val}</text>
            </g>
          )
        })}

        {/* Area paths */}
        <path d={makeAreaPath(pointsPresent)} fill="url(#presentGrad)" />
        <path d={makeAreaPath(pointsAbsent)} fill="url(#absentGrad)" />

        {/* Line paths */}
        <path d={makeSmoothLine(pointsPresent)} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
        <path d={makeSmoothLine(pointsLate)} fill="none" stroke="var(--warning)" strokeWidth="2" strokeDasharray="4 3" />
        <path d={makeSmoothLine(pointsAbsent)} fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" />

        {/* Date X-Axis labels */}
        {data.map((d, i) => {
          if (i % 5 !== 0 && i !== data.length - 1) return null
          const x = padLeft + (i / (data.length - 1)) * chartW
          return (
            <text key={i} x={x} y={height - 6} textAnchor="middle" fontSize="10" fill="var(--text-tertiary)">
              {d.date}
            </text>
          )
        })}

        {/* Hover interaction columns */}
        {data.map((_, i) => {
          const colW = chartW / data.length
          const x = padLeft + i * colW - colW / 2
          return (
            <rect
              key={i}
              x={x}
              y={padTop}
              width={colW}
              height={chartH}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHoverIdx(i)}
            />
          )
        })}

        {/* Active hover vertical cursor line */}
        {activePt && (
          <g>
            <line x1={activePt.x} y1={padTop} x2={activePt.x} y2={padTop + chartH} stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="3 3" />
            <circle cx={activePt.x} cy={activePt.y} r="5" fill="var(--accent)" stroke="#fff" strokeWidth="2" />
          </g>
        )}
      </svg>
    </div>
  )
}

// --- Custom Pure SVG Donut Chart (Turbopack-Safe & Ultra-Fast) ---
function AttritionDonutChart({ data, total }: { data: Array<{ name: string; value: number; color: string }>; total: number }) {
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null)

  const size = 200
  const center = size / 2
  const radius = 68
  const strokeWidth = 24
  const circumference = 2 * Math.PI * radius

  const sum = data.reduce((acc, d) => acc + d.value, 0) || 1

  let accumulatedAngle = 0
  const segments = data.map((d) => {
    const pct = d.value / sum
    const strokeDasharray = `${pct * circumference} ${circumference}`
    const strokeDashoffset = -accumulatedAngle * circumference
    accumulatedAngle += pct
    return { ...d, pct: Math.round(pct * 100), strokeDasharray, strokeDashoffset }
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)', width: size, height: size }}>
          {/* Background circle track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="transparent"
            stroke="rgba(128,128,180,0.1)"
            strokeWidth={strokeWidth}
          />
          {/* Donut segments */}
          {segments.map((seg, idx) => (
            <circle
              key={idx}
              cx={center}
              cy={center}
              r={radius}
              fill="transparent"
              stroke={seg.color}
              strokeWidth={hoveredSegment === seg.name ? strokeWidth + 4 : strokeWidth}
              strokeDasharray={seg.strokeDasharray}
              strokeDashoffset={seg.strokeDashoffset}
              style={{
                transition: 'stroke-width 0.2s ease',
                cursor: 'pointer',
              }}
              onMouseEnter={() => setHoveredSegment(seg.name)}
              onMouseLeave={() => setHoveredSegment(null)}
            />
          ))}
        </svg>

        {/* Center label */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            {total}
          </span>
          <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Employees
          </span>
        </div>
      </div>

      {/* Legend list */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', fontSize: '0.8125rem' }}>
        {segments.map((seg, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              opacity: hoveredSegment && hoveredSegment !== seg.name ? 0.4 : 1,
              transition: 'opacity 0.2s ease',
              cursor: 'pointer',
            }}
            onMouseEnter={() => setHoveredSegment(seg.name)}
            onMouseLeave={() => setHoveredSegment(null)}
          >
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: seg.color }} />
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{seg.name}:</span>
            <span style={{ color: 'var(--text-secondary)' }}>{seg.value} ({seg.pct}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function HRInsightsPage() {
  const supabase = getSupabaseBrowserClient()
  const user = useAuthStore(s => s.user)
  const { success, error: toastError } = useToast()
  const queryClient = useQueryClient()

  const effectiveTenantId =
    user?.tenant?.id ||
    (user as any)?.app_metadata?.tenant_id ||
    (user as any)?.profile?.tenant_id ||
    '11111111-0000-0000-0000-000000000001'

  // 1. 30-day attendance trend
  const { data: attendanceTrend, isLoading: trendLoading } = useQuery({
    queryKey: ['hr-attendance-trend', effectiveTenantId],
    queryFn: async () => {
      const start = format(subDays(new Date(), 29), 'yyyy-MM-dd')
      const { data } = await supabase
        .from('attendance_records')
        .select('date, status')
        .eq('tenant_id', effectiveTenantId)
        .gte('date', start)
        .order('date')

      if (!data || data.length === 0) {
        return eachDayOfInterval({ start: subDays(new Date(), 29), end: new Date() }).map(d => ({
          date: format(d, 'MMM d'),
          present: 0,
          absent: 0,
          late: 0,
        }))
      }

      const grouped = data.reduce((acc: Record<string, { present: number; absent: number; late: number }>, r: any) => {
        if (!acc[r.date]) acc[r.date] = { present: 0, absent: 0, late: 0 }
        if (r.status === 'PRESENT') acc[r.date].present++
        else if (r.status === 'LATE') acc[r.date].late++
        else acc[r.date].absent++
        return acc
      }, {})

      return eachDayOfInterval({ start: subDays(new Date(), 29), end: new Date() }).map(d => {
        const key = format(d, 'yyyy-MM-dd')
        return { date: format(d, 'MMM d'), ...(grouped[key] ?? { present: 0, absent: 0, late: 0 }) }
      })
    },
  })

  // 2. Full Attrition risk scores and distribution
  const { data: attritionData, isLoading: attrLoading } = useQuery({
    queryKey: ['hr-attrition-scores', effectiveTenantId],
    queryFn: async () => {
      const { data: scores } = await supabase
        .from('attrition_risk_scores')
        .select('id, employee_id, score, risk_level, factors, computed_at')
        .eq('tenant_id', effectiveTenantId)

      // Fetch profiles to map names
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('tenant_id', effectiveTenantId)

      const profileMap = new Map((profiles || []).map(p => [p.id, p]))

      const fullScores = (scores || []).map((s: any) => ({
        ...s,
        employee: profileMap.get(s.employee_id) || { full_name: 'Team Member', email: '' },
      }))

      const counts = (scores || []).reduce((acc: Record<string, number>, r: any) => {
        acc[r.risk_level] = (acc[r.risk_level] ?? 0) + 1
        return acc
      }, {})

      const dist = [
        { name: 'Low Risk', value: counts.LOW ?? 0, color: '#10B981' },
        { name: 'Medium Risk', value: counts.MEDIUM ?? 0, color: '#F59E0B' },
        { name: 'High Risk', value: counts.HIGH ?? 0, color: '#EF4444' },
      ]

      return {
        scores: fullScores,
        distribution: dist,
        total: scores?.length || 0,
        highRiskCount: counts.HIGH ?? 0,
        medRiskCount: counts.MEDIUM ?? 0,
        lowRiskCount: counts.LOW ?? 0,
      }
    },
  })

  // 3. Run AI Attrition Scoring Mutation
  const scoreMutation = useMutation({
    mutationFn: async () => {
      const { data: sessData } = await supabase.auth.getSession()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (sessData?.session?.access_token) {
        headers['Authorization'] = `Bearer ${sessData.session.access_token}`
      }

      const res = await fetch('/api/attrition/score', {
        method: 'POST',
        headers,
        credentials: 'include',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to calculate attrition risk scores')
      }
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['hr-attrition-scores'] })
      success(`AI Attrition Model Processed ${data.processed || 0} employees!`)
    },
    onError: (err: any) => {
      toastError('AI Scoring Failed', err.message)
    },
  })

  const dist = attritionData?.distribution || []
  const scores = attritionData?.scores || []

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 className="page-title" style={{ marginBottom: 0 }}>Workforce Insights & AI Analytics</h1>
            <span className="badge badge-accent" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Sparkles size={12} /> AI Predictive Engine
            </span>
          </div>
          <p className="page-subtitle" style={{ marginTop: 4 }}>
            Attendance trends, key attrition risk signals, and proactive retention intelligence.
          </p>
        </div>

        <button
          onClick={() => scoreMutation.mutate()}
          disabled={scoreMutation.isPending}
          className={`btn btn-primary ${scoreMutation.isPending ? 'btn-loading' : ''}`}
          id="btn-run-ai-scoring"
        >
          <RefreshCcw size={15} className={scoreMutation.isPending ? 'anim-spin' : ''} />
          {scoreMutation.isPending ? 'Calculating Signals…' : 'Recalculate AI Risk Signals'}
        </button>
      </div>

      {/* Key Risk Factor Analytics Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <div className="neu-card" style={{ borderLeft: '4px solid #EF4444', padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Excessive Overtime
            </span>
            <Clock size={18} color="#EF4444" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
            {attritionData?.highRiskCount ?? 0} <span style={{ fontSize: '0.9375rem', fontWeight: 500, color: 'var(--text-secondary)' }}>at risk</span>
          </div>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: 0 }}>
            Employees exceeding 20+ hrs overtime in 30 days. High burnout indicator.
          </p>
        </div>

        <div className="neu-card" style={{ borderLeft: '4px solid #F59E0B', padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Declining Check-in Frequency
            </span>
            <Activity size={18} color="#F59E0B" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
            {attritionData?.medRiskCount ?? 0} <span style={{ fontSize: '0.9375rem', fontWeight: 500, color: 'var(--text-secondary)' }}>flagged</span>
          </div>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: 0 }}>
            Tardiness clustering & late punch patterns detected across shifts.
          </p>
        </div>

        <div className="neu-card" style={{ borderLeft: '4px solid #10B981', padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Retention Stability
            </span>
            <CheckCircle2 size={18} color="#10B981" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
            {attritionData?.lowRiskCount ?? 0} <span style={{ fontSize: '0.9375rem', fontWeight: 500, color: 'var(--text-secondary)' }}>stable</span>
          </div>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: 0 }}>
            Consistent attendance and healthy work-rest intervals.
          </p>
        </div>
      </div>

      {/* Main Analytics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
        {/* Attrition Risk Distribution */}
        <div className="neu-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
            <div>
              <h2 style={{ fontSize: 'var(--text-lg)', marginBottom: 2 }}>Organization Attrition Risk Distribution</h2>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: 0 }}>
                Low, Medium, and High risk segmentation
              </p>
            </div>
            <span className="badge badge-neutral" style={{ fontSize: '0.8125rem' }}>
              {attritionData?.total ?? 0} Evaluated
            </span>
          </div>

          {attrLoading ? (
            <div className="skeleton" style={{ height: 240, borderRadius: 12 }} />
          ) : (
            <AttritionDonutChart data={dist} total={attritionData?.total ?? 0} />
          )}
        </div>

        {/* 30-Day Attendance Trend */}
        <div className="neu-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
            <div>
              <h2 style={{ fontSize: 'var(--text-lg)', marginBottom: 2 }}>30-Day Attendance Trend</h2>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: 0 }}>
                Present, Late, and Absent rates over time
              </p>
            </div>
          </div>

          {trendLoading ? (
            <div className="skeleton" style={{ height: 240, borderRadius: 12 }} />
          ) : (
            <AttendanceSvgChart data={attendanceTrend || []} />
          )}
        </div>
      </div>

      {/* Individual Employee Risk Assessment Table */}
      <div className="neu-card" style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-lg)', marginBottom: 2 }}>Key Risk Factor Analytics by Employee</h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: 0 }}>
              Actionable AI risk factors: overtime hours, tardiness clusters, and unplanned leaves
            </p>
          </div>
        </div>

        {scores.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-tertiary)' }}>
            <ShieldAlert size={40} opacity={0.4} style={{ margin: '0 auto 12px' }} />
            <p style={{ marginBottom: 8, fontWeight: 600 }}>No risk scores calculated yet.</p>
            <p style={{ fontSize: '0.875rem', maxWidth: 400, margin: '0 auto' }}>
              Click "Recalculate AI Risk Signals" above to run the predictive analysis model on your team.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: '0.875rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '12px 16px' }}>Employee</th>
                  <th style={{ textAlign: 'left', padding: '12px 16px' }}>Risk Level</th>
                  <th style={{ textAlign: 'left', padding: '12px 16px' }}>Risk Score</th>
                  <th style={{ textAlign: 'left', padding: '12px 16px' }}>Key Contributing Factors</th>
                  <th style={{ textAlign: 'left', padding: '12px 16px' }}>AI Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {scores.map((s: any) => {
                  const pct = Math.round(Number(s.score) * 100)
                  const isHigh = s.risk_level === 'HIGH'
                  const isMed = s.risk_level === 'MEDIUM'
                  const badgeClass = isHigh ? 'badge-danger' : isMed ? 'badge-warning' : 'badge-success'
                  const topDriver = s.factors?.top_driver || (isHigh ? 'Declining Check-in Frequency & Overtime' : isMed ? 'Elevated Overtime' : 'Consistent Engagement')
                  const recommendation = isHigh
                    ? 'Schedule 1-on-1 check-in to balance workload & reduce overtime fatigue.'
                    : isMed
                    ? 'Monitor attendance consistency and review project deadlines.'
                    : 'Optimal workload & retention health.'

                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid rgba(128,128,180,0.06)' }}>
                      <td style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        <div>{s.employee?.full_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 400 }}>
                          {s.employee?.email}
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span className={`badge ${badgeClass}`} style={{ fontWeight: 700 }}>
                          {s.risk_level}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 60, height: 6, background: 'rgba(128,128,180,0.15)', borderRadius: 3, overflow: 'hidden' }}>
                            <div
                              style={{
                                width: `${pct}%`,
                                height: '100%',
                                background: isHigh ? '#EF4444' : isMed ? '#F59E0B' : '#10B981',
                              }}
                            />
                          </div>
                          <span style={{ fontWeight: 700, color: isHigh ? '#EF4444' : isMed ? '#F59E0B' : '#10B981' }}>
                            {pct}%
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>
                        <div style={{ fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>
                          {topDriver}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                          {s.factors?.late_punches_30d !== undefined && `${s.factors.late_punches_30d} late punches`}
                          {s.factors?.overtime_hours_30d !== undefined && ` • ${s.factors.overtime_hours_30d}h OT`}
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                        {recommendation}
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
  )
}
