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
    const date = url.searchParams.get('date')
    const startDate = url.searchParams.get('startDate')
    const endDate = url.searchParams.get('endDate')
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)

    let query = serviceClient
      .from('attendance_records')
      .select('id, employee_id, date, status, clock_in_at, notes, created_at')
      .eq('tenant_id', tenantId)
      .eq('status', 'LATE')
      .order('date', { ascending: false })
      .order('clock_in_at', { ascending: false })
      .limit(limit)

    if (date) query = query.eq('date', date)
    if (startDate) query = query.gte('date', startDate)
    if (endDate) query = query.lte('date', endDate)

    const { data: records, error } = await query
    if (error) throw error

    const lateArrivals = (records ?? []).map((r: any) => {
      let shiftName: string | null = null
      let shiftId: string | null = null
      if (r.notes) {
        try {
          const parsed = JSON.parse(r.notes)
          shiftName = parsed.shift_name || null
          shiftId = parsed.shift_id || null
        } catch {
          // ignore non-json notes
        }
      }
      return {
        id: r.id,
        employee_id: r.employee_id,
        date: r.date,
        clock_in_at: r.clock_in_at,
        shift_id: shiftId,
        shift_name: shiftName,
        status: r.status,
      }
    })

    return NextResponse.json({
      success: true,
      count: lateArrivals.length,
      lateArrivals,
    })
  } catch (err: any) {
    console.error('[Analytics Late Arrivals API Error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
