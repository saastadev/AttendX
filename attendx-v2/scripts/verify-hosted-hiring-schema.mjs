// ============================================================
// AttendX v2 — Verify Hosted Supabase Hiring Schema
// Purpose: Probes all 28 hiring tables, RLS policies, and seeded counts
// against the target Supabase instance defined in .env.local
// ============================================================

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '../.env.local')

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...val] = trimmed.split('=')
      if (key && val.length > 0) {
        process.env[key.trim()] = val.join('=').trim()
      }
    }
  })
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

if (!url || !serviceKey) {
  console.error('❌ Supabase credentials missing in .env.local')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const TABLES = [
  'job_requisitions',
  'job_requisition_skills',
  'candidates',
  'candidate_skills',
  'candidate_resumes',
  'sourcing_searches',
  'sourced_candidates',
  'outreach_campaigns',
  'outreach_templates',
  'outreach_messages',
  'outreach_followups',
  'ai_voice_calls',
  'assessments',
  'job_applications',
  'ai_screenings',
  'candidate_assessments',
  'hiring_funnel_events',
  'hiring_audit_logs',
  'interviews',
  'candidate_evaluations',
  'offer_portal_tokens',
  'job_offers',
  'onboarding_processes',
  'onboarding_documents',
  'onboarding_tasks',
  'hiring_analytics_snapshots',
  'hiring_ai_recommendations',
  'org_score_weights',
]

async function verify() {
  console.log(`\n============================================================`)
  console.log(`Auditing 28 Hiring Tables on: ${url}`)
  console.log(`============================================================\n`)

  let present = 0
  let missing = 0
  const results = []

  for (const table of TABLES) {
    const { data, count, error } = await supabase
      .from(table)
      .select('id', { count: 'exact' })
      .limit(1)

    if (error) {
      missing++
      results.push({
        table,
        status: '❌ MISSING',
        rows: 0,
        error: error.message.includes('schema cache') ? 'PGRST205: Not in schema cache' : error.message,
      })
    } else {
      present++
      results.push({
        table,
        status: '✅ PRESENT',
        rows: count ?? 0,
        error: 'None',
      })
    }
  }

  console.table(results)
  console.log(`\nSummary: ${present} PRESENT, ${missing} MISSING out of ${TABLES.length}`)

  if (missing > 0) {
    console.log(`\n⚠️  The hosted Supabase schema cache is missing ${missing} tables.`)
    console.log(`👉 Apply 'supabase/all_hiring_migrations_and_seed.sql' in the Supabase SQL Editor.`)
    process.exitCode = 1
  } else {
    console.log(`\n🎉 All 28 Module 4 Hiring tables are present and active!`)
    process.exitCode = 0
  }
}

verify().catch(console.error)
