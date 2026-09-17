import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import { processWorkforceReport } from '@/lib/reporting/report-service'
import { generateCsvReport } from '@/lib/reporting/export-csv'
import { generatePdfReport } from '@/lib/reporting/export-pdf'
import { generateXlsxReport } from '@/lib/reporting/export-xlsx'
import { generatePptxReport } from '@/lib/reporting/export-pptx'

export async function GET(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient()
    let { data: { user }, error: authErr } = await supabase.auth.getUser()

    if (!user || authErr) {
      const authHeader = req.headers.get('Authorization')
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7)
        const { data: userData } = await getSupabaseServiceClient().auth.getUser(token)
        if (userData?.user) {
          user = userData.user
          authErr = null
        }
      }
    }

    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const serviceClient = getSupabaseServiceClient()

    const { data: roles } = await serviceClient
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)

    const tenantId = roles?.[0]?.tenant_id
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context missing' }, { status: 400 })
    }

    const isAuthorized = roles?.some(r => ['HR', 'ADMIN', 'SUPERADMIN'].includes(r.role?.toUpperCase()))
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Forbidden: HR/Admin role required' }, { status: 403 })
    }

    const searchParams = req.nextUrl.searchParams
    const startDate = searchParams.get('startDate') || format(new Date(), 'yyyy-MM-01')
    const endDate = searchParams.get('endDate') || format(new Date(), 'yyyy-MM-dd')
    const requestedFormat = (searchParams.get('format') || 'csv').toLowerCase()

    const [recRes, profRes] = await Promise.all([
      serviceClient
        .from('attendance_records')
        .select('id, date, clock_in_at, clock_out_at, status, work_minutes, method, employee_id')
        .eq('tenant_id', tenantId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true }),
      serviceClient
        .from('profiles')
        .select('id, full_name, email')
        .eq('tenant_id', tenantId),
    ])

    if (recRes.error) {
      return NextResponse.json({ error: recRes.error.message }, { status: 500 })
    }

    const profMap = new Map((profRes.data || []).map((p: any) => [p.id, p]))
    const records = (recRes.data || []).map((r: any) => {
      const p = profMap.get(r.employee_id)
      return {
        ...r,
        check_in: r.clock_in_at,
        check_out: r.clock_out_at,
        name: p?.full_name || 'Employee',
        email: p?.email || '',
        employee: p || { full_name: 'Employee', email: '' },
      }
    })

    const result = processWorkforceReport(records || [], { startDate, endDate }, 'HR', user.id)
    const baseName = `payroll_export_${startDate}_to_${endDate}`

    try {
      await serviceClient.from('audit_log').insert({
        tenant_id: tenantId,
        actor_id: user.id,
        action: `PAYROLL_EXPORTED:${requestedFormat.toUpperCase()}`,
        table_name: 'attendance_records',
        new_data: { startDate, endDate, format: requestedFormat, recordCount: records?.length || 0 },
      })
    } catch {}

    if (requestedFormat === 'pdf') {
      const pdf = generatePdfReport('Payroll & Attendance Export', result.records, result.summary)
      return new NextResponse(new Uint8Array(pdf), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${baseName}.pdf"`,
        },
      })
    }

    if (requestedFormat === 'xlsx') {
      const xlsx = generateXlsxReport(result.records, result.summary, true)
      return new NextResponse(new Uint8Array(xlsx), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${baseName}.xlsx"`,
        },
      })
    }

    if (requestedFormat === 'pptx') {
      const pptx = generatePptxReport('Payroll & Attendance Export', result.records, result.summary)
      return new NextResponse(new Uint8Array(pptx), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'Content-Disposition': `attachment; filename="${baseName}.pptx"`,
        },
      })
    }

    // Default CSV
    const csvContent = generateCsvReport(result.records, result.summary, true)
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${baseName}.csv"`,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
