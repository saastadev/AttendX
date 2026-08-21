#!/usr/bin/env node

// ============================================================
// AttendX v2 — Standalone CI Secret Scanner (Scope E.34 & Rule 5)
// Scans client-side codebase for forbidden SUPABASE_SERVICE_ROLE_KEY references
// ============================================================

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const CLIENT_DIRECTORIES = ['app', 'components', 'hooks', 'store']
const FORBIDDEN_PATTERNS = [
  /SUPABASE_SERVICE_ROLE_KEY/,
  /service_role_key/i,
  /NEXT_PUBLIC_SERVICE_ROLE/i,
]

// Server files explicitly allowed to access service key (if inside app/api)
const ALLOWED_SERVER_PATTERNS = [
  /app\/api\//,
]

function scanDirectory(dirPath) {
  let violations = []

  if (!fs.existsSync(dirPath)) {
    return violations
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)

    if (entry.isDirectory()) {
      violations = violations.concat(scanDirectory(fullPath))
    } else if (entry.isFile() && /\.(js|jsx|ts|tsx|mjs)$/.test(entry.name)) {
      const relativePath = path.relative(projectRoot, fullPath)
      
      // Check if file is in an allowed server directory (like app/api/)
      const isAllowedServer = ALLOWED_SERVER_PATTERNS.some(pattern => pattern.test(relativePath))
      
      // Specifically check client components or client folders
      const content = fs.readFileSync(fullPath, 'utf8')
      const isClientComponent = content.includes("'use client'") || content.includes('"use client"')

      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(content)) {
          // If it's a client component or in components/hooks/store, violation!
          if (isClientComponent || !isAllowedServer) {
            violations.push({
              file: relativePath,
              pattern: pattern.toString(),
              isClientComponent,
            })
          }
        }
      }
    }
  }

  return violations
}

console.log('🔍 [AttendX CI Secret Scanner] Scanning client bundles for secret leakage...')

let totalViolations = []
for (const dir of CLIENT_DIRECTORIES) {
  const dirPath = path.join(projectRoot, dir)
  const violations = scanDirectory(dirPath)
  totalViolations = totalViolations.concat(violations)
}

if (totalViolations.length > 0) {
  console.error('\n🚨 CRITICAL SECURITY VIOLATION: SUPABASE_SERVICE_ROLE_KEY leaked in client bundle!\n')
  for (const v of totalViolations) {
    console.error(`  - File: ${v.file} (Matched: ${v.pattern}, 'use client': ${v.isClientComponent})`)
  }
  console.error('\nFix this immediately before merging. Rule 5 strictly prohibits service credentials in client bundles.\n')
  process.exit(1)
} else {
  console.log('✅ Client directories (app/, components/, hooks/, store/) are 100% clean of service keys.\n')
  process.exit(0)
}
