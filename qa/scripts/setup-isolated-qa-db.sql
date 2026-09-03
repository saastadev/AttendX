-- ==============================================================================
-- AttendX v2 — Isolated QA Database Seed & Test Data Generation Script
-- Target Environment: ISOLATED QA SUPABASE / POSTGRESQL DATABASE ONLY
-- Safety: DO NOT RUN ON PRODUCTION. This script initializes 5 synthetic domain tenants.
-- ==============================================================================

-- 1. SYNTHETIC TENANTS (5 Distinct Business Domains)
INSERT INTO public.tenants (id, name, slug, timezone, plan, max_employees, accent_color, app_name, features) VALUES
  ('10000000-0000-0000-0000-000000000001', 'AcmeTech Solutions', 'acmetech', 'Asia/Kolkata', 'ENTERPRISE', 500, '#6C63FF', 'AcmeTech Workspace', '{"ai_copilot": true, "geofence": true, "selfie_clockin": true}'::jsonb),
  ('20000000-0000-0000-0000-000000000002', 'RetailMart India', 'retailmart', 'Asia/Kolkata', 'ENTERPRISE', 1000, '#0EA5E9', 'RetailMart Hub', '{"ai_copilot": true, "geofence": true, "selfie_clockin": true}'::jsonb),
  ('30000000-0000-0000-0000-000000000003', 'Precision Manufacturing', 'precision-mfg', 'Asia/Kolkata', 'ENTERPRISE', 750, '#F59E0B', 'Precision Operations', '{"ai_copilot": true, "geofence": true, "selfie_clockin": true}'::jsonb),
  ('40000000-0000-0000-0000-000000000004', 'SwiftLogix Express', 'swiftlogix', 'Asia/Kolkata', 'ENTERPRISE', 600, '#10B981', 'SwiftLogix Fleet', '{"ai_copilot": true, "geofence": true, "selfie_clockin": true}'::jsonb),
  ('50000000-0000-0000-0000-000000000005', 'FutureLearn Academy', 'futurelearn', 'Asia/Kolkata', 'ENTERPRISE', 400, '#EC4899', 'FutureLearn Portal', '{"ai_copilot": true, "geofence": true, "selfie_clockin": true}'::jsonb)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, plan = EXCLUDED.plan;

