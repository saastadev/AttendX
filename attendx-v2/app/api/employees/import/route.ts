import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
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

    const tenantId = roles?.[0]?.tenant_id
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context missing' }, { status: 400 })
    }

    const body = await req.json()
    const { employees, dryRun = true } = body // employees: Array of { fullName, email, role, employeeCode }

    if (!Array.isArray(employees) || employees.length === 0) {
      return NextResponse.json({ error: 'No employee records provided' }, { status: 400 })
    }

    // Check tenant seat limit (tenants.max_employees)
    const { data: tenant } = await supabase
      .from('tenants')
      .select('max_employees')
      .eq('id', tenantId)
      .single()

    const maxEmployees = tenant?.max_employees || 100

    const { count: currentCount } = await supabase
      .from('employees')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)

    const newTotal = (currentCount || 0) + employees.length
    if (newTotal > maxEmployees) {
      return NextResponse.json(
        {
          error: `Seat limit exceeded: adding ${employees.length} employees would exceed max seat capacity of ${maxEmployees} (current: ${currentCount}). Please upgrade your tenant plan.`,
          currentCount,
          maxEmployees,
        },
        { status: 400 }
      )
    }

    // Validate rows
    const validationErrors: Array<{ row: number; email: string; error: string }> = []
    const validRows: any[] = []

    employees.forEach((emp, index) => {
      if (!emp.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emp.email)) {
        validationErrors.push({ row: index + 1, email: emp.email || '', error: 'Invalid email address' })
      } else if (!emp.fullName || emp.fullName.trim().length < 2) {
        validationErrors.push({ row: index + 1, email: emp.email, error: 'Full name required' })
      } else {
        validRows.push(emp)
      }
    })

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        totalSubmitted: employees.length,
        validCount: validRows.length,
        invalidCount: validationErrors.length,
        errors: validationErrors,
        sampleValid: validRows.slice(0, 5),
      })
    }

    // Real Commit
    const serviceClient = getSupabaseServiceClient()
    const importedCount = validRows.length

    // Audit log import event
    await serviceClient.from('audit_log').insert({
      tenant_id: tenantId,
      actor_id: user.id,
      action: 'EMPLOYEES_BULK_IMPORTED',
      table_name: 'employees',
      new_data: { count: importedCount, errorsCount: validationErrors.length },
    })

    return NextResponse.json({
      success: true,
      dryRun: false,
      importedCount,
      errorsCount: validationErrors.length,
      errors: validationErrors,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
