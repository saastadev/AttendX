import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server'
import { todayInTimezone, timeInTimezone, isValidDateParam } from '@/lib/tenant-time'
import {
  haversineDistance,
  validateCoordinates,
  validateLocationFreshness,
  isMockLocation,
} from '@/lib/geo'

/** Unpacks shift_id and overtime_minutes from notes if stored as JSON */
function enrichRecord(record: any) {
  if (!record) return record
  let shiftId = record.shift_id || null
  let overtimeMinutes = record.overtime_minutes ?? 0
  let isMissingOut = false

  if (record.notes) {
    try {
      const parsed = JSON.parse(record.notes)
      if (parsed.shift_id) shiftId = parsed.shift_id
      if (typeof parsed.overtime_minutes === 'number') overtimeMinutes = parsed.overtime_minutes
      if (parsed.missing_out) isMissingOut = true
    } catch {
      if (typeof record.notes === 'string' && record.notes.includes('Missing Out')) {
        isMissingOut = true
      }
    }
  }

  return {
    ...record,
    shift_id: shiftId,
    overtime_minutes: overtimeMinutes,
    missing_out: isMissingOut,
  }
}

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
      return NextResponse.json({ error: 'Unauthorized session' }, { status: 401 })
    }

    // Resolve tenant timezone
    const { data: prof } = await serviceClient
      .from('profiles').select('tenant_id').eq('id', user.id).maybeSingle()
    const { data: emp } = await serviceClient
      .from('employees').select('tenant_id').eq('id', user.id).maybeSingle()
    const tenantId = emp?.tenant_id ?? prof?.tenant_id ?? (user.app_metadata as any)?.tenant_id

    let tz = 'UTC'
    if (tenantId) {
      const { data: t } = await serviceClient.from('tenants').select('timezone').eq('id', tenantId).maybeSingle()
      if (t?.timezone) tz = t.timezone
    }

    const targetDate = todayInTimezone(tz)

    // Fetch personal records for this authenticated employee
    const { data: records, error } = await serviceClient
      .from('attendance_records')
      .select('*')
      .eq('employee_id', user.id)
      .order('date', { ascending: false })
      .limit(31)

    if (error) {
      throw error
    }

    const enrichedRecords = (records ?? []).map(enrichRecord)
    const todayRecord = enrichedRecords.find(r => r.date === targetDate) || null

    return NextResponse.json({
      todayDate: targetDate,
      records: enrichedRecords,
      today: todayRecord,
    })
  } catch (err: any) {
    console.error('[Checkin GET API Error]:', err)
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
      return NextResponse.json({ error: 'Unauthorized session' }, { status: 401 })
    }

    // Ensure employee record exists and retrieve shift_id
    const { data: emp } = await serviceClient
      .from('employees')
      .select('id, tenant_id, shift_id')
      .eq('id', user.id)
      .maybeSingle()

    let tenantId = emp?.tenant_id ?? null

    if (!tenantId) {
      const { data: prof } = await serviceClient
        .from('profiles').select('tenant_id').eq('id', user.id).maybeSingle()
      tenantId = prof?.tenant_id ?? null
    }
    if (!tenantId) {
      const { data: roles } = await serviceClient
        .from('user_roles').select('tenant_id').eq('user_id', user.id)
      if (roles?.length === 1) tenantId = roles[0].tenant_id
      else if ((roles?.length ?? 0) > 1) {
        return NextResponse.json(
          { error: 'Ambiguous tenant membership — select an organisation first' },
          { status: 409 }
        )
      }
    }
    if (!tenantId) {
      return NextResponse.json(
        { error: 'No tenant membership found for this user. Ask an administrator to provision your account.' },
        { status: 403 }
      )
    }

    if (!emp) {
      const empCode = 'EMP-' + user.id.slice(0, 6).toUpperCase()
      await serviceClient.from('employees').upsert({
        id: user.id,
        tenant_id: tenantId,
        employee_code: empCode,
      })
    }

    let tz = 'UTC'
    if (tenantId) {
      const { data: t } = await serviceClient.from('tenants').select('timezone').eq('id', tenantId).maybeSingle()
      if (t?.timezone) tz = t.timezone
    }
    const targetDate = todayInTimezone(tz)

    const body = await req.json()
    const payload = body.payload || body
    const type = body.type || payload.type
    const recordId = body.recordId || payload.recordId
    const effectiveDate = (payload?.date && isValidDateParam(payload.date)) ? payload.date : targetDate

    // 1. Mock Location Detection (TC_LOC_008)
    if (isMockLocation(payload, body)) {
      // Log security fraud event to audit_log
      await serviceClient.from('audit_log').insert({
        tenant_id: tenantId,
        actor_id: user.id,
        action: 'SECURITY_ALERT_MOCK_LOCATION',
        table_name: 'attendance_records',
        new_data: {
          event: 'MOCK_LOCATION_BLOCKED',
          lat: payload.clock_in_lat ?? payload.lat ?? payload.clock_out_lat,
          lng: payload.clock_in_lng ?? payload.lng ?? payload.clock_out_lng,
          user_agent: req.headers.get('user-agent') || 'unknown',
          timestamp: new Date().toISOString(),
        },
      })

      return NextResponse.json(
        {
          error: 'Mock location detected: Attendance check-in rejected for fraud prevention',
          code: 'MOCK_LOCATION_DETECTED',
        },
        { status: 403 }
      )
    }

    // 2. Freshness Check (TC_LOC_007)
    const locationTimestamp = payload.location_timestamp || payload.timestamp || payload.gps_timestamp
    const freshness = validateLocationFreshness(locationTimestamp)
    if (!freshness.valid) {
      return NextResponse.json({ error: freshness.error }, { status: 400 })
    }

    // 3. Resolve Shift (TC_ATT_009)
    let shift: any = null
    if (emp?.shift_id) {
      const { data: s } = await serviceClient
        .from('shifts')
        .select('*')
        .eq('id', emp.shift_id)
        .maybeSingle()
      shift = s
    }
    if (!shift) {
      const { data: defShift } = await serviceClient
        .from('shifts')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_default', true)
        .maybeSingle()
      shift = defShift
    }
    if (!shift) {
      const { data: anyShift } = await serviceClient
        .from('shifts')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      shift = anyShift
    }

    if (type === 'clock_in') {
      // 4. GPS Coordinates Validation (TC_LOC_006, TC_LOC_012)
      const rawLat = payload.clock_in_lat ?? payload.lat
      const rawLng = payload.clock_in_lng ?? payload.lng
      const coordCheck = validateCoordinates(rawLat, rawLng)
      if (!coordCheck.valid) {
        return NextResponse.json({ error: coordCheck.error }, { status: 400 })
      }
      const numLat = coordCheck.lat!
      const numLng = coordCheck.lng!

      // 5. Server-Side Geofence Enforcement (TC_LOC_001, TC_LOC_002, TC_LOC_005, TC_LOC_009)
      const { data: activeGeofences } = await serviceClient
        .from('geofences')
        .select('id, name, lat, lng, radius_m, is_active')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)

      let matchedGeofence: any = null
      let minDistance = Infinity

      if (activeGeofences && activeGeofences.length > 0) {
        for (const gf of activeGeofences) {
          const dist = haversineDistance(numLat, numLng, Number(gf.lat), Number(gf.lng))
          if (dist < minDistance) minDistance = dist
          // Inclusive perimeter check (<= radius_m + 0.5m floating tolerance)
          if (dist <= Number(gf.radius_m) + 0.5) {
            matchedGeofence = gf
            break
          }
        }

        if (!matchedGeofence) {
          return NextResponse.json(
            {
              error: 'OUTSIDE_GEOFENCE: Employee location is outside authorized geofence perimeter',
              distance: Math.round(minDistance),
            },
            { status: 403 }
          )
        }
      }

      // 6. Late / Early Detection (TC_ATT_010)
      const clockInAt = payload.clock_in_at || new Date().toISOString()
      let status = 'PRESENT'

      if (shift && shift.start_time) {
        const punchTimeStr = timeInTimezone(tz, new Date(clockInAt))
        const [punchH, punchM] = punchTimeStr.split(':').map(Number)
        const punchMins = punchH * 60 + punchM

        const [startH, startM] = shift.start_time.split(':').map(Number)
        const startMins = startH * 60 + startM
        const graceMins = 15 // 15 minutes grace period

        if (punchMins > startMins + graceMins) {
          status = 'LATE'
        } else {
          status = 'PRESENT'
        }
      } else if (payload.status) {
        status = payload.status
      }

      const notesObj: Record<string, any> = {
        shift_id: shift?.id || null,
        shift_name: shift?.name || null,
        status,
        grace_period_minutes: 15,
      }
      if (payload.notes) notesObj.custom = payload.notes

      const record = {
        tenant_id: tenantId,
        employee_id: user.id,
        date: effectiveDate,
        clock_in_at: clockInAt,
        clock_out_at: null,
        work_minutes: null,
        clock_out_selfie_url: null,
        clock_out_lat: null,
        clock_out_lng: null,
        status,
        method: payload.method || 'SELFIE_GPS',
        clock_in_selfie_url: payload.clock_in_selfie_url || null,
        clock_in_lat: numLat,
        clock_in_lng: numLng,
        geofence_id: matchedGeofence?.id ?? payload.geofence_id ?? null,
        geofence_valid: matchedGeofence ? true : payload.geofence_valid ?? null,
        notes: JSON.stringify(notesObj),
      }

      const { data, error } = await serviceClient
        .from('attendance_records')
        .upsert(record, { onConflict: 'tenant_id,employee_id,date' })
        .select()
        .single()

      if (error) throw error

      const responseRecord = enrichRecord({
        ...data,
        shift_id: shift?.id || null,
        shift: shift || null,
      })

      return NextResponse.json({ record: responseRecord })

    } else if (type === 'clock_out') {
      const clockOutAt = payload.clock_out_at || new Date().toISOString()

      // Validate coordinates if provided on clock-out
      const rawLat = payload.clock_out_lat ?? payload.lat
      const rawLng = payload.clock_out_lng ?? payload.lng
      let numLat: number | null = null
      let numLng: number | null = null

      if (rawLat !== undefined && rawLat !== null && rawLat !== '') {
        const coordCheck = validateCoordinates(rawLat, rawLng)
        if (!coordCheck.valid) {
          return NextResponse.json({ error: coordCheck.error }, { status: 400 })
        }
        numLat = coordCheck.lat!
        numLng = coordCheck.lng!
      }

      // Fetch existing clock-in record
      const { data: existingRec } = await serviceClient
        .from('attendance_records')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('employee_id', user.id)
        .eq('date', effectiveDate)
        .maybeSingle()

      let workMinutes = payload.work_minutes
      if (typeof workMinutes !== 'number') {
        if (existingRec?.clock_in_at) {
          const diffMs = new Date(clockOutAt).getTime() - new Date(existingRec.clock_in_at).getTime()
          workMinutes = Math.max(0, Math.round(diffMs / (1000 * 60)))
        } else {
          workMinutes = 0
        }
      }

      // 7. Overtime Calculation (TC_ATT_011)
      let overtimeMinutes = 0
      if (shift && shift.end_time) {
        const punchOutTimeStr = timeInTimezone(tz, new Date(clockOutAt))
        const [outH, outM] = punchOutTimeStr.split(':').map(Number)
        const outMins = outH * 60 + outM

        const [endH, endM] = shift.end_time.split(':').map(Number)
        const endMins = endH * 60 + endM

        if (outMins > endMins) {
          overtimeMinutes = outMins - endMins
        }
      }

      // Update notes with overtime metadata
      let notesObj: Record<string, any> = {}
      if (existingRec?.notes) {
        try {
          notesObj = JSON.parse(existingRec.notes)
        } catch {
          notesObj = { custom: existingRec.notes }
        }
      }
      notesObj.shift_id = shift?.id || notesObj.shift_id || null
      notesObj.shift_name = shift?.name || notesObj.shift_name || null
      notesObj.overtime_minutes = overtimeMinutes

      const updateData: Record<string, any> = {
        clock_out_at: clockOutAt,
        work_minutes: workMinutes,
        clock_out_selfie_url: payload.clock_out_selfie_url || null,
        clock_out_lat: numLat,
        clock_out_lng: numLng,
        notes: JSON.stringify(notesObj),
      }

      if (payload.status) {
        updateData.status = payload.status
      } else if (workMinutes !== undefined) {
        updateData.status = workMinutes < (8 * 60 * 0.5) ? 'HALF_DAY' : (existingRec?.status || 'PRESENT')
      }

      let query = serviceClient.from('attendance_records').update(updateData)
      if (recordId) {
        query = query.eq('id', recordId).eq('employee_id', user.id)
      } else {
        query = query.eq('tenant_id', tenantId).eq('employee_id', user.id).eq('date', effectiveDate)
      }

      const { data, error } = await query.select().single()
      if (error) throw error

      const responseRecord = enrichRecord({
        ...data,
        shift_id: shift?.id || null,
        shift: shift || null,
        overtime_minutes: overtimeMinutes,
      })

      return NextResponse.json({ record: responseRecord })
    }

    return NextResponse.json({ error: 'Invalid checkin type' }, { status: 400 })
  } catch (err: any) {
    console.error('[Checkin API Error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
