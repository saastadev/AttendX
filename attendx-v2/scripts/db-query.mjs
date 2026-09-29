import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '../.env.local')

// Read .env.local without external dotenv dependency
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
  console.error('❌ Error: Supabase credentials not found in attendx-v2/.env.local')
  process.exit(1)
}

const supabase = createClient(url, serviceKey)

const table = process.argv[2] || 'tenants'
const limit = parseInt(process.argv[3], 10) || 10

async function inspect() {
  console.log(`\n🔍 Querying table [${table}] from ${url} (Limit: ${limit})...\n`)

  const { data, error } = await supabase
    .from(table)
    .select('*')
    .limit(limit)

  if (error) {
    console.error('❌ Query Error:', error.message)
    return
  }

  if (!data || data.length === 0) {
    console.log(`ℹ️ Table [${table}] has 0 records or does not exist.`)
    return
  }

  console.table(data)
  console.log(`\n✅ Returned ${data.length} rows.`)
}

inspect()
