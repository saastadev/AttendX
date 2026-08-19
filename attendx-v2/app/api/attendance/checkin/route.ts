import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server'

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

    const tenantId = emp?.tenant_id || (user.user_metadata as any)?.tenant_id || '11111111-0000-0000-0000-000000000001'

    if (!emp) {
      const empCode = 'EMP-' + user.id.slice(0, 6).toUpperCase()
      await serviceClient.from('employees').upsert({
        id: user.id,
        tenant_id: tenantId,
        employee_code: empCode,
      })
    }

    const body = await req.json()
    const { type, payload, recordId } = body

    if (type === 'clock_in') {
      const record = {
        tenant_id: tenantId,
        employee_id: user.id,
        date: payload.date,
        clock_in_at: payload.clock_in_at,
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
      const updateData = {
        clock_out_at: payload.clock_out_at,
        work_minutes: payload.work_minutes,
        overtime_minutes: payload.overtime_minutes || 0,
        clock_out_selfie_url: payload.clock_out_selfie_url || null,
        clock_out_lat: payload.clock_out_lat ?? null,
        clock_out_lng: payload.clock_out_lng ?? null,
      }

      const { data, error } = await serviceClient
        .from('attendance_records')
        .update(updateData)
        .eq('id', recordId)
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ record: data })
    }

    return NextResponse.json({ error: 'Invalid checkin type' }, { status: 400 })
  } catch (err: any) {
    console.error('[Checkin API Error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
