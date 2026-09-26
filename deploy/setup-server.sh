#!/usr/bin/env bash
# =====================================================================
# PollTech Radar - Linux Host Provisioning Script
# Target OS: Ubuntu 22.04 LTS / 24.04 LTS
# Usage: sudo ./setup-server.sh
# =====================================================================

set -euo pipefail

echo "=========================================================="
echo " 1. Updating System Packages"
echo "=========================================================="
apt-get update && apt-get upgrade -y
apt-get install -y curl git ufw nginx build-essential postgresql postgresql-contrib

echo "=========================================================="
echo " 2. Installing Node.js 22 LTS"
echo "=========================================================="
if ! command -v node >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
else
    echo "Node.js is already installed: $(node -v)"
fi

echo "=========================================================="
echo " 3. Creating Dedicated System User & Directories"
echo "=========================================================="
if ! id "radar" >/dev/null 2>&1; then
    useradd -r -s /bin/false -d /opt/polltech-radar radar
    echo "Created service user: radar"
fi

mkdir -p /opt/polltech-radar
mkdir -p /etc/radar
mkdir -p /var/backups/radar

chown -R radar:radar /opt/polltech-radar
chown -R radar:radar /var/backups/radar
chmod 750 /var/backups/radar

echo "=========================================================="
echo " 4. Configuring Firewall (UFW)"
echo "=========================================================="
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
# Ports 3000 (Node.js) and 5432 (Postgres) stay bound locally to 127.0.0.1
ufw --force enable

echo "=========================================================="
echo " Host Setup Completed Successfully!"
echo " Next Steps:"
echo " 1. Run: sudo ./setup-db.sh"
echo " 2. Configure /etc/radar/radar.env"
echo " 3. Deploy code to /opt/polltech-radar and run deploy-update.sh"
echo "=========================================================="
