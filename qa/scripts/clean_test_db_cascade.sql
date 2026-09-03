-- ============================================================
-- AttendX v2 — Safe Test DB Cascade Reset Script
-- Cleans downstream tables in foreign-key dependency order
-- Run this in Supabase SQL Editor (khaxowomjczuckfuraoh)
-- ============================================================

-- 1. Clean operational and activity logs
DELETE FROM public.audit_log;
DELETE FROM public.offline_sync_log;
DELETE FROM public.attendance_corrections;
DELETE FROM public.breaks;
DELETE FROM public.attendance_records;
DELETE FROM public.leaves;
DELETE FROM public.leave_balances;
DELETE FROM public.goals;
DELETE FROM public.self_reviews;
DELETE FROM public.manager_reviews;
DELETE FROM public.recognition_events;
DELETE FROM public.recognition_badges;
DELETE FROM public.announcement_dismissals;
DELETE FROM public.announcements;
DELETE FROM public.notifications;
DELETE FROM public.notification_preferences;
DELETE FROM public.push_tokens;
DELETE FROM public.case_attachments;
DELETE FROM public.case_messages;
DELETE FROM public.cases;
DELETE FROM public.active_sessions;
DELETE FROM public.password_resets;
DELETE FROM public.tenant_invites;
DELETE FROM public.onboarding_state;
DELETE FROM public.attrition_risk_scores;
DELETE FROM public.skill_embeddings;

-- 2. Clean employee and profile tables
DELETE FROM public.employees;
DELETE FROM public.user_roles;
DELETE FROM public.profiles;

-- 3. Safely clean auth records
DELETE FROM auth.identities;
DELETE FROM auth.users;
