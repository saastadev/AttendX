-- ==============================================================================
-- AttendX v2 — Migration 021: Multi-Tenant Recognition Support & Domain Seeding
-- Seeds recognition categories and verified domain members for:
--   - SwiftLogix Fleet (40000000-0000-0000-0000-000000000004)
--   - FutureLearn Portal (50000000-0000-0000-0000-000000000005)
-- ==============================================================================

-- 0. Ensure synthetic tenants exist before inserting child recognition categories
INSERT INTO public.tenants (id, name, slug, timezone, plan, max_employees, accent_color, app_name, features)
SELECT t.id, t.name, t.slug, t.timezone, t.plan, t.max_employees, t.accent_color, t.app_name, t.features
FROM (VALUES
  ('40000000-0000-0000-0000-000000000004'::uuid, 'SwiftLogix Express', 'swiftlogix', 'Asia/Kolkata', 'ENTERPRISE', 600, '#10B981', 'SwiftLogix Fleet', '{"ai_copilot": true, "geofence": true, "selfie_clockin": true}'::jsonb),
  ('50000000-0000-0000-0000-000000000005'::uuid, 'FutureLearn Academy', 'futurelearn', 'Asia/Kolkata', 'ENTERPRISE', 400, '#EC4899', 'FutureLearn Portal', '{"ai_copilot": true, "geofence": true, "selfie_clockin": true}'::jsonb)
) AS t(id, name, slug, timezone, plan, max_employees, accent_color, app_name, features)
WHERE NOT EXISTS (
  SELECT 1 FROM public.tenants WHERE id = t.id OR slug = t.slug
);

-- 1. Recognition Categories for SwiftLogix Fleet & FutureLearn Portal
INSERT INTO public.recognition_categories (tenant_id, name, icon, points, color, is_active)
SELECT '40000000-0000-0000-0000-000000000004'::uuid, name, icon, points, color, is_active
FROM (VALUES
  ('Peer Recognition', 'heart', 50, '#EC4899', true),
  ('Customer Appreciation', 'star', 100, '#F59E0B', true),
  ('Innovation Champion', 'zap', 150, '#8B5CF6', true),
  ('Project Success', 'award', 200, '#10B981', true),
  ('Leadership Excellence', 'shield', 250, '#3B82F6', true),
  ('Employee of the Month', 'trophy', 500, '#F59E0B', true),
  ('Quarterly Star Performer', 'crown', 750, '#8B5CF6', true),
  ('Annual Excellence Award', 'medal', 1000, '#EC4899', true)
) AS t(name, icon, points, color, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM public.recognition_categories 
  WHERE tenant_id = '40000000-0000-0000-0000-000000000004'::uuid AND name = t.name
)
AND EXISTS (
  SELECT 1 FROM public.tenants 
  WHERE id = '40000000-0000-0000-0000-000000000004'::uuid
);

INSERT INTO public.recognition_categories (tenant_id, name, icon, points, color, is_active)
SELECT '50000000-0000-0000-0000-000000000005'::uuid, name, icon, points, color, is_active
FROM (VALUES
  ('Peer Recognition', 'heart', 50, '#EC4899', true),
  ('Customer Appreciation', 'star', 100, '#F59E0B', true),
  ('Innovation Champion', 'zap', 150, '#8B5CF6', true),
  ('Project Success', 'award', 200, '#10B981', true),
  ('Leadership Excellence', 'shield', 250, '#3B82F6', true),
  ('Employee of the Month', 'trophy', 500, '#F59E0B', true),
  ('Quarterly Star Performer', 'crown', 750, '#8B5CF6', true),
  ('Annual Excellence Award', 'medal', 1000, '#EC4899', true)
) AS t(name, icon, points, color, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM public.recognition_categories 
  WHERE tenant_id = '50000000-0000-0000-0000-000000000005'::uuid AND name = t.name
)
AND EXISTS (
  SELECT 1 FROM public.tenants 
  WHERE id = '50000000-0000-0000-0000-000000000005'::uuid
);
