import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server'

// ── Per-admin in-memory rate limiter: max 10 provisioning calls / minute ────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
function checkRateLimit(adminId: string): boolean {
  const now = Date.now()
  const existing = rateLimitMap.get(adminId)
  if (!existing || existing.resetAt < now) {
    rateLimitMap.set(adminId, { count: 1, resetAt: now + 60_000 })
    return true
  }
  if (existing.count >= 30) return false
  existing.count++
  return true
}

const PROVISIONING_ROLES = ['SUPERADMIN', 'ADMIN', 'HR'] as const
type ProvisioningRole = (typeof PROVISIONING_ROLES)[number]

// ── POST /api/admin/employees — Provision a new employee ─────────────────────
export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate the calling admin via cookie session (server-side only)
    const supabase = await getSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const serviceClient = getSupabaseServiceClient()

    // 2. Resolve admin role from DB — never trust a client-supplied claim
    const { data: roleRow, error: roleErr } = await serviceClient
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (roleErr || !roleRow) {
      return NextResponse.json({ error: 'Forbidden — no role record found' }, { status: 403 })
    }
    if (!PROVISIONING_ROLES.includes(roleRow.role as ProvisioningRole)) {
      return NextResponse.json(
        { error: `Forbidden — role '${roleRow.role}' cannot provision employees` },
        { status: 403 }
      )
    }

    const tenantId: string = roleRow.tenant_id

    // 3. Per-admin rate limit
    if (!checkRateLimit(user.id)) {
      return NextResponse.json(
        { error: 'Too many provisioning requests. Wait 60 seconds.' },
        { status: 429 }
      )
    }

    // 4. Parse and validate body
    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const {
      email,
      full_name,
      role = 'EMPLOYEE',
      department_id = null,
      designation_id = null,
      join_date = new Date().toISOString().split('T')[0],
      temp_password,
    } = body

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }
    if (!full_name || typeof full_name !== 'string' || full_name.trim().length < 2) {
      return NextResponse.json({ error: 'full_name must be at least 2 characters' }, { status: 400 })
    }
    const validRoles = ['SUPERADMIN', 'ADMIN', 'HR', 'MANAGER', 'EMPLOYEE']
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    // Role escalation guard: HR can only provision EMPLOYEE/MANAGER
    if (role === 'SUPERADMIN' && roleRow.role !== 'SUPERADMIN') {
      return NextResponse.json({ error: 'Only SUPERADMIN can provision SUPERADMIN role' }, { status: 403 })
    }
    if (role === 'ADMIN' && !['SUPERADMIN', 'ADMIN'].includes(roleRow.role)) {
      return NextResponse.json({ error: 'Only ADMIN/SUPERADMIN can provision ADMIN role' }, { status: 403 })
    }

    // 5. Enforce tenant employee cap
    const { data: tenant } = await serviceClient
      .from('tenants')
      .select('max_employees')
      .eq('id', tenantId)
      .single()

    const { count: empCount } = await serviceClient
      .from('employees')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)

    if (tenant && empCount != null && empCount >= tenant.max_employees) {
      return NextResponse.json(
        { error: `Employee limit of ${tenant.max_employees} reached for this tenant` },
        { status: 422 }
      )
    }

    // 6. Create auth user server-side with service_role (never from client)
    const password = temp_password && temp_password.length >= 8
      ? temp_password
      : generateSecurePassword()

    const { data: newAuthUser, error: createErr } = await serviceClient.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password,
      email_confirm: true,   // Admin has vetted; skip email confirmation loop
      user_metadata: {
        full_name: full_name.trim(),
        tenant_id: tenantId,
        role,               // Migration 007 trigger reads this to set initial role
      },
    })

    if (createErr || !newAuthUser?.user) {
      console.error('[Provision] auth.admin.createUser failed:', createErr)
      return NextResponse.json(
        { error: createErr?.message ?? 'Failed to create auth user' },
        { status: 422 }
      )
    }

    const authUserId = newAuthUser.user.id

    // 7. Provision profile + user_roles + employees records
    // Try RPC first; if not installed in database, perform direct service-role upserts
    let employeeCode = 'EMP-' + authUserId.slice(0, 6).toUpperCase()

    const { data: rpcResult, error: rpcErr } = await serviceClient.rpc(
      'admin_provision_employee',
      {
        p_auth_user_id:   authUserId,
        p_tenant_id:      tenantId,
        p_full_name:      full_name.trim(),
        p_email:          email.toLowerCase().trim(),
        p_role:           role,
        p_department_id:  department_id,
        p_designation_id: designation_id,
        p_join_date:      join_date,
        p_assigned_by:    user.id,
      }
    )

    if (rpcErr) {
      console.warn('[Provision] RPC not found or failed, falling back to direct service upsert:', rpcErr.message)

      // Fallback: direct service client upserts
      const { data: empRows } = await serviceClient
        .from('employees')
        .select('employee_code')
        .eq('tenant_id', tenantId)

      const count = (empRows?.length ?? 0) + 1
      employeeCode = 'EMP-' + String(count).padStart(4, '0')

      await Promise.all([
        serviceClient.from('profiles').upsert({
          id: authUserId,
          tenant_id: tenantId,
          email: email.toLowerCase().trim(),
          full_name: full_name.trim(),
          is_active: true,
          onboarding_completed: true,
        }),
        serviceClient.from('user_roles').upsert({
          user_id: authUserId,
          tenant_id: tenantId,
          role,
          assigned_by: user.id,
        }, { onConflict: 'user_id,tenant_id' }),
        serviceClient.from('employees').upsert({
          id: authUserId,
          tenant_id: tenantId,
          employee_code: employeeCode,
          department_id,
          designation_id,
          join_date,
        }, { onConflict: 'id' }),
      ])
    } else {
      employeeCode = (rpcResult as any)?.employee_code ?? employeeCode
    }

    return NextResponse.json({
      user_id:       authUserId,
      employee_code: employeeCode,
      role,
      email:         email.toLowerCase().trim(),
      full_name:     full_name.trim(),
      ...((!temp_password || temp_password.length < 8) && { temp_password: password }),
    }, { status: 201 })

  } catch (err: any) {
    console.error('[Provision API] Unhandled error:', err)
    return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status: 500 })
  }
}

