// ============================================================
// AttendX v2 — Session Manager Helper
// Synchronizes active_sessions database tracking with
// Supabase Auth (GoTrue) server-side session invalidation.
// ============================================================

import crypto from 'crypto'
import { getSupabaseServiceClient } from '@/lib/supabase/server'

export interface ParsedSessionDevice {
  deviceName: string
  browser: string
  os: string
  ip: string
  userAgent: string
}

export class SessionManager {
  /**
   * Hashes raw access token or session token for O(1) secure database lookup
   */
  static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex')
  }

  /**
   * Parses user-agent header into human-readable device, browser, and OS metadata
   */
  static parseUserAgent(uaString: string = '', ip: string = ''): ParsedSessionDevice {
    const ua = uaString.toLowerCase()

    // Determine OS
    let os = 'Unknown OS'
    if (ua.includes('macintosh') || ua.includes('mac os x')) os = 'macOS'
    else if (ua.includes('windows')) os = 'Windows'
    else if (ua.includes('android')) os = 'Android'
    else if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')) os = 'iOS'
    else if (ua.includes('linux')) os = 'Linux'

    // Determine Browser
    let browser = 'Unknown Browser'
    if (ua.includes('edg/')) browser = 'Microsoft Edge'
    else if (ua.includes('chrome/') && !ua.includes('edg/')) browser = 'Google Chrome'
    else if (ua.includes('safari/') && !ua.includes('chrome/')) browser = 'Safari'
    else if (ua.includes('firefox/')) browser = 'Mozilla Firefox'
    else if (ua.includes('opera/') || ua.includes('opr/')) browser = 'Opera'

    // Determine Device Name
    let deviceName = 'Desktop Device'
    if (ua.includes('iphone')) deviceName = 'Apple iPhone'
    else if (ua.includes('ipad')) deviceName = 'Apple iPad'
    else if (ua.includes('macintosh')) deviceName = 'Apple Mac'
    else if (ua.includes('android')) deviceName = 'Android Device'
    else if (ua.includes('windows')) deviceName = 'Windows PC'
    else if (ua.includes('mobile')) deviceName = 'Mobile Browser'

    return {
      deviceName,
      browser,
      os,
      ip: ip || 'Unknown IP',
      userAgent: uaString,
    }
  }

  /**
   * Registers an active authenticated session
   */
  static async registerSession(params: {
    userId: string
    tenantId: string
    authSessionId?: string | null
    sessionToken: string
    uaString?: string
    ip?: string
    city?: string
    country?: string
  }) {
    const serviceClient = getSupabaseServiceClient()
    const meta = this.parseUserAgent(params.uaString, params.ip)
    const tokenHash = this.hashToken(params.sessionToken)

    const { error } = await serviceClient.from('active_sessions').insert({
      user_id: params.userId,
      tenant_id: params.tenantId,
      auth_session_id: params.authSessionId || null,
      session_token_hash: tokenHash,
      device_name: meta.deviceName,
      browser: meta.browser,
      os: meta.os,
      ip_address: meta.ip,
      city: params.city || null,
      country: params.country || null,
      user_agent: meta.userAgent,
      is_revoked: false,
      last_active: new Date().toISOString(),
    })

    if (error) {
      console.error('[SessionManager.registerSession] Error recording session:', error.message)
    }
  }

  /**
   * Validates if a session token is active and not revoked
   */
  static async isSessionValid(sessionToken: string): Promise<boolean> {
    if (!sessionToken) return false
    const tokenHash = this.hashToken(sessionToken)
    const serviceClient = getSupabaseServiceClient()

    const { data, error } = await serviceClient
      .from('active_sessions')
      .select('id, is_revoked')
      .eq('session_token_hash', tokenHash)
      .maybeSingle()

    if (error || !data || data.is_revoked) {
      return false
    }
    return true
  }

  /**
   * Revokes a specific session by its database ID
   */
  static async revokeSession(sessionId: string, actorId: string, tenantId: string) {
    const serviceClient = getSupabaseServiceClient()

    const { data: session, error } = await serviceClient
      .from('active_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (error || !session) {
      throw new Error('Session not found in your organization.')
    }

    // 1. Invalidate in Supabase Auth (GoTrue) if auth_session_id is present
    if (session.auth_session_id) {
      try {
        await (serviceClient.auth.admin as any).deleteUserSession(session.auth_session_id)
      } catch (err: any) {
        console.warn('[SessionManager.revokeSession] GoTrue session delete notice:', err.message)
      }
    }

    // 2. Mark as revoked in active_sessions
    await serviceClient
      .from('active_sessions')
      .update({
        is_revoked: true,
        revoked_at: new Date().toISOString(),
      })
      .eq('id', sessionId)

    // 3. Write immutable audit entry
    await serviceClient.from('audit_log').insert({
      tenant_id: tenantId,
      actor_id: actorId,
      action: 'SESSION_REVOKED',
      table_name: 'active_sessions',
      record_id: sessionId,
      new_data: {
        target_user_id: session.user_id,
        device_name: session.device_name,
        revoked_at: new Date().toISOString(),
      },
    })
  }

  /**
   * Revokes all sessions belonging to user EXCEPT the current session
   * Triggered on "Revoke Other Sessions" or "Password Change"
   */
  static async revokeAllExceptCurrent(userId: string, currentSessionToken: string, tenantId: string) {
    const serviceClient = getSupabaseServiceClient()
    const currentHash = this.hashToken(currentSessionToken)

    const { data: otherSessions } = await serviceClient
      .from('active_sessions')
      .select('id, auth_session_id')
      .eq('user_id', userId)
      .neq('session_token_hash', currentHash)
      .eq('is_revoked', false)

    if (!otherSessions || otherSessions.length === 0) return

    // Invalidate each in GoTrue
    for (const sess of otherSessions) {
      if (sess.auth_session_id) {
        try {
          await (serviceClient.auth.admin as any).deleteUserSession(sess.auth_session_id)
        } catch {
          // Continue invalidating remaining sessions
        }
      }
    }

    // Mark as revoked in DB
    await serviceClient
      .from('active_sessions')
      .update({
        is_revoked: true,
        revoked_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .neq('session_token_hash', currentHash)

    // Audit log
    await serviceClient.from('audit_log').insert({
      tenant_id: tenantId,
      actor_id: userId,
      action: 'SESSIONS_REVOKED_OTHERS',
      table_name: 'active_sessions',
      record_id: userId,
      new_data: { revoked_count: otherSessions.length },
    })
  }

  /**
   * Revokes ALL sessions for a user (Triggered by Admin deactivation or global logout)
   */
  static async revokeAllUserSessions(userId: string, actorId: string, tenantId: string) {
    const serviceClient = getSupabaseServiceClient()

    // 1. Global signout in GoTrue
    try {
      await serviceClient.auth.admin.signOut(userId, 'global')
    } catch (err: any) {
      console.warn('[SessionManager.revokeAllUserSessions] GoTrue global signOut notice:', err.message)
    }

    // 2. Mark all as revoked in DB
    await serviceClient
      .from('active_sessions')
      .update({
        is_revoked: true,
        revoked_at: new Date().toISOString(),
      })
      .eq('user_id', userId)

    // 3. Audit log
    await serviceClient.from('audit_log').insert({
      tenant_id: tenantId,
      actor_id: actorId,
      action: 'SESSIONS_REVOKED_ALL',
      table_name: 'active_sessions',
      record_id: userId,
      new_data: { target_user_id: userId, revoked_at: new Date().toISOString() },
    })
  }
}
