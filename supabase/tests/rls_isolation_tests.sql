-- ============================================================
-- AttendX v2 — RLS Isolation Assertion Harness
-- Run via psql -d attendx_db -f supabase/tests/rls_isolation_tests.sql
-- EXITS NON-ZERO (RAISE EXCEPTION) IF ANY LEAK OR BYPASS OCCURS
-- ============================================================

DO $test_harness$
DECLARE
  v_count INTEGER;
  v_rls_enabled BOOLEAN;
BEGIN
  -- ------------------------------------------------------------
  -- 0. PRE-FLIGHT: Ensure RLS is active on key tables
  -- ------------------------------------------------------------
  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
  WHERE pg_namespace.nspname = 'public' AND pg_class.relname = 'profiles';

  IF NOT COALESCE(v_rls_enabled, FALSE) THEN
    RAISE EXCEPTION 'RLS ASSERTION FAILURE: RLS is DISABLED on profiles table!';
  END IF;

  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
  WHERE pg_namespace.nspname = 'public' AND pg_class.relname = 'attendance_records';

  IF NOT COALESCE(v_rls_enabled, FALSE) THEN
    RAISE EXCEPTION 'RLS ASSERTION FAILURE: RLS is DISABLED on attendance_records table!';
  END IF;

  RAISE NOTICE 'Pre-flight check passed: RLS is enabled on target tables.';

  -- ------------------------------------------------------------
  -- TEST 1: Acme Employee reading Globex profiles
  -- ------------------------------------------------------------
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-555555555555', true);

  SELECT COUNT(*) INTO v_count
  FROM profiles
  WHERE tenant_id = '22222222-0000-0000-0000-000000000002';

  IF v_count > 0 THEN
    RAISE EXCEPTION 'RLS ISOLATION FAILURE [Test 1]: Acme employee saw % Globex profiles!', v_count;
  END IF;
  RAISE NOTICE 'Test 1 Passed: Cross-tenant profile isolation verified.';

  -- ------------------------------------------------------------
  -- TEST 2: Acme Employee reading Globex attendance records
  -- ------------------------------------------------------------
  SELECT COUNT(*) INTO v_count
  FROM attendance_records
  WHERE tenant_id = '22222222-0000-0000-0000-000000000002';

  IF v_count > 0 THEN
    RAISE EXCEPTION 'RLS ISOLATION FAILURE [Test 2]: Acme employee saw % Globex attendance records!', v_count;
  END IF;
  RAISE NOTICE 'Test 2 Passed: Cross-tenant attendance isolation verified.';

  -- ------------------------------------------------------------
  -- TEST 3: Acme Employee reading Attrition Risk Scores (HR Only)
  -- ------------------------------------------------------------
  SELECT COUNT(*) INTO v_count
  FROM attrition_risk_scores;

  IF v_count > 0 THEN
    RAISE EXCEPTION 'RLS PRIVILEGE FAILURE [Test 3]: Employee saw % attrition risk score records!', v_count;
  END IF;
  RAISE NOTICE 'Test 3 Passed: Attrition risk score HR-only protection verified.';

  -- ------------------------------------------------------------
  -- TEST 4: Acme Employee reading Audit Log (Admin Only)
  -- ------------------------------------------------------------
  SELECT COUNT(*) INTO v_count
  FROM audit_log;

  IF v_count > 0 THEN
    RAISE EXCEPTION 'RLS PRIVILEGE FAILURE [Test 4]: Non-admin employee saw % audit log entries!', v_count;
  END IF;
  RAISE NOTICE 'Test 4 Passed: Audit log admin-only protection verified.';

  -- ------------------------------------------------------------
  -- TEST 5: Globex Employee reading Acme profiles
  -- ------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-555555555555', true);

  SELECT COUNT(*) INTO v_count
  FROM profiles
  WHERE tenant_id = '11111111-0000-0000-0000-000000000001';

  IF v_count > 0 THEN
    RAISE EXCEPTION 'RLS ISOLATION FAILURE [Test 5]: Globex employee saw % Acme profiles!', v_count;
  END IF;
  RAISE NOTICE 'Test 5 Passed: Reverse cross-tenant profile isolation verified.';

  RAISE NOTICE '=======================================================';
  RAISE NOTICE 'SUCCESS: All 5 RLS isolation assertion tests PASSED!';
  RAISE NOTICE '=======================================================';
END $test_harness$;
