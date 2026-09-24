import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server'
import {
  validateCoordinates,
  validateLocationFreshness,
  isMockLocation,
} from '@/lib/geo'

async function getAuthAndTenant(req: NextRequest) {
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
    return { error: 'Unauthorized session', status: 401 }
  }

  const { data: emp } = await serviceClient
    .from('employees')
    .select('tenant_id')
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
  }

  if (!tenantId) {
    return { error: 'No tenant membership found for this user.', status: 403 }
  }

  const { data: roleRows } = await serviceClient
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)

  const roles = (roleRows ?? []).map((r: any) => r.role)

  return { user, tenantId, roles, serviceClient }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await getAuthAndTenant(req)
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { user, tenantId, serviceClient } = authResult

    const body = await req.json().catch(() => ({}))
    const payload = body.payload || body

    // 1. Mock Location Detection
    if (isMockLocation(payload, body)) {
      await serviceClient.from('audit_log').insert({
        tenant_id: tenantId,
        actor_id: user.id,
        action: 'SECURITY_ALERT_MOCK_LOCATION',
        table_name: 'gps_tracking',
        new_data: {
          event: 'MOCK_LOCATION_BLOCKED',
          lat: payload.lat ?? payload.latitude,
          lng: payload.lng ?? payload.longitude,
          user_agent: req.headers.get('user-agent') || 'unknown',
          timestamp: new Date().toISOString(),
        },
      })

      return NextResponse.json(
        {
          error: 'Mock location detected: Waypoint tracking rejected for fraud prevention',
          code: 'MOCK_LOCATION_DETECTED',
        },
        { status: 403 }
      )
    }

    // 2. Validate coordinates
    const rawLat = payload.latitude ?? payload.lat
    const rawLng = payload.longitude ?? payload.lng
    const coordCheck = validateCoordinates(rawLat, rawLng)
    if (!coordCheck.valid) {
      return NextResponse.json({ error: coordCheck.error }, { status: 400 })
    }

    // 3. Validate timestamp freshness if provided
    const rawTimestamp = payload.timestamp || payload.location_timestamp || new Date().toISOString()
    const freshness = validateLocationFreshness(rawTimestamp)
    if (!freshness.valid) {
      return NextResponse.json({ error: freshness.error }, { status: 400 })
    }

    const speed = typeof payload.speed === 'number' ? payload.speed : 0.0

    // 4. Insert into authoritative gps_tracking table
    const { data: newRow, error: insertErr } = await serviceClient
      .from('gps_tracking')
      .insert({
        tenant_id: tenantId,
        employee_id: user.id,
        latitude: coordCheck.lat!,
        longitude: coordCheck.lng!,
        speed,
        timestamp: rawTimestamp,
      })
      .select('gps_log_id, tenant_id, employee_id, latitude, longitude, speed, timestamp')
      .single()

    if (insertErr) {
      console.error('[Location Track POST DB Error]:', insertErr)
      throw insertErr
    }

    const waypoint = {
      gps_log_id: newRow.gps_log_id,
      id: newRow.gps_log_id,
      tenant_id: newRow.tenant_id,
      employee_id: newRow.employee_id,
      lat: Number(newRow.latitude),
      lng: Number(newRow.longitude),
      latitude: Number(newRow.latitude),
      longitude: Number(newRow.longitude),
      speed: Number(newRow.speed),
      timestamp: newRow.timestamp,
    }

    return NextResponse.json(
      {
        success: true,
        waypoint,
      },
      { status: 201 }
    )
  } catch (err: any) {
    console.error('[Location Track POST API Error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const authResult = await getAuthAndTenant(req)
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { user, tenantId, roles, serviceClient } = authResult

    const url = new URL(req.url)
    const requestedEmpId = url.searchParams.get('employee_id')
    let targetEmployeeId = user.id

    if (requestedEmpId && requestedEmpId !== user.id) {
      const isPrivileged = roles.some((r: string) => ['MANAGER', 'HR', 'ADMIN', 'SUPERADMIN'].includes(r))
      if (!isPrivileged) {
        return NextResponse.json(
          { error: 'Forbidden: Insufficient privileges to view another employee route' },
          { status: 403 }
        )
      }

      const isManagerOnly = roles.includes('MANAGER') && !roles.some((r: string) => ['HR', 'ADMIN', 'SUPERADMIN'].includes(r))
      
      const { data: targetEmp } = await serviceClient
        .from('employees')
        .select('id, manager_id, tenant_id')
        .eq('id', requestedEmpId)
        .eq('tenant_id', tenantId)
        .maybeSingle()

      if (!targetEmp) {
        return NextResponse.json(
          { error: 'Forbidden: Target employee not found in your organization' },
          { status: 403 }
        )
      }

      if (isManagerOnly && targetEmp.manager_id !== user.id) {
        return NextResponse.json(
          { error: 'Forbidden: Target employee is not your direct report' },
          { status: 403 }
        )
      }

      targetEmployeeId = requestedEmpId
    }

    // Read authoritative breadcrumbs from gps_tracking in chronological order
    const { data: rows, error } = await serviceClient
      .from('gps_tracking')
      .select('gps_log_id, tenant_id, employee_id, latitude, longitude, speed, timestamp')
      .eq('tenant_id', tenantId)
      .eq('employee_id', targetEmployeeId)
      .order('timestamp', { ascending: true })
      .limit(500)

    if (error) {
      console.error('[Location Track GET DB Error]:', error)
      throw error
    }

    const waypoints = (rows ?? []).map((r: any) => ({
      gps_log_id: r.gps_log_id,
      id: r.gps_log_id,
      tenant_id: r.tenant_id,
      employee_id: r.employee_id,
      lat: Number(r.latitude),
      lng: Number(r.longitude),
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      speed: Number(r.speed),
      timestamp: r.timestamp,
    }))

    return NextResponse.json({
      success: true,
      count: waypoints.length,
      waypoints,
    })
  } catch (err: any) {
    console.error('[Location Track GET API Error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
