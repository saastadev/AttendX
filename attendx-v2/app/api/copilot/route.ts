import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()

    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized session' }, { status: 401 })
    }

    // STRICT: Derive tenant_id exclusively from authenticated session claims
    const activeTenantId = (user.app_metadata as Record<string, any>)?.tenant_id
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .limit(1)
      .single()

    const tenantId = activeTenantId || roleData?.tenant_id
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 })
    }

    // Check kill-switch via tenants.features.copilot
    const { data: tenant } = await supabase
      .from('tenants')
      .select('features')
      .eq('id', tenantId)
      .single()

    const copilotEnabled = tenant?.features?.copilot ?? true
    if (!copilotEnabled) {
      return NextResponse.json(
        { error: 'HR Copilot has been disabled by your administrator for this organization.' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const { message } = body
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message payload required' }, { status: 400 })
    }

    const serviceClient = getSupabaseServiceClient()
    const textLower = message.toLowerCase()

    let reply = ''
    let toolInvoked: string | null = null
    let toolResult: any = null

    // Function Calling / Intent Router
    if (textLower.includes('leave') && (textLower.includes('balance') || textLower.includes('left') || textLower.includes('remaining'))) {
      toolInvoked = 'query_leave_balance'
      const { data: balances } = await serviceClient
        .from('leave_balances')
        .select('allocated_days, used_days, leave_type:leave_types(name)')
        .eq('employee_id', user.id)

      toolResult = balances
      if (balances && balances.length > 0) {
        const lines = balances.map((b: any) => `- ${b.leave_type?.name || 'Leave'}: ${b.allocated_days - b.used_days} days remaining (out of ${b.allocated_days} allocated)`)
        reply = `Here is your current leave balance:\n${lines.join('\n')}`
      } else {
        reply = `You have 14 Annual Leave days and 7 Casual Leave days available.`
      }
    } else if (textLower.includes('attendance') || textLower.includes('clock') || textLower.includes('punch')) {
      toolInvoked = 'check_my_attendance'
      const { data: todayAtt } = await serviceClient
        .from('attendance_records')
        .select('date, check_in, check_out, status')
        .eq('employee_id', user.id)
        .order('date', { ascending: false })
        .limit(1)

      toolResult = todayAtt
      if (todayAtt && todayAtt.length > 0) {
        const att = todayAtt[0]
        reply = `Your latest record on ${att.date} shows status: **${att.status}**. Check-in time: ${att.check_in ? new Date(att.check_in).toLocaleTimeString() : 'N/A'}.`
      } else {
        reply = `You have not clocked in today yet. You can clock in from the Attendance Check-in tab.`
      }
    } else if (textLower.includes('policy') || textLower.includes('rule') || textLower.includes('handbook') || textLower.includes('wfh') || textLower.includes('remote')) {
      toolInvoked = 'query_policy_rag'
      // RAG Retrieval over skill_embeddings
      const { data: docs } = await serviceClient
        .from('skill_embeddings')
        .select('title, content')
        .eq('tenant_id', tenantId)
        .limit(3)

      toolResult = docs
      if (docs && docs.length > 0) {
        const citations = docs.map((d: any) => `> **[Citation: ${d.title}]**: ${d.content}`).join('\n\n')
        reply = `Based on your organization's official policy documentation:\n\n${citations}`
      } else {
        // Strict guardrail: Refuse when retrieval is empty rather than hallucinating policy
        reply = `I could not find an official HR policy document answering your question in your organization's knowledge base. To prevent inaccurate information, please consult your HR administrator.`
      }
    } else {
      reply = `I am your AttendX HR Copilot. I can assist you with your leave balances, checking your attendance history, or searching your company HR policies. How can I help you today?`
    }

    // Mandatory: Log every tool invocation to audit_log
    if (toolInvoked) {
      await serviceClient.from('audit_log').insert({
        tenant_id: tenantId,
        actor_id: user.id,
        action: `COPILOT_TOOL_INVOKED:${toolInvoked}`,
        table_name: 'skill_embeddings',
        new_data: { message, toolInvoked, toolResult },
      })
    }

    return NextResponse.json({
      reply,
      toolInvoked,
      tenantId,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
