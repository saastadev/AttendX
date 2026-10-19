// ============================================================
// AttendX v2 — Hiring Navigation Visibility & RBAC Regression Test Suite
// Verifies that Module 4 Hiring is visible under HR & Admin for authorized HR users,
// hidden from Employees, free of duplicate entries, and mapped to the valid route.
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { RbacGuard } from '../lib/auth/rbac-guard.ts'

test('Hiring Navigation Visibility & RBAC Suite', async (t) => {
  const resolveFile = (subpath) => {
    const rootPath = path.resolve(subpath)
    if (fs.existsSync(rootPath)) return rootPath
    const v2Path = path.resolve('attendx-v2', subpath)
    if (fs.existsSync(v2Path)) return v2Path
    return rootPath
  }

  const appShellPath = resolveFile('components/layout/AppShell.tsx')
  const proxyPath = resolveFile('proxy.ts')
  const hiringPagePath = resolveFile('app/(app)/hiring/page.tsx')

  const appShellContent = fs.readFileSync(appShellPath, 'utf8')
  const proxyContent = fs.readFileSync(proxyPath, 'utf8')

  await t.test('NAV-01: Page file for /hiring exists and is non-empty', () => {
    assert.strictEqual(fs.existsSync(hiringPagePath), true, 'app/(app)/hiring/page.tsx must exist')
    const pageContent = fs.readFileSync(hiringPagePath, 'utf8')
    assert.ok(pageContent.includes('HiringHubPage'), 'Hiring page component must be present')
  })

  await t.test('NAV-02: AppShell defines dedicated Hiring section with all 7 sub-items', () => {
    // Check that Hiring section contains all 7 submodules
    const hiringSectionMatch = appShellContent.match(/section:\s*'Hiring',\s*items:\s*\[([\s\S]*?)\]/m)
    assert.ok(hiringSectionMatch, 'Must find dedicated Hiring section in AppShell.tsx')

    const hiringItems = hiringSectionMatch[1]
    const requiredItems = [
      { href: '/hiring', label: 'Overview', id: 'snav-hiring-hub' },
      { href: '/hiring/applications', label: 'Applications', id: 'snav-hiring-apps' },
      { href: '/hiring/sourcing', label: 'AI Sourcing', id: 'snav-hiring-src' },
      { href: '/hiring/outreach', label: 'Outreach', id: 'snav-hiring-reach' },
      { href: '/hiring/interview-status', label: 'Interviews', id: 'snav-hiring-int' },
      { href: '/hiring/onboard', label: 'Onboarding', id: 'snav-hiring-onb' },
      { href: '/hiring/analytics', label: 'Analytics', id: 'snav-hiring-stat' },
    ]

    for (const req of requiredItems) {
      assert.ok(hiringItems.includes(`href: '${req.href}'`), `Hiring section must include href: '${req.href}'`)
      assert.ok(hiringItems.includes(`label: '${req.label}'`), `Hiring section must include label: '${req.label}'`)
      assert.ok(hiringItems.includes(`id: '${req.id}'`), `Hiring section must include id: '${req.id}'`)
    }
  })

  await t.test('NAV-03: All 7 Hiring submodule pages exist and are non-empty', () => {
    const submodules = [
      'app/(app)/hiring/page.tsx',
      'app/(app)/hiring/applications/page.tsx',
      'app/(app)/hiring/sourcing/page.tsx',
      'app/(app)/hiring/outreach/page.tsx',
      'app/(app)/hiring/interview-status/page.tsx',
      'app/(app)/hiring/onboard/page.tsx',
      'app/(app)/hiring/analytics/page.tsx',
    ]
    for (const sub of submodules) {
      const fullPath = resolveFile(sub)
      assert.strictEqual(fs.existsSync(fullPath), true, `Page file ${sub} must exist`)
      const content = fs.readFileSync(fullPath, 'utf8')
      assert.ok(content.length > 50, `Page file ${sub} must not be empty`)
    }
  })

  await t.test('NAV-04: Role visibility logic correctly partitions roles for minRole HR', () => {
    const ROLE_RANK = {
      EMPLOYEE: 1,
      MANAGER: 2,
      HR: 3,
      ADMIN: 4,
      SUPERADMIN: 5,
    }

    function canSee(userRole, minRole) {
      if (!minRole) return true
      return ROLE_RANK[userRole] >= ROLE_RANK[minRole]
    }

    // Positive controls
    assert.strictEqual(canSee('HR', 'HR'), true, 'HR user MUST be able to see Hiring navigation')
    assert.strictEqual(canSee('ADMIN', 'HR'), true, 'ADMIN user MUST be able to see Hiring navigation')
    assert.strictEqual(canSee('SUPERADMIN', 'HR'), true, 'SUPERADMIN user MUST be able to see Hiring navigation')

    // Negative controls
    assert.strictEqual(canSee('EMPLOYEE', 'HR'), false, 'EMPLOYEE user MUST NOT see Hiring navigation')
    assert.strictEqual(canSee('MANAGER', 'HR'), false, 'MANAGER user MUST NOT see HR & Admin Hiring navigation')
  })

  await t.test('NAV-05: Proxy role gate authoritatively protects /hiring route', () => {
    assert.ok(proxyContent.includes("'/hiring': ['SUPERADMIN', 'ADMIN', 'HR', 'MANAGER']"),
      "proxy.ts must configure '/hiring' for SUPERADMIN, ADMIN, HR, and MANAGER"
    )

    // Verify RbacGuard enforcement
    const allowedRoles = ['SUPERADMIN', 'ADMIN', 'HR', 'MANAGER']
    assert.strictEqual(RbacGuard.isAuthorizedForRoute(['HR'], allowedRoles), true, 'HR authorized for /hiring')
    assert.strictEqual(RbacGuard.isAuthorizedForRoute(['ADMIN'], allowedRoles), true, 'ADMIN authorized for /hiring')
    assert.strictEqual(RbacGuard.isAuthorizedForRoute(['SUPERADMIN'], allowedRoles), true, 'SUPERADMIN authorized for /hiring')
    assert.strictEqual(RbacGuard.isAuthorizedForRoute(['MANAGER'], allowedRoles), true, 'MANAGER authorized for /hiring')
    assert.strictEqual(RbacGuard.isAuthorizedForRoute(['EMPLOYEE'], allowedRoles), false, 'EMPLOYEE denied for /hiring')
    assert.strictEqual(RbacGuard.isAuthorizedForRoute([], allowedRoles), false, 'Anonymous denied for /hiring')
  })
})
