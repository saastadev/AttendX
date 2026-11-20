#!/usr/bin/env bash
# Installs deploy/hostinger/nginx/attendx.conf for a domain. Run as root.
# Re-run after changing the config; it keeps an existing certificate.
set -euo pipefail
DOMAIN="${1:?usage: install-nginx.sh <domain>}"
HERE="$(dirname "$0")"
install -m 644 "$HERE/nginx/security-headers.conf" /etc/nginx/snippets/attendx-security.conf
sed "s/__DOMAIN__/$DOMAIN/g" "$HERE/nginx/attendx.conf" > /etc/nginx/sites-available/attendx
ln -sf /etc/nginx/sites-available/attendx /etc/nginx/sites-enabled/attendx
if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  certbot install --nginx --cert-name "$DOMAIN" -d "$DOMAIN" --redirect --non-interactive >/dev/null
fi
if grep -q "listen 443 ssl" /etc/nginx/sites-available/attendx && ! grep -q "http2 on" /etc/nginx/sites-available/attendx; then
  sed -i '0,/listen 443 ssl/s//http2 on;\n    listen 443 ssl/' /etc/nginx/sites-available/attendx
fi
nginx -t && systemctl reload nginx && echo "nginx serving $DOMAIN"
echo "First time only, for HTTPS:  certbot --nginx -d $DOMAIN --redirect"
