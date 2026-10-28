// ============================================================
// AttendX v2 — Module 4: Real Database Sourcing Requisition Eligibility Suite
// Executes against live PostgreSQL (postgresql://localhost:5432/attendx_test)
// Verifies Defect 1 Fixes & Persistence Constraints:
//   1. Shortlisting into an OPEN requisition succeeds & persists in job_applications
//   2. PostgreSQL enforces composite uniqueness (candidate_id, requisition_id)
//   3. Shortlisting into a DRAFT requisition is rejected with 400
//   4. Shortlisting into a FILLED or CANCELLED requisition is rejected with 400
//   5. Shortlisting into a foreign tenant's requisition is rejected with 404 (IDOR)
//   6. Shortlisting into a non-existent requisition is rejected with 404
//   7. Live DB confirms zero application records created for rejected attempts
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import { Client } from 'pg'
import { ApplicationService } from '../../lib/hiring/application-service.ts'

const DB_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/attendx_test'

const T_ACME = 'aa000000-0000-0000-0000-0000000000a1'
const T_GLOBEX = 'bb000000-0000-0000-0000-0000000000b2'

const U_ACME_HR = 'a0000003-0000-0000-0000-000000000003'

function createPgSupabaseAdapter(pgClient) {
  return {
    from(table) {
      let selects = '*'
      let filters = []
      const builder = {
        select(cols) {
          selects = cols || '*'
          return builder
        },
        eq(col, val) {
          filters.push({ col, val })
          return builder
        },
        maybeSingle: async () => {
          const whereParts = filters.map((f, i) => `"${f.col}" = $${i + 1}`)
          const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : ''
          const sql = `SELECT ${selects} FROM "${table}" ${where} LIMIT 1`
          const res = await pgClient.query(sql, filters.map(f => f.val))
          return { data: res.rows[0] || null, error: null }
        },
        single: async () => {
          const whereParts = filters.map((f, i) => `"${f.col}" = $${i + 1}`)
          const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : ''
          const sql = `SELECT * FROM "${table}" ${where} LIMIT 1`
          const res = await pgClient.query(sql, filters.map(f => f.val))
          if (!res.rows[0]) {
            return { data: null, error: { message: 'Not found', code: 'PGRST116' } }
          }
          const row = res.rows[0]
          if (table === 'job_applications') {
            const candRes = await pgClient.query('SELECT * FROM candidates WHERE id = $1', [row.candidate_id])
            const reqRes = await pgClient.query('SELECT * FROM job_requisitions WHERE id = $1', [row.requisition_id])
            row.candidate = candRes.rows[0] || null
            row.requisition = reqRes.rows[0] || null
          }
          return { data: row, error: null }
        },
        insert: (data) => {
          const rows = Array.isArray(data) ? data : [data]
          return {
            select: () => ({
              single: async () => {
                const row = rows[0]
                const cols = Object.keys(row)
                const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
                const colNames = cols.map(c => `"${c}"`).join(', ')
                const sql = `INSERT INTO "${table}" (${colNames}) VALUES (${placeholders}) RETURNING *`
                const res = await pgClient.query(sql, Object.values(row))
                return { data: res.rows[0], error: null }
              }
            })
          }
        }
      }
      return builder
    }
  }
}

