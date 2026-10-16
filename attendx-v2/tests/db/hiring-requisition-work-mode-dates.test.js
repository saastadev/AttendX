// ============================================================
// AttendX v2 — Module 4.1: Requisition Schema Alignment Suite
// Validates Migration 024: work_mode, opening_date, target_close_date
// Tested on live PostgreSQL: postgresql://localhost:5432/attendx_test
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import { Client } from 'pg'

const DB_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/attendx_test'
const T_ACME = 'aa000000-0000-0000-0000-0000000000a1'

test('Module 4.1: Requisition Schema Alignment (Migration 024) Verification', async (t) => {
  const client = new Client({ connectionString: DB_URL })
  await client.connect()

  const cleanupCodes = []

  t.after(async () => {
    if (cleanupCodes.length > 0) {
      await client.query(
        'DELETE FROM public.job_requisitions WHERE requisition_code = ANY($1)',
        [cleanupCodes]
      ).catch(() => {})
    }
    await client.end()
  })

  await t.test('1. SCHEMA: job_requisitions has work_mode, opening_date, target_close_date columns', async () => {
    const res = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'job_requisitions'
        AND column_name IN ('work_mode', 'opening_date', 'target_close_date')
      ORDER BY column_name;
    `)
    const cols = res.rows.reduce((acc, row) => ({ ...acc, [row.column_name]: row }), {})

    assert.ok(cols.work_mode, 'Column work_mode must exist')
    assert.equal(cols.work_mode.data_type, 'text')
    assert.equal(cols.work_mode.is_nullable, 'NO')
    assert.ok(cols.work_mode.column_default.includes('HYBRID'))

    assert.ok(cols.opening_date, 'Column opening_date must exist')
    assert.equal(cols.opening_date.data_type, 'date')
    assert.equal(cols.opening_date.is_nullable, 'NO')
    assert.ok(cols.opening_date.column_default.includes('CURRENT_DATE'))

    assert.ok(cols.target_close_date, 'Column target_close_date must exist')
    assert.equal(cols.target_close_date.data_type, 'date')
    assert.equal(cols.target_close_date.is_nullable, 'YES')
  })

  await t.test('2. ENGINE CONSTRAINT: Rejects invalid work_mode values', async () => {
    const code = `TEST-WM-FAIL-${Date.now()}`
    cleanupCodes.push(code)
    await assert.rejects(
      async () => {
        await client.query(`
          INSERT INTO public.job_requisitions (organization_id, requisition_code, title, work_mode)
          VALUES ($1, $2, 'Invalid Mode Role', 'COFFEE_SHOP')
        `, [T_ACME, code])
      },
      (err) => {
        assert.ok(err.message.includes('job_requisitions_work_mode_check'))
        return true
      }
    )
  })

  await t.test('3. ENGINE CONSTRAINT: Rejects target_close_date earlier than opening_date', async () => {
    const code = `TEST-DATE-FAIL-${Date.now()}`
    cleanupCodes.push(code)
    await assert.rejects(
      async () => {
        await client.query(`
          INSERT INTO public.job_requisitions (
            organization_id, requisition_code, title, opening_date, target_close_date
          ) VALUES ($1, $2, 'Invalid Dates Role', '2026-10-25', '2026-10-10')
        `, [T_ACME, code])
      },
      (err) => {
        assert.ok(err.message.includes('job_requisitions_target_close_date_check'))
        return true
      }
    )
  })

  await t.test('4. PERSISTENCE & DEFAULTS: Default work_mode is HYBRID and opening_date is CURRENT_DATE', async () => {
    const code = `TEST-DEF-${Date.now()}`
    cleanupCodes.push(code)
    const res = await client.query(`
      INSERT INTO public.job_requisitions (organization_id, requisition_code, title)
      VALUES ($1, $2, 'Default Fields Role')
      RETURNING id, requisition_code, work_mode, opening_date, target_close_date;
    `, [T_ACME, code])

    const row = res.rows[0]
    assert.equal(row.work_mode, 'HYBRID')
    assert.ok(row.opening_date, 'opening_date should have a value')
    assert.equal(row.target_close_date, null)
  })

  await t.test('5. CUSTOM INSERT: REMOTE work_mode with valid opening and close dates', async () => {
    const code = `TEST-REMOTE-${Date.now()}`
    cleanupCodes.push(code)
    const res = await client.query(`
      INSERT INTO public.job_requisitions (
        organization_id, requisition_code, title, work_mode, opening_date, target_close_date
      ) VALUES ($1, $2, 'Remote AI Architect', 'REMOTE', '2026-10-01', '2026-11-30')
      RETURNING id, requisition_code, work_mode, opening_date::text, target_close_date::text;
    `, [T_ACME, code])

    const row = res.rows[0]
    assert.equal(row.work_mode, 'REMOTE')
    assert.equal(row.opening_date, '2026-10-01')
    assert.equal(row.target_close_date, '2026-11-30')
  })

  await t.test('6. CUSTOM INSERT: ONSITE work_mode with same opening and close date', async () => {
    const code = `TEST-ONSITE-${Date.now()}`
    cleanupCodes.push(code)
    const res = await client.query(`
      INSERT INTO public.job_requisitions (
        organization_id, requisition_code, title, work_mode, opening_date, target_close_date
      ) VALUES ($1, $2, 'Onsite Operations Lead', 'ONSITE', '2026-10-15', '2026-10-15')
      RETURNING id, requisition_code, work_mode, opening_date::text, target_close_date::text;
    `, [T_ACME, code])

    const row = res.rows[0]
    assert.equal(row.work_mode, 'ONSITE')
    assert.equal(row.opening_date, '2026-10-15')
    assert.equal(row.target_close_date, '2026-10-15')
  })

  await t.test('7. UPDATE: Updating target_close_date and work_mode adheres to constraints', async () => {
    const code = `TEST-UPD-${Date.now()}`
    cleanupCodes.push(code)
    const insRes = await client.query(`
      INSERT INTO public.job_requisitions (
        organization_id, requisition_code, title, work_mode, opening_date
      ) VALUES ($1, $2, 'Updatable Position', 'HYBRID', '2026-10-01')
      RETURNING id;
    `, [T_ACME, code])
    const id = insRes.rows[0].id

    // Valid update
    const updRes = await client.query(`
      UPDATE public.job_requisitions
      SET work_mode = 'REMOTE', target_close_date = '2026-12-31'
      WHERE id = $1
      RETURNING work_mode, target_close_date::text;
    `, [id])
    assert.equal(updRes.rows[0].work_mode, 'REMOTE')
    assert.equal(updRes.rows[0].target_close_date, '2026-12-31')

    // Invalid update violating date ordering
    await assert.rejects(
      async () => {
        await client.query(`
          UPDATE public.job_requisitions
          SET target_close_date = '2026-09-01'
          WHERE id = $1;
        `, [id])
      },
      (err) => {
        assert.ok(err.message.includes('job_requisitions_target_close_date_check'))
        return true
      }
    )
  })
})