-- 2. DEPARTMENTS PER TENANT (20+ Departments)
INSERT INTO public.departments (id, tenant_id, name, description) VALUES
  -- IT / AcmeTech
  ('11000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Cloud Infrastructure', 'DevOps, SRE, and AWS Architecture'),
  ('11000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Software Engineering', 'Fullstack and Mobile App Dev'),
  ('11000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'AI & Machine Learning', 'Workforce AI models and algorithms'),
  ('11000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'People Operations', 'Human Resources and Talent'),
  -- Retail / RetailMart
  ('21000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'Store Operations', 'Store Floor Management & Customer Care'),
  ('21000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Cashier & POS Services', 'Checkout counters and POS audits'),
  ('21000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'Inventory Logistics', 'Stock replenishment and warehouse inbound'),
  ('21000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002', 'Retail HR', 'Store recruitment and shift rostering'),
  -- Manufacturing / PrecisionMfg
  ('31000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'Assembly Line A', 'Primary CNC manufacturing and machining'),
  ('31000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', 'Quality Assurance & QC', 'Defect inspection and compliance'),
  ('31000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', 'Plant Maintenance', 'Preventative maintenance and mechanical upkeep'),
  ('31000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000003', 'Plant HR & Safety', 'Workplace safety and plant compliance'),
  -- Logistics / SwiftLogix
  ('41000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000004', 'Fleet Operations', 'Driver routing and highway haulage'),
  ('41000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000004', 'Hub Dispatch', 'Cross-dock sorting and outbound scheduling'),
  ('41000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000004', 'Central Warehouse', 'Bulk storage and pallet handling'),
  ('41000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000004', 'Logistics HR', 'Driver compliance and crew onboarding'),
  -- Education / FutureLearn
  ('51000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000005', 'Faculty of Computer Science', 'Undergrad and Masters teaching staff'),
  ('51000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000005', 'Academic Administration', 'Admissions, examinations, and student registry'),
  ('51000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000005', 'Campus Facilities', 'Library, labs, and security infrastructure'),
  ('51000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000005', 'University HR', 'Faculty appointments and sabbatical reviews')
ON CONFLICT (id) DO NOTHING;

-- 3. DESIGNATIONS PER TENANT (25+ Designations)
INSERT INTO public.designations (id, tenant_id, name, level) VALUES
  -- IT
  ('12000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Chief Technology Officer', 5),
  ('12000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'VP of Engineering', 4),
  ('12000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'DevOps Manager', 3),
  ('12000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Lead HR Partner', 3),
  ('12000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'Senior Fullstack Engineer', 2),
  ('12000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', 'QA Automation Engineer', 1),
  -- Retail
  ('22000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'Regional Retail Director', 5),
  ('22000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Store General Manager', 4),
  ('22000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'Cashier Supervisor', 3),
  ('22000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002', 'Retail Associate', 1),
  ('22000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000002', 'Stocking Assistant', 1),
  -- Manufacturing
  ('32000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'Plant General Manager', 5),
  ('32000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', 'Production Shift Supervisor', 3),
  ('32000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', 'Senior QC Engineer', 2),
  ('32000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000003', 'CNC Machine Operator', 1),
  -- Logistics
  ('42000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000004', 'Head of Logistics Operations', 5),
  ('42000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000004', 'Hub Operations Manager', 3),
  ('42000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000004', 'Fleet Dispatcher', 2),
  ('42000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000004', 'Heavy Vehicle Driver', 1),
  -- Education
  ('52000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000005', 'Dean of Academics', 5),
  ('52000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000005', 'Department Head', 4),
  ('52000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000005', 'Professor & Researcher', 3),
  ('52000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000005', 'Assistant Lecturer', 2),
  ('52000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000005', 'Academic Registrar', 2)
ON CONFLICT (id) DO NOTHING;

-- 4. SHIFTS & GEOFENCES PER TENANT
INSERT INTO public.shifts (id, tenant_id, name, start_time, end_time, break_minutes, is_default) VALUES
  ('13000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Standard Core Tech', '09:30:00', '18:30:00', 60, true),
  ('13000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'US Cloud On-Call', '18:30:00', '03:30:00', 45, false),
  ('23000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'Morning Cashier Shift', '06:00:00', '14:30:00', 30, true),
  ('23000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Evening Store Shift', '14:00:00', '22:30:00', 30, false),
  ('33000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'Plant Shift 1 (Day)', '06:00:00', '14:00:00', 45, true),
  ('33000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', 'Plant Shift 2 (Evening)', '14:00:00', '22:00:00', 45, false),
  ('33000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', 'Plant Shift 3 (Night)', '22:00:00', '06:00:00', 45, false),
  ('43000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000004', 'Long Haul Fleet Shift', '00:00:00', '23:59:59', 60, true),
  ('53000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000005', 'Academic Lecture Shift', '08:30:00', '17:00:00', 60, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.geofences (id, tenant_id, name, lat, lng, radius_m, is_active) VALUES
  ('14000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Bangalore Tech Park HQ', 12.9716, 77.5946, 250, true),
  ('24000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'Chennai MegaStore #101', 13.0827, 80.2707, 100, true),
  ('24000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Bangalore Retail #204', 12.9352, 77.6245, 120, true),
  ('34000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'Pune Manufacturing Plant 1', 18.5204, 73.8567, 350, true),
  ('44000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000004', 'Central Logistics Hub', 19.0760, 72.8777, 400, true),
  ('54000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000005', 'Main University Campus', 28.6139, 77.2090, 500, true)
ON CONFLICT (id) DO NOTHING;

-- 5. LEAVE TYPES PER TENANT
INSERT INTO public.leave_types (id, tenant_id, name, code, days_per_year, is_paid) VALUES
  ('15000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Paid Time Off (PTO)', 'PTO', 20, true),
  ('15000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Sick Leave', 'SICK', 12, true),
  ('25000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'Casual Store Leave', 'CASUAL', 12, true),
  ('35000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'Factory Earned Leave', 'EL', 18, true),
  ('45000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000004', 'Fleet Rest Leave', 'REST', 15, true),
  ('55000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000005', 'Academic Sabbatical', 'SABB', 30, true)
ON CONFLICT (id) DO NOTHING;
