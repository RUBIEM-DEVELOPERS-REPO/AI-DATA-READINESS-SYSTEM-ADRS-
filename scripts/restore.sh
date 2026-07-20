#!/bin/bash
# ─── ADRS PLATFORM AUTOMATED DATABASE & UPLOADS RESTORE SCRIPT ───────────────
# Restore utility supporting database sql.gz dumps and uploads directory tar.gz
#
# Exit immediately on errors, undefined variables, or pipeline failures.
set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/var/backups/adrs}"
UPLOADS_DIR="${UPLOADS_DIR:-/app/uploads}"
DRY_RUN=false
LATEST=false
BACKUP_DATE=""

# Databases
DB_CONTAINERS=("adrs-db" "dpo-db" "regulator-db")
DB_NAMES=("storage_db" "dpo_db" "regulator_db")

usage() {
  echo "Usage: $0 [options]"
  echo "Options:"
  echo "  -d, --date DATE      Specify the date suffix to restore (e.g. 2026-07-17_02-00-00)"
  echo "  -l, --latest         Restore from the latest available backups in the backup directory"
  echo "  --dry-run            Simulate verification steps without writing/restoring data"
  echo "  -h, --help           Show this help message"
  exit 1
}

# Parse command line args
while [[ $# -gt 0 ]]; do
  case "$1" in
    -d|--date)
      BACKUP_DATE="$2"
      shift 2
      ;;
    -l|--latest)
      LATEST=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "Unknown option: $1"
      usage
      ;;
  esac
done

if [ "$LATEST" = false ] && [ -z "$BACKUP_DATE" ]; then
  echo "ERROR: Either --date or --latest must be specified."
  usage
fi

if [ "$LATEST" = true ]; then
  # Find latest backup date by looking at storage_db files
  latest_file=$(find "$BACKUP_DIR" -type f -name "storage_db_backup_*.sql.gz" | sort | tail -n 1)
  if [ -z "$latest_file" ]; then
    echo "ERROR: No backup files found in $BACKUP_DIR."
    exit 1
  fi
  # Extract date suffix (everything after "storage_db_backup_")
  filename=$(basename "$latest_file")
  BACKUP_DATE="${filename#storage_db_backup_}"
  BACKUP_DATE="${BACKUP_DATE%.sql.gz}"
  echo "Detected latest backup date suffix: $BACKUP_DATE"
fi

echo "[$(date)] Starting ADRS restore process for date suffix: $BACKUP_DATE..."
if [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN] Simulating restore process. No changes will be applied."
fi

verify_checksum() {
  local filepath="$1"
  if [ -f "${filepath}.sha256" ]; then
    echo "Verifying checksum for $filepath..."
    if command -v sha256sum &> /dev/null; then
      sha256sum -c "${filepath}.sha256"
    elif command -v shasum &> /dev/null; then
      shasum -a 256 -c "${filepath}.sha256"
    else
      echo "WARNING: Checksum file found but sha256sum/shasum command not available. Skipping verification."
    fi
  else
    echo "WARNING: No checksum file found for $filepath at ${filepath}.sha256"
  fi
}

# 1. Restore Databases
for i in "${!DB_CONTAINERS[@]}"; do
  CONTAINER="${DB_CONTAINERS[$i]}"
  DB_NAME="${DB_NAMES[$i]}"
  DUMP_FILE="$BACKUP_DIR/${DB_NAME}_backup_$BACKUP_DATE.sql.gz"

  if [ ! -f "$DUMP_FILE" ]; then
    echo "ERROR: Backup file not found: $DUMP_FILE"
    exit 1
  fi

  # Check checksum
  verify_checksum "$DUMP_FILE"

  if [ "$DRY_RUN" = false ]; then
    echo "Restoring database $DB_NAME to container $CONTAINER..."
    if docker ps --format '{{.Names}}' | grep -Eq "^${CONTAINER}$"; then
      # Drop existing connections and database structure
      echo "Dropping and recreating database $DB_NAME..."
      docker exec "$CONTAINER" psql -U postgres -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}';"
      docker exec "$CONTAINER" psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME};"
      docker exec "$CONTAINER" psql -U postgres -d postgres -c "CREATE DATABASE ${DB_NAME};"
      
      # Restore dump
      gunzip -c "$DUMP_FILE" | docker exec -i "$CONTAINER" psql -U postgres -d "$DB_NAME"
      echo "Database $DB_NAME restore completed."
    else
      echo "WARNING: Container $CONTAINER is not running. Falling back to local psql..."
      if command -v psql &> /dev/null; then
        PORT=$((5444 + i))
        PGPASSWORD=postgres psql -h localhost -p "$PORT" -U postgres -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}';"
        PGPASSWORD=postgres psql -h localhost -p "$PORT" -U postgres -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME};"
        PGPASSWORD=postgres psql -h localhost -p "$PORT" -U postgres -d postgres -c "CREATE DATABASE ${DB_NAME};"
        
        gunzip -c "$DUMP_FILE" | PGPASSWORD=postgres psql -h localhost -p "$PORT" -U postgres -d "$DB_NAME"
        echo "Fallback restore of database $DB_NAME completed."
      else
        echo "ERROR: Database restore failed for $DB_NAME. Container is offline and no local psql."
        exit 1
      fi
    fi
  else
    echo "[DRY RUN] Would restore database $DB_NAME from $DUMP_FILE"
  fi
done

# 2. Restore Uploads directory
UPLOADS_BACKUP="$BACKUP_DIR/uploads_backup_$BACKUP_DATE.tar.gz"
if [ -f "$UPLOADS_BACKUP" ]; then
  verify_checksum "$UPLOADS_BACKUP"
  
  if [ "$DRY_RUN" = false ]; then
    echo "Restoring uploads directory to $UPLOADS_DIR..."
    mkdir -p "$UPLOADS_DIR"
    tar -xzf "$UPLOADS_BACKUP" -C "$(dirname "$UPLOADS_DIR")"
    echo "Uploads directory restore completed."
  else
    echo "[DRY RUN] Would restore uploads directory from $UPLOADS_BACKUP"
  fi
else
  echo "WARNING: Uploads backup file $UPLOADS_BACKUP not found. Skipping uploads restore."
fi

echo "[$(date)] ADRS Restore process finished successfully."
