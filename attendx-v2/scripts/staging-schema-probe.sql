-- ============================================================
-- AttendX Module 4: Staging Schema Preflight & Inventory Probe
-- Purpose: Rigorous read-only audit of all 28 hiring tables, 15 triggers,
-- functions, views, constraints, indexes, columns, RLS policies,
-- and migration history against target database.
--
-- Execution: psql "$TARGET_DATABASE_URL" -f scripts/staging-schema-probe.sql
-- Zero False Pass Policy (§34.1, §35)
-- ============================================================

\pset footer off
\pset title 'AttendX Module 4: Hiring Tables & RLS Policy Inventory'

WITH expected_tables AS (
  SELECT unnest(ARRAY[
    'job_requisitions', 'job_requisition_skills', 'candidates', 'candidate_skills',
    'candidate_resumes', 'sourcing_searches', 'sourced_candidates', 'outreach_campaigns',
    'outreach_templates', 'outreach_messages', 'outreach_followups', 'ai_voice_calls',
    'assessments', 'job_applications', 'ai_screenings', 'candidate_assessments',
    'hiring_funnel_events', 'hiring_audit_logs', 'interviews', 'candidate_evaluations',
    'offer_portal_tokens', 'job_offers', 'onboarding_processes', 'onboarding_documents',
    'onboarding_tasks', 'hiring_analytics_snapshots', 'hiring_ai_recommendations', 'org_score_weights'
  ]) AS tbl
)
SELECT
  e.tbl AS table_name,
  CASE WHEN t.table_name IS NOT NULL THEN 'PRESENT' ELSE 'MISSING' END AS status,
  COALESCE(c.col_count, 0) AS columns,
  COALESCE(tr.trg_count, 0) AS triggers,
  CASE WHEN cls.relrowsecurity THEN 'ENABLED' ELSE 'DISABLED' END AS rls,
  CASE WHEN cls.relforcerowsecurity THEN 'FORCED' ELSE 'NOT_FORCED' END AS rls_forced,
  COALESCE(p.policy_count, 0) AS policies
FROM expected_tables e
LEFT JOIN information_schema.tables t ON t.table_schema = 'public' AND t.table_name = e.tbl
LEFT JOIN (
  SELECT table_name, count(*) AS col_count
  FROM information_schema.columns WHERE table_schema = 'public' GROUP BY table_name
) c ON c.table_name = e.tbl
LEFT JOIN (
  SELECT event_object_table, count(*) AS trg_count
  FROM information_schema.triggers WHERE trigger_schema = 'public' GROUP BY event_object_table
) tr ON tr.event_object_table = e.tbl
LEFT JOIN pg_class cls ON cls.relname = e.tbl AND cls.relnamespace = 'public'::regnamespace
LEFT JOIN (
  SELECT tablename, count(*) AS policy_count
  FROM pg_policies WHERE schemaname = 'public' GROUP BY tablename
) p ON p.tablename = e.tbl
ORDER BY e.tbl;

\pset title 'Verification of All 15 Expected Updated-At Triggers'

WITH expected_triggers AS (
  SELECT unnest(ARRAY[
    'trg_job_requisitions_updated_at',
    'trg_candidates_updated_at',
    'trg_outreach_campaigns_updated_at',
    'trg_outreach_templates_updated_at',
    'trg_ai_voice_calls_updated_at',
    'trg_assessments_updated_at',
    'trg_job_applications_updated_at',
    'trg_ai_screenings_updated_at',
    'trg_interviews_updated_at',
    'trg_candidate_evaluations_updated_at',
    'trg_job_offers_updated_at',
    'trg_onboarding_processes_updated_at',
    'trg_onboarding_documents_updated_at',
    'trg_onboarding_tasks_updated_at',
    'trg_org_score_weights_updated_at'
  ]) AS trigger_name
)
SELECT
  et.trigger_name,
  CASE WHEN t.trigger_name IS NOT NULL THEN 'PRESENT' ELSE 'MISSING' END AS status,
  COALESCE(t.event_object_table, 'N/A') AS attached_table
FROM expected_triggers et
LEFT JOIN information_schema.triggers t
  ON t.trigger_schema = 'public' AND t.trigger_name = et.trigger_name
ORDER BY et.trigger_name;

\pset title 'Auxiliary Functions, Views & Critical Columns'

SELECT
  'function: public.set_hiring_updated_at()' AS object_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'set_hiring_updated_at'
  ) THEN 'PRESENT' ELSE 'MISSING' END AS status
UNION ALL
SELECT
  'function: public.get_my_organization_id()' AS object_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_my_organization_id'
  ) THEN 'PRESENT' ELSE 'MISSING' END AS status
UNION ALL
SELECT
  'function: public.has_role(allowed_roles user_role[])' AS object_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'has_role'
  ) THEN 'PRESENT' ELSE 'MISSING' END AS status
UNION ALL
SELECT
  'policy: public.hiring_audit_logs_select (023)' AS object_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname = 'hiring_audit_logs_select'
  ) THEN 'PRESENT' ELSE 'MISSING' END AS status
UNION ALL
SELECT
  'view: public.organizations' AS object_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'organizations'
  ) THEN 'PRESENT' ELSE 'MISSING' END AS status
UNION ALL
SELECT
  'column: public.onboarding_tasks.is_required (022)' AS object_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'onboarding_tasks' AND column_name = 'is_required'
  ) THEN 'PRESENT' ELSE 'MISSING' END AS status
