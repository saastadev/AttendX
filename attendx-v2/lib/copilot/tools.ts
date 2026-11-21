// The copilot's tools: the only way the model sees company data.
//
// Every tool runs on the server with the caller's identity from
// getAuthoritativeAIContext (never from the model or the browser) and filters
// by tenant, and by role where it reaches beyond the caller's own records:
//   EMPLOYEE  - their own records (plus who on their team is away)
//   MANAGER   - their own records and their direct reports
//   HR, ADMIN, SUPERADMIN - the whole company
// Tools return compact JSON for the model; failures return { error } so the
// model can say what it couldn't look up instead of guessing.

import type { AIAuthContext } from '@/types/ai'

/** Today's date (YYYY-MM-DD) in the company's timezone; same as lib/tenant-time,
 *  kept local so this file has no runtime imports (and is testable in Node). */
export function todayInTimezone(timeZone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

type Db = any
type Json = Record<string, unknown>

const COMPANY_WIDE = new Set(['HR', 'ADMIN', 'SUPERADMIN'])
const roleOf = (ctx: AIAuthContext) => String(ctx.role).toUpperCase()
const isCompanyWide = (ctx: AIAuthContext) => COMPANY_WIDE.has(roleOf(ctx))
const isManagerOrAbove = (ctx: AIAuthContext) => roleOf(ctx) === 'MANAGER' || isCompanyWide(ctx)

/** Employee ids the caller may see team data for; null means the whole company. */
async function teamScope(db: Db, ctx: AIAuthContext): Promise<string[] | null> {
  if (isCompanyWide(ctx)) return null
  if (roleOf(ctx) === 'MANAGER') {
    const { data } = await db.from('employees').select('id').eq('tenant_id', ctx.tenantId).eq('manager_id', ctx.userId)
    return (data ?? []).map((e: { id: string }) => e.id)
  }
  return []
}

async function namesFor(db: Db, ctx: AIAuthContext, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return new Map()
  const { data } = await db.from('profiles').select('id, full_name').eq('tenant_id', ctx.tenantId).in('id', unique)
  return new Map((data ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name]))
}

/** "09:02" in the company's timezone. */
function timeIn(tz: string, iso: string | null | undefined): string | null {
  if (!iso) return null
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
  } catch {
    return iso
  }
}

const hours = (minutes: number | null | undefined) =>
  minutes == null ? null : Math.round((minutes / 60) * 10) / 10

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

interface ToolDef {
  description: string
  parameters: Json
  run: (db: Db, ctx: AIAuthContext, args: Json) => Promise<unknown>
}

const NO_ARGS = { type: 'object', properties: {}, additionalProperties: false }

