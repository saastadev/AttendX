#!/usr/bin/env bash
# Copies AttendX's live data from Supabase Cloud into this server's database:
# users WITH their password hashes (so nobody has to reset), every public
# table, and every storage bucket's files. Run as root on the VPS, after
# apply-migrations.sh. Safe to re-run: it empties the destination first, so the
# last run is the one that counts. Do a final run at cut-over.
#
# The cloud credentials are read from a root-only file you create yourself on
# the server, so they never appear in chat, git or shell history:
#   install -m 600 /dev/null /root/attendx-cloud.env && nano /root/attendx-cloud.env
#     CLOUD_DB_URL=postgresql://postgres.<ref>:<db-password>@<pooler-host>:5432/postgres
#     CLOUD_URL=https://<ref>.supabase.co
#     CLOUD_SERVICE_KEY=<service_role key>
#   ./deploy/hostinger/migrate-from-supabase.sh
# CLOUD_DB_URL: Supabase dashboard -> Connect -> Session pooler. Delete the file
# after the final run and reset the Supabase database password.
set -euo pipefail
cd "$(dirname "$0")"
CRED=/root/attendx-cloud.env
[ -f "$CRED" ] || { echo "missing $CRED (see header)"; exit 1; }
[ "$(stat -c %a "$CRED")" = "600" ] || { echo "$CRED must be mode 600"; exit 1; }
set -a; . "$CRED"; . stack/.env; set +a
: "${CLOUD_DB_URL:?}" "${CLOUD_URL:?}" "${CLOUD_SERVICE_KEY:?}"

LOCAL_DB="postgresql://postgres:${POSTGRES_PASSWORD}@127.0.0.1:54324/postgres"
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT; chmod 700 "$WORK"

echo "-- 1. Reading the cloud database (data only; schema here comes from migrations)"
mapfile -t TABLES < <(psql "$LOCAL_DB" -tAc "select 'public.'||quote_ident(tablename) from pg_tables where schemaname='public' order by 1")
mapfile -t CLOUD_TABLES < <(psql "$CLOUD_DB_URL" -tAc "select 'public.'||quote_ident(tablename) from pg_tables where schemaname='public' order by 1")
# Tables that exist in the cloud but not here would be silently lost: stop.
MISSING=$(comm -13 <(printf '%s\n' "${TABLES[@]}" | sort) <(printf '%s\n' "${CLOUD_TABLES[@]}" | sort))
if [ -n "$MISSING" ]; then
  echo "Cloud has tables this schema lacks (add a migration first):"; echo "$MISSING"; exit 1
fi
TABLE_ARGS=(); for t in "${TABLES[@]}"; do
  printf '%s\n' "${CLOUD_TABLES[@]}" | grep -qx "$t" && TABLE_ARGS+=(-t "$t")
done
pg_dump "$CLOUD_DB_URL" --data-only --no-owner --no-privileges \
  -t auth.users -t auth.identities "${TABLE_ARGS[@]}" \
  --file="$WORK/data.sql" 2>"$WORK/dump.err" || { cat "$WORK/dump.err"; exit 1; }
echo "   $(grep -c '^COPY ' "$WORK/data.sql") tables read"

echo "-- 2. Emptying this server's copy"
psql "$LOCAL_DB" -v ON_ERROR_STOP=1 -q <<SQL
TRUNCATE $(IFS=,; echo "${TABLES[*]}") RESTART IDENTITY CASCADE;
TRUNCATE auth.identities, auth.users CASCADE;
SQL

echo "-- 3. Writing it here (replica mode: foreign keys checked after load)"
{ echo "SET session_replication_role = replica;"; cat "$WORK/data.sql"; echo "SET session_replication_role = origin;"; } \
  | psql "$LOCAL_DB" -v ON_ERROR_STOP=1 -q >"$WORK/restore.log" 2>&1 || { tail -20 "$WORK/restore.log"; exit 1; }
# Materialised views are not copied as data; rebuild them.
psql "$LOCAL_DB" -q -c "do \$\$ declare v record; begin for v in select schemaname, matviewname from pg_matviews where schemaname='public' loop execute format('refresh materialized view %I.%I', v.schemaname, v.matviewname); end loop; end \$\$;"

echo "-- 4. Copying storage files (every bucket, same public/private setting)"
cd ../../attendx-v2
sudo -u attendx -H env CLOUD_URL="$CLOUD_URL" CLOUD_SERVICE_KEY="$CLOUD_SERVICE_KEY" \
  LOCAL_URL="http://127.0.0.1:8010" LOCAL_SERVICE_KEY="$SERVICE_ROLE_KEY" node --input-type=module -e '
import { createRequire } from "node:module";
const { createClient } = createRequire(process.cwd() + "/package.json")("@supabase/supabase-js");
const o = { auth: { persistSession: false } };
const cloud = createClient(process.env.CLOUD_URL, process.env.CLOUD_SERVICE_KEY, o);
const here = createClient(process.env.LOCAL_URL, process.env.LOCAL_SERVICE_KEY, o);
const { data: buckets, error } = await cloud.storage.listBuckets();
if (error) throw error;
for (const b of buckets) {
  await here.storage.createBucket(b.name, { public: b.public }).catch(() => {});
  const walk = async (prefix = "") => {
    const { data, error } = await cloud.storage.from(b.name).list(prefix, { limit: 1000 });
    if (error) throw error;
    let n = 0;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (!item.id) { n += await walk(path); continue; }
      const { data: blob, error: e1 } = await cloud.storage.from(b.name).download(path);
      if (e1) throw e1;
      const { error: e2 } = await here.storage.from(b.name).upload(path, blob, { contentType: item.metadata?.mimetype, upsert: true });
      if (e2) throw e2;
      n++;
    }
    return n;
  };
  console.log(`   ${b.name} (${b.public ? "public" : "private"}): ${await walk()} files`);
}'
cd - >/dev/null

echo "-- 5. Pointing stored file links at this server"
OLD="${CLOUD_URL%/}/storage/v1/"
NEW="${SUPABASE_PUBLIC_URL%/}/storage/v1/"
psql "$LOCAL_DB" -v ON_ERROR_STOP=1 -tA <<SQL
DO \$\$
DECLARE r record; n int; total int := 0;
BEGIN
  FOR r IN SELECT table_name, column_name FROM information_schema.columns c
           JOIN pg_tables t ON t.schemaname = c.table_schema AND t.tablename = c.table_name
           WHERE c.table_schema = 'public' AND c.data_type IN ('text', 'character varying') LOOP
    EXECUTE format('UPDATE public.%I SET %I = replace(%I, %L, %L) WHERE %I LIKE %L',
      r.table_name, r.column_name, r.column_name, '$OLD', '$NEW', r.column_name, '%' || '$OLD' || '%');
    GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  END LOOP;
  RAISE NOTICE '% file links updated', total;
END \$\$;
SQL

echo "-- 6. Row counts, cloud vs here (must match)"
mismatch=0
for t in auth.users auth.identities "${TABLE_ARGS[@]/#-t/}"; do
  [ "$t" = "" ] && continue
  c=$(psql "$CLOUD_DB_URL" -tAc "select count(*) from $t"); h=$(psql "$LOCAL_DB" -tAc "select count(*) from $t")
  [ "$c" = "$h" ] || { echo "   MISMATCH $t: cloud=$c here=$h"; mismatch=1; }
done
[ $mismatch = 0 ] && echo "   all tables match"
echo "Done. Sessions don't carry over: everyone signs in once more with the same password."
