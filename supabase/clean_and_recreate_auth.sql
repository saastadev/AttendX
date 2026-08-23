-- ============================================================
-- AttendX v2 — Instant Full Reset Script
-- Drops and recreates public schema + clears auth records cleanly
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Drop trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 2. Drop all public tables instantly using schema cascade
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;

-- 3. Clear auth tables
DELETE FROM auth.identities;
DELETE FROM auth.sessions;
DELETE FROM auth.refresh_tokens;
DELETE FROM auth.users;
