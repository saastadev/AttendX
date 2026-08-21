// check-leaves-rls.mjs
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

const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const anonClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

async function test() {
  console.log('=== 1. Login as manager@acme-tech.com ===')
  const { data: authData, error: loginErr } = await anonClient.auth.signInWithPassword({
    email: 'manager@acme-tech.com',
    password: 'Password123!',
  })
  console.log('Login result user:', authData?.user?.id, 'role in app_metadata:', authData?.user?.app_metadata, 'error:', loginErr)

  if (authData?.session) {
    const userClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${authData.session.access_token}`,
        },
      },
    })

    console.log('\n=== 2. Query leaves with manager token ===')
    const { data: leaves, error: lErr } = await userClient
      .from('leaves')
      .select('*')
    console.log('Leaves visible to manager:', leaves?.length, 'error:', lErr)
    console.log('Leaves:', leaves)

    console.log('\n=== 3. Query employees with manager token ===')
    const { data: emps, error: eErr } = await userClient
      .from('employees')
      .select('*')
    console.log('Employees visible to manager:', emps?.length, 'error:', eErr)

    console.log('\n=== 4. Query profiles with manager token ===')
    const { data: profiles, error: pErr } = await userClient
      .from('profiles')
      .select('*')
    console.log('Profiles visible to manager:', profiles?.length, 'error:', pErr)
  }
}

test().catch(console.error)
