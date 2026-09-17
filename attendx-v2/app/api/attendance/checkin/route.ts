import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server'
import { todayInTimezone, isValidDateParam } from '@/lib/tenant-time'

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

    const todayRecord = (records ?? []).find(r => r.date === targetDate) || null

    return NextResponse.json({
      todayDate: targetDate,
      records: records ?? [],
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

    if (!user || authErr) {
      const authHeader = req.headers.get('Authorization')
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7)
        const serviceClient = getSupabaseServiceClient()
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

    const serviceClient = getSupabaseServiceClient()

    // Ensure employee record exists
    const { data: emp } = await serviceClient
      .from('employees')
      .select('id, tenant_id')
      .eq('id', user.id)
      .maybeSingle()

    // Tenant is resolved ONLY from server-owned records.
    //
    // The previous chain fell back to `user.user_metadata.tenant_id` and then
    // to a hardcoded tenant UUID. user_metadata is CLIENT-WRITABLE in Supabase,
    // so a user could set their own tenant_id and have an employee row created
    // inside another organisation. The hardcoded fallback silently filed
    // orphaned users' attendance against one specific tenant.
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
    const { type, payload, recordId } = body
    const effectiveDate = (payload?.date && isValidDateParam(payload.date)) ? payload.date : targetDate

    if (type === 'clock_in') {
      const record = {
        tenant_id: tenantId,
        employee_id: user.id,
        date: effectiveDate,
        clock_in_at: payload.clock_in_at || new Date().toISOString(),
        clock_out_at: null,
        work_minutes: null,
        clock_out_selfie_url: null,
        clock_out_lat: null,
        clock_out_lng: null,
        status: payload.status || 'PRESENT',
        method: payload.method || 'SELFIE_GPS',
        clock_in_selfie_url: payload.clock_in_selfie_url || null,
        clock_in_lat: payload.clock_in_lat ?? null,
        clock_in_lng: payload.clock_in_lng ?? null,
        geofence_id: payload.geofence_id ?? null,
        geofence_valid: payload.geofence_valid ?? null,
      }

      const { data, error } = await serviceClient
        .from('attendance_records')
        .upsert(record, { onConflict: 'tenant_id,employee_id,date' })
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ record: data })

    } else if (type === 'clock_out') {
      const clockOutAt = payload.clock_out_at || new Date().toISOString()
      let workMinutes = payload.work_minutes

      // If work_minutes not supplied by client, compute from existing clock_in_at
      if (typeof workMinutes !== 'number') {
        const { data: existingRec } = await serviceClient
          .from('attendance_records')
          .select('clock_in_at')
          .eq('tenant_id', tenantId)
          .eq('employee_id', user.id)
          .eq('date', effectiveDate)
          .maybeSingle()

        if (existingRec?.clock_in_at) {
          const diffMs = new Date(clockOutAt).getTime() - new Date(existingRec.clock_in_at).getTime()
          workMinutes = Math.max(0, Math.round(diffMs / (1000 * 60)))
        } else {
          workMinutes = 0
        }
      }

      const updateData: Record<string, any> = {
        clock_out_at: clockOutAt,
        work_minutes: workMinutes,
        clock_out_selfie_url: payload.clock_out_selfie_url || null,
        clock_out_lat: payload.clock_out_lat ?? null,
        clock_out_lng: payload.clock_out_lng ?? null,
      }

      if (payload.status) {
        updateData.status = payload.status
      } else if (workMinutes !== undefined) {
        updateData.status = workMinutes < (8 * 60 * 0.5) ? 'HALF_DAY' : 'PRESENT'
      }

      let query = serviceClient.from('attendance_records').update(updateData)
      if (recordId) {
        query = query.eq('id', recordId).eq('employee_id', user.id)
      } else {
        query = query.eq('tenant_id', tenantId).eq('employee_id', user.id).eq('date', effectiveDate)
      }

      const { data, error } = await query.select().single()

      if (error) throw error
      return NextResponse.json({ record: data })
    }

    return NextResponse.json({ error: 'Invalid checkin type' }, { status: 400 })
  } catch (err: any) {
    console.error('[Checkin API Error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
