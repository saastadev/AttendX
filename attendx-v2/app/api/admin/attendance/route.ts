import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server'

const PRIVILEGED_ROLES = ['SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'] as const

export async function GET(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const serviceClient = getSupabaseServiceClient()

    // Resolve caller's role and tenant
    const { data: roleRow, error: roleErr } = await serviceClient
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (roleErr || !roleRow) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!PRIVILEGED_ROLES.includes(roleRow.role as any)) {
      return NextResponse.json({ error: 'Forbidden — insufficient role' }, { status: 403 })
    }

    const tenantId = roleRow.tenant_id
    const { searchParams } = new URL(req.url)
    const targetDate = searchParams.get('date') || new Date().toISOString().split('T')[0]

    // Fetch active profiles, employees, departments, and attendance records for the target date
    const [profilesRes, employeesRes, departmentsRes, recordsRes, leavesRes] = await Promise.all([
      serviceClient
        .from('profiles')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('full_name', { ascending: true }),
      serviceClient
        .from('employees')
        .select('*')
        .eq('tenant_id', tenantId),
      serviceClient
        .from('departments')
        .select('*')
        .eq('tenant_id', tenantId),
      serviceClient
        .from('attendance_records')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('date', targetDate),
      serviceClient
        .from('leaves')
        .select('*, leave_type:leave_types(name)')
        .eq('tenant_id', tenantId)
        .eq('status', 'APPROVED')
        .lte('start_date', targetDate)
        .gte('end_date', targetDate),
    ])

    const empMap = new Map<string, any>()
    ;(employeesRes.data ?? []).forEach((e: any) => empMap.set(e.id, e))

    const deptMap = new Map<string, any>()
    ;(departmentsRes.data ?? []).forEach((d: any) => deptMap.set(d.id, d))

    const recordMap = new Map<string, any>()
    ;(recordsRes.data ?? []).forEach((r: any) => recordMap.set(r.employee_id, r))

    const leaveMap = new Map<string, any>()
    ;(leavesRes.data ?? []).forEach((l: any) => leaveMap.set(l.employee_id, l))

    let presentCount = 0
    let completedCount = 0
    let lateCount = 0
    let onLeaveCount = 0
    let absentCount = 0

    const items = (profilesRes.data ?? []).map((p: any) => {
      const emp = empMap.get(p.id) || null
      const dept = emp?.department_id ? deptMap.get(emp.department_id) : null
      const att = recordMap.get(p.id) || null
      const leave = leaveMap.get(p.id) || null

      let liveStatus: 'PRESENT' | 'COMPLETED' | 'LATE' | 'ON_LEAVE' | 'ABSENT' = 'ABSENT'

      if (att) {
        if (att.clock_out_at) {
          liveStatus = 'COMPLETED'
          completedCount++
        } else if (att.clock_in_at) {
          if (att.status === 'LATE') {
            liveStatus = 'LATE'
            lateCount++
            presentCount++
          } else {
            liveStatus = 'PRESENT'
            presentCount++
          }
        }
      } else if (leave) {
        liveStatus = 'ON_LEAVE'
        onLeaveCount++
      } else {
        absentCount++
      }

      return {
        user_id: p.id,
        full_name: p.full_name,
        email: p.email,
        avatar_url: p.avatar_url,
        employee_code: emp?.employee_code || 'EMP-' + p.id.slice(0, 4).toUpperCase(),
        department_name: dept?.name || 'General',
        liveStatus,
        attendance: att ? {
          id: att.id,
          clock_in_at: att.clock_in_at,
          clock_out_at: att.clock_out_at,
          status: att.status,
          method: att.method,
          clock_in_selfie_url: att.clock_in_selfie_url,
          clock_out_selfie_url: att.clock_out_selfie_url,
          clock_in_lat: att.clock_in_lat,
          clock_in_lng: att.clock_in_lng,
          work_minutes: att.work_minutes,
        } : null,
        leave: leave ? {
          leave_type_name: leave.leave_type?.name || 'Approved Leave',
          reason: leave.reason,
        } : null,
      }
    })

    const totalActive = items.length

    return NextResponse.json({
      date: targetDate,
      stats: {
        total: totalActive,
        present: presentCount,
        completed: completedCount,
        late: lateCount,
        on_leave: onLeaveCount,
        absent: absentCount,
      },
      items,
    })
  } catch (err: any) {
    console.error('[Admin Attendance API] Error:', err)
    return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const serviceClient = getSupabaseServiceClient()

    // Resolve caller's role
    const { data: roleRow, error: roleErr } = await serviceClient
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (roleErr || !roleRow || !['SUPERADMIN', 'ADMIN', 'HR'].includes(roleRow.role)) {
      return NextResponse.json({ error: 'Forbidden — requires Admin or HR role' }, { status: 403 })
    }

    const body = await req.json()
    const { record_id, target: selfieTarget } = body // selfieTarget: 'clock_in' | 'clock_out' | 'both'

    if (!record_id) {
      return NextResponse.json({ error: 'Missing record_id' }, { status: 400 })
    }

    // Fetch existing attendance record
    const { data: attRecord, error: fetchErr } = await serviceClient
      .from('attendance_records')
      .select('*')
      .eq('id', record_id)
      .eq('tenant_id', roleRow.tenant_id)
      .maybeSingle()

    if (fetchErr || !attRecord) {
      return NextResponse.json({ error: 'Attendance record not found' }, { status: 404 })
    }

    const updateFields: Record<string, any> = {}

    if (selfieTarget === 'clock_in' || selfieTarget === 'both') {
      updateFields.clock_in_selfie_url = null
      if (attRecord.clock_in_selfie_url) {
        const storagePath = attRecord.clock_in_selfie_url.split('/storage/v1/object/public/')[1]
        if (storagePath) {
          const [bucket, ...pathParts] = storagePath.split('/')
          await serviceClient.storage.from(bucket).remove([pathParts.join('/')])
        }
      }
    }

    if (selfieTarget === 'clock_out' || selfieTarget === 'both') {
      updateFields.clock_out_selfie_url = null
      if (attRecord.clock_out_selfie_url) {
        const storagePath = attRecord.clock_out_selfie_url.split('/storage/v1/object/public/')[1]
        if (storagePath) {
          const [bucket, ...pathParts] = storagePath.split('/')
          await serviceClient.storage.from(bucket).remove([pathParts.join('/')])
        }
      }
    }

    const { error: updateErr } = await serviceClient
      .from('attendance_records')
      .update(updateFields)
      .eq('id', record_id)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `Successfully deleted recorded ${selfieTarget} selfie image.`,
    })
  } catch (err: any) {
    console.error('[Admin Delete Selfie API] Error:', err)
    return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status: 500 })
  }
}
