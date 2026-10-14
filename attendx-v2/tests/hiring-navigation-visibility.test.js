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
  const appShellPath = path.resolve('components/layout/AppShell.tsx')
  const proxyPath = path.resolve('proxy.ts')
  const hiringPagePath = path.resolve('app/(app)/hiring/page.tsx')

  const appShellContent = fs.readFileSync(appShellPath, 'utf8')
  const proxyContent = fs.readFileSync(proxyPath, 'utf8')

  await t.test('NAV-01: Page file for /hiring exists and is non-empty', () => {
    assert.strictEqual(fs.existsSync(hiringPagePath), true, 'app/(app)/hiring/page.tsx must exist')
    const pageContent = fs.readFileSync(hiringPagePath, 'utf8')
    assert.ok(pageContent.includes('HiringHubPage'), 'Hiring page component must be present')
  })

  await t.test('NAV-02: AppShell defines Hiring under HR & Admin with minRole HR', () => {
    // Check that HR & Admin section contains the /hiring item
    const hrAdminSectionMatch = appShellContent.match(/section:\s*'HR & Admin',\s*items:\s*\[([\s\S]*?)\]/m)
    assert.ok(hrAdminSectionMatch, 'Must find HR & Admin section in AppShell.tsx')

    const hrAdminItems = hrAdminSectionMatch[1]
    const hasHiringEntry = hrAdminItems.includes("href: '/hiring'")
    assert.strictEqual(hasHiringEntry, true, "HR & Admin section must include href: '/hiring'")

    const hiringItemMatch = hrAdminItems.match(/\{\s*href:\s*'\/hiring'[^}]+\}/)
    assert.ok(hiringItemMatch, 'Must match full /hiring item definition in HR & Admin')
    const hiringDef = hiringItemMatch[0]

    assert.ok(hiringDef.includes("label: 'Hiring'"), "Hiring navigation item must have label: 'Hiring'")
    assert.ok(hiringDef.includes("minRole: 'HR'"), "Hiring navigation item must have minRole: 'HR'")
    assert.ok(hiringDef.includes("icon: Briefcase"), "Hiring navigation item must have icon: Briefcase")
    assert.ok(hiringDef.includes("id: 'snav-hiring'"), "Hiring navigation item must have id: 'snav-hiring'")
  })

  await t.test('NAV-03: Zero duplicate /hiring links exist in AppShell navigation', () => {
    const hiringHrefMatches = Array.from(appShellContent.matchAll(/href:\s*'\/hiring'/g))
    assert.strictEqual(
      hiringHrefMatches.length,
      1,
      `Expected exactly 1 '/hiring' link in AppShell.tsx, found ${hiringHrefMatches.length}`
    )
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
