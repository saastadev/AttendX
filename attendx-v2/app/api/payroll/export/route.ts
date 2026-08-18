import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { format } from 'date-fns'

export async function GET(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()

    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: roles } = await supabase
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)

    const isAuthorized = roles?.some(r => ['HR', 'ADMIN', 'SUPERADMIN'].includes(r.role))
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Forbidden: HR/Admin role required' }, { status: 403 })
    }

    const searchParams = req.nextUrl.searchParams
    const startDate = searchParams.get('startDate') || format(new Date(), 'yyyy-MM-01')
    const endDate = searchParams.get('endDate') || format(new Date(), 'yyyy-MM-dd')
    const tenantId = roles?.[0]?.tenant_id

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context missing' }, { status: 400 })
    }

    const { data: records, error: recErr } = await supabase
      .from('attendance_records')
      .select(`
        date, check_in, check_out, status, work_minutes, method,
        employee:profiles!employee_id(full_name, email)
      `)
      .eq('tenant_id', tenantId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })

    if (recErr) {
      return NextResponse.json({ error: recErr.message }, { status: 500 })
    }

    const headers = ['Employee Name', 'Email', 'Date', 'Status', 'Check In', 'Check Out', 'Work Minutes', 'Method']
    const rows = (records || []).map((r: any) => [
      `"${r.employee?.full_name || ''}"`,
      `"${r.employee?.email || ''}"`,
      r.date,
      r.status,
      r.check_in ? format(new Date(r.check_in), 'HH:mm:ss') : '',
      r.check_out ? format(new Date(r.check_out), 'HH:mm:ss') : '',
      r.work_minutes || 0,
      r.method || '',
    ])

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n')

    await supabase.from('audit_log').insert({
      tenant_id: tenantId,
      actor_id: user.id,
      action: 'PAYROLL_EXPORTED',
      table_name: 'attendance_records',
      new_data: { startDate, endDate, recordCount: records?.length || 0 },
    })

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="payroll_export_${startDate}_to_${endDate}.csv"`,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
