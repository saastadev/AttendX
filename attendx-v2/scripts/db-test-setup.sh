#!/usr/bin/env bash
# ============================================================
# Provision a local Postgres for the real RLS suite.
#   npm run db:test:setup && npm run test:rls
# ============================================================
set -euo pipefail
DB_NAME="${PGDATABASE:-attendx_test}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

command -v psql >/dev/null || { echo "psql not found. Install PostgreSQL 15+."; exit 1; }
pg_isready -q || { echo "Postgres is not accepting connections."; exit 1; }

# Roles are CLUSTER-wide, not per-database, so a stale supabase_auth_admin from
# a previous run survives DROP DATABASE and makes migration 001 believe it is
# running on managed Supabase -- it then skips creating the auth schema shim.
psql -d postgres -q -c "DROP ROLE IF EXISTS supabase_auth_admin;" 2>/dev/null || true

echo "==> Recreating database: $DB_NAME"
psql -d postgres -q -c "DROP DATABASE IF EXISTS $DB_NAME;"
psql -d postgres -q -c "CREATE DATABASE $DB_NAME;"

echo "==> Bootstrapping Supabase-equivalent roles"
psql -d "$DB_NAME" -q -v ON_ERROR_STOP=1 -f "$ROOT/attendx-v2/tests/db/00_bootstrap_supabase_roles.sql"

echo "==> Applying migrations"
for m in "$ROOT"/supabase/migrations/*.sql; do
  printf '    %s\n' "$(basename "$m")"
  psql -d "$DB_NAME" -q -v ON_ERROR_STOP=1 -f "$m"
done

# Seed demo tenants/users. tests/rls.test.js asserts POSITIVE CONTROLS against
# these fixture identities -- without the seed those users do not exist and the
# controls correctly fail (a user who sees nothing would otherwise satisfy every
# "sees 0 rows of the other tenant" assertion trivially).
echo "==> Loading seed data"
for s in "$ROOT"/supabase/seed/*.sql; do
  [ -e "$s" ] || continue
  printf '    %s\n' "$(basename "$s")"
  psql -d "$DB_NAME" -q -v ON_ERROR_STOP=1 -f "$s"
done

TABLES=$(psql -d "$DB_NAME" -tAc "SELECT count(*) FROM pg_tables WHERE schemaname='public';")
echo "==> Ready: $TABLES public tables."
echo "    DATABASE_URL=postgresql://localhost:5432/$DB_NAME npm run test:rls"
