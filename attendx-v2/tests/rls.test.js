import test from 'node:test'
import assert from 'node:assert'
import { Client } from 'pg'

const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/attendx_db'

test('RLS Integrity, Positive Controls & Anti-Regression Suite', async (t) => {
  const client = new Client({ connectionString: DB_URL, connectionTimeoutMillis: 1500 })
  try {
    await client.connect()
  } catch (err) {
    t.skip(`Local Postgres instance unavailable: ${err.message}`)
    return
  }

  // Ensure fixtures are present before tests run
  await client.query(`
    INSERT INTO tenants (id, name, slug, accent_color, app_name, timezone) VALUES
      ('11111111-0000-0000-0000-000000000001', 'Acme Technologies', 'acme-tech', '#6C63FF', 'AttendX', 'Asia/Kolkata'),
      ('22222222-0000-0000-0000-000000000002', 'Globex Corp', 'globex-corp', '#0EA5E9', 'Globex Attend', 'America/New_York')
    ON CONFLICT (id) DO NOTHING;
  `)

  /* ------------------------------------------------------------
   * 1. Schema Security Meta-Checks: Forced RLS & Search Path
   * ------------------------------------------------------------ */
  await t.test('ASSERT: Every single public table MUST have RLS enabled and forced', async () => {
    const res = await client.query(`
      SELECT relname, relrowsecurity, relforcerowsecurity
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
       ORDER BY relname;
    `)

    const unsecureTables = res.rows.filter(r => !r.relrowsecurity || !r.relforcerowsecurity)
    assert.strictEqual(
      unsecureTables.length,
      0,
      `CRITICAL SECURITY VIOLATION: Unsecure tables missing forced RLS: ${unsecureTables.map(t => t.relname).join(', ')}`
    )
  })

  await t.test('ASSERT: All SECURITY DEFINER functions MUST have pinned search_path', async () => {
    const res = await client.query(`
      SELECT proname, proconfig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.prosecdef = true;
    `)

    for (const row of res.rows) {
      const config = row.proconfig || []
      const hasSearchPath = config.some(c => c.startsWith('search_path='))
      assert.strictEqual(
        hasSearchPath,
        true,
        `SECURITY DEFINER function ${row.proname} missing pinned search_path!`
      )
    }
  })

  /* ------------------------------------------------------------
   * 2. Identity Resolution Assertions
   * ------------------------------------------------------------ */
  await t.test('ASSERT: Identity resolution fails closed when auth.uid() is unauthenticated or ambiguous', async () => {
    // Unauthenticated
    await client.query("SELECT set_config('request.jwt.claim.sub', '', true);")
    const resUnauth = await client.query('SELECT public.get_my_tenant_id() as tenant_id;')
    assert.strictEqual(resUnauth.rows[0].tenant_id, null, 'Unauthenticated get_my_tenant_id() MUST return NULL')

    // Ambiguous user with 2 memberships and no tenant claim
    const multiUser = '44444444-4444-4444-4444-444444444444'
    await client.query(`SELECT set_config('request.jwt.claim.sub', '${multiUser}', true);`)
    await client.query(`SELECT set_config('request.jwt.claim.tenant_id', '', true);`)
    const resAmbiguous = await client.query('SELECT public.get_my_tenant_id() as tenant_id;')
    assert.strictEqual(
      resAmbiguous.rows[0].tenant_id,
      null,
      'REGRESSION LOCK: Ambiguous multi-tenant user without explicit claim MUST return NULL (fail closed)'
    )
  })

  /* ------------------------------------------------------------
   * 3. Positive Control & Matrix Isolation Tests
   * ------------------------------------------------------------ */
  const TEST_ROLES = [
    { role: 'EMPLOYEE', uid: '11111111-1111-1111-1111-555555555555', tenantId: '11111111-0000-0000-0000-000000000001', otherTenantId: '22222222-0000-0000-0000-000000000002' },
    { role: 'MANAGER',  uid: '11111111-1111-1111-1111-444444444444', tenantId: '11111111-0000-0000-0000-000000000001', otherTenantId: '22222222-0000-0000-0000-000000000002' },
    { role: 'HR',       uid: '11111111-1111-1111-1111-333333333333', tenantId: '11111111-0000-0000-0000-000000000001', otherTenantId: '22222222-0000-0000-0000-000000000002' },
    { role: 'ADMIN',    uid: '11111111-1111-1111-1111-222222222222', tenantId: '11111111-0000-0000-0000-000000000001', otherTenantId: '22222222-0000-0000-0000-000000000002' },
    { role: 'SUPERADMIN',uid: '11111111-1111-1111-1111-111111111111', tenantId: '11111111-0000-0000-0000-000000000001', otherTenantId: '22222222-0000-0000-0000-000000000002' },
  ]

  for (const { role, uid, tenantId, otherTenantId } of TEST_ROLES) {
    await t.test(`ASSERT Role Matrix Isolation: ${role}`, async () => {
      await client.query('BEGIN;')
      await client.query('SET LOCAL ROLE authenticated;')
      await client.query(`SELECT set_config('request.jwt.claim.sub', '${uid}', true);`)
      await client.query(`SELECT set_config('request.jwt.claim.tenant_id', '${tenantId}', true);`)

      // POSITIVE CONTROL: Assert user identity resolves and sees > 0 rows of own tenant profiles
      const ownProfiles = await client.query('SELECT * FROM profiles;')
      assert.ok(
        ownProfiles.rows.length > 0,
        `POSITIVE CONTROL FAILED: Role ${role} (uid: ${uid}) saw 0 rows for own tenant ${tenantId}!`
      )

      // NEGATIVE ISOLATION ASSERTION: Assert zero rows of other tenant profiles returned
      const foreignProfiles = ownProfiles.rows.filter(r => r.tenant_id === otherTenantId)
      assert.strictEqual(
        foreignProfiles.length,
        0,
        `SECURITY VIOLATION: Role ${role} leaked ${foreignProfiles.length} rows from foreign tenant ${otherTenantId}`
      )

      // WRITE ISOLATION: Assert user cannot insert into foreign tenant
      try {
        await client.query(`
          INSERT INTO attendance_records (tenant_id, employee_id, date, status)
          VALUES ('${otherTenantId}', '${uid}', CURRENT_DATE + INTERVAL '1 day', 'PRESENT');
        `)
        assert.fail(`SECURITY VIOLATION: Role ${role} successfully inserted record into foreign tenant!`)
      } catch (err) {
        assert.ok(
          err.message.includes('violates row-level security policy') || err.code === '42501',
          `Expected RLS error on cross-tenant insert, got: ${err.message}`
        )
      }

      await client.query('ROLLBACK;')
    })
  }

  /* ------------------------------------------------------------
   * 4. Regression Locks for Historical Exploits
   * ------------------------------------------------------------ */
  await t.test('REGRESSION LOCK: Privilege escalation via self-service tenant_id update MUST be rejected', async () => {
    const empUid = '11111111-1111-1111-1111-555555555555'
    const acmeTenantId = '11111111-0000-0000-0000-000000000001'
    const foreignTenantId = '22222222-0000-0000-0000-000000000002'

    await client.query('BEGIN;')
    await client.query('SET LOCAL ROLE authenticated;')
    await client.query(`SELECT set_config('request.jwt.claim.sub', '${empUid}', true);`)
    await client.query(`SELECT set_config('request.jwt.claim.tenant_id', '${acmeTenantId}', true);`)

    try {
      await client.query(`UPDATE profiles SET tenant_id = '${foreignTenantId}' WHERE id = '${empUid}';`)
      assert.fail('REGRESSION LOCK FAILED: User was able to rewrite their own tenant_id!')
    } catch (err) {
      assert.ok(
        err.message.includes('tenant_id is not self-editable') || err.message.includes('row-level security'),
        `Expected tenant_id edit rejection, got: ${err.message}`
      )
    } finally {
      await client.query('ROLLBACK;')
    }
  })

  /* ------------------------------------------------------------
   * 5. Meta-Test: Prove suite FAILS when RLS is disabled
   * ------------------------------------------------------------ */
  await t.test('META-TEST: Suite MUST detect and fail if RLS is disabled on profiles', async () => {
    // Perform meta check as superuser by disabling RLS in a transaction
    await client.query('BEGIN;')
    await client.query('ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;')

    // Now run query as authenticated user
    await client.query("SET LOCAL ROLE authenticated;")
    await client.query("SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-555555555555', true);")
    await client.query("SELECT set_config('request.jwt.claim.tenant_id', '11111111-0000-0000-0000-000000000001', true);")

    const res = await client.query('SELECT * FROM profiles;')
    const foreignRows = res.rows.filter(r => r.tenant_id === '22222222-0000-0000-0000-000000000002')

    // Roll back transaction immediately to restore table state
    await client.query('ROLLBACK;')

    assert.ok(
      foreignRows.length > 0,
      'META-TEST FAILURE: Test suite failed to detect that RLS was disabled! (Foreign rows should leak when RLS is off)'
    )
  })

  await client.end()
})
