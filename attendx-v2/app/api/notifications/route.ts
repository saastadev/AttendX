import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { requireSupabaseConfig } from '@/lib/env'

async function resolveUser(request: NextRequest) {
  const { url: supabaseUrl, anonKey: supabaseAnonKey } = requireSupabaseConfig()
  const admin = getSupabaseServiceClient()

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() { return request.cookies.getAll() },
      setAll() {},
    },
  })

  let { data: { user }, error: authError } = await supabase.auth.getUser()

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

  return { user, admin }
}

export async function GET(request: NextRequest) {
  try {
    const { user, admin } = await resolveUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const filter = searchParams.get('filter') // 'all' | 'unread'

    // Self-healing: Check if user has received recognition_events without a notification
    try {
      const { data: recEvents } = await admin
        .from('recognition_events')
        .select('id, tenant_id, giver_id, points, note, category_id, created_at')
        .eq('receiver_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)

      if (recEvents && recEvents.length > 0) {
        const { data: existingNotifs } = await admin
          .from('notifications')
          .select('data')
          .eq('user_id', user.id)
          .eq('type', 'RECOGNITION_RECEIVED')

        const existingEventIds = new Set(
          (existingNotifs || [])
            .map((n: any) => n.data?.event_id)
            .filter(Boolean)
        )

        const missingEvents = recEvents.filter((ev: any) => !existingEventIds.has(ev.id))

        if (missingEvents.length > 0) {
          const giverIds = Array.from(new Set(missingEvents.map((e: any) => e.giver_id)))
          const catIds = Array.from(new Set(missingEvents.map((e: any) => e.category_id)))

          const [gRes, cRes] = await Promise.all([
            admin.from('profiles').select('id, full_name').in('id', giverIds),
            admin.from('recognition_categories').select('id, name').in('id', catIds),
          ])

          const gMap = new Map((gRes.data || []).map((g: any) => [g.id, g.full_name]))
          const cMap = new Map((cRes.data || []).map((c: any) => [c.id, c.name]))

          const notifsToInsert = missingEvents.map((ev: any) => {
            const gName = gMap.get(ev.giver_id) || 'A teammate'
            const cName = cMap.get(ev.category_id) || 'Recognition'
            return {
              tenant_id: ev.tenant_id,
              user_id: user.id,
              type: 'RECOGNITION_RECEIVED',
              title: `Kudos from ${gName}! 🎉`,
              body: `"${(ev.note || '').trim()}" (+${ev.points} pts for ${cName})`,
              deep_link: '/recognition',
              data: {
                event_id: ev.id,
                giver_id: ev.giver_id,
                giver_name: gName,
                category_id: ev.category_id,
                category_name: cName,
                points: ev.points,
              },
              is_read: false,
              created_at: ev.created_at,
            }
          })

          await admin.from('notifications').insert(notifsToInsert)
        }
      }
    } catch (backfillErr) {
      console.warn('[Notifications GET] Self-healing sync notice:', backfillErr)
    }

    let query = admin
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (filter === 'unread') {
      query = query.eq('is_read', false)
    }

    const { data: notifications, error } = await query

    if (error) {
      console.error('[Notifications GET] Error fetching notifications:', error)
      return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
    }

    return NextResponse.json({ notifications: notifications ?? [] })
  } catch (err: any) {
    console.error('[Notifications GET] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user, admin } = await resolveUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { id, markAllRead } = body

    if (markAllRead) {
      const { error } = await admin
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('is_read', false)

      if (error) {
        return NextResponse.json({ error: 'Failed to mark notifications read' }, { status: 500 })
      }
      return NextResponse.json({ success: true })
    }

    if (id) {
      const { error } = await admin
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', user.id)

      if (error) {
        return NextResponse.json({ error: 'Failed to mark notification read' }, { status: 500 })
      }
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  } catch (err: any) {
    console.error('[Notifications PATCH] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
