/**
 * Migration hygiene — catches the failure mode that has already bitten this
 * repo twice: two files sharing a number prefix.
 *
 * Postgres applies them in whatever order the runner lists them (alphabetical
 * within a duplicated prefix), so schemas silently diverge between local,
 * staging and production. This must fail the build, not warn.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '../../../supabase/migrations')

test('migration hygiene', async (t) => {
  const files = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()

  await t.test('there are migrations to check', () => {
    assert.ok(files.length > 0, `no .sql files found in ${MIGRATIONS}`)
  })

  await t.test('no two migrations share a number prefix', () => {
    const byPrefix = new Map()
    for (const f of files) {
      const p = f.split('_')[0]
      byPrefix.set(p, [...(byPrefix.get(p) || []), f])
    }
    const dupes = [...byPrefix.entries()].filter(([, v]) => v.length > 1)
    assert.equal(
      dupes.length, 0,
      'Duplicate migration prefixes (apply order is undefined):\n' +
      dupes.map(([p, v]) => `  ${p}: ${v.join(', ')}`).join('\n')
    )
  })

  await t.test('numbering has no gaps', () => {
    const nums = [...new Set(files.map(f => parseInt(f.split('_')[0], 10)))]
      .filter(Number.isFinite).sort((a, b) => a - b)
    const gaps = []
    for (let i = nums[0]; i < nums[nums.length - 1]; i++) {
      if (!nums.includes(i)) gaps.push(i)
    }
    assert.equal(gaps.length, 0, `Missing migration numbers: ${gaps.join(', ')}`)
  })
})
