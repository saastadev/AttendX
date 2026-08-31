/**
 * AttendX v2 — REAL RLS Isolation Suite
 *
 * Runs against a live Postgres with the migrations applied. Every identity is
 * impersonated the way Supabase does it: SET ROLE authenticated + a JWT claim.
 *
 * DESIGN RULE — every negative assertion carries a POSITIVE CONTROL.
 * "User sees 0 rows of the other tenant" proves nothing on its own: a user with
 * no access at all, or a UUID that does not exist, satisfies it trivially. So we
 * first prove the identity CAN see its own data, then prove it cannot see the
 * other tenant's.
 *
 * In CI (CI=true) an unreachable database is a HARD FAILURE, never a skip.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { Client } from 'pg'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/attendx_test'
const IN_CI = process.env.CI === 'true'

const T_ACME   = 'aa000000-0000-0000-0000-0000000000a1'
const T_GLOBEX = 'bb000000-0000-0000-0000-0000000000b2'
const U = {
  aliceEmp: 'a0000001-0000-0000-0000-000000000001',
  aaronMgr: 'a0000002-0000-0000-0000-000000000002',
  anitaHR:  'a0000003-0000-0000-0000-000000000003',
  adamAdm:  'a0000004-0000-0000-0000-000000000004',
  bobEmp:   'b0000001-0000-0000-0000-000000000001',
}

/** Run a query as a given user, exactly how Supabase presents a request. */
async function asUser(client, uid, sql, params = [], tenantClaim = null) {
  await client.query('BEGIN')
  try {
    await client.query('SET LOCAL ROLE authenticated')
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid])
    await client.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`)
    if (tenantClaim) {
      await client.query(`SELECT set_config('request.jwt.claim.tenant_id', $1, true)`, [tenantClaim])
    }
    const res = await client.query(sql, params)
    await client.query('ROLLBACK')
    return res
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  }
}

const count = res => Number(res.rows[0].count ?? res.rows[0].c ?? 0)

test('RLS — real cross-tenant isolation with positive controls', async (t) => {
  const client = new Client({ connectionString: DB_URL, connectionTimeoutMillis: 4000 })

  try {
    await client.connect()
  } catch (err) {
    // A missing database must never look like a pass in CI.
    if (IN_CI) {
      assert.fail(
        `DATABASE UNREACHABLE IN CI (${DB_URL}): ${err.message}\n` +
        `RLS tests cannot be skipped in CI — that is how a suite passes for the wrong reason.`
      )
    }
    t.skip(`Postgres unavailable locally (${err.message}). Run: npm run db:test:setup`)
    return
  }

  try {
    await client.query(readFileSync(join(__dirname, 'fixtures.sql'), 'utf8'))

    // ----------------------------------------------------------------
    // 0. Meta: the subject of these tests must actually be switched on.
    // ----------------------------------------------------------------
    await t.test('META: RLS is enabled AND forced on every public table', async () => {
      const res = await client.query(`
        SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname='public' AND c.relkind='r'`)
      assert.ok(res.rows.length > 0, 'no public tables found — schema not applied')
      const bad = res.rows.filter(r => !r.relrowsecurity || !r.relforcerowsecurity)
      assert.equal(bad.length, 0, `tables without forced RLS: ${bad.map(r => r.relname).join(', ')}`)
    })

    await t.test('META: SECURITY DEFINER helpers pin search_path', async () => {
      const res = await client.query(`
        SELECT proname, proconfig FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public' AND p.prosecdef
           AND proname IN ('get_my_tenant_id','get_my_role','has_role')`)
      assert.ok(res.rows.length > 0, 'RLS helper functions missing')
      for (const fn of res.rows) {
        assert.ok(
          (fn.proconfig || []).some(c => c.startsWith('search_path=')),
          `${fn.proname} is SECURITY DEFINER with a mutable search_path (privilege-escalation vector)`
        )
      }
    })

    // ----------------------------------------------------------------
    // 1. Identity resolves — guards against the ghost-identity trap.
    // ----------------------------------------------------------------
    await t.test('POSITIVE CONTROL: each fixture identity actually resolves', async () => {
      for (const [name, uid] of Object.entries(U)) {
        const r = await asUser(client, uid, 'SELECT get_my_tenant_id() AS t')
        assert.ok(r.rows[0].t, `${name} (${uid}) resolved to NULL tenant — fixture identity does not exist`)
      }
    })

    // ----------------------------------------------------------------
    // 2. Cross-tenant reads: positive control THEN negative assertion.
    // ----------------------------------------------------------------
    await t.test('profiles: Acme employee sees own tenant (>0) and zero of Globex', async () => {
      const own = await asUser(client, U.aliceEmp,
        'SELECT count(*) FROM profiles WHERE tenant_id=$1', [T_ACME])
      assert.ok(count(own) > 0, 'POSITIVE CONTROL FAILED: sees none of her own tenant')

      const other = await asUser(client, U.aliceEmp,
        'SELECT count(*) FROM profiles WHERE tenant_id=$1', [T_GLOBEX])
      assert.equal(count(other), 0, 'LEAK: Acme employee read Globex profiles')
    })

    await t.test('attendance_records: employee sees only her own row, none of Globex', async () => {
      const own = await asUser(client, U.aliceEmp, 'SELECT count(*) FROM attendance_records')
      assert.ok(count(own) > 0, 'POSITIVE CONTROL FAILED: sees none of her own attendance')

      const other = await asUser(client, U.aliceEmp,
        'SELECT count(*) FROM attendance_records WHERE tenant_id=$1', [T_GLOBEX])
      assert.equal(count(other), 0, 'LEAK: cross-tenant attendance visible')
    })

    await t.test('reverse direction: Globex employee cannot read Acme', async () => {
      const own = await asUser(client, U.bobEmp,
        'SELECT count(*) FROM profiles WHERE tenant_id=$1', [T_GLOBEX])
      assert.ok(count(own) > 0, 'POSITIVE CONTROL FAILED: Bob sees none of Globex')

      const other = await asUser(client, U.bobEmp,
        'SELECT count(*) FROM profiles WHERE tenant_id=$1', [T_ACME])
      assert.equal(count(other), 0, 'LEAK: Globex employee read Acme profiles')
    })

    await t.test('HR sees own tenant roster but nothing cross-tenant', async () => {
      const own = await asUser(client, U.anitaHR,
        'SELECT count(*) FROM profiles WHERE tenant_id=$1', [T_ACME])
      assert.ok(count(own) >= 4, 'POSITIVE CONTROL FAILED: HR cannot see own roster')

      const other = await asUser(client, U.anitaHR,
        'SELECT count(*) FROM profiles WHERE tenant_id=$1', [T_GLOBEX])
      assert.equal(count(other), 0, 'LEAK: HR read another tenant')
    })

    // ----------------------------------------------------------------
    // 3. Privilege scoping — HR-only / ADMIN-only tables.
    // ----------------------------------------------------------------
    await t.test('attrition_risk_scores: HR sees rows, EMPLOYEE sees none', async () => {
      const hr = await asUser(client, U.anitaHR, 'SELECT count(*) FROM attrition_risk_scores')
      assert.ok(count(hr) > 0, 'POSITIVE CONTROL FAILED: HR cannot read attrition scores')

      const emp = await asUser(client, U.aliceEmp, 'SELECT count(*) FROM attrition_risk_scores')
      assert.equal(count(emp), 0, 'PRIVILEGE LEAK: employee read attrition scores')
    })

    await t.test('audit_log: ADMIN sees rows, EMPLOYEE sees none', async () => {
      const adm = await asUser(client, U.adamAdm, 'SELECT count(*) FROM audit_log')
      assert.ok(count(adm) > 0, 'POSITIVE CONTROL FAILED: admin cannot read audit_log')

      const emp = await asUser(client, U.aliceEmp, 'SELECT count(*) FROM audit_log')
      assert.equal(count(emp), 0, 'PRIVILEGE LEAK: employee read audit_log')
    })

    // ----------------------------------------------------------------
    // 4. Write-path escalation.
    // ----------------------------------------------------------------
    await t.test('ESCALATION: employee cannot promote herself to ADMIN', async () => {
      await asUser(client, U.aliceEmp,
        `UPDATE user_roles SET role='ADMIN' WHERE user_id=$1`, [U.aliceEmp])
      const after = await client.query('SELECT role FROM user_roles WHERE user_id=$1', [U.aliceEmp])
      assert.equal(after.rows[0].role, 'EMPLOYEE', 'ESCALATION: employee changed own role')
    })

    await t.test('ESCALATION: employee cannot insert a new ADMIN grant', async () => {
      await assert.rejects(
        () => asUser(client, U.aliceEmp,
          `INSERT INTO user_roles(user_id,tenant_id,role) VALUES($1,$2,'ADMIN')`,
          [U.aliceEmp, T_ACME]),
        /row-level security/i,
        'ESCALATION: employee inserted an ADMIN role grant'
      )
    })

    // Regression lock — this exact write was blocked only as a SIDE EFFECT of the
    // SELECT policy before 003_rls_hardening. It must now be refused outright.
    await t.test('REGRESSION LOCK: employee cannot rewrite her own profile.tenant_id', async () => {
      await asUser(client, U.aliceEmp,
        `UPDATE profiles SET tenant_id=$1 WHERE id=$2`, [T_GLOBEX, U.aliceEmp]).catch(() => {})
      const after = await client.query('SELECT tenant_id FROM profiles WHERE id=$1', [U.aliceEmp])
      assert.equal(after.rows[0].tenant_id, T_ACME, 'TENANT ESCALATION: profile tenant_id was rewritten')
    })

    // Regression lock — a user in two tenants with no claim resolved to whichever
    // row the heap returned first, reproducibly leaking the other tenant's roster.
    await t.test('REGRESSION LOCK: multi-tenant identity with no claim fails closed', async () => {
      await client.query(
        `INSERT INTO user_roles(user_id,tenant_id,role) VALUES($1,$2,'EMPLOYEE')
         ON CONFLICT (user_id,tenant_id) DO NOTHING`, [U.aliceEmp, T_GLOBEX])
      try {
        const noClaim = await asUser(client, U.aliceEmp, 'SELECT get_my_tenant_id() AS t')
        assert.equal(noClaim.rows[0].t, null,
          'AMBIGUOUS IDENTITY RESOLVED: multi-tenant user must fail closed without a tenant claim')

        const leak = await asUser(client, U.aliceEmp, 'SELECT count(*) FROM profiles')
        assert.equal(count(leak), 0, 'LEAK: ambiguous identity returned rows')

        // An explicit, genuinely-held claim still works.
        const withClaim = await asUser(client, U.aliceEmp,
          'SELECT get_my_tenant_id() AS t', [], T_ACME)
        assert.equal(withClaim.rows[0].t, T_ACME, 'valid tenant claim must resolve')
      } finally {
        await client.query('DELETE FROM user_roles WHERE user_id=$1 AND tenant_id=$2',
          [U.aliceEmp, T_GLOBEX])
      }
    })

    await t.test('REGRESSION LOCK: a forged tenant claim mints no access', async () => {
      const forged = await asUser(client, U.aliceEmp,
        'SELECT get_my_tenant_id() AS t', [], T_GLOBEX)
      assert.equal(forged.rows[0].t, null,
        'FORGED CLAIM HONOURED: claim for a non-member tenant must resolve to NULL')

      const rows = await asUser(client, U.aliceEmp,
        'SELECT count(*) FROM profiles WHERE tenant_id=$1', [T_GLOBEX], T_GLOBEX)
      assert.equal(count(rows), 0, 'LEAK: forged claim exposed another tenant')
    })
  } finally {
    await client.end()
  }
})
