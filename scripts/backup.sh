#!/usr/bin/env bash
set -euo pipefail

# Project Huginn Backup Script
# Backs up database and map-storage volume to a zip archive

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.yml"
ENV_FILE="$PROJECT_DIR/.env"

# Default backup location (relative to project dir)
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
# Keep last N backups
KEEP_LAST="${KEEP_LAST:-8}"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="project-huginn_${TIMESTAMP}"
WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

mkdir -p "$BACKUP_DIR"

# Load DB credentials from .env
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi

DB_NAME="${POSTGRES_DB:-wurm_map_util}"
DB_USER="${POSTGRES_USER:-wurm}"
DB_PASSWORD="${POSTGRES_PASSWORD:-}"

if [[ -z "$DB_PASSWORD" ]]; then
  echo "ERROR: POSTGRES_PASSWORD not set. Check .env file." >&2
  exit 1
fi

echo "Starting backup: $BACKUP_NAME"
echo "Backup directory: $BACKUP_DIR"

# 1. Dump database
DB_DUMP_FILE="$WORK_DIR/db_dump.sql"
echo "Dumping database $DB_NAME ..."

docker compose -f "$COMPOSE_FILE" exec -T db \
  pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges > "$DB_DUMP_FILE"

echo "Database dump complete: $(du -h "$DB_DUMP_FILE" | cut -f1)"

# 2. Copy map-storage volume data
MAP_STORAGE_DIR="$WORK_DIR/map-storage"
mkdir -p "$MAP_STORAGE_DIR"
echo "Copying map-storage from app container ..."

docker compose -f "$COMPOSE_FILE" cp app:/app/map-storage/. "$MAP_STORAGE_DIR/"

echo "Map-storage copy complete: $(du -sh "$MAP_STORAGE_DIR" | cut -f1)"

# 3. Add metadata
METADATA_FILE="$WORK_DIR/backup_metadata.txt"
cat > "$METADATA_FILE" <<EOF
Project Huginn Backup
=====================
Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)
Host: $(hostname)
Database: $DB_NAME
User: $DB_USER
Project Dir: $PROJECT_DIR
EOF

# 4. Create tar.gz archive
ARCHIVE_FILE="$BACKUP_DIR/${BACKUP_NAME}.tar.gz"
echo "Creating tar.gz archive ..."
tar --exclude='*.DS_Store' --exclude='*/Thumbs.db' -czf "$ARCHIVE_FILE" -C "$WORK_DIR" .

echo "Backup complete: $ARCHIVE_FILE"
ls -lh "$ARCHIVE_FILE"

# 5. Clean up old backups
if [[ "$KEEP_LAST" -gt 0 ]]; then
  echo "Cleaning up old backups (keeping last $KEEP_LAST) ..."
  ls -t "$BACKUP_DIR"/project-huginn_*.tar.gz 2>/dev/null | tail -n +$((KEEP_LAST + 1)) | while read -r old_file; do
    echo "Removing: $old_file"
    rm -f "$old_file"
  done
fi

echo "Done."
