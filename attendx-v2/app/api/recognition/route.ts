import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server'
import { z } from 'zod'

const recognitionSchema = z.object({
  receiver_id: z.string().uuid('Invalid receiver ID'),
  category_id: z.string().uuid('Invalid category ID'),
  note: z.string().trim().min(2, 'Praise note must be at least 2 characters').max(500, 'Praise note too long'),
})

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

    // Resolve tenant strictly server-side (Charter Rule 2)
    const activeTenantClaim = (user.app_metadata as Record<string, unknown> | undefined)?.tenant_id as string | undefined
    const { data: roleRows } = await serviceClient
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)

    const roleRow = (roleRows || []).find((r: any) => activeTenantClaim ? r.tenant_id === activeTenantClaim : true) || roleRows?.[0]
    const tenantId = roleRow?.tenant_id || activeTenantClaim

    if (!tenantId) {
      return NextResponse.json({ error: 'No active tenant context found' }, { status: 403 })
    }

    // Parallel authoritative fetches
    const [catsRes, profsRes, empsRes, deptsRes, feedRes, lbRes] = await Promise.all([
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
        .from('recognition_leaderboard')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('total_points', { ascending: false })
        .limit(10),
    ])

    // Build department and employee lookup maps
    const deptMap = new Map((deptsRes.data || []).map((d: any) => [d.id, d.name]))
    const empMap = new Map((empsRes.data || []).map((e: any) => [e.id, e]))

    // Format colleagues with department & employee code
    const colleagues = (profsRes.data || []).map((p: any) => {
      const emp = empMap.get(p.id)
      return {
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        avatar_url: p.avatar_url,
        employee_code: emp?.employee_code || ('EMP-' + p.id.slice(0, 5).toUpperCase()),
        department_name: emp?.department_id ? deptMap.get(emp.department_id) || 'General' : 'General',
      }
    })

    // Fetch all profiles in tenant for feed givers & receivers
    const { data: allTenantProfiles } = await serviceClient
      .from('profiles')
      .select('id, full_name, avatar_url')
      .eq('tenant_id', tenantId)

    const profileMap = new Map((allTenantProfiles || []).map((p: any) => [p.id, p]))
    const catMap = new Map((catsRes.data || []).map((c: any) => [c.id, c]))

    const feed = (feedRes.data || []).map((ev: any) => ({
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
    const myReceived = (feedRes.data || []).filter((ev: any) => ev.receiver_id === user.id)
    const myGiven = (feedRes.data || []).filter((ev: any) => ev.giver_id === user.id)
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

    // Resolve tenant strictly server-side
    const activeTenantClaim = (user.app_metadata as Record<string, unknown> | undefined)?.tenant_id as string | undefined
    const { data: roleRows } = await serviceClient
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)

    const roleRow = (roleRows || []).find((r: any) => activeTenantClaim ? r.tenant_id === activeTenantClaim : true) || roleRows?.[0]
    const tenantId = roleRow?.tenant_id || activeTenantClaim

    if (!tenantId) {
      return NextResponse.json({ error: 'No active tenant context found' }, { status: 403 })
    }

    // Verify receiver belongs to the same tenant (Fail-closed Rule 3)
    const { data: receiverProfile } = await serviceClient
      .from('profiles')
      .select('id, full_name, email, tenant_id')
      .eq('id', receiver_id)
      .eq('tenant_id', tenantId)
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
      .maybeSingle()

    if (!category) {
      return NextResponse.json({ error: 'Invalid category or badge selected' }, { status: 400 })
    }

    const points = category.points || 50

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
  } catch (err: any) {
    console.error('[Recognition POST] error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
