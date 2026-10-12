// ============================================================
// AttendX v2 — Module 4.4: Real PostgreSQL Database Voice Calling Test Suite
// Executes against live PostgreSQL (postgresql://localhost:5432/attendx_test)
// Tests:
//   1. Live schema structure & column verification for public.ai_voice_calls
//   2. Real foreign key persistence with candidates and job_requisitions
//   3. Database CHECK constraints on status ('INITIATED', 'IN_PROGRESS', 'COMPLETED', 'BUSY', 'NO_ANSWER', 'FAILED')
//   4. Database CHECK constraints on call_purpose ('SCREENING', 'SCHEDULING', 'FOLLOW_UP')
//   5. Database CHECK constraints on sentiment ('POSITIVE', 'NEUTRAL', 'NEGATIVE')
//   6. Real Row-Level Security (RLS) Tenant Isolation (Positive Controls Mandatory)
//   7. Audit logging persistence in hiring_audit_logs
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import { Client } from 'pg'

const DB_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/attendx_test'

const T_ACME = 'aa000000-0000-0000-0000-0000000000a1'
const T_GLOBEX = 'bb000000-0000-0000-0000-0000000000b2'

const U = {
  anitaHR: 'a0000003-0000-0000-0000-000000000003',
  biancaHR: 'b0000003-0000-0000-0000-000000000003',
}

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

