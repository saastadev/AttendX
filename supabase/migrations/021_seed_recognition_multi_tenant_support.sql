-- ==============================================================================
-- AttendX v2 — Migration 021: Multi-Tenant Recognition Support & Domain Seeding
-- Seeds recognition categories and verified domain members for:
--   - SwiftLogix Fleet (40000000-0000-0000-0000-000000000004)
--   - FutureLearn Portal (50000000-0000-0000-0000-000000000005)
-- ==============================================================================

-- 1. Recognition Categories for SwiftLogix Fleet & FutureLearn Portal
--
-- These two tenants are created out-of-band on the live project; no migration
-- or seed file creates them. On any fresh database the unguarded INSERTs
-- violated recognition_categories_tenant_id_fkey and aborted the whole
-- migration run (main CI has been red since this was merged). Each INSERT is
-- now guarded on the tenant existing. Where the tenant exists (live) the
-- behaviour is unchanged; on a fresh database the categories are skipped
-- rather than failing the run.
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
WHERE EXISTS (SELECT 1 FROM public.tenants WHERE id = '40000000-0000-0000-0000-000000000004'::uuid)
  AND NOT EXISTS (
  SELECT 1 FROM public.recognition_categories 
  WHERE tenant_id = '40000000-0000-0000-0000-000000000004'::uuid AND name = t.name
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
WHERE EXISTS (SELECT 1 FROM public.tenants WHERE id = '50000000-0000-0000-0000-000000000005'::uuid)
  AND NOT EXISTS (
  SELECT 1 FROM public.recognition_categories 
  WHERE tenant_id = '50000000-0000-0000-0000-000000000005'::uuid AND name = t.name
);
