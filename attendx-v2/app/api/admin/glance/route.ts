import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server'

const ALLOWED_ROLES = ['SUPERADMIN', 'ADMIN', 'HR'] as const

export async function GET(_req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const serviceClient = getSupabaseServiceClient()

    // Resolve caller role server-side
    const { data: roleRow } = await serviceClient
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!roleRow || !ALLOWED_ROLES.includes(roleRow.role as any)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Try RPC first, fallback to direct query if RPC is not yet installed in Supabase
    let glance: Record<string, number> = {
      PRESENT: 0,
      COMPLETED: 0,
      ON_LEAVE: 0,
      ABSENT: 0,
      TOTAL: 0,
    }

    const { data, error: rpcErr } = await serviceClient.rpc('admin_attendance_glance', {
      p_tenant_id: roleRow.tenant_id,
    })

    if (!rpcErr && data) {
      for (const row of data) {
        glance[row.status] = Number(row.employee_count)
      }
    } else {
      // Fallback: direct table queries
      const today = new Date().toISOString().split('T')[0]
      const [profilesRes, recordsRes] = await Promise.all([
        serviceClient.from('profiles').select('id').eq('tenant_id', roleRow.tenant_id).eq('is_active', true),
        serviceClient.from('attendance_records').select('employee_id, clock_in_at, clock_out_at, status').eq('tenant_id', roleRow.tenant_id).eq('date', today),
      ])

      const total = profilesRes.data?.length ?? 0
      const records = (recordsRes.data ?? []) as any[]
      const present = records.filter((r: any) => r.clock_in_at && !r.clock_out_at).length
      const completed = records.filter((r: any) => r.clock_out_at).length
      const onLeave = records.filter((r: any) => r.status === 'ON_LEAVE').length
      const absent = Math.max(0, total - (present + completed + onLeave))

      glance = { PRESENT: present, COMPLETED: completed, ON_LEAVE: onLeave, ABSENT: absent, TOTAL: total }
    }

    return NextResponse.json(
      { glance },
      {
        status: 200,
        headers: {
          'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
        },
      }
    )
  } catch (err: any) {
    console.error('[Admin Glance] Unhandled error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
