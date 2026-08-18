import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()

    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const activeTenantId = (user.app_metadata as Record<string, any>)?.tenant_id
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('tenant_id')
      .eq('user_id', user.id)
      .limit(1)
      .single()

    const tenantId = activeTenantId || userRole?.tenant_id
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context missing' }, { status: 400 })
    }

    const body = await req.json()
    const { items } = body // Array of { offlineId, entityType, payload }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'No items provided for sync' }, { status: 400 })
    }

    const serviceClient = getSupabaseServiceClient()
    const syncResults: any[] = []

    for (const item of items) {
      const { offlineId, entityType, payload } = item

      // Log sync attempt to offline_sync_log
      const { data: logEntry, error: logErr } = await serviceClient
        .from('offline_sync_log')
        .upsert(
          {
            tenant_id: tenantId,
            user_id: user.id,
            offline_id: offlineId,
            entity_type: entityType,
            payload: payload,
            status: 'PENDING',
          },
          { onConflict: 'user_id,offline_id' }
        )
        .select()
        .single()

      try {
        let createdEntityId: string | null = null

        if (entityType === 'attendance') {
          const { data: rec, error: recErr } = await serviceClient
            .from('attendance_records')
            .insert({
              tenant_id: tenantId,
              employee_id: user.id,
              date: payload.date || new Date().toISOString().split('T')[0],
              check_in: payload.checkIn || new Date().toISOString(),
              check_out: payload.checkOut || null,
              status: payload.status || 'PRESENT',
              method: 'SELFIE_GPS',
              latitude: payload.latitude || null,
              longitude: payload.longitude || null,
              notes: payload.notes || 'Offline synced punch',
            })
            .select('id')
            .single()

          if (recErr) throw recErr
          createdEntityId = rec.id
        } else if (entityType === 'leave') {
          const { data: lve, error: lveErr } = await serviceClient
            .from('leaves')
            .insert({
              tenant_id: tenantId,
              employee_id: user.id,
              leave_type_id: payload.leaveTypeId,
              start_date: payload.startDate,
              end_date: payload.endDate,
              total_days: payload.totalDays || 1,
              reason: payload.reason || 'Offline leave application',
              status: 'PENDING',
            })
            .select('id')
            .single()

          if (lveErr) throw lveErr
          createdEntityId = lve.id
        }

        // Update offline sync log to SYNCED
        await serviceClient
          .from('offline_sync_log')
          .update({
            status: 'SYNCED',
            entity_id: createdEntityId,
            synced_at: new Date().toISOString(),
          })
          .eq('user_id', user.id)
          .eq('offline_id', offlineId)

        syncResults.push({ offlineId, status: 'SYNCED', entityId: createdEntityId })
      } catch (procErr: any) {
        // Record failure in offline_sync_log
        await serviceClient
          .from('offline_sync_log')
          .update({
            status: 'FAILED',
            error_message: procErr.message,
          })
          .eq('user_id', user.id)
          .eq('offline_id', offlineId)

        syncResults.push({ offlineId, status: 'FAILED', error: procErr.message })
      }
    }

    return NextResponse.json({ success: true, results: syncResults })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
