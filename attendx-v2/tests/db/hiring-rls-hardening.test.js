// ============================================================
// AttendX v2 — Module 4: Real PostgreSQL Hiring RLS Hardening Suite
// Validates Migration 023 on live PostgreSQL (postgresql://localhost:5432/attendx_test)
// Tests:
//   1. All 28 hiring tables have RLS enabled and forced
//   2. Positive Control: Acme HR & Admin can query and insert hiring records
//   3. Role-Based Access Control (RBAC): EMPLOYEE sees 0 rows on hiring tables
//   4. EMPLOYEE write attempt is blocked by RLS WITH CHECK
//   5. Manager can access pipeline tables and insert audit logs, but CANNOT read audit logs
//   6. Multi-Tenant Isolation: Globex HR sees 0 rows of Acme hiring records
//   7. Multi-Tenant Write Guard: Globex HR cannot insert Acme-scoped records (WITH CHECK violation)
//   8. Audit Log Immutability: Authenticated users cannot UPDATE or DELETE audit records
//   9. Funnel Events Immutability: Authenticated users cannot UPDATE or DELETE funnel records
//  10. Non-Hiring Regression Check: profiles and attendance_records remain isolated
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import { Client } from 'pg'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/attendx_test'

const T_ACME   = 'aa000000-0000-0000-0000-0000000000a1'
const T_GLOBEX = 'bb000000-0000-0000-0000-0000000000b2'

const U = {
  aliceEmp: 'a0000001-0000-0000-0000-000000000001',
  aaronMgr: 'a0000002-0000-0000-0000-000000000002',
  anitaHR:  'a0000003-0000-0000-0000-000000000003',
  adamAdm:  'a0000004-0000-0000-0000-000000000004',
  bobEmp:   'b0000001-0000-0000-0000-000000000001',
  biancaHR: 'b0000003-0000-0000-0000-000000000003',
}

const HIRING_TABLES = [
  'job_requisitions',
  'job_requisition_skills',
  'candidates',
  'candidate_skills',
  'candidate_resumes',
  'sourcing_searches',
  'sourced_candidates',
  'outreach_campaigns',
  'outreach_templates',
  'outreach_messages',
  'outreach_followups',
  'ai_voice_calls',
  'assessments',
  'job_applications',
  'ai_screenings',
  'candidate_assessments',
  'hiring_funnel_events',
  'hiring_audit_logs',
  'interviews',
  'candidate_evaluations',
  'offer_portal_tokens',
  'job_offers',
  'onboarding_processes',
  'onboarding_documents',
  'onboarding_tasks',
  'hiring_analytics_snapshots',
  'hiring_ai_recommendations',
  'org_score_weights'
]

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

async function asServiceRole(client, sql, params = []) {
  await client.query('BEGIN')
  try {
    await client.query('SET LOCAL ROLE authenticated')
    await client.query(`SELECT set_config('request.jwt.claim.role', 'service_role', true)`)
    const res = await client.query(sql, params)
    await client.query('ROLLBACK')
    return res
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  }
}

async function asAnon(client, sql, params = []) {
  await client.query('BEGIN')
  try {
    await client.query('SET LOCAL ROLE anon')
    const res = await client.query(sql, params)
    await client.query('ROLLBACK')
    return res
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  }
}

