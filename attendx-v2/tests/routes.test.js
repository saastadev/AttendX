import test from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'

test('Route & Navigation Integrity Tests', async (t) => {
  const APP_DIR = path.resolve('app')

  // Extract all hrefs from AppShell.tsx
  const appShellContent = fs.readFileSync(path.resolve('components/layout/AppShell.tsx'), 'utf8')
  const hrefMatches = Array.from(appShellContent.matchAll(/href:\s*'([^']+)'/g)).map(m => m[1])

  await t.test('ASSERT: Every navigation destination in AppShell.tsx maps to a real page route', () => {
    assert.ok(hrefMatches.length > 0, 'Must find navigation links in AppShell.tsx')

    for (const href of hrefMatches) {
      if (href === '#' || href.startsWith('http')) continue

      // Map route URL to filesystem path under app/
      // e.g. /dashboard -> app/(app)/dashboard/page.tsx or app/dashboard/page.tsx
      const relativePath = href.startsWith('/') ? href.slice(1) : href
      const possiblePaths = [
        path.join(APP_DIR, relativePath, 'page.tsx'),
        path.join(APP_DIR, relativePath, 'page.ts'),
        path.join(APP_DIR, '(app)', relativePath, 'page.tsx'),
        path.join(APP_DIR, '(app)', relativePath, 'page.ts'),
        path.join(APP_DIR, 'auth', relativePath.replace('auth/', ''), 'page.tsx'),
      ]

      const exists = possiblePaths.some(p => fs.existsSync(p))
      assert.strictEqual(
        exists,
        true,
        `ROUTING DEFECT: Nav destination '${href}' in AppShell.tsx does NOT resolve to any page file!`
      )
    }
  })

  await t.test('ASSERT: No empty route directories exist under app/', () => {
    function checkDir(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      if (entries.length === 0) {
        assert.fail(`EMPTY ROUTE DIRECTORY DETECTED: ${dir}`)
      }
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          checkDir(path.join(dir, entry.name))
        }
      }
    }
    checkDir(APP_DIR)
  })
})
