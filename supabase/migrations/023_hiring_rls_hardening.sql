-- ============================================================
-- AttendX v2 — Migration 023: Hiring Module RLS Hardening
-- Enforces strict role-based access control (RBAC) and multi-tenant
-- isolation across all 28 hiring tables at the database level.
--
-- Security Rules:
-- 1. Restrict workforce recruitment data to SUPERADMIN, ADMIN, HR, and MANAGER.
-- 2. Explicitly DENY ordinary EMPLOYEE access from recruitment records.
-- 3. Scope queries strictly by organization_id = public.get_my_tenant_id().
-- 4. Audit logs (hiring_audit_logs) are append-only:
--    - SELECT: SUPERADMIN, ADMIN, HR, service_role
--    - INSERT: SUPERADMIN, ADMIN, HR, MANAGER, service_role
--    - UPDATE / DELETE: service_role only
-- 5. Funnel events (hiring_funnel_events) are immutable:
--    - SELECT / INSERT: SUPERADMIN, ADMIN, HR, MANAGER, service_role
--    - UPDATE / DELETE: service_role only
-- 6. Offer portal tokens & candidate-facing tables:
--    - Public / candidate actions are mediated via backend service_role.
--    - Direct workforce access restricted to authorized roles within tenant.
--    - Anonymous (anon) direct table access blocked (fail-closed).
-- 7. Both USING and WITH CHECK clauses are enforced on all write policies.
-- ============================================================

-- Ensure pgcrypto extension is active
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
DECLARE
  tbl text;
  -- 26 standard hiring tables (Workforce: SUPERADMIN, ADMIN, HR, MANAGER)
  standard_tables text[] := ARRAY[
    'job_requisitions',
    'job_requisition_skills',
    'candidates',
    'candidate_skills',
    'candidate_resumes',
    'sourcing_searches',
    'sourced_candidates',
    'outreach_campaigns',
    'outreach_templates',
    'outreach_messages',
    'outreach_followups',
    'ai_voice_calls',
    'assessments',
    'job_applications',
    'ai_screenings',
    'candidate_assessments',
    'interviews',
    'candidate_evaluations',
    'offer_portal_tokens',
    'job_offers',
    'onboarding_processes',
    'onboarding_documents',
    'onboarding_tasks',
    'hiring_analytics_snapshots',
    'hiring_ai_recommendations',
    'org_score_weights'
  ];
