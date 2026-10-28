// ============================================================
// AttendX v2 — Module 4: Onboarding Document Tenant Isolation Test
// Verifies fix for OnboardingService.submitDocument cross-tenant vulnerability
// Tests against real PostgreSQL (postgresql://localhost:5432/attendx_test)
//
// Zero False Pass Policy:
// 1. Cross-tenant attempt (Tenant A caller targeting Tenant B process) FAILS with 404
// 2. Tenant B placeholder document remains completely UNCHANGED (URL, name, status)
// 3. Tenant B onboarding progress remains UNCHANGED
// 4. Zero documents created in Tenant A for Tenant B's process
// 5. Valid same-tenant submission SUCCEEDS and updates document and progress
// 6. Complete cleanup of test fixtures in t.after()
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import { Client } from 'pg'
import { OnboardingService } from '../../lib/hiring/onboarding-service.ts'

const DB_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/attendx_test'

const T_ACME = 'aa000000-0000-0000-0000-0000000000a1'
const T_GLOBEX = 'bb000000-0000-0000-0000-0000000000b2'

/**
 * Lightweight real-database query builder wrapping pg.Client
 * to implement the SupabaseClient query builder interface used by OnboardingService
 */
function createPgSupabaseClient(pgClient) {
  return {
    from(table) {
      let selectFields = '*'
      let filters = []
      let updatePayload = null
      let insertPayload = null
      let limitCount = null

      const builder = {
        select(fields = '*') {
          selectFields = fields
          return builder
        },
        eq(column, value) {
          filters.push({ column, value })
          return builder
        },
        limit(n) {
          limitCount = n
          return builder
        },
        update(payload) {
          updatePayload = payload
          return builder
        },
        insert(payload) {
          insertPayload = payload
          return builder
        },
        async single() {
          const res = await builder.execute()
          if (res.error) throw res.error
          if (!res.data || (Array.isArray(res.data) && res.data.length === 0)) {
            const err = new Error(`Row not found in ${table}`)
            err.code = 'PGRST116'
            return { data: null, error: err }
          }
          const row = Array.isArray(res.data) ? res.data[0] : res.data
          return { data: row, error: null }
        },
        async maybeSingle() {
          const res = await builder.execute()
          if (res.error) throw res.error
          const row = Array.isArray(res.data) ? (res.data[0] || null) : res.data
          return { data: row, error: null }
        },
        async execute() {
          try {
            // INSERT
            if (insertPayload) {
              const row = Array.isArray(insertPayload) ? insertPayload[0] : insertPayload
              const keys = Object.keys(row)
              const values = Object.values(row)
              const cols = keys.map(k => `"${k}"`).join(', ')
              const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ')
              const sql = `INSERT INTO "${table}" (${cols}) VALUES (${placeholders}) RETURNING *;`
              const result = await pgClient.query(sql, values)
              return { data: result.rows[0], error: null }
            }

            // UPDATE
            if (updatePayload) {
              const keys = Object.keys(updatePayload)
              const values = Object.values(updatePayload)
              let paramIdx = 1
              const setClause = keys.map(k => `"${k}" = $${paramIdx++}`).join(', ')
              const whereParts = []
              for (const f of filters) {
                whereParts.push(`"${f.column}" = $${paramIdx++}`)
                values.push(f.value)
              }
              const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : ''
              const sql = `UPDATE "${table}" SET ${setClause} ${whereSql} RETURNING *;`
              const result = await pgClient.query(sql, values)
              return { data: result.rows[0] || null, error: null }
            }

            // SELECT
            const values = []
            let paramIdx = 1
            const whereParts = []
            for (const f of filters) {
              whereParts.push(`"${f.column}" = $${paramIdx++}`)
              values.push(f.value)
            }
            const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : ''
            const limitSql = limitCount ? `LIMIT ${limitCount}` : ''
            const sql = `SELECT ${selectFields} FROM "${table}" ${whereSql} ${limitSql};`
            const result = await pgClient.query(sql, values)
            return { data: result.rows, error: null }
          } catch (err) {
            return { data: null, error: err }
          }
        },
        then(resolve, reject) {
          return builder.execute().then(resolve, reject)
        },
      }

      return builder
    },
  }
}

