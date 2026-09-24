import { NextResponse, type NextRequest } from 'next/server'
import { resolveAnalyticsAuth } from '@/lib/analytics-auth'

export async function GET(req: NextRequest) {
  try {
    const authResult = await resolveAnalyticsAuth(req)
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { tenantId, serviceClient } = authResult

    const url = new URL(req.url)
    const startDate = url.searchParams.get('startDate')
    const endDate = url.searchParams.get('endDate')
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)

    let query = serviceClient
      .from('attendance_records')
      .select('id, employee_id, date, clock_in_at, clock_out_at, work_minutes, notes')
      .eq('tenant_id', tenantId)
      .not('clock_out_at', 'is', null)
      .order('date', { ascending: false })
      .limit(limit * 10)

    if (startDate) query = query.gte('date', startDate)
    if (endDate) query = query.lte('date', endDate)

    const { data: records, error } = await query
    if (error) throw error

    let totalOvertimeMinutes = 0
    const overtimeRecords: any[] = []

    for (const r of records ?? []) {
      let otMinutes = 0
      let shiftName: string | null = null

      if (r.notes) {
        try {
          const parsed = JSON.parse(r.notes)
          if (typeof parsed.overtime_minutes === 'number') {
            otMinutes = parsed.overtime_minutes
          }
          if (parsed.shift_name) {
            shiftName = parsed.shift_name
          }
        } catch {
          // non-json notes
        }
      }

      // If work_minutes exceeded standard 8h (480 mins) and not explicitly set
      if (otMinutes === 0 && r.work_minutes && r.work_minutes > 480) {
        otMinutes = r.work_minutes - 480
      }

      if (otMinutes > 0) {
        totalOvertimeMinutes += otMinutes
        overtimeRecords.push({
          id: r.id,
          employee_id: r.employee_id,
          date: r.date,
          clock_in_at: r.clock_in_at,
          clock_out_at: r.clock_out_at,
          work_minutes: r.work_minutes,
          overtime_minutes: otMinutes,
          shift_name: shiftName,
        })
      }
    }

    const limitedRecords = overtimeRecords.slice(0, limit)
    const totalOvertimeHours = Math.round((totalOvertimeMinutes / 60) * 100) / 100

    return NextResponse.json({
      success: true,
      totalOvertimeMinutes,
      totalOvertimeHours,
      overtimeRecordsCount: overtimeRecords.length,
      records: limitedRecords,
    })
  } catch (err: any) {
    console.error('[Analytics Overtime API Error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
