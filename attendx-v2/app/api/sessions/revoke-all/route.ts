// ============================================================
// AttendX v2 — Revoke All Sessions API Route
// POST /api/sessions/revoke-all
// Terminates all sessions globally across all devices
// ============================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server'
import { SessionManager } from '@/lib/auth/session-manager'

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()

    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tenantId = (user.app_metadata as Record<string, unknown> | undefined)?.tenant_id as string
    await SessionManager.revokeAllUserSessions(user.id, user.id, tenantId)

    return NextResponse.json({
      success: true,
      message: 'All sessions have been revoked. Please log in again.',
    })
  } catch (err: any) {
    console.error('[POST /api/sessions/revoke-all] Error:', err.message)
    return NextResponse.json({ error: 'Failed to revoke all sessions.' }, { status: 500 })
  }
}