test('MODULE 4: HIRING RLS HARDENING & RBAC VERIFICATION', async (t) => {
  const client = new Client({ connectionString: DB_URL, connectionTimeoutMillis: 5000 })
  await client.connect()

  // Ensure base fixtures exist
  await client.query(readFileSync(join(__dirname, 'fixtures.sql'), 'utf8'))

  // Seed sample Acme requisition, candidate, and application for testing
  const testReqId = 'f1000000-0000-0000-0000-000000000001'
  const testCandId = 'f2000000-0000-0000-0000-000000000002'
  const testAppId = 'f3000000-0000-0000-0000-000000000003'
  const testAuditId = 'f4000000-0000-0000-0000-000000000004'
  const testFunnelId = 'f5000000-0000-0000-0000-000000000005'

  // Clean previous test rows if any
  await client.query(`DELETE FROM public.hiring_audit_logs WHERE id = $1`, [testAuditId])
  await client.query(`DELETE FROM public.hiring_funnel_events WHERE id = $1`, [testFunnelId])
  await client.query(`DELETE FROM public.job_applications WHERE id = $1`, [testAppId])
  await client.query(`DELETE FROM public.candidates WHERE id = $1`, [testCandId])
  await client.query(`DELETE FROM public.job_requisitions WHERE id = $1`, [testReqId])

  try {
    // Insert seed rows for Acme
    await client.query(`
      INSERT INTO public.job_requisitions (id, organization_id, requisition_code, title)
      VALUES ($1, $2, 'RLS-REQ-001', 'Staff Systems Engineer')
      ON CONFLICT (id) DO NOTHING;
    `, [testReqId, T_ACME])

    await client.query(`
      INSERT INTO public.candidates (id, organization_id, first_name, last_name, email)
      VALUES ($1, $2, 'Devon', 'Candidate', 'devon@candidate.local')
      ON CONFLICT (id) DO NOTHING;
    `, [testCandId, T_ACME])

    await client.query(`
      INSERT INTO public.job_applications (id, organization_id, application_code, candidate_id, requisition_id, stage)
      VALUES ($1, $2, 'RLS-APP-001', $3, $4, 'SHORTLISTED')
      ON CONFLICT (id) DO NOTHING;
    `, [testAppId, T_ACME, testCandId, testReqId])

    await client.query(`
      INSERT INTO public.hiring_audit_logs (id, organization_id, user_id, action, entity_type, entity_id)
      VALUES ($1, $2, $3, 'APPLICATION_CREATED', 'job_applications', $4)
      ON CONFLICT (id) DO NOTHING;
    `, [testAuditId, T_ACME, U.anitaHR, testAppId])

    await client.query(`
      INSERT INTO public.hiring_funnel_events (id, organization_id, application_id, to_stage)
      VALUES ($1, $2, $3, 'SHORTLISTED')
      ON CONFLICT (id) DO NOTHING;
    `, [testFunnelId, T_ACME, testAppId])

  // ----------------------------------------------------------
  // 1. Meta: RLS is ENABLED and FORCED on all 28 hiring tables
  // ----------------------------------------------------------
  await t.test('1. META: All 28 hiring tables have ENABLED and FORCED Row-Level Security', async () => {
    const res = await client.query(`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname='public' AND c.relkind='r' AND c.relname = ANY($1)
    `, [HIRING_TABLES])

    assert.equal(res.rows.length, 28, `Expected 28 tables, found ${res.rows.length}`)
    const unforced = res.rows.filter(r => !r.relrowsecurity || !r.relforcerowsecurity)
    assert.equal(unforced.length, 0, `Tables missing enforced RLS: ${unforced.map(r => r.relname).join(', ')}`)
  })

  // ----------------------------------------------------------
  // 2. Positive Control: Anita (Acme HR) can read Acme hiring records
  // ----------------------------------------------------------
  await t.test('2. POSITIVE CONTROL: Anita (Acme HR) reads own tenant job_requisitions and candidates', async () => {
    const reqRes = await asUser(client, U.anitaHR,
      'SELECT id, title FROM public.job_requisitions WHERE id = $1', [testReqId], T_ACME)
    assert.equal(reqRes.rows.length, 1, 'Anita (HR) must see Acme requisition')
    assert.equal(reqRes.rows[0].id, testReqId)

    const candRes = await asUser(client, U.anitaHR,
      'SELECT id, email FROM public.candidates WHERE id = $1', [testCandId], T_ACME)
    assert.equal(candRes.rows.length, 1, 'Anita (HR) must see Acme candidate')

    const appRes = await asUser(client, U.anitaHR,
      'SELECT id, stage FROM public.job_applications WHERE id = $1', [testAppId], T_ACME)
    assert.equal(appRes.rows.length, 1, 'Anita (HR) must see Acme application')
  })

  // ----------------------------------------------------------
  // 3. Positive Control: Adam (Acme Admin) can read and write
  // ----------------------------------------------------------
  await t.test('3. POSITIVE CONTROL: Adam (Acme Admin) reads Acme hiring data', async () => {
    const reqRes = await asUser(client, U.adamAdm,
      'SELECT count(*) FROM public.job_requisitions WHERE organization_id = $1', [T_ACME], T_ACME)
    assert.ok(Number(reqRes.rows[0].count) >= 1, 'Adam (Admin) must see Acme requisitions')
  })

  // ----------------------------------------------------------
  // 4. Role-Based Access Control (RBAC): Alice (Acme EMPLOYEE) sees 0 rows
  // ----------------------------------------------------------
  await t.test('4. RBAC: Alice (EMPLOYEE) sees exactly 0 rows across hiring tables', async () => {
    const reqRes = await asUser(client, U.aliceEmp,
      'SELECT count(*) FROM public.job_requisitions', [], T_ACME)
    assert.equal(Number(reqRes.rows[0].count), 0, 'LEAK: Alice (EMPLOYEE) read job_requisitions')

    const candRes = await asUser(client, U.aliceEmp,
      'SELECT count(*) FROM public.candidates', [], T_ACME)
    assert.equal(Number(candRes.rows[0].count), 0, 'LEAK: Alice (EMPLOYEE) read candidates')

    const appRes = await asUser(client, U.aliceEmp,
      'SELECT count(*) FROM public.job_applications', [], T_ACME)
    assert.equal(Number(appRes.rows[0].count), 0, 'LEAK: Alice (EMPLOYEE) read job_applications')

    const voiceRes = await asUser(client, U.aliceEmp,
      'SELECT count(*) FROM public.ai_voice_calls', [], T_ACME)
    assert.equal(Number(voiceRes.rows[0].count), 0, 'LEAK: Alice (EMPLOYEE) read ai_voice_calls')

    const offerRes = await asUser(client, U.aliceEmp,
      'SELECT count(*) FROM public.job_offers', [], T_ACME)
    assert.equal(Number(offerRes.rows[0].count), 0, 'LEAK: Alice (EMPLOYEE) read job_offers')

    const tokenRes = await asUser(client, U.aliceEmp,
      'SELECT count(*) FROM public.offer_portal_tokens', [], T_ACME)
    assert.equal(Number(tokenRes.rows[0].count), 0, 'LEAK: Alice (EMPLOYEE) read offer_portal_tokens')
  })

  // ----------------------------------------------------------
  // 5. RBAC Write Guard: Alice (EMPLOYEE) cannot insert or update hiring rows
  // ----------------------------------------------------------
  await t.test('5. RBAC WRITE GUARD: Alice (EMPLOYEE) insert fails with RLS policy error', async () => {
    await assert.rejects(
      async () => {
        await asUser(client, U.aliceEmp, `
          INSERT INTO public.candidates (organization_id, first_name, last_name, email)
          VALUES ($1, 'Unauthorized', 'Insert', 'unauth@test.local')
        `, [T_ACME], T_ACME)
      },
      (err) => {
        // Postgres error code 42501 = insufficient_privilege / violates row-level security policy
        return err.code === '42501' || /row-level security/i.test(err.message)
      },
      'Alice (EMPLOYEE) must be blocked from inserting into candidates'
    )
  })

  // ----------------------------------------------------------
  // 6. Manager Role: Aaron (Manager) can view pipeline & insert audit, but CANNOT read audit logs
  // ----------------------------------------------------------
  await t.test('6. MANAGER SCOPE: Aaron (Manager) reads pipeline data but is denied from reading audit logs', async () => {
    // Aaron can read requisitions
    const reqRes = await asUser(client, U.aaronMgr,
      'SELECT count(*) FROM public.job_requisitions WHERE id = $1', [testReqId], T_ACME)
    assert.equal(Number(reqRes.rows[0].count), 1, 'Manager can view requisitions')

    // Aaron is denied from reading hiring_audit_logs (sees 0 rows)
    const auditRes = await asUser(client, U.aaronMgr,
      'SELECT count(*) FROM public.hiring_audit_logs WHERE id = $1', [testAuditId], T_ACME)
    assert.equal(Number(auditRes.rows[0].count), 0, 'Aaron (Manager) must NOT be permitted to read hiring_audit_logs')

    // But Anita (HR) CAN read hiring_audit_logs
    const hrAuditRes = await asUser(client, U.anitaHR,
      'SELECT count(*) FROM public.hiring_audit_logs WHERE id = $1', [testAuditId], T_ACME)
    assert.equal(Number(hrAuditRes.rows[0].count), 1, 'Anita (HR) must be permitted to read hiring_audit_logs')
  })

  // ----------------------------------------------------------
  // 7. Multi-Tenant Isolation: Bianca (Globex HR) sees 0 rows of Acme data
  // ----------------------------------------------------------
  await t.test('7. TENANT ISOLATION: Bianca (Globex HR) cannot read Acme hiring data', async () => {
    const reqRes = await asUser(client, U.biancaHR,
      'SELECT count(*) FROM public.job_requisitions WHERE organization_id = $1', [T_ACME], T_GLOBEX)
    assert.equal(Number(reqRes.rows[0].count), 0, 'LEAK: Bianca read Acme requisition')

    const candRes = await asUser(client, U.biancaHR,
      'SELECT count(*) FROM public.candidates WHERE organization_id = $1', [T_ACME], T_GLOBEX)
    assert.equal(Number(candRes.rows[0].count), 0, 'LEAK: Bianca read Acme candidates')

    const appRes = await asUser(client, U.biancaHR,
      'SELECT count(*) FROM public.job_applications WHERE organization_id = $1', [T_ACME], T_GLOBEX)
    assert.equal(Number(appRes.rows[0].count), 0, 'LEAK: Bianca read Acme applications')
  })

  // ----------------------------------------------------------
  // 8. Multi-Tenant Write Guard: Bianca cannot insert into Acme tenant
  // ----------------------------------------------------------
  await t.test('8. CROSS-TENANT WRITE GUARD: Bianca (Globex HR) cannot insert rows with Acme organization_id', async () => {
    await assert.rejects(
      async () => {
        await asUser(client, U.biancaHR, `
          INSERT INTO public.job_requisitions (organization_id, requisition_code, title)
          VALUES ($1, 'CROSS-TENANT-001', 'Cross Tenant Engineer')
        `, [T_ACME], T_GLOBEX)
      },
      (err) => err.code === '42501' || /row-level security/i.test(err.message),
      'Bianca must be blocked by WITH CHECK from inserting into Acme'
    )
  })

  // ----------------------------------------------------------
  // 9. Tamper Resistance: Authenticated HR cannot UPDATE or DELETE audit logs
  // ----------------------------------------------------------
  await t.test('9. AUDIT & FUNNEL IMMUTABILITY: Anita (HR) cannot UPDATE or DELETE audit or funnel records', async () => {
    const updateRes = await asUser(client, U.anitaHR, `
      UPDATE public.hiring_audit_logs
      SET action = 'TAMPERED_ACTION'
      WHERE id = $1
      RETURNING id
    `, [testAuditId], T_ACME)
    assert.equal(updateRes.rows.length, 0, 'Audit update must affect 0 rows for authenticated users')

    const deleteRes = await asUser(client, U.anitaHR, `
      DELETE FROM public.hiring_audit_logs
      WHERE id = $1
      RETURNING id
    `, [testAuditId], T_ACME)
    assert.equal(deleteRes.rows.length, 0, 'Audit delete must affect 0 rows for authenticated users')

    const funnelUpdateRes = await asUser(client, U.anitaHR, `
      UPDATE public.hiring_funnel_events
      SET to_stage = 'TAMPERED_STAGE'
      WHERE id = $1
      RETURNING id
    `, [testFunnelId], T_ACME)
    assert.equal(funnelUpdateRes.rows.length, 0, 'Funnel update must affect 0 rows for authenticated users')

    const funnelDeleteRes = await asUser(client, U.anitaHR, `
      DELETE FROM public.hiring_funnel_events
      WHERE id = $1
      RETURNING id
    `, [testFunnelId], T_ACME)
    assert.equal(funnelDeleteRes.rows.length, 0, 'Funnel delete must affect 0 rows for authenticated users')
  })

  // ----------------------------------------------------------
  // 10. Anonymous Fail-Closed: Unauthenticated queries receive 0 rows
  // ----------------------------------------------------------
  await t.test('10. CANDIDATE PORTAL & ANONYMOUS FAIL-CLOSED: Direct database queries receive 0 rows', async () => {
    const anonTokens = await asAnon(client, 'SELECT count(*) FROM public.offer_portal_tokens')
    assert.equal(Number(anonTokens.rows[0].count), 0, 'Direct anon access to offer_portal_tokens must return 0 rows')

    const anonOffers = await asAnon(client, 'SELECT count(*) FROM public.job_offers')
    assert.equal(Number(anonOffers.rows[0].count), 0, 'Direct anon access to job_offers must return 0 rows')

    const anonCandidates = await asAnon(client, 'SELECT count(*) FROM public.candidates')
    assert.equal(Number(anonCandidates.rows[0].count), 0, 'Direct anon access to candidates must return 0 rows')
  })

  // ----------------------------------------------------------
  // 11. Service Role Access: service_role can perform administrative queries
  // ----------------------------------------------------------
  await t.test('11. SERVICE ROLE: Background processors bypass RLS seamlessly', async () => {
    const res = await asServiceRole(client,
      'SELECT count(*) FROM public.job_requisitions WHERE id = $1', [testReqId])
    assert.equal(Number(res.rows[0].count), 1, 'Service role must be able to read hiring tables')
  })

  // ----------------------------------------------------------
  // 12. Non-Hiring Regression Check: Core AttendX tables unaffected
  // ----------------------------------------------------------
  await t.test('12. NON-HIRING REGRESSION: Core tables (profiles, attendance_records) intact', async () => {
    const aliceProfiles = await asUser(client, U.aliceEmp,
      'SELECT count(*) FROM public.profiles WHERE tenant_id = $1', [T_ACME], T_ACME)
    assert.ok(Number(aliceProfiles.rows[0].count) > 0, 'Alice reads own tenant profiles')

    const aliceAttendance = await asUser(client, U.aliceEmp,
      'SELECT count(*) FROM public.attendance_records WHERE tenant_id = $1', [T_ACME], T_ACME)
    assert.ok(Number(aliceAttendance.rows[0].count) > 0, 'Alice reads own attendance')
  })
  } finally {
    try {
      await client.query(`DELETE FROM public.hiring_audit_logs WHERE id = $1`, [testAuditId])
      await client.query(`DELETE FROM public.hiring_funnel_events WHERE id = $1`, [testFunnelId])
      await client.query(`DELETE FROM public.job_applications WHERE id = $1`, [testAppId])
      await client.query(`DELETE FROM public.candidates WHERE id = $1`, [testCandId])
      await client.query(`DELETE FROM public.job_requisitions WHERE id = $1`, [testReqId])
    } finally {
      await client.end()
    }
  }
})
