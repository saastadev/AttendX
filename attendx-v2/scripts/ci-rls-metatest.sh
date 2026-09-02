#!/usr/bin/env bash
# ============================================================
# RLS META-TEST — the guard against a vacuous suite.
#
# A security suite that still passes when the thing it tests is
# switched off is worse than no suite: it manufactures false
# confidence. This disables RLS on every public table, reruns the
# suite, and FAILS THE BUILD IF THE SUITE PASSES.
# ============================================================
set -uo pipefail
DB_URL="${DATABASE_URL:-postgresql://localhost:5432/attendx_test}"
SUITE="tests/db/rls-real.test.js"

echo "=== [RLS META-TEST] Disabling RLS on every public table ==="
psql "$DB_URL" -tAc \
  "SELECT 'ALTER TABLE public.'||quote_ident(tablename)||' DISABLE ROW LEVEL SECURITY;'
     FROM pg_tables WHERE schemaname='public';" | psql -q "$DB_URL" >/dev/null 2>&1

echo "=== [RLS META-TEST] Re-running suite (it MUST fail) ==="
DATABASE_URL="$DB_URL" node --test "$SUITE" >/tmp/rls-meta.log 2>&1
RESULT=$?

echo "=== [RLS META-TEST] Restoring RLS ==="
psql "$DB_URL" -tAc \
  "SELECT 'ALTER TABLE public.'||quote_ident(tablename)||' ENABLE ROW LEVEL SECURITY;'
     FROM pg_tables WHERE schemaname='public';" | psql -q "$DB_URL" >/dev/null 2>&1
psql "$DB_URL" -tAc \
  "SELECT 'ALTER TABLE public.'||quote_ident(tablename)||' FORCE ROW LEVEL SECURITY;'
     FROM pg_tables WHERE schemaname='public';" | psql -q "$DB_URL" >/dev/null 2>&1

if [ $RESULT -eq 0 ]; then
  echo ""
  echo "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  echo "X  META-TEST FAILED: the RLS suite PASSED with RLS DISABLED."
  echo "X  The suite is vacuous — it is not testing what it claims."
  echo "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  tail -25 /tmp/rls-meta.log
  exit 1
fi

FAILED=$(grep -cE '^ +✖|not ok' /tmp/rls-meta.log 2>/dev/null || echo 0)
echo "✓ META-TEST PASSED: suite correctly failed with RLS off (${FAILED} assertions caught it)."
exit 0
