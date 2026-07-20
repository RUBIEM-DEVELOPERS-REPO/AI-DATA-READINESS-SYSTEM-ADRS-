# Disaster Recovery Runbook
**Last Updated: 2026-07-17**

---

## 1. Objectives & Metrics

- **Recovery Point Objective (RPO)**: **24 Hours** (maximum data loss duration, backed by nightly backups).
- **Recovery Time Objective (RTO)**: **2 Hours** (target time to restore services after declaring a disaster).

---

## 2. Backup Strategy & Scheduling

Automated backups run nightly. The backup process extracts:
1. **storage_db** (Main platform DB: batches, evidence logs, extraction runs, CDM entities).
2. **dpo_db** (DPO portal: compliance records, ROPA registry, whistleblower cases).
3. **regulator_db** (Regulator portal: regulatory approvals, audit reports).
4. **uploads/** (Object store / Local filesystem uploads directory containing files).

### Backup Cron Schedule
Backups are triggered nightly at `02:00 UTC` by a system cron or GitHub Action.
```cron
0 2 * * * /app/scripts/backup.sh >> /var/log/adrs-backup.log 2>&1
```

### Retention Policy
- Local backups are retained in the `/var/backups/adrs` directory for **7 days**.
- If S3 synchronization is configured, S3 copies are retained for **30 days** using S3 Lifecycle policies.

---

## 3. Configuration & Parameters

The backup and restore scripts respect the following environment variables:

| Variable | Description | Default |
|---|---|---|
| `BACKUP_DIR` | Local folder where backup archives are written | `/var/backups/adrs` |
| `UPLOADS_DIR` | Main source uploads storage directory | `/app/uploads` |
| `RETENTION_DAYS` | Local backup retention period | `7` |
| `BACKUP_S3_BUCKET` | Optional S3 bucket name for off-site backup vaulting | *(Empty, disabled)* |

---

## 4. Disaster Recovery Restoration Guide

Follow these steps to restore the platform from an archived backup.

### Step 1: Locate the Backup Archives
Go to the backup directory:
```bash
cd /var/backups/adrs
ls -la
```
Each backup run creates:
- `storage_db_backup_<date>.sql.gz` & `.sha256`
- `dpo_db_backup_<date>.sql.gz` & `.sha256`
- `regulator_db_backup_<date>.sql.gz` & `.sha256`
- `uploads_backup_<date>.tar.gz` & `.sha256`

If backups are stored in S3, download the selected files first:
```bash
aws s3 cp s3://my-backup-bucket/storage_db_backup_2026-07-17_02-00-00.sql.gz .
aws s3 cp s3://my-backup-bucket/storage_db_backup_2026-07-17_02-00-00.sql.gz.sha256 .
# repeat for dpo_db, regulator_db, and uploads_backup
```

### Step 2: Run Verification (Dry-Run)
Before applying any changes, run the restore utility in simulation mode to verify backup integrity and validate checksums:
```bash
# Verify using the date suffix
./scripts/restore.sh --date 2026-07-17_02-00-00 --dry-run

# Or verify the latest backup
./scripts/restore.sh --latest --dry-run
```
If checksums fail, **do not proceed**; the archive may be corrupt. Re-fetch from S3 or use a previous day's backup.

### Step 3: Execute Restoration
Shut down the app service container (to stop incoming requests) but keep database services running:
```bash
docker compose stop app
```
Run the restore script:
```bash
# Restore via date suffix
./scripts/restore.sh --date 2026-07-17_02-00-00

# Or restore latest
./scripts/restore.sh --latest
```

### Step 4: Restart Services
Start the app service container again:
```bash
docker compose start app
```

---

## 5. Verification Checks

After restoring, verify the system is healthy:
1. **Health Checks**: Access `http://localhost:5000/healthz` and ensure all subsystems are `ok`.
2. **Access Portals**: Open the application in a browser. Ensure you can log in.
3. **Database Check**: Visit the Datasets and Audit log pages. Verify history exists.
4. **File Availability**: Preview an uploaded document in the evidence repository. Verify that the file can be read and served from the object store backend.

---

## 6. Escalation Contacts & Failover

In the event of verification failure or database lockouts:
- **Database Administrator**: dba@example.com (Fallback phone: +27 11 555 0199)
- **Infrastructure Team**: DevOps Slack Channel (`#devops-ops`)
- **Cloud Provider Status Page**: AWS Dashboard / Cloudflare System Status
