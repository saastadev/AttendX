#!/usr/bin/env bash
# Run ONCE on the server, as root, from /opt/attendx/app:
#   ./deploy/hostinger/setup-secrets.sh https://attendx.example.com
#
# Writes two private files (mode 600, gitignored, never committed or printed):
#   deploy/hostinger/stack/.env   secrets for the data services
#   attendx-v2/.env.production    what the Next.js app needs at build + run time
#
# Refuses to overwrite: changing POSTGRES_PASSWORD after the database exists
# locks the services out of it, and a new JWT secret signs everyone out.
set -euo pipefail
cd "$(dirname "$0")"
STACK_ENV=stack/.env
APP_ENV=../../attendx-v2/.env.production
for f in "$STACK_ENV" "$APP_ENV"; do
  [ -e "$f" ] && { echo "$f already exists, not touching it."; exit 1; }
done

PUBLIC_URL="${1:?usage: setup-secrets.sh https://your-domain}"
PUBLIC_URL="${PUBLIC_URL%/}"
case "$PUBLIC_URL" in https://*) ;; *) echo "Use an https:// URL."; exit 1;; esac

rand() { openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-"$1"; }
JWT_SECRET="$(rand 64)"
jwt() { # HS256 JWT for a role, valid 10 years (same scheme Supabase uses)
  JWT_SECRET="$JWT_SECRET" ROLE="$1" node -e '
    const c = require("crypto");
    const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const body = b({ alg: "HS256", typ: "JWT" }) + "." + b({ role: process.env.ROLE, iss: "supabase", iat: now, exp: now + 10 * 365 * 86400 });
    console.log(body + "." + c.createHmac("sha256", process.env.JWT_SECRET).update(body).digest("base64url"));'
}
ANON_KEY="$(jwt anon)"
SERVICE_ROLE_KEY="$(jwt service_role)"

umask 077
cat > "$STACK_ENV" <<ENV
# Generated $(date -u +%F) by setup-secrets.sh. Keep private, never commit.
POSTGRES_PASSWORD=$(rand 40)
JWT_SECRET=$JWT_SECRET
JWT_EXPIRY=3600
ANON_KEY=$ANON_KEY
SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY

SUPABASE_PUBLIC_URL=$PUBLIC_URL
API_EXTERNAL_URL=$PUBLIC_URL/auth/v1
SITE_URL=$PUBLIC_URL
ADDITIONAL_REDIRECT_URLS=$PUBLIC_URL/**

# Password-reset emails. Empty = reset emails do not send.
# Resend SMTP: host smtp.resend.com, port 465, user "resend", pass = API key.
ENABLE_EMAIL_AUTOCONFIRM=true
SMTP_ADMIN_EMAIL=
SMTP_HOST=
SMTP_PORT=465
SMTP_USER=
SMTP_PASS=
SMTP_SENDER_NAME=AttendX
ENV

cat > "$APP_ENV" <<ENV
# Generated $(date -u +%F) by deploy/hostinger/setup-secrets.sh. Keep private.
# NEXT_PUBLIC_* values are baked into the build: rebuild after changing them.
NEXT_PUBLIC_SUPABASE_URL=$PUBLIC_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
NEXT_PUBLIC_APP_URL=$PUBLIC_URL
NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS=false

# Server-only.
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
SUPABASE_INTERNAL_URL=http://127.0.0.1:8010
ATTENDX_ENV=production

# Fill in to enable these features (leave empty to keep them off):
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
RESEND_API_KEY=
EMAIL_FROM_ADDRESS=
ENV
echo "Wrote $STACK_ENV and $APP_ENV for $PUBLIC_URL (both mode 600)."
