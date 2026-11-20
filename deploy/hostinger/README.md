# Deploying AttendX to the Saasta Hostinger VPS

AttendX runs on the same Hostinger server as fAImily and the Work Portal, as a
**fully separate** project: its own database, auth service, keys, Unix user,
PM2 process and nginx site. Nothing is shared with the other apps, and none of
their files, containers, ports or settings are touched.

Pattern copied from fAImily (`~/Projects/SureshUSClient/production/deploy`),
which already runs this way on this server.

## Server

| | |
|---|---|
| Host | `root@187.127.159.192` (`srv2014708.hstgr.cloud`), Ubuntu, Mumbai |
| SSH | `ssh -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes root@187.127.159.192` |
| Free capacity (21 Nov 2026) | ~6 GB RAM available, 87 GB disk free |
| AttendX folder | `/opt/attendx/app` (code), `/opt/attendx/backups` |
| Unix user | `attendx` (PM2 runs as this user) |

## Ports (all on 127.0.0.1, none public)

| Service | AttendX | Already used by other apps |
|---|---|---|
| Postgres | 54324 | 54322, 54323 |
| Auth (GoTrue) | 9997 | 9998, 9999 |
| Database API (PostgREST) | 3004 | 3000, 3002 |
| Storage | 5004 | 5000, 5002 |
| Internal gateway (nginx) | 8010 | 8000 |
| Next.js app (PM2) | 4200 | 4000, 4002, 4100 |

Public traffic only reaches nginx on 80/443.

## How AttendX differs from fAImily

- **`/rest/v1/` is public.** About 20 AttendX pages query the database from the
  browser. This is safe because row-level security is forced on every table and
  CI proves isolation with a real-database suite plus a meta-test that fails if
  RLS is ever switched off.
- **Signed storage URLs are public, read-only.** Attendance selfies are in a
  private bucket and viewed through 7-day signed URLs.
- **Admin calls use the internal gateway.** `/auth/v1/admin` is blocked
  publicly; the app's service-role code uses `SUPABASE_INTERNAL_URL`
  (`http://127.0.0.1:8010`).
- **Open sign-up is off** in the auth service. Accounts come only from admin
  provisioning and invites, both of which use the admin API.
- **No realtime container.** AttendX doesn't use Supabase Realtime.
- **Next.js server app**, not a static build: built on the server, run with
  `next start` under PM2.

## First-time setup (in order)

1. **DNS.** Point the chosen domain's A record at `187.127.159.192`.
   For a test run without DNS, `attendx.187-127-159-192.sslip.io` resolves to
   the server automatically.
2. **Host.** Copy the code, then on the server as root:
   `./deploy/hostinger/install-server.sh`
3. **Secrets.** `./deploy/hostinger/setup-secrets.sh https://<domain>`
   Writes `deploy/hostinger/stack/.env` and `attendx-v2/.env.production`
   (mode 600, never committed). Fill in SMTP, OpenAI and Resend keys there if
   those features are wanted.
4. **Data services.** `cd deploy/hostinger/stack && docker compose up -d`, then
   wait until `docker compose ps` shows db, auth and storage healthy.
5. **Schema.** `./deploy/hostinger/apply-migrations.sh`
6. **nginx + HTTPS.** `./deploy/hostinger/install-nginx.sh <domain>`, then
   `certbot --nginx -d <domain> --redirect`, then re-run `install-nginx.sh`
   to enable HTTP/2.
7. **App.** From your machine: `./deploy/hostinger/deploy.sh`
8. **First admin (fresh database only).** On the server:
   `cd /opt/attendx/app/attendx-v2 && sudo -u attendx node ../deploy/hostinger/create-first-admin.mjs --company "..." --slug ... --timezone Asia/Kolkata --email ... --name "..."`
   The admin gets a one-time password and must change it on first sign-in.
   **Never load `supabase/seed/` in production**: it creates demo accounts
   with a shared password.
9. **Backups.** Add to root's crontab:
   `15 2 * * * /opt/attendx/app/deploy/hostinger/backup.sh >> /var/log/attendx-backup.log 2>&1`

## Routine deploys

From the repo root: `./deploy/hostinger/deploy.sh`. It syncs code (never
secrets or data), applies any new migrations once, rebuilds, reloads PM2 and
checks `/api/health`.

## Useful commands (on the server)

| What | Command |
|---|---|
| App logs | `sudo -u attendx pm2 logs attendx` |
| Restart app | `sudo -u attendx pm2 reload attendx` |
| Data services | `cd /opt/attendx/app/deploy/hostinger/stack && docker compose ps` |
| Database shell | `PGPASSWORD=... psql -h 127.0.0.1 -p 54324 -U postgres` |
| Applied migrations | `select * from deploy_meta.applied_migrations;` |

## Lessons carried over from fAImily

- Never `chown -R` the database volume. Postgres files must stay owned by `100:101`.
- The storage healthcheck uses the service name (`storage:5000`), not localhost.
- Ubuntu's `nginx.conf` already sets `server_tokens`; don't add another.
- Changing `POSTGRES_PASSWORD` or the JWT secret after setup locks services out
  or signs everyone out. `setup-secrets.sh` refuses to overwrite.
