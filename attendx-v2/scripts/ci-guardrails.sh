#!/usr/bin/env bash
set -e

echo "=== Running AttendX v2 CI Anti-Fabrication Guardrails ==="

# 1. Check for client-side leakage of SUPABASE_SERVICE_ROLE_KEY
echo "[Guardrail 1] Checking for client-side SUPABASE_SERVICE_ROLE_KEY leakage..."
node scripts/ci-secret-scan.mjs
echo "✓ Client bundle clear of service role key."

# 2. Check for empty catch blocks swallowing errors or returning fake success
echo "[Guardrail 2] Checking for dangerous catch blocks..."
EMPTY_CATCH_COUNT=$(grep -rn "catch\s*{\s*}" app/ components/ hooks/ store/ lib/ 2>/dev/null | wc -l || true)
if [ "$EMPTY_CATCH_COUNT" -gt 0 ]; then
  echo "VIOLATION: Empty catch {} block detected! Errors must be surfaced loudly."
  grep -rn "catch\s*{\s*}" app/ components/ hooks/ store/ lib/ 2>/dev/null
  exit 1
fi
echo "✓ No empty catch blocks found."

# 3. Check route navigation integrity
echo "[Guardrail 3] Checking navigation & empty route directories..."
node --test tests/routes.test.js
echo "✓ Route integrity verified."

echo "=== All CI Anti-Fabrication Guardrails PASSED! ==="
