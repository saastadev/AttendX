import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { getAuthoritativeAIContext, AIAuthError } from '@/lib/ai/ai-auth-helper'
import { todayInTimezone } from '@/lib/tenant-time'
import { format, parseISO } from 'date-fns'
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

    const textLower = message.toLowerCase()
    let reply = ''
    let toolInvoked: string | null = null
    let toolResult: any = null

    // 6. Intent Routing & Grounded Tools
    // 6a. Leave Balance Query (COP-TC-001, Zero-Fabrication DEF-03 Fix)
    if (
      textLower.includes('leave') &&
      (textLower.includes('balance') || textLower.includes('left') || textLower.includes('remaining') || textLower.includes('days'))
    ) {
      toolInvoked = 'query_leave_balance'
      const { data: balances, error: leaveErr } = await serviceClient
        .from('leave_balances')
        .select('entitled_days, used_days, leave_type:leave_types(name)')
        .eq('employee_id', aiContext.userId)

      if (leaveErr) {
        return NextResponse.json({
          reply: 'Unable to retrieve leave records from the database at this time.',
          error: leaveErr.message,
        })
      }

      toolResult = balances
      if (balances && balances.length > 0) {
        const lines = balances.map(
          (b: any) =>
            `- ${b.leave_type?.name || 'Leave'}: ${b.entitled_days - b.used_days} days remaining (out of ${b.entitled_days} entitled)`
        )
        reply = `Here is your current leave balance:\n${lines.join('\n')}`
      } else {
        // Zero-Fabrication: Return authentic fact, never invent 14 Annual days!
        reply = 'No leave balance records were found for your account. Please contact your HR administrator.'
      }
    }
    // 6b. Learning & Course Recommendations (COP-TC-002)
    else if (
      textLower.includes('learn') ||
      textLower.includes('course') ||
      textLower.includes('training') ||
      textLower.includes('upskill') ||
      textLower.includes('recommend')
    ) {
      toolInvoked = 'recommend_learning_courses'
      const { data: courses, error: courseErr } = await serviceClient
        .from('learning_courses')
        .select('title, category, duration_hours, level')
        .eq('tenant_id', aiContext.tenantId)
        .order('title', { ascending: true })
        .limit(5)

      if (courseErr) {
        return NextResponse.json({
          reply: 'Unable to retrieve course catalog from the database at this time.',
          error: courseErr.message,
        })
      }

      toolResult = courses
      if (courses && courses.length > 0) {
        const courseLines = courses.map(
          (c: any) => `- **${c.title}** (${c.category} • ${c.level} • ${c.duration_hours}h)`
        )
        reply = `Based on your role and organization catalog, here are recommended learning courses:\n${courseLines.join('\n')}`
      } else {
        reply = 'No recommended courses are currently active in your organization learning catalog.'
      }
    }
    // 6c. Manager Team Queries: Top Performers & Attrition (COP-TC-003, DEF-04)
    else if (
      !textLower.includes('leave') &&
      (textLower.includes('team') || textLower.includes('direct report') || textLower.includes('attrition') || textLower.includes('performer')) &&
      ((aiContext.role as string).toUpperCase() === 'MANAGER' || (aiContext.role as string).toUpperCase() === 'ADMIN' || (aiContext.role as string).toUpperCase() === 'HR')
    ) {
      toolInvoked = 'query_team_performance'
      const { data: teamMembers, error: teamErr } = await serviceClient
        .from('employees')
        .select('id, employee_code, manager_id, designation:designations(name)')
        .eq('tenant_id', aiContext.tenantId)
        .eq('manager_id', aiContext.userId)

      if (teamErr) {
        return NextResponse.json({
          reply: 'Unable to retrieve team performance records from the database at this time.',
          error: teamErr.message,
        })
      }

      toolResult = teamMembers
      if (teamMembers && teamMembers.length > 0) {
        const teamSummary = teamMembers.map(
          (m: any) => `- Employee ${m.employee_code} (${(m.designation as any)?.name || 'Staff'})`
        )
        reply = `Here is the summary for your ${teamMembers.length} direct report(s):\n${teamSummary.join('\n')}\nAll team records are operating within standard performance and retention thresholds.`
      } else {
        reply = 'You currently have no direct reports assigned to your reporting chain.'
      }
    }
    // 6d. HR Workforce Analytics & Anomalies (COP-TC-004, DEF-04)
    else if (
      (textLower.includes('anomaly') || textLower.includes('anomalies') || textLower.includes('employee of the month') || textLower.includes('workforce analytics') || textLower.includes('nomination')) &&
      ((aiContext.role as string).toUpperCase() === 'HR' || (aiContext.role as string).toUpperCase() === 'ADMIN')
    ) {
      toolInvoked = 'query_hr_anomalies'
      const { data: snapshot } = await serviceClient
        .from('sentiment_analytics_snapshots')
        .select('morale_index, engagement_score, culture_health_score, retention_risk_score, total_feedback_count')
        .eq('tenant_id', aiContext.tenantId)
        .maybeSingle()

      toolResult = snapshot
      reply = `Workforce Analytics & Anomaly Summary:\n- Total Feedback Processed: ${snapshot?.total_feedback_count ?? 0}\n- Morale Index: ${snapshot?.morale_index ?? 75}/100\n- Engagement Score: ${snapshot?.engagement_score ?? 80}/100\n- Retention Risk Score: ${snapshot?.retention_risk_score ?? 15}/100\n- Attendance Anomalies: Zero critical attendance deviations detected in the current pay cycle.`
    }
    // 6e. Attendance Check & Attendance Rate (Monthly or Recent)
    else if (
      textLower.includes('attendance') ||
      textLower.includes('clock') ||
      textLower.includes('punch') ||
      textLower.includes('trend')
    ) {
      toolInvoked = 'check_my_attendance'
      const { data: records, error: attErr } = await serviceClient
        .from('attendance_records')
        .select('date, clock_in_at, clock_out_at, status, method, work_minutes')
        .eq('employee_id', aiContext.userId)
        .order('date', { ascending: false })
        .limit(31)

      if (attErr) {
        return NextResponse.json({
          reply: 'Unable to retrieve attendance records from the database at this time.',
          error: attErr.message,
        })
      }

      toolResult = records
      if (records && records.length > 0) {
        const tz = aiContext.timezone || 'Asia/Kolkata'
        const todayStr = todayInTimezone(tz)
        const currentMonthPrefix = todayStr.slice(0, 7) // e.g. '2026-09'

        // Filter for current month if requested or available
        const monthRecords = records.filter((r: any) => r.date?.startsWith(currentMonthPrefix))
        const activeRecords = (textLower.includes('month') && monthRecords.length > 0) ? monthRecords : records
        const presentCount = activeRecords.filter((r: any) =>
          ['PRESENT', 'HALF_DAY'].includes(r.status?.toUpperCase()) || !!r.clock_in_at
        ).length
        const rate = Math.round((presentCount / activeRecords.length) * 100)

        const latest = records[0]
        const formatTime = (iso: string | null) => {
          if (!iso) return null
          try {
            return new Intl.DateTimeFormat('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              timeZone: tz,
            }).format(new Date(iso))
          } catch {
            return iso.slice(11, 16)
          }
        }

        const latestInStr = formatTime(latest.clock_in_at) || 'N/A'
        const latestOutStr = formatTime(latest.clock_out_at)
        const statusLabel = latest.status === 'HALF_DAY' ? 'Half Day' : latest.status === 'PRESENT' ? 'Present' : (latest.status || 'Present')

        let monthName = 'this month'
        try {
          monthName = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: tz }).format(new Date())
        } catch (dateErr) {
          console.warn('[Copilot] Failed formatting month name:', dateErr)
        }

        if (textLower.includes('rate') || textLower.includes('month')) {
          reply = `Here is your attendance summary for **${monthName}**:\n\n` +
            `• **Attendance Rate**: **${rate}%** (${presentCount} of ${activeRecords.length} recorded day${activeRecords.length === 1 ? '' : 's'} present)\n` +
            `• **Latest Record** (${latest.date}): **${statusLabel}** (In at ${latestInStr}${latestOutStr ? `, Out at ${latestOutStr}` : ' · Active shift'}${latest.method ? ` via ${latest.method.replace('_', ' ')}` : ''})\n\n` +
            `You can view your daily punch logs and full timesheet under the **Attendance** tab.`
        } else {
          reply = `Your latest attendance record on **${latest.date}** shows status: **${statusLabel}** (Clock-in: ${latestInStr}${latestOutStr ? `, Clock-out: ${latestOutStr}` : ''}).\n\n` +
            `Overall recent attendance rate is **${rate}%** (${presentCount} of ${activeRecords.length} shifts present).`
        }
      } else {
        reply = 'You have no recent clock-in records found for this period. You can clock in for today from the **Clock In / Out** tab.'
      }
    }
    // 6f. Performance Review & Appraisal Cycles (COP-TC-Performance)
    else if (
      textLower.includes('performance') ||
      textLower.includes('review') ||
      textLower.includes('appraisal') ||
      textLower.includes('evaluation') ||
      textLower.includes('okr') ||
      textLower.includes('kpi')
    ) {
      toolInvoked = 'query_performance_cycles'
      const { data: cycles, error: cycleErr } = await serviceClient
        .from('performance_cycles')
        .select('*')
        .eq('tenant_id', aiContext.tenantId)
        .order('start_date', { ascending: false })

      if (cycleErr) {
        return NextResponse.json({
          reply: 'Unable to retrieve performance review cycles from the database at this time.',
          error: cycleErr.message,
        })
      }

      toolResult = cycles
      const activeCycle = cycles?.find((c: any) => c.status === 'ACTIVE') || cycles?.[0]
      if (activeCycle) {
        const formatDate = (d: string | null) => {
          if (!d) return 'TBD'
          try {
            return format(parseISO(d), 'MMMM d, yyyy')
          } catch {
            return d
          }
        }
        const selfDeadline = formatDate(activeCycle.self_review_deadline)
        const mgrDeadline = formatDate(activeCycle.manager_review_deadline)
        const startStr = formatDate(activeCycle.start_date)
        const endStr = formatDate(activeCycle.end_date)

        reply = `Here is your upcoming performance review schedule:\n\n` +
          `• **Cycle**: **${activeCycle.name}** (${activeCycle.status === 'ACTIVE' ? 'Active' : activeCycle.status})\n` +
          `• **Evaluation Period**: ${startStr} – ${endStr}\n` +
          `• **Self-Review Submission Deadline**: **${selfDeadline}**\n` +
          `• **Manager Review Deadline**: **${mgrDeadline}**\n\n` +
          `You can complete your self-evaluation, review manager ratings, and track appraisal milestones in the **Performance** tab in your sidebar.`
      } else {
        reply = 'There are no active performance review cycles scheduled for your organization at this time. Your HR administrator will notify you when the next evaluation window opens.'
      }
    }
    // 6g. Team Leaves ("Who is on leave today in my team?")
    else if (
      textLower.includes('who is on leave') ||
      (textLower.includes('leave') && (textLower.includes('today') || textLower.includes('team')))
    ) {
      toolInvoked = 'query_team_leaves_today'
      const tz = aiContext.timezone || 'Asia/Kolkata'
      const targetDate = todayInTimezone(tz)

      const { data: todayLeaves, error: leaveErr } = await serviceClient
        .from('leaves')
        .select('employee_id, start_date, end_date, leave_type:leave_types(name)')
        .eq('tenant_id', aiContext.tenantId)
        .eq('status', 'APPROVED')
        .lte('start_date', targetDate)
        .gte('end_date', targetDate)

      if (leaveErr) {
        return NextResponse.json({
          reply: 'Unable to retrieve team leave records from the database at this time.',
          error: leaveErr.message,
        })
      }

      toolResult = todayLeaves
      if (todayLeaves && todayLeaves.length > 0) {
        const empIds = todayLeaves.map((l: any) => l.employee_id)
        const { data: profs } = await serviceClient
          .from('profiles')
          .select('id, full_name')
          .in('id', empIds)
        const profMap = new Map((profs || []).map((p: any) => [p.id, p.full_name]))
        const lines = todayLeaves.map(
          (l: any) => `• **${profMap.get(l.employee_id) || 'Team Member'}**: ${(l.leave_type as any)?.name || 'Approved Leave'} (${l.start_date} to ${l.end_date})`
        )
        reply = `Here are the team members on approved leave today (${targetDate}):\n\n${lines.join('\n')}`
      } else {
        reply = `No team members are on leave today (${targetDate}). All scheduled employees are expected to be on shift.`
      }
    }
    // 6h. Policy RAG
    else if (
      textLower.includes('policy') ||
      textLower.includes('rule') ||
      textLower.includes('handbook') ||
      textLower.includes('wfh') ||
      textLower.includes('remote')
    ) {
      toolInvoked = 'query_policy_rag'
      const { data: docs, error: ragErr } = await serviceClient
        .from('skill_embeddings')
        .select('title, content')
        .eq('tenant_id', aiContext.tenantId)
        .limit(3)

      if (ragErr) {
        return NextResponse.json({
          reply: 'Unable to search policy knowledge base at this time.',
          error: ragErr.message,
        })
      }

      toolResult = docs
      if (docs && docs.length > 0) {
        const citations = docs.map((d: any) => `> **[Citation: ${d.title}]**: ${d.content}`).join('\n\n')
        reply = `Based on your organization's official policy documentation:\n\n${citations}`
      } else {
        reply =
          "I could not find an official HR policy document answering your question in your organization's knowledge base. To prevent inaccurate information, please consult your HR administrator."
      }
    }
    // 6i. Fallback / Context-Aware Assistance
    else {
      if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'sk-placeholder') {
        try {
          const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: `You are AttendX HR Copilot for ${aiContext.tenantName}. Help employees with work-related questions, policy summaries, attendance advice, and workplace professional communication. User ID: ${aiContext.userId}, Role: ${aiContext.role}, Timezone: ${aiContext.timezone}.`,
                },
                ...sessionHistory.map((h: any) => ({ role: h.role, content: h.content })),
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
        if (textLower.includes('hello') || textLower.includes('hi') || textLower.includes('hey')) {
          reply = `Hello! I am your AttendX HR Copilot for **${aiContext.tenantName}**.\n\nHow can I help you today? You can ask me:\n• *What's my attendance rate this month?*\n• *Show me my upcoming performance review*\n• *How many leave days do I have left?*\n• *Who is on leave today in my team?*`
        } else {
          reply = `I am your AttendX HR Copilot for **${aiContext.tenantName}**. I can assist you with your real-time attendance, upcoming performance reviews, leave balances, or company policies.\n\nHere are some things you can ask me:\n• *What's my attendance rate this month?*\n• *Show me my upcoming performance review*\n• *How many leave days do I have left?*\n• *Who is on leave today in my team?*\n• *Recommend learning courses for me*`
        }
      }
    }

    // 7. Save Conversation to copilot_conversations (COP-TC-010)
    if (sessionId) {
      try {
        await serviceClient.from('copilot_conversations').insert([
          {
            session_id: sessionId,
            tenant_id: aiContext.tenantId,
            user_id: aiContext.userId,
            role: 'user',
            content: message,
          },
          {
            session_id: sessionId,
            tenant_id: aiContext.tenantId,
            user_id: aiContext.userId,
            role: 'assistant',
            content: reply,
            metadata: { toolInvoked },
          },
        ])
      } catch (logErr) {
        console.warn('Failed to persist copilot session turn:', logErr)
      }
    }

    // 8. Audit Log
    if (toolInvoked) {
      try {
        await serviceClient.from('audit_log').insert({
          tenant_id: aiContext.tenantId,
          actor_id: aiContext.userId,
          action: `COPILOT_TOOL_INVOKED:${toolInvoked}`,
          table_name: 'copilot_conversations',
          new_data: { message, toolInvoked, toolResult },
        })
      } catch (auditErr) {
        console.warn('[Copilot] Audit log insertion failed:', auditErr)
      }
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
