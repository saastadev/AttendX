import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
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
      return NextResponse.json({ error: 'Unauthorized session' }, { status: 401 })
    }

    // Resolve tenant and employee
    const { data: emp } = await serviceClient
      .from('employees')
      .select('id, tenant_id, shift_id')
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
      return NextResponse.json(
        { error: 'No tenant membership found for this user.' },
        { status: 403 }
      )
    }

    // Fetch tenant shifts
    const { data: shifts, error: shiftsErr } = await serviceClient
      .from('shifts')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true })

    if (shiftsErr) throw shiftsErr

    const tenantShifts = shifts ?? []
    const assignedShift = emp?.shift_id
      ? tenantShifts.find(s => s.id === emp.shift_id) || null
      : null
    const defaultShift = tenantShifts.find(s => s.is_default) || null
    const activeShift = assignedShift || defaultShift || (tenantShifts.length > 0 ? tenantShifts[0] : null)

    return NextResponse.json({
      shifts: tenantShifts,
      assignedShift,
      defaultShift,
      activeShift,
      count: tenantShifts.length,
    })
  } catch (err: any) {
    console.error('[Shifts API Error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
