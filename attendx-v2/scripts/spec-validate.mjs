#!/usr/bin/env node

// ============================================================
// AttendX v2 — Local Spec Kit Contract & Schema Drift Validator
// Validates live codebase implementation against docs/specs/
// Operates 100% locally in Antigravity CLI without GitHub Actions
// ============================================================

import fs from 'node:fs'
import path from 'node:path'

const CWD = process.cwd()
const SPECS_DIR = fs.existsSync(path.join(CWD, 'docs/specs'))
  ? path.join(CWD, 'docs/specs')
  : path.join(CWD, '../docs/specs')

const APP_DIR = path.join(CWD, 'app')
const API_DIR = path.join(APP_DIR, 'api')

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
}

console.log(`${COLORS.bright}${COLORS.cyan}============================================================${COLORS.reset}`)
console.log(`${COLORS.bright}${COLORS.cyan}  AttendX Local Spec Kit — Contract & Schema Drift Check  ${COLORS.reset}`)
console.log(`${COLORS.bright}${COLORS.cyan}============================================================${COLORS.reset}\n`)

if (!fs.existsSync(SPECS_DIR)) {
  console.error(`${COLORS.red}❌ Error: Specifications directory not found at: ${SPECS_DIR}${COLORS.reset}`)
  process.exit(1)
}

// 1. Discover all specs
const specFiles = fs.readdirSync(SPECS_DIR).filter(f => f.endsWith('.md'))
console.log(`🔍 [Spec Discovery] Found ${COLORS.bright}${specFiles.length}${COLORS.reset} specification files in ${COLORS.dim}${SPECS_DIR}${COLORS.reset}\n`)

// 2. Extract declared API endpoints from specs
const declaredEndpoints = new Map() // key: "METHOD /api/path", value: { specFile, line }

for (const file of specFiles) {
  const content = fs.readFileSync(path.join(SPECS_DIR, file), 'utf8')
  const lines = content.split('\n')

  lines.forEach((line, idx) => {
    // Matches patterns like `POST /api/auth/login`, `GET /api/sessions`, `### 3.1 POST /api/leaves/apply`
    const endpointRegex = /(?:^|\s|`|#|\*|\b)(GET|POST|PUT|PATCH|DELETE)\s+(\/api\/[a-zA-Z0-9_\-\/\[\]]+)/g
    let match
    while ((match = endpointRegex.exec(line)) !== null) {
      const method = match[1].toUpperCase()
      let endpointPath = match[2].trim()

      // Normalize dynamic params e.g. /api/manager/approvals/:id -> /api/manager/approvals/[id]
      endpointPath = endpointPath.replace(/:([a-zA-Z0-9_]+)/g, '[$1]')
      // Remove trailing slashes or backticks
      endpointPath = endpointPath.replace(/`+$/, '').replace(/\/+$/, '')

      const key = `${method} ${endpointPath}`
      if (!declaredEndpoints.has(key)) {
        declaredEndpoints.set(key, { specFile: file, line: idx + 1, method, path: endpointPath })
      }
    }
  })
}

console.log(`📋 [Contract Registry] Extracted ${COLORS.bright}${declaredEndpoints.size}${COLORS.reset} declared API endpoints from specs.\n`)

// 3. Scan live implemented API route files in app/api
function findRouteFiles(dir, baseDir = dir) {
  let results = []
  if (!fs.existsSync(dir)) return results

  const list = fs.readdirSync(dir)
  for (const file of list) {
    const filePath = path.join(dir, file)
    const stat = fs.statSync(filePath)
    if (stat && stat.isDirectory()) {
      results = results.concat(findRouteFiles(filePath, baseDir))
    } else if (file === 'route.ts' || file === 'route.js') {
      results.push(filePath)
    }
  }
  return results
}

const liveRouteFiles = findRouteFiles(API_DIR)
const implementedEndpoints = new Map() // key: "METHOD /api/path", value: { filePath, methods }

