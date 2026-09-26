#!/usr/bin/env bash
# =====================================================================
# PollTech Radar - Database Backup Script
# Automatically creates compressed pg_dump and cleans up backups older than 14 days
# Add to crontab: 0 2 * * * /opt/polltech-radar/deploy/backup-db.sh
# =====================================================================

set -euo pipefail

BACKUP_DIR="/var/backups/radar"
DB_NAME="radar_prod"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.dump"

mkdir -p "$BACKUP_DIR"

echo "Creating compressed backup: $BACKUP_FILE"
sudo -u postgres pg_dump -Fc "$DB_NAME" > "$BACKUP_FILE"

# Set permissions
chmod 600 "$BACKUP_FILE"
chown radar:radar "$BACKUP_FILE"

echo "Backup completed successfully ($(du -h "$BACKUP_FILE" | cut -f1))"

# Purge backups older than 14 days
echo "Purging backups older than 14 days..."
find "$BACKUP_DIR" -type f -name "${DB_NAME}_*.dump" -mtime +14 -exec rm -f {} +
echo "Backup retention check finished."
