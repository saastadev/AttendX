// clean-and-provision.mjs
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envContent = fs.readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8')
const env = Object.fromEntries(
  envContent.split('\n').filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => {
    const idx = l.indexOf('=')
    return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
  })
)

const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const anonClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

const demoAccounts = [
  { email: 'superadmin@acme-tech.com', role: 'SUPERADMIN', name: 'Alice Superadmin', tenant_id: '11111111-0000-0000-0000-000000000001' },
  { email: 'admin@acme-tech.com', role: 'ADMIN', name: 'Bob Admin', tenant_id: '11111111-0000-0000-0000-000000000001' },
  { email: 'hr@acme-tech.com', role: 'HR', name: 'Carol HR', tenant_id: '11111111-0000-0000-0000-000000000001' },
  { email: 'manager@acme-tech.com', role: 'MANAGER', name: 'David Manager', tenant_id: '11111111-0000-0000-0000-000000000001' },
  { email: 'employee@acme-tech.com', role: 'EMPLOYEE', name: 'Eve Employee', tenant_id: '11111111-0000-0000-0000-000000000001' },
  // Globex
  { email: 'superadmin@globex-corp.com', role: 'SUPERADMIN', name: 'Gary Superadmin', tenant_id: '22222222-0000-0000-0000-000000000002' },
  { email: 'admin@globex-corp.com', role: 'ADMIN', name: 'Grace Admin', tenant_id: '22222222-0000-0000-0000-000000000002' },
  { email: 'hr@globex-corp.com', role: 'HR', name: 'Hannah HR', tenant_id: '22222222-0000-0000-0000-000000000002' },
  { email: 'manager@globex-corp.com', role: 'MANAGER', name: 'Ian Manager', tenant_id: '22222222-0000-0000-0000-000000000002' },
  { email: 'employee@globex-corp.com', role: 'EMPLOYEE', name: 'Ivy Employee', tenant_id: '22222222-0000-0000-0000-000000000002' },
  // Initech
  { email: 'superadmin@initech-ltd.com', role: 'SUPERADMIN', name: 'Ivan Superadmin', tenant_id: '33333333-0000-0000-0000-000000000003' },
  { email: 'admin@initech-ltd.com', role: 'ADMIN', name: 'Irene Admin', tenant_id: '33333333-0000-0000-0000-000000000003' },
  { email: 'hr@initech-ltd.com', role: 'HR', name: 'Jack HR', tenant_id: '33333333-0000-0000-0000-000000000003' },
  { email: 'manager@initech-ltd.com', role: 'MANAGER', name: 'Karen Manager', tenant_id: '33333333-0000-0000-0000-000000000003' },
  { email: 'employee@initech-ltd.com', role: 'EMPLOYEE', name: 'Leo Employee', tenant_id: '33333333-0000-0000-0000-000000000003' },
]

async function run() {
  console.log('--- 1. Fetching Existing Auth Users ---')
  const { data: listData, error: listErr } = await adminClient.auth.admin.listUsers()
  if (listErr) console.error('List error:', listErr)
  const users = listData?.users || []
  console.log(`Found ${users.length} users in auth.users`)

  // Delete any existing demo users to ensure a clean slate
  for (const u of users) {
    console.log(`Deleting existing user: ${u.email} (${u.id})...`)
    await adminClient.auth.admin.deleteUser(u.id)
  }

  console.log('\n--- 2. Creating All 15 Demo Accounts Fresh in GoTrue ---')
  for (const acc of demoAccounts) {
    const { data: cData, error: cErr } = await adminClient.auth.admin.createUser({
      email: acc.email,
      password: 'Password123!',
      email_confirm: true,
      app_metadata: { provider: 'email', providers: ['email'], tenant_id: acc.tenant_id },
      user_metadata: { full_name: acc.name }
    })

    if (cErr) {
      console.error(`❌ Error creating ${acc.email}:`, cErr.message)
      continue
    }

    const userId = cData.user.id
    console.log(`✅ Created ${acc.email} -> ID: ${userId}`)

    // Create or update profile
    await adminClient.from('profiles').upsert({
      id: userId,
      tenant_id: acc.tenant_id,
      email: acc.email,
      full_name: acc.name,
      is_active: true,
      onboarding_completed: true
    })

    // Create or update user role
    await adminClient.from('user_roles').upsert({
      user_id: userId,
      tenant_id: acc.tenant_id,
      role: acc.role
    })

    // Create employee record for employee / manager
    if (acc.role === 'EMPLOYEE' || acc.role === 'MANAGER') {
      await adminClient.from('employees').upsert({
        id: userId,
        tenant_id: acc.tenant_id,
        employee_code: `${acc.email.split('@')[0].slice(0, 3).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`,
        employment_type: 'FULL_TIME',
        status: 'ACTIVE'
      })

      // Add sample attendance record
      await adminClient.from('attendance_records').upsert({
        tenant_id: acc.tenant_id,
        employee_id: userId,
        date: new Date().toISOString().split('T')[0],
        status: 'PRESENT',
        method: 'SELFIE_GPS',
        work_minutes: 240,
        sync_status: 'SYNCED'
      })
    }
  }

  console.log('\n--- 3. Testing Sign In with admin@acme-tech.com ---')
  const { data: sData, error: sErr } = await anonClient.auth.signInWithPassword({
    email: 'admin@acme-tech.com',
    password: 'Password123!'
  })

  if (sErr) {
    console.error('❌ Sign In Failed:', sErr.message)
  } else {
    console.log('🎉 SUCCESS! Logged in as:', sData.user.email, 'Role:', sData.user.role)
    console.log('Access Token received! Length:', sData.session.access_token.length)
  }
}

run()
