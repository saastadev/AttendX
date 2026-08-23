// ============================================================
// AttendX v2 — Admin Remote Session Revocation
// POST /api/admin/users/[id]/revoke-sessions
// Allows Admin/Superadmin to terminate all active sessions for an employee
// ============================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server'
import { SessionManager } from '@/lib/auth/session-manager'

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetUserId } = await context.params

    if (!targetUserId) {
      return NextResponse.json({ error: 'Target user ID is required.' }, { status: 400 })
    }

    const supabase = await getSupabaseServerClient()
    const { data: { user: caller }, error: authErr } = await supabase.auth.getUser()

    if (!caller || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const serviceClient = getSupabaseServiceClient()

    // 1. Resolve Caller Role and Tenant server-side
    const { data: callerRoleRow } = await serviceClient
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', caller.id)
      .maybeSingle()

    if (!callerRoleRow || !['SUPERADMIN', 'ADMIN'].includes(callerRoleRow.role)) {
      return NextResponse.json({ error: 'Forbidden: Admin privilege required.' }, { status: 403 })
    }

    const callerTenantId = callerRoleRow.tenant_id

    // 2. Verify Target User belongs to Caller Tenant
    const { data: targetRoleRow } = await serviceClient
      .from('user_roles')
      .select('tenant_id')
      .eq('user_id', targetUserId)
      .maybeSingle()

    if (!targetRoleRow || targetRoleRow.tenant_id !== callerTenantId) {
      return NextResponse.json(
        { error: 'Target user not found in your organization.' },
        { status: 403 }
      )
    }

    // 3. Terminate all active sessions for target user
    await SessionManager.revokeAllUserSessions(targetUserId, caller.id, callerTenantId)

    return NextResponse.json({
      success: true,
      message: 'All sessions for user have been terminated.',
      target_user_id: targetUserId,
    })
  } catch (err: any) {
    console.error('[Admin Revoke Sessions] Error:', err.message)
    return NextResponse.json({ error: 'Failed to revoke employee sessions.' }, { status: 500 })
  }
}
