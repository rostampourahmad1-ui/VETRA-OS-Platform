# Backup & Recovery Strategy - VETRA OS Platform

## 📋 Overview

This document defines the backup and recovery strategy for VETRA OS data, ensuring business continuity and data integrity for PostgreSQL-backed construction project data.

---

## 🗄️ Database Backup

### 1. Automated Daily Backups

```bash
#!/bin/bash
# scripts/backup-database.sh

set -euo pipefail

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/backups/postgres"
DB_NAME="${POSTGRES_DB:-vetra_dev}"
DB_USER="${POSTGRES_ADMIN_USER:-vetra_admin}"
DB_HOST="${POSTGRES_HOST:-localhost}"

# Create custom format backup (compressed, verifyable)
pg_dump -Fc \
  -h "$DB_HOST" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  -f "$BACKUP_DIR/vetra_${DATE}.dump"

# Compress (pg_dump -Fc is already compressed, but add another layer)
gzip "$BACKUP_DIR/vetra_${DATE}.dump"

# Upload to object storage (AWS S3 / MinIO / Cloud)
# Update PATH to include aws-cli if needed
aws s3 cp "$BACKUP_DIR/vetra_${DATE}.dump.gz" \
  "s3://${S3_BUCKET:-vetra-backups}/database/" \
  --cache-control max-age=31536000

# Cleanup old backups (keep last 30 days)
find "$BACKUP_DIR" -name "*.gz" -mtime +30 -delete

# Log the backup
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup completed: vetra_${DATE}.dump.gz" >> "$BACKUP_DIR/backup.log"

# Rotate log (keep last 90 days)
find "$BACKUP_DIR/backup.log" -type f -mtime +90 -delete
```

**Cron job** (run daily at 2 AM):
```bash
0 2 * * * /opt/scripts/backup-database.sh >> /var/log/vetra/backup.log 2>&1
```

### 2. Backup Retention Policy

| Duration | Backup Type | Storage |
|---|---|---|
| **Last 7 days** | Full daily dump | Local disk `/opt/backups/postgres/` |
| **Last 30 days** | Full daily dump | S3/MinIO cloud storage |
| **Last 90 days** | Monthly incremental | S3/MinIO (archived) |
| **Beyond 90 days** | Tape/Long-term archival | On-premises or cold storage |

### 3. Point-in-Time Recovery (PITR)

- Enable PostgreSQL WAL logging: `wal_level = minimal` (or `replica` for PITR)
- Configure `archive_command` to copy WAL files to backup storage
- Take base backup + WAL logs for point-in-time recovery
- Recovery: `pg_restore` with `--target-time` or `psql` with recovery target

---

## 📂 File Storage Backup

### 1. Uploaded Files (Project Documents, Images, etc.)

| Concern | Strategy |
|---|---|
| **Storage location** | `artifacts/api-server/fileStorage*` or configured object storage |
| **Backup strategy** | Sync to object storage (S3/MinIO) with versioning |
| **Retention** | Same as database backup policy (30 days active, 90 days archival) |
| **Security** | S3 bucket policy: only API server can upload, limited download TTL |

### 2. MinIO Configuration (Self-Hosted Option)

```bash
# Start MinIO
docker run -d \
  --name minio \
  -p 9000:9000 \
  -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  -v minio_data:/data \
  minio/minio server /data --console-address ":9001"

# Configure bucket for VETRA uploads
mc mb minio/vetra-uploads
mc ilm configure minio/vetra-uploads \
  rule=vetra-retention \
  action=delete \
  days=90
```

---

## ⚠️ Restore Procedure

### 1. Database Restore

```bash
# Download latest backup
aws s3 cp s3://vetra-backups/database/vetra_20260912_020000.dump.gz ./

# Decompress
gunzip vetra_20260912_020000.dump.gz

# Restore to PostgreSQL
pg_restore -Fc \
  -h db.prod.internal \
  -U vetra_owner \
  -d vetra_prod \
  --no-owner \
  --no-acl \
  vetra_20260912_020000.dump

# Or restore from local backup
psql -U vetra_admin -d vetra_dev < "$BACKUP_DIR/vetra_20260912_020000.dump"
```

### 2. File Restore

