import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server'
import { todayInTimezone } from '@/lib/tenant-time'

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

  let tz = 'UTC'
  const { data: t } = await serviceClient.from('tenants').select('timezone').eq('id', tenantId).maybeSingle()
  if (t?.timezone) tz = t.timezone

  return { user, tenantId, tz, serviceClient }
}

export async function GET(req: NextRequest) {
  try {
    const authResult = await getAuthAndTenant(req)
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { tenantId, tz, serviceClient } = authResult
    const targetDate = todayInTimezone(tz)

    // Find all attendance records before today that have clock_in_at but no clock_out_at
    const { data: missingOutRecords, error } = await serviceClient
      .from('attendance_records')
      .select('*')
      .eq('tenant_id', tenantId)
      .not('clock_in_at', 'is', null)
      .is('clock_out_at', null)
      .lt('date', targetDate)

    if (error) throw error

    return NextResponse.json({
      success: true,
      count: (missingOutRecords ?? []).length,
      records: missingOutRecords ?? [],
    })
  } catch (err: any) {
    console.error('[AutoCheckout GET API Error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await getAuthAndTenant(req)
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { tenantId, tz, serviceClient } = authResult
    const targetDate = todayInTimezone(tz)

    // Optional query or body parameter to include today's completed shifts
    let body: any = {}
    try {
      body = await req.json()
    } catch {
      // Body is optional
    }

    const beforeDate = body.beforeDate || targetDate

    // Find all records needing auto-checkout or missing-out flagging
    const { data: openRecords, error: fetchErr } = await serviceClient
      .from('attendance_records')
      .select('*')
      .eq('tenant_id', tenantId)
      .not('clock_in_at', 'is', null)
      .is('clock_out_at', null)
      .lt('date', beforeDate)

    if (fetchErr) throw fetchErr

    const updatedRecords: any[] = []

    for (const record of openRecords ?? []) {
      let notesObj: Record<string, any> = {}
      if (record.notes) {
        try {
          notesObj = JSON.parse(record.notes)
        } catch {
          notesObj = { custom: record.notes }
        }
      }
      notesObj.missing_out = true
      notesObj.auto_flagged = true
      notesObj.flagged_at = new Date().toISOString()
      notesObj.note = 'Missing Out'

      const updatePayload: Record<string, any> = {
        notes: JSON.stringify(notesObj),
        status: record.status === 'LATE' ? 'LATE' : 'HALF_DAY',
      }

      const { data: updated, error: updErr } = await serviceClient
        .from('attendance_records')
        .update(updatePayload)
        .eq('id', record.id)
        .select()
        .single()

      if (!updErr && updated) {
        updatedRecords.push({
          ...updated,
          missing_out: true,
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed missing out checks: ${updatedRecords.length} records flagged`,
      count: updatedRecords.length,
      records: updatedRecords,
    })
  } catch (err: any) {
    console.error('[AutoCheckout POST API Error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
