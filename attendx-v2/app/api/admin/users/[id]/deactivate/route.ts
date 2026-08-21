// ============================================================
// AttendX v2 — Admin User Deactivation API Route
// POST /api/admin/users/[id]/deactivate
// Executes deactivate_user_atomic RPC and invalidates GoTrue sessions
// ============================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server'

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

    const body = await req.json().catch(() => ({}))
    const reason = body?.reason || 'Administrative Deactivation'

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

    // 2. Call Atomic Deactivation Stored Procedure
    const { data: rpcResult, error: rpcError } = await serviceClient.rpc(
      'deactivate_user_atomic',
      {
        p_target_user_id: targetUserId,
        p_actor_id: caller.id,
        p_tenant_id: callerTenantId,
        p_reason: reason,
      }
    )

    if (rpcError) {
      console.error('[Admin Deactivate] RPC Error:', rpcError.message)
      const isForbidden = rpcError.code === '42501' || rpcError.message.includes('Forbidden')
      const isBlocked = rpcError.code === '23514' || rpcError.message.includes('sole active administrator')
      const status = isForbidden ? 403 : isBlocked ? 400 : 500
      return NextResponse.json({ error: rpcError.message }, { status })
    }

    // 3. Invalidate GoTrue sessions globally for target user
    try {
      await (serviceClient.auth.admin as any).signOut(targetUserId, 'global')
    } catch (err: any) {
      console.warn('[Admin Deactivate] GoTrue sign-out notice:', err.message)
    }

    return NextResponse.json({
      success: true,
      message: 'User deactivated successfully. All active sessions terminated.',
      target_user_id: targetUserId,
      details: rpcResult,
    })
  } catch (err: any) {
    console.error('[Admin Deactivate] Error:', err.message)
    return NextResponse.json({ error: 'Failed to deactivate user.' }, { status: 500 })
  }
}
