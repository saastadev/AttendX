import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

let SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xsmbocwuktxrhlqjtsii.supabase.co';
let SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (fs.existsSync('.env.local')) {
  const envContent = fs.readFileSync('.env.local', 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) {
      SUPABASE_URL = trimmed.split('=')[1].trim();
    }
    if (trimmed.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
      SUPABASE_SERVICE_ROLE_KEY = trimmed.split('=')[1].trim();
    }
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: { users }, error: uErr } = await supabase.auth.admin.listUsers();
  console.log('Total auth users:', users?.length, uErr);
  for (const u of (users || [])) {
    console.log(`AUTH USER: ${u.id} | email=${u.email} | app_metadata=${JSON.stringify(u.app_metadata)} | user_metadata=${JSON.stringify(u.user_metadata)}`);
  }

  const { data: profiles } = await supabase.from('profiles').select('*');
  console.log('\n--- PROFILES ---');
  for (const p of (profiles || [])) {
    console.log(`PROFILE: id=${p.id} | tenant_id=${p.tenant_id} | email=${p.email} | full_name="${p.full_name}" | is_active=${p.is_active}`);
  }

  const { data: employees } = await supabase.from('employees').select('*');
  console.log('\n--- EMPLOYEES ---');
  for (const e of (employees || [])) {
    console.log(`EMPLOYEE: id=${e.id} | tenant_id=${e.tenant_id} | employee_code=${e.employee_code} | department_id=${e.department_id} | status=${e.status}`);
  }

  const { data: userRoles } = await supabase.from('user_roles').select('*');
  console.log('\n--- USER ROLES ---');
  for (const r of (userRoles || [])) {
    console.log(`USER_ROLE: user_id=${r.user_id} | tenant_id=${r.tenant_id} | role=${r.role}`);
  }
}
check();
