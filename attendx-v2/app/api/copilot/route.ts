import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { getAuthoritativeAIContext, AIAuthError } from '@/lib/ai/ai-auth-helper'
import { copilotConfigured, copilotModel, runCopilot } from '@/lib/copilot/agent'
import { allowCopilotRequest } from '@/lib/copilot/rate-limit'
import {
  detectPromptInjection,
  detectScopeViolation,
  detectConfidentialAccessAttempt,
} from '@/lib/copilot/copilot-guardrails'

export async function POST(req: NextRequest) {
  try {
    // 1. Authoritative Server-Side AI Context Resolution (Rule 2)
    const aiContext = await getAuthoritativeAIContext(req)

    const serviceClient = getSupabaseServiceClient()

    // 2. Check kill-switch via tenants.features.copilot
    const { data: tenant, error: tenantErr } = await serviceClient
      .from('tenants')
      .select('features')
      .eq('id', aiContext.tenantId)
      .maybeSingle()

    if (tenantErr) {
      return NextResponse.json(
        { reply: 'Unable to retrieve tenant settings from the database at this time.', error: tenantErr.message },
        { status: 500 }
      )
    }

    const copilotEnabled = tenant?.features?.copilot ?? true
    if (!copilotEnabled) {
      return NextResponse.json(
        { error: 'HR Copilot has been disabled by your administrator for this organization.' },
        { status: 403 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const { message, sessionId, targetEmployeeId } = body
    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Message payload required' }, { status: 400 })
    }

    // 3. Safety Guardrails Checks (Specs: COP-TC-008, COP-TC-011, COP-TC-006, COP-TC-009)
    // 3a. Direct Prompt Injection / Jailbreak Guardrail (COP-TC-008)
    const injectionCheck = detectPromptInjection(message)
    if (injectionCheck.isInjection) {
      return NextResponse.json({
        reply: injectionCheck.reason,
        blocked: true,
        guardrail: 'PROMPT_INJECTION',
        tenantId: aiContext.tenantId,
        correlation_id: aiContext.correlationId,
      })
    }

    // 3b. Legal / Medical Scope Out-of-Bounds Guardrail (COP-TC-011)
    const scopeCheck = detectScopeViolation(message)
    if (scopeCheck.isOutOfScope) {
      return NextResponse.json({
        reply: scopeCheck.refusalReason,
        blocked: true,
        guardrail: 'OUT_OF_SCOPE',
        tenantId: aiContext.tenantId,
        correlation_id: aiContext.correlationId,
      })
    }

    // 3c. Confidential Data & Persona Manipulation Guardrail (COP-TC-006, COP-TC-009)
    const confidentialCheck = detectConfidentialAccessAttempt(
      message,
      aiContext.role,
      targetEmployeeId,
      aiContext.userId
    )
    if (confidentialCheck.isBlocked) {
      return NextResponse.json({
        reply: confidentialCheck.reason,
        blocked: true,
        guardrail: 'UNAUTHORIZED_CONFIDENTIAL_ACCESS',
        tenantId: aiContext.tenantId,
        correlation_id: aiContext.correlationId,
      })
    }

    // 4. Check for Specific Employee ID in Query (COP-TC-005, COP-TC-007)
    const empMatch = message.match(/\b(EMP(?:-[A-Z0-9]{4,6}|\d{3,5}))\b/i)
    if (empMatch) {
      const queriedEmpCode = empMatch[1].toUpperCase()
      const { data: targetEmp, error: empErr } = await serviceClient
        .from('employees')
        .select('id, employee_code, manager_id')
        .eq('tenant_id', aiContext.tenantId)
        .or(`employee_code.ilike.%${queriedEmpCode}%,employee_code.eq.${queriedEmpCode}`)
        .maybeSingle()

      if (empErr) {
        return NextResponse.json({
          reply: 'Unable to retrieve employee records from the database at this time.',
          error: empErr.message,
        })
      }

      // If employee does not exist: explicitly refuse fabrication (COP-TC-005)
      if (!targetEmp) {
        return NextResponse.json({
          reply: `Employee ${queriedEmpCode} does not exist in your organization's directory.`,
          tenantId: aiContext.tenantId,
          correlation_id: aiContext.correlationId,
        })
      }

      // If employee exists, enforce authorization boundaries
      // Employee role cannot query other employees
      if ((aiContext.role as string).toUpperCase() === 'EMPLOYEE' && targetEmp.id !== aiContext.userId) {
        return NextResponse.json({
          reply: `Access denied: You are not authorized to view records for employee ${queriedEmpCode}.`,
          blocked: true,
          tenantId: aiContext.tenantId,
          correlation_id: aiContext.correlationId,
        })
      }

      // Manager role cannot query employees outside their direct reporting hierarchy (COP-TC-007)
      if (
        (aiContext.role as string).toUpperCase() === 'MANAGER' &&
        targetEmp.manager_id !== aiContext.userId &&
        targetEmp.id !== aiContext.userId
      ) {
        return NextResponse.json({
          reply: `Access denied: Employee ${queriedEmpCode} does not report to you. Managers may only access records for their direct reporting chain.`,
          blocked: true,
          tenantId: aiContext.tenantId,
          correlation_id: aiContext.correlationId,
        })
      }
    }

    // 5. Load Session Context (COP-TC-010 - Cross-Session Isolation)
    let sessionHistory: any[] = []
    if (sessionId) {
      const { data: history } = await serviceClient
        .from('copilot_conversations')
        .select('role, content')
        .eq('session_id', sessionId)
        .eq('user_id', aiContext.userId) // Strictly isolates to caller's own sessions
        .eq('tenant_id', aiContext.tenantId)
        .order('created_at', { ascending: true })
        .limit(10)

      if (history) {
        sessionHistory = history
      }
    }

    // 6. No key yet: say so plainly instead of pretending.
    if (!copilotConfigured()) {
      return NextResponse.json({
        reply:
          "The AI copilot isn't switched on yet. An administrator needs to add the OpenAI API key on the server; then I can answer questions about your attendance, leave, team and more.",
        notConfigured: true,
      })
    }

    // 7. Per-person limit, so one account can't run up the AI bill.
    if (!allowCopilotRequest(aiContext.userId)) {
      return NextResponse.json(
        { reply: "You're sending messages very quickly. Please wait a minute and try again.", rateLimited: true },
        { status: 429 }
      )
    }

    const { data: me } = await serviceClient.from('profiles').select('full_name').eq('id', aiContext.userId).maybeSingle()
    const history = (sessionHistory as { role: string; content: string }[])
      .filter((h) => (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
      .map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content.slice(0, 4000) }))

    // 8. Stream the answer as newline-delimited JSON events:
    //    {type:'tool',name} while looking things up, {type:'delta',text} as the
    //    answer is written, then {type:'done'} or {type:'error',message}.
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: object) => controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
        let answer = ''
        let tools: string[] = []
        try {
          const result = await runCopilot({
            db: serviceClient,
            ctx: aiContext,
            userName: me?.full_name ?? null,
            history,
            message: message.slice(0, 4000),
            emit: send,
            signal: req.signal,
          })
          answer = result.answer
          tools = result.tools
          send({ type: 'done', tools, correlation_id: aiContext.correlationId })
        } catch (err) {
          console.error('[Copilot] stream failed', err)
          send({ type: 'error', message: 'Something went wrong while answering. Please try again.' })
        } finally {
          controller.close()
        }

        // Save the turn and audit tool use (after the user already has the answer).
        if (sessionId && answer) {
          const { error: saveErr } = await serviceClient.from('copilot_conversations').insert([
            { session_id: sessionId, tenant_id: aiContext.tenantId, user_id: aiContext.userId, role: 'user', content: message },
            {
              session_id: sessionId, tenant_id: aiContext.tenantId, user_id: aiContext.userId, role: 'assistant',
              content: answer, tool_invoked: tools.join(',') || null, metadata: { tools, model: copilotModel() },
            },
          ])
          if (saveErr) console.warn('[Copilot] could not save conversation:', saveErr.message)
        }
        if (tools.length) {
          const { error: auditErr } = await serviceClient.from('audit_log').insert({
            tenant_id: aiContext.tenantId,
            actor_id: aiContext.userId,
            action: `COPILOT_TOOL_INVOKED:${[...new Set(tools)].join(',')}`,
            table_name: 'copilot_conversations',
            new_data: { message, tools },
          })
          if (auditErr) console.warn('[Copilot] audit log failed:', auditErr.message)
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (err: any) {
    if (err instanceof AIAuthError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode })
    }
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
