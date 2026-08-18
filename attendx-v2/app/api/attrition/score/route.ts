import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server'
import { subDays, format } from 'date-fns'

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()

    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: roles } = await supabase
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)

    const isHR = roles?.some(r => ['HR', 'ADMIN', 'SUPERADMIN'].includes(r.role))
    if (!isHR) {
      return NextResponse.json({ error: 'Forbidden: HR/Admin role required' }, { status: 403 })
    }

    const tenantId = roles?.[0]?.tenant_id
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context missing' }, { status: 400 })
    }

    const serviceClient = getSupabaseServiceClient()

    const { data: employees } = await serviceClient
      .from('employees')
      .select('id, profile:profiles(full_name, created_at)')
      .eq('tenant_id', tenantId)

    if (!employees || employees.length === 0) {
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
          calculated_at: new Date().toISOString(),
        },
        { onConflict: 'employee_id' }
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

    return NextResponse.json({
      success: true,
      processed: scoringResults.length,
      scores: scoringResults,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
