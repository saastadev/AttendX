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
