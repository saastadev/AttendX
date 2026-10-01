import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server'
import { subDays, format, eachDayOfInterval } from 'date-fns'

export async function GET(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient()
    let { data: { user }, error: authErr } = await supabase.auth.getUser()
    const serviceClient = getSupabaseServiceClient()

    if (!user || authErr) {
      const authHeader = req.headers.get('Authorization')
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7)
        const { data: userData } = await serviceClient.auth.getUser(token)
        if (userData?.user) {
          user = userData.user
          authErr = null
        }
      }
    }

    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: roles } = await serviceClient
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)

    const isHR = roles?.some(r => ['HR', 'ADMIN', 'SUPERADMIN'].includes(r.role))
    if (!isHR) {
      return NextResponse.json({ error: 'Forbidden: HR/Admin role required' }, { status: 403 })
    }

    const activeTenantClaim = (user.app_metadata as Record<string, unknown> | undefined)?.tenant_id as string | undefined
    const { searchParams } = new URL(req.url)
    let tenantId = searchParams.get('tenant_id')

    if (tenantId && activeTenantClaim && tenantId !== activeTenantClaim) {
      const hasTenantRole = roles?.some(r => r.tenant_id === tenantId && ['HR', 'ADMIN', 'SUPERADMIN'].includes(r.role))
      if (!hasTenantRole) {
        return NextResponse.json({ error: 'Forbidden: Tenant isolation mismatch' }, { status: 403 })
      }
    }

    if (!tenantId) {
      const roleRow = (roles || []).find((r: any) => activeTenantClaim ? r.tenant_id === activeTenantClaim : true) || roles?.[0]
      tenantId = activeTenantClaim || roleRow?.tenant_id
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context missing' }, { status: 400 })
    }

    // 1. Fetch scores
    const { data: scores } = await serviceClient
      .from('attrition_risk_scores')
      .select('id, employee_id, score, risk_level, factors, computed_at')
      .eq('tenant_id', tenantId)

    // 2. Fetch profiles
    const { data: profiles } = await serviceClient
      .from('profiles')
      .select('id, full_name, email')
      .eq('tenant_id', tenantId)

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

    // 3. Fetch 30-day attendance trend
    const start = format(subDays(new Date(), 29), 'yyyy-MM-dd')
    const { data: attData } = await serviceClient
      .from('attendance_records')
      .select('date, status')
      .eq('tenant_id', tenantId)
      .gte('date', start)
      .order('date')

    const grouped = (attData || []).reduce((acc: Record<string, { present: number; absent: number; late: number }>, r: any) => {
      if (!acc[r.date]) acc[r.date] = { present: 0, absent: 0, late: 0 }
      if (r.status === 'PRESENT') acc[r.date].present++
      else if (r.status === 'LATE') acc[r.date].late++
      else acc[r.date].absent++
      return acc
    }, {})

    const attendanceTrend = eachDayOfInterval({ start: subDays(new Date(), 29), end: new Date() }).map(d => {
      const key = format(d, 'yyyy-MM-dd')
      return { date: format(d, 'MMM d'), ...(grouped[key] ?? { present: 0, absent: 0, late: 0 }) }
    })

    return NextResponse.json({
      scores: fullScores,
      distribution: dist,
      total: scores?.length || 0,
      highRiskCount: counts.HIGH ?? 0,
      medRiskCount: counts.MEDIUM ?? 0,
      lowRiskCount: counts.LOW ?? 0,
      attendanceTrend,
    })
  } catch (err: any) {
    console.error('[Attrition Score GET Error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient()
    let { data: { user }, error: authErr } = await supabase.auth.getUser()
    const serviceClient = getSupabaseServiceClient()

    if (!user || authErr) {
      const authHeader = req.headers.get('Authorization')
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7)
        const { data: userData } = await serviceClient.auth.getUser(token)
        if (userData?.user) {
          user = userData.user
          authErr = null
        }
      }
    }

    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: roles } = await serviceClient
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)

    const isHR = roles?.some(r => ['HR', 'ADMIN', 'SUPERADMIN'].includes(r.role))
    if (!isHR) {
      return NextResponse.json({ error: 'Forbidden: HR/Admin role required' }, { status: 403 })
    }

    const activeTenantClaim = (user.app_metadata as Record<string, unknown> | undefined)?.tenant_id as string | undefined
    const body = await req.json().catch(() => ({}))
    let tenantId = body?.tenant_id

    if (tenantId && activeTenantClaim && tenantId !== activeTenantClaim) {
      const hasTenantRole = roles?.some(r => r.tenant_id === tenantId && ['HR', 'ADMIN', 'SUPERADMIN'].includes(r.role))
      if (!hasTenantRole) {
        return NextResponse.json({ error: 'Forbidden: Tenant isolation mismatch' }, { status: 403 })
      }
    }

    if (!tenantId) {
      const roleRow = (roles || []).find((r: any) => activeTenantClaim ? r.tenant_id === activeTenantClaim : true) || roles?.[0]
      tenantId = activeTenantClaim || roleRow?.tenant_id
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context missing' }, { status: 400 })
    }

    // Query employees and active tenant profiles to ensure all valid employees are included (PA_TC_001 / PA_TC_006)
    const [empRes, profRes] = await Promise.all([
      serviceClient.from('employees').select('id, created_at').eq('tenant_id', tenantId),
      serviceClient.from('profiles').select('id, created_at').eq('tenant_id', tenantId).eq('is_active', true),
    ])

    const empMap = new Map<string, any>()
    for (const emp of (empRes.data || [])) empMap.set(emp.id, emp)
    for (const prof of (profRes.data || [])) {
      if (!empMap.has(prof.id)) {
        empMap.set(prof.id, { id: prof.id, created_at: prof.created_at })
      }
    }
    const employees = Array.from(empMap.values())

    if (employees.length === 0) {
      return NextResponse.json({ processed: 0, message: 'No employees to score' })
    }

    const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd')
    const scoringResults = []

    for (const emp of employees) {
      const { data: att } = await serviceClient
        .from('attendance_records')
        .select('status')
        .eq('employee_id', emp.id)
        .gte('date', thirtyDaysAgo)

      const latePunches = att?.filter((a: any) => a.status === 'LATE').length || 0
      const absentPunches = att?.filter((a: any) => a.status === 'ABSENT').length || 0

      const { data: leaves } = await serviceClient
        .from('leaves')
        .select('id')
        .eq('employee_id', emp.id)
        .gte('created_at', subDays(new Date(), 60).toISOString())

      const leaveCount = leaves?.length || 0

      const lateScore = Math.min(latePunches * 0.15, 0.45)
      const absentScore = Math.min(absentPunches * 0.25, 0.50)
      const leaveScore = Math.min(leaveCount * 0.10, 0.30)

      let totalScore = Math.min(parseFloat((lateScore + absentScore + leaveScore).toFixed(2)), 0.99)
      if (totalScore < 0.10) totalScore = 0.08

      let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW'
      if (totalScore >= 0.65) riskLevel = 'HIGH'
      else if (totalScore >= 0.35) riskLevel = 'MEDIUM'

      const factors = {
        late_punches_30d: latePunches,
        absent_days_30d: absentPunches,
        leave_requests_60d: leaveCount,
        breakdown: {
          tardiness_impact: lateScore,
          absenteeism_impact: absentScore,
          leave_frequency_impact: leaveScore,
        },
      }

      await serviceClient.from('attrition_risk_scores').upsert(
        {
          tenant_id: tenantId,
          employee_id: emp.id,
          score: totalScore,
          risk_level: riskLevel,
          factors: factors,
          computed_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,employee_id' }
      )

      scoringResults.push({ employeeId: emp.id, score: totalScore, riskLevel, factors })
    }

    await serviceClient.from('audit_log').insert({
      tenant_id: tenantId,
      actor_id: user.id,
      action: 'ATTRITION_SCORES_CALCULATED',
      table_name: 'attrition_risk_scores',
      new_data: { processedCount: scoringResults.length },
    })

    const counts = scoringResults.reduce((acc: Record<string, number>, r: any) => {
      acc[r.riskLevel] = (acc[r.riskLevel] ?? 0) + 1
      return acc
    }, {})

    return NextResponse.json({
      success: true,
      processed: scoringResults.length,
      evaluated_count: scoringResults.length,
      scores: scoringResults,
      results: scoringResults,
      risk_distribution: counts,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
