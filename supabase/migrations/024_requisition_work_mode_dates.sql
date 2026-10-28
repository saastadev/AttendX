-- ============================================================
-- Migration 024: Add work_mode, opening_date, and target_close_date to job_requisitions
-- Module 4.1 Job Requisition Schema Alignment
-- Backward-compatible, additive schema change with safe defaults
-- ============================================================

ALTER TABLE public.job_requisitions
  ADD COLUMN IF NOT EXISTS work_mode TEXT NOT NULL DEFAULT 'HYBRID' CHECK (work_mode IN ('REMOTE', 'ONSITE', 'HYBRID')),
  ADD COLUMN IF NOT EXISTS opening_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS target_close_date DATE;

-- Add check constraint to ensure target_close_date is >= opening_date if provided
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_requisitions_target_close_date_check'
  ) THEN
    ALTER TABLE public.job_requisitions
      ADD CONSTRAINT job_requisitions_target_close_date_check
      CHECK (target_close_date IS NULL OR opening_date IS NULL OR target_close_date >= opening_date);
  END IF;
END $$;