UNION ALL
SELECT
  'column: public.job_requisitions.work_mode (024)' AS object_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'job_requisitions' AND column_name = 'work_mode'
  ) THEN 'PRESENT' ELSE 'MISSING' END AS status
UNION ALL
SELECT
  'column: public.job_requisitions.opening_date (024)' AS object_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'job_requisitions' AND column_name = 'opening_date'
  ) THEN 'PRESENT' ELSE 'MISSING' END AS status
UNION ALL
SELECT
  'column: public.job_requisitions.target_close_date (024)' AS object_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'job_requisitions' AND column_name = 'target_close_date'
  ) THEN 'PRESENT' ELSE 'MISSING' END AS status;

\pset title 'Critical Foreign Key Relational Constraints'

SELECT
  tc.constraint_name,
  tc.table_name AS from_table,
  kcu.column_name AS from_column,
  ccu.table_name AS to_table,
  ccu.column_name AS to_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('job_applications', 'job_offers', 'onboarding_processes', 'candidate_evaluations')
ORDER BY tc.table_name, tc.constraint_name;

\pset title 'Migration History State (supabase_migrations.schema_migrations)'

SELECT
  table_schema || '.' || table_name AS migration_table,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations') AS exists
FROM (VALUES ('supabase_migrations', 'schema_migrations')) AS t(table_schema, table_name);

\pset title 'Decision Analysis & Rule Classification (Rules A, B, C, D)'

WITH stats AS (
  SELECT
    (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN (
      'job_requisitions', 'job_requisition_skills', 'candidates', 'candidate_skills',
      'candidate_resumes', 'sourcing_searches', 'sourced_candidates', 'outreach_campaigns',
      'outreach_templates', 'outreach_messages', 'outreach_followups', 'ai_voice_calls',
      'assessments', 'job_applications', 'ai_screenings', 'candidate_assessments',
      'hiring_funnel_events', 'hiring_audit_logs', 'interviews', 'candidate_evaluations',
      'offer_portal_tokens', 'job_offers', 'onboarding_processes', 'onboarding_documents',
      'onboarding_tasks', 'hiring_analytics_snapshots', 'hiring_ai_recommendations', 'org_score_weights'
    )) AS tables_present,
    (SELECT count(*) FROM information_schema.triggers WHERE trigger_schema = 'public' AND trigger_name IN (
      'trg_job_requisitions_updated_at', 'trg_candidates_updated_at', 'trg_outreach_campaigns_updated_at',
      'trg_outreach_templates_updated_at', 'trg_ai_voice_calls_updated_at', 'trg_assessments_updated_at',
      'trg_job_applications_updated_at', 'trg_ai_screenings_updated_at', 'trg_interviews_updated_at',
      'trg_candidate_evaluations_updated_at', 'trg_job_offers_updated_at', 'trg_onboarding_processes_updated_at',
      'trg_onboarding_documents_updated_at', 'trg_onboarding_tasks_updated_at', 'trg_org_score_weights_updated_at'
    )) AS triggers_present,
    (SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'set_hiring_updated_at')) AS func_updated_at,
    (SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'onboarding_tasks' AND column_name = 'is_required')) AS has_col_022,
    (SELECT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname = 'hiring_audit_logs_select')) AS has_policy_023,
    (SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'job_requisitions' AND column_name = 'work_mode')) AS has_col_024
)
SELECT
  tables_present || '/28' AS tables_verified,
  triggers_present || '/15' AS triggers_verified,
  CASE
    -- RULE A: Clean baseline (all hiring objects completely absent)
    WHEN tables_present = 0 AND triggers_present = 0 AND NOT func_updated_at THEN
      'DECISION: RULE A — CLEAN BASELINE'
    -- RULE B: Complete, consistent baseline (all 28 tables, 15 triggers, and base function present)
    WHEN tables_present = 28 AND triggers_present = 15 AND func_updated_at THEN
      'DECISION: RULE B — COMPLETE CONSISTENT BASELINE'
    -- RULE C: Partial, inconsistent, or ambiguous schema (drift detected)
    ELSE
      'DECISION: RULE C — PARTIAL / INCONSISTENT / AMBIGUOUS SCHEMA'
  END AS classification,
  CASE
    WHEN tables_present = 0 AND triggers_present = 0 AND NOT func_updated_at THEN
      'ACTION: Apply migrations 019 -> 022 -> 023 -> 024 in sequence with pre-migration snapshot.'
    WHEN tables_present = 28 AND triggers_present = 15 AND func_updated_at THEN
      CASE
        WHEN NOT has_col_022 AND NOT has_policy_023 AND NOT has_col_024 THEN 'ACTION: Skip 019. Apply migrations 022 -> 023 -> 024.'
        WHEN has_col_022 AND NOT has_policy_023 AND NOT has_col_024 THEN 'ACTION: Skip 019 & 022. Apply migrations 023 -> 024.'
        WHEN has_col_022 AND has_policy_023 AND NOT has_col_024 THEN 'ACTION: Skip 019, 022 & 023. Apply migration 024.'
        WHEN has_col_022 AND has_policy_023 AND has_col_024 THEN 'ACTION: Skip 019, 022, 023 & 024 (Schema is already fully applied, hardened and aligned).'
        ELSE 'ACTION: Review migration state before applying.'
      END
    ELSE
      'ACTION: HALT IMMEDIATELY. Do NOT run 019. Do NOT skip 019. Manual reconciliation required.'
  END AS recommended_action
FROM stats;
