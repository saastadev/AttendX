// sync-auth-users.mjs — Test Supabase connection and ensure demo users exist with valid GoTrue auth passwords
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.resolve(__dirname, '../.env.local')
const envContent = fs.readFileSync(envPath, 'utf8')
const env = Object.fromEntries(
  envContent
    .split('\n')
    .filter(line => line && !line.startsWith('#') && line.includes('='))
    .map(line => {
      const idx = line.indexOf('=')
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()]
    })
)

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY

console.log('Testing Supabase Cloud Connection...')
console.log('URL:', supabaseUrl)
console.log('Service Key starts with:', serviceKey?.slice(0, 15))

const adminClient = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const anonClient = createClient(supabaseUrl, anonKey)

const demoUsers = [
  { id: '11111111-1111-1111-1111-111111111111', email: 'superadmin@acme-tech.com', tenant_id: '11111111-0000-0000-0000-000000000001' },
  { id: '11111111-1111-1111-1111-222222222222', email: 'admin@acme-tech.com',      tenant_id: '11111111-0000-0000-0000-000000000001' },
  { id: '11111111-1111-1111-1111-333333333333', email: 'hr@acme-tech.com',         tenant_id: '11111111-0000-0000-0000-000000000001' },
  { id: '11111111-1111-1111-1111-444444444444', email: 'manager@acme-tech.com',    tenant_id: '11111111-0000-0000-0000-000000000001' },
  { id: '11111111-1111-1111-1111-555555555555', email: 'employee@acme-tech.com',   tenant_id: '11111111-0000-0000-0000-000000000001' },
  { id: '22222222-2222-2222-2222-111111111111', email: 'superadmin@globex-corp.com', tenant_id: '22222222-0000-0000-0000-000000000002' },
  { id: '22222222-2222-2222-2222-222222222222', email: 'admin@globex-corp.com',      tenant_id: '22222222-0000-0000-0000-000000000002' },
  { id: '22222222-2222-2222-2222-333333333333', email: 'hr@globex-corp.com',         tenant_id: '22222222-0000-0000-0000-000000000002' },
  { id: '22222222-2222-2222-2222-444444444444', email: 'manager@globex-corp.com',    tenant_id: '22222222-0000-0000-0000-000000000002' },
  { id: '22222222-2222-2222-2222-555555555555', email: 'employee@globex-corp.com',   tenant_id: '22222222-0000-0000-0000-000000000002' },
  { id: '33333333-3333-3333-3333-111111111111', email: 'superadmin@initech-ltd.com', tenant_id: '33333333-0000-0000-0000-000000000003' },
  { id: '33333333-3333-3333-3333-222222222222', email: 'admin@initech-ltd.com',      tenant_id: '33333333-0000-0000-0000-000000000003' },
  { id: '33333333-3333-3333-3333-333333333333', email: 'hr@initech-ltd.com',         tenant_id: '33333333-0000-0000-0000-000000000003' },
  { id: '33333333-3333-3333-3333-444444444444', email: 'manager@initech-ltd.com',    tenant_id: '33333333-0000-0000-0000-000000000003' },
  { id: '33333333-3333-3333-3333-555555555555', email: 'employee@initech-ltd.com',   tenant_id: '33333333-0000-0000-0000-000000000003' }
]

async function run() {
  // 1. Check existing users in auth.users
  const { data: usersData, error: listErr } = await adminClient.auth.admin.listUsers()
  if (listErr) {
    console.error('Failed to list users:', listErr)
    return
  }
  console.log(`Found ${usersData.users.length} users in auth.users.`)

  for (const u of demoUsers) {
    const existing = usersData.users.find(x => x.email === u.email || x.id === u.id)
    if (existing) {
      console.log(`Updating password and app_metadata for ${u.email}...`)
      const { error: updErr } = await adminClient.auth.admin.updateUserById(existing.id, {
        password: 'Password123!',
        email_confirm: true,
        app_metadata: { provider: 'email', providers: ['email'], tenant_id: u.tenant_id }
      })
      if (updErr) console.error(`Error updating ${u.email}:`, updErr.message)
      else console.log(`✓ Updated ${u.email}`)
    } else {
      console.log(`Creating user in GoTrue ${u.email}...`)
      const { error: createErr } = await adminClient.auth.admin.createUser({
        id: u.id,
        email: u.email,
        password: 'Password123!',
        email_confirm: true,
        app_metadata: { provider: 'email', providers: ['email'], tenant_id: u.tenant_id },
        user_metadata: { full_name: u.email.split('@')[0] }
      })
      if (createErr) console.error(`Error creating ${u.email}:`, createErr.message)
      else console.log(`✓ Created ${u.email}`)
    }
  }

  // 2. Test sign-in with admin@acme-tech.com
  console.log('\nTesting signInWithPassword for admin@acme-tech.com...')
  const { data: signData, error: signErr } = await anonClient.auth.signInWithPassword({
    email: 'admin@acme-tech.com',
    password: 'Password123!'
  })

  if (signErr) {
    console.error('Sign-in test failed:', signErr)
  } else {
    console.log('✓ SUCCESS! Logged in as:', signData.user.email, 'Role:', signData.user.role)
  }
}

run()