test('MODULE 4.4 — REAL DATABASE VOICE AI & RLS VERIFICATION', async (t) => {
  const client = new Client({ connectionString: DB_URL, connectionTimeoutMillis: 5000 })
  await client.connect()

  let testCandidateId = null
  let testRequisitionId = null
  let testVoiceCallId = null

  t.after(async () => {
    try {
      if (testVoiceCallId) {
        await client.query(`DELETE FROM public.ai_voice_calls WHERE id = $1`, [testVoiceCallId])
      }
      if (testCandidateId) {
        await client.query(`DELETE FROM public.candidates WHERE id = $1`, [testCandidateId])
      }
      if (testRequisitionId) {
        await client.query(`DELETE FROM public.job_requisitions WHERE id = $1`, [testRequisitionId])
      }
    } catch (e) {
      console.warn('Cleanup warning:', e.message)
    } finally {
      await client.end()
    }
  })

  // 1. Live schema column verification
  await t.test('1. Schema: ai_voice_calls table exists with required columns and constraints', async () => {
    const { rows } = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ai_voice_calls'
      ORDER BY ordinal_position
    `)

    assert.ok(rows.length > 10, 'ai_voice_calls table must have schema definition')
    const cols = rows.map((r) => r.column_name)

    const requiredCols = [
      'id',
      'organization_id',
      'candidate_id',
      'requisition_id',
      'call_provider',
      'provider_call_id',
      'phone_number',
      'call_purpose',
      'status',
      'duration_seconds',
      'transcript',
      'ai_summary',
      'overall_score',
      'sentiment',
      'extracted_data',
      'created_at',
      'updated_at',
    ]

    for (const c of requiredCols) {
      assert.ok(cols.includes(c), `Missing required column: ${c}`)
    }
  })

  // 2. Setup Test Fixtures for Foreign Keys
  await t.test('2. Setup test candidate and requisition fixtures in Acme tenant', async () => {
    const code = `REQ-VOICE-${Date.now().toString().slice(-4)}`
    const reqRes = await client.query(`
      INSERT INTO public.job_requisitions (
        organization_id, requisition_code, title, status, min_experience_years
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [T_ACME, code, 'Senior Voice AI Architect', 'OPEN', 5])
    testRequisitionId = reqRes.rows[0].id
    assert.ok(testRequisitionId)

    const candRes = await client.query(`
      INSERT INTO public.candidates (
        organization_id, first_name, last_name, email, phone, consent_status, source
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [T_ACME, 'Rajesh', 'Kumar', `rajesh.${Date.now()}@example.com`, '+919876543210', 'GIVEN', 'LINKEDIN'])
    testCandidateId = candRes.rows[0].id
    assert.ok(testCandidateId)
  })

  // 3. Database Check Constraint on Status
  await t.test('3. Constraint: status accepts valid lifecycle states and rejects invalid', async () => {
    // Valid status: INITIATED
    const validRes = await client.query(`
      INSERT INTO public.ai_voice_calls (
        organization_id, candidate_id, requisition_id, call_provider,
        provider_call_id, phone_number, call_purpose, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, status
    `, [T_ACME, testCandidateId, testRequisitionId, 'MOCK', `call_${Date.now()}`, '+919876543210', 'SCREENING', 'INITIATED'])

    assert.equal(validRes.rows[0].status, 'INITIATED')
    testVoiceCallId = validRes.rows[0].id

    // Invalid status: should violate check constraint
    await assert.rejects(
      async () => {
        await client.query(`
          INSERT INTO public.ai_voice_calls (
            organization_id, candidate_id, requisition_id, call_provider,
            provider_call_id, phone_number, call_purpose, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [T_ACME, testCandidateId, testRequisitionId, 'MOCK', `call_bad_${Date.now()}`, '+919876543210', 'SCREENING', 'INVALID_STATUS'])
      },
      (err) => err.code === '23514' // check_violation
    )
  })

  // 4. Database Check Constraint on Call Purpose
  await t.test('4. Constraint: call_purpose accepts SCREENING, SCHEDULING, FOLLOW_UP and rejects others', async () => {
    // Valid purpose
    const schedRes = await client.query(`
      INSERT INTO public.ai_voice_calls (
        organization_id, candidate_id, requisition_id, call_provider,
        provider_call_id, phone_number, call_purpose, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, call_purpose
    `, [T_ACME, testCandidateId, testRequisitionId, 'MOCK', `call_sched_${Date.now()}`, '+919876543210', 'SCHEDULING', 'INITIATED'])
    assert.equal(schedRes.rows[0].call_purpose, 'SCHEDULING')
    await client.query(`DELETE FROM public.ai_voice_calls WHERE id = $1`, [schedRes.rows[0].id])

    // Invalid purpose
    await assert.rejects(
      async () => {
        await client.query(`
          INSERT INTO public.ai_voice_calls (
            organization_id, candidate_id, requisition_id, call_provider,
            provider_call_id, phone_number, call_purpose, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [T_ACME, testCandidateId, testRequisitionId, 'MOCK', `call_bad_${Date.now()}`, '+919876543210', 'COLD_CALL', 'INITIATED'])
      },
      (err) => err.code === '23514' // check_violation
    )
  })

  // 5. Database Check Constraint on Sentiment
  await t.test('5. Constraint: sentiment accepts POSITIVE, NEUTRAL, NEGATIVE and rejects others', async () => {
    const updateRes = await client.query(`
      UPDATE public.ai_voice_calls
      SET status = 'COMPLETED',
          duration_seconds = 240,
          sentiment = 'POSITIVE',
          overall_score = 90
      WHERE id = $1
      RETURNING sentiment, overall_score
    `, [testVoiceCallId])
    assert.equal(updateRes.rows[0].sentiment, 'POSITIVE')

    // Invalid sentiment
    await assert.rejects(
      async () => {
        await client.query(`
          UPDATE public.ai_voice_calls
          SET sentiment = 'ECSTATIC'
          WHERE id = $1
        `, [testVoiceCallId])
      },
      (err) => err.code === '23514'
    )
  })

  // 6. Real PostgreSQL RLS Tenant Isolation (Positive Controls Mandatory)
  await t.test('6. RLS: Acme HR can view Acme voice calls; Globex HR CANNOT see Acme calls', async () => {
    // Acme HR (Positive Control)
    const acmeRes = await asUser(
      client,
      U.anitaHR,
      `SELECT id, status, call_purpose FROM public.ai_voice_calls WHERE id = $1`,
      [testVoiceCallId],
      T_ACME
    )
    assert.equal(acmeRes.rows.length, 1, 'Positive control: Anita (Acme HR) must see Acme voice call')
    assert.equal(acmeRes.rows[0].id, testVoiceCallId)

    // Globex HR (Negative Control - Tenant Isolation)
    const globexRes = await asUser(
      client,
      U.biancaHR,
      `SELECT id FROM public.ai_voice_calls WHERE id = $1`,
      [testVoiceCallId],
      T_GLOBEX
    )
    assert.equal(globexRes.rows.length, 0, 'Negative control: Bianca (Globex HR) must NOT see Acme voice call')

    // Globex HR cannot update Acme call
    const globexUpd = await asUser(
      client,
      U.biancaHR,
      `UPDATE public.ai_voice_calls SET status = 'FAILED' WHERE id = $1 RETURNING id`,
      [testVoiceCallId],
      T_GLOBEX
    )
    assert.equal(globexUpd.rows.length, 0, 'Negative control: Bianca cannot update Acme voice call')
  })

  // 7. Audit log insertion
  await t.test('7. Audit Logging: hiring_audit_logs accepts VOICE_CALL_INITIATED record', async () => {
    const auditRes = await client.query(`
      INSERT INTO public.hiring_audit_logs (
        organization_id, user_id, action, entity_type, entity_id, new_values
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, action
    `, [
      T_ACME,
      U.anitaHR,
      'VOICE_CALL_INITIATED',
      'ai_voice_calls',
      testVoiceCallId,
      JSON.stringify({ provider: 'MOCK', phone: '+919876543210' }),
    ])

    assert.equal(auditRes.rows[0].action, 'VOICE_CALL_INITIATED')
    await client.query(`DELETE FROM public.hiring_audit_logs WHERE id = $1`, [auditRes.rows[0].id])
  })
})
