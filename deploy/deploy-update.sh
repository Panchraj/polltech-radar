#!/usr/bin/env bash
# =====================================================================
# PollTech Radar - Build & Deploy / Update Script
# Run this inside /opt/polltech-radar as root (or sudo)
# Usage: sudo ./deploy/deploy-update.sh
# =====================================================================

set -euo pipefail

APP_DIR="/opt/polltech-radar"
ENV_FILE="/etc/radar/radar.env"

if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: Missing environment configuration file at $ENV_FILE"
    echo "Please copy deploy/radar.env.template to $ENV_FILE and configure your database and keys."
    exit 1
fi

echo "=========================================================="
echo " 1. Securing Environment File Permissions"
echo "=========================================================="
chown root:radar "$ENV_FILE"
chmod 0640 "$ENV_FILE"

cd "$APP_DIR"

echo "=========================================================="
echo " 2. Installing Production Dependencies"
echo "=========================================================="
npm ci --omit=dev --ignore-scripts=false || npm install --omit=dev

echo "=========================================================="
echo " 3. Running Database Schema Migrations"
echo "=========================================================="
# Source DATABASE_URL from radar.env for drizzle-kit
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

npx drizzle-kit push

echo "=========================================================="
echo " 4. Building Next.js Production Bundle"
echo "=========================================================="
npm run build

echo "=========================================================="
echo " 5. Updating Permissions"
echo "=========================================================="
chown -R radar:radar "$APP_DIR"

echo "=========================================================="
echo " 6. Installing / Updating Systemd Service"
echo "=========================================================="
cp "$APP_DIR/deploy/radar.service" /etc/systemd/system/radar.service
systemctl daemon-reload
systemctl enable radar
systemctl restart radar

echo "=========================================================="
echo " 7. Verifying Deployment"
echo "=========================================================="
sleep 3
systemctl is-active --quiet radar && echo "Radar service is ACTIVE and running!" || {
    echo "WARNING: Radar service failed to start. Showing last 30 log lines:"
    journalctl -u radar -n 30 --no-pager
    exit 1
}

echo "Testing Health Check locally..."
curl -s http://127.0.0.1:3000/api/integration/v1/health | grep -q "healthy" && echo "Health Check: OK" || echo "Warning: Health check did not return healthy"

echo "=========================================================="
echo " Deployment Complete!"
echo "=========================================================="
