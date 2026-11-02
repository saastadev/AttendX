-- ============================================================
-- AttendX Migration: Ensure Sourced Candidates & Sourcing Searches
-- Fix for: Could not find the table 'public.sourced_candidates' in the schema cache
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sourcing_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  requisition_id UUID REFERENCES public.job_requisitions(id) ON DELETE SET NULL,
  search_title TEXT NOT NULL,
  platforms JSONB NOT NULL DEFAULT '["internal_db"]'::jsonb,
  skills_filter JSONB NOT NULL DEFAULT '[]'::jsonb,
  min_experience NUMERIC(4,1) DEFAULT 0,
  max_experience NUMERIC(4,1),
  location TEXT,
  status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
  total_results_count INT NOT NULL DEFAULT 0,
  executed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sourced_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  search_id UUID NOT NULL REFERENCES public.sourcing_searches(id) ON DELETE CASCADE,
  requisition_id UUID REFERENCES public.job_requisitions(id) ON DELETE SET NULL,
  external_id TEXT,
  platform TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  profile_url TEXT,
  "current_role" TEXT,
  current_company TEXT,
  experience_years NUMERIC(4,1) DEFAULT 0,
  skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  match_score NUMERIC(5,2) DEFAULT 0,
  skill_score NUMERIC(5,2) DEFAULT 0,
  experience_score NUMERIC(5,2) DEFAULT 0,
  role_score NUMERIC(5,2) DEFAULT 0,
  ai_reasoning JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_shortlisted BOOLEAN NOT NULL DEFAULT FALSE,
  shortlisted_candidate_id UUID REFERENCES public.candidates(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sourcing_searches_org ON public.sourcing_searches(organization_id);
CREATE INDEX IF NOT EXISTS idx_sourced_cand_search ON public.sourced_candidates(search_id);
CREATE INDEX IF NOT EXISTS idx_sourced_cand_req ON public.sourced_candidates(requisition_id);
CREATE INDEX IF NOT EXISTS idx_sourced_cand_org ON public.sourced_candidates(organization_id);

-- Enable RLS
ALTER TABLE public.sourcing_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sourced_candidates ENABLE ROW LEVEL SECURITY;

-- Policies for sourcing_searches
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sourcing_searches' AND policyname = 'sourcing_searches_tenant_isolation'
  ) THEN
    CREATE POLICY sourcing_searches_tenant_isolation ON public.sourcing_searches
      FOR ALL USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
  END IF;
END $$;

-- Policies for sourced_candidates
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sourced_candidates' AND policyname = 'sourced_candidates_tenant_isolation'
  ) THEN
    CREATE POLICY sourced_candidates_tenant_isolation ON public.sourced_candidates
      FOR ALL USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
  END IF;
END $$;

-- Service role bypass policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sourcing_searches' AND policyname = 'service_role_sourcing_searches'
  ) THEN
    CREATE POLICY service_role_sourcing_searches ON public.sourcing_searches
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sourced_candidates' AND policyname = 'service_role_sourced_candidates'
  ) THEN
    CREATE POLICY service_role_sourced_candidates ON public.sourced_candidates
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Reload Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';
