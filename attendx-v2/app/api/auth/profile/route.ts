import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { requireSupabaseConfig } from '@/lib/env'

export async function GET(request: NextRequest) {
  const { url: supabaseUrl, anonKey: supabaseAnonKey } = requireSupabaseConfig()
  const admin = getSupabaseServiceClient()

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
      const { data: userData } = await admin.auth.getUser(token)
      if (userData?.user) {
        user = userData.user
        authError = null
      }
    }
  }

  if (!user || authError) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [profileRes, roleRes] = await Promise.all([
    admin.from('profiles').select('*, tenant:tenants(*)').eq('id', user.id).maybeSingle(),
    admin.from('user_roles').select('role, tenant_id').eq('user_id', user.id),
  ])

  let profile = profileRes.data
  let roleRows = roleRes.data ?? []

  // Auto-provision profile if missing.
  //
  // Tenant comes ONLY from app_metadata, which is server-controlled and set by
  // the admin provisioning flow. The previous chain preferred user_metadata
  // (client-writable, so a user could choose their own organisation) and then
  // fell back to "whatever tenant is first in the table" / a hardcoded UUID —
  // which quietly turned this endpoint into open self-provisioning into an
  // arbitrary tenant, defeating admin-only account creation.
  if (!profile) {
    const targetTenantId = (user.app_metadata as any)?.tenant_id

    if (!targetTenantId) {
      return NextResponse.json(
        {
          error: 'Account is not provisioned to an organisation.',
          detail: 'An administrator must create your employee record before you can sign in.',
        },
        { status: 403 }
      )
    }

    // A claim only counts if the tenant actually exists.
    const { data: tenantRow } = await admin
      .from('tenants').select('id').eq('id', targetTenantId).maybeSingle()
    if (!tenantRow) {
      return NextResponse.json(
        { error: 'Account references an organisation that no longer exists.' },
        { status: 403 }
      )
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
  if (profile) {
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
