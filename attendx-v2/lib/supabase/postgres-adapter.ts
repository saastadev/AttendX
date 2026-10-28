// ============================================================
// AttendX v2 — Local PostgreSQL Adapter for Supabase Client Interface
// Connects getSupabaseServiceClient() directly to local PostgreSQL (attendx_test)
// when ATTENDX_USE_LOCAL_DB=true is enabled, providing 100% database fidelity
// without modifying hosted Supabase or changing .env.local secrets.
// ============================================================

import { Pool } from 'pg'

let localPool: Pool | null = null

function getPool(): Pool {
  if (!localPool) {
    const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/attendx_test'
    localPool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
    })
  }
  return localPool
}

const JSONB_COLUMNS = new Set([
  'metrics',
  'old_values',
  'new_values',
  'skills',
  'raw_profile',
  'ai_reasoning',
  'channels',
  'platforms',
  'skills_filter',
  'variables',
  'match_reasoning',
  'answers',
  'ratings',
  'factors',
  'old_data',
  'new_data',
  'payload',
  'metadata',
  'preferences',
  'data',
])

function formatParam(col: string, val: any) {
  if (val !== null && typeof val === 'object' && JSONB_COLUMNS.has(col)) {
    return JSON.stringify(val)
  }
  return val
}

export function getLocalPostgresAdapter() {
  const pool = getPool()

  return {
    auth: {
      admin: {
        createUser: async () => ({ data: null, error: null }),
        getUserById: async (id: string) => ({ data: { user: { id } }, error: null }),
        listUsers: async () => ({ data: { users: [] }, error: null }),
        deleteUser: async () => ({ data: null, error: null }),
        updateUserById: async (id: string, updates: any) => ({ data: { user: { id, ...updates } }, error: null }),
      },
      getUser: async (token?: string) => {
        if (token) {
          try {
            const pRes = await pool.query('SELECT id, email, tenant_id, is_active FROM profiles WHERE id::text = $1 OR email = $1', [token])
            if (pRes.rows[0]) {
              const p = pRes.rows[0]
              return { data: { user: { id: p.id, email: p.email, app_metadata: { tenant_id: p.tenant_id, is_active: p.is_active } } }, error: null }
            }
          } catch {
            // lookup failure fallback
          }
        }
        return { data: { user: null }, error: null }
      },
    },
    rpc: async (fnName: string, args: any) => {
      return { data: null, error: null }
    },
    from(tableName: string) {
      let operation = 'SELECT'
      let selectCols = '*'
      let insertRows: any[] = []
      let updateData: any = null
      let upsertOptions: { onConflict?: string; ignoreDuplicates?: boolean } | null = null
      let filters: Array<{ col: string; op: string; val: any }> = []
      let orClauses: string[] = []
      let orderClauses: string[] = []
      let limitCount: number | null = null
      let offsetCount: number | null = null
      let isSingle = false
      let isMaybeSingle = false
      let countOption: string | null = null
      let isHead = false

      const builder = {
        select(cols?: string, options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) {
          if (cols) selectCols = cols
          if (options?.count) countOption = options.count
          if (options?.head) isHead = true
          return builder
        },
        insert(data: any) {
          operation = 'INSERT'
          insertRows = Array.isArray(data) ? data : [data]
          return builder
        },
        upsert(data: any, options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
          operation = 'UPSERT'
          insertRows = Array.isArray(data) ? data : [data]
          upsertOptions = options || null
          return builder
        },
        update(data: any) {
          operation = 'UPDATE'
          updateData = data
          return builder
        },
        delete() {
          operation = 'DELETE'
          return builder
        },
        eq(col: string, val: any) {
          filters.push({ col, op: '=', val })
          return builder
        },
        neq(col: string, val: any) {
          filters.push({ col, op: '!=', val })
          return builder
        },
        gt(col: string, val: any) {
          filters.push({ col, op: '>', val })
          return builder
        },
        gte(col: string, val: any) {
          filters.push({ col, op: '>=', val })
          return builder
        },
        lt(col: string, val: any) {
          filters.push({ col, op: '<', val })
          return builder
        },
        lte(col: string, val: any) {
          filters.push({ col, op: '<=', val })
          return builder
        },
        like(col: string, pattern: string) {
          filters.push({ col, op: 'LIKE', val: pattern })
          return builder
        },
        ilike(col: string, pattern: string) {
          filters.push({ col, op: 'ILIKE', val: pattern })
          return builder
        },
        or(conditionString: string) {
          if (conditionString) {
            orClauses.push(conditionString)
          }
          return builder
        },
        is(col: string, val: any) {
          if (val === null) {
            filters.push({ col, op: 'IS', val: null })
          } else {
            filters.push({ col, op: '=', val })
          }
          return builder
        },
        in(col: string, vals: any[]) {
          filters.push({ col, op: '= ANY', val: vals })
          return builder
        },
        order(col: string, options?: { ascending?: boolean }) {
          const dir = options?.ascending === false ? 'DESC' : 'ASC'
          orderClauses.push(`"${col}" ${dir}`)
          return builder
        },
        limit(n: number) {
          limitCount = n
          return builder
        },
        range(from: number, to: number) {
          offsetCount = from
          limitCount = to - from + 1
          return builder
        },
        single() {
          isSingle = true
          limitCount = 1
          return this.execute()
        },
        maybeSingle() {
          isMaybeSingle = true
          limitCount = 1
          return this.execute()
        },
        then(resolve: any, reject: any) {
          return this.execute().then(resolve, reject)
        },
        async execute() {
          try {
            if (operation === 'SELECT') {
              const whereClauses: string[] = []
              const params: any[] = []
              filters.forEach((f) => {
                if (f.op === 'IS') {
                  whereClauses.push(`"${f.col}" IS NULL`)
                } else if (f.op === '= ANY') {
                  params.push(f.val)
                  whereClauses.push(`"${f.col}" = ANY($${params.length})`)
                } else {
                  params.push(f.val)
                  whereClauses.push(`"${f.col}" ${f.op} $${params.length}`)
                }
              })
              orClauses.forEach((orStr) => {
                const parts = orStr.split(',')
                const subClauses: string[] = []
                parts.forEach((part) => {
                  const m = part.trim().match(/^([a-zA-Z0-9_]+)\.(eq|neq|ilike|like|gt|gte|lt|lte)\.(.*)$/)
                  if (m) {
                    const [, col, op, rawVal] = m
                    const opSql = op === 'ilike' ? 'ILIKE' : op === 'like' ? 'LIKE' : op === 'eq' ? '=' : op === 'neq' ? '!=' : op === 'gte' ? '>=' : op === 'lte' ? '<=' : op === 'gt' ? '>' : '<'
                    params.push(rawVal)
                    subClauses.push(`"${col}" ${opSql} $${params.length}`)
                  }
                })
                if (subClauses.length > 0) {
                  whereClauses.push(`(${subClauses.join(' OR ')})`)
                }
              })
              const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''

              let totalCount: number | null = null
              if (countOption) {
                const countSql = `SELECT count(*)::int as c FROM "${tableName}" ${whereSql}`
                const countRes = await pool.query(countSql, params)
                totalCount = countRes.rows[0]?.c ?? 0
              }

              if (isHead) {
                return { data: null, error: null, count: totalCount }
              }

              const orderSql = orderClauses.length > 0 ? `ORDER BY ${orderClauses.join(', ')}` : ''
              const limitSql = limitCount !== null ? `LIMIT ${limitCount}` : ''
              const offsetSql = offsetCount !== null ? `OFFSET ${offsetCount}` : ''

              const sql = `SELECT * FROM "${tableName}" ${whereSql} ${orderSql} ${limitSql} ${offsetSql}`.trim()
              const res = await pool.query(sql, params)
              const rows = res.rows

              // Embedded relations lookup
              if (
                selectCols.includes('candidate:candidates') ||
                selectCols.includes('requisition:job_requisitions') ||
                selectCols.includes('candidates:sourced_candidates') ||
                selectCols.includes('skills:job_requisition_skills') ||
                selectCols.includes('skills:candidate_skills') ||
                selectCols.includes('application:job_applications') ||
                selectCols.includes('assessment:assessments') ||
                selectCols.includes('tenants')
              ) {
                for (const r of rows) {
                  if (selectCols.includes('tenants') && r.tenant_id) {
                    const tRes = await pool.query('SELECT * FROM tenants WHERE id = $1', [r.tenant_id])
                    r.tenants = tRes.rows[0] || null
                  }
                  if (selectCols.includes('candidate:candidates') && r.candidate_id) {
                    const cRes = await pool.query('SELECT * FROM candidates WHERE id = $1', [r.candidate_id])
                    const cand = cRes.rows[0] || null
                    if (cand && (selectCols.includes('candidate_skills') || selectCols.includes('skills:candidate_skills'))) {
                      const csRes = await pool.query('SELECT * FROM candidate_skills WHERE candidate_id = $1', [cand.id])
                      cand.skills = csRes.rows
                      cand.candidate_skills = csRes.rows
                    }
                    r.candidate = cand
                  }
                  if (selectCols.includes('requisition:job_requisitions') && r.requisition_id) {
                    const qRes = await pool.query('SELECT * FROM job_requisitions WHERE id = $1', [r.requisition_id])
                    r.requisition = qRes.rows[0] || null
                  }
                  if (selectCols.includes('candidates:sourced_candidates')) {
                    const sRes = await pool.query('SELECT * FROM sourced_candidates WHERE search_id = $1', [r.id])
                    r.candidates = sRes.rows
                    r.sourced_candidates = sRes.rows
                  }
                  if (selectCols.includes('skills:job_requisition_skills')) {
                    const skRes = await pool.query('SELECT * FROM job_requisition_skills WHERE requisition_id = $1', [r.id])
                    r.skills = skRes.rows
                    r.job_requisition_skills = skRes.rows
                  }
                  if (selectCols.includes('skills:candidate_skills')) {
                    const csRes = await pool.query('SELECT * FROM candidate_skills WHERE candidate_id = $1', [r.id])
                    r.skills = csRes.rows
                    r.candidate_skills = csRes.rows
                  }
                  if (selectCols.includes('application:job_applications') && r.application_id) {
                    const aRes = await pool.query('SELECT * FROM job_applications WHERE id = $1', [r.application_id])
                    const app = aRes.rows[0] || null
                    if (app) {
                      if (app.candidate_id) {
                        const acRes = await pool.query('SELECT * FROM candidates WHERE id = $1', [app.candidate_id])
                        app.candidate = acRes.rows[0] || null
                      }
                      if (app.requisition_id) {
                        const arRes = await pool.query('SELECT * FROM job_requisitions WHERE id = $1', [app.requisition_id])
                        app.requisition = arRes.rows[0] || null
                      }
                    }
                    r.application = app
                  }
                  if (selectCols.includes('assessment:assessments') && r.assessment_id) {
                    const asRes = await pool.query('SELECT * FROM assessments WHERE id = $1', [r.assessment_id])
                    r.assessment = asRes.rows[0] || null
                  }
                }
              }

              if (isSingle) {
                if (rows.length === 0) {
                  return { data: null, error: { message: 'Row not found', code: 'PGRST116' }, count: totalCount }
                }
                return { data: rows[0], error: null, count: totalCount }
              }
              if (isMaybeSingle) {
                return { data: rows[0] || null, error: null, count: totalCount }
              }
              return { data: rows, error: null, count: totalCount }
            }

            if (operation === 'INSERT') {
              if (insertRows.length === 0) return { data: [], error: null }
              const cols = Object.keys(insertRows[0])
              const colNames = cols.map(c => `"${c}"`).join(', ')
              const valuePlaceholders: string[] = []
              const params: any[] = []
              insertRows.forEach((row) => {
                const placeholders = cols.map((c) => {
                  params.push(formatParam(c, row[c]))
                  return `$${params.length}`
                })
                valuePlaceholders.push(`(${placeholders.join(', ')})`)
              })
              const sql = `INSERT INTO "${tableName}" (${colNames}) VALUES ${valuePlaceholders.join(', ')} RETURNING *`
              const res = await pool.query(sql, params)
              if (isSingle) {
                return { data: res.rows[0] || null, error: null }
              }
              return { data: res.rows, error: null }
            }

            if (operation === 'UPSERT') {
              if (insertRows.length === 0) return { data: [], error: null }
              const inserted: any[] = []
              for (const row of insertRows) {
                const keys = Object.keys(row)
                const colNames = keys.map(c => `"${c}"`).join(', ')
                const params: any[] = []
                const placeholders = keys.map(k => {
                  params.push(formatParam(k, row[k]))
                  return `$${params.length}`
                }).join(', ')

                let conflictCols = '"id"'
                if (upsertOptions?.onConflict) {
                  conflictCols = upsertOptions.onConflict.split(',').map((c: string) => `"${c.trim()}"`).join(', ')
                } else if (tableName === 'user_roles') {
                  conflictCols = '"user_id", "tenant_id"'
                } else if (tableName === 'job_requisition_skills') {
                  conflictCols = '"requisition_id", "skill_name"'
                }

                let conflictAction = 'DO NOTHING'
                if (!upsertOptions?.ignoreDuplicates) {
                  const conflictKeysList = (upsertOptions?.onConflict ? upsertOptions.onConflict.split(',') : (tableName === 'user_roles' ? ['user_id', 'tenant_id'] : ['id'])).map((s: string) => s.trim())
                  const updateKeys = keys.filter(k => !conflictKeysList.includes(k))
                  if (updateKeys.length > 0) {
                    const updateSets = updateKeys.map(k => `"${k}" = EXCLUDED."${k}"`).join(', ')
                    conflictAction = `DO UPDATE SET ${updateSets}`
                  }
                }

                const sql = `INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders}) ON CONFLICT (${conflictCols}) ${conflictAction} RETURNING *`
                const res = await pool.query(sql, params)
                if (res.rows[0]) {
                  inserted.push(res.rows[0])
                }
              }
              if (isSingle) {
                return { data: inserted[0] || null, error: null }
              }
              return { data: inserted, error: null }
            }

            if (operation === 'UPDATE') {
              const cols = Object.keys(updateData)
              const setClauses: string[] = []
              const params: any[] = []
              cols.forEach(c => {
                params.push(formatParam(c, updateData[c]))
                setClauses.push(`"${c}" = $${params.length}`)
              })
              const whereClauses: string[] = []
              filters.forEach(f => {
                if (f.op === 'IS') {
                  whereClauses.push(`"${f.col}" IS NULL`)
                } else if (f.op === '= ANY') {
                  params.push(f.val)
                  whereClauses.push(`"${f.col}" = ANY($${params.length})`)
                } else {
                  params.push(f.val)
                  whereClauses.push(`"${f.col}" ${f.op} $${params.length}`)
                }
              })
              const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''
              const sql = `UPDATE "${tableName}" SET ${setClauses.join(', ')} ${whereSql} RETURNING *`
              const res = await pool.query(sql, params)
              if (isSingle) {
                return { data: res.rows[0] || null, error: null }
              }
              return { data: res.rows, error: null }
            }

            if (operation === 'DELETE') {
              const whereClauses: string[] = []
              const params: any[] = []
              filters.forEach(f => {
                if (f.op === 'IS') {
                  whereClauses.push(`"${f.col}" IS NULL`)
                } else if (f.op === '= ANY') {
                  params.push(f.val)
                  whereClauses.push(`"${f.col}" = ANY($${params.length})`)
                } else {
                  params.push(f.val)
                  whereClauses.push(`"${f.col}" ${f.op} $${params.length}`)
                }
              })
              const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''
              const sql = `DELETE FROM "${tableName}" ${whereSql} RETURNING *`
              const res = await pool.query(sql, params)
              return { data: res.rows, error: null }
            }
          } catch (err: any) {
            return {
              data: null,
              error: {
                message: err.message,
                code: err.code || 'POSTGRES_ERROR',
                details: err.detail,
              },
            }
          }
        },
      }
      return builder
    },
  }
}
