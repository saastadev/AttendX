#!/usr/bin/env bash
# Ships this working copy to the VPS, applies new migrations, rebuilds and
# reloads AttendX. Run from the repo root on your machine:
#   ./deploy/hostinger/deploy.sh
#   VPS=root@host SSH_KEY=~/.ssh/key ./deploy/hostinger/deploy.sh
#
# Never sends or touches secrets (.env*) or data (stack/volumes), and only
# hands app CODE to the attendx user: a blanket chown once broke fAImily's
# database by changing the owner of Postgres's own files.
set -euo pipefail
VPS="${VPS:-root@187.127.159.192}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
APP=/opt/attendx/app
cd "$(dirname "$0")/../.."
SSH=(ssh -i "$SSH_KEY" -o IdentitiesOnly=yes "$VPS")

rsync -az --delete -e "ssh -i $SSH_KEY -o IdentitiesOnly=yes" \
  --exclude .git --exclude node_modules --exclude .next \
  --exclude '.env' --exclude '.env.*' \
  --exclude 'deploy/hostinger/stack/.env' --exclude 'deploy/hostinger/stack/volumes' \
  --exclude handoff --exclude '*.pdf' --exclude '*.png' --exclude '*.apk' --exclude '*.aab' \
  --include 'attendx-v2/***' --include 'supabase/***' --include 'deploy/***' \
  --include '.nvmrc' --exclude '*' \
  ./ "$VPS:$APP/"

"${SSH[@]}" "set -e
cd $APP
chown -R attendx:attendx attendx-v2 supabase deploy/hostinger/*.sh deploy/hostinger/*.cjs deploy/hostinger/nginx deploy/hostinger/stack/docker-compose.yml deploy/hostinger/stack/db
chown attendx:attendx attendx-v2/.env.production 2>/dev/null || true
./deploy/hostinger/apply-migrations.sh
sudo -u attendx -H bash -c 'cd attendx-v2 && npm ci --no-audit --no-fund --silent && npm run build >/tmp/attendx-build.log 2>&1 || { tail -40 /tmp/attendx-build.log; exit 1; }'
sudo -u attendx -H pm2 startOrReload deploy/hostinger/ecosystem.config.cjs --update-env >/dev/null
sudo -u attendx -H pm2 save >/dev/null
sleep 4
curl -fsS http://127.0.0.1:4200/api/health && echo"
