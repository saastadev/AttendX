// ============================================================
// AttendX v2 — Revoke Other Sessions API Route
// POST /api/sessions/revoke-others
// Revokes all active devices except the calling session
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

    const serviceClient = getSupabaseServiceClient()
    const activeTenantId = (user.app_metadata as Record<string, unknown> | undefined)?.tenant_id as string
    const clientUa = req.headers.get('user-agent') || ''

    // Fetch user's active sessions
    const { data: sessions } = await serviceClient
      .from('active_sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_revoked', false)

    if (!sessions || sessions.length <= 1) {
      return NextResponse.json({
        success: true,
        message: 'No other active sessions found.',
        revokedCount: 0,
      })
    }

    // Find current session by UA match, else keep the most recently active one
    let currentSessionId = sessions[0].id
    const matchingSession = sessions.find(s => s.user_agent === clientUa)
    if (matchingSession) {
      currentSessionId = matchingSession.id
    }

    const otherSessions = sessions.filter(s => s.id !== currentSessionId)

    // Revoke other sessions in GoTrue
    for (const sess of otherSessions) {
      if (sess.auth_session_id) {
        try {
          await (serviceClient.auth.admin as any).deleteUserSession(sess.auth_session_id)
        } catch {
          // Continue
        }
      }
    }

    // Revoke other sessions in DB
    const otherIds = otherSessions.map(s => s.id)
    await serviceClient
      .from('active_sessions')
      .update({
        is_revoked: true,
        revoked_at: new Date().toISOString(),
      })
      .in('id', otherIds)

    // Audit log
    await serviceClient.from('audit_log').insert({
      tenant_id: activeTenantId || sessions[0].tenant_id,
      actor_id: user.id,
      action: 'SESSIONS_REVOKED_OTHERS',
      table_name: 'active_sessions',
      record_id: user.id,
      new_data: { revoked_count: otherSessions.length },
    })

    return NextResponse.json({
      success: true,
      message: 'All other sessions have been revoked.',
      revokedCount: otherSessions.length,
    })
  } catch (err: any) {
    console.error('[POST /api/sessions/revoke-others] Error:', err.message)
    return NextResponse.json({ error: 'Failed to revoke other sessions.' }, { status: 500 })
  }
}
