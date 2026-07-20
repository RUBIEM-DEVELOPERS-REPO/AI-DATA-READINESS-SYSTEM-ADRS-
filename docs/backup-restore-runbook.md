# ADRS Platform Backup and Disaster Recovery (DR) Runbook

This document describes the procedures for backup, replication, and disaster recovery of the African Data Readiness System (ADRS) platform data.

---

## 1. Storage Components

The ADRS platform persists two types of state:
1. **Relational Databases (PostgreSQL)**:
   - **ADRS Main Database (`storage_db`)**: Documents, extraction runs, CDM entities, and audit logs.
   - **DPO Portal Database (`dpo_db`)**: Compliance audits, processing records, DSR requests, and DSR complaints.
   - **Regulator Portal Database (`regulator_db`)**: Regulator logs, federated sessions, and supervisory feeds.
2. **File Store (Uploads)**:
   - File uploads containing raw evidence files (PDFs, images, CSVs, audio/video), stored locally under `/app/uploads` (mapped to Docker volume `uploads_data`).

---

## 2. Automated Backups Configuration

The automated backup script is located at `/app/scripts/backup.sh`. It performs the following:
- Locks and exports each Postgres database to compressed SQL archives (`pg_dump`).
- Bundles the uploads directory into a compressed tarball.
- Retention: Retains local backups for 7 days (pruning older files automatically).
- Off-site Sync: Supports optional upload to S3-compatible cloud storage if configured.

### Backup Schedule (Cron Job)
Add a cron job on the production host running nightly at 02:00:
```bash
0 2 * * * /bin/bash /app/scripts/backup.sh >> /var/log/adrs-backup.log 2>&1
```

---

## 3. Database Backup Procedure (Manual)

To manually backup the databases from the running Docker containers:

```bash
# 1. Main database backup
docker exec -t adrs-db pg_dump -U postgres -d storage_db | gzip > storage_db_backup_$(date +%F).sql.gz

# 2. DPO database backup
docker exec -t dpo-db pg_dump -U postgres -d dpo_db | gzip > dpo_db_backup_$(date +%F).sql.gz

# 3. Regulator database backup
docker exec -t regulator-db pg_dump -U postgres -d regulator_db | gzip > regulator_db_backup_$(date +%F).sql.gz
```

---

## 4. File Store Backup Procedure (Manual)

To archive the uploaded evidence files from the host machine:

```bash
# Archive the docker volume path or absolute uploads directory
tar -czf uploads_backup_$(date +%F).tar.gz /var/lib/docker/volumes/uploads_data/_data
```

---

## 5. Recovery Procedures (DR Restore)

### Restoring Databases from Backups
To restore databases into clean PostgreSQL instances:

```bash
# 1. Main Database restore
gunzip -c storage_db_backup_YYYY-MM-DD.sql.gz | docker exec -i adrs-db psql -U postgres -d storage_db

# 2. DPO Database restore
gunzip -c dpo_db_backup_YYYY-MM-DD.sql.gz | docker exec -i dpo-db psql -U postgres -d dpo_db

# 3. Regulator Database restore
gunzip -c regulator_db_backup_YYYY-MM-DD.sql.gz | docker exec -i regulator-db psql -U postgres -d regulator_db
```

### Restoring File Store Backups
To restore the uploaded files:

```bash
# Extract files back to the uploads volume
tar -xzf uploads_backup_YYYY-MM-DD.tar.gz -C /var/lib/docker/volumes/uploads_data/_data --strip-components=5
```

---

## 6. Point-in-Time Recovery (PITR) Guidance

For high-availability production environments, enable Write-Ahead Log (WAL) archiving in Postgres config:
```ini
wal_level = replica
archive_mode = on
archive_command = 'test ! -f /mnt/server/archivedir/%f && cp %p /mnt/server/archivedir/%f'
```
Combine WAL archiving with full weekly base backups (`pg_basebackup`) to restore Postgres to any millisecond within the retention period.
