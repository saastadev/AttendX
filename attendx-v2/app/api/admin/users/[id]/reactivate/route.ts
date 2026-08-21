// ============================================================
// AttendX v2 — Admin User Reactivation API Route
// POST /api/admin/users/[id]/reactivate
// Executes reactivate_user_atomic RPC with seat limit enforcement
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

    // 2. Call Atomic Reactivation Stored Procedure (with Seat Limit Enforcement)
    const { data: rpcResult, error: rpcError } = await serviceClient.rpc(
      'reactivate_user_atomic',
      {
        p_target_user_id: targetUserId,
        p_actor_id: caller.id,
        p_tenant_id: callerTenantId,
      }
    )

    if (rpcError) {
      console.error('[Admin Reactivate] RPC Error:', rpcError.message)
      const isForbidden = rpcError.code === '42501' || rpcError.message.includes('Forbidden')
      const isSeatLimit = rpcError.code === 'EX001' || rpcError.message.includes('Seat Limit Exceeded')
      const status = isForbidden ? 403 : isSeatLimit ? 409 : 500
      return NextResponse.json(
        { error: rpcError.message, code: isSeatLimit ? 'SEAT_LIMIT_EXCEEDED' : undefined },
        { status }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'User reactivated successfully.',
      target_user_id: targetUserId,
      details: rpcResult,
    })
  } catch (err: any) {
    console.error('[Admin Reactivate] Error:', err.message)
    return NextResponse.json({ error: 'Failed to reactivate user.' }, { status: 500 })
  }
}