BEGIN
  -- ----------------------------------------------------------
  -- 1. Standard Hiring Tables: Restrict to SUPERADMIN, ADMIN, HR, MANAGER
  -- ----------------------------------------------------------
  FOREACH tbl IN ARRAY standard_tables LOOP
    -- Enable and Force RLS
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', tbl);

    -- Drop legacy policies
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', tbl || '_tenant_isolation', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', tbl || '_workforce_isolation', tbl);

    -- Create hardened workforce isolation policy (USING + WITH CHECK)
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (
        (organization_id = public.get_my_tenant_id() AND public.has_role(ARRAY[''SUPERADMIN'', ''ADMIN'', ''HR'', ''MANAGER'']::user_role[]))
        OR auth.role() = ''service_role''
      ) WITH CHECK (
        (organization_id = public.get_my_tenant_id() AND public.has_role(ARRAY[''SUPERADMIN'', ''ADMIN'', ''HR'', ''MANAGER'']::user_role[]))
        OR auth.role() = ''service_role''
      );',
      tbl || '_workforce_isolation', tbl
    );
  END LOOP;

  -- ----------------------------------------------------------
  -- 2. Audit Logs (hiring_audit_logs): Tamper-evident, Append-only
  -- ----------------------------------------------------------
  EXECUTE 'ALTER TABLE public.hiring_audit_logs ENABLE ROW LEVEL SECURITY;';
  EXECUTE 'ALTER TABLE public.hiring_audit_logs FORCE ROW LEVEL SECURITY;';
  EXECUTE 'DROP POLICY IF EXISTS hiring_audit_logs_tenant_isolation ON public.hiring_audit_logs;';
  EXECUTE 'DROP POLICY IF EXISTS hiring_audit_logs_select ON public.hiring_audit_logs;';
  EXECUTE 'DROP POLICY IF EXISTS hiring_audit_logs_insert ON public.hiring_audit_logs;';
  EXECUTE 'DROP POLICY IF EXISTS hiring_audit_logs_update ON public.hiring_audit_logs;';
  EXECUTE 'DROP POLICY IF EXISTS hiring_audit_logs_delete ON public.hiring_audit_logs;';

  -- SELECT: SUPERADMIN, ADMIN, HR, service_role (Managers & Employees denied)
  EXECUTE 'CREATE POLICY hiring_audit_logs_select ON public.hiring_audit_logs FOR SELECT USING (
    (organization_id = public.get_my_tenant_id() AND public.has_role(ARRAY[''SUPERADMIN'', ''ADMIN'', ''HR'']::user_role[]))
    OR auth.role() = ''service_role''
  );';

  -- INSERT: SUPERADMIN, ADMIN, HR, MANAGER, service_role (append-only)
  EXECUTE 'CREATE POLICY hiring_audit_logs_insert ON public.hiring_audit_logs FOR INSERT WITH CHECK (
    (organization_id = public.get_my_tenant_id() AND public.has_role(ARRAY[''SUPERADMIN'', ''ADMIN'', ''HR'', ''MANAGER'']::user_role[]))
    OR auth.role() = ''service_role''
  );';

  -- UPDATE: service_role ONLY (audits cannot be modified by users)
  EXECUTE 'CREATE POLICY hiring_audit_logs_update ON public.hiring_audit_logs FOR UPDATE USING (
    auth.role() = ''service_role''
  ) WITH CHECK (
    auth.role() = ''service_role''
  );';

  -- DELETE: service_role ONLY (audits cannot be deleted by users)
  EXECUTE 'CREATE POLICY hiring_audit_logs_delete ON public.hiring_audit_logs FOR DELETE USING (
    auth.role() = ''service_role''
  );';

  -- ----------------------------------------------------------
  -- 3. Funnel Events (hiring_funnel_events): Immutable Stage Event Stream
  -- ----------------------------------------------------------
  EXECUTE 'ALTER TABLE public.hiring_funnel_events ENABLE ROW LEVEL SECURITY;';
  EXECUTE 'ALTER TABLE public.hiring_funnel_events FORCE ROW LEVEL SECURITY;';
  EXECUTE 'DROP POLICY IF EXISTS hiring_funnel_events_tenant_isolation ON public.hiring_funnel_events;';
  EXECUTE 'DROP POLICY IF EXISTS hiring_funnel_events_select ON public.hiring_funnel_events;';
  EXECUTE 'DROP POLICY IF EXISTS hiring_funnel_events_insert ON public.hiring_funnel_events;';
  EXECUTE 'DROP POLICY IF EXISTS hiring_funnel_events_update ON public.hiring_funnel_events;';
  EXECUTE 'DROP POLICY IF EXISTS hiring_funnel_events_delete ON public.hiring_funnel_events;';

  -- SELECT: SUPERADMIN, ADMIN, HR, MANAGER, service_role
  EXECUTE 'CREATE POLICY hiring_funnel_events_select ON public.hiring_funnel_events FOR SELECT USING (
    (organization_id = public.get_my_tenant_id() AND public.has_role(ARRAY[''SUPERADMIN'', ''ADMIN'', ''HR'', ''MANAGER'']::user_role[]))
    OR auth.role() = ''service_role''
  );';

  -- INSERT: SUPERADMIN, ADMIN, HR, MANAGER, service_role (append-only)
  EXECUTE 'CREATE POLICY hiring_funnel_events_insert ON public.hiring_funnel_events FOR INSERT WITH CHECK (
    (organization_id = public.get_my_tenant_id() AND public.has_role(ARRAY[''SUPERADMIN'', ''ADMIN'', ''HR'', ''MANAGER'']::user_role[]))
    OR auth.role() = ''service_role''
  );';

  -- UPDATE: service_role ONLY
  EXECUTE 'CREATE POLICY hiring_funnel_events_update ON public.hiring_funnel_events FOR UPDATE USING (
    auth.role() = ''service_role''
  ) WITH CHECK (
    auth.role() = ''service_role''
  );';

  -- DELETE: service_role ONLY
  EXECUTE 'CREATE POLICY hiring_funnel_events_delete ON public.hiring_funnel_events FOR DELETE USING (
    auth.role() = ''service_role''
  );';

END $$;
