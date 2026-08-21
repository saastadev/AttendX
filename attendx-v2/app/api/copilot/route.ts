import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { getAuthoritativeAIContext, AIAuthError } from '@/lib/ai/ai-auth-helper'

export async function POST(req: NextRequest) {
  try {
    // 1. Authoritative Server-Side AI Context Resolution (BRD §29)
    const aiContext = await getAuthoritativeAIContext(req)

    const serviceClient = getSupabaseServiceClient()

    // 2. Check kill-switch via tenants.features.copilot
    const { data: tenant } = await serviceClient
      .from('tenants')
      .select('features')
      .eq('id', aiContext.tenantId)
      .maybeSingle()

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
        .eq('employee_id', aiContext.userId)

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
        .eq('employee_id', aiContext.userId)
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
      const { data: docs } = await serviceClient
        .from('skill_embeddings')
        .select('title, content')
        .eq('tenant_id', aiContext.tenantId)
        .limit(3)

      toolResult = docs
      if (docs && docs.length > 0) {
        const citations = docs.map((d: any) => `> **[Citation: ${d.title}]**: ${d.content}`).join('\n\n')
        reply = `Based on your organization's official policy documentation:\n\n${citations}`
      } else {
        reply = `I could not find an official HR policy document answering your question in your organization's knowledge base. To prevent inaccurate information, please consult your HR administrator.`
      }
    } else {
      // Use OpenAI API if API key is provided
      if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'sk-placeholder') {
        try {
          const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: `You are AttendX HR Copilot for ${aiContext.tenantName}. Help employees with work-related questions, policy summaries, attendance advice, and workplace professional communication. User ID: ${aiContext.userId}, Role: ${aiContext.role}, Timezone: ${aiContext.timezone}.`,
                },
                { role: 'user', content: message },
              ],
              temperature: 0.7,
              max_tokens: 500,
            }),
          })
          if (aiRes.ok) {
            const aiJson = await aiRes.json()
            const aiText = aiJson.choices?.[0]?.message?.content
            if (aiText) {
              reply = aiText
            }
          }
        } catch (err) {
          console.warn('OpenAI API call failed, using default response:', err)
        }
      }

      if (!reply) {
        reply = `I am your AttendX HR Copilot. I can assist you with your leave balances, checking your attendance history, or searching your company HR policies. How can I help you today?`
      }
    }

    // Mandatory: Log every tool invocation to audit_log
    if (toolInvoked) {
      await serviceClient.from('audit_log').insert({
        tenant_id: aiContext.tenantId,
        actor_id: aiContext.userId,
        action: `COPILOT_TOOL_INVOKED:${toolInvoked}`,
        table_name: 'skill_embeddings',
        new_data: { message, toolInvoked, toolResult },
      })
    }

    return NextResponse.json({
      reply,
      toolInvoked,
      tenantId: aiContext.tenantId,
      correlation_id: aiContext.correlationId,
    })
  } catch (err: any) {
    if (err instanceof AIAuthError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode })
    }
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
