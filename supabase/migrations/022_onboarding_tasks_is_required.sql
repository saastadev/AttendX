-- ============================================================
-- Migration 022: Add is_required flag to onboarding_tasks
-- Allows tasks to be marked as required or optional for Joining Readiness
-- ============================================================

ALTER TABLE public.onboarding_tasks 
ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT true;
