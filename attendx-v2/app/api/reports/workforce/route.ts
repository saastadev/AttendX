import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server'
import { processWorkforceReport, ReportFilterParams } from '@/lib/reporting/report-service'
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

    // 1. Resolve user role & tenant (Rule 2)
    const { data: roles } = await serviceClient
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)

    const tenantId = roles?.[0]?.tenant_id
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context missing' }, { status: 400 })
    }

    const primaryRole = roles?.[0]?.role?.toLowerCase() || 'employee'

    // 2. Strict Role Gate: Employees denied (REP-TC-004)
    if (primaryRole === 'employee') {
      return NextResponse.json(
        { error: 'Forbidden: Employees are not authorized to generate workforce reports.' },
        { status: 403 }
      )
    }

    // 3. Parse Query Params
    const searchParams = req.nextUrl.searchParams
    const filters: ReportFilterParams = {
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      department: searchParams.get('department') || undefined,
      designation: searchParams.get('designation') || undefined,
      status: searchParams.get('status') || undefined,
      sortField: (searchParams.get('sortField') as any) || 'date',
      sortDirection: (searchParams.get('sortDirection') as any) || 'desc',
      format: (searchParams.get('format') as any) || 'json',
    }

    // 4. Fetch Raw Records from Database
    let query = serviceClient
      .from('attendance_records')
      .select('id, date, clock_in_at, clock_out_at, status, work_minutes, employee_id')
      .eq('tenant_id', tenantId)

    if (filters.startDate) {
      query = query.gte('date', filters.startDate)
    }
    if (filters.endDate) {
      query = query.lte('date', filters.endDate)
    }

    // Limit to stress test threshold (REP-TC-009)
    query = query.order('date', { ascending: false }).limit(2000)

    const { data: rawRecords, error: dbErr } = await query
    if (dbErr) {
      return NextResponse.json({ error: dbErr.message }, { status: 500 })
    }

    // 5. Fetch Employee & Profile Details for Scoping (department, designation, manager_id)
    const [empRes, profRes] = await Promise.all([
      serviceClient
        .from('employees')
        .select('id, employee_code, manager_id, department:departments(name), designation:designations(name)')
        .eq('tenant_id', tenantId),
      serviceClient
        .from('profiles')
        .select('id, full_name, email')
        .eq('tenant_id', tenantId),
    ])

    const profMap = new Map((profRes.data || []).map((p: any) => [p.id, p]))
    const empMap = new Map((empRes.data || []).map((e: any) => [e.id, {
      ...e,
      full_name: profMap.get(e.id)?.full_name || 'Employee',
      email: profMap.get(e.id)?.email || '',
      department: (e.department as any)?.name || 'General',
      designation: (e.designation as any)?.name || 'Staff',
    }]))

    // Enrich raw records with employee metadata
    const enriched = (rawRecords || []).map((r: any) => {
      const meta = empMap.get(r.employee_id)
      return {
        ...r,
        check_in: r.clock_in_at,
        check_out: r.clock_out_at,
        name: meta?.full_name || 'Employee',
        email: meta?.email || '',
        employee_id: meta?.employee_code || r.employee_id,
        department: meta?.department || 'General',
        designation: meta?.designation || 'Specialist',
        manager_id: meta?.manager_id,
      }
    })

    // 6. Process Report (Scoping, Filtering, Redaction, Sorting, Metrics)
    const result = processWorkforceReport(enriched, filters, primaryRole, user.id)

    // 7. Audit Logging
    try {
      await serviceClient.from('audit_log').insert({
        tenant_id: tenantId,
        actor_id: user.id,
        action: `REPORT_GENERATED:${filters.format?.toUpperCase()}`,
        table_name: 'attendance_records',
        new_data: { filters, summary: result.summary },
      })
    } catch (auditErr) {
      console.warn('[WorkforceReport] Audit log error:', auditErr)
    }

    const fileNameBase = `workforce_report_${filters.startDate || 'all'}_to_${filters.endDate || 'all'}`

    // 8. Return Formatted Response
    if (filters.format === 'csv') {
      const csv = generateCsvReport(result.records, result.summary, !result.isCompensationRedacted)
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${fileNameBase}.csv"`,
        },
      })
    }

    if (filters.format === 'pdf') {
      const pdf = generatePdfReport('Workforce Attendance & Performance Report', result.records, result.summary)
      return new NextResponse(new Uint8Array(pdf), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${fileNameBase}.pdf"`,
        },
      })
    }

    if (filters.format === 'xlsx') {
      const xlsx = generateXlsxReport(result.records, result.summary, !result.isCompensationRedacted)
      return new NextResponse(new Uint8Array(xlsx), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${fileNameBase}.xlsx"`,
        },
      })
    }

    if (filters.format === 'pptx') {
      const pptx = generatePptxReport('Workforce Attendance & Performance Report', result.records, result.summary)
      return new NextResponse(new Uint8Array(pptx), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'Content-Disposition': `attachment; filename="${fileNameBase}.pptx"`,
        },
      })
    }

    // Default JSON
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