test('MODULE 4: REAL DATABASE SOURCING REQUISITION ELIGIBILITY SUITE', async (t) => {
  const pgClient = new Client({ connectionString: DB_URL, connectionTimeoutMillis: 5000 })
  await pgClient.connect()

  const adapter = createPgSupabaseAdapter(pgClient)

  let openReqId = null
  let draftReqId = null
  let filledReqId = null
  let cancelledReqId = null
  let globexReqId = null
  let candidateId = null
  let createdAppId = null

  t.after(async () => {
    // Cleanup created records
    if (createdAppId) {
      await pgClient.query('DELETE FROM job_applications WHERE id = $1', [createdAppId]).catch(() => {})
    }
    if (candidateId) {
      await pgClient.query('DELETE FROM candidates WHERE id = $1', [candidateId]).catch(() => {})
    }
    const reqIds = [openReqId, draftReqId, filledReqId, cancelledReqId, globexReqId].filter(Boolean)
    if (reqIds.length > 0) {
      await pgClient.query('DELETE FROM job_requisitions WHERE id = ANY($1)', [reqIds]).catch(() => {})
    }
    await pgClient.end()
  })

  // Fixture Setup
  const ts = Date.now().toString().slice(-6)

  // 1. Candidate in Acme
  const candRes = await pgClient.query(`
    INSERT INTO candidates (
      organization_id, first_name, last_name, email, phone,
      current_company, current_designation, total_experience_years, source
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9
    ) RETURNING id
  `, [
    T_ACME, 'E2E', `Candidate-${ts}`, `e2e.cand.${ts}@attendx.test`, `+9198765${ts.slice(-5)}`,
    'Test Tech', 'Staff Engineer', 7, 'SOURCING_LINKEDIN'
  ])
  candidateId = candRes.rows[0].id
  assert.ok(candidateId)

  // 2. Requisitions
  // 2a. Acme OPEN
  const openRes = await pgClient.query(`
    INSERT INTO job_requisitions (
      organization_id, requisition_code, title, status, priority,
      openings_count, min_experience_years, max_experience_years,
      location, employment_type, job_description
    ) VALUES ($1, $2, $3, 'OPEN', 'HIGH', 1, 5, 8, 'Remote', 'FULL_TIME', 'Desc')
    RETURNING id
  `, [T_ACME, `REQ-O-${ts}`, 'Staff Platform Engineer'])
  openReqId = openRes.rows[0].id

  // 2b. Acme DRAFT
  const draftRes = await pgClient.query(`
    INSERT INTO job_requisitions (
      organization_id, requisition_code, title, status, priority,
      openings_count, min_experience_years, max_experience_years,
      location, employment_type, job_description
    ) VALUES ($1, $2, $3, 'DRAFT', 'MEDIUM', 1, 2, 4, 'Remote', 'FULL_TIME', 'Desc')
    RETURNING id
  `, [T_ACME, `REQ-D-${ts}`, 'Junior QA Engineer'])
  draftReqId = draftRes.rows[0].id

  // 2c. Acme ON_HOLD
  const onHoldRes = await pgClient.query(`
    INSERT INTO job_requisitions (
      organization_id, requisition_code, title, status, priority,
      openings_count, min_experience_years, max_experience_years,
      location, employment_type, job_description
    ) VALUES ($1, $2, $3, 'ON_HOLD', 'LOW', 1, 3, 5, 'Remote', 'FULL_TIME', 'Desc')
    RETURNING id
  `, [T_ACME, `REQ-H-${ts}`, 'Frontend Dev'])
  filledReqId = onHoldRes.rows[0].id

  // 2d. Acme CLOSED
  const closedRes = await pgClient.query(`
    INSERT INTO job_requisitions (
      organization_id, requisition_code, title, status, priority,
      openings_count, min_experience_years, max_experience_years,
      location, employment_type, job_description
    ) VALUES ($1, $2, $3, 'CLOSED', 'LOW', 1, 3, 5, 'Remote', 'FULL_TIME', 'Desc')
    RETURNING id
  `, [T_ACME, `REQ-C-${ts}`, 'Scrum Master'])
  cancelledReqId = closedRes.rows[0].id

  // 2e. Globex OPEN (Cross-tenant)
  const globexRes = await pgClient.query(`
    INSERT INTO job_requisitions (
      organization_id, requisition_code, title, status, priority,
      openings_count, min_experience_years, max_experience_years,
      location, employment_type, job_description
    ) VALUES ($1, $2, $3, 'OPEN', 'HIGH', 1, 4, 7, 'Bengaluru', 'FULL_TIME', 'Desc')
    RETURNING id
  `, [T_GLOBEX, `REQ-G-${ts}`, 'Globex Security Analyst'])
  globexReqId = globexRes.rows[0].id

  // ------------------------------------------------------------
  // Test 1: Shortlisting into OPEN requisition succeeds and persists
  // ------------------------------------------------------------
  await t.test('1. Shortlisting into an OPEN requisition succeeds & persists in PostgreSQL', async () => {
    const app = await ApplicationService.create(
      adapter,
      T_ACME,
      U_ACME_HR,
      {
        requisition_id: openReqId,
        candidate_id: candidateId,
        stage: 'SHORTLISTED',
        source: 'SOURCING_LINKEDIN',
      }
    )

    assert.ok(app.id)
    createdAppId = app.id
    assert.equal(app.requisition_id, openReqId)
    assert.equal(app.candidate_id, candidateId)
    assert.equal(app.stage, 'SHORTLISTED')

    // Verify row in PostgreSQL
    const dbCheck = await pgClient.query('SELECT * FROM job_applications WHERE id = $1', [createdAppId])
    assert.equal(dbCheck.rowCount, 1)
    assert.equal(dbCheck.rows[0].stage, 'SHORTLISTED')
    assert.equal(dbCheck.rows[0].organization_id, T_ACME)
  })

  // ------------------------------------------------------------
  // Test 2: Composite uniqueness on (candidate_id, requisition_id)
  // ------------------------------------------------------------
  await t.test('2. Composite uniqueness prevents duplicate applications for same candidate + requisition', async () => {
    await assert.rejects(
      async () => {
        await ApplicationService.create(
          adapter,
          T_ACME,
          U_ACME_HR,
          {
            requisition_id: openReqId,
            candidate_id: candidateId,
            stage: 'SHORTLISTED',
          }
        )
      },
      (err) => {
        assert.equal(err.status, 409)
        assert.ok(err.message.includes('already applied'))
        return true
      }
    )
  })

  // ------------------------------------------------------------
  // Test 3: Shortlisting into DRAFT requisition is rejected with 400
  // ------------------------------------------------------------
  await t.test('3. ApplicationService rejects DRAFT requisition with 400', async () => {
    await assert.rejects(
      async () => {
        await ApplicationService.create(
          adapter,
          T_ACME,
          U_ACME_HR,
          {
            requisition_id: draftReqId,
            candidate_id: candidateId,
            stage: 'SHORTLISTED',
          }
        )
      },
      (err) => {
        assert.equal(err.status, 400)
        assert.ok(err.message.includes('not eligible for new applications'))
        assert.ok(err.message.includes('DRAFT'))
        return true
      }
    )
  })

  // ------------------------------------------------------------
  // Test 4: Shortlisting into ON_HOLD or CLOSED requisition is rejected with 400
  // ------------------------------------------------------------
  await t.test('4. ApplicationService rejects ON_HOLD and CLOSED requisitions with 400', async () => {
    // ON_HOLD
    await assert.rejects(
      async () => {
        await ApplicationService.create(
          adapter,
          T_ACME,
          U_ACME_HR,
          {
            requisition_id: filledReqId,
            candidate_id: candidateId,
            stage: 'SHORTLISTED',
          }
        )
      },
      (err) => {
        assert.equal(err.status, 400)
        assert.ok(err.message.includes('ON_HOLD'))
        return true
      }
    )

    // CLOSED
    await assert.rejects(
      async () => {
        await ApplicationService.create(
          adapter,
          T_ACME,
          U_ACME_HR,
          {
            requisition_id: cancelledReqId,
            candidate_id: candidateId,
            stage: 'SHORTLISTED',
          }
        )
      },
      (err) => {
        assert.equal(err.status, 400)
        assert.ok(err.message.includes('CLOSED'))
        return true
      }
    )
  })

  // ------------------------------------------------------------
  // Test 5: Requisition belonging to another tenant is rejected with 404 (IDOR)
  // ------------------------------------------------------------
  await t.test('5. ApplicationService rejects cross-tenant requisition with 404', async () => {
    await assert.rejects(
      async () => {
        await ApplicationService.create(
          adapter,
          T_ACME, // Acme caller attempting to shortlist into Globex requisition
          U_ACME_HR,
          {
            requisition_id: globexReqId,
            candidate_id: candidateId,
            stage: 'SHORTLISTED',
          }
        )
      },
      (err) => {
        assert.equal(err.status, 404)
        return true
      }
    )
  })

  // ------------------------------------------------------------
  // Test 6: Non-existent requisition ID is rejected with 404
  // ------------------------------------------------------------
  await t.test('6. ApplicationService rejects non-existent requisition ID with 404', async () => {
    const bogusId = '00000000-0000-0000-0000-000000009999'
    await assert.rejects(
      async () => {
        await ApplicationService.create(
          adapter,
          T_ACME,
          U_ACME_HR,
          {
            requisition_id: bogusId,
            candidate_id: candidateId,
            stage: 'SHORTLISTED',
          }
        )
      },
      (err) => {
        assert.equal(err.status, 404)
        return true
      }
    )
  })

  // ------------------------------------------------------------
  // Test 7: Verify zero extra applications exist in PostgreSQL
  // ------------------------------------------------------------
  await t.test('7. Confirm live PostgreSQL state: exactly 1 application created throughout suite', async () => {
    const appsCheck = await pgClient.query(
      'SELECT id, requisition_id, stage FROM job_applications WHERE candidate_id = $1',
      [candidateId]
    )
    assert.equal(appsCheck.rowCount, 1)
    assert.equal(appsCheck.rows[0].id, createdAppId)
    assert.equal(appsCheck.rows[0].requisition_id, openReqId)
  })
})
