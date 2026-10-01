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

async function checkTenantsData() {
  const { data: tenants } = await supabase.from('tenants').select('id, name, app_name, slug');
  for (const t of (tenants || [])) {
    const { data: profs } = await supabase.from('profiles').select('id, full_name, email, is_active').eq('tenant_id', t.id);
    const { data: emps } = await supabase.from('employees').select('id, employee_code, department_id').eq('tenant_id', t.id);
    const { data: cats } = await supabase.from('recognition_categories').select('id, name, points').eq('tenant_id', t.id);
    const { data: roles } = await supabase.from('user_roles').select('user_id, role').eq('tenant_id', t.id);
    console.log(`Tenant [${t.name}] | App: [${t.app_name}] | Slug: [${t.slug}] | ID: ${t.id}`);
    console.log(`  Profiles (${profs?.length}):`, (profs || []).map(p => `${p.full_name} (${p.email}) [id: ${p.id}]`));
    console.log(`  Employees (${emps?.length}):`, (emps || []).map(e => `${e.employee_code} [id: ${e.id}]`));
    console.log(`  Categories (${cats?.length}):`, (cats || []).map(c => `${c.name} (${c.points}pts)`));
    console.log(`  User Roles (${roles?.length}):`, (roles || []).map(r => `${r.user_id.slice(0,8)}:${r.role}`));
  }
}
checkTenantsData();