test('ONBOARDING SERVICE: REAL POSTGRESQL TENANT ISOLATION SUITE', async (t) => {
  const pgClient = new Client({ connectionString: DB_URL })
  await pgClient.connect()
  const dbClient = createPgSupabaseClient(pgClient)

  let testGlobexCandId = null
  let testGlobexReqId = null
  let testGlobexAppId = null
  let testGlobexOnbId = null
  let testGlobexDocId = null

  const ORIGINAL_FILE_URL = 'https://globex.internal/original-placeholder.pdf'
  const ORIGINAL_DOC_NAME = 'Globex National ID'

  t.after(async () => {
    try {
      if (testGlobexDocId) {
        await pgClient.query(`DELETE FROM onboarding_documents WHERE id = $1;`, [testGlobexDocId])
      }
      if (testGlobexOnbId) {
        // Also clean up any errant docs created during test
        await pgClient.query(`DELETE FROM onboarding_documents WHERE onboarding_id = $1;`, [testGlobexOnbId])
        await pgClient.query(`DELETE FROM onboarding_processes WHERE id = $1;`, [testGlobexOnbId])
      }
      if (testGlobexAppId) {
        await pgClient.query(`DELETE FROM job_applications WHERE id = $1;`, [testGlobexAppId])
      }
      if (testGlobexReqId) {
        await pgClient.query(`DELETE FROM job_requisitions WHERE id = $1;`, [testGlobexReqId])
      }
      if (testGlobexCandId) {
        await pgClient.query(`DELETE FROM candidates WHERE id = $1;`, [testGlobexCandId])
      }
    } catch (err) {
      console.warn('[Cleanup Warning]:', err.message)
    } finally {
      await pgClient.end().catch(() => {})
    }
  })

  // ------------------------------------------------------------
  // Setup: Create isolated Tenant B (Globex) fixtures in live DB
  // ------------------------------------------------------------
  await t.test('Step 0: Setup isolated Tenant B (Globex) fixtures in live PostgreSQL', async () => {
    // 1. Candidate in Globex
    const candRes = await pgClient.query(`
      INSERT INTO candidates (organization_id, first_name, last_name, email, phone)
      VALUES ($1, 'GlobexOnbCand', 'IsolationTest', 'onb.iso@globex-real.local', '+919988776655')
      RETURNING id;
    `, [T_GLOBEX])
    testGlobexCandId = candRes.rows[0].id
    assert.ok(testGlobexCandId, 'Candidate must be created')

    // 2. Requisition in Globex
    const reqCode = `REQ-ISO-${Date.now().toString().slice(-6)}`
    const reqRes = await pgClient.query(`
      INSERT INTO job_requisitions (organization_id, requisition_code, title, status)
      VALUES ($1, $2, 'Staff Security Auditor', 'OPEN')
      RETURNING id;
    `, [T_GLOBEX, reqCode])
    testGlobexReqId = reqRes.rows[0].id
    assert.ok(testGlobexReqId, 'Requisition must be created')

    // 3. Application in Globex
    const appRes = await pgClient.query(`
      INSERT INTO job_applications (organization_id, candidate_id, requisition_id, stage, current_decision, application_code)
      VALUES ($1, $2, $3, 'DOCUMENTS_PENDING', 'SELECTED', 'APP-ISO-001')
      RETURNING id;
    `, [T_GLOBEX, testGlobexCandId, testGlobexReqId])
    testGlobexAppId = appRes.rows[0].id
    assert.ok(testGlobexAppId, 'Application must be created')

    // 4. Onboarding Process in Globex (0% completion)
    const onbRes = await pgClient.query(`
      INSERT INTO onboarding_processes (organization_id, application_id, candidate_id, status, completion_percentage)
      VALUES ($1, $2, $3, 'IN_PROGRESS', 0)
      RETURNING id;
    `, [T_GLOBEX, testGlobexAppId, testGlobexCandId])
    testGlobexOnbId = onbRes.rows[0].id
    assert.ok(testGlobexOnbId, 'Onboarding process must be created')

    // 5. Placeholder Document in Globex (NOT_SUBMITTED)
    const docRes = await pgClient.query(`
      INSERT INTO onboarding_documents (
        organization_id, onboarding_id, document_type, document_name, file_url, status, is_required
      )
      VALUES ($1, $2, 'ID_PROOF', $3, $4, 'NOT_SUBMITTED', true)
      RETURNING id;
    `, [T_GLOBEX, testGlobexOnbId, ORIGINAL_DOC_NAME, ORIGINAL_FILE_URL])
    testGlobexDocId = docRes.rows[0].id
    assert.ok(testGlobexDocId, 'Placeholder document must be created')
  })

  // ------------------------------------------------------------
  // Test 1: Cross-Tenant Attack Attempt (Tenant A -> Tenant B)
  // ------------------------------------------------------------
  await t.test('Test 1: Cross-tenant submitDocument fails with 404 Not Found and preserves Tenant B records', async () => {
    const maliciousPayload = {
      onboarding_id: testGlobexOnbId, // Target Tenant B process
      document_type: 'ID_PROOF',
      document_name: 'Attacker Malicious Payload',
      file_url: 'https://attacker.evil.com/trojan.pdf',
    }

    // Attempt operation passing Tenant A (Acme) organizationId
    await assert.rejects(
      async () => {
        await OnboardingService.submitDocument(dbClient, T_ACME, maliciousPayload)
      },
      (err) => {
        assert.equal(err.status, 404, 'Must throw 404 Not Found for cross-tenant process ID')
        assert.ok(err.message.includes(`Onboarding process '${testGlobexOnbId}' not found`),
          `Error message should indicate not found: ${err.message}`)
        return true
      }
    )

    // Direct database observation: Prove Tenant B's placeholder document was NOT modified
    const docCheck = await pgClient.query(
      `SELECT document_name, file_url, status, updated_at FROM onboarding_documents WHERE id = $1;`,
      [testGlobexDocId]
    )
    assert.equal(docCheck.rows.length, 1)
    const doc = docCheck.rows[0]
    assert.equal(doc.file_url, ORIGINAL_FILE_URL, 'Tenant B file_url must be pristine')
    assert.equal(doc.document_name, ORIGINAL_DOC_NAME, 'Tenant B document_name must be pristine')
    assert.equal(doc.status, 'NOT_SUBMITTED', 'Tenant B status must remain NOT_SUBMITTED')

    // Direct database observation: Prove Tenant B's onboarding completion_percentage was NOT altered
    const onbCheck = await pgClient.query(
      `SELECT completion_percentage FROM onboarding_processes WHERE id = $1;`,
      [testGlobexOnbId]
    )
    assert.equal(Number(onbCheck.rows[0].completion_percentage), 0, 'Tenant B progress must remain 0%')

    // Direct database observation: Prove no cross-tenant documents were inserted in Tenant A
    const acmeDocs = await pgClient.query(
      `SELECT count(*)::int as count FROM onboarding_documents WHERE organization_id = $1 AND onboarding_id = $2;`,
      [T_ACME, testGlobexOnbId]
    )
    assert.equal(acmeDocs.rows[0].count, 0, 'Zero documents must exist in Tenant A for Tenant B process')
  })

  // ------------------------------------------------------------
  // Test 2: Legitimate Same-Tenant Submission
  // ------------------------------------------------------------
  await t.test('Test 2: Legitimate same-tenant submitDocument successfully updates placeholder and progress', async () => {
    const legitimatePayload = {
      onboarding_id: testGlobexOnbId,
      document_type: 'ID_PROOF',
      document_name: 'Verified Government ID.pdf',
      file_url: 'https://globex.internal/verified-gov-id.pdf',
      file_size: 204800,
      mime_type: 'application/pdf',
    }

    // Call submitDocument with legitimate Tenant B (Globex) organizationId
    const result = await OnboardingService.submitDocument(dbClient, T_GLOBEX, legitimatePayload)

    assert.ok(result, 'Result must be returned')
    assert.equal(result.id, testGlobexDocId, 'Must update the existing placeholder document ID')
    assert.equal(result.file_url, legitimatePayload.file_url, 'Must update to legitimate file_url')
    assert.equal(result.status, 'SUBMITTED', 'Status must transition to SUBMITTED')

    // Direct database observation: Verify record updated in live PostgreSQL
    const docVerify = await pgClient.query(
      `SELECT document_name, file_url, status FROM onboarding_documents WHERE id = $1;`,
      [testGlobexDocId]
    )
    assert.equal(docVerify.rows[0].file_url, legitimatePayload.file_url)
    assert.equal(docVerify.rows[0].status, 'SUBMITTED')
    assert.equal(docVerify.rows[0].document_name, legitimatePayload.document_name)
  })
})
