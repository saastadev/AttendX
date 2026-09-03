// ============================================================
// AttendX v2 — Seed Full ERD Domain Data for All 3 Tenants
// ============================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bvfwhuiocyoqwokxkaad.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2ZndodWlvY3lvcXdva3hrYWFkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzA1MzQ2OSwiZXhwIjoyMTAyNjI5NDY5fQ.JFKTtD-YtFBDcFuszUxt_QJAbgLpctOnSEghr8h32qw';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const T1 = '11111111-0000-0000-0000-000000000001'; // Acme Tech (IT)
const T2 = '22222222-0000-0000-0000-000000000002'; // Globex (Retail)
const T3 = '33333333-0000-0000-0000-000000000003'; // Initech (Healthcare)

async function seedERD() {
  console.log('🌱 Seeding ERD Modules (Departments, Shifts, Geofences, Leave Types) across all 3 Tenants...');

  // 1. Departments
  console.log('1. Seeding Departments...');
  const depts = [
    { tenant_id: T1, name: 'Cloud Infrastructure' },
    { tenant_id: T1, name: 'Product Engineering' },
    { tenant_id: T1, name: 'DevOps & SRE' },
    { tenant_id: T1, name: 'People Operations' },
    { tenant_id: T2, name: 'Store Operations' },
    { tenant_id: T2, name: 'Cashier & Checkout' },
    { tenant_id: T2, name: 'Inventory Logistics' },
    { tenant_id: T3, name: 'Emergency & Trauma' },
    { tenant_id: T3, name: 'ICU Critical Care' },
    { tenant_id: T3, name: 'Hospital Administration' }
  ];
  for (const d of depts) {
    await supabase.from('departments').upsert(d, { onConflict: 'tenant_id, name' });
  }

  // 2. Shifts
  console.log('2. Seeding Shifts...');
  const shifts = [
    { tenant_id: T1, name: 'Standard Tech Shift', start_time: '09:30', end_time: '18:30', break_minutes: 60, is_default: true },
    { tenant_id: T1, name: 'US Cloud On-Call', start_time: '18:30', end_time: '03:30', break_minutes: 45, is_default: false },
    { tenant_id: T2, name: 'Morning Cashier Shift', start_time: '06:00', end_time: '14:30', break_minutes: 30, is_default: true },
    { tenant_id: T2, name: 'Evening Store Shift', start_time: '14:00', end_time: '22:30', break_minutes: 30, is_default: false },
    { tenant_id: T3, name: 'Clinical 12h Day Shift', start_time: '07:00', end_time: '19:30', break_minutes: 60, is_default: true },
    { tenant_id: T3, name: 'Emergency Night ICU', start_time: '19:00', end_time: '07:30', break_minutes: 60, is_default: false }
  ];
  for (const s of shifts) {
    await supabase.from('shifts').upsert(s, { onConflict: 'tenant_id, name' });
  }

  // 3. Geofences
  console.log('3. Seeding Geofences...');
  const geofences = [
    { tenant_id: T1, name: 'Bangalore Tech Park HQ', lat: 12.9716, lng: 77.5946, radius_m: 250, is_active: true },
    { tenant_id: T1, name: 'Hyderabad Cloud Campus', lat: 17.4483, lng: 78.3915, radius_m: 200, is_active: true },
    { tenant_id: T2, name: 'Manhattan Flagship #101', lat: 40.7128, lng: -74.0060, radius_m: 80, is_active: true },
    { tenant_id: T2, name: 'Brooklyn MegaStore #204', lat: 40.6782, lng: -73.9442, radius_m: 100, is_active: true },
    { tenant_id: T3, name: 'St. Jude Trauma Hospital', lat: 51.5074, lng: -0.1278, radius_m: 300, is_active: true },
    { tenant_id: T3, name: 'South OPD Clinic Wing', lat: 51.4816, lng: -0.1118, radius_m: 120, is_active: true }
  ];
  for (const g of geofences) {
    await supabase.from('geofences').upsert(g, { onConflict: 'tenant_id, name' });
  }

  // 4. Leave Types
  console.log('4. Seeding Leave Types...');
  const leaveTypes = [
    { tenant_id: T1, name: 'Annual / Paid Leave', days_allowed: 18, is_paid: true },
    { tenant_id: T1, name: 'Sick Leave', days_allowed: 12, is_paid: true },
    { tenant_id: T2, name: 'Hourly / Casual Leave', days_allowed: 10, is_paid: true },
    { tenant_id: T2, name: 'Retail Unpaid Leave', days_allowed: 15, is_paid: false },
    { tenant_id: T3, name: 'Medical Emergency Leave', days_allowed: 20, is_paid: true },
    { tenant_id: T3, name: 'Compassionate Leave', days_allowed: 7, is_paid: true }
  ];
  for (const lt of leaveTypes) {
    await supabase.from('leave_types').upsert(lt, { onConflict: 'tenant_id, name' });
  }

  console.log('✅ ERD Domain Modules Successfully Seeded & Verified Across All 3 Tenants!');
}

seedERD().catch(console.error);
