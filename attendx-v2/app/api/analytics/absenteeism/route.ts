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

    let query = serviceClient
      .from('attendance_records')
      .select('id, employee_id, date, status')
      .eq('tenant_id', tenantId)

    if (startDate) query = query.gte('date', startDate)
    if (endDate) query = query.lte('date', endDate)

    const { data: records, error } = await query
    if (error) throw error

    const totalRecords = (records ?? []).length
    let absentCount = 0
    let presentCount = 0

    for (const r of records ?? []) {
      const st = (r.status || '').toUpperCase()
      if (st === 'ABSENT') {
        absentCount += 1
      } else {
        presentCount += 1
      }
    }

    // Safe division: handles 0 denominator cleanly
    const absenteeismRate =
      totalRecords > 0
        ? Math.round((absentCount / totalRecords) * 10000) / 100 // rounded to 2 decimal places
        : 0

    return NextResponse.json({
      success: true,
      absenteeismRate,
      totalRecords,
      absentCount,
      presentCount,
    })
  } catch (err: any) {
    console.error('[Analytics Absenteeism API Error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
