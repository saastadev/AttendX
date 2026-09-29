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
    const limit = parseInt(url.searchParams.get('limit') || '30', 10)

    let query = serviceClient
      .from('attendance_records')
      .select('id, employee_id, date, status, clock_in_at, clock_out_at, work_minutes')
      .eq('tenant_id', tenantId)
      .order('date', { ascending: false })
      .limit(limit * 50) // enough to cover distinct employees across dates

    if (startDate) query = query.gte('date', startDate)
    if (endDate) query = query.lte('date', endDate)

    const { data: records, error } = await query
    if (error) throw error

    // Group records by date
    const dateMap = new Map<string, {
      date: string
      present: number
      late: number
      absent: number
      half_day: number
      total: number
    }>()

    let totalPresent = 0
    let totalLate = 0
    let totalAbsent = 0
    let totalHalfDay = 0

    for (const r of records ?? []) {
      const d = r.date
      if (!dateMap.has(d)) {
        dateMap.set(d, {
          date: d,
          present: 0,
          late: 0,
          absent: 0,
          half_day: 0,
          total: 0,
        })
      }

      const item = dateMap.get(d)!
      item.total += 1

      const st = (r.status || '').toUpperCase()
      if (st === 'PRESENT') {
        item.present += 1
        totalPresent += 1
      } else if (st === 'LATE') {
        item.late += 1
        totalLate += 1
      } else if (st === 'ABSENT') {
        item.absent += 1
        totalAbsent += 1
      } else if (st === 'HALF_DAY') {
        item.half_day += 1
        totalHalfDay += 1
      } else {
        item.present += 1
        totalPresent += 1
      }
    }

    const trends = Array.from(dateMap.values())
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit)

    return NextResponse.json({
      success: true,
      trends,
      summary: {
        totalRecords: (records ?? []).length,
        totalPresent,
        totalLate,
        totalAbsent,
        totalHalfDay,
      },
    })
  } catch (err: any) {
    console.error('[Analytics Trends API Error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
