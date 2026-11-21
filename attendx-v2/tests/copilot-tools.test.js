// The copilot's tools must stay inside the caller's company and role.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COPILOT_TOOLS, OPENAI_TOOLS, runCopilotTool } from '../lib/copilot/tools.ts'
import { allowCopilotRequest } from '../lib/copilot/rate-limit.ts'

/** A fake Supabase client that records every query's table and filters. */
function fakeDb(rowsByTable = {}) {
  const log = []
  const db = {
    log,
    from(table) {
      const q = { table, filters: [] }
      log.push(q)
      const result = () => ({ data: rowsByTable[table] ?? [], error: null, count: 0 })
      const builder = {
        select() { return builder },
        eq(col, val) { q.filters.push(['eq', col, val]); return builder },
        neq(col, val) { q.filters.push(['neq', col, val]); return builder },
        in(col, val) { q.filters.push(['in', col, val]); return builder },
        gte(col, val) { q.filters.push(['gte', col, val]); return builder },
        lte(col, val) { q.filters.push(['lte', col, val]); return builder },
        or(expr) { q.filters.push(['or', expr]); return builder },
        order() { return builder },
        limit() { return builder },
        maybeSingle: async () => ({ data: (rowsByTable[table] ?? [])[0] ?? null, error: null }),
        then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject),
      }
      return builder
    },
  }
  return db
}

const ctx = (role) => ({ userId: 'u-1', tenantId: 't-1', tenantName: 'Acme', role, timezone: 'Asia/Kolkata', correlationId: 'c' })

test('every tool is exposed to OpenAI with a schema', () => {
  assert.equal(OPENAI_TOOLS.length, Object.keys(COPILOT_TOOLS).length)
  for (const t of OPENAI_TOOLS) assert.equal(t.function.parameters.type, 'object')
})

for (const name of ['get_team_attendance_today', 'get_pending_approvals', 'get_company_overview']) {
  test(`${name} refuses an EMPLOYEE without querying`, async () => {
    const db = fakeDb()
    const out = await runCopilotTool(db, ctx('EMPLOYEE'), name, '{}')
    assert.ok(out.error, 'expected a refusal')
    assert.equal(db.log.length, 0)
  })
}

test('get_company_overview refuses a MANAGER', async () => {
  const out = await runCopilotTool(fakeDb(), ctx('MANAGER'), 'get_company_overview', '{}')
  assert.ok(out.error)
})

test('a MANAGER only sees direct reports', async () => {
  const db = fakeDb({ employees: [{ id: 'r-1' }, { id: 'r-2' }] })
  await runCopilotTool(db, ctx('MANAGER'), 'get_pending_approvals', '{}')
  const scope = db.log.find(q => q.table === 'employees')
  assert.deepEqual(scope.filters.find(f => f[1] === 'manager_id'), ['eq', 'manager_id', 'u-1'])
  const leaves = db.log.find(q => q.table === 'leaves')
  assert.deepEqual(leaves.filters.find(f => f[0] === 'in'), ['in', 'employee_id', ['r-1', 'r-2']])
})

test('personal tools read only the caller and their company', async () => {
  for (const name of ['get_today_status', 'get_my_attendance', 'get_my_leave_balance', 'get_my_leave_requests']) {
    const db = fakeDb()
    await runCopilotTool(db, ctx('EMPLOYEE'), name, '{}')
    for (const q of db.log) {
      assert.ok(q.filters.some(f => f[1] === 'tenant_id' && f[2] === 't-1'), `${name} on ${q.table} must filter tenant`)
      assert.ok(q.filters.some(f => f[1] === 'employee_id' && f[2] === 'u-1'), `${name} on ${q.table} must filter employee`)
    }
  }
})

test('every query from every tool is filtered by company', async () => {
  for (const role of ['EMPLOYEE', 'MANAGER', 'ADMIN']) {
    for (const name of Object.keys(COPILOT_TOOLS)) {
      const db = fakeDb({ employees: [{ id: 'r-1', manager_id: 'm-1' }] })
      await runCopilotTool(db, ctx(role), name, '{}')
      for (const q of db.log) {
        const scoped = q.filters.some(f => f[1] === 'tenant_id' && f[2] === 't-1') || (q.table === 'profiles' && q.filters.some(f => f[1] === 'id'))
        assert.ok(scoped, `${role} ${name} queried ${q.table} without a company filter`)
      }
    }
  }
})

test('bad tool input never throws', async () => {
  assert.ok((await runCopilotTool(fakeDb(), ctx('ADMIN'), 'drop_tables', '{}')).error)
  assert.ok((await runCopilotTool(fakeDb(), ctx('ADMIN'), 'get_my_attendance', '{not json')).error)
})

test('the rate limit allows 12 messages a minute per person', () => {
  const now = 1_000_000
  for (let i = 0; i < 12; i++) assert.equal(allowCopilotRequest('rl-user', now + i), true)
  assert.equal(allowCopilotRequest('rl-user', now + 20), false)
  assert.equal(allowCopilotRequest('other-user', now + 20), true)
  assert.equal(allowCopilotRequest('rl-user', now + 61_000), true)
})

// ── The model loop, against a fake OpenAI ─────────────────────────────────
import { runCopilot } from '../lib/copilot/agent.ts'

function sse(chunks) {
  const body = chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n'
  return new Response(new TextEncoder().encode(body), { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

test('runCopilot runs the requested tool, then streams the answer', async () => {
  process.env.OPENAI_API_KEY = 'sk-test'
  const requests = []
  const realFetch = globalThis.fetch
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body)
    requests.push(body)
    if (requests.length === 1) {
      return sse([
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'get_my_leave_balance', arguments: '' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{}' } }] } }] },
      ])
    }
    return sse([{ choices: [{ delta: { content: 'You have **6** days ' } }] }, { choices: [{ delta: { content: 'left.' } }] }])
  }
  try {
    const events = []
    const db = fakeDb({ leave_balances: [{ year: 2026, entitled_days: 12, carried_days: 0, used_days: 6, pending_days: 0, leave_type: { name: 'Casual' } }] })
    const { answer, tools } = await runCopilot({ db, ctx: ctx('EMPLOYEE'), userName: 'Ananya', history: [], message: 'leave left?', emit: e => events.push(e) })
    assert.equal(answer, 'You have **6** days left.')
    assert.deepEqual(tools, ['get_my_leave_balance'])
    assert.deepEqual(events.map(e => e.type), ['tool', 'delta', 'delta'])
    // Second request carries the tool result back to the model.
    const toolMsg = requests[1].messages.find(m => m.role === 'tool')
    assert.equal(toolMsg.tool_call_id, 'call_1')
    assert.match(toolMsg.content, /"remaining":6/)
    assert.equal(requests[0].stream, true)
  } finally {
    globalThis.fetch = realFetch
  }
})

test('runCopilot reports a rejected key as a plain message', async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('{"error":{}}', { status: 401 })
  try {
    const events = []
    await runCopilot({ db: fakeDb(), ctx: ctx('EMPLOYEE'), userName: null, history: [], message: 'hi', emit: e => events.push(e) })
    assert.equal(events[0].type, 'error')
    assert.match(events[0].message, /API key/)
  } finally {
    globalThis.fetch = realFetch
  }
})
