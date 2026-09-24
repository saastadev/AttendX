import { NextResponse, type NextRequest } from 'next/server'
import { resolveAnalyticsAuth } from '@/lib/analytics-auth'

function calculateScheduledMinutes(startTime: string, endTime: string, breakMinutes = 0): number {
  try {
    const [sH, sM] = startTime.split(':').map(Number)
    const [eH, eM] = endTime.split(':').map(Number)
    let totalMins = (eH * 60 + eM) - (sH * 60 + sM)
    // Handle overnight shifts
    if (totalMins < 0) totalMins += 24 * 60
    return Math.max(0, totalMins - breakMinutes)
  } catch {
    return 8 * 60 // 8 hours default
  }
}

export async function GET(req: NextRequest) {
  try {
    const authResult = await resolveAnalyticsAuth(req)
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { tenantId, serviceClient } = authResult

    const url = new URL(req.url)
    const dateParam = url.searchParams.get('date')
    const startDate = url.searchParams.get('startDate') || dateParam
    const endDate = url.searchParams.get('endDate') || dateParam

    // Fetch tenant shifts
    const { data: shifts, error: shiftsErr } = await serviceClient
      .from('shifts')
      .select('*')
      .eq('tenant_id', tenantId)

    if (shiftsErr) throw shiftsErr

    const defaultShiftId = (shifts ?? []).find(s => s.is_default)?.id || (shifts?.[0]?.id ?? 'default')

    // Fetch tenant employees to map assigned shift from roster
    const { data: employees, error: empsErr } = await serviceClient
      .from('employees')
      .select('id, shift_id')
      .eq('tenant_id', tenantId)

    if (empsErr) throw empsErr

    const empShiftMap = new Map<string, string>()
    const assignedCountByShift = new Map<string, number>()
    for (const s of shifts ?? []) {
      assignedCountByShift.set(s.id, 0)
    }

    for (const emp of employees ?? []) {
      const assignedShiftId = emp.shift_id && assignedCountByShift.has(emp.shift_id)
        ? emp.shift_id
        : defaultShiftId

      empShiftMap.set(emp.id, assignedShiftId)
      if (assignedCountByShift.has(assignedShiftId)) {
        assignedCountByShift.set(assignedShiftId, assignedCountByShift.get(assignedShiftId)! + 1)
      }
    }

    // Fetch tenant attendance records
    let query = serviceClient
      .from('attendance_records')
      .select('id, employee_id, date, work_minutes, notes')
      .eq('tenant_id', tenantId)
      .not('work_minutes', 'is', null)

    if (startDate) query = query.gte('date', startDate)
    if (endDate) query = query.lte('date', endDate)

    const { data: records, error: recErr } = await query
    if (recErr) throw recErr

    // Calculate number of days in the evaluated period
    let daysCount = 1
    if (startDate && endDate) {
      const sDate = new Date(startDate)
      const eDate = new Date(endDate)
      const diffMs = eDate.getTime() - sDate.getTime()
      daysCount = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1)
    } else {
      const distinctRecordDates = new Set((records ?? []).map((r: any) => r.date))
      daysCount = distinctRecordDates.size > 0 ? distinctRecordDates.size : 1
    }

    const shiftMap = new Map<string, {
      shiftId: string
      shiftName: string
      scheduledMinutesPerDay: number
      totalWorkedMinutes: number
      recordCount: number
      assignedHeadcount: number
    }>()

    // Initialize shift map
    for (const s of shifts ?? []) {
      const schedMins = calculateScheduledMinutes(s.start_time, s.end_time, s.break_minutes || 0)
      const assignedCount = assignedCountByShift.get(s.id) || 0
      shiftMap.set(s.id, {
        shiftId: s.id,
        shiftName: s.name,
        scheduledMinutesPerDay: schedMins,
        totalWorkedMinutes: 0,
        recordCount: 0,
        assignedHeadcount: assignedCount,
      })
    }

    for (const r of records ?? []) {
      let rShiftId = defaultShiftId
      if (r.notes) {
        try {
          const parsed = typeof r.notes === 'string' ? JSON.parse(r.notes) : r.notes
          if (parsed.shift_id && shiftMap.has(parsed.shift_id)) {
            rShiftId = parsed.shift_id
          }
        } catch {
          // ignore
        }
      }
      if (rShiftId === defaultShiftId && empShiftMap.has(r.employee_id)) {
        const assignedShift = empShiftMap.get(r.employee_id)!
        if (shiftMap.has(assignedShift)) {
          rShiftId = assignedShift
        }
      }

      if (shiftMap.has(rShiftId)) {
        const item = shiftMap.get(rShiftId)!
        item.totalWorkedMinutes += r.work_minutes || 0
        item.recordCount += 1
      }
    }

    let totalScheduledMinsAll = 0
    let totalWorkedMinsAll = 0

    const shiftUtilization = Array.from(shiftMap.values()).map(item => {
      // Scheduled hours is determined from the actual assigned/rostered workforce for the period:
      // If a shift has assigned employees: scheduled capacity = assignedHeadcount * scheduledMinutesPerDay * daysCount
      // Unstaffed shift templates (assignedHeadcount === 0 AND recordCount === 0) contribute 0 to the denominator!
      const scheduledUnits = item.assignedHeadcount > 0
        ? Math.max(item.assignedHeadcount * daysCount, item.recordCount)
        : item.recordCount

      const totalScheduled = scheduledUnits * item.scheduledMinutesPerDay

      totalScheduledMinsAll += totalScheduled
      totalWorkedMinsAll += item.totalWorkedMinutes

      const rate = totalScheduled > 0
        ? Math.round((item.totalWorkedMinutes / totalScheduled) * 10000) / 100
        : 0

      return {
        shiftId: item.shiftId,
        shiftName: item.shiftName,
        scheduledHours: Math.round((item.scheduledMinutesPerDay / 60) * 10) / 10,
        totalScheduledHours: Math.round((totalScheduled / 60) * 10) / 10,
        totalWorkedHours: Math.round((item.totalWorkedMinutes / 60) * 10) / 10,
        assignedHeadcount: item.assignedHeadcount,
        recordCount: item.recordCount,
        utilizationRate: Math.min(100, Math.max(0, rate)),
      }
    })

    const overallRate = totalScheduledMinsAll > 0
      ? Math.round((totalWorkedMinsAll / totalScheduledMinsAll) * 10000) / 100
      : 0

    return NextResponse.json({
      success: true,
      overallUtilization: Math.min(100, Math.max(0, overallRate)),
      shifts: shiftUtilization,
      totalRecordsAnalyzed: (records ?? []).length,
    })
  } catch (err: any) {
    console.error('[Analytics Utilization API Error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
