import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server'
import { z } from 'zod'

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const recognitionSchema = z.object({
  receiver_id: z.string().regex(uuidRegex, 'Invalid receiver ID'),
  category_id: z.string().regex(uuidRegex, 'Invalid category ID'),
  note: z.string().trim().min(2, 'Praise note must be at least 2 characters').max(500, 'Praise note too long'),
})

// In-flight mutex for atomic race-condition duplicate protection (REC_TC_025)
const activeSubmissions = new Set<string>()

/**
 * Authoritatively resolves tenant context strictly server-side (Charter Rule 2 & 3).
 * Validates candidate tenant against live user_roles database records.
 * Multi-tenant Admins/Superadmins are validated against registered tenants.
 * Regular employees fail closed if requesting a tenant they do not belong to.
 */
async function resolveAuthoritativeTenantContext(
  req: NextRequest,
  user: any,
  serviceClient: any,
  overrideTenantId?: string | null
): Promise<{ tenantId: string; role: string } | null> {
  const headerTenant = req.headers.get('x-tenant-id')?.trim()
  const queryTenant = req.nextUrl?.searchParams?.get('tenant_id')?.trim()
  const candidate = (headerTenant || queryTenant || overrideTenantId || '').trim() || null

  const { data: roleRows, error: roleErr } = await serviceClient
    .from('user_roles')
    .select('role, tenant_id')
    .eq('user_id', user.id)

  if (roleErr || !roleRows || roleRows.length === 0) {
    return null
  }

  const isSuperOrAdmin = roleRows.some((r: any) => ['SUPERADMIN', 'ADMIN'].includes(r.role))
  const jwtTenantClaim = (user.app_metadata as Record<string, unknown> | undefined)?.tenant_id as string | undefined

  if (candidate) {
    const matched = roleRows.find((r: any) => r.tenant_id === candidate)
    if (matched) {
      return { tenantId: matched.tenant_id, role: matched.role }
    }
    if (isSuperOrAdmin) {
      const { data: tenantExists } = await serviceClient
        .from('tenants')
        .select('id')
        .eq('id', candidate)
        .maybeSingle()
      if (tenantExists) {
        const adminRole = roleRows.find((r: any) => ['SUPERADMIN', 'ADMIN'].includes(r.role))?.role || 'ADMIN'
        return { tenantId: candidate, role: adminRole }
      }
    }
    return null
  }

  if (jwtTenantClaim) {
    const matchedJwt = roleRows.find((r: any) => r.tenant_id === jwtTenantClaim)
    if (matchedJwt) {
      return { tenantId: matchedJwt.tenant_id, role: matchedJwt.role }
    }
    if (isSuperOrAdmin) {
      const { data: tenantExists } = await serviceClient
        .from('tenants')
        .select('id')
        .eq('id', jwtTenantClaim)
        .maybeSingle()
      if (tenantExists) {
        return { tenantId: jwtTenantClaim, role: 'ADMIN' }
      }
    }
  }

  const { data: profile } = await serviceClient
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.tenant_id) {
    const matchedProfile = roleRows.find((r: any) => r.tenant_id === profile.tenant_id)
    if (matchedProfile) {
      return { tenantId: matchedProfile.tenant_id, role: matchedProfile.role }
    }
    if (isSuperOrAdmin) {
      return { tenantId: profile.tenant_id, role: 'ADMIN' }
    }
  }

  return { tenantId: roleRows[0].tenant_id, role: roleRows[0].role }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient()
    let { data: { user }, error: authErr } = await supabase.auth.getUser()
    const serviceClient = getSupabaseServiceClient()

    if (!user || authErr) {
      const authHeader = req.headers.get('Authorization')
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7)
        const { data: userData } = await serviceClient.auth.getUser(token)
        if (userData?.user) {
          user = userData.user
          authErr = null
        }
      }
    }

    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Resolve tenant strictly server-side with authoritative membership validation
    const tenantCtx = await resolveAuthoritativeTenantContext(req, user, serviceClient)
    if (!tenantCtx) {
      return NextResponse.json({ error: 'No active tenant context found or access denied' }, { status: 403 })
    }
    const { tenantId } = tenantCtx

    // Parallel authoritative fetches
    const [catsRes, profsRes, empsRes, deptsRes, feedRes, myFeedRes, lbRes] = await Promise.all([
      serviceClient
        .from('recognition_categories')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('points', { ascending: true }),
      serviceClient
        .from('profiles')
        .select('id, full_name, email, avatar_url, is_active')
        .eq('tenant_id', tenantId)
        .neq('id', user.id)
        .eq('is_active', true),
      serviceClient
        .from('employees')
        .select('id, employee_code, department_id')
        .eq('tenant_id', tenantId),
      serviceClient
        .from('departments')
        .select('id, name')
        .eq('tenant_id', tenantId),
      serviceClient
        .from('recognition_events')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(100),
      serviceClient
        .from('recognition_events')
        .select('*')
        .eq('tenant_id', tenantId)
        .or(`receiver_id.eq.${user.id},giver_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(100),
      serviceClient
        .from('recognition_leaderboard')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('total_points', { ascending: false })
        .limit(10),
    ])

    // Merge events deduplicated by ID to guarantee personal history is complete (REC_TC_026)
    const mergedEventsMap = new Map<string, any>()
    for (const ev of (feedRes.data || [])) mergedEventsMap.set(ev.id, ev)
    for (const ev of (myFeedRes.data || [])) mergedEventsMap.set(ev.id, ev)
    const combinedEvents = Array.from(mergedEventsMap.values()).sort(
      (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

    // Build department and employee lookup maps
    const deptMap = new Map((deptsRes.data || []).map((d: any) => [d.id, d.name]))
    const empMap = new Map((empsRes.data || []).map((e: any) => [e.id, e]))

    // Format colleagues with department & employee code, strictly deduplicated by authoritative user ID (Phase 5)
    const uniqueColleaguesMap = new Map<string, any>()
    for (const p of (profsRes.data || [])) {
      if (!p.id || uniqueColleaguesMap.has(p.id)) continue
      const emp = empMap.get(p.id)

      let displayName = (p.full_name || '').trim()
      if (displayName && displayName === displayName.toLowerCase()) {
        displayName = displayName
          .split(/\s+/)
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ')
      }

      uniqueColleaguesMap.set(p.id, {
        id: p.id,
        tenant_id: tenantId,
        full_name: displayName || 'Colleague',
        email: p.email || '',
        avatar_url: p.avatar_url || null,
        employee_code: emp?.employee_code || ('EMP-' + p.id.slice(0, 5).toUpperCase()),
        department_name: emp?.department_id ? deptMap.get(emp.department_id) || 'General' : 'General',
      })
    }

    let colleagues = Array.from(uniqueColleaguesMap.values())

    // Server-side search filtering support
    const searchParam = req.nextUrl?.searchParams?.get('search') || req.nextUrl?.searchParams?.get('q')
    if (searchParam && searchParam.trim()) {
      const qTokens = searchParam.trim().toLowerCase().split(/\s+/).filter(Boolean)
      colleagues = colleagues.filter((c: any) => {
        const haystack = `${c.full_name || ''} ${c.email || ''} ${c.department_name || ''} ${c.employee_code || ''}`.toLowerCase()
        return qTokens.every((tok: string) => haystack.includes(tok))
      })
    }

    // Fetch all profiles in tenant for feed givers & receivers
    const { data: allTenantProfiles } = await serviceClient
      .from('profiles')
      .select('id, full_name, avatar_url')
      .eq('tenant_id', tenantId)

    const profileMap = new Map((allTenantProfiles || []).map((p: any) => [p.id, p]))
    const catMap = new Map((catsRes.data || []).map((c: any) => [c.id, c]))

    const feed = combinedEvents.map((ev: any) => ({
      ...ev,
      giver: profileMap.get(ev.giver_id) || { full_name: 'Colleague' },
      receiver: profileMap.get(ev.receiver_id) || { full_name: 'Team Member' },
      category: catMap.get(ev.category_id) || { name: 'Recognition', points: ev.points, icon: 'heart', color: '#EC4899' },
      is_received: ev.receiver_id === user.id,
      is_given: ev.giver_id === user.id,
    }))

    // Leaderboard: use materialized view rows if available; if empty or missing, aggregate live from events
    let leaderboard = lbRes.data || []
    if (leaderboard.length === 0 && feed.length > 0) {
      const pointsByReceiver = new Map<string, { total_points: number; count: number }>()
      feed.forEach((ev: any) => {
        const cur = pointsByReceiver.get(ev.receiver_id) || { total_points: 0, count: 0 }
        cur.total_points += (ev.points || 0)
        cur.count += 1
        pointsByReceiver.set(ev.receiver_id, cur)
      })

      leaderboard = Array.from(pointsByReceiver.entries())
        .map(([receiverId, stats]) => {
          const prof = profileMap.get(receiverId)
          return {
            tenant_id: tenantId,
            employee_id: receiverId,
            full_name: prof?.full_name || 'Team Member',
            avatar_url: prof?.avatar_url || null,
            total_points: stats.total_points,
            recognitions_received: stats.count,
            rank: 1,
          }
        })
        .sort((a: any, b: any) => b.total_points - a.total_points)
        .map((row: any, idx: number) => ({ ...row, rank: idx + 1 }))
    }

    const normalizedLeaderboard = leaderboard.map((row: any) => ({
      ...row,
      user_id: row.employee_id || row.user_id,
      employee_id: row.employee_id || row.user_id,
      recognitions_received: Number(row.recognitions_received ?? row.recognition_count ?? 0),
      recognition_count: Number(row.recognitions_received ?? row.recognition_count ?? 0),
      total_points: Number(row.total_points ?? 0),
    }))

    // Authoritative personal stats for the authenticated employee/user
    const myLb = normalizedLeaderboard.find((row: any) => row.user_id === user.id || row.employee_id === user.id)
    const myReceived = combinedEvents.filter((ev: any) => ev.receiver_id === user.id)
    const myGiven = combinedEvents.filter((ev: any) => ev.giver_id === user.id)
    const myPoints = myLb ? myLb.total_points : myReceived.reduce((sum: number, ev: any) => sum + (ev.points || 0), 0)

    const myStats = {
      user_id: user.id,
      total_points: myPoints,
      recognitions_received: myLb ? myLb.recognitions_received : myReceived.length,
      recognitions_given: myGiven.length,
      rank: myLb ? myLb.rank : (normalizedLeaderboard.length + 1),
    }

    return NextResponse.json({
      success: true,
      categories: catsRes.data || [],
      colleagues,
      feed,
      leaderboard: normalizedLeaderboard,
      myStats,
    })
  } catch (err: any) {
    console.error('[Recognition GET] error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient()
    let { data: { user }, error: authErr } = await supabase.auth.getUser()
    const serviceClient = getSupabaseServiceClient()

    if (!user || authErr) {
      const authHeader = req.headers.get('Authorization')
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7)
        const { data: userData } = await serviceClient.auth.getUser(token)
        if (userData?.user) {
          user = userData.user
          authErr = null
        }
      }
    }

    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    const parseResult = recognitionSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json({ error: parseResult.error.issues[0]?.message || 'Invalid input' }, { status: 400 })
    }

    const { receiver_id, category_id, note } = parseResult.data

    if (receiver_id === user.id) {
      return NextResponse.json({ error: 'You cannot give kudos to yourself' }, { status: 400 })
    }

    // Resolve tenant strictly server-side with authoritative membership validation (Charter Rule 2 & 3)
    const tenantCtx = await resolveAuthoritativeTenantContext(req, user, serviceClient, body?.tenant_id)
    if (!tenantCtx) {
      return NextResponse.json({ error: 'No active tenant context found or access denied' }, { status: 403 })
    }
    const { tenantId } = tenantCtx

    // Verify receiver belongs to the same tenant and is active (Fail-closed Rule 3)
    const { data: receiverProfile } = await serviceClient
      .from('profiles')
      .select('id, full_name, email, tenant_id, is_active')
      .eq('id', receiver_id)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .maybeSingle()

    if (!receiverProfile) {
      return NextResponse.json({ error: 'Selected colleague not found in your organization' }, { status: 404 })
    }

    // Fetch giver profile
    const { data: giverProfile } = await serviceClient
      .from('profiles')
      .select('id, full_name')
      .eq('id', user.id)
      .maybeSingle()

    const giverName = giverProfile?.full_name || 'A teammate'

    // Fetch category
    const { data: category } = await serviceClient
      .from('recognition_categories')
      .select('*')
      .eq('id', category_id)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .maybeSingle()

    if (!category) {
      return NextResponse.json({ error: 'Invalid category or badge selected' }, { status: 400 })
    }

    const points = category.points || 50

    // Enforce REC_TC_025: Duplicate recognition prevention
    // Same sender + recipient + category + day must be rejected server-side
    const startOfDay = new Date()
    startOfDay.setUTCHours(0, 0, 0, 0)
    const startOfDayIso = startOfDay.toISOString()

    const flightKey = `${tenantId}:${user.id}:${receiver_id}:${category_id}:${startOfDayIso.slice(0, 10)}`
    if (activeSubmissions.has(flightKey)) {
      return NextResponse.json(
        { error: 'Duplicate recognition: A recognition for this colleague and category is already being processed.' },
        { status: 409 }
      )
    }

    const { data: existingDuplicate } = await serviceClient
      .from('recognition_events')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('giver_id', user.id)
      .eq('receiver_id', receiver_id)
      .eq('category_id', category_id)
      .gte('created_at', startOfDayIso)
      .limit(1)
      .maybeSingle()

    if (existingDuplicate) {
      return NextResponse.json(
        { error: 'Duplicate recognition: You have already recognized this colleague for this category today.' },
        { status: 409 }
      )
    }

    activeSubmissions.add(flightKey)

    try {
      // 1. Insert recognition event
      const { data: eventRow, error: evErr } = await serviceClient
        .from('recognition_events')
        .insert({
          tenant_id: tenantId,
          giver_id: user.id,
          receiver_id: receiver_id,
          category_id: category_id,
          points: points,
          note: note.trim(),
          is_public: true,
        })
        .select()
        .single()

      if (evErr) {
        console.error('[Recognition POST] Insert event error:', evErr)
        return NextResponse.json({ error: 'Failed to record recognition: ' + evErr.message }, { status: 500 })
      }

      // 2. Dispatch notification to the recipient (User requirement: sent to the person)
      try {
        const { error: notifErr } = await serviceClient.from('notifications').insert({
          tenant_id: tenantId,
          user_id: receiver_id,
          type: 'RECOGNITION_RECEIVED',
          title: `Kudos from ${giverName}! 🎉`,
          body: `"${note.trim()}" (+${points} pts for ${category.name})`,
          deep_link: '/recognition',
          data: {
            event_id: eventRow.id,
            giver_id: user.id,
            giver_name: giverName,
            category_id: category.id,
            category_name: category.name,
            points: points,
          },
          is_read: false,
        })
        if (notifErr) {
          console.error('[Recognition POST] Notification dispatch DB error:', notifErr)
        }
      } catch (notifErr) {
        console.warn('[Recognition POST] Notification dispatch non-blocking error:', notifErr)
      }

      // 3. Refresh materialized view concurrently
      try {
        await serviceClient.rpc('refresh_leaderboard')
      } catch {
        // Non-blocking if rpc is not exposed or trigger already ran
      }

      // 4. Record audit log
      try {
        await serviceClient.from('audit_log').insert({
          tenant_id: tenantId,
          actor_id: user.id,
          action: 'KUDOS_GIVEN',
          table_name: 'recognition_events',
          record_id: eventRow.id,
          new_data: { receiver_id, category_id, points, note: note.trim() },
        })
      } catch (auditErr) {
        console.warn('[Recognition POST] Audit log non-blocking error:', auditErr)
      }

      return NextResponse.json({
        success: true,
        event: eventRow,
        message: `Kudos sent to ${receiverProfile.full_name}! 🎉`,
      }, { status: 201 })
    } finally {
      activeSubmissions.delete(flightKey)
    }
  } catch (err: any) {
    console.error('[Recognition POST] error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