export const COPILOT_TOOLS: Record<string, ToolDef> = {
  get_my_profile: {
    description: "The caller's own profile: name, email, employee code, department, designation, manager, join date and shift.",
    parameters: NO_ARGS,
    run: async (db, ctx) => {
      const [{ data: profile }, { data: emp }] = await Promise.all([
        db.from('profiles').select('full_name, email, phone').eq('id', ctx.userId).maybeSingle(),
        db.from('employees')
          .select('employee_code, join_date, employment_type, work_location, manager_id, department:departments(name), designation:designations(name), shift:shifts(name, start_time, end_time)')
          .eq('tenant_id', ctx.tenantId).eq('id', ctx.userId).maybeSingle(),
      ])
      const manager = emp?.manager_id ? (await namesFor(db, ctx, [emp.manager_id])).get(emp.manager_id) : null
      return {
        name: profile?.full_name, email: profile?.email, role: roleOf(ctx), company: ctx.tenantName,
        employee_code: emp?.employee_code ?? null, department: emp?.department?.name ?? null,
        designation: emp?.designation?.name ?? null, manager: manager ?? null, join_date: emp?.join_date ?? null,
        employment_type: emp?.employment_type ?? null, work_location: emp?.work_location ?? null,
        shift: emp?.shift ? { name: emp.shift.name, start: emp.shift.start_time, end: emp.shift.end_time } : null,
      }
    },
  },

  get_today_status: {
    description: "The caller's attendance today: whether they have clocked in or out, at what time, and hours so far.",
    parameters: NO_ARGS,
    run: async (db, ctx) => {
      const today = todayInTimezone(ctx.timezone)
      const { data, error } = await db.from('attendance_records')
        .select('clock_in_at, clock_out_at, status, work_minutes, geofence_valid')
        .eq('tenant_id', ctx.tenantId).eq('employee_id', ctx.userId).eq('date', today).maybeSingle()
      if (error) return { error: 'Could not read today\'s attendance.' }
      if (!data?.clock_in_at) return { date: today, state: 'not clocked in yet' }
      const minutesSoFar = data.clock_out_at
        ? data.work_minutes
        : Math.round((Date.now() - new Date(data.clock_in_at).getTime()) / 60000)
      return {
        date: today,
        state: data.clock_out_at ? 'clocked out (shift done)' : 'clocked in, working now',
        clock_in: timeIn(ctx.timezone, data.clock_in_at), clock_out: timeIn(ctx.timezone, data.clock_out_at),
        hours: hours(minutesSoFar), status: data.status, inside_office_boundary: data.geofence_valid,
      }
    },
  },

  get_my_attendance: {
    description: "The caller's own attendance over the last N days (default 30, max 90): a summary (days present, late days, total and average hours, usual clock-in time) plus each day.",
    parameters: {
      type: 'object',
      properties: { days: { type: 'integer', minimum: 1, maximum: 90, description: 'How many days back, default 30.' } },
      additionalProperties: false,
    },
    run: async (db, ctx, args) => {
      const days = clampInt(args.days, 1, 90, 30)
      const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
      const { data, error } = await db.from('attendance_records')
        .select('date, clock_in_at, clock_out_at, status, work_minutes')
        .eq('tenant_id', ctx.tenantId).eq('employee_id', ctx.userId).gte('date', since).order('date', { ascending: false })
      if (error) return { error: 'Could not read attendance records.' }
      const rows = data ?? []
      const worked = rows.filter((r: Json) => r.clock_in_at)
      const totalMinutes = worked.reduce((s: number, r: Json) => s + (Number(r.work_minutes) || 0), 0)
      const inMinutes = worked
        .map((r: Json) => timeIn(ctx.timezone, r.clock_in_at as string))
        .filter(Boolean)
        .map((t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)))
      const avgIn = inMinutes.length ? Math.round(inMinutes.reduce((a: number, b: number) => a + b, 0) / inMinutes.length) : null
      return {
        period: { from: since, to: todayInTimezone(ctx.timezone), days },
        summary: {
          days_present: worked.length,
          late_days: rows.filter((r: Json) => String(r.status).toUpperCase() === 'LATE').length,
          total_hours: hours(totalMinutes),
          average_hours_per_day: worked.length ? hours(totalMinutes / worked.length) : null,
          usual_clock_in: avgIn == null ? null : `${String(Math.floor(avgIn / 60)).padStart(2, '0')}:${String(avgIn % 60).padStart(2, '0')}`,
        },
        days_detail: rows.slice(0, 31).map((r: Json) => ({
          date: r.date, status: r.status, in: timeIn(ctx.timezone, r.clock_in_at as string),
          out: timeIn(ctx.timezone, r.clock_out_at as string), hours: hours(r.work_minutes as number),
        })),
      }
    },
  },

  get_my_leave_balance: {
    description: "The caller's leave balance this year for each leave type: entitled, carried over, used, pending and remaining days.",
    parameters: NO_ARGS,
    run: async (db, ctx) => {
      const year = Number(todayInTimezone(ctx.timezone).slice(0, 4))
      const { data, error } = await db.from('leave_balances')
        .select('year, entitled_days, carried_days, used_days, pending_days, leave_type:leave_types(name, is_paid)')
        .eq('tenant_id', ctx.tenantId).eq('employee_id', ctx.userId).eq('year', year)
      if (error) return { error: 'Could not read leave balances.' }
      if (!data?.length) return { year, balances: [], note: 'No leave balances are set up for this year yet.' }
      return {
        year,
        balances: data.map((b: Json & { leave_type?: { name?: string; is_paid?: boolean } }) => {
          const entitled = Number(b.entitled_days) || 0
          const carried = Number(b.carried_days) || 0
          const used = Number(b.used_days) || 0
          const pending = Number(b.pending_days) || 0
          return { type: b.leave_type?.name ?? 'Leave', paid: b.leave_type?.is_paid ?? null, entitled, carried, used, pending, remaining: entitled + carried - used - pending }
        }),
      }
    },
  },

  get_my_leave_requests: {
    description: "The caller's own leave requests (most recent 20), optionally filtered by status.",
    parameters: {
      type: 'object',
      properties: { status: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'WITHDRAWN'] } },
      additionalProperties: false,
    },
    run: async (db, ctx, args) => {
      let q = db.from('leaves')
        .select('start_date, end_date, total_days, status, reason, reviewer_note, applied_at, leave_type:leave_types(name)')
        .eq('tenant_id', ctx.tenantId).eq('employee_id', ctx.userId).eq('is_draft', false)
        .order('start_date', { ascending: false }).limit(20)
      if (typeof args.status === 'string') q = q.eq('status', args.status)
      const { data, error } = await q
      if (error) return { error: 'Could not read leave requests.' }
      return (data ?? []).map((l: Json & { leave_type?: { name?: string } }) => ({
        type: l.leave_type?.name, from: l.start_date, to: l.end_date, days: l.total_days,
        status: l.status, reason: l.reason, reviewer_note: l.reviewer_note,
      }))
    },
  },

  get_holidays: {
    description: "The company's upcoming holidays (next 15).",
    parameters: NO_ARGS,
    run: async (db, ctx) => {
      const { data, error } = await db.from('holidays').select('name, date, is_optional')
        .eq('tenant_id', ctx.tenantId).gte('date', todayInTimezone(ctx.timezone)).order('date').limit(15)
      if (error) return { error: 'Could not read holidays.' }
      return data ?? []
    },
  },

  get_people_on_leave: {
    description: 'Who is on approved leave on a date (default today). HR and admins see the whole company, managers their direct reports, employees their own team.',
    parameters: {
      type: 'object',
      properties: { date: { type: 'string', description: 'YYYY-MM-DD; default today.' } },
      additionalProperties: false,
    },
    run: async (db, ctx, args) => {
      const date = typeof args.date === 'string' && ISO_DATE.test(args.date) ? args.date : todayInTimezone(ctx.timezone)
      let ids = await teamScope(db, ctx)
      if (roleOf(ctx) === 'EMPLOYEE') {
        const { data: me } = await db.from('employees').select('manager_id').eq('tenant_id', ctx.tenantId).eq('id', ctx.userId).maybeSingle()
        if (!me?.manager_id) return { date, people: [], note: 'You have no team assigned.' }
        const { data: peers } = await db.from('employees').select('id').eq('tenant_id', ctx.tenantId).eq('manager_id', me.manager_id)
        ids = (peers ?? []).map((p: { id: string }) => p.id)
      }
      let q = db.from('leaves').select('employee_id, start_date, end_date, leave_type:leave_types(name)')
        .eq('tenant_id', ctx.tenantId).eq('status', 'APPROVED').lte('start_date', date).gte('end_date', date)
      if (ids) {
        if (ids.length === 0) return { date, people: [] }
        q = q.in('employee_id', ids)
      }
      const { data, error } = await q
      if (error) return { error: 'Could not read leave records.' }
      const names = await namesFor(db, ctx, (data ?? []).map((l: Json) => l.employee_id as string))
      return {
        date,
        people: (data ?? []).map((l: Json & { leave_type?: { name?: string } }) => ({
          name: names.get(l.employee_id as string) ?? 'Team member', type: l.leave_type?.name, from: l.start_date, to: l.end_date,
        })),
      }
    },
  },

  get_team_attendance_today: {
    description: "Managers, HR and admins only: today's attendance for their people (direct reports, or the whole company for HR/admin): who is in, who clocked out, who hasn't clocked in, and who is on leave.",
    parameters: NO_ARGS,
    run: async (db, ctx) => {
      if (!isManagerOrAbove(ctx)) return { error: 'Only managers, HR and admins can see team attendance.' }
      const today = todayInTimezone(ctx.timezone)
      const scope = await teamScope(db, ctx)
      let empQ = db.from('employees').select('id').eq('tenant_id', ctx.tenantId).or('status.is.null,status.not.in.(TERMINATED,INACTIVE,EXITED)')
      if (scope) {
        if (scope.length === 0) return { date: today, note: 'You have no direct reports.' }
        empQ = empQ.in('id', scope)
      }
      const { data: emps, error } = await empQ.limit(500)
      if (error) return { error: 'Could not read employees.' }
      const ids = (emps ?? []).map((e: { id: string }) => e.id)
      if (ids.length === 0) return { date: today, people: [] }
      const [{ data: recs }, { data: leaves }, names] = await Promise.all([
        db.from('attendance_records').select('employee_id, clock_in_at, clock_out_at, status, geofence_valid')
          .eq('tenant_id', ctx.tenantId).eq('date', today).in('employee_id', ids),
        db.from('leaves').select('employee_id').eq('tenant_id', ctx.tenantId).eq('status', 'APPROVED')
          .lte('start_date', today).gte('end_date', today).in('employee_id', ids),
        namesFor(db, ctx, ids),
      ])
      const byId = new Map((recs ?? []).map((r: Json) => [r.employee_id as string, r]))
      const onLeave = new Set((leaves ?? []).map((l: Json) => l.employee_id as string))
      const people = ids.map((id: string) => {
        const r = byId.get(id) as Json | undefined
        const state = onLeave.has(id) ? 'on leave'
          : !r?.clock_in_at ? 'not clocked in'
          : r.clock_out_at ? 'clocked out' : 'in'
        return {
          name: names.get(id) ?? 'Employee', state,
          clock_in: timeIn(ctx.timezone, r?.clock_in_at as string), clock_out: timeIn(ctx.timezone, r?.clock_out_at as string),
          status: r?.status ?? null, outside_office: r?.clock_in_at ? r.geofence_valid === false : null,
        }
      })
      const count = (s: string) => people.filter((p: { state: string }) => p.state === s).length
      return {
        date: today,
        totals: { people: people.length, in: count('in'), clocked_out: count('clocked out'), not_clocked_in: count('not clocked in'), on_leave: count('on leave') },
        people: people.slice(0, 100),
      }
    },
  },

  get_pending_approvals: {
    description: 'Managers, HR and admins only: leave requests waiting for approval from their people.',
    parameters: NO_ARGS,
    run: async (db, ctx) => {
      if (!isManagerOrAbove(ctx)) return { error: 'Only managers, HR and admins approve requests.' }
      const scope = await teamScope(db, ctx)
      let q = db.from('leaves').select('employee_id, start_date, end_date, total_days, reason, applied_at, leave_type:leave_types(name)')
        .eq('tenant_id', ctx.tenantId).eq('status', 'PENDING').eq('is_draft', false).order('applied_at').limit(50)
      if (scope) {
        if (scope.length === 0) return { pending: [] }
        q = q.in('employee_id', scope)
      }
      const { data, error } = await q
      if (error) return { error: 'Could not read leave requests.' }
      const names = await namesFor(db, ctx, (data ?? []).map((l: Json) => l.employee_id as string))
      return {
        pending: (data ?? []).map((l: Json & { leave_type?: { name?: string } }) => ({
          name: names.get(l.employee_id as string) ?? 'Employee', type: l.leave_type?.name, from: l.start_date,
          to: l.end_date, days: l.total_days, reason: l.reason, applied: (l.applied_at as string)?.slice(0, 10),
        })),
        where_to_act: 'Approvals page (/manager/approvals)',
      }
    },
  },

  get_company_overview: {
    description: "HR and admins only: the company at a glance: headcount, people per department, today's attendance and leave, and pending leave requests.",
    parameters: NO_ARGS,
    run: async (db, ctx) => {
      if (!isCompanyWide(ctx)) return { error: 'Only HR and admins can see the company overview.' }
      const today = todayInTimezone(ctx.timezone)
      const [emps, depts, recs, leaves, pending] = await Promise.all([
        db.from('employees').select('id, department_id, status').eq('tenant_id', ctx.tenantId).limit(5000),
        db.from('departments').select('id, name').eq('tenant_id', ctx.tenantId),
        db.from('attendance_records').select('clock_in_at, clock_out_at, geofence_valid').eq('tenant_id', ctx.tenantId).eq('date', today),
        db.from('leaves').select('id', { count: 'exact', head: true }).eq('tenant_id', ctx.tenantId).eq('status', 'APPROVED').lte('start_date', today).gte('end_date', today),
        db.from('leaves').select('id', { count: 'exact', head: true }).eq('tenant_id', ctx.tenantId).eq('status', 'PENDING').eq('is_draft', false),
      ])
      if (emps.error) return { error: 'Could not read employees.' }
      const active = (emps.data ?? []).filter((e: Json) => !['TERMINATED', 'INACTIVE', 'EXITED'].includes(String(e.status ?? 'ACTIVE').toUpperCase()))
      const deptName = new Map((depts.data ?? []).map((d: { id: string; name: string }) => [d.id, d.name]))
      const perDept: Record<string, number> = {}
      for (const e of active) {
        const name = (deptName.get(e.department_id as string) as string) ?? 'No department'
        perDept[name] = (perDept[name] ?? 0) + 1
      }
      const r = recs.data ?? []
      return {
        date: today,
        headcount: active.length,
        by_department: perDept,
        today: {
          clocked_in: r.filter((x: Json) => x.clock_in_at).length,
          still_working: r.filter((x: Json) => x.clock_in_at && !x.clock_out_at).length,
          outside_office_boundary: r.filter((x: Json) => x.clock_in_at && x.geofence_valid === false).length,
          on_leave: leaves.count ?? 0,
        },
        pending_leave_requests: pending.count ?? 0,
      }
    },
  },

  get_performance_cycles: {
    description: 'Performance review cycles: names, periods, status and self/manager review deadlines (latest 5).',
    parameters: NO_ARGS,
    run: async (db, ctx) => {
      const { data, error } = await db.from('performance_cycles')
        .select('name, start_date, end_date, self_review_deadline, manager_review_deadline, status')
        .eq('tenant_id', ctx.tenantId).order('start_date', { ascending: false }).limit(5)
      if (error) return { error: 'Could not read review cycles.' }
      return data ?? []
    },
  },

  get_learning_courses: {
    description: "Active courses in the company's learning catalog (up to 10), optionally filtered by a word in the title or category.",
    parameters: {
      type: 'object',
      properties: { search: { type: 'string', description: 'Optional word to match in title or category.' } },
      additionalProperties: false,
    },
    run: async (db, ctx, args) => {
      let q = db.from('learning_courses').select('title, category, level, duration_hours, skill_tags')
        .eq('tenant_id', ctx.tenantId).eq('is_active', true).order('title').limit(10)
      if (typeof args.search === 'string' && args.search.trim()) {
        const s = args.search.trim().replace(/[%,()]/g, ' ').slice(0, 40)
        q = q.or(`title.ilike.%${s}%,category.ilike.%${s}%`)
      }
      const { data, error } = await q
      if (error) return { error: 'Could not read the course catalog.' }
      return data ?? []
    },
  },
}

/** The tool list in OpenAI's function-calling format. */
export const OPENAI_TOOLS = Object.entries(COPILOT_TOOLS).map(([name, t]) => ({
  type: 'function' as const,
  function: { name, description: t.description, parameters: t.parameters },
}))

/** Runs one tool call from the model; never throws. */
export async function runCopilotTool(db: Db, ctx: AIAuthContext, name: string, rawArgs: string): Promise<unknown> {
  const tool = COPILOT_TOOLS[name]
  if (!tool) return { error: `Unknown tool ${name}.` }
  let args: Json = {}
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {}
  } catch {
    return { error: 'Tool arguments were not valid JSON.' }
  }
  try {
    return await tool.run(db, ctx, args ?? {})
  } catch (err) {
    console.error(`[Copilot] tool ${name} failed`, err)
    return { error: `Could not run ${name}.` }
  }
}
