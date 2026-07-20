#!/bin/bash
# ─── ADRS PLATFORM AUTOMATED HARDENED BACKUP SCRIPT ──────────────────────────
# Nightly database pg_dump + upload directories archiver + checksums + optional S3 sync
#
# Exit immediately on errors, undefined variables, or pipeline failures.
set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/var/backups/adrs}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
DATE=$(date +%F_%H-%M-%S)

# Databases to dump
DB_CONTAINERS=("adrs-db" "dpo-db" "regulator-db")
DB_NAMES=("storage_db" "dpo_db" "regulator_db")

# Source uploads directory
UPLOADS_DIR="${UPLOADS_DIR:-/app/uploads}"

# S3 Backup push variables
BACKUP_S3_BUCKET="${BACKUP_S3_BUCKET:-}"

echo "[$(date)] Starting hardened ADRS backup process..."
mkdir -p "$BACKUP_DIR"

# Helper function to generate SHA256 checksum
generate_checksum() {
  local filepath="$1"
  echo "Generating SHA-256 checksum for $filepath..."
  if command -v sha256sum &> /dev/null; then
    sha256sum "$filepath" > "${filepath}.sha256"
  elif command -v shasum &> /dev/null; then
    shasum -a 256 "$filepath" > "${filepath}.sha256"
  else
    echo "WARNING: sha256sum/shasum command not found. Skipping checksum verification file."
  fi
}

# Helper function to upload to S3 if configured
upload_to_s3() {
  local filepath="$1"
  if [ -n "$BACKUP_S3_BUCKET" ]; then
    if command -v aws &> /dev/null; then
      echo "Uploading $filepath to S3 bucket: s3://$BACKUP_S3_BUCKET..."
      aws s3 cp "$filepath" "s3://$BACKUP_S3_BUCKET/$(basename "$filepath")"
      if [ -f "${filepath}.sha256" ]; then
        aws s3 cp "${filepath}.sha256" "s3://$BACKUP_S3_BUCKET/$(basename "${filepath}.sha256")"
      fi
    else
      echo "WARNING: aws CLI tool is not installed. S3 upload skipped."
    fi
  fi
}

# 1. Backup Databases
for i in "${!DB_CONTAINERS[@]}"; do
  CONTAINER="${DB_CONTAINERS[$i]}"
  DB_NAME="${DB_NAMES[$i]}"
  OUTPUT_FILE="$BACKUP_DIR/${DB_NAME}_backup_$DATE.sql.gz"

  echo "Backing up database: $DB_NAME from container: $CONTAINER..."
  
  if docker ps --format '{{.Names}}' | grep -Eq "^${CONTAINER}$"; then
    # Run pg_dump in running container
    docker exec "$CONTAINER" pg_dump -U postgres -d "$DB_NAME" | gzip > "$OUTPUT_FILE"
    echo "Database $DB_NAME backup completed: $OUTPUT_FILE"
    generate_checksum "$OUTPUT_FILE"
    upload_to_s3 "$OUTPUT_FILE"
  else
    echo "WARNING: Container $CONTAINER is not running. Attempting direct fallback dump..."
    # If container is down but local postgres client is installed
    if command -v pg_dump &> /dev/null; then
      # Guessing default local ports based on compose:
      # storage_db is 5444, dpo_db is 5445, regulator_db is 5446
      PORT=$((5444 + i))
      PGPASSWORD=postgres pg_dump -h localhost -p "$PORT" -U postgres -d "$DB_NAME" | gzip > "$OUTPUT_FILE"
      echo "Fallback backup of database $DB_NAME completed: $OUTPUT_FILE"
      generate_checksum "$OUTPUT_FILE"
      upload_to_s3 "$OUTPUT_FILE"
    else
      echo "ERROR: Database backup failed for $DB_NAME. Container is offline and no local pg_dump."
      exit 1
    fi
  fi
done

# 2. Backup Uploads directory
UPLOADS_BACKUP="$BACKUP_DIR/uploads_backup_$DATE.tar.gz"
echo "Backing up uploads from $UPLOADS_DIR..."
if [ -d "$UPLOADS_DIR" ]; then
  tar -czf "$UPLOADS_BACKUP" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")"
  echo "Uploads backup completed: $UPLOADS_BACKUP"
  generate_checksum "$UPLOADS_BACKUP"
  upload_to_s3 "$UPLOADS_BACKUP"
else
  echo "WARNING: Uploads directory $UPLOADS_DIR not found. Skipping uploads backup."
fi

# 3. Clean up old backups (prune local backups older than RETENTION_DAYS)
echo "Pruning local backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -type f -mtime +"$RETENTION_DAYS" \( -name "*_backup_*" -o -name "*.sha256" \) -delete

echo "[$(date)] ADRS Hardened Backup process finished successfully."
