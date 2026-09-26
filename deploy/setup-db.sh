#!/usr/bin/env bash
# =====================================================================
# PollTech Radar - PostgreSQL Database Provisioning Script
# Usage: sudo ./setup-db.sh [DB_PASSWORD]
# =====================================================================

set -euo pipefail

DB_NAME="radar_prod"
DB_USER="radar_user"
DB_PASS="${1:-}"

if [ -z "$DB_PASS" ]; then
    # Generate random 32 character password if none provided
    DB_PASS=$(openssl rand -hex 16)
    echo "Generated PostgreSQL password for '$DB_USER': $DB_PASS"
    echo "SAVE THIS PASSWORD for your /etc/radar/radar.env file!"
fi

echo "=========================================================="
echo " Provisioning PostgreSQL database: $DB_NAME"
echo "=========================================================="

sudo -u postgres psql -v ON_ERROR_STOP=1 <<-EOSQL
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$DB_USER') THEN
            CREATE ROLE $DB_USER WITH LOGIN ENCRYPTED PASSWORD '$DB_PASS';
        ELSE
            ALTER ROLE $DB_USER WITH ENCRYPTED PASSWORD '$DB_PASS';
        END IF;
    END
    \$\$;

    SELECT 'CREATE DATABASE $DB_NAME OWNER $DB_USER'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')\gexec

    GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
EOSQL

# Grant permissions inside radar_prod public schema
sudo -u postgres psql -d "$DB_NAME" -v ON_ERROR_STOP=1 <<-EOSQL
    GRANT ALL ON SCHEMA public TO $DB_USER;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER;
EOSQL

echo "=========================================================="
echo " Database '$DB_NAME' configured successfully!"
echo " Connection string:"
echo " postgresql://$DB_USER:$DB_PASS@127.0.0.1:5432/$DB_NAME"
echo "=========================================================="
