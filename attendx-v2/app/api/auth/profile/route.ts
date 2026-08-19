import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  let supabaseResponse = NextResponse.next({ request })
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() { return request.cookies.getAll() },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
      },
    },
  })

  let { data: { user }, error: authError } = await supabase.auth.getUser()

  // Fallback: check Authorization header if session cookies are not set
  if (!user || authError) {
    const authHeader = request.headers.get('Authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      const adminClient = createClient(supabaseUrl, serviceRoleKey || supabaseAnonKey)
      const { data: userData } = await adminClient.auth.getUser(token)
      if (userData?.user) {
        user = userData.user
        authError = null
      }
    }
  }

  if (!user || authError) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey || supabaseAnonKey)

  const [profileRes, roleRes] = await Promise.all([
    admin.from('profiles').select('*, tenant:tenants(*)').eq('id', user.id).maybeSingle(),
    admin.from('user_roles').select('role, tenant_id').eq('user_id', user.id),
  ])

  let profile = profileRes.data
  let roleRows = roleRes.data ?? []

  // Auto-provision profile if missing
  if (!profile && serviceRoleKey) {
    const tenantId = (user.user_metadata as any)?.tenant_id || (user.app_metadata as any)?.tenant_id
    let targetTenantId = tenantId
    if (!targetTenantId) {
      const { data: t } = await admin.from('tenants').select('id').limit(1).maybeSingle()
      targetTenantId = t?.id || '11111111-0000-0000-0000-000000000001'
    }

    const fullName = (user.user_metadata as any)?.full_name || user.email?.split('@')[0] || 'User'

    await admin.from('profiles').upsert({
      id: user.id,
      tenant_id: targetTenantId,
      email: user.email!,
      full_name: fullName,
      is_active: true,
      onboarding_completed: true,
    })

    await admin.from('user_roles').upsert({
      user_id: user.id,
      tenant_id: targetTenantId,
      role: 'EMPLOYEE',
    })

    const empCode = 'EMP-' + user.id.slice(0, 6).toUpperCase()
    await admin.from('employees').upsert({
      id: user.id,
      tenant_id: targetTenantId,
      employee_code: empCode,
    })

    const refetchProfile = await admin.from('profiles').select('*, tenant:tenants(*)').eq('id', user.id).maybeSingle()
    const refetchRole = await admin.from('user_roles').select('role, tenant_id').eq('user_id', user.id)

    profile = refetchProfile.data
    roleRows = refetchRole.data ?? []
  }

  // Ensure employee record exists for active user
  if (profile && serviceRoleKey) {
    const { data: emp } = await admin.from('employees').select('id').eq('id', user.id).maybeSingle()
    if (!emp) {
      const empCode = 'EMP-' + user.id.slice(0, 6).toUpperCase()
      await admin.from('employees').upsert({
        id: user.id,
        tenant_id: profile.tenant_id,
        employee_code: empCode,
      })
    }
  }

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const roleRow = roleRows.find(r => r.tenant_id === profile.tenant_id) ?? { role: 'EMPLOYEE', tenant_id: profile.tenant_id }

  return NextResponse.json({
    user: {
      id: user.id,
      email: profile.email,
      profile: {
        id: profile.id,
        tenant_id: profile.tenant_id,
        email: profile.email,
        full_name: profile.full_name,
        avatar_url: profile.avatar_url,
        phone: profile.phone,
        is_active: profile.is_active,
        face_enrolled: profile.face_enrolled,
        onboarding_completed: profile.onboarding_completed,
        last_seen_at: profile.last_seen_at,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
      },
      role: roleRow.role,
      tenant: profile.tenant,
    }
  })
}
