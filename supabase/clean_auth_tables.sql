-- ============================================================
-- AttendX v2 — Full Cleanup Before Automated Provisioning
-- Truncates referencing tables with CASCADE, then clears auth tables
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Truncate all referencing public tables in one command
TRUNCATE TABLE 
  public.audit_log,
  public.attrition_risk_scores,
  public.attendance_records,
  public.employees,
  public.user_roles,
  public.profiles,
  public.active_sessions
CASCADE;

-- 2. Clear auth tables
DELETE FROM auth.identities;
DELETE FROM auth.sessions;
DELETE FROM auth.refresh_tokens;
DELETE FROM auth.users;
