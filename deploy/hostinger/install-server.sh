#!/usr/bin/env bash
# First-time host setup for AttendX, as root. Safe to re-run.
# Touches ONLY AttendX's own user and folders; fAImily and the Work Portal
# (their users, stacks, nginx sites, PM2 processes and ports) are left alone.
set -euo pipefail
id attendx >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash attendx
mkdir -p /opt/attendx/app /opt/attendx/backups
chown attendx:attendx /opt/attendx /opt/attendx/app
chmod 700 /opt/attendx/backups
# PM2 for the attendx user, restarted on boot.
sudo -u attendx -H pm2 ping >/dev/null
env PATH="$PATH" pm2 startup systemd -u attendx --hp /home/attendx >/dev/null
echo "attendx user and /opt/attendx ready."
