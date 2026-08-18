import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()

    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: sessions, error } = await supabase
      .from('active_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('last_active', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ sessions: sessions || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()

    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { sessionId } = await req.json()
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('active_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Audit log revocation
    await supabase.from('audit_log').insert({
      tenant_id: (user.app_metadata as Record<string, any>)?.tenant_id,
      actor_id: user.id,
      action: 'SESSION_REVOKED',
      table_name: 'active_sessions',
      record_id: sessionId,
    })

    return NextResponse.json({ success: true, revokedId: sessionId })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
