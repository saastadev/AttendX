-- ============================================================
-- AttendX v2 — Migration 005: Allow Public Tenant Slug Lookup
-- Allows unauthenticated signup forms to query tenant by slug
-- ============================================================

DROP POLICY IF EXISTS "tenants_public_slug_read" ON tenants;

CREATE POLICY "tenants_public_slug_read" ON tenants
  FOR SELECT
  USING (true);
