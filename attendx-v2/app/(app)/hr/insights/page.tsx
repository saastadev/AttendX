'use client'

import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { Users, TrendingDown, TrendingUp, CalendarDays } from 'lucide-react'
import { format, subDays, parseISO, eachDayOfInterval } from 'date-fns'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth.store'
import { PageWrapper } from '@/components/ui/PageWrapper'
import { AnimatedValue } from '@/components/ui/AnimatedValue'

const RISK_COLORS = ['#10B981', '#F59E0B', '#EF4444']

export default function HRInsightsPage() {
  const supabase = getSupabaseBrowserClient()
  const user = useAuthStore(s => s.user)

  // 30-day attendance trend
  const { data: attendanceTrend, isLoading: trendLoading } = useQuery({
    queryKey: ['hr-attendance-trend', user?.tenant?.id],
    queryFn: async () => {
      if (!user) return []
      const start = format(subDays(new Date(), 29), 'yyyy-MM-dd')
      const { data } = await supabase
        .from('attendance_records')
        .select('date, status')
        .eq('tenant_id', user.tenant.id)
        .gte('date', start)
        .order('date')

      if (!data) return []

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
    enabled: !!user,
  })

  // Attrition risk distribution
  const { data: attritionDist, isLoading: attrLoading } = useQuery({
    queryKey: ['hr-attrition-dist', user?.tenant?.id],
    queryFn: async () => {
      if (!user) return []
      const { data } = await supabase
        .from('attrition_risk_scores')
        .select('risk_level')
        .eq('tenant_id', user.tenant.id)

      if (!data) return []
      const counts = data.reduce((acc: Record<string, number>, r: any) => {
        acc[r.risk_level] = (acc[r.risk_level] ?? 0) + 1
        return acc
      }, {})
      return [
        { name: 'Low', value: counts.LOW ?? 0 },
        { name: 'Medium', value: counts.MEDIUM ?? 0 },
        { name: 'High', value: counts.HIGH ?? 0 },
      ]
    },
    enabled: !!user,
  })

  // Leave usage by type (last 30 days)
  const { data: leaveByType } = useQuery({
    queryKey: ['hr-leave-by-type', user?.tenant?.id],
    queryFn: async () => {
      if (!user) return []
      const { data } = await supabase
        .from('leaves')
        .select('total_days, leave_type:leave_types(name)')
        .eq('tenant_id', user.tenant.id)
        .eq('status', 'APPROVED')
        .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
      if (!data) return []
      const grouped: Record<string, number> = {}
      for (const l of data) {
        const name = (l as any).leave_type?.name ?? 'Other'
        grouped[name] = (grouped[name] ?? 0) + (l.total_days ?? 0)
      }
      return Object.entries(grouped).map(([name, days]) => ({ name, days }))
    },
    enabled: !!user,
  })

  return (
    <PageWrapper style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Workforce Insights</h1>
          <p className="page-subtitle">Attendance trends, leave patterns, and attrition risk signals across your organization</p>
        </div>
      </div>

      {/* Attendance Trend */}
      <div className="neu-card" style={{ marginBottom: 'var(--space-6)' }}>
        <h2 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-5)' }}>30-Day Attendance Trend</h2>
        {trendLoading ? (
          <div className="skeleton" style={{ height: 260, borderRadius: 12 }} />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={attendanceTrend}>
              <defs>
                <linearGradient id="present-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--accent)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--accent)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="absent-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--danger)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--danger)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,180,0.08)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} tickLine={false} axisLine={false}
                interval={4} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  background: 'var(--neu-bg-raised)', border: '1px solid rgba(128,128,180,0.1)',
                  borderRadius: 12, boxShadow: 'var(--elev-2)', fontSize: '0.875rem',
                }}
              />
              <Area type="monotone" dataKey="present" name="Present" stroke="var(--accent)" strokeWidth={2.5} fill="url(#present-grad)" />
              <Area type="monotone" dataKey="late"    name="Late"    stroke="var(--warning)" strokeWidth={2} fill="none" strokeDasharray="4 2" />
              <Area type="monotone" dataKey="absent"  name="Absent"  stroke="var(--danger)"  strokeWidth={2} fill="url(#absent-grad)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
        {/* Attrition Risk Distribution */}
        <div className="neu-card">
          <h2 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-5)' }}>Attrition Risk Distribution</h2>
          {attrLoading ? (
            <div className="skeleton" style={{ height: 220, borderRadius: 12 }} />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={attritionDist} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                  paddingAngle={3} dataKey="value" label={({ name, value }) => value > 0 ? `${name}: ${value}` : ''} labelLine={false}>
                  {attritionDist?.map((_: any, i: number) => (
                    <Cell key={i} fill={RISK_COLORS[i]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Leave Usage */}
        <div className="neu-card">
          <h2 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-5)' }}>Leave Usage (Last 30 Days)</h2>
          {!leaveByType?.length ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 220, color: 'var(--text-tertiary)', flexDirection: 'column', gap: 8 }}>
              <CalendarDays size={40} opacity={0.4} />
              <span style={{ fontSize: '0.875rem' }}>No approved leave data yet</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={leaveByType} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,180,0.08)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} tickLine={false} axisLine={false} width={80} />
                <Tooltip contentStyle={{ background: 'var(--neu-bg-raised)', border: 'none', borderRadius: 12, boxShadow: 'var(--elev-2)', fontSize: '0.875rem' }} />
                <Bar dataKey="days" fill="var(--accent)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </PageWrapper>
  )
}
