# PollTech Radar - Linux Server Deployment Guide

This directory contains automated scripts and templates to deploy PollTech Radar to an **Ubuntu 22.04 LTS or 24.04 LTS** server running native **PostgreSQL 16+**, **Node.js 22 LTS**, and **Nginx**.

---

## Architecture Overview

```
                           HTTPS (443)
 Internet / PollTech Core -------------> [ Nginx Reverse Proxy ]
                                                    |
                                                    | HTTP (127.0.0.1:3000)
                                                    v
                                         [ systemd: radar.service ]
                                         (Node.js Next.js 16 app)
                                                    |
                                                    | TCP (127.0.0.1:5432)
                                                    v
                                         [ PostgreSQL: radar_prod ]
```

---

## 3-Step Quick Deployment Walkthrough

### Step 1: Prepare the Host (Run Once)
Clone or copy this repository to `/opt/polltech-radar` and run the host provisioner:
```bash
sudo mkdir -p /opt/polltech-radar
sudo git clone -b feature/polltech-integration-api <YOUR_REPO_URL> /opt/polltech-radar
cd /opt/polltech-radar

# Make scripts executable
sudo chmod +x deploy/*.sh

# Run system provisioning (installs Node 22, Postgres 16, Nginx, UFW, radar user)
sudo ./deploy/setup-server.sh
```

---

### Step 2: Configure PostgreSQL & Environment Variables
```bash
# Provision database 'radar_prod' and user 'radar_user'
# (Generates a secure password and prints it to the console)
sudo ./deploy/setup-db.sh

# Copy environment template to /etc/radar/radar.env
sudo cp deploy/radar.env.template /etc/radar/radar.env
sudo nano /etc/radar/radar.env
```
Inside `/etc/radar/radar.env`, update:
1. `DATABASE_URL`: Fill in the password output by `setup-db.sh`.
2. `SESSION_SECRET`: Fill in a random 32-byte hex string (generate with `openssl rand -hex 32`).
3. `INTEGRATION_KEY`: Set your PollTech integration token (e.g., `rad_sec_...`).

---

### Step 3: Build & Start the Service
```bash
sudo ./deploy/deploy-update.sh
```
This script automatically:
- Installs dependencies
- Pushes database migrations (`drizzle-kit push`)
- Compiles the Next.js production build (`npm run build`)
- Installs and starts the `radar.service` systemd unit
- Verifies local health check at `http://127.0.0.1:3000/api/integration/v1/health`

---

## Nginx & SSL Setup

1. Copy the Nginx configuration:
```bash
sudo cp deploy/nginx-radar.conf /etc/nginx/sites-available/radar
sudo ln -s /etc/nginx/sites-available/radar /etc/nginx/sites-enabled/
```
2. Edit `/etc/nginx/sites-available/radar` to set your server's domain or IP:
```bash
sudo nano /etc/nginx/sites-available/radar
```
3. Issue an SSL certificate using Let's Encrypt (Certbot):
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d radar.yourdomain.com
```
4. Reload Nginx:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## Ongoing Operations & Updates

### Updating to New Code Versions
Whenever you push updates or new releases:
```bash
cd /opt/polltech-radar
sudo git pull origin feature/polltech-integration-api
sudo ./deploy/deploy-update.sh
```

### Viewing Logs
```bash
# Follow live logs
sudo journalctl -u radar -f

# View last 100 log lines
sudo journalctl -u radar -n 100 --no-pager
```

### Automated Nightly Backups
To enable automated backups every night at 2:00 AM:
```bash
sudo crontab -e
```
Add the line:
```cron
0 2 * * * /opt/polltech-radar/deploy/backup-db.sh > /dev/null 2>&1
```
Backups are saved to `/var/backups/radar/` with a 14-day retention cycle.
