#!/usr/bin/env bash
# Nightly backup of the AttendX database (including logins) and stored files,
# kept 14 days in /opt/attendx/backups. Run by root's cron, e.g.
#   15 2 * * * /opt/attendx/app/deploy/hostinger/backup.sh >> /var/log/attendx-backup.log 2>&1
set -euo pipefail
STACK=/opt/attendx/app/deploy/hostinger/stack
OUT=/opt/attendx/backups
KEEP_DAYS=14
stamp=$(date -u +%Y-%m-%d_%H%M)
mkdir -p "$OUT" && chmod 700 "$OUT"
set -a; . "$STACK/.env"; set +a
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h 127.0.0.1 -p 54324 -U postgres -d postgres \
  --format=custom --no-owner --file="$OUT/db_$stamp.dump"
tar -C "$STACK/volumes" -czf "$OUT/files_$stamp.tgz" storage
pg_restore --list "$OUT/db_$stamp.dump" >/dev/null   # prove the dump is readable
find "$OUT" -type f -mtime +$KEEP_DAYS -delete
echo "$(date -u +%FT%TZ) backup ok: $(du -h "$OUT/db_$stamp.dump" | cut -f1) db, $(du -h "$OUT/files_$stamp.tgz" | cut -f1) files"
