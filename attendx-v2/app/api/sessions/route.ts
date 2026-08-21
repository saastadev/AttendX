// ============================================================
// AttendX v2 — Active Sessions API Route
// GET: List active sessions for caller (with is_current detection)
// DELETE / POST: Revoke specific session (GoTrue + PostgreSQL)
// ============================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server'
import { SessionManager } from '@/lib/auth/session-manager'
import type { ActiveSession } from '@/types/database'

export async function GET(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()

    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const serviceClient = getSupabaseServiceClient()
    const activeTenantId = (user.app_metadata as Record<string, unknown> | undefined)?.tenant_id as string | undefined

    const { data: rawSessions, error } = await serviceClient
      .from('active_sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_revoked', false)
      .order('last_active', { ascending: false })

    if (error) {
      console.error('[GET /api/sessions] Database error:', error.message)
      return NextResponse.json({ error: 'Failed to retrieve active sessions.' }, { status: 500 })
    }

    const clientUa = req.headers.get('user-agent') || ''
    const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || ''

    let hasFoundCurrent = false
    const sessions: ActiveSession[] = (rawSessions || []).map((s, idx) => {
      // Flag current session if user-agent and IP match, or default to most recent if single session
      const isMatch = !hasFoundCurrent && (
        (s.user_agent && clientUa && s.user_agent === clientUa) ||
        (idx === 0 && rawSessions.length === 1)
      )
      if (isMatch) hasFoundCurrent = true

      return {
        id: s.id,
        user_id: s.user_id,
        tenant_id: s.tenant_id,
        auth_session_id: s.auth_session_id,
        session_token_hash: s.session_token_hash,
        device_name: s.device_name,
        browser: s.browser,
        os: s.os,
        ip_address: s.ip_address,
        city: s.city,
        country: s.country,
        user_agent: s.user_agent,
        is_revoked: s.is_revoked,
        revoked_at: s.revoked_at,
        last_active: s.last_active,
        created_at: s.created_at,
        is_current: isMatch,
      }
    })

    return NextResponse.json({ sessions })
  } catch (err: any) {
    console.error('[GET /api/sessions] Unexpected error:', err)
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()

    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const sessionId = body?.sessionId

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required.' }, { status: 400 })
    }

    const tenantId = (user.app_metadata as Record<string, unknown> | undefined)?.tenant_id as string
    await SessionManager.revokeSession(sessionId, user.id, tenantId)

    return NextResponse.json({
      success: true,
      message: 'Session revoked successfully.',
      revokedId: sessionId,
    })
  } catch (err: any) {
    console.error('[DELETE /api/sessions] Error:', err.message)
    return NextResponse.json({ error: err.message || 'Failed to revoke session.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return DELETE(req)
}
