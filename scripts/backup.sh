#!/bin/bash
# MongoDB Backup Script for NexusMart
# Run daily via cron: 0 2 * * * /path/to/scripts/backup.sh
#
# Usage:
#   ./scripts/backup.sh                    # Uses default MONGO_URI
#   MONGO_URI="mongodb://nexus_backup:<mật_khẩu>@127.0.0.1:27017/?authSource=admin" ./scripts/backup.sh
#
# MONGO_URI: chuỗi kết nối KHÔNG kèm tên DB, dùng user nexus_backup (chỉ có quyền sao lưu).
# Sao lưu CẢ HAI database: dữ liệu chính và sổ cái (nexusmart_ledger). Thiếu sổ cái là mất sổ kế toán.

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/nexusmart}"
DATE=$(date +%Y-%m-%d_%H-%M-%S)
DB_NAME="${DB_NAME:-nexusmart}"
MONGO_URI="${MONGO_URI:-mongodb://127.0.0.1:27017/?authSource=admin}"
LEDGER_DB_NAME="${LEDGER_DB_NAME:-nexusmart_ledger}"
RETAIN_DAYS="${RETAIN_DAYS:-30}"

echo "[backup] Starting MongoDB backup: $DB_NAME"
mkdir -p "$BACKUP_DIR"

# Create backup
mongodump --uri="$MONGO_URI" --db="$DB_NAME" --out="$BACKUP_DIR/$DATE"
mongodump --uri="$MONGO_URI" --db="$LEDGER_DB_NAME" --out="$BACKUP_DIR/$DATE"

# Compress
cd "$BACKUP_DIR" && tar -czf "$DATE.tar.gz" "$DATE" && rm -rf "$DATE"

# Retain last N daily backups
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +"$RETAIN_DAYS" -delete

echo "[backup] Complete: $BACKUP_DIR/$DATE.tar.gz"
echo "[backup] Retained backups (last $RETAIN_DAYS days):"
ls -lh "$BACKUP_DIR"/*.tar.gz 2>/dev/null | tail -5
