// Creates the first company (tenant) and its first ADMIN on a FRESH AttendX
// database, through the same path the app uses (auth admin API, then the
// admin_provision_employee_v2 RPC, with rollback on failure).
//
// Run on the server, from the app folder, as the attendx user:
//   cd /opt/attendx/app/attendx-v2
//   node ../deploy/hostinger/create-first-admin.mjs \
//     --company "Saasta Software Services" --slug saasta --timezone Asia/Kolkata \
//     --email admin@company.com --name "Admin Name"
//
// Prints a one-time temporary password ONCE. The account is created with
// onboarding incomplete, so the first login is forced to set a new password.
// Never use the demo seed (supabase/seed) in production.
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

const require = createRequire(process.cwd() + '/package.json')
const { createClient } = require('@supabase/supabase-js')

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), [])
)
for (const k of ['company', 'slug', 'timezone', 'email', 'name']) {
  if (!args[k]) { console.error(`missing --${k}`); process.exit(1) }
}
const role = (args.role || 'ADMIN').toUpperCase()
if (!['ADMIN', 'SUPERADMIN'].includes(role)) { console.error('--role must be ADMIN or SUPERADMIN'); process.exit(1) }

const env = Object.fromEntries(
  readFileSync('.env.production', 'utf8').split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
)
const url = env.SUPABASE_INTERNAL_URL || env.NEXT_PUBLIC_SUPABASE_URL
if (!url || !env.SUPABASE_SERVICE_ROLE_KEY) { console.error('.env.production is missing the Supabase URL or service key'); process.exit(1) }
const db = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const email = args.email.trim().toLowerCase()
const slug = args.slug.trim().toLowerCase()

let { data: tenant } = await db.from('tenants').select('id, name').eq('slug', slug).maybeSingle()
if (!tenant) {
  const ins = await db.from('tenants').insert({ name: args.company.trim(), slug, timezone: args.timezone }).select('id, name').single()
  if (ins.error) { console.error('tenant insert failed:', ins.error.message); process.exit(1) }
  tenant = ins.data
  console.log(`created company "${tenant.name}" (${tenant.id})`)
} else {
  console.log(`company "${tenant.name}" already exists (${tenant.id}); adding the admin to it`)
}

const tempPassword = randomBytes(12).toString('base64url') + 'A1!'
const created = await db.auth.admin.createUser({
  email, password: tempPassword, email_confirm: true,
  app_metadata: { tenant_id: tenant.id, role },
  user_metadata: { full_name: args.name.trim() },
})
if (created.error) { console.error('auth user create failed:', created.error.message); process.exit(1) }
const userId = created.data.user.id

const rpc = await db.rpc('admin_provision_employee_v2', {
  p_auth_user_id: userId, p_tenant_id: tenant.id, p_full_name: args.name.trim(),
  p_email: email, p_role: role, p_department_id: null, p_designation_id: null,
  p_join_date: new Date().toISOString().slice(0, 10), p_assigned_by: null,
})
if (rpc.error) {
  await db.auth.admin.deleteUser(userId).catch(() => {})
  console.error('provisioning failed, auth user rolled back:', rpc.error.message)
  process.exit(1)
}

console.log(`created ${role} ${email} (${rpc.data?.employee_code ?? userId})`)
console.log('')
console.log('Temporary password (shown once, give it to the admin privately):')
console.log(`  ${tempPassword}`)
console.log('They must set a new password on first sign-in.')