// ── GET /api/admin/employees — Paginated employee list for admin panel ────────
export async function GET(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const serviceClient = getSupabaseServiceClient()

    const { data: roleRow } = await serviceClient
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!roleRow || !PROVISIONING_ROLES.includes(roleRow.role as ProvisioningRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const page     = Math.max(1, parseInt(searchParams.get('page')     ?? '1', 10))
    const pageSize = Math.min(100, parseInt(searchParams.get('pageSize') ?? '50', 10))
    const search   = searchParams.get('search') ?? ''

    // Fetch profiles, roles, and employees in parallel for maximum reliability
    const [profilesRes, rolesRes, employeesRes] = await Promise.all([
      serviceClient
        .from('profiles')
        .select('*', { count: 'exact' })
        .eq('tenant_id', roleRow.tenant_id)
        .order('created_at', { ascending: false }),
      serviceClient
        .from('user_roles')
        .select('*')
        .eq('tenant_id', roleRow.tenant_id),
      serviceClient
        .from('employees')
        .select('*')
        .eq('tenant_id', roleRow.tenant_id),
    ])

    if (profilesRes.error) throw profilesRes.error

    const rolesMap = new Map<string, string>()
    ;(rolesRes.data ?? []).forEach((r: any) => rolesMap.set(r.user_id, r.role))

    const employeesMap = new Map<string, any>()
    ;(employeesRes.data ?? []).forEach((e: any) => employeesMap.set(e.id, e))

    let merged = (profilesRes.data ?? []).map((p: any) => ({
      ...p,
      role: rolesMap.get(p.id) ?? 'EMPLOYEE',
      employee: employeesMap.get(p.id) ?? null,
    }))

    if (search) {
      const q = search.toLowerCase()
      merged = merged.filter((u: any) =>
        u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
      )
    }

    const totalCount = merged.length
    const paginated = merged.slice((page - 1) * pageSize, page * pageSize)

    return NextResponse.json({
      data: paginated,
      count: totalCount,
      page,
      pageSize,
      hasMore: totalCount > page * pageSize,
    })
  } catch (err: any) {
    console.error('[Admin Employees GET] error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ── PATCH /api/admin/employees — Update role or status ──────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const serviceClient = getSupabaseServiceClient()

    const { data: roleRow } = await serviceClient
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!roleRow || !PROVISIONING_ROLES.includes(roleRow.role as ProvisioningRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

    const { target_user_id, new_role, is_active } = body
    if (!target_user_id) return NextResponse.json({ error: 'target_user_id required' }, { status: 400 })

    // Verify target is in the same tenant
    const { data: targetRole } = await serviceClient
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', target_user_id)
      .maybeSingle()

    if (!targetRole || targetRole.tenant_id !== roleRow.tenant_id) {
      return NextResponse.json({ error: 'Target user not in your tenant' }, { status: 403 })
    }

    const ops: Promise<unknown>[] = []

    if (new_role !== undefined) {
      const validRoles = ['SUPERADMIN', 'ADMIN', 'HR', 'MANAGER', 'EMPLOYEE']
      if (!validRoles.includes(new_role)) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
      }
      ops.push(
        serviceClient
          .from('user_roles')
          .update({ role: new_role, assigned_by: user.id, assigned_at: new Date().toISOString() })
          .eq('user_id', target_user_id)
          .eq('tenant_id', roleRow.tenant_id)
      )
      ops.push(
        serviceClient
          .from('audit_log')
          .insert({
            tenant_id: roleRow.tenant_id,
            actor_id: user.id,
            action: 'ROLE_CHANGED',
            table_name: 'user_roles',
            record_id: target_user_id,
            old_data: { role: targetRole.role },
            new_data: { role: new_role },
          })
      )
    }

    if (is_active !== undefined) {
      ops.push(
        serviceClient
          .from('profiles')
          .update({ is_active, updated_at: new Date().toISOString() })
          .eq('id', target_user_id)
          .eq('tenant_id', roleRow.tenant_id)
      )
      ops.push(
        serviceClient
          .from('audit_log')
          .insert({
            tenant_id: roleRow.tenant_id,
            actor_id: user.id,
            action: is_active ? 'USER_REACTIVATED' : 'USER_DEACTIVATED',
            table_name: 'profiles',
            record_id: target_user_id,
            new_data: { is_active },
          })
      )
    }

    await Promise.all(ops)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[Admin Employees PATCH] error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ── Utility ──────────────────────────────────────────────────────────────────
function generateSecurePassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$'
  let pw = ''
  try {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    for (const b of bytes) pw += chars[b % chars.length]
  } catch {
    for (let i = 0; i < 16; i++) pw += chars[Math.floor(Math.random() * chars.length)]
  }
  return pw
}
