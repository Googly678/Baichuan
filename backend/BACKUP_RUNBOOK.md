# PostgreSQL Backup Runbook

This runbook is for production-style backup, restore and recovery drill.

## Defaults

- Host: localhost
- Port: 5432
- User: root
- Password: password
- Database: rider_claims
- Retention: 14 days
- Backup dir: ./backups

## Commands

Run under backend directory.

### 1) Manual backup

npm run db:backup

Output example:

BACKUP_OK: ./backups/rider_claims_20260409_190000.dump

### 2) Restore from backup

npm run db:restore -- -BackupFile "./backups/rider_claims_20260409_190000.dump"

Output example:

RESTORE_OK: ./backups/rider_claims_20260409_190000.dump -> rider_claims

### 3) Recovery drill (recommended weekly)

npm run db:drill

This does:
1. create a fresh backup
2. create an isolated drill database
3. restore backup into drill database
4. verify app_kv_store row count
5. drop drill database

Output example:

DRILL_OK: backup=..., drill_db=..., app_kv_store_count=...

### 4) Register daily backup schedule (Windows Task Scheduler)

npm run db:backup:register

Optional custom time:

powershell -ExecutionPolicy Bypass -File ./scripts/register-daily-backup-task.ps1 -StartTime "01:30"

## Retention policy

Old dump files older than RetentionDays are automatically deleted.

## Security notes

1. Change default DB password for production.
2. Store secrets via secure env/secret manager.
3. Restrict backup directory permissions.
4. Periodically test restore and keep logs.
