#!/usr/bin/env bash
# Applies supabase/migrations/*.sql to the AttendX database, in order, once
# each. Applied files are recorded in deploy_meta.applied_migrations, so this
# is safe to re-run after every deploy. Run as root on the server.
set -euo pipefail
cd "$(dirname "$0")"
set -a; . stack/.env; set +a
PSQL=(psql -h 127.0.0.1 -p 54324 -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)
export PGPASSWORD="$POSTGRES_PASSWORD"

# The auth service creates auth.users on first start; the app's tables point at
# it, so wait until it exists.
for i in $(seq 1 60); do
  "${PSQL[@]}" -tAc "select to_regclass('auth.users') is not null" | grep -q t && break
  [ "$i" = 60 ] && { echo "auth.users never appeared; is the auth container healthy?"; exit 1; }
  sleep 2
done

"${PSQL[@]}" -c "create schema if not exists deploy_meta;
  create table if not exists deploy_meta.applied_migrations(
    name text primary key, applied_at timestamptz not null default now());
  revoke all on schema deploy_meta from public, anon, authenticated;"

for f in ../../supabase/migrations/*.sql; do
  name="$(basename "$f")"
  done_already=$("${PSQL[@]}" -tAc "select 1 from deploy_meta.applied_migrations where name='$name'")
  [ -n "$done_already" ] && continue
  echo "applying $name"
  "${PSQL[@]}" -f "$f"   # same as CI: statement by statement
  "${PSQL[@]}" -c "insert into deploy_meta.applied_migrations(name) values ('$name')"
done
echo "migrations up to date: $("${PSQL[@]}" -tAc 'select count(*) from deploy_meta.applied_migrations') applied"
