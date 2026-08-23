// provision-demo-users.mjs — Automatically creates all 15 demo users cleanly in Supabase Auth & Public tables
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

const demoUsers = [
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

async function main() {
  console.log('--- Provisioning Demo Users via Supabase Admin API ---')

  // 1. Fetch existing auth users
  const { data: listData } = await adminClient.auth.admin.listUsers()
  const existingUsers = listData?.users || []

  for (const u of demoUsers) {
    let userId
    const existing = existingUsers.find(x => x.email === u.email)

    if (existing) {
      console.log(`Updating password for existing auth user ${u.email}...`)
      const { data: updData, error: updErr } = await adminClient.auth.admin.updateUserById(existing.id, {
        password: 'Password123!',
        email_confirm: true,
        app_metadata: { provider: 'email', providers: ['email'], tenant_id: u.tenant_id }
      })
      if (updErr) {
        console.error(`❌ Failed to update ${u.email}:`, updErr.message)
        continue
      }
      userId = updData.user.id
      console.log(`✓ Updated ${u.email}`)
    } else {
      console.log(`Creating auth user ${u.email}...`)
      const { data: createData, error: createErr } = await adminClient.auth.admin.createUser({
        email: u.email,
        password: 'Password123!',
        email_confirm: true,
        app_metadata: { provider: 'email', providers: ['email'], tenant_id: u.tenant_id },
        user_metadata: { full_name: u.name }
      })
      if (createErr) {
        console.error(`❌ Failed to create ${u.email}:`, createErr.message)
        continue
      }
      userId = createData.user.id
      console.log(`✓ Created ${u.email} (ID: ${userId})`)
    }

    // 2. Ensure Profile exists
    const { error: profErr } = await adminClient.from('profiles').upsert({
      id: userId,
      tenant_id: u.tenant_id,
      email: u.email,
      full_name: u.name,
      is_active: true,
      onboarding_completed: true
    })
    if (profErr) console.warn(`  Warning on profile:`, profErr.message)

    // 3. Ensure User Role exists
    const { error: roleErr } = await adminClient.from('user_roles').upsert({
      user_id: userId,
      tenant_id: u.tenant_id,
      role: u.role
    })
    if (roleErr) console.warn(`  Warning on user_role:`, roleErr.message)

    // 4. Ensure Employee record exists
    if (u.role === 'EMPLOYEE' || u.role === 'MANAGER') {
      const { error: empErr } = await adminClient.from('employees').upsert({
        id: userId,
        tenant_id: u.tenant_id,
        employee_code: `${u.email.split('@')[0].slice(0, 3).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`,
        employment_type: 'FULL_TIME',
        status: 'ACTIVE'
      })
      if (empErr) console.warn(`  Warning on employee:`, empErr.message)
    }
  }

  // Test sign in
  console.log('\n--- Verifying Sign In with admin@acme-tech.com ---')
  const { data: loginData, error: loginErr } = await anonClient.auth.signInWithPassword({
    email: 'admin@acme-tech.com',
    password: 'Password123!'
  })

  if (loginErr) {
    console.error('❌ Sign in failed:', loginErr.message)
  } else {
    console.log('🎉 SUCCESS! Signed in as:', loginData.user.email, 'Role:', loginData.user.role)
  }
}

main()