```bash
# Download from S3/MinIO
aws s3 cp s3://vetra-backups/uploads/vetra_drawing_20260911.pdf ./
# or from MinIO console

# Place in appropriate directory
cp vetra_drawing_20260911.pdf /opt/vetra/uploads/
```

### 3. Full System Restore

```bash
# 1. Restore database
./scripts/backup-database.sh  # (restore mode)
# OR manually:
gunzip latest_dump.gz
pg_restore -Fc -h db.host -U owner -d vetra_prod latest_dump

# 2. Restart API server (will pick up restored data on next request)
pm2 restart vetra-api

# 3. Verify data integrity
curl http://localhost:5000/health
# Check: projects count, daily reports, etc.

# 4. Run smoke tests
pnpm exec vitest run --reporter=verbose
```

---

## 🎯 Recovery Time Objective (RTO) & Recovery Point Objective (RPO)

| Metric | Target | Current Status |
|---|---|---|
| **RTO** (Time to restore) | < 4 hours | Manual process, ~30 min with automation |
| **RPO** (Max data loss) | < 24 hours | Daily backups meet this target |
| **Backup frequency** | Daily (2 AM) | Cron job configured |
| **Backup type** | PostgreSQL custom dump + gzip | pg_dump -Fc |
| **Storage** | Local disk + S3/MinIO | Both configured |
| **Verification** | Weekly restore test | Not yet automated |

---

## 🔒 Backup Security

| Control | Implementation |
|---|---|
| **Encryption at rest** | S3 SSE-KMS or MinIO server-side encryption |
| **Encryption in transit** | TLS/SSL for all backup transfers (aws s3 cp --secure) |
| **Backup isolation** | Separate IAM role for backup operations, no write access to production |
| **Integrity verification** | `pg_dump` verify: `pg_restore --list` after each backup |
| **Access logging** | CloudTrail/Audit log for all backup operations |
| **Separation of duties** | Backup operator !== Deployment operator |
| **Key rotation** | KMS key rotation every 90 days |

---

## 🚨 Emergency Procedures

### 1. Critical Data Loss

```bash
# 1. Assess scope of data loss
# 2. Contact platform lead and DevOps
# 3. Check available backups
ls -la /opt/backups/postgres/*.gz

# 4. Restore from latest valid backup
./scripts/backup-database.sh --restore --date $(date -d '7 days ago' +%Y%m%d)

# 5. Verify data integrity
pnpm exec vitest run tests/security/rls-integration.test.ts

# 6. Notify stakeholders
# - Platform Lead
# - Security Officer
# - Product Owner
```

### 2. Corrupt Database

```bash
# 1. Identify corrupted tables/tablespaces
pg_checkcat --all-databases

# 2. Restore from backup (point-in-time if WAL available)
pg_restore --target-time "2026-09-12 00:00:00" ...

# 3. Re-apply migrations if needed
pnpm db:migrate

# 4. Run full test suite
pnpm test
```

---

## 📜 Audit & Compliance

All backup operations must be logged and auditable:

```bash
# Log backup start/end
echo "Backup started: $(date)" >> /var/log/vetra/backup.log
echo "Backup completed: $(date)" >> /var/log/vetra/backup.log

# Log restore operations
echo "Restore started: $(date)" >> /var/log/vetra/restore.log
echo "Restore completed: $(date)" >> /var/log/vetra/restore.log

# Required audit fields in backup logs:
# - Timestamp
# - Backup type (full/incremental)
# - Database name
# - Backup size
# - Storage location
# - Operator name
# - Success/failure status
```

---

## ✅ Pre-Release Backup Checklist

Before any release or production deployment:

- [ ] Daily backup job is active and has produced at least one successful backup
- [ ] Backup retention policy is configured (30 days minimum)
- [ ] Restore test completed within last 30 days
- [ ] Backup encryption is enabled (at rest and in transit)
- [ ] S3/MinIO bucket has versioning enabled
- [ ] Backup IAM role has least-privilege permissions
- [ ] Backup logs are retained for 90 days
- [ ] RTO and RPO targets are documented and tested
- [ ] Emergency contact list is current
- [ ] All `.env` files in repo have placeholder values only (no real secrets)