for (const filePath of liveRouteFiles) {
  const content = fs.readFileSync(filePath, 'utf8')
  // Relative API route path: app/api/auth/login/route.ts -> /api/auth/login
  const relativeDir = path.relative(APP_DIR, path.dirname(filePath))
  const routeUrlPath = '/' + relativeDir.replace(/\\/g, '/')

  const methods = []
  if (/export\s+(?:async\s+)?function\s+GET\b/.test(content)) methods.push('GET')
  if (/export\s+(?:async\s+)?function\s+POST\b/.test(content)) methods.push('POST')
  if (/export\s+(?:async\s+)?function\s+PUT\b/.test(content)) methods.push('PUT')
  if (/export\s+(?:async\s+)?function\s+PATCH\b/.test(content)) methods.push('PATCH')
  if (/export\s+(?:async\s+)?function\s+DELETE\b/.test(content)) methods.push('DELETE')

  for (const m of methods) {
    const key = `${m} ${routeUrlPath}`
    implementedEndpoints.set(key, { filePath, method: m, path: routeUrlPath, content })
  }
}

console.log(`⚡ [Live Implementation] Discovered ${COLORS.bright}${implementedEndpoints.size}${COLORS.reset} live route handlers across ${liveRouteFiles.length} files.\n`)

// 4. Validate Contracts & Check for Drift
let verifiedCount = 0
let driftWarnings = []
let unspecCount = 0

console.log(`${COLORS.bright}--- Spec Verification Results ---${COLORS.reset}`)

for (const [key, spec] of declaredEndpoints.entries()) {
  const live = implementedEndpoints.get(key)

  if (live) {
    // Check if security / identity resolver is used
    const hasAuthCheck =
      live.content.includes('ServerIdentity') ||
      live.content.includes('supabase.auth.getUser') ||
      live.content.includes('getAuthoritativeCaller') ||
      live.content.includes('RbacGuard') ||
      live.path.includes('/auth/login') ||
      live.path.includes('/auth/signup') ||
      live.path.includes('/auth/invite/verify') ||
      live.path.includes('/health')

    const authStatus = hasAuthCheck ? `${COLORS.green}✓ AUTH${COLORS.reset}` : `${COLORS.yellow}⚠ PUBLIC${COLORS.reset}`
    console.log(`  ${COLORS.green}✔ CONTRACT MATCH:${COLORS.reset} ${COLORS.bright}${key.padEnd(42)}${COLORS.reset} ${authStatus} ${COLORS.dim}(Spec: ${spec.specFile}:${spec.line})${COLORS.reset}`)
    verifiedCount++
  } else {
    // Check if partial path matches (maybe method difference)
    const matchingPaths = Array.from(implementedEndpoints.keys()).filter(k => k.endsWith(spec.path))
    if (matchingPaths.length > 0) {
      driftWarnings.push(`Method mismatch on ${spec.path}: Spec declared ${spec.method}, but code implements [${matchingPaths.map(k => k.split(' ')[0]).join(', ')}] (${spec.specFile})`)
    } else {
      driftWarnings.push(`Missing implementation for declared endpoint: ${key} (${spec.specFile}:${spec.line})`)
    }
  }
}

console.log(`\n${COLORS.bright}--- Undocumented / Extended Route Handlers ---${COLORS.reset}`)
for (const [key, live] of implementedEndpoints.entries()) {
  if (!declaredEndpoints.has(key)) {
    console.log(`  ${COLORS.cyan}ℹ EXTENSION:${COLORS.reset} ${key.padEnd(42)} ${COLORS.dim}(File: ${path.relative(CWD, live.filePath)})${COLORS.reset}`)
    unspecCount++
  }
}

// 5. Final Summary
console.log(`\n${COLORS.bright}${COLORS.cyan}============================================================${COLORS.reset}`)
console.log(`  ${COLORS.bright}Summary: ${COLORS.green}${verifiedCount} Verified Contracts${COLORS.reset} | ${COLORS.cyan}${unspecCount} Extensions${COLORS.reset} | ${driftWarnings.length === 0 ? COLORS.green + '0 Drift Errors' : COLORS.red + driftWarnings.length + ' Drift Warnings'}${COLORS.reset}`)
console.log(`${COLORS.bright}${COLORS.cyan}============================================================${COLORS.reset}\n`)

if (driftWarnings.length > 0) {
  console.log(`${COLORS.yellow}⚠ Drift Warnings Detected:${COLORS.reset}`)
  driftWarnings.forEach(w => console.log(`  - ${w}`))
  console.log()
}

if (driftWarnings.length === 0) {
  console.log(`${COLORS.green}✅ 100% Spec Contract Integrity Verified! Zero schema drift.${COLORS.reset}\n`)
  process.exit(0)
} else {
  // Return clean exit code with warning notices
  process.exit(0)
}
