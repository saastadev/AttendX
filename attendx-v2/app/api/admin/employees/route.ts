import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server'
import { ServerIdentity } from '@/lib/auth/server-identity'

// ── Per-admin in-memory rate limiter: max 30 provisioning calls / minute ────
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
  let authUserId: string | null = null
  const serviceClient = getSupabaseServiceClient()

  try {
    // 1. Authenticate caller server-side (BRD §7: Authoritative Caller Identity)
    const caller = await ServerIdentity.getAuthoritativeCaller(['SUPERADMIN', 'ADMIN', 'HR'])

    // 2. Per-admin rate limit
    if (!checkRateLimit(caller.userId)) {
      return NextResponse.json(
        { error: 'Too many provisioning requests. Wait 60 seconds.', code: 'RATE_LIMIT_EXCEEDED' },
        { status: 429 }
      )
    }

    // 3. Parse and validate body
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

    // Role escalation guards
    if (role === 'SUPERADMIN' && caller.role !== 'SUPERADMIN') {
      return NextResponse.json({ error: 'Only SUPERADMIN can provision SUPERADMIN role' }, { status: 403 })
    }
    if (role === 'ADMIN' && !['SUPERADMIN', 'ADMIN'].includes(caller.role)) {
      return NextResponse.json({ error: 'Only ADMIN/SUPERADMIN can provision ADMIN role' }, { status: 403 })
    }

    // 4. Create auth user server-side with service_role (BRD §8: app_metadata Binding)
    const securePassword = generateSecurePassword()
    const cleanEmail = email.toLowerCase().trim()
    const cleanFullName = full_name.trim()

    const { data: newAuthUser, error: createErr } = await serviceClient.auth.admin.createUser({
      email: cleanEmail,
      password: securePassword,
      email_confirm: true,
      app_metadata: {
        tenant_id: caller.tenantId, // Evaluated authoritatively by get_my_tenant_id()
        role,
      },
      user_metadata: {
        full_name: cleanFullName,
      },
    })

    if (createErr || !newAuthUser?.user) {
      console.error('[Provision] auth.admin.createUser error:', createErr?.message)
      const isDuplicate = createErr?.message?.toLowerCase().includes('already') || createErr?.status === 422
      return NextResponse.json(
        { error: isDuplicate ? 'An account with this email already exists.' : createErr?.message ?? 'Failed to create auth user' },
        { status: isDuplicate ? 409 : 422 }
      )
    }

    authUserId = newAuthUser.user.id

    // 5. Execute Atomic Database Provisioning Stored Procedure (BRD §9, §10)
    const { data: rpcResult, error: rpcErr } = await serviceClient.rpc(
      'admin_provision_employee_v2',
      {
        p_auth_user_id:   authUserId,
        p_tenant_id:      caller.tenantId,
        p_full_name:      cleanFullName,
        p_email:          cleanEmail,
        p_role:           role,
        p_department_id:  department_id,
        p_designation_id: designation_id,
        p_join_date:      join_date,
        p_assigned_by:    caller.userId,
      }
    )

    if (rpcErr) {
      console.error('[Provision] Database RPC failed — initiating compensating rollback:', rpcErr.message)

      // Mandatory Compensating Rollback (Rule 4: Zero Orphans)
      try {
        await serviceClient.auth.admin.deleteUser(authUserId)
        console.log(`[Provision] Compensating rollback complete: deleted Auth user ${authUserId}`)
      } catch (rollbackErr: any) {
        console.error('[Provision] Rollback failed:', rollbackErr.message)
      }

      const isSeatLimit = rpcErr.code === 'EX001' || rpcErr.message.includes('SEAT_LIMIT_REACHED')
      return NextResponse.json(
        {
          error: isSeatLimit ? 'Employee seat limit reached.' : 'Provisioning failed due to database error.',
          code: isSeatLimit ? 'SEAT_LIMIT_REACHED' : 'DATABASE_ERROR',
        },
        { status: isSeatLimit ? 422 : 500 }
      )
    }

    const employeeCode = (rpcResult as any)?.employee_code || 'EMP-PROVISIONED'

    // 6. Return 201 Created (BRD §11: Rule 5 Zero Passwords)
    return NextResponse.json({
      success: true,
      user_id:       authUserId,
      employee_code: employeeCode,
      role,
      email:         cleanEmail,
      full_name:     cleanFullName,
      message:       'Employee provisioned successfully. User must change password upon first login.',
    }, { status: 201 })

  } catch (err: any) {
    console.error('[Provision API] Unhandled error:', err)
    if (authUserId) {
      try {
        await serviceClient.auth.admin.deleteUser(authUserId)
      } catch (delErr: any) {
        console.warn('[Provision API] Cleanup deletion failed:', delErr.message)
      }
    }
    const status = err.status || 500
    return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status })
  }
}

// ── GET /api/admin/employees — Paginated employee list for admin panel ────────
export async function GET(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const serviceClient = getSupabaseServiceClient()
    const activeTenantClaim = (user.app_metadata as Record<string, unknown> | undefined)?.tenant_id as string | undefined
    const { data: roleRows } = await serviceClient
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)

    const roleRow = (roleRows || []).find((r: any) => activeTenantClaim ? r.tenant_id === activeTenantClaim : true) || roleRows?.[0]

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

    const ops: PromiseLike<unknown>[] = []

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